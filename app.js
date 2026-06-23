const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function toast(msg,type='info'){const t=document.createElement('div');t.className='toast '+type;t.textContent=msg;$('#toasts').appendChild(t);setTimeout(()=>t.remove(),2600);}

/* ===== IDB (Blob + enumeração) ===== */
const IDB=(()=>{const NAME='intelectual_db',ST='kv';let _db=null,_mem=null;
  function open(){return new Promise(r=>{if(_db)return r(_db);if(_mem)return r(null);let q;try{q=indexedDB.open(NAME,1)}catch(_){_mem=new Map();return r(null)}q.onupgradeneeded=()=>q.result.createObjectStore(ST);q.onsuccess=()=>{_db=q.result;r(_db)};q.onerror=()=>{_mem=new Map();r(null)}})}
  function tx(m,fn){return open().then(db=>{if(!db)return fn(null);return new Promise((res,rej)=>fn(db.transaction(ST,m).objectStore(ST),res,rej))})}
  return{get persistent(){return !_mem},
    get:k=>tx('readonly',(s,res)=>{if(!s)return res(_mem.has(k)?_mem.get(k):null);const r=s.get(k);r.onsuccess=()=>res(r.result??null);r.onerror=()=>res(null)}),
    set:(k,v)=>tx('readwrite',(s,res)=>{if(!s){_mem.set(k,v);return res(1)}const r=s.put(v,k);r.onsuccess=()=>res(1);r.onerror=()=>res(0)}),
    del:k=>tx('readwrite',(s,res)=>{if(!s){_mem.delete(k);return res(1)}const r=s.delete(k);r.onsuccess=()=>res(1);r.onerror=()=>res(0)}),
    keys:()=>tx('readonly',(s,res)=>{if(!s)return res([..._mem.keys()]);const r=s.getAllKeys();r.onsuccess=()=>res(r.result);r.onerror=()=>res([])}),
    entries:()=>tx('readonly',(s,res)=>{if(!s)return res([..._mem.entries()].map(([key,value])=>({key,value})));const k=s.getAllKeys(),v=s.getAll();let ks,vs;k.onsuccess=()=>{ks=k.result;if(vs)d()};v.onsuccess=()=>{vs=v.result;if(ks)d()};function d(){res(ks.map((key,i)=>({key,value:vs[i]})))}k.onerror=()=>res([])}),
  };
})();
const LS={persistent:(()=>{try{localStorage.setItem('__p','1');localStorage.removeItem('__p');return true}catch(_){return false}})(),_m:{},
  get(k){try{return this.persistent?localStorage.getItem(k):(k in this._m?this._m[k]:null)}catch(_){return this._m[k]??null}},
  set(k,v){try{this.persistent?localStorage.setItem(k,v):this._m[k]=v}catch(_){this._m[k]=v}},
  del(k){try{this.persistent?localStorage.removeItem(k):delete this._m[k]}catch(_){delete this._m[k]}}};

/* ===== AGENTES (registro + agente ativo) ===== */
const Agents=(()=>{let _cur=null;
  const list=async()=>(await IDB.get('agents'))||[];
  async function seed(){let a=await IDB.get('agents');if(!a||!a.length){a=[{id:'a_main',name:'Principal',role:'Agente principal do INTELECTUAL IA',icon:'⭐',principal:true,consultOthers:false,createdAt:Date.now()}];await IDB.set('agents',a);await IDB.set('agent:current','a_main')}_cur=(await IDB.get('agent:current'))||a[0].id}
  const currentId=()=>_cur||'a_main';
  const current=async()=>(await list()).find(x=>x.id===currentId())||(await list())[0]||null;
  async function setCurrent(id){_cur=id;await IDB.set('agent:current',id)}
  async function create(name){const a=await list();if(a.length>=20)return null;const ag={id:'a_'+Date.now().toString(36)+Math.random().toString(36).slice(2,4),name:(name||'').trim()||('Agente '+(a.length+1)),role:'',icon:'🤖',principal:false,consultOthers:false,createdAt:Date.now()};a.push(ag);await IDB.set('agents',a);return ag}
  async function update(id,patch){const a=await list();const i=a.findIndex(x=>x.id===id);if(i<0)return null;a[i]={...a[i],...patch};await IDB.set('agents',a);return a[i]}
  async function remove(id){const a=await list();if(a.length<=1)return false;const ag=a.find(x=>x.id===id);if(ag&&ag.principal)return false;await IDB.set('agents',a.filter(x=>x.id!==id));Object.keys(localStorage).filter(k=>k.startsWith('intelectual:'+id+':')).forEach(k=>localStorage.removeItem(k));for(const k of await IDB.keys())if(k.startsWith('memory:'+id+':'))await IDB.del(k);if(currentId()===id)await setCurrent('a_main');return true}
  async function crossContext(){const cur=await current();if(!cur||!cur.principal||!cur.consultOthers)return '';const others=(await list()).filter(a=>a.id!==cur.id);const L=[];for(const ag of others){const parts=[];const mem=(await IDB.get('memory:'+ag.id+':index'))||[];const top=mem.filter(m=>m.content).sort((a,b)=>b.updatedAt-a.updatedAt)[0];if(top)parts.push('memória: '+top.content.slice(0,50));let hidx=[];try{hidx=JSON.parse(localStorage.getItem('intelectual:'+ag.id+':index')||'[]')}catch(_){}if(hidx[0])parts.push('última conversa: '+hidx[0].title);if(parts.length)L.push(`- ${ag.name}: ${parts.join('; ')}`)}return L.length?'Outros agentes (consulta ativada):\n'+L.join('\n'):''}
  return{list,seed,currentId,current,setCurrent,create,update,remove,crossContext};
})();
const AgentBar=(()=>{
  async function render(){const a=await Agents.list(),cur=Agents.currentId(),sel=$('#agentsel');if(sel)sel.innerHTML=a.map(x=>`<option value="${x.id}" ${x.id===cur?'selected':''}>${x.icon||'🤖'} ${esc(x.name)}</option>`).join('')}
  async function switchTo(id){await Agents.setCurrent(id);await render();ChatUI.reset();ChatUI.render();MemoryUI.reset();if(!$('#view-memoria').classList.contains('hide'))MemTabs.refresh();const c=await Agents.current();toast('Agente ativo: '+(c?c.name:'?'),'info')}
  return{render,switchTo};
})();

/* ===== HISTÓRICO (localStorage, por agente) ===== */
const History=(()=>{const now=()=>Date.now();
  const A=()=>Agents.currentId();
  const IDXk=()=>'intelectual:'+A()+':index',LASTk=()=>'intelectual:'+A()+':last',cv=id=>'intelectual:'+A()+':conv:'+id;
  const nid=()=>'c_'+now().toString(36)+Math.random().toString(36).slice(2,6);
  const pj=(r,f)=>{try{return r?JSON.parse(r):f}catch(_){return f}};
  const loadIndex=()=>{const a=pj(LS.get(IDXk()),[]);return Array.isArray(a)?a.sort((x,y)=>y.updatedAt-x.updatedAt):[]};
  const saveIndex=a=>LS.set(IDXk(),JSON.stringify(a));
  const get=id=>pj(LS.get(cv(id)),null);
  function up(c){const a=loadIndex().filter(x=>x.id!==c.id);a.unshift({id:c.id,title:c.title,createdAt:c.createdAt,updatedAt:c.updatedAt});saveIndex(a)}
  function create(){const t=now(),c={id:nid(),title:'Nova conversa',createdAt:t,updatedAt:t,messages:[]};LS.set(cv(c.id),JSON.stringify(c));up(c);return c}
  function append(id,role,content){const c=get(id);if(!c)return null;c.messages.push({role,content,ts:now()});c.updatedAt=now();if(c.title==='Nova conversa'&&role==='user')c.title=content.trim().replace(/\s+/g,' ').slice(0,42)||'Nova conversa';LS.set(cv(id),JSON.stringify(c));up(c);return c}
  function rename(id,t){const c=get(id);if(!c)return;c.title=(t||'').trim().slice(0,80)||c.title;c.updatedAt=now();LS.set(cv(id),JSON.stringify(c));up(c)}
  function remove(id){LS.del(cv(id));saveIndex(loadIndex().filter(x=>x.id!==id));if(LS.get(LASTk())===id)LS.del(LASTk())}
  function search(q){q=(q||'').trim().toLowerCase();if(!q)return loadIndex();return loadIndex().filter(m=>{if(m.title.toLowerCase().includes(q))return true;const c=get(m.id);return c&&c.messages.some(x=>x.content.toLowerCase().includes(q))})}
  async function searchAll(q){q=(q||'').trim().toLowerCase();const out=[];for(const ag of await Agents.list()){let idx=[];try{idx=JSON.parse(LS.get('intelectual:'+ag.id+':index')||'[]')}catch(_){}for(const m of (idx||[])){let hit=m.title.toLowerCase().includes(q);if(!hit){const c=pj(LS.get('intelectual:'+ag.id+':conv:'+m.id),null);hit=c&&c.messages.some(x=>x.content.toLowerCase().includes(q))}if(hit)out.push({...m,agentId:ag.id,agentName:ag.name})}}return out.sort((a,b)=>b.updatedAt-a.updatedAt)}
  return{create,get,append,rename,remove,loadIndex,search,searchAll,setLast:id=>LS.set(LASTk(),id),getLast:()=>LS.get(LASTk())};
})();

