# INTELECTUAL IA

Sistema pessoal de IA com chat, multi-agente, memória, notas, biblioteca, geração de imagens, camada de raciocínio e ditado por voz. Frontend estático + um backend serverless para o modelo de texto.

> **Importante:** este repositório é a separação fiel do app que hoje roda como arquivo único. O chat funciona em **modo demonstração** até você ligar o backend (passo no fim deste README). Tudo o mais — memória, agentes, notas, biblioteca, imagens (Pollinations, reais), raciocínio, microfone — já funciona quando hospedado em HTTPS.

## Estrutura

```
intelectual-ia/
├── index.html          # Marcação da interface (referencia style.css e app.js)
├── style.css           # Todo o CSS (tema escuro âmbar, layout, responsivo)
├── app.js              # Toda a lógica do app (~700 linhas, módulos IIFE)
├── api/
│   └── chat.js         # Backend serverless (Vercel): proxy para o OpenRouter
├── vercel.json         # Configuração de deploy (timeout da função)
├── .env.example        # Modelo das variáveis de ambiente (sem segredos)
├── .gitignore          # Ignora .env, node_modules, etc.
└── README.md           # Este arquivo
```

Não há pasta de imagens nem bibliotecas externas: o app é single-page sem dependências de CDN, e as imagens são geradas em tempo de execução pela API do Pollinations (via URL), não armazenadas no repositório.

## Função de cada arquivo

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura visual: barra superior, navegação, telas (Chat, Notas, Biblioteca, Imagens, Backup, Memória, Config), modais e composer com microfone. |
| `style.css` | Tema escuro (paleta âmbar), tipografia, cartões de resposta da IA, callouts (`:::analise`, `:::next`…), responsividade mobile. |
| `app.js` | Núcleo: armazenamento (IndexedDB/localStorage), histórico e memória por agente, multi-agente, notas, biblioteca, geração/análise de imagens, camada de raciocínio (`Reason`), renderizador de markdown, microfone (Web Speech) e rascunho persistente. |
| `api/chat.js` | Função serverless que recebe `{messages}`, chama o OpenRouter com sua chave (guardada no servidor) e devolve a resposta. Faz roteamento, fallback e tratamento de erro. |

## Requisitos

- Conta no [Vercel](https://vercel.com) (grátis) e no [GitHub](https://github.com).
- Uma chave do [OpenRouter](https://openrouter.ai/keys).

## Como subir no GitHub

```bash
cd intelectual-ia
git init
git add .
git commit -m "INTELECTUAL IA — estrutura inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/intelectual-ia.git
git push -u origin main
```

## Deploy (Vercel)

1. No Vercel: **Add New → Project** e importe o repositório do GitHub.
2. Framework Preset: **Other** (é site estático). Não precisa de build command.
3. Em **Settings → Environment Variables**, adicione:
   - `OPENROUTER_API_KEY` = sua chave do OpenRouter
4. **Deploy.** A Vercel publica o site e expõe `api/chat.js` automaticamente em `/api/chat`.

Por que Vercel: a função em `api/chat.js` já está no formato `(req, res)` da Vercel e mapeia direto para `/api/chat`, sem redirects. (Para Netlify, seria preciso a versão `(event)` — comentada no fim de `api/chat.js` — e um `netlify.toml` com redirect.)

## Passo final: ligar o chat real

O chat usa hoje uma função `getAIReply` de demonstração (mostra o raciocínio preparado, sem chamar o modelo). Para respostas reais, localize `getAIReply` em `app.js` e troque o bloco de demonstração por uma chamada ao backend:

```js
async function getAIReply(text){
  const conv = History.get(cur);
  // a camada de raciocínio (sys) e o histórico já estão montados acima nesta função:
  const messages = [
    { role: 'system', content: sys },
    ...conv.messages.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }))
  ];
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  });
  const data = await r.json();
  if (data.error) return '⚠️ ' + data.error;
  return data.reply || data.choices?.[0]?.message?.content || '(sem resposta)';
}
```

> Mantenha o cálculo de `sys`, `corrections`, `retr` etc. que já existe no início de `getAIReply` — só substitua a parte que monta a saída de demonstração. Assim memória, agentes, projetos e o raciocínio continuam alimentando o modelo.

## Notas

- Persistência (localStorage/IndexedDB), microfone e geração de imagens exigem **HTTPS** — funcionam no domínio da Vercel, não em `file://`.
- A geração de imagens (Pollinations) e o microfone (Web Speech) rodam no navegador, sem chave. Só o **texto** depende do backend.
