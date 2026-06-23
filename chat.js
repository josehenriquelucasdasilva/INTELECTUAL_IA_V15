// ============================================================================
// INTELECTUAL IA — Orquestrador (backend único)
// ----------------------------------------------------------------------------
// Roda SÓ no servidor (função serverless). A chave de API vive só aqui.
//   Vercel  -> salve como /api/chat.js   (exporta default handler(req,res))
//   Netlify -> salve como /netlify/functions/chat.js (exporta handler(event))
// O wrapper no fim do arquivo cobre os dois. NUNCA importe isso no browser.
//
// Estratégia: usar o OpenRouter como camada de orquestração (1 chave, 300+
// modelos, roteamento automático, fallback e consenso já prontos). O código
// abaixo é fino de propósito — você NÃO precisa manter um classificador.
// ============================================================================

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 30000; // corta a chamada se travar (resolve o "fica parado")

// ---- Tabela de rotas. Edite à vontade. ------------------------------------
// IMPORTANTE: slugs de modelo mudam todo mês. Confira os atuais em
// https://openrouter.ai/models antes de fixar. (confiança nos slugs abaixo: média)
const ROUTES = {
  // Padrão: o próprio OpenRouter escolhe o melhor modelo pra cada prompt.
  // cost_quality_tradeoff: 0 = sempre o mais forte | 10 = sempre o mais barato | 7 = default.
  auto: { model: "openrouter/auto", extra: { cost_quality_tradeoff: 7 } },

  // Lane rápida/barata para perguntas simples ("olá", "o que é X").
  // Dica de custo: aqui é onde o Groq-direto (free tier, ultrarrápido) compensa.
  fast: { model: "meta-llama/llama-3.3-70b-instruct", fallback: ["openrouter/auto"] },

  // Programação: deixe o auto decidir, ou troque pelo Pareto router de código.
  code: { model: "openrouter/auto", extra: { cost_quality_tradeoff: 3 } },
};

// Consenso (CARO): só quando o custo de errar > custo de 2-3 chamadas.
// Não use como padrão. É opt-in (toggle "modo pesquisa/profundo" na UI).
const CONSENSUS_PANEL = ["openai/gpt-5.2", "meta-llama/llama-3.3-70b-instruct"];
const JUDGE_MODEL = "openrouter/auto";

// ---- Helper de chamada com timeout + taxonomia de erro ---------------------
async function callModel({ apiKey, model, messages, fallback, extra }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "INTELECTUAL IA",
      },
      body: JSON.stringify({
        model,
        messages,
        ...(fallback ? { models: [model, ...fallback] } : {}), // fallback nativo OpenRouter
        ...(extra || {}),
      }),
    });

    const latencyMs = Date.now() - t0;
    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw httpError(res.status, data);

    return {
      reply: data.choices?.[0]?.message?.content ?? "",
      meta: {
        model: data.model || model,       // qual modelo realmente respondeu
        latencyMs,
        tokensIn: data.usage?.prompt_tokens ?? null,
        tokensOut: data.usage?.completion_tokens ?? null,
      },
    };
  } catch (err) {
    if (err.name === "AbortError")
      throw { code: "TIMEOUT", message: "Tempo esgotado ao contatar o modelo." };
    if (err.userMessage) throw err; // já é um erro tratado
    throw { code: "NETWORK", message: "Falha de rede ao contatar o provedor." };
  } finally {
    clearTimeout(timer);
  }
}

// Mapeia status HTTP -> mensagem clara (exatamente os casos que você pediu).
function httpError(status, data) {
  const map = {
    401: "Erro na API: chave inválida.",
    402: "Sem saldo/crédito na conta do provedor.",
    404: "Modelo indisponível ou rota não encontrada.",
    429: "Limite de requisições atingido. Tente em alguns segundos.",
  };
  const message =
    map[status] ||
    (status >= 500 ? "Erro no provedor (backend do modelo)." : `Erro inesperado (${status}).`);
  return { code: `HTTP_${status}`, message, userMessage: true, detail: data?.error };
}

// ---- Modo consenso (opt-in) ------------------------------------------------
async function runConsensus({ apiKey, messages }) {
  // 1) Pergunta ao painel em paralelo (Promise.allSettled = um erro não derruba tudo).
  const results = await Promise.allSettled(
    CONSENSUS_PANEL.map((model) => callModel({ apiKey, model, messages }))
  );
  const answers = results
    .filter((r) => r.status === "fulfilled")
    .map((r, i) => ({ model: CONSENSUS_PANEL[i], text: r.value.reply }));

  if (answers.length === 0) throw { code: "CONSENSUS_EMPTY", message: "Nenhum modelo respondeu." };
  if (answers.length === 1) return { reply: answers[0].text, meta: { mode: "consensus(1)" } };

  // 2) Um juiz sintetiza precisão/completude/clareza/coerência numa resposta só.
  const judgePrompt = [
    { role: "system", content: "Você sintetiza várias respostas de IA em UMA resposta final, " +
        "priorizando precisão, completude, clareza e coerência. Não cite os modelos." },
    { role: "user", content:
        `Pergunta original:\n${messages[messages.length - 1].content}\n\n` +
        answers.map((a, i) => `Resposta ${i + 1}:\n${a.text}`).join("\n\n") +
        `\n\nProduza a melhor resposta final.` },
  ];
  const judged = await callModel({ apiKey, model: JUDGE_MODEL, messages: judgePrompt });
  return { reply: judged.reply, meta: { mode: "consensus", panel: CONSENSUS_PANEL, ...judged.meta } };
}

// ---- Núcleo: recebe a requisição do frontend e orquestra -------------------
async function orchestrate(body) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw { code: "NO_KEY", message: "Backend sem OPENROUTER_API_KEY configurada." };

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0)
    throw { code: "BAD_INPUT", message: "Campo 'messages' ausente ou vazio." };

  const mode = body?.mode || "auto"; // auto | fast | code | consensus

  let out;
  if (mode === "consensus") {
    out = await runConsensus({ apiKey, messages });
  } else {
    const route = ROUTES[mode] || ROUTES.auto;
    out = await callModel({ apiKey, messages, ...route });
  }

  // LOG técnico (fica só no servidor / painel admin — nunca vai pro usuário comum).
  console.log(JSON.stringify({ ts: Date.now(), mode, ...out.meta }));

  // Pro usuário: só a resposta. _meta vai junto mas a UI só mostra no painel admin.
  return { reply: out.reply, _meta: out.meta };
}

// ---- Wrappers de host ------------------------------------------------------
// Vercel:
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  try {
    const data = await orchestrate(req.body);
    res.status(200).json(data);
  } catch (e) {
    res.status(200).json({ error: e.message || "Erro desconhecido.", code: e.code }); // 200 c/ erro tratado p/ a UI exibir
  }
}

// Netlify (descomente se usar Netlify Functions):
// export async function handler(event) {
//   if (event.httpMethod !== "POST") return { statusCode: 405, body: "Use POST." };
//   try {
//     const data = await orchestrate(JSON.parse(event.body || "{}"));
//     return { statusCode: 200, body: JSON.stringify(data) };
//   } catch (e) {
//     return { statusCode: 200, body: JSON.stringify({ error: e.message, code: e.code }) };
//   }
// }