/* ===== NOTAS (IDB) ===== */
const Notes=(()=>{const now=()=>Date.now(),id=p=>p+'_'+now().toString(36)+Math.random().toString(36).slice(2,5);
  const index=async()=>(await IDB.get('notes:index'))||[],si=a=>IDB.set('notes:index',a);
  const projects=async()=>(await IDB.get('projects'))||[],sp=a=>IDB.set('projects',a);
  async function seed(){if(await IDB.get('projects'))return;await sp(['INTELECTUAL IA','Estudos','Engenharia','Leitura','Ideias Futuras'].map(name=>({id:id('p'),name,createdAt:now()})))}
  const get=n=>IDB.get('note:'+n);
  async function up(n){const a=(await index()).filter(x=>x.id!==n.id);a.unshift({id:n.id,title:n.title,projectId:n.projectId,tags:n.tags,favorite:n.favorite,createdAt:n.createdAt,updatedAt:n.updatedAt});a.sort((x,y)=>y.updatedAt-x.updatedAt);await si(a)}
  async function create(pid){const t=now(),n={id:id('n'),title:'Nova nota',body:'',projectId:pid||null,tags:[],favorite:false,createdAt:t,updatedAt:t};await IDB.set('note:'+n.id,n);await up(n);return n}
  async function save(n){n.updatedAt=now();await IDB.set('note:'+n.id,n);await up(n);return n}
  async function dup(nid){const o=await get(nid);if(!o)return;const t=now(),n={...o,id:id('n'),title:o.title+' (cópia)',createdAt:t,updatedAt:t};await IDB.set('note:'+n.id,n);await up(n);return n}
  async function remove(nid){await IDB.del('note:'+nid);await si((await index()).filter(x=>x.id!==nid))}
  async function search({q,projectId,favorite}){let a=await index();if(projectId)a=a.filter(n=>n.projectId===projectId);if(favorite)a=a.filter(n=>n.favorite);q=(q||'').trim().toLowerCase();if(!q)return a;if(q[0]==='#'){const tg=q.slice(1);return a.filter(n=>(n.tags||[]).some(t=>t.toLowerCase().includes(tg)))}const o=[];for(const m of a){if(m.title.toLowerCase().includes(q)||(m.tags||[]).some(t=>t.toLowerCase().includes(q))){o.push(m);continue}const f=await get(m.id);if(f&&f.body.toLowerCase().includes(q))o.push(m)}return o}
  async function backlinks(title){const t=title.trim().toLowerCase();if(!t)return[];const o=[];for(const m of await index()){const f=await get(m.id);if(f&&new RegExp('\\[\\[\\s*'+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*\\]\\]','i').test(f.body))o.push(m)}return o}
  const findByTitle=async t=>(await index()).find(n=>n.title.trim().toLowerCase()===t.trim().toLowerCase())||null;
  async function addProject(name){const a=await projects(),p={id:id('p'),name,createdAt:now()};a.push(p);await sp(a);return p}
  async function removeProject(pid){await sp((await projects()).filter(p=>p.id!==pid));for(const m of await index())if(m.projectId===pid){const f=await get(m.id);f.projectId=null;await save(f)}}
  return{seed,index,get,create,save,dup,remove,search,backlinks,findByTitle,projects,addProject,removeProject};
})();

/* ===== BIBLIOTECA (IDB) ===== */
const Lib=(()=>{const CAT={Documentos:['pdf','txt','md','csv','doc','docx','xls','xlsx','ppt','pptx','rtf'],Imagens:['png','jpg','jpeg','webp','gif','svg','bmp'],Vídeos:['mp4','webm','mov','mkv','avi'],Áudios:['mp3','wav','ogg','m4a','flac'],Backups:['json','zip']};
  const ext=n=>(n.split('.').pop()||'').toLowerCase(),cat=e=>Object.keys(CAT).find(k=>CAT[k].includes(e))||'Documentos',id=()=>'f_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const index=async()=>(await IDB.get('lib:index'))||[],si=a=>IDB.set('lib:index',a);
  async function add(file){const e=ext(file.name),t=Date.now(),fid=id();const m={id:fid,name:file.name,ext:e,mime:file.type||'',category:cat(e),size:file.size,tags:[],favorite:false,uploadedAt:t,modifiedAt:file.lastModified||t,trashed:false,hasText:false};await IDB.set('lib:file:'+fid,file);if(['txt','md','csv','json'].includes(e)){try{await IDB.set('lib:text:'+fid,await file.text());m.hasText=true}catch(_){}}const a=await index();a.unshift(m);await si(a);return m}
  const blob=f=>IDB.get('lib:file:'+f),text=f=>IDB.get('lib:text:'+f);
  async function update(f,p){const a=await index(),i=a.findIndex(x=>x.id===f);if(i<0)return;a[i]={...a[i],...p};await si(a);return a[i]}
  async function purge(f){await IDB.del('lib:file:'+f);await IDB.del('lib:text:'+f);await si((await index()).filter(x=>x.id!==f))}
  async function search({q,category,favorite,trash}){let a=await index();a=a.filter(f=>trash?f.trashed:!f.trashed);if(category&&!['__all','__fav'].includes(category))a=a.filter(f=>f.category===category);if(favorite)a=a.filter(f=>f.favorite);q=(q||'').trim().toLowerCase();if(q){if(q[0]==='#'){const tg=q.slice(1);a=a.filter(f=>f.tags.some(t=>t.toLowerCase().includes(tg)))}else{const o=[];for(const f of a){if(f.name.toLowerCase().includes(q)||f.ext.includes(q)||f.category.toLowerCase().includes(q)||f.tags.some(t=>t.toLowerCase().includes(q))){o.push(f);continue}if(f.hasText){const tx=await text(f.id);if(tx&&tx.toLowerCase().includes(q))o.push(f)}}a=o}}return a}
  async function stats(){const a=(await index()).filter(f=>!f.trashed);return{count:a.length,used:a.reduce((s,f)=>s+f.size,0),favorites:a.filter(f=>f.favorite).length,trashCount:(await index()).filter(f=>f.trashed).length}}
  return{CAT,add,blob,text,update,purge,search,stats,index,toTrash:f=>update(f,{trashed:true,deletedAt:Date.now()}),restore:f=>update(f,{trashed:false,deletedAt:null})};
})();

/* ===== BACKUP (lê os dois) ===== */
const Backup=(()=>{const HK='intelectual:';
  async function collect(p){const s={};if(p.history){const kv={};Object.keys(localStorage).filter(k=>k.startsWith(HK)).forEach(k=>kv[k]=localStorage.getItem(k));s.history={keys:kv}}if(p.notes){const kv={};(await IDB.entries()).forEach(({key,value})=>{if(key.startsWith('note:')||key==='notes:index'||key==='projects'||key.startsWith('pmem')||key.startsWith('memory:')||key==='agents'||key==='agent:current'||key==='recent:overlay')kv[key]=value});s.notes={keys:kv}}return s}
  function counts(s){const c={};if(s.history){let n=0;for(const[k,v]of Object.entries(s.history.keys)){if(/^intelectual:.*:index$/.test(k)){try{n+=JSON.parse(v).length}catch(_){}}}c.conversas=n}if(s.notes){c.notas=(s.notes.keys['notes:index']||[]).length;c.projetos=(s.notes.keys['pmem:index']||[]).length}return c}
  async function digest(str){try{if(crypto&&crypto.subtle){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));return{algo:'SHA-256',hex:[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}}}catch(_){}let h=5381;for(let i=0;i<str.length;i++)h=((h<<5)+h+str.charCodeAt(i))>>>0;return{algo:'djb2',hex:h.toString(16)}}
  async function build(p){const sections=await collect(p);const integrity=await digest(JSON.stringify(sections));return{format:'intelectual-ia-backup',version:1,app:'INTELECTUAL IA',createdAt:Date.now(),counts:counts(sections),integrity,sections}}
  async function verify(e){if(e.format!=='intelectual-ia-backup'||!e.sections)return{ok:false,reason:'Arquivo não é um backup válido.'};const r=await digest(JSON.stringify(e.sections));const ok=r.algo===e.integrity?.algo&&r.hex===e.integrity?.hex;return{ok,reason:ok?'Integridade verificada.':'Hash não confere (arquivo alterado ou contexto diferente).'}}
  async function restore(e,p){if(p.history&&e.sections.history){Object.keys(localStorage).filter(k=>k.startsWith(HK)).forEach(k=>localStorage.removeItem(k));Object.entries(e.sections.history.keys).forEach(([k,v])=>localStorage.setItem(k,v))}if(p.notes&&e.sections.notes){for(const k of await IDB.keys())if(k.startsWith('note:')||k==='notes:index'||k==='projects'||k.startsWith('pmem')||k.startsWith('memory:')||k==='agents'||k==='agent:current'||k==='recent:overlay')await IDB.del(k);for(const[k,v]of Object.entries(e.sections.notes.keys))await IDB.set(k,v)}}
  return{build,verify,restore,counts};
})();
const Snaps=(()=>{const pad=n=>String(n).padStart(2,'0');
  const list=async()=>(await IDB.get('backup:index'))||[];
  async function create(auto){const e=await Backup.build({history:true,notes:true}),size=new Blob([JSON.stringify(e)]).size,d=new Date();const name=`Backup_${d.getFullYear()}_${pad(d.getMonth()+1)}_${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}`,id='b_'+Date.now().toString(36);await IDB.set('backup:snap:'+id,e);let x=await list();x.unshift({id,name,createdAt:Date.now(),size,counts:e.counts,auto:!!auto});for(const s of x.slice(8))await IDB.del('backup:snap:'+s.id);x=x.slice(0,8);await IDB.set('backup:index',x);return x}
  return{list,create,get:id=>IDB.get('backup:snap:'+id),remove:async id=>{await IDB.del('backup:snap:'+id);await IDB.set('backup:index',(await list()).filter(x=>x.id!==id))},maybeAuto:async()=>{const x=await list();if(!x.length||Date.now()-x[0].createdAt>6*3600e3)await create(true)}};
})();

/* ===== utils ===== */
const KB=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':n<1073741824?(n/1048576).toFixed(1)+' MB':(n/1073741824).toFixed(2)+' GB';
function dl(name,data,type){const b=data instanceof Blob?data:new Blob([data],{type:type||'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name;a.click();URL.revokeObjectURL(u)}
const ICON={Documentos:'📄',Imagens:'🖼️',Vídeos:'🎬',Áudios:'🎵',Backups:'📦'};
const fmt=ts=>new Date(ts).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});

/* ===== CHAT UI ===== */
/* ===== RACIOCÍNIO — camada que PREPARA e ALIMENTA o modelo (não substitui o modelo) ===== */
/* ===== RENDERIZADOR DE RESPOSTA (markdown seguro → HTML estilizado) ===== */
function mdInline(s){return s
  .replace(/`([^`]+)`/g,'<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,'$1<em>$2</em>')
  .replace(/\b(ALERTA|ATEN[ÇC][ÃA]O|PRIORIDADE|CONCLUS[ÃA]O|DECIS[ÃA]O|IMPORTANTE)\b/g,'<span class="kw">$1</span>')}
function renderLines(lines){let html='',i=0,listType=null;
  const CALL={alert:['alert','⚠️ '],ok:['ok','✅ '],next:['next','➡️ '],info:['info','💡 '],warn:['warn','⚡ '],analise:['analysis','']};
  const closeList=()=>{if(listType){html+='</'+listType+'>';listType=null}};
  while(i<lines.length){let ln=lines[i];
    const cont=ln.match(/^:::(\w+)\s*$/);
    if(cont&&CALL[cont[1]]){closeList();const[cls]=CALL[cont[1]];i++;const inner=[];while(i<lines.length&&!/^:::\s*$/.test(lines[i])){inner.push(lines[i]);i++}i++;
      const head=cont[1]==='analise'?'<div class="ahead">⚙️ Análise da IA</div>':'';html+='<div class="callout '+cls+'">'+head+renderLines(inner)+'</div>';continue}
    if(/^```/.test(ln)){closeList();i++;const code=[];while(i<lines.length&&!/^```/.test(lines[i])){code.push(lines[i]);i++}i++;html+='<pre><code>'+code.join('\n')+'</code></pre>';continue}
    let h=ln.match(/^(#{1,3})\s+(.*)$/);if(h){closeList();html+='<div class="h h'+h[1].length+'">'+mdInline(h[2])+'</div>';i++;continue}
    let li=ln.match(/^\s*[-*]\s+(.*)$/);if(li){if(listType!=='ul'){closeList();html+='<ul>';listType='ul'}html+='<li>'+mdInline(li[1])+'</li>';i++;continue}
    let ol=ln.match(/^\s*\d+\.\s+(.*)$/);if(ol){if(listType!=='ol'){closeList();html+='<ol>';listType='ol'}html+='<li>'+mdInline(ol[1])+'</li>';i++;continue}
    let bq=ln.match(/^>\s?(.*)$/);if(bq){closeList();html+='<div class="callout info">'+mdInline(bq[1])+'</div>';i++;continue}
    if(ln.trim()===''){closeList();i++;continue}
    closeList();html+='<p>'+mdInline(ln)+'</p>';i++}
  closeList();return html}
function mdToHtml(src){const e=(''+src).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');return renderLines(e.split('\n'))}

const Reason=(()=>{
  function lev(a,b){a=a.toLowerCase();b=b.toLowerCase();const m=a.length,n=b.length;if(!m)return n;if(!n)return m;let prev=Array.from({length:n+1},(_,i)=>i),cur=new Array(n+1);for(let i=1;i<=m;i++){cur[0]=i;for(let j=1;j<=n;j++){const c=a[i-1]===b[j-1]?0:1;cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+c)}[prev,cur]=[cur,prev]}return prev[n]}
  const sim=(a,b)=>{const L=Math.max(a.length,b.length);return L?1-lev(a,b)/L:1};
  const STOP=new Set('para com que uma uns umas dos das pelo pela este esta esse essa isso aquilo como onde quando porque sobre mais menos muito pouco voce você meu minha seu sua nao não sim tem ser estar fazer'.split(' '));
  async function dictionary(){const t=new Set();
    try{for(const ag of await Agents.list())(ag.name||'').split(/\s+/).forEach(w=>w.length>3&&t.add(w))}catch(_){}
    try{for(const n of await Notes.search({})){(n.title||'').split(/\s+/).forEach(w=>w.length>3&&t.add(w));(n.tags||[]).forEach(x=>x.length>2&&t.add(x))}}catch(_){}
    try{for(const p of await Projects.list({}))(p.name||'').split(/\s+/).forEach(w=>w.length>3&&t.add(w))}catch(_){}
    try{for(const m of await Memory.list({}))(m.content||'').split(/\s+/).forEach(w=>{w=w.replace(/[^\wÀ-ÿ]/g,'');if(w.length>4)t.add(w)})}catch(_){}
    return [...t].filter(Boolean);
  }
  async function normalize(text){const dict=await dictionary();if(!dict.length)return{corrected:text,corrections:[]};
    const corrections=[];const dl=dict.map(d=>[d,d.toLowerCase()]);
    const corrected=text.split(/(\s+)/).map(tok=>{const w=tok;if(/^\s*$/.test(w)||w.length<4)return tok;const lw=w.toLowerCase().replace(/[^\wÀ-ÿ]/g,'');if(lw.length<4||STOP.has(lw))return tok;
      if(dl.some(([,l])=>l===lw))return tok;
      let best=null,bs=0;for(const [d,l] of dl){const s=sim(lw,l);if(s>bs){bs=s;best=d}}
      if(best&&bs>=0.76&&bs<1){corrections.push({from:w.trim(),to:best,score:+bs.toFixed(2)});return tok.replace(w.trim(),best)}
      return tok}).join('');
    return{corrected,corrections};
  }
  function score(q,txt){if(!txt)return 0;const t=(''+txt).toLowerCase();let s=0;for(const w of q)if(t.includes(w))s+=Math.min(3,w.length/3);return s}
  async function retrieve(query){const q=query.toLowerCase().split(/\s+/).map(w=>w.replace(/[^\wÀ-ÿ]/g,'')).filter(w=>w.length>2&&!STOP.has(w));if(!q.length)return [];const items=[];
    try{for(const m of await Memory.list({})){const s=score(q,m.content)+(m.pinned?2:0)+(m.priority==='critica'?2:m.priority==='high'?1:0);if(s>0)items.push({type:'memória',label:(m.content||'').slice(0,80),s})}}catch(_){}
    try{for(const n of await Notes.search({})){const s=score(q,(n.title||'')+' '+(n.body||'')+' '+(n.tags||[]).join(' '));if(s>0)items.push({type:'nota',label:n.title||'(sem título)',s})}}catch(_){}
    try{for(const p of await Projects.list({})){const s=score(q,(p.name||'')+' '+(p.status||''));if(s>0)items.push({type:'projeto',label:p.name,s})}}catch(_){}
    try{for(const c of History.loadIndex()){const s=score(q,c.title);if(s>0)items.push({type:'conversa',label:c.title,s})}}catch(_){}
    try{for(const f of await Lib.search({category:'__all'})){const s=score(q,f.name);if(s>0)items.push({type:'arquivo',label:f.name,s})}}catch(_){}
    items.sort((a,b)=>b.s-a.s);return items.slice(0,8);
  }
  function confidence(items,corrections){const top=items[0]?items[0].s:0;let level='baixa';if(top>=5&&items.length>=3)level='alta';else if(top>=2)level='média';if(corrections.length&&level==='alta')level='média';return{level,n:items.length,top:+top.toFixed(1)}}
  function buildSystemPrompt(ctx,retr,conf){return [
'Você é o INTELECTUAL IA. Raciocine com rigor antes de responder e siga estritamente:',
'1. ENTENDER: identifique a real intenção; se houver ambiguidade ou erro de digitação, declare a interpretação adotada.',
'2. BUSCAR CONTEXTO: use SOMENTE o contexto fornecido (memória, notas, projetos, histórico, biblioteca). Não invente nada fora dele.',
'3. ANALISAR: cruze as fontes; se houver contradição, aponte-a em vez de escolher em silêncio.',
'4. CONCLUIR: monte a conclusão a partir de evidências; prefira lógica, comparação e estrutura à superficialidade.',
'5. RESPONDER: direto e profundo; ao final, declare seu nível de confiança (alta/média/baixa).',
'ANTI-ALUCINAÇÃO: se algo não está no contexto nem é conhecimento sólido, diga que não tem base — nunca suponha nomes, projetos ou fatos.',
'AUTO-AUDITORIA antes de enviar: faz sentido? é coerente? usa o contexto certo? contradiz algo anterior? Se falhar em algum, corrija antes de responder.',
'',
`Confiança de recuperação do sistema: ${conf.level} (${conf.n} sinais casados).`,
retr.length?('Itens recuperados e ranqueados:\n'+retr.map(r=>`- [${r.type}] ${r.label}`).join('\n')):'Nenhum item específico recuperado.',
ctx?('\nCONTEXTO:\n'+ctx):'',
'',
'FORMATO DA RESPOSTA (markdown): use ## para títulos de seção, **negrito** no que é crítico, listas com - para pontos. Use blocos especiais quando fizer sentido: ":::analise" … ":::" para o que entendeu/contexto/ponto-chave; ":::next" … ":::" para a próxima ação; ":::alert" … ":::" para riscos; ":::ok" … ":::" para conclusões. Estruture em Resumo → Pontos → Explicação → Próxima ação.'
  ].filter(Boolean).join('\n')}
  const CORR=/\b(n[aã]o é isso|errado|voc[eê] errou|na verdade|quis dizer|corrigindo|n[aã]o foi isso|est[aá] errado|incorreto)\b/i;
  const detectCorrection=text=>CORR.test(text)?text.trim():null;
  return{normalize,retrieve,confidence,buildSystemPrompt,detectCorrection,dictionary};
})();

const ChatUI=(()=>{let cur=null;
  function list(){const q=$('#hsearch').value,items=History.search(q),box=$('#hlist');
    if(!items.length){box.innerHTML=`<div class="empty">${q?'Nada encontrado.':'Sem conversas. Crie um novo chat.'}</div>`;return}
    box.innerHTML=items.map(it=>`<div class="item ${cur===it.id?'on':''}" onclick="ChatUI.open('${it.id}')"><div class="t">${esc(it.title)}</div><div class="m">${fmt(it.updatedAt)}</div><div class="acts"><button onclick="event.stopPropagation();ChatUI.rename('${it.id}')">✎</button><button onclick="event.stopPropagation();ChatUI.del('${it.id}')">🗑</button></div></div>`).join('')}
  function msgs(c){const m=$('#msgs');if(!c.messages.length){m.innerHTML='<div class="empty" style="margin:auto">Conversa nova. Escreva abaixo — salva automaticamente.</div>';return}m.innerHTML=c.messages.map(x=>x.role==='user'?`<div class="msg user">${esc(x.content)}</div>`:`<div class="msg ai"><div class="who">INTELECTUAL IA</div><div class="md">${mdToHtml(x.content)}</div></div>`).join('');m.scrollTop=m.scrollHeight}
  function open(id){const c=History.get(id);if(!c)return;cur=id;History.setLast(id);msgs(c);list();$('#chatpane').classList.remove('hide-m');if(typeof Draft!=='undefined')Draft.load()}
  function newConv(){const c=History.create();cur=c.id;History.setLast(c.id);msgs(c);list();$('#chatpane').classList.remove('hide-m');if(typeof Draft!=='undefined')Draft.load();$('#cin').focus()}
  function rename(id){const c=History.get(id);const t=prompt('Novo nome:',c.title);if(t!==null){History.rename(id,t);list();toast('Conversa renomeada','ok')}}
  function del(id){if(!confirm('Excluir esta conversa?'))return;History.remove(id);if(cur===id){cur=null;const f=History.loadIndex()[0];f?open(f.id):($('#msgs').innerHTML='<div class="empty" style="margin:auto">Selecione ou crie um chat.</div>')}list();toast('Conversa excluída','ok')}
  async function send(){const inp=$('#cin'),text=inp.value.trim();if(!text)return;if(!cur)newConv();inp.value='';if(typeof Draft!=='undefined')Draft.clear();$('#sendb').disabled=true;
    History.append(cur,'user',text);msgs(History.get(cur));list();
    const m=$('#msgs');const th=document.createElement('div');th.className='msg ai';th.innerHTML='<div class="who">INTELECTUAL IA</div><span style="color:var(--muted)">pensando…</span>';m.appendChild(th);m.scrollTop=m.scrollHeight;
    try{const reply=await getAIReply(text);History.append(cur,'ai',reply);msgs(History.get(cur));list()}
    catch(e){th.remove();toast('Erro ao gerar resposta','err')}
    $('#sendb').disabled=false;inp.focus()}
  // Camada de raciocínio: prepara e alimenta o modelo. Ao conectar o backend,
  // envie messages=[{role:'system',content:sys}, ...conversa] ao /api/chat.
  async function getAIReply(text){
    // #8 aprender correções (só se já houve resposta da IA nesta conversa)
    const conv=History.get(cur),hasAI=conv&&conv.messages.some(m=>m.role==='ai');
    const corr=hasAI?Reason.detectCorrection(text):null;
    if(corr){try{const mm=await Memory.create();mm.content='Correção do usuário: '+corr.slice(0,180);mm.category='Informação importante';mm.priority='high';await Memory.save(mm)}catch(_){}}
    // #2 normalização/correção fuzzy contra os termos do próprio usuário
    const {corrected,corrections}=await Reason.normalize(text);const q=corrected;
    // contexto base
    const fmem=await Pinned.buildContext(),umem=await Memory.buildContext(),pmem=await Projects.contextFor(q),rmem=await Recent.buildContext(),omem=await Agents.crossContext();
    const ctx=[fmem,umem,pmem,rmem,omem].filter(Boolean).join('\n\n');
    // #7 recuperação cruzada ranqueada + #5 confiança
    const retr=await Reason.retrieve(q),conf=Reason.confidence(retr,corrections),sys=Reason.buildSystemPrompt(ctx,retr,conf);
    await new Promise(r=>setTimeout(r,400));
    const ctxTypes=retr.length?[...new Set(retr.map(r=>r.type))].join(', '):'nenhum específico';
    const out=[];
    let an=':::analise\n';
    an+='**O que entendi:** '+(corrections.length?`"${corrections.map(c=>c.from).join(', ')}" → "${corrections.map(c=>c.to).join(', ')}"; `:'')+`pedido "${text}".\n`;
    an+='**Contexto cruzado:** '+ctxTypes+'.\n';
    an+='**Confiança de recuperação:** '+conf.level+' ('+conf.n+' sinais).';
    if(retr[0])an+='\n**Ponto-chave:** '+retr[0].label+'.';
    an+='\n:::';
    out.push(an);
    if(retr.length)out.push('## Contexto recuperado\n'+retr.map(r=>`- **[${r.type}]** ${r.label}`).join('\n'));
    if(corr)out.push(':::ok\nRegistrei sua **correção** na memória (prioridade alta) para não repetir o erro.\n:::');
    out.push('## Resposta\n*(demo)* Este é o raciocínio preparado, já no novo design. Ao conectar o **/api/chat**, a resposta real do modelo aparece aqui com este mesmo layout — títulos, **destaques** e blocos.');
    out.push(':::next\n**Próxima ação:** conectar o backend para respostas reais.\n:::');
    out.push('## System prompt enviado ao modelo\n```\n'+sys+'\n```');
    return out.join('\n\n');
  }
  function reset(){cur=null;$('#msgs').innerHTML='<div class="empty" style="margin:auto">Crie um novo chat ou selecione um do histórico.</div>';if(typeof Draft!=='undefined')Draft.load()}
  function render(){cur=null;list();const last=History.getLast();if(last&&History.get(last))open(last);else{const f=History.loadIndex()[0];f?open(f.id):reset()}}
  return{list,open,newConv,rename,del,send,render,reset,curId:()=>cur,setInput:t=>{$('#cin').value=t}};
})();

/* ===== RASCUNHO (Fase 3 — persistência da caixa de mensagem) ===== */
const Draft=(()=>{let t=null;
  const key=()=>'draft:'+Agents.currentId()+':'+((typeof ChatUI!=='undefined'&&ChatUI.curId&&ChatUI.curId())||'none');
  function save(){try{const v=$('#cin').value;v?localStorage.setItem(key(),v):localStorage.removeItem(key())}catch(_){}}
  function saveDebounced(){clearTimeout(t);t=setTimeout(save,400)}
  function load(){try{$('#cin').value=localStorage.getItem(key())||''}catch(_){$('#cin').value=''}}
  function clear(){try{localStorage.removeItem(key())}catch(_){}}
  return{save,saveDebounced,load,clear};
})();

/* ===== MIC (Web Speech — Fases 1 a 5) ===== */
const Mic=(()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  let rec=null,wantOn=false,restarts=0,sessionText='',chain=Promise.resolve();
  const btn=()=>$('#micbtn'),sEl=()=>$('#micstatus');
  function setStatus(html){const s=sEl();if(!s)return;if(html){s.innerHTML=html;s.classList.remove('hide')}else{s.classList.add('hide');s.innerHTML=''}}
  // Fase 2: só o texto FINAL entra na caixa (no cursor), preservando o que você digita.
  async function insertFinal(text){let t=text;try{const n=await Reason.normalize(text);if(n&&n.corrected)t=n.corrected}catch(_){}
    const ta=$('#cin');if(!ta||!t)return;const s=ta.selectionStart??ta.value.length,e=ta.selectionEnd??ta.value.length;
    const before=ta.value.slice(0,s),after=ta.value.slice(e),sep=before&&!/\s$/.test(before)?' ':'';
    ta.value=before+sep+t+after;const pos=(before+sep+t).length;try{ta.selectionStart=ta.selectionEnd=pos}catch(_){}
    ta.dispatchEvent(new Event('input'));sessionText+=(sessionText?' ':'')+t}
  function onResult(e){restarts=0;let finals='',interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){const r=e.results[i];(r.isFinal?finals+=r[0].transcript:interim+=r[0].transcript)}
    if(interim.trim())setStatus('✍️ <b>Transcrevendo:</b> <span class="dim">'+esc(interim.trim())+'</span>');
    else if(wantOn)setStatus('🎤 <b>Ouvindo…</b> fale à vontade');
    const f=finals.trim();if(f)chain=chain.then(()=>insertFinal(f))}
  function onError(ev){const err=ev.error;
    if(err==='not-allowed'||err==='service-not-allowed'){wantOn=false;btn().classList.remove('on');setStatus('');toast('Permissão de microfone negada. Habilite nas configurações do navegador.','err');return}
    if(err==='no-speech'||err==='aborted')return; // benignos: onend cuida
    if(err==='network'){toast('Falha de rede no reconhecimento; tentando reconectar…','err');return}
    toast('Erro no microfone: '+err,'err')}
  function onEnd(){btn().classList.remove('on');
    if(wantOn){ // Fase 4: reconexão automática sem perder texto (o texto já está na caixa)
      if(restarts++>30){wantOn=false;setStatus('');toast('Microfone parou após várias tentativas. Toque para reativar.','err');saveSession();return}
      setStatus('🔄 Reconectando…');setTimeout(()=>{if(wantOn)boot()},250);return}
    setStatus('');saveSession()}
  function boot(){try{rec=new SR();rec.lang='pt-BR';rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;
      rec.onstart=()=>{btn().classList.add('on');setStatus('🎤 <b>Ouvindo…</b> fale à vontade')};
      rec.onresult=onResult;rec.onerror=onError;rec.onend=onEnd;rec.start()}
    catch(_){setTimeout(()=>{if(wantOn)boot()},300)}}
  function start(){if(!SR){toast('Microfone por voz não suportado neste navegador','err');return}if(wantOn)return;wantOn=true;restarts=0;sessionText='';boot()}
  function stop(){wantOn=false;try{rec&&rec.stop()}catch(_){}btn().classList.remove('on');setStatus('✍️ Transcrevendo…');setTimeout(()=>{if(!wantOn)setStatus('')},700);saveSession()}
  function toggle(){wantOn?stop():start()}
  async function saveSession(){const txt=sessionText.trim();sessionText='';if(!txt)return;try{const a=(await IDB.get('mic:history'))||[];a.unshift({id:'mic_'+Date.now().toString(36),text:txt,ts:Date.now(),agent:Agents.currentId()});await IDB.set('mic:history',a.slice(0,60))}catch(_){}}
  async function showHistory(){let a=[];try{a=(await IDB.get('mic:history'))||[]}catch(_){}
    $('#michistlist').innerHTML=a.length?a.map(h=>`<div class="card" style="margin:8px 0;padding:10px"><div style="font-size:13px;line-height:1.5">${esc(h.text)}</div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px"><span style="font-size:11px;color:var(--muted)">${fmt(h.ts)}</span><div style="display:flex;gap:5px"><button class="mini" onclick="Mic.reuse('${h.id}')">Inserir</button><button class="mini dz" onclick="Mic.delHist('${h.id}')">🗑</button></div></div></div>`).join(''):'<div class="empty">Nenhuma transcrição salva ainda.</div>';
    $('#micHistModal').classList.add('show')}
  function closeHistory(){$('#micHistModal').classList.remove('show')}
  async function reuse(id){const a=(await IDB.get('mic:history'))||[],h=a.find(x=>x.id===id);if(!h)return;const ta=$('#cin');ta.value=(ta.value?ta.value+' ':'')+h.text;ta.dispatchEvent(new Event('input'));closeHistory();ta.focus()}
  async function delHist(id){let a=(await IDB.get('mic:history'))||[];await IDB.set('mic:history',a.filter(x=>x.id!==id));showHistory()}
  return{toggle,start,stop,showHistory,closeHistory,reuse,delHist};
})();

/* ===== NOTAS UI ===== */
const NotesUI=(()=>{let cur=null,prj=null,prev=false,timer=null;
  function md(s){let h=esc(s);h=h.replace(/\[\[\s*([^\]]+?)\s*\]\]/g,(_,t)=>`<span class="wl" data-wl="${esc(t)}">${esc(t)}</span>`);h=h.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,'<a href="$2" target="_blank">$1</a>');h=h.replace(/^### (.*)$/gm,'<h3>$1</h3>').replace(/^## (.*)$/gm,'<h2>$1</h2>').replace(/^# (.*)$/gm,'<h1>$1</h1>');h=h.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/\*([^*]+)\*/g,'<i>$1</i>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/^- (.*)$/gm,'• $1');return h.replace(/\n/g,'<br>')}
  async function projectsUI(){const p=await Notes.projects();$('#nprojects').innerHTML=p.map(x=>`<div class="item ${prj===x.id?'on':''}" onclick="NotesUI.pick('${x.id}')"><div class="t">${esc(x.name)}</div><div class="acts"><button onclick="event.stopPropagation();NotesUI.delProject('${x.id}','${esc(x.name)}')">✕</button></div></div>`).join('')+`<div class="item ${prj===null?'on':''}" onclick="NotesUI.pick(null)"><div class="t" style="color:var(--muted)">Todas</div></div>`;const sel=$('#nproj');sel.innerHTML='<option value="">— sem projeto —</option>'+p.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');if(cur)sel.value=cur.projectId||''}
  async function list(){const a=await Notes.search({q:$('#nsearch').value,projectId:prj});const box=$('#nlist');if(!a.length){box.innerHTML='<div class="empty">Nenhuma nota. Clique em + Nova nota.</div>';return}const p=await Notes.projects(),nm=id=>p.find(x=>x.id===id)?.name||'';box.innerHTML=a.map(n=>`<div class="item ${cur&&cur.id===n.id?'on':''}" onclick="NotesUI.open('${n.id}')"><div class="t">${n.favorite?'★ ':''}${esc(n.title)}</div><div class="m">${fmt(n.updatedAt)}${n.projectId?' · '+esc(nm(n.projectId)):''}</div>${n.tags&&n.tags.length?`<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${n.tags.map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</div>`:''}</div>`).join('')}
  function pick(id){prj=id;projectsUI();list()}
  async function open(id){const n=await Notes.get(id);if(!n)return;cur=n;$('#ntitle').value=n.title;$('#nbody').value=n.body;$('#ntags').value=(n.tags||[]).join(', ');$('#nfav').classList.toggle('on',!!n.favorite);await projectsUI();$('#nproj').value=n.projectId||'';$('#neditor').classList.remove('hide');$('#nwelcome').classList.add('hide');$('#npane').classList.remove('hide-m');renderPrev();await back();list()}
  async function newNote(){const n=await Notes.create(prj);await open(n.id);$('#ntitle').focus();toast('Nota criada','ok')}
  function collect(){cur.title=$('#ntitle').value.trim()||'Sem título';cur.body=$('#nbody').value;cur.tags=$('#ntags').value.split(',').map(t=>t.trim()).filter(Boolean);cur.projectId=$('#nproj').value||null}
  function touch(){if(!cur)return;if(prev)renderPrev();clearTimeout(timer);timer=setTimeout(async()=>{collect();await Notes.save(cur);list();back()},500)}
  function renderPrev(){if(prev)$('#npreview').innerHTML=md($('#nbody').value)}
  function prevToggle(){prev=!prev;$('#npreview').classList.toggle('hide',!prev);renderPrev()}
  async function back(){if(!cur){$('#nback').textContent='';return}const b=await Notes.backlinks(cur.title);$('#nback').innerHTML=b.length?'↩ Ligada por: '+b.map(n=>`<a onclick="NotesUI.open('${n.id}')">${esc(n.title)}</a>`).join(''):'<span style="opacity:.6">Sem backlinks. Use [[Nome]] em outra nota.</span>'}
  async function fav(){if(!cur)return;collect();cur.favorite=!cur.favorite;$('#nfav').classList.toggle('on',cur.favorite);await Notes.save(cur);list()}
  async function dup(){if(!cur)return;collect();await Notes.save(cur);const n=await Notes.dup(cur.id);list();open(n.id);toast('Nota duplicada','ok')}
  async function del(){if(!cur)return;if(!confirm('Excluir esta nota?'))return;await Notes.remove(cur.id);cur=null;$('#neditor').classList.add('hide');$('#nwelcome').classList.remove('hide');list();toast('Nota excluída','ok')}
  function exp(f){if(!cur)return;collect();const safe=cur.title.replace(/[^\w\-À-ÿ ]/g,'').trim()||'nota';dl(safe+'.'+f,f==='md'?`# ${cur.title}\n\n${cur.body}`:cur.body,'text/plain');toast('Arquivo exportado','ok')}
  async function newProject(){const n=prompt('Nome do projeto:');if(!n)return;await Notes.addProject(n.trim());projectsUI();toast('Projeto criado','ok')}
  async function delProject(id,name){if(!confirm(`Remover o projeto "${name}"? As notas NÃO são apagadas.`))return;await Notes.removeProject(id);if(prj===id)prj=null;projectsUI();list();toast('Projeto removido','ok')}
  async function render(){await Notes.seed();await projectsUI();await list()}
  return{render,list,pick,open,newNote,touch,prev:prevToggle,fav,dup,del,exp,newProject,delProject};
})();

/* ===== BIBLIOTECA UI ===== */
const LibUI=(()=>{let view={category:'__all',favorite:false,trash:false},cur=null,urls=[];
  const free=()=>{urls.forEach(u=>URL.revokeObjectURL(u));urls=[]},ou=b=>{const u=URL.createObjectURL(b);urls.push(u);return u};
  async function cats(){const st=await Lib.stats(),counts={};for(const f of(await Lib.index()).filter(f=>!f.trashed))counts[f.category]=(counts[f.category]||0)+1;
    const it=(k,l,n,on)=>`<div class="item ${on?'on':''}" onclick="LibUI.go('${k}')"><div class="t">${l}</div><div class="m">${n}</div></div>`;
    let h=it('__all','📁 Todos',st.count,view.category==='__all'&&!view.favorite&&!view.trash);
    for(const c of Object.keys(Lib.CAT))h+=it(c,`${ICON[c]} ${c}`,counts[c]||0,view.category===c);
    h+=it('__fav','⭐ Favoritos',st.favorites,view.favorite)+it('__trash','🗑️ Lixeira',st.trashCount,view.trash);
    $('#lcats').innerHTML=h;
    let q='';try{if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();q=`<br>${KB(e.usage||0)} de ${KB(e.quota||0)} usados`}}catch(_){}
    $('#lstats').innerHTML=`<b>${st.count}</b> arquivos · <b>${KB(st.used)}</b>${q}`}
  async function render(){await cats();free();const list=await Lib.search({q:$('#gq')&&document.activeElement===$('#gq')?'':'',category:view.trash?'__all':view.category,favorite:view.favorite,trash:view.trash});const g=$('#lgrid');
    if(!list.length){g.innerHTML=`<div class="empty" style="grid-column:1/-1">${view.trash?'Lixeira vazia.':'Nenhum arquivo. Arraste algo.'}</div>`;return}
    g.innerHTML='';for(const f of list){const c=document.createElement('div');c.className='file';c.onclick=()=>view.trash?trashAct(f):open(f.id);let th=`<div class="thumb">${ICON[f.category]||'📄'}</div>`;if(f.category==='Imagens'){const b=await Lib.blob(f.id);if(b)th=`<div class="thumb"><img src="${ou(b)}"></div>`}c.innerHTML=`${th}<div style="padding:8px"><div class="nm">${esc(f.name)}</div><div class="mt">${f.ext.toUpperCase()} · ${KB(f.size)}</div></div>${f.favorite&&!f.trashed?'<span class="star">★</span>':''}`;g.appendChild(c)}}
  function go(k){view={category:k,favorite:k==='__fav',trash:k==='__trash'};if(k==='__fav'||k==='__trash')view.category='__all';render()}
  async function files(fl){const a=[...fl];if(!a.length)return;const p=$('#lprog'),fill=$('#lfill'),pf=$('#lpf');p.style.display='block';const L=150*1048576;let done=0;
    for(let i=0;i<a.length;i++){const f=a[i];pf.textContent=`Enviando ${i+1}/${a.length}: ${f.name}`;if(f.size>L&&!confirm(`"${f.name}" tem ${KB(f.size)}. Arquivos grandes podem estourar a cota. Enviar?`))continue;try{await Lib.add(f);done++}catch(e){toast('Falha ao enviar '+f.name,'err')}fill.style.width=Math.round(((i+1)/a.length)*100)+'%'}
    setTimeout(()=>{p.style.display='none';fill.style.width='0'},500);await render();if(done)toast(done+' arquivo(s) enviado(s)','ok')}
  function pick(e){files(e.target.files);e.target.value=''}
  async function open(fid){const f=(await Lib.index()).find(x=>x.id===fid);if(!f)return;cur=f;try{Recent.logEvent('file','file:'+fid,f.name)}catch(_){}const b=await Lib.blob(fid),v=$('#vw');$('#mt').textContent=f.name;$('#mfav').classList.toggle('on',f.favorite);
    if(!b)v.innerHTML='<div style="color:var(--muted)">Arquivo não encontrado.</div>';
    else if(f.category==='Imagens')v.innerHTML=`<img src="${ou(b)}">`;
    else if(f.category==='Vídeos')v.innerHTML=`<video src="${ou(b)}" controls></video>`;
    else if(f.category==='Áudios')v.innerHTML=`<audio src="${ou(b)}" controls style="width:100%"></audio>`;
    else if(f.ext==='pdf')v.innerHTML=`<iframe src="${ou(b)}"></iframe>`;
    else if(['txt','md','csv','json'].includes(f.ext))v.innerHTML=`<pre>${esc((await b.text()).slice(0,20000))}</pre>`;
    else v.innerHTML=`<div style="color:var(--muted)">Sem prévia para .${f.ext}. Use baixar.</div>`;
    $('#vmeta').innerHTML=`<b>${esc(f.name)}</b><br>Tipo: ${f.mime||f.ext} · ${KB(f.size)} · ${f.category}<br>Enviado: ${new Date(f.uploadedAt).toLocaleString('pt-BR')}<div style="margin-top:6px">Tags: <input id="ft" value="${f.tags.join(', ')}" onchange="LibUI.tags()"></div>`;
    $('#modal').classList.add('show')}
  function close(){$('#modal').classList.remove('show');$('#vw').innerHTML='';free();cur=null}
  async function fav(){if(!cur)return;cur=await Lib.update(cur.id,{favorite:!cur.favorite});$('#mfav').classList.toggle('on',cur.favorite);render()}
  async function tags(){if(!cur)return;cur=await Lib.update(cur.id,{tags:$('#ft').value.split(',').map(s=>s.trim()).filter(Boolean)});render();toast('Tags salvas','ok')}
  async function dl_(){if(!cur)return;dl(cur.name,await Lib.blob(cur.id))}
  async function trash(){if(!cur)return;if(!confirm('Mover para a lixeira?'))return;await Lib.toTrash(cur.id);close();render();toast('Movido para a lixeira','ok')}
  async function trashAct(f){const c=prompt(`"${f.name}"\nR = restaurar · X = excluir permanente`,'R');if(!c)return;if(c.toUpperCase()==='R'){await Lib.restore(f.id);toast('Restaurado','ok')}else if(c.toUpperCase()==='X'){if(confirm('Excluir PERMANENTEMENTE?')){await Lib.purge(f.id);toast('Excluído','ok')}}render()}
  // drag&drop
  document.addEventListener('dragover',e=>{e.preventDefault();const d=$('#ldrop');if(d&&!$('#view-biblioteca').classList.contains('hide'))d.classList.add('over')});
  document.addEventListener('dragleave',e=>{const d=$('#ldrop');if(d&&e.relatedTarget===null)d.classList.remove('over')});
  document.addEventListener('drop',e=>{e.preventDefault();const d=$('#ldrop');if(d)d.classList.remove('over');if(!$('#view-biblioteca').classList.contains('hide')&&e.dataTransfer.files.length)files(e.dataTransfer.files)});
  return{render,go,pick,open,close,fav,tags,dl:dl_,trash};
})();

/* ===== BACKUP UI ===== */
const BackupUI=(()=>{let loaded=null;
  async function render(){const sec=await Backup.build({history:true,notes:true});const c=sec.counts;
    $('#view-backup').innerHTML=`
      <div class="card"><div style="font-weight:600;margin-bottom:8px">Criar backup</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:10px">Inclui: <b style="color:var(--accent)">${c.conversas||0}</b> conversas, <b style="color:var(--accent)">${c.notas||0}</b> notas, <b style="color:var(--accent)">${c.projetos||0}</b> projetos. (Arquivos da biblioteca ficam fora — seriam grandes demais.)</div>
        <button class="btn btn-pri" onclick="BackupUI.download()">⬇ Baixar backup (JSON)</button>
        <button class="btn btn-ghost" onclick="BackupUI.exp('md')">Exportar .md</button></div>
      <div class="card"><div style="font-weight:600;margin-bottom:8px">Restaurar de arquivo</div>
        <input type="file" accept=".json" id="bf" onchange="BackupUI.load(event)"><div id="brestore"></div></div>
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-weight:600">Pontos de restauração</div><button class="btn btn-ghost" onclick="BackupUI.snap()">+ Criar agora</button></div>
        <div style="font-size:12px;color:#f0c674;margin-bottom:8px">Internos (últimos 8). Não substituem o backup baixado.</div>
        <table><thead><tr><th>Nome</th><th>Conteúdo</th><th>Tam.</th><th></th></tr></thead><tbody id="bsnaps"></tbody></table></div>`;
    snaps()}
  async function download(){const e=await Backup.build({history:true,notes:true});const d=new Date(),p=n=>String(n).padStart(2,'0');dl(`INTELECTUAL_IA_${d.getFullYear()}_${p(d.getMonth()+1)}_${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}.json`,JSON.stringify(e,null,2));toast('Backup baixado','ok')}
  async function exp(f){const s=(await Backup.build({history:true,notes:true})).sections;let out='';if(s.notes)for(const[k,v]of Object.entries(s.notes.keys))if(k.startsWith('note:'))out+=`# ${v.title}\n\n${v.body}\n\n---\n\n`;dl('INTELECTUAL_IA_export.md',out||'(vazio)','text/plain');toast('Exportado','ok')}
  async function load(ev){const f=ev.target.files[0];if(!f)return;try{const e=JSON.parse(await f.text());const v=await Backup.verify(e);loaded=e;const c=e.counts||{};
    $('#brestore').innerHTML=`<div style="margin-top:12px"><span class="badge ${v.ok?'ok':'bad'}">${v.ok?'✓ '+e.integrity.algo:'⚠ integridade'}</span> <span style="color:var(--muted);font-size:12px">${new Date(e.createdAt).toLocaleString('pt-BR')}</span><div style="margin:8px 0;font-size:13px">${c.conversas||0} conversas · ${c.notas||0} notas · ${c.projetos||0} projetos</div><div style="font-size:12px;color:var(--muted);margin-bottom:8px">${v.reason}</div><button class="btn btn-pri" onclick="BackupUI.restore()">Restaurar tudo</button></div>`}
    catch(e){$('#brestore').innerHTML=`<div style="color:var(--danger);font-size:13px;margin-top:8px">Arquivo inválido: ${e.message}</div>`}}
  async function restore(){if(!loaded)return;if(!confirm('Isto SOBRESCREVE histórico, notas, memória, projetos e agentes atuais. Continuar?'))return;await Backup.restore(loaded,{history:true,notes:true});await Agents.seed();await AgentBar.render();toast('Restauração concluída','ok');ChatUI.render();NotesUI.render()}
  async function snap(){await Snaps.create(false);snaps();toast('Ponto criado','ok')}
  async function snaps(){const x=await Snaps.list(),tb=$('#bsnaps');if(!tb)return;if(!x.length){tb.innerHTML='<tr><td colspan="4" style="color:var(--muted)">Nenhum ponto.</td></tr>';return}tb.innerHTML=x.map(s=>`<tr><td style="font-family:var(--mono);font-size:12px">${s.name}<br><span style="color:var(--muted)">${s.auto?'auto':'manual'}</span></td><td style="font-size:12px">${s.counts.conversas||0}c · ${s.counts.notas||0}n</td><td style="font-family:var(--mono);font-size:12px">${KB(s.size)}</td><td><button class="mini" onclick="BackupUI.restoreSnap('${s.id}')">Restaurar</button> <button class="mini dz" onclick="BackupUI.delSnap('${s.id}')">✕</button></td></tr>`).join('')}
  async function restoreSnap(id){if(!confirm('Restaurar este ponto sobrescreve os dados atuais. Continuar?'))return;const e=await Snaps.get(id);if(!e)return;await Backup.restore(e,{history:true,notes:true});await Agents.seed();await AgentBar.render();toast('Ponto restaurado','ok');ChatUI.render();NotesUI.render()}
  async function delSnap(id){if(!confirm('Excluir este ponto?'))return;await Snaps.remove(id);snaps();toast('Ponto excluído','ok')}
  return{render,download,exp,load,restore,snap,restoreSnap,delSnap};
})();

/* ===== CONFIG ===== */
const ConfigUI=(()=>{
  async function render(){let q='';try{if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();q=`${KB(e.usage||0)} de ${KB(e.quota||0)}`}}catch(_){}
    const persistLS=LS.persistent?'sim':'não (em memória)',persistDB=IDB.persistent?'sim':'não (em memória)';
    $('#view-config').innerHTML=`
      <div class="card"><div style="font-weight:600;margin-bottom:8px">Armazenamento</div>
        <div style="font-size:13px;color:var(--muted);line-height:1.8">Histórico persistente: <b style="color:var(--text)">${persistLS}</b><br>Notas/Biblioteca persistentes: <b style="color:var(--text)">${persistDB}</b><br>Espaço: <b style="color:var(--text)">${q||'—'}</b></div>
        <div style="margin-top:10px"><button class="btn btn-ghost" onclick="ConfigUI.persist()">Solicitar persistência</button>
        <button class="btn btn-danger" onclick="ConfigUI.wipe()">Apagar TODOS os dados</button></div></div>
      <div class="card"><div style="font-weight:600;margin-bottom:6px">IA / API <span class="badge" style="background:var(--panel-2);color:var(--muted)">em desenvolvimento</span></div>
        <div style="font-size:13px;color:var(--muted);line-height:1.6">A configuração de provedores (OpenRouter/Groq) e a conexão real do chat ao <code>/api/chat</code> exigem hospedagem com backend. Por enquanto o chat usa resposta de demonstração. Não exibido como botão falso.</div></div>`}
  async function persist(){try{const ok=await navigator.storage.persist();toast(ok?'Persistência concedida':'Navegador não concedeu persistência',ok?'ok':'err')}catch(_){toast('Não suportado','err')}render()}
  async function wipe(){if(!confirm('Apagar TODO o histórico, notas, biblioteca e pontos? Não dá pra desfazer.'))return;Object.keys(localStorage).filter(k=>k.startsWith('intelectual:')).forEach(k=>localStorage.removeItem(k));for(const k of await IDB.keys())if(k.startsWith('note')||k==='projects'||k.startsWith('lib:')||k.startsWith('backup:'))await IDB.del(k);toast('Tudo apagado','ok');ChatUI.render();NotesUI.render();LibUI.render();render()}
  return{render,persist,wipe};
})();

/* ===== BUSCA GLOBAL (cruza tudo) ===== */
const Search=(()=>{let timer=null;
  function run(){clearTimeout(timer);timer=setTimeout(go,200)}
  async function go(){const q=$('#gq').value.trim();const box=$('#gresults');if(!q){box.classList.remove('show');box.innerHTML='';return}
    const ql=q.toLowerCase();let html='';
    const conv=(await History.searchAll(q)).slice(0,6);
    if(conv.length){html+='<div class="gh">Conversas (todos os agentes)</div>'+conv.map(c=>`<div class="gr" onclick="Search.openConv('${c.agentId}','${c.id}')">${esc(c.title)}<small>${esc(c.agentName||'')} · ${fmt(c.updatedAt)}</small></div>`).join('')}
    const notes=(await Notes.search({q})).slice(0,5);
    if(notes.length){html+='<div class="gh">Notas</div>'+notes.map(n=>`<div class="gr" onclick="Search.openNote('${n.id}')">${esc(n.title)}<small>${(n.tags||[]).map(t=>'#'+t).join(' ')}</small></div>`).join('')}
    const files=(await Lib.search({q,category:'__all'})).slice(0,5);
    if(files.length){html+='<div class="gh">Biblioteca</div>'+files.map(f=>`<div class="gr" onclick="Search.openFile('${f.id}')">${ICON[f.category]||'📄'} ${esc(f.name)}<small>${f.ext.toUpperCase()} · ${KB(f.size)}</small></div>`).join('')}
    box.innerHTML=html||'<div class="gr" style="cursor:default;color:var(--muted)">Nada encontrado.</div>';box.classList.add('show')}
  function hide(){setTimeout(()=>$('#gresults').classList.remove('show'),150)}
  async function openConv(agentId,id){close();if(agentId&&agentId!==Agents.currentId()){await Agents.setCurrent(agentId);await AgentBar.render()}Shell.show('chat');ChatUI.render();ChatUI.open(id)}
  function openNote(id){close();Shell.show('notas');NotesUI.open(id)}
  function openFile(id){close();Shell.show('biblioteca');LibUI.open(id)}
  function close(){$('#gresults').classList.remove('show');$('#gq').value=''}
  document.addEventListener('click',e=>{if(!e.target.closest('.gsearch'))$('#gresults').classList.remove('show')});
  return{run,openConv,openNote,openFile};
})();

/* ===== MEMÓRIA DOS USUÁRIOS ===== */
const Memory=(()=>{const now=()=>Date.now(),id=()=>'m_'+now().toString(36)+Math.random().toString(36).slice(2,5);
  const PROFILE='memory:profile';const IDXk=()=>'memory:'+Agents.currentId()+':index';
  const getProfile=async()=>(await IDB.get(PROFILE))||{name:'',nickname:'',preferred:'',language:'',responseStyle:'',communicationStyle:'',interests:[],createdAt:now(),updatedAt:now()};
  async function saveProfile(p){p.updatedAt=now();if(!p.createdAt)p.createdAt=now();await IDB.set(PROFILE,p);return p}
  const index=async()=>(await IDB.get(IDXk()))||[],si=a=>IDB.set(IDXk(),a);
  const rank={critica:0,high:1,med:2,low:3};
  const sortFn=(a,b)=>a.pinned!==b.pinned?(a.pinned?-1:1):(rank[a.priority]!==rank[b.priority]?rank[a.priority]-rank[b.priority]:b.updatedAt-a.updatedAt);
  async function list({q,priority}={}){let a=(await index()).sort(sortFn);if(priority&&priority!=='__all')a=a.filter(m=>m.priority===priority);q=(q||'').trim().toLowerCase();if(q)a=a.filter(m=>(m.content||'').toLowerCase().includes(q)||(m.category||'').toLowerCase().includes(q));return a}
  async function create(){const t=now(),m={id:id(),category:'Informação importante',content:'',priority:'med',pinned:false,createdAt:t,updatedAt:t};const a=await index();a.unshift(m);await si(a);return m}
  const get=async mid=>(await index()).find(m=>m.id===mid)||null;
  async function save(m){m.updatedAt=now();const a=await index();const i=a.findIndex(x=>x.id===m.id);if(i<0)a.unshift(m);else a[i]=m;await si(a);return m}
  async function remove(mid){await si((await index()).filter(m=>m.id!==mid))}
  async function buildContext(){const p=await getProfile(),mems=(await index()).sort(sortFn),L=[];const who=p.preferred||p.name;
    if(who)L.push(`Usuário: ${who}${p.name&&p.preferred&&p.name!==p.preferred?` (nome completo: ${p.name})`:''}.`);
    if(p.language)L.push(`Idioma principal: ${p.language}.`);
    if(p.responseStyle)L.push(`Forma de resposta preferida: ${p.responseStyle}.`);
    if(p.communicationStyle)L.push(`Estilo de comunicação: ${p.communicationStyle}.`);
    if(p.interests&&p.interests.length)L.push(`Interesses: ${p.interests.join(', ')}.`);
    const pri=mems.filter(m=>m.content&&!m.pinned&&(m.priority==='critica'||m.priority==='high')).slice(0,12);
    if(pri.length){L.push('Memórias prioritárias:');pri.forEach(m=>L.push(`- [${m.category}${m.pinned?' · fixada':''}] ${m.content}`))}
    const recent=History.loadIndex().slice(0,3).map(c=>c.title).filter(Boolean);
    if(recent.length)L.push(`Conversas recentes: ${recent.join(' · ')}.`);
    return L.join('\n')}
  return{getProfile,saveProfile,list,create,get,save,remove,buildContext,index};
})();
const MemoryUI=(()=>{let cur=null,filterP='__all',timer=null,mode='welcome';
  const PRI={critica:{c:'#e0614b',l:'Crítica'},high:{c:'#e8863a',l:'Alta'},med:{c:'#e0b341',l:'Média'},low:{c:'#5bbf8a',l:'Baixa'}};
  const CATS=['Objetivo curto prazo','Objetivo médio prazo','Objetivo longo prazo','Informação importante','Preferência','Geral'];
  async function profileCard(){const p=await Memory.getProfile(),who=p.preferred||p.name;
    $('#mprofilecard').innerHTML=`<div style="font-size:12px;color:var(--muted)">Perfil</div><div style="font-weight:600;margin:2px 0">${who?esc(who):'<span style="color:var(--muted)">Sem nome</span>'}</div>${p.interests&&p.interests.length?`<div style="font-size:12px;color:var(--muted)">${p.interests.slice(0,4).map(esc).join(' · ')}</div>`:''}<button class="mini" style="margin-top:8px" onclick="MemoryUI.editProfile()">Editar perfil</button>`}
  function filters(){$('#mfilters').innerHTML=['__all','critica','high','med','low'].map(p=>`<button class="mini" style="${filterP===p?'border-color:var(--accent);color:var(--text)':''}" onclick="MemoryUI.setFilter('${p}')">${p==='__all'?'Todas':PRI[p].l}</button>`).join('')}
  async function list(){await profileCard();filters();const a=await Memory.list({q:$('#msearch').value,priority:filterP}),box=$('#mlist');
    if(!a.length){box.innerHTML='<div class="empty">Nenhuma memória. Clique em + Nova memória.</div>';return}
    box.innerHTML=a.map(m=>`<div class="item ${cur&&cur.id===m.id?'on':''}" onclick="MemoryUI.open('${m.id}')"><div class="t"><span style="color:${PRI[m.priority].c}">●</span> ${m.pinned?'📌 ':''}${esc((m.content||'(vazia)').slice(0,60))}</div><div class="m">${esc(m.category)} · ${fmt(m.updatedAt)}</div><div class="acts"><button onclick="event.stopPropagation();MemoryUI.pin('${m.id}')">📌</button><button onclick="event.stopPropagation();MemoryUI.del('${m.id}')">🗑</button></div></div>`).join('')}
  function showPane(w){mode=w;$('#meditor').classList.toggle('hide',w!=='editor');$('#mprofileform').classList.toggle('hide',w!=='profile');$('#mwelcome').classList.toggle('hide',w!=='welcome');$('#mpane').classList.remove('hide-m')}
  async function open(id){const m=await Memory.get(id);if(!m)return;cur=m;
    $('#meditor').innerHTML=`<div class="ntop"><select id="mcat">${CATS.map(c=>`<option ${m.category===c?'selected':''}>${c}</option>`).join('')}</select><select id="mpri"><option value="critica" ${m.priority==='critica'?'selected':''}>🔴 Crítica</option><option value="high" ${m.priority==='high'?'selected':''}>🟠 Alta</option><option value="med" ${m.priority==='med'?'selected':''}>🟡 Média</option><option value="low" ${m.priority==='low'?'selected':''}>🟢 Baixa</option></select><button class="iconbtn ${m.pinned?'on':''}" id="mpinbtn" onclick="MemoryUI.pinCur()">📌</button><button class="iconbtn" onclick="MemoryUI.del('${m.id}')">🗑</button></div><div style="padding:14px;flex:1;display:flex;flex-direction:column;min-height:0"><textarea id="mcontent" style="flex:1;background:var(--ink);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:12px;font-size:14px;line-height:1.6;resize:none" placeholder="Conteúdo da memória…">${esc(m.content)}</textarea><div style="font-size:11px;color:var(--muted);margin-top:8px">Criada: ${fmt(m.createdAt)} · Atualizada: ${fmt(m.updatedAt)}</div></div>`;
    ['mcat','mpri','mcontent'].forEach(x=>$('#'+x).addEventListener('input',touch));showPane('editor');list()}
  function touch(){if(!cur)return;clearTimeout(timer);timer=setTimeout(async()=>{cur.category=$('#mcat').value;cur.priority=$('#mpri').value;cur.content=$('#mcontent').value;await Memory.save(cur);list()},500)}
  async function newMem(){const m=await Memory.create();await open(m.id);toast('Memória criada','ok')}
  async function pin(id){const m=await Memory.get(id);if(!m)return;m.pinned=!m.pinned;await Memory.save(m);if(cur&&cur.id===id)cur=m;list();toast(m.pinned?'Fixada':'Desafixada','ok')}
  async function pinCur(){if(!cur)return;await pin(cur.id);const b=$('#mpinbtn');if(b)b.classList.toggle('on',cur.pinned)}
  async function del(id){if(!confirm('Excluir esta memória?'))return;await Memory.remove(id);if(cur&&cur.id===id){cur=null;showPane('welcome')}list();toast('Memória excluída','ok')}
  function setFilter(p){filterP=p;list()}
  function field(idf,label,val,ph){return `<label style="display:block;font-size:12px;color:var(--muted);margin-bottom:10px">${label}<input id="${idf}" value="${esc(val||'')}" placeholder="${ph||''}" style="display:block;width:100%;margin-top:4px;background:var(--ink);border:1px solid var(--line);color:var(--text);border-radius:7px;padding:8px"></label>`}
  async function editProfile(){const p=await Memory.getProfile();
    $('#mprofileform').innerHTML=`<div class="ntop" style="font-weight:600">Editar perfil</div><div style="padding:14px;overflow-y:auto">${field('pname','Nome completo',p.name)}${field('ppref','Nome preferido',p.preferred)}${field('pnick','Apelido',p.nickname)}${field('plang','Idioma principal',p.language,'ex.: Português')}${field('pstyle','Forma de resposta preferida',p.responseStyle,'ex.: detalhada e profunda')}${field('pcomm','Estilo de comunicação',p.communicationStyle,'ex.: direto, sem rodeios')}${field('pint','Interesses (vírgula)',(p.interests||[]).join(', '),'ex.: IA, engenharia')}<button class="btn btn-pri" style="margin-top:6px" onclick="MemoryUI.saveProfile()">Salvar perfil</button></div>`;
    showPane('profile')}
  async function saveProfile(){const p=await Memory.getProfile();p.name=$('#pname').value.trim();p.preferred=$('#ppref').value.trim();p.nickname=$('#pnick').value.trim();p.language=$('#plang').value.trim();p.responseStyle=$('#pstyle').value.trim();p.communicationStyle=$('#pcomm').value.trim();p.interests=$('#pint').value.split(',').map(s=>s.trim()).filter(Boolean);await Memory.saveProfile(p);await profileCard();showPane('welcome');toast('Perfil salvo','ok')}
  async function render(){await list();showPane(mode)}
  function reset(){cur=null;showPane('welcome')}
  return{render,list,open,newMem,pin,pinCur,del,setFilter,editProfile,saveProfile,reset};
})();

/* ===== MEMÓRIA DOS PROJETOS ===== */
const Projects=(()=>{const now=()=>Date.now(),id=p=>p+'_'+now().toString(36)+Math.random().toString(36).slice(2,5);
  const index=async()=>(await IDB.get('pmem:index'))||[],si=a=>IDB.set('pmem:index',a);
  const rank={critica:0,high:1,med:2,low:3};
  const sortFn=(a,b)=>a.pinned!==b.pinned?(a.pinned?-1:1):((rank[a.priority]-rank[b.priority])||(b.updatedAt-a.updatedAt));
  const get=pid=>IDB.get('pmem:'+pid);
  async function up(p){const a=(await index()).filter(x=>x.id!==p.id);a.unshift({id:p.id,name:p.name,status:p.status,priority:p.priority,pinned:p.pinned,archived:p.archived,createdAt:p.createdAt,updatedAt:p.updatedAt});a.sort(sortFn);await si(a)}
  async function create(){const t=now(),p={id:id('p'),name:'Novo projeto',description:'',status:'Em desenvolvimento',priority:'med',pinned:false,archived:false,createdAt:t,updatedAt:t,log:[]};await IDB.set('pmem:'+p.id,p);await up(p);return p}
  async function save(p){p.updatedAt=now();await IDB.set('pmem:'+p.id,p);await up(p);return p}
  async function remove(pid){await IDB.del('pmem:'+pid);await si((await index()).filter(x=>x.id!==pid))}
  async function list({q,archived}={}){let a=(await index()).sort(sortFn);a=a.filter(p=>archived?p.archived:!p.archived);q=(q||'').trim().toLowerCase();if(q)a=a.filter(p=>p.name.toLowerCase().includes(q)||(p.status||'').toLowerCase().includes(q));return a}
  async function contextFor(text){const idx=await index(),t=(text||'').toLowerCase();const match=idx.find(p=>p.name&&p.name.length>2&&t.includes(p.name.toLowerCase()));if(!match)return '';const p=await get(match.id);if(!p)return '';const by=ty=>p.log.filter(e=>e.type===ty);const L=[`Projeto "${p.name}" — status: ${p.status}.`];if(p.description)L.push(`Descrição: ${p.description}`);const dec=by('decision').slice(-4);if(dec.length)L.push('Decisões: '+dec.map(e=>e.text).join('; '));const tasks=by('task').filter(e=>!e.done).slice(0,6);if(tasks.length)L.push('Tarefas abertas: '+tasks.map(e=>e.text).join('; '));const bugs=by('bug').slice(-4);if(bugs.length)L.push('Problemas conhecidos: '+bugs.map(e=>e.text).join('; '));return L.join('\n')}
  return{index,get,create,save,remove,list,contextFor};
})();
const ProjectsUI=(()=>{let cur=null,filterArch=false,timer=null;
  const PRI={critica:{c:'#e0614b'},high:{c:'#e8863a'},med:{c:'#e0b341'},low:{c:'#5bbf8a'}};
  const STA={'Em desenvolvimento':'#e0b341','Pausado':'#8b91a3','Concluído':'#5bbf8a'};
  const TYPES=[['feature','✅ Funcionalidades implementadas'],['bug','🐞 Problemas encontrados'],['solution','🔧 Soluções aplicadas'],['task','📋 Próximas tarefas'],['decision','🧭 Decisões do projeto']];
  function filters(){$('#pfilters').innerHTML=`<button class="mini" style="${!filterArch?'border-color:var(--accent);color:var(--text)':''}" onclick="ProjectsUI.setArch(false)">Ativos</button><button class="mini" style="${filterArch?'border-color:var(--accent);color:var(--text)':''}" onclick="ProjectsUI.setArch(true)">Arquivados</button>`}
  async function list(){filters();const a=await Projects.list({q:$('#psearch').value,archived:filterArch}),box=$('#plist');
    if(!a.length){box.innerHTML='<div class="empty">Nenhum projeto. Clique em + Novo projeto.</div>';return}
    box.innerHTML=a.map(p=>`<div class="item ${cur&&cur.id===p.id?'on':''}" onclick="ProjectsUI.open('${p.id}')"><div class="t"><span style="color:${PRI[p.priority].c}">●</span> ${p.pinned?'📌 ':''}${esc(p.name)}</div><div class="m"><span style="color:${STA[p.status]||'var(--muted)'}">${esc(p.status)}</span> · ${fmt(p.updatedAt)}</div><div class="acts"><button onclick="event.stopPropagation();ProjectsUI.archive('${p.id}')">📂</button><button onclick="event.stopPropagation();ProjectsUI.del('${p.id}')">🗑</button></div></div>`).join('')}
  function logItem(e){const del=`<button class="mini dz" style="border:0;padding:2px 6px" onclick="ProjectsUI.removeLog('${e.id}')">✕</button>`;
    if(e.type==='task')return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0"><input type="checkbox" ${e.done?'checked':''} onchange="ProjectsUI.toggleTask('${e.id}')"><span style="flex:1;${e.done?'text-decoration:line-through;color:var(--muted)':''}">${esc(e.text)}</span>${del}</div>`;
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:3px 0"><span>•</span><span style="flex:1">${esc(e.text)}</span>${del}</div>`}
  function section(p,type,title){const items=p.log.filter(e=>e.type===type);
    return `<div style="margin-top:14px"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:6px">${title}</div>${items.map(logItem).join('')||'<div style="font-size:12px;color:var(--muted)">—</div>'}<input class="search2" style="margin-top:6px" placeholder="Adicionar e Enter…" onkeydown="if(event.key==='Enter'){event.preventDefault();ProjectsUI.addLog('${type}',this)}"></div>`}
  async function open(id){const p=await Projects.get(id);if(!p)return;cur=p;
    $('#peditor').innerHTML=`<div class="ntop"><input class="title" id="pname" value="${esc(p.name)}" oninput="ProjectsUI.touch()"><select id="pstatus" onchange="ProjectsUI.touch()">${Object.keys(STA).map(s=>`<option ${p.status===s?'selected':''}>${s}</option>`).join('')}</select><select id="ppri" onchange="ProjectsUI.touch()"><option value="critica" ${p.priority==='critica'?'selected':''}>🔴</option><option value="high" ${p.priority==='high'?'selected':''}>🟠</option><option value="med" ${p.priority==='med'?'selected':''}>🟡</option><option value="low" ${p.priority==='low'?'selected':''}>🟢</option></select><button class="iconbtn ${p.pinned?'on':''}" id="ppinbtn" onclick="ProjectsUI.pinCur()">📌</button><button class="iconbtn" title="Arquivar" onclick="ProjectsUI.archiveCur()">📂</button><button class="iconbtn" onclick="ProjectsUI.del('${p.id}')">🗑</button></div>
      <div style="padding:14px"><textarea id="pdesc" placeholder="Descrição do projeto…" style="width:100%;background:var(--ink);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:10px;font-size:14px;min-height:60px;resize:vertical;font-family:inherit" oninput="ProjectsUI.touch()">${esc(p.description)}</textarea>
      <div style="font-size:11px;color:var(--muted);margin-top:6px">Criado: ${fmt(p.createdAt)} · Atualizado: ${fmt(p.updatedAt)}${p.archived?' · <span style="color:#f0c674">ARQUIVADO</span>':''}</div>
      ${TYPES.map(([ty,ti])=>section(p,ty,ti)).join('')}</div>`;
    $('#peditor').classList.remove('hide');$('#pwelcome').classList.add('hide');$('#ppane').classList.remove('hide-m');list()}
  function collect(){if(!cur)return;cur.name=$('#pname').value.trim()||'Sem nome';cur.description=$('#pdesc').value;cur.status=$('#pstatus').value;cur.priority=$('#ppri').value}
  function touch(){if(!cur)return;clearTimeout(timer);timer=setTimeout(async()=>{collect();await Projects.save(cur);list()},500)}
  async function newProject(){const p=await Projects.create();await open(p.id);$('#pname').focus();toast('Projeto criado','ok')}
  async function addLog(type,inp){if(!cur)return;const text=inp.value.trim();if(!text)return;collect();cur.log.push({id:'l_'+Date.now().toString(36)+Math.random().toString(36).slice(2,4),type,text,done:false,ts:Date.now()});await Projects.save(cur);await open(cur.id);toast('Registrado','ok')}
  async function toggleTask(eid){if(!cur)return;const e=cur.log.find(x=>x.id===eid);if(e){e.done=!e.done;await Projects.save(cur);open(cur.id)}}
  async function removeLog(eid){if(!cur)return;cur.log=cur.log.filter(x=>x.id!==eid);await Projects.save(cur);open(cur.id)}
  async function pinCur(){if(!cur)return;collect();cur.pinned=!cur.pinned;await Projects.save(cur);const b=$('#ppinbtn');if(b)b.classList.toggle('on',cur.pinned);list()}
  async function archiveCur(){if(!cur)return;collect();cur.archived=!cur.archived;await Projects.save(cur);toast(cur.archived?'Projeto arquivado':'Projeto restaurado','ok');cur=null;$('#peditor').classList.add('hide');$('#pwelcome').classList.remove('hide');list()}
  async function archive(id){const p=await Projects.get(id);if(!p)return;p.archived=!p.archived;await Projects.save(p);if(cur&&cur.id===id){cur=null;$('#peditor').classList.add('hide');$('#pwelcome').classList.remove('hide')}list();toast(p.archived?'Arquivado':'Restaurado','ok')}
  async function del(id){if(!confirm('Excluir este projeto e todo o seu dossiê? Não dá pra desfazer.'))return;await Projects.remove(id);if(cur&&cur.id===id){cur=null;$('#peditor').classList.add('hide');$('#pwelcome').classList.remove('hide')}list();toast('Projeto excluído','ok')}
  function setArch(v){filterArch=v;list()}
  const render=async()=>{await list()};
  return{render,list,open,newProject,touch,addLog,toggleTask,removeLog,pinCur,archiveCur,archive,del,setArch};
})();
/* ===== MEMÓRIAS RECENTES (view derivada + log fino) ===== */
const Recent=(()=>{const now=()=>Date.now();
  const events=async()=>(await IDB.get('recent:events'))||[];
  async function logEvent(type,key,label){const a=await events();a.unshift({id:'e_'+now().toString(36)+Math.random().toString(36).slice(2,4),type,key,label,ts:now()});await IDB.set('recent:events',a.slice(0,200))}
  const overlay=async()=>(await IDB.get('recent:overlay'))||{};
  async function setOverlay(key,patch){const o=await overlay();o[key]={...(o[key]||{}),...patch};await IDB.set('recent:overlay',o)}
  async function aggregate(){const o=await overlay(),vis=k=>!(o[k]&&o[k].archived),pin=k=>!!(o[k]&&o[k].pinned);
    const wrap=arr=>arr.filter(x=>vis(x.key)).sort((a,b)=>(pin(b.key)-pin(a.key))||(b.when-a.when));
    const convs=wrap(History.loadIndex().slice(0,8).map(c=>({key:'conv:'+c.id,type:'Conversa',origin:'Histórico',when:c.updatedAt,label:c.title})));
    const notes=wrap((await Notes.index()).slice(0,8).map(n=>({key:'note:'+n.id,type:'Nota',origin:'Notas',when:n.updatedAt,label:n.title})));
    const projs=wrap((await Projects.index()).slice(0,8).map(p=>({key:'proj:'+p.id,type:'Projeto',origin:'Projetos',when:p.updatedAt,label:p.name})));
    const mems=wrap((await Memory.index()).slice(0,8).map(m=>({key:'mem:'+m.id,type:'Memória',origin:'Memória',when:m.updatedAt,label:(m.content||'(vazia)').slice(0,50)})));
    const files=wrap((await events()).filter(e=>e.type==='file').slice(0,8).map(e=>({key:e.key,type:'Arquivo aberto',origin:'Biblioteca',when:e.ts,label:e.label})));
    const dec=[],tsk=[];for(const pi of await Projects.index()){const p=await Projects.get(pi.id);if(!p)continue;for(const e of p.log){if(e.type==='decision')dec.push({key:'dec:'+e.id,type:'Decisão',origin:p.name,when:e.ts,label:e.text});if(e.type==='task'&&!e.done)tsk.push({key:'tsk:'+e.id,type:'Tarefa',origin:p.name,when:e.ts,label:e.text})}}
    return{convs,activities:[...notes,...projs,...files].sort((a,b)=>b.when-a.when).slice(0,10),decisoes:wrap(dec).slice(0,8),tarefas:wrap(tsk).slice(0,8)}}
  async function summary(){const ag=await aggregate(),st=await Lib.stats(),ni=(await Notes.index()).length,proj=(await Projects.index()).find(p=>!p.archived);
    const p=[];if(proj)p.push(`Projeto ativo: ${proj.name} (${proj.status}).`);p.push(`${ni} notas, ${st.count} arquivos.`);if(ag.convs[0])p.push(`Última conversa: "${ag.convs[0].label}".`);if(ag.tarefas.length)p.push(`${ag.tarefas.length} tarefa(s) aberta(s).`);return p.join(' ')}
  async function buildContext(){const ag=await aggregate(),L=[];if(ag.convs[0])L.push(`Última conversa: "${ag.convs[0].label}".`);const proj=(await Projects.index()).find(p=>!p.archived);if(proj)L.push(`Projeto ativo: ${proj.name} (${proj.status}).`);if(ag.tarefas.length)L.push('Tarefas abertas: '+ag.tarefas.slice(0,4).map(t=>t.label).join('; ')+'.');return L.length?'Atividade recente:\n'+L.join('\n'):''}
  return{logEvent,overlay,setOverlay,aggregate,summary,buildContext};
})();
const RecentUI=(()=>{const SEC=[['convs','🕒 Conversas recentes'],['activities','📋 Atividades recentes'],['decisoes','📝 Decisões recentes'],['tarefas','⚡ Tarefas recentes']];
  async function render(){const ag=await Recent.aggregate(),sum=await Recent.summary();
    let h=`<div class="card" style="margin:12px 14px"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:6px">📖 Resumo recente</div><div style="font-size:14px;line-height:1.6">${esc(sum||'Sem atividade ainda.')}</div><div style="font-size:11px;color:var(--muted);margin-top:8px">Resumo automático (determinístico). Versão escrita por IA entra quando o /api/chat for conectado.</div></div>`;
    for(const[k,title]of SEC){const items=ag[k]||[];h+=`<div class="card" style="margin:12px 14px"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:8px">${title}</div>${items.length?items.map(row).join(''):'<div style="font-size:12px;color:var(--muted)">—</div>'}</div>`}
    $('#mtab-recent').innerHTML=h}
  function row(it){return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)"><div style="flex:1;min-width:0"><div style="font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.label||'(sem título)')}</div><div style="font-size:11px;color:var(--muted);font-family:var(--mono)">${esc(it.type)} · ${esc(it.origin||'')} · ${fmt(it.when)}</div></div><button class="mini" title="Visualizar" onclick="RecentUI.openItem('${it.key}')">🔍</button><button class="mini" title="Fixar" onclick="RecentUI.pin('${it.key}')">📌</button><button class="mini" title="Remover dos recentes (não apaga a origem)" onclick="RecentUI.archive('${it.key}')">📂</button></div>`}
  async function openItem(key){const i=key.indexOf(':'),t=key.slice(0,i),id=key.slice(i+1);
    if(t==='conv'){Shell.show('chat');ChatUI.open(id)}else if(t==='note'){Shell.show('notas');NotesUI.open(id)}else if(t==='proj'){Shell.show('memoria');MemTabs.show('projects');ProjectsUI.open(id)}else if(t==='mem'){Shell.show('memoria');MemTabs.show('users');MemoryUI.open(id)}else if(t==='file'){Shell.show('biblioteca');LibUI.open(id)}else toast('Este registro não tem visualização direta','info')}
  async function pin(key){const o=await Recent.overlay(),cur=o[key]&&o[key].pinned;await Recent.setOverlay(key,{pinned:!cur});render();toast(cur?'Desafixado':'Fixado','ok')}
  async function archive(key){await Recent.setOverlay(key,{archived:true});render();toast('Removido dos recentes (a origem foi preservada)','ok')}
  return{render,openItem,pin,archive};
})();
/* ===== MEMÓRIAS FIXADAS (camada permanente — view de agregação) ===== */
const Pinned=(()=>{
  const LBL={critica:'📌 Memórias críticas',high:'📌 Altamente importantes',med:'📌 Prioritárias',low:'📌 Gerais'};
  const ORDER=['critica','high','med','low'];
  async function aggregate(){const out={critica:[],high:[],med:[],low:[]};
    for(const m of await Memory.index())if(m.pinned)out[m.priority||'med'].push({key:'mem:'+m.id,title:(m.content||'(vazia)').slice(0,60),category:m.category,priority:m.priority||'med',createdAt:m.createdAt,updatedAt:m.updatedAt});
    for(const p of await Projects.index())if(p.pinned)out[p.priority||'med'].push({key:'proj:'+p.id,title:p.name,category:'Projeto · '+p.status,priority:p.priority||'med',createdAt:p.createdAt,updatedAt:p.updatedAt});
    return out}
  async function buildContext(){const ag=await aggregate(),L=[];for(const lvl of ORDER)for(const it of ag[lvl])L.push(`- [${lvl}] ${it.title}`);return L.length?'Memórias fixadas (prioridade máxima):\n'+L.join('\n'):''}
  return{aggregate,buildContext,LBL,ORDER};
})();
const PinnedUI=(()=>{const PRI={critica:'#e0614b',high:'#e8863a',med:'#e0b341',low:'#5bbf8a'};
  async function render(){const ag=await Pinned.aggregate();let h='';
    for(const lvl of Pinned.ORDER){const items=ag[lvl];h+=`<div class="card" style="margin:12px 14px"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:${PRI[lvl]};margin-bottom:8px">${Pinned.LBL[lvl]}</div>${items.length?items.map(it=>row(it,lvl)).join(''):'<div style="font-size:12px;color:var(--muted)">—</div>'}</div>`}
    const any=Object.values(ag).some(a=>a.length);
    $('#mtab-pinned').innerHTML=(any?'':'<div class="empty" style="padding:26px 16px">Nada fixado ainda.<br>Fixe (📌) memórias de usuário ou projetos — eles aparecem aqui, agrupados por prioridade, e são consultados PRIMEIRO pela IA.</div>')+h}
  function row(it,lvl){return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)"><span style="color:${PRI[lvl]}">●</span><div style="flex:1;min-width:0"><div style="font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.title)}</div><div style="font-size:11px;color:var(--muted);font-family:var(--mono)">${esc(it.category)} · atualizado ${fmt(it.updatedAt)}</div></div><button class="mini" title="Visualizar/editar na origem" onclick="PinnedUI.open('${it.key}')">🔍</button><button class="mini" title="Desafixar" onclick="PinnedUI.unpin('${it.key}')">📍</button></div>`}
  async function open(key){const i=key.indexOf(':'),t=key.slice(0,i),id=key.slice(i+1);if(t==='mem'){MemTabs.show('users');MemoryUI.open(id)}else if(t==='proj'){MemTabs.show('projects');ProjectsUI.open(id)}}
  async function unpin(key){const i=key.indexOf(':'),t=key.slice(0,i),id=key.slice(i+1);
    if(t==='mem'){const m=await Memory.get(id);if(m){m.pinned=false;await Memory.save(m)}}
    else if(t==='proj'){const p=await Projects.get(id);if(p){p.pinned=false;await Projects.save(p)}}
    render();toast('Desafixado','ok')}
  return{render,open,unpin};
})();
const MemTabs=(()=>{let cur='users';const tabs=['users','projects','recent','pinned'];
  function show(t){cur=t;tabs.forEach(x=>$('#mtab-'+x).classList.toggle('hide',x!==t));tabs.forEach(x=>{const b=$('#mtb-'+x);if(b)b.style.borderColor=x===t?'var(--accent)':''});
    if(t==='users')MemoryUI.render();else if(t==='projects')ProjectsUI.render();else if(t==='recent')RecentUI.render();else PinnedUI.render()}
  return{show,refresh:()=>show(cur)};
})();

/* ===== AGENTES — gerenciamento ===== */
const AgentsUI=(()=>{
  async function open(){await render();$('#agentsModal').classList.add('show')}
  function close(){$('#agentsModal').classList.remove('show')}
  async function render(){const a=await Agents.list(),cur=Agents.currentId();
    $('#agentlist').innerHTML=a.map(x=>`<div class="card" style="margin:8px 0;padding:10px"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">${x.icon||'🤖'}</span><input value="${esc(x.name)}" onchange="AgentsUI.rename('${x.id}',this.value)" style="flex:1;background:var(--ink);border:1px solid var(--line);color:var(--text);border-radius:7px;padding:6px 8px;font-size:13px">${x.id===cur?'<span class="badge ok">ativo</span>':`<button class="mini" onclick="AgentsUI.use('${x.id}')">Usar</button>`}${x.principal?'<span class="badge" style="background:var(--panel-2);color:var(--accent)">principal</span>':`<button class="mini dz" onclick="AgentsUI.del('${x.id}')">🗑</button>`}</div>${x.principal?`<label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;color:var(--muted)"><input type="checkbox" ${x.consultOthers?'checked':''} onchange="AgentsUI.toggleConsult('${x.id}',this.checked)"> Pode consultar os outros agentes (#7)</label>`:''}</div>`).join('')}
  async function add(){const ag=await Agents.create($('#newagent').value);if(!ag){toast('Limite de 20 agentes atingido','err');return}$('#newagent').value='';await AgentBar.render();render();toast('Agente criado','ok')}
  async function rename(id,name){await Agents.update(id,{name:name.trim()||'Agente'});await AgentBar.render();render()}
  async function use(id){await AgentBar.switchTo(id);render()}
  async function del(id){if(!confirm('Excluir este agente e TODO o histórico e memória dele? Não dá pra desfazer.'))return;const ok=await Agents.remove(id);if(!ok){toast('Não é possível excluir este agente','err');return}await AgentBar.render();ChatUI.reset();ChatUI.render();render();toast('Agente excluído','ok')}
  async function toggleConsult(id,v){await Agents.update(id,{consultOthers:v});render();toast(v?'Consulta a outros agentes ativada':'Consulta desativada','ok')}
  return{open,close,render,add,rename,use,del,toggleConsult};
})();

/* ===== IMAGENS (Pollinations — geração real client-side) ===== */
const Images=(()=>{const now=()=>Date.now(),id=()=>'img_'+now().toString(36)+Math.random().toString(36).slice(2,5);
  const BASE='https://image.pollinations.ai/prompt/';
  function buildPrompt(spec){const p=[];if(spec.subject)p.push(spec.subject);if(spec.character)p.push(spec.character);if(spec.style)p.push('estilo '+spec.style);if(spec.background)p.push('fundo '+spec.background);if(spec.colors)p.push('cores '+spec.colors);if(spec.details)p.push(spec.details);p.push('alta nitidez, composição equilibrada, visual profissional');let s=p.filter(Boolean).join(', ');if(spec.negative)s+=' | evitar: '+spec.negative;return s}
  function buildUrl(prompt,{w,h,seed,model,negative,enhance}){const q=new URLSearchParams();q.set('width',w);q.set('height',h);q.set('model',model||'flux');if(seed!=null&&seed!=='')q.set('seed',seed);if(negative)q.set('negative',negative);if(enhance)q.set('enhance','true');q.set('nologo','true');q.set('referrer','intelectual-ia');return BASE+encodeURIComponent(prompt)+'?'+q.toString()}
  function loadImg(url,cross){return new Promise((res,rej)=>{const im=new Image();if(cross)im.crossOrigin='anonymous';im.onload=()=>res(im);im.onerror=()=>rej(new Error('load'));im.src=url})}
  async function urlToBlob(url){try{const im=await loadImg(url,true);const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);const b=await new Promise(r=>c.toBlob(r,'image/jpeg',0.92));if(b)return b}catch(_){}try{const r=await fetch(url);if(r.ok)return await r.blob()}catch(_){}return null}
  async function index(){return (await IDB.get('img:index'))||[]}
  async function saveRec(rec,blob){if(blob)await IDB.set('img:blob:'+rec.id,blob);const a=await index();a.unshift(rec);await IDB.set('img:index',a)}
  const blob=id=>IDB.get('img:blob:'+id);
  async function remove(id){await IDB.del('img:blob:'+id);await IDB.set('img:index',(await index()).filter(x=>x.id!==id))}
  return{id,now,buildPrompt,buildUrl,loadImg,urlToBlob,index,saveRec,blob,remove};
})();
function analyzeImage(img){const W=Math.min(img.naturalWidth,256),H=Math.max(1,Math.round(W*img.naturalHeight/img.naturalWidth));const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,W,H);let data;try{data=ctx.getImageData(0,0,W,H).data}catch(_){return null}
  const n=W*H,gray=new Float64Array(n);let sum=0,sumSq=0;for(let i=0,p=0;i<data.length;i+=4,p++){const g=0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];gray[p]=g;sum+=g;sumSq+=g*g}
  const mean=sum/n,contrast=Math.sqrt(Math.max(0,sumSq/n-mean*mean));
  let ls=0,lq=0,m=0;for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x,lap=4*gray[i]-gray[i-1]-gray[i+1]-gray[i-W]-gray[i+W];ls+=lap;lq+=lap*lap;m++}
  const sharp=m?lq/m-(ls/m)*(ls/m):0;
  const bk={};for(let i=0;i<data.length;i+=4){const k=(data[i]>>5)+'_'+(data[i+1]>>5)+'_'+(data[i+2]>>5);bk[k]=(bk[k]||0)+1}
  const colors=Object.entries(bk).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k])=>{const[r,g,b]=k.split('_').map(v=>v*32+16);return `rgb(${r},${g},${b})`});
  return{w:img.naturalWidth,h:img.naturalHeight,aspect:(img.naturalWidth/img.naturalHeight).toFixed(2),brightness:Math.round(mean),contrast:Math.round(contrast),sharpness:Math.round(sharp),colors}}
function tipsFrom(a){const t=[];if(a.brightness<60)t.push('Escura (brilho '+a.brightness+'/255) — aumente a iluminação.');if(a.brightness>205)t.push('Muito clara (brilho '+a.brightness+') — reduza exposição.');if(a.contrast<35)t.push('Contraste baixo ('+a.contrast+') — aumente o contraste.');if(a.sharpness<70)t.push('Pouca nitidez (foco '+a.sharpness+') — aplique nitidez ou gere em resolução maior.');const ar=parseFloat(a.aspect),ok=[1,16/9,9/16,4/3,3/4].some(r=>Math.abs(ar-r)<0.06);if(!ok)t.push('Proporção incomum ('+a.aspect+') — considere 1:1, 16:9 ou 4:3.');if(!t.length)t.push('Métricas dentro do esperado. Para mudar conteúdo, ajuste o prompt e regenere com a MESMA seed.');return t}
function sharpenData(d,w,h){const src=new Uint8ClampedArray(d.data);const k=[0,-1,0,-1,5,-1,0,-1,0];for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)for(let ch=0;ch<3;ch++){let s=0,ki=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){s+=src[((y+dy)*w+(x+dx))*4+ch]*k[ki++]}d.data[(y*w+x)*4+ch]=s}}
const ImageUI=(()=>{let lastCorrectSeed=null;
  const $=s=>document.querySelector(s);
  function collectSpec(){return{subject:$('#i_subject').value.trim(),style:$('#i_style').value.trim(),character:$('#i_char').value.trim(),background:$('#i_bg').value.trim(),colors:$('#i_colors').value.trim(),details:$('#i_details').value.trim(),negative:$('#i_neg').value.trim()}}
  async function generate(){const spec=collectSpec();if(!spec.subject){toast('Descreva o pedido primeiro','err');return}
    const [w,h]=$('#i_res').value.split('x').map(Number),model=$('#i_model').value,enhance=$('#i_enhance').checked,nv=parseInt($('#i_var').value);
    const sv=$('#i_seed').value.trim(),baseSeed=sv!==''?parseInt(sv):null,prompt=Images.buildPrompt(spec);
    $('#i_gen').disabled=true;
    const items=[];for(let k=0;k<nv;k++){const seed=baseSeed!=null?baseSeed+k:Math.floor(Math.random()*1e9);items.push({seed,url:Images.buildUrl(prompt,{w,h,seed,model,negative:spec.negative,enhance})})}
    $('#i_result').innerHTML=`<div class="pad" style="color:var(--muted)">Gerando ${nv} imagem(ns)… alguns segundos.</div><div class="grid" style="padding:0 14px" id="i_cards"></div>`;
    const box=$('#i_cards');
    for(const it of items){const card=document.createElement('div');card.className='file';card.innerHTML=`<div class="thumb" style="height:auto;min-height:120px"><img src="${it.url}" style="width:100%;height:auto" onerror="this.parentNode.innerHTML='<div style=\\'padding:20px;color:var(--danger);font-size:12px\\'>Falhou (rede/limite). Tente outra seed ou modelo turbo.'"></div><div style="padding:8px"><div class="mt">seed ${it.seed} · ${w}×${h}</div><div class="row" style="gap:4px;margin-top:6px"><button class="mini" onclick="ImageUI.save('${it.seed}','${encodeURIComponent(it.url)}',${w},${h},'${model}')">💾</button><button class="mini" onclick="ImageUI.correct('${it.seed}')">✏️</button><button class="mini" onclick="window.open(decodeURIComponent('${encodeURIComponent(it.url)}'),'_blank')">⬇</button></div></div>`;box.appendChild(card)}
    const head=$('#i_result').querySelector('.pad');if(head)head.textContent='Pronto. Salve as que gostar, ou corrija (✏️ mantém a seed e a composição).';
    $('#i_gen').disabled=false}
  async function save(seed,encUrl,w,h,model){const url=decodeURIComponent(encUrl);toast('Salvando…','info');const blob=await Images.urlToBlob(url);const spec=collectSpec();const rec={id:Images.id(),prompt:Images.buildPrompt(spec),spec,seed:Number(seed),model,w:Number(w),h:Number(h),ts:Date.now(),hasBlob:!!blob,url:blob?null:url,parent:null};await Images.saveRec(rec,blob);toast(blob?'Imagem salva no histórico':'Salva (sem blob — análise/ajuste indisponíveis por CORS)',blob?'ok':'info');renderHistory()}
  function correct(seed){$('#i_seed').value=seed;lastCorrectSeed=seed;$('#view-imagens').querySelector('.pane').scrollTop=0;toast('Seed travada em '+seed+'. Ajuste os campos e gere de novo — a composição se mantém.','info')}
  async function renderHistory(){const a=await Images.index(),box=$('#i_history');if(!a.length){box.innerHTML='<div class="empty" style="grid-column:1/-1">Nenhuma imagem salva ainda.</div>';return}
    box.innerHTML='';for(const r of a){const card=document.createElement('div');card.className='file';let thumb='<div class="thumb">🖼️</div>';if(r.hasBlob){const b=await Images.blob(r.id);if(b)thumb=`<div class="thumb" style="height:110px"><img src="${URL.createObjectURL(b)}"></div>`}else if(r.url){thumb=`<div class="thumb" style="height:110px"><img src="${r.url}"></div>`}
      card.onclick=()=>preview(r.id);card.innerHTML=`${thumb}<div style="padding:8px"><div class="nm">${esc(r.spec.subject||r.prompt).slice(0,40)}</div><div class="mt">seed ${r.seed} · ${r.w}×${r.h}</div></div>`;box.appendChild(card)}}
  async function preview(id){const r=(await Images.index()).find(x=>x.id===id);if(!r)return;const b=r.hasBlob?await Images.blob(id):null;const src=b?URL.createObjectURL(b):r.url;
    $('#i_result').innerHTML=`<div class="pad"><img src="${src}" style="max-width:100%;border-radius:8px"><div class="mt" style="margin-top:6px">${esc(r.prompt)}</div><div style="font-size:11px;color:var(--muted);margin-top:4px">seed ${r.seed} · ${r.model} · ${r.w}×${r.h} · ${fmt(r.ts)}</div>
      <div class="row" style="gap:6px;margin-top:10px">
        <button class="btn btn-ghost" onclick="ImageUI.analyze('${id}')">🔍 Analisar</button>
        ${b?`<button class="btn btn-ghost" onclick="ImageUI.adjustUI('${id}')">🎚 Ajustar</button>`:''}
        <button class="btn btn-ghost" onclick="ImageUI.download('${id}')">⬇ Baixar</button>
        <button class="btn btn-ghost" onclick="ImageUI.correctFrom('${id}')">✏️ Corrigir</button>
        <button class="btn btn-danger" onclick="ImageUI.del('${id}')">🗑</button>
      </div><div id="i_analysis" style="margin-top:12px"></div></div>`}
  async function analyze(id){const r=(await Images.index()).find(x=>x.id===id);const b=r&&r.hasBlob?await Images.blob(id):null;if(!b){$('#i_analysis').innerHTML='<div style="color:var(--muted);font-size:13px">Análise técnica requer o blob (esta imagem foi salva sem ele por CORS). Gere/salve novamente em outra rede.</div>';return}
    const img=await Images.loadImg(URL.createObjectURL(b),false);const a=analyzeImage(img);if(!a){$('#i_analysis').textContent='Não foi possível analisar.';return}
    $('#i_analysis').innerHTML=`<div class="card" style="margin:0"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:8px">Análise técnica</div>
      <div style="font-size:13px;line-height:1.8">Resolução: <b>${a.w}×${a.h}</b> · Proporção: <b>${a.aspect}</b><br>Brilho: <b>${a.brightness}</b>/255 · Contraste: <b>${a.contrast}</b> · Nitidez: <b>${a.sharpness}</b><br>Cores dominantes: ${a.colors.map(c=>`<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${c};vertical-align:middle"></span>`).join(' ')}</div>
      <div style="margin-top:10px;font-size:13px;color:var(--accent)">Dicas:</div><ul style="margin:4px 0 0;padding-left:18px;font-size:13px;line-height:1.6">${tipsFrom(a).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">Análise semântica (rosto/elementos) requer modelo de visão — entra com o /api conectado.</div></div>`}
  function adjustUI(id){$('#i_analysis').innerHTML=`<div class="card" style="margin:0"><div style="font-size:12px;color:var(--muted);margin-bottom:8px">Ajustes (canvas, determinístico)</div>
    ${['Brilho|bright|0.5|1.5|1','Contraste|contrast|0.5|2|1','Saturação|sat|0|2|1'].map(s=>{const[l,k,mn,mx,v]=s.split('|');return `<label style="display:block;font-size:12px;margin-bottom:6px">${l} <input type="range" id="adj_${k}" min="${mn}" max="${mx}" step="0.05" value="${v}" style="width:100%"></label>`}).join('')}
    <label style="display:flex;gap:6px;font-size:12px;margin:6px 0"><input type="checkbox" id="adj_sharp"> Nitidez (sharpen)</label>
    <button class="btn btn-pri" onclick="ImageUI.applyAdjust('${id}')">Aplicar e salvar como nova versão</button></div>`}
  async function applyAdjust(id){const r=(await Images.index()).find(x=>x.id===id);const b=await Images.blob(id);if(!b)return;const img=await Images.loadImg(URL.createObjectURL(b),false);
    const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');
    ctx.filter=`brightness(${$('#adj_bright').value}) contrast(${$('#adj_contrast').value}) saturate(${$('#adj_sat').value})`;ctx.drawImage(img,0,0);
    if($('#adj_sharp').checked&&c.width<=1920){try{const d=ctx.getImageData(0,0,c.width,c.height);sharpenData(d,c.width,c.height);ctx.putImageData(d,0,0)}catch(_){}}
    const nb=await new Promise(res=>c.toBlob(res,'image/jpeg',0.92));const nr={...r,id:Images.id(),ts:Date.now(),parent:id,hasBlob:true,url:null};await Images.saveRec(nr,nb);toast('Versão ajustada salva','ok');renderHistory();preview(nr.id)}
  async function download(id){const r=(await Images.index()).find(x=>x.id===id);const b=r&&r.hasBlob?await Images.blob(id):null;if(b)dl('imagem_'+r.seed+'.jpg',b);else if(r&&r.url)window.open(r.url,'_blank')}
  async function correctFrom(id){const r=(await Images.index()).find(x=>x.id===id);if(!r)return;const s=r.spec||{};$('#i_subject').value=s.subject||'';$('#i_style').value=s.style||'';$('#i_char').value=s.character||'';$('#i_bg').value=s.background||'';$('#i_colors').value=s.colors||'';$('#i_details').value=s.details||'';$('#i_neg').value=s.negative||'';$('#i_seed').value=r.seed;$('#i_model').value=r.model||'flux';Shell.show('imagens');$('#view-imagens').querySelector('.pane').scrollTop=0;toast('Spec carregada com seed '+r.seed+'. Ajuste e gere — mantém a composição.','info')}
  async function del(id){if(!confirm('Excluir esta imagem do histórico?'))return;await Images.remove(id);$('#i_result').innerHTML='<div class="empty" style="margin-top:30px">Imagem excluída.</div>';renderHistory();toast('Excluída','ok')}
  async function analyzeUpload(ev){const f=ev.target.files[0];if(!f)return;ev.target.value='';const img=await Images.loadImg(URL.createObjectURL(f),false);const a=analyzeImage(img);
    $('#i_result').innerHTML=`<div class="pad"><img src="${URL.createObjectURL(f)}" style="max-width:100%;border-radius:8px"><div id="i_analysis" style="margin-top:12px"></div></div>`;
    if(!a){$('#i_analysis').textContent='Não foi possível analisar.';return}
    $('#i_analysis').innerHTML=`<div class="card" style="margin:0"><div style="font-size:12px;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Análise técnica</div><div style="font-size:13px;line-height:1.8">Resolução: <b>${a.w}×${a.h}</b> · Proporção: <b>${a.aspect}</b><br>Brilho: <b>${a.brightness}</b> · Contraste: <b>${a.contrast}</b> · Nitidez: <b>${a.sharpness}</b></div><ul style="margin:8px 0 0;padding-left:18px;font-size:13px;line-height:1.6">${tipsFrom(a).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`}
  async function render(){renderHistory()}
  return{generate,save,correct,renderHistory,preview,analyze,adjustUI,applyAdjust,download,correctFrom,del,analyzeUpload,render};
})();

/* ===== SHELL ===== */
const Shell=(()=>{const views=['chat','notas','biblioteca','imagens','backup','memoria','config'];let started={};
  function show(v){views.forEach(x=>$('#view-'+x).classList.toggle('hide',x!==v));document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));$('#nav').classList.remove('open');
    if(v==='chat'&&!started.chat){ChatUI.render();started.chat=1}
    if(v==='notas'){NotesUI.render()}
    if(v==='biblioteca'){LibUI.render()}
    if(v==='imagens'){ImageUI.render()}
    if(v==='backup'){BackupUI.render()}
    if(v==='memoria'){MemTabs.refresh()}
    if(v==='config'){ConfigUI.render()}}
  return{show};
})();

/* ===== INIT ===== */
(async()=>{
  await Agents.seed();
  await Notes.seed();
  await Snaps.maybeAuto();
  try{if(navigator.storage&&navigator.storage.persist)await navigator.storage.persist()}catch(_){}
  await AgentBar.render();
  ChatUI.render();
  if(!IDB.persistent||!LS.persistent) toast('Persistência indisponível (preview). Baixe e hospede para salvar de verdade.','err');
})();
