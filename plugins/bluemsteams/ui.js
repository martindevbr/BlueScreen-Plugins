// BlueMSTeamsAutomator: painel na barra da esquerda (conexão e destinos) + tela fixa (compositor, histórico, mensagens,
// meu status, reuniões e links diretos). Toda chamada ao Teams passa pelo servidor do plugin (server.mjs): a página
// nunca vê token nem URL de webhook.
const { $, esc, toast } = bs;
const ICON = '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="6.5" width="11.5" height="11.5" rx="2"/><path d="M6.5 10.5h4.5M8.75 10.5v4.5"/><circle cx="18.5" cy="8" r="2"/><path d="M17.5 12h3a.5.5 0 0 1 .5.5V15a3 3 0 0 1-3 3h-.5"/></svg>';
const IC = {
  mais: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  pontos: '<svg class="i" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  gancho: '<svg class="i" viewBox="0 0 24 24"><path d="M9 17a3 3 0 1 1-2.6-4.5M15 7a3 3 0 1 1 2.6 4.5L14 18a3 3 0 1 1-2.6-1.5M12 7l-3.5 6"/></svg>',
  canal: '<svg class="i" viewBox="0 0 24 24"><path d="M9 4 7 20M17 4l-2 16M4 9h17M3 15h17"/></svg>',
  chat: '<svg class="i" viewBox="0 0 24 24"><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg>',
  enviar: '<svg class="i" viewBox="0 0 24 24"><path d="M4 12 20 4l-5 16-3-7z"/><path d="m12 13 8-9"/></svg>',
  atualizar: '<svg class="i" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v4.5h-4.5"/></svg>',
  config: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.700a7 7 0 0 0-2.1 1.200l-2.300-1-2 3.400 2 1.500a7 7 0 0 0 0 2.400l-2 1.500 2 3.400 2.300-1a7 7 0 0 0 2.100 1.200L10 21h4l.5-2.700a7 7 0 0 0 2.100-1.200l2.300 1 2-3.400-2-1.500A7 7 0 0 0 19 12z"/></svg>',
  telefone: '<svg class="i" viewBox="0 0 24 24"><path d="M6 4h3l1.500 4-2 1.500a11 11 0 0 0 6 6l1.500-2 4 1.500v3a1.500 1.500 0 0 1-1.500 1.500A16 16 0 0 1 4.500 5.500 1.500 1.500 0 0 1 6 4z"/></svg>',
  video: '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="6.5" width="12" height="11" rx="2"/><path d="m15 10.500 6-3v9l-6-3"/></svg>',
  agenda: '<svg class="i" viewBox="0 0 24 24"><rect x="4" y="5.500" width="16" height="14.500" rx="2"/><path d="M4 10h16M8.500 3.500v4M15.500 3.500v4"/></svg>',
  ok: '<svg class="i" viewBox="0 0 24 24"><path d="m5 12.500 4.500 4.500L19 7.500"/></svg>',
  erro: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  responder: '<svg class="i" viewBox="0 0 24 24"><path d="M9.500 7 4.500 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6v1"/></svg>',
  fora: '<svg class="i" viewBox="0 0 24 24"><path d="M13 5h6v6M19 5l-8.500 8.500"/><path d="M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4"/></svg>',
};
const PRESENCAS = [['Available', 'Disponível', 'verde'], ['Busy', 'Ocupado', 'vermelho'], ['DoNotDisturb', 'Não incomodar', 'vermelho'], ['BeRightBack', 'Volto logo', 'ambar'], ['Away', 'Ausente', 'ambar'], ['auto', 'Automático', 'cinza']];
const COR_PRESENCA = { Available: 'verde', AvailableIdle: 'verde', Busy: 'vermelho', BusyIdle: 'vermelho', DoNotDisturb: 'vermelho', BeRightBack: 'ambar', Away: 'ambar', Offline: 'cinza', PresenceUnknown: 'cinza' };
const ATALHOS = [
  { id: 'incidente', rotulo: 'Em incidente · 1 h', disponibilidade: 'DoNotDisturb', minutos: 60, mensagem: 'Em incidente, respondo depois.' },
  { id: 'foco', rotulo: 'Foco · 2 h', disponibilidade: 'DoNotDisturb', minutos: 120, mensagem: 'Em foco, vejo as mensagens depois.' },
  { id: 'almoco', rotulo: 'Almoço · 1 h', disponibilidade: 'Away', minutos: 60, mensagem: 'Almoço.' },
];

const T = {
  est: null, erroGeral: '', modelos: [], pronto: false,
  destino: '', pessoas: '', modo: 'texto', modelo: 'incidente', rascunho: {}, texto: '', titulo: '', assunto: '', importancia: 'normal', mencionar: '', raiz: null,
  aba: 'historico', hist: [], msgs: null, msgsErro: null, msgsDe: '', presenca: null, presencaErro: '', agenda: null, agendaErro: '',
  esperaAte: 0, enviando: false, erroEnvio: '', duracao: 60,
};
const R = {};
const timers = [];

// ---------- chamadas ----------
async function chamar(rota, corpo, query) {
  const opt = corpo === undefined ? { quiet: true } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), quiet: true };
  return bs.api('bluemsteams/' + rota, query || {}, opt);
}
const codigo = (e) => (e && e.data && e.data.codigo) || '';
function falhou(e, onde) {
  const c = codigo(e);
  if (c === 'limite') { T.esperaAte = Date.now() + (e.data.retryAfter || 10) * 1000; pintarAviso(); return; }
  if (c === 'vencido' || c === 'sem-conta') { carregar(); }
  if (onde) { onde.textContent = e.message; onde.hidden = false; } else toast(e.message, 'err');
}
const graphOk = () => T.est && T.est.graph.situacao === 'ok';
const destinos = (tipo) => (T.est ? T.est.destinos.filter((d) => !tipo || d.tipo === tipo) : []);
const destinoAtual = () => (T.destino === '@pessoas' ? { tipo: 'chat', apelido: '@pessoas' } : destinos().find((d) => d.apelido === T.destino) || null);
const falta = (escopo) => !!(T.est && T.est.graph.faltando.some((f) => f.escopo === escopo));
const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function faz(tempo) { const s = (Date.now() - tempo) / 1000; if (s < 50) return 'agora'; if (s < 3600) return `há ${Math.round(s / 60)} min`; if (s < 86400) return `há ${Math.round(s / 3600)} h`; return new Date(tempo).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); }
// copia sem prender a tela: fora de foco, a área de transferência do navegador pode nunca responder
const copiar = (t) => Promise.race([navigator.clipboard.writeText(t).catch(() => {}), new Promise((r) => setTimeout(r, 1200))]);
const guardarTela = () => plugin.data.set('tela', { destino: T.destino, modo: T.modo, modelo: T.modelo, aba: T.aba, duracao: T.duracao }).catch(() => {});

async function carregar(tentativas = 1) {
  for (let i = 0; i < tentativas; i++) {
    try {
      T.est = await chamar('estado');
      T.erroGeral = '';
      if (!T.modelos.length) T.modelos = (await chamar('modelos')).modelos;
      if (!T.pronto) { const t = (await plugin.data.get('tela', null)) || {}; Object.assign(T, { destino: t.destino || '', modo: t.modo === 'cartao' ? 'cartao' : 'texto', modelo: t.modelo || 'incidente', aba: t.aba === 'mensagens' ? 'mensagens' : 'historico', duracao: Number(t.duracao) || 60 }); T.pronto = true; }
      break;
    } catch (e) { T.erroGeral = e.status === 404 || !e.status ? 'O servidor do plugin não respondeu. Confira se o Node.js está instalado e ligue o plugin de novo na aba Plugins.' : e.message; if (i < tentativas - 1) await new Promise((r) => setTimeout(r, 600)); }
  }
  if (T.est) {
    const lim = Math.max(T.est.limite.graph, T.est.limite.webhook);
    if (lim > 0) T.esperaAte = Math.max(T.esperaAte, Date.now() + lim * 1000);
    if (!destinoAtual()) T.destino = (destinos()[0] || {}).apelido || (graphOk() ? '@pessoas' : '');
  }
  pintarLado(); pintarTela();
  if (T.est) { carregarHistorico(); if (graphOk()) { carregarPresenca(); carregarAgenda(); } }
}
async function carregarHistorico() { try { T.hist = (await chamar('historico')).itens; } catch {} if (T.aba === 'historico') pintarFeed(); }
async function carregarMensagens() {
  const d = destinoAtual();
  T.msgsErro = null;
  if (!d || d.tipo === 'webhook' || !graphOk() || (T.destino === '@pessoas' && !T.pessoas.trim())) { T.msgs = null; pintarFeed(); return; }
  const to = T.destino === '@pessoas' ? T.pessoas : d.apelido;
  T.msgsDe = to; T.msgs = null; pintarFeed(true);
  try { const r = await chamar('mensagens', undefined, { to, n: 20 }); if (T.msgsDe !== to) return; T.msgs = r.mensagens; } catch (e) { if (T.msgsDe !== to) return; if (codigo(e) === 'limite') falhou(e); T.msgsErro = e; }
  pintarFeed();
}
async function carregarPresenca() {
  try { T.presenca = (await chamar('presenca')).presenca; T.presencaErro = ''; } catch (e) { T.presencaErro = e.message; if (codigo(e) === 'limite') falhou(e); }
  pintarStatus();
}
async function carregarAgenda() {
  try { T.agenda = (await chamar('agenda')).reunioes; T.agendaErro = ''; } catch (e) { T.agendaErro = e.message; }
  pintarReunioes();
}

// ---------- painel da esquerda ----------
function pintarLado() {
  if (!R.lado) { R.lado = document.createElement('div'); R.lado.className = 'bmt-lado'; R.lado.addEventListener('click', cliqueLado); R.lado.addEventListener('contextmenu', (e) => { const l = e.target.closest('.bmt-dest'); if (l) menuDestino(e, l.dataset.id); }); }
  if (!T.est) { R.lado.innerHTML = `<div class="empty">${esc(T.erroGeral || 'Carregando…')}</div>`; return; }
  const g = T.est.graph;
  const conta = { 'sem-app': ['cinza', 'Configurar'], desconectado: ['cinza', 'Entrar'], vencido: ['ambar', 'Sessão vencida: entrar'], ok: [g.faltando.length ? 'ambar' : 'verde', g.conta ? g.conta.nome : 'Conectada'] }[g.situacao];
  const nWeb = destinos('webhook').length;
  const linha = (d) => `<div class="bmt-dest${d.apelido === T.destino ? ' on' : ''}" data-id="${esc(d.id)}" title="${esc(d.tipo === 'webhook' ? 'Webhook · ' + d.host : [d.time, d.nome].filter(Boolean).join(' › ') || d.apelido)}">${d.tipo === 'webhook' ? IC.gancho : d.tipo === 'canal' ? IC.canal : IC.chat}<span class="nm">${esc(d.apelido)}</span><span class="sub">${esc(d.tipo === 'webhook' ? '' : d.nome && d.nome !== d.apelido ? d.nome : '')}</span><button class="icon-btn bmt-mais" data-mais title="Mais ações">${IC.pontos}</button></div>`;
  const outros = destinos().filter((d) => d.tipo !== 'webhook');
  R.lado.innerHTML = `
    <div class="bmt-con">
      <div class="bmt-con-l" title="Abrir chat, chamada e reunião pelo link, sem login"><span class="bmt-pt verde"></span><b>Links diretos</b><span>sempre</span></div>
      <button class="bmt-con-l" data-con="webhook" title="Webhooks dos Workflows do Teams"><span class="bmt-pt ${nWeb ? 'verde' : 'cinza'}"></span><b>Webhooks</b><span>${nWeb ? nWeb + (nWeb === 1 ? ' salvo' : ' salvos') : 'Adicionar'}</span></button>
      <button class="bmt-con-l" data-con="conta" title="${esc(g.conta ? g.conta.email : 'Conta Microsoft (Graph)')}"><span class="bmt-pt ${conta[0]}"></span><b>Conta Microsoft</b><span>${esc(conta[1])}</span></button>
    </div>
    ${T.est.teste ? `<div class="bmt-teste" title="${esc(T.est.teste.graph)}">Endereço de teste</div>` : ''}
    <div class="section">Webhooks<span class="meta"><button class="icon-btn" data-novo="webhook" title="Novo webhook">${IC.mais}</button></span></div>
    ${destinos('webhook').map(linha).join('') || '<div class="bmt-vazio">Cole a URL de um fluxo dos Workflows para avisar um canal sem login.</div>'}
    <div class="section">Canais e chats<span class="meta"><button class="icon-btn" data-novo="canal" title="Novo canal ou chat">${IC.mais}</button></span></div>
    ${outros.map(linha).join('') || `<div class="bmt-vazio">${graphOk() ? 'Salve os canais e chats que você mais usa.' : 'Com a conta Microsoft, escolha canais e chats numa lista.'}</div>`}`;
}
function cliqueLado(e) {
  const mais = e.target.closest('[data-mais]');
  const dest = e.target.closest('.bmt-dest');
  if (mais && dest) return menuDestino(e, dest.dataset.id);
  if (dest) { const d = destinos().find((x) => x.id === dest.dataset.id); if (d) { escolherDestino(d.apelido); bs.pages.open('bluemsteams'); } return; }
  const novo = e.target.closest('[data-novo]');
  if (novo) return novo.dataset.novo === 'webhook' ? dlgWebhook() : dlgCanal();
  const con = e.target.closest('[data-con]');
  if (!con) return;
  if (con.dataset.con === 'webhook') return destinos('webhook').length ? bs.pages.open('bluemsteams') : dlgWebhook();
  menuConta(e);
}
function menuConta(e) {
  const g = T.est.graph;
  if (g.situacao === 'sem-app') return dlgApp();
  if (g.situacao !== 'ok') return entrar();
  bs.showMenu(e, [
    ...(g.faltando.length ? [{ label: `Permissões que faltam (${g.faltando.length})…`, action: dlgPermissoes }, '-'] : []),
    { label: 'Entrar de novo', action: entrar },
    { label: 'Configurações do app…', icon: IC.config, action: () => plugin.settings.open() },
    '-',
    { label: 'Sair da conta', action: async () => { await chamar('login', { acao: 'sair' }); toast('Conta Microsoft desconectada'); carregar(); } },
  ], g.conta ? g.conta.email : 'Conta Microsoft');
}
function menuDestino(e, id) {
  const d = destinos().find((x) => x.id === id);
  if (!d) return;
  bs.showMenu(e, [
    { label: 'Escrever para este destino', icon: IC.enviar, action: () => { escolherDestino(d.apelido); bs.pages.open('bluemsteams'); } },
    ...(d.tipo === 'webhook' ? [{ label: 'Enviar um teste', action: () => testarWebhook(d) }, { label: 'Trocar a URL…', action: () => dlgWebhook(d) }] : []),
    ...(d.tipo === 'canal' ? [{ label: 'Abrir no Teams', icon: IC.fora, action: () => abrir({ tipo: 'canal', to: d.apelido }) }] : []),
    { label: 'Renomear…', action: () => dlgRenomear(d) },
    { label: 'Copiar o apelido', action: () => bs.copyText(d.apelido) },
    '-',
    { label: 'Remover…', action: () => dlgRemover(d) },
  ], d.apelido);
}
async function testarWebhook(d) {
  try { await chamar('enviar', { to: d.apelido, titulo: 'Teste do BlueScreen', texto: 'Se você está lendo isto, o webhook funciona.' }); toast(`Teste enviado para ${d.apelido}`, 'ok'); } catch (e) { falhou(e); }
  carregarHistorico();
}

// ---------- janelas ----------
const fecha = (el) => { el.hidden = true; };
function dlgWebhook(d) {
  dialog('bmtWebhook', `<div class="dlg-hd"><span class="dlg-ic">${IC.gancho}</span><div><h3>${d ? 'Trocar a URL do webhook' : 'Novo webhook'}</h3><p>${d ? esc(d.apelido) : 'Um fluxo dos Workflows que publica num canal ou chat.'}</p></div></div>
    ${d ? '' : `<ol class="bmt-passos"><li>No Teams, clique em <b>⋯</b> ao lado do canal › <b>Workflows</b>.</li><li>Escolha <b>Enviar alertas de webhook para um canal</b> e conclua.</li><li>Copie a URL que aparece no fim e cole aqui.</li></ol>
    <label class="fld">Apelido<input id="bmtWhNome" maxlength="40" placeholder="incidentes" autocomplete="off" spellcheck="false"></label>`}
    <label class="fld">URL do webhook<input id="bmtWhUrl" type="password" placeholder="https://…" autocomplete="off" spellcheck="false"></label>
    <p class="bmt-nota">A URL é a senha do canal: fica cifrada no seu PC e não aparece de novo.</p>
    <div class="err" id="bmtWhErr"></div>
    <div class="actions"><button class="chip" data-close>Cancelar</button><button class="chip primary" id="bmtWhOk">Salvar</button></div>`, (el) => {
    const nome = el.querySelector('#bmtWhNome'), url = el.querySelector('#bmtWhUrl'), err = el.querySelector('#bmtWhErr');
    (nome || url).focus();
    const salvar = async () => {
      err.textContent = '';
      try {
        const r = await chamar('destinos', d ? { acao: 'trocar', id: d.id, url: url.value } : { acao: 'webhook', apelido: nome.value, url: url.value });
        fecha(el); toast(d ? 'URL trocada' : `Webhook "${r.destino.apelido}" salvo`, 'ok');
        if (!d) T.destino = r.destino.apelido;
        carregar();
      } catch (e) { err.textContent = e.message; }
    };
    el.querySelector('#bmtWhOk').onclick = salvar;
    el.onkeydown = (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') salvar(); };
  });
}
function dlgRenomear(d) {
  dialog('bmtRen', `<div class="dlg-hd"><span class="dlg-ic">${ICON}</span><div><h3>Renomear destino</h3><p>Os fluxos do Automator acham o destino pelo apelido: troque lá também.</p></div></div>
    <label class="fld">Apelido<input id="bmtRenNome" maxlength="40" value="${esc(d.apelido)}" autocomplete="off" spellcheck="false"></label><div class="err" id="bmtRenErr"></div>
    <div class="actions"><button class="chip" data-close>Cancelar</button><button class="chip primary" id="bmtRenOk">Renomear</button></div>`, (el) => {
    const nome = el.querySelector('#bmtRenNome'); nome.focus(); nome.select();
    const salvar = async () => { try { const r = await chamar('destinos', { acao: 'renomear', id: d.id, apelido: nome.value }); if (T.destino === d.apelido) T.destino = r.destino.apelido; fecha(el); carregar(); } catch (e) { el.querySelector('#bmtRenErr').textContent = e.message; } };
    el.querySelector('#bmtRenOk').onclick = salvar;
    nome.onkeydown = (e) => { if (e.key === 'Enter') salvar(); };
  });
}
function dlgRemover(d) {
  dialog('bmtDel', `<div class="dlg-hd"><span class="dlg-ic del">${IC.erro}</span><div><h3>Remover "${esc(d.apelido)}"?</h3><p>${d.tipo === 'webhook' ? 'A URL guardada é apagada. O fluxo nos Workflows continua existindo.' : 'Sai só desta lista: nada muda no Teams.'}</p></div></div>
    <p class="bmt-nota">Os fluxos do Automator que usam este apelido param de achar o destino.</p>
    <div class="actions"><button class="chip" data-close>Cancelar</button><button class="chip primary danger" id="bmtDelOk">Remover</button></div>`, (el) => {
    el.querySelector('#bmtDelOk').onclick = async () => { try { await chamar('destinos', { acao: 'remover', id: d.id }); fecha(el); carregar(); } catch (e) { falhou(e); } };
  });
}
function dlgCanal() {
  const com = graphOk();
  let aba = com ? 'canal' : 'link';
  dialog('bmtCanal', `<div class="dlg-hd"><span class="dlg-ic">${IC.canal}</span><div><h3>Novo canal ou chat</h3><p>${com ? 'Escolha na lista ou cole um link do Teams.' : 'Sem a conta Microsoft dá para salvar pelo link; enviar pede a conta.'}</p></div></div>
    <div class="seg bmt-seg" id="bmtCnAba">${com ? '<button data-a="canal">Canal</button><button data-a="chat">Chat</button><button data-a="pessoas">Pessoas</button>' : ''}<button data-a="link">Colar link</button></div>
    <div id="bmtCnCorpo"></div>
    <label class="fld">Apelido<input id="bmtCnNome" maxlength="40" placeholder="sustentação" autocomplete="off" spellcheck="false"></label>
    <div class="err" id="bmtCnErr"></div>
    <div class="actions"><button class="chip" data-close>Cancelar</button><button class="chip primary" id="bmtCnOk">Salvar</button></div>`, (el) => {
    const corpo = el.querySelector('#bmtCnCorpo'), nome = el.querySelector('#bmtCnNome'), err = el.querySelector('#bmtCnErr');
    let tocou = false, times = null, chats = null;
    nome.oninput = () => { tocou = true; };
    const sugere = (t) => { if (!tocou) nome.value = String(t || '').toLowerCase().slice(0, 40); };
    const lista = (rotulo, id, itens, vazio) => `<label class="fld">${rotulo}<select id="${id}">${itens.length ? itens.map((x) => `<option value="${esc(x.id)}">${esc(x.nome)}${x.tipo === 'private' ? ' (privado)' : x.tipo === 'shared' ? ' (compartilhado)' : ''}</option>`).join('') : `<option value="">${vazio}</option>`}</select></label>`;
    async function canais() {
      const t = el.querySelector('#bmtCnTime').value, alvo = el.querySelector('#bmtCnCanais');
      alvo.innerHTML = lista('Canal', 'bmtCnCanal', [], 'Carregando…');
      try { const r = await chamar('canais', undefined, { time: t }); alvo.innerHTML = lista('Canal', 'bmtCnCanal', r.canais, 'Nenhum canal'); const s = el.querySelector('#bmtCnCanal'); s.onchange = () => sugere(s.selectedOptions[0] && s.selectedOptions[0].textContent.replace(/ \((privado|compartilhado)\)$/, '')); s.onchange(); } catch (e) { err.textContent = e.message; }
    }
    async function pinta() {
      err.textContent = '';
      el.querySelectorAll('#bmtCnAba button').forEach((b) => b.classList.toggle('on', b.dataset.a === aba));
      if (aba === 'link') { corpo.innerHTML = '<label class="fld">Link do canal ou do chat<input id="bmtCnLink" placeholder="https://teams.microsoft.com/l/channel/…" autocomplete="off" spellcheck="false"></label><p class="bmt-nota">No Teams: <b>⋯</b> ao lado do canal › <b>Obter link para o canal</b>.</p>'; return; }
      if (aba === 'pessoas') { corpo.innerHTML = '<label class="fld">E-mails das pessoas<input id="bmtCnGente" placeholder="ana@empresa.com, joao@empresa.com" autocomplete="off" spellcheck="false"></label><p class="bmt-nota">Um e-mail abre a conversa com a pessoa; vários criam um grupo.</p>'; return; }
      corpo.innerHTML = '<div class="bmt-nota">Carregando…</div>';
      try {
        if (aba === 'canal') {
          times ||= (await chamar('times')).times;
          if (aba !== 'canal') return;
          corpo.innerHTML = lista('Time', 'bmtCnTime', times, 'Você não participa de nenhum time') + '<div id="bmtCnCanais"></div>';
          if (times.length) { el.querySelector('#bmtCnTime').onchange = canais; canais(); }
        } else {
          chats ||= (await chamar('chats')).chats;
          if (aba !== 'chat') return;
          corpo.innerHTML = lista('Chat', 'bmtCnChat', chats, 'Nenhum chat recente');
          const s = el.querySelector('#bmtCnChat'); s.onchange = () => sugere(s.selectedOptions[0] && s.selectedOptions[0].textContent.split(',')[0]); s.onchange();
        }
      } catch (e) { corpo.innerHTML = ''; err.textContent = e.message; }
    }
    el.querySelector('#bmtCnAba').onclick = (e) => { const b = e.target.closest('button'); if (b) { aba = b.dataset.a; pinta(); } };
    el.querySelector('#bmtCnOk').onclick = async () => {
      err.textContent = '';
      const v = (id) => (el.querySelector(id) ? el.querySelector(id).value : '');
      const txt = (id) => { const s = el.querySelector(id); return s && s.selectedOptions[0] ? s.selectedOptions[0].textContent.replace(/ \((privado|compartilhado)\)$/, '') : ''; };
      let corpoReq;
      if (aba === 'canal') corpoReq = { acao: 'canal', teamId: v('#bmtCnTime'), channelId: v('#bmtCnCanal'), nome: txt('#bmtCnCanal'), time: txt('#bmtCnTime') };
      else if (aba === 'chat') corpoReq = { acao: 'chat', chatId: v('#bmtCnChat'), nome: txt('#bmtCnChat') };
      else if (aba === 'pessoas') corpoReq = { acao: 'chat', pessoas: v('#bmtCnGente') };
      else corpoReq = { acao: /\/l\/(chat|message)\//.test(v('#bmtCnLink')) && !/groupId=/.test(v('#bmtCnLink')) ? 'chat' : 'canal', link: v('#bmtCnLink') };
      try { const r = await chamar('destinos', { ...corpoReq, apelido: nome.value }); fecha(el); toast(`"${r.destino.apelido}" salvo`, 'ok'); T.destino = r.destino.apelido; carregar(); } catch (e) { err.textContent = e.message; }
    };
    pinta();
  });
}
// as permissões que o app registrado no Entra precisa ter (delegadas do Microsoft Graph)
const PERMISSOES = ['User.Read', 'User.ReadBasic.All', 'Team.ReadBasic.All', 'Channel.ReadBasic.All', 'ChannelMessage.Send', 'Chat.Read', 'ChatMessage.Send', 'Chat.Create', 'Presence.Read', 'Presence.ReadWrite', 'OnlineMeetings.ReadWrite', 'Calendars.ReadWrite', 'Files.ReadWrite.All', 'offline_access'];
async function dlgApp() {
  const cfg = (await plugin.settings.get().catch(() => ({}))) || {};
  dialog('bmtApp', `<div class="dlg-hd"><span class="dlg-ic">${ICON}</span><div><h3>Conta Microsoft</h3><p>Para enviar em seu nome, ler mensagens, mudar a presença, criar reunião e mandar arquivos.</p></div></div>
    <ol class="bmt-passos">
      <li><b>Registre um app no Microsoft Entra</b> (você ou o TI): <i>Registros de aplicativo › Novo registro</i>. Em <i>URI de redirecionamento</i>, escolha <i>Cliente público/nativo</i> e cole <code class="bmt-copia" data-copia="http://localhost" title="Clique para copiar">http://localhost</code>.</li>
      <li>Em <i>Autenticação</i>, ligue <b>Permitir fluxos de cliente público</b>. Em <i>Permissões de API › Microsoft Graph › Delegadas</i>, adicione: <span class="bmt-perm-l">${PERMISSOES.map((x) => `<code>${x}</code>`).join(' ')}</span> <button class="bmt-link" data-copia="${PERMISSOES.join(' ')}">copiar a lista</button></li>
      <li>Na <i>Visão geral</i> do app, copie os dois IDs e cole aqui.</li>
    </ol>
    <label class="fld">ID do aplicativo (cliente)<input id="bmtAppId" value="${esc(cfg.clientId || '')}" placeholder="00000000-0000-0000-0000-000000000000" autocomplete="off" spellcheck="false"></label>
    <label class="fld">ID do diretório (locatário)<input id="bmtAppTen" value="${esc(cfg.tenant && cfg.tenant !== 'organizations' ? cfg.tenant : '')}" placeholder="vazio: qualquer empresa (organizations)" autocomplete="off" spellcheck="false"></label>
    <p class="bmt-nota">Sem a conta, os webhooks e os links diretos continuam funcionando. Ler mensagens de canal pede uma permissão que só o administrador aprova: veja em Configurações.</p>
    <div class="err" id="bmtAppErr"></div>
    <div class="actions"><button class="chip" id="bmtAppCfg">Configurações…</button><button class="chip" data-close>Agora não</button><button class="chip primary" id="bmtAppOk">Salvar e entrar</button></div>`, (el) => {
    el.querySelectorAll('[data-copia]').forEach((b) => { b.onclick = () => bs.copyText(b.dataset.copia); });
    el.querySelector('#bmtAppCfg').onclick = () => { fecha(el); plugin.settings.open(); };
    const id = el.querySelector('#bmtAppId'), ten = el.querySelector('#bmtAppTen'), err = el.querySelector('#bmtAppErr');
    id.focus();
    const salvar = async () => {
      const v = id.value.trim(), t = ten.value.trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) { err.textContent = 'O ID do aplicativo tem o formato 00000000-0000-0000-0000-000000000000. Copie de novo da Visão geral do app.'; return; }
      if (t && !/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9.-]+\.[a-z]{2,}|organizations|common)$/i.test(t)) { err.textContent = 'O locatário é um ID no mesmo formato, ou o domínio da empresa (empresa.com.br).'; return; }
      try { await plugin.settings.set({ clientId: v, tenant: t || 'organizations' }); } catch (e) { err.textContent = e.message; return; }
      fecha(el); await carregar(); entrar();
    };
    el.querySelector('#bmtAppOk').onclick = salvar;
    el.onkeydown = (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') salvar(); };
  });
}
function dlgPermissoes() {
  const f = T.est.graph.faltando;
  dialog('bmtPerm', `<div class="dlg-hd"><span class="dlg-ic bmt-ic-ambar">${ICON}</span><div><h3>Permissões que faltam</h3><p>O login foi aceito, mas sem estas permissões.</p></div></div>
    <ul class="bmt-perms">${f.map((x) => `<li><code>${esc(x.escopo)}</code><span>${esc(x.para)}${x.admin ? ' · o administrador precisa aprovar' : ''}</span></li>`).join('')}</ul>
    <p class="bmt-nota">Acrescente no registro do app (Permissões de API › Microsoft Graph › Delegadas) e entre de novo.</p>
    <div class="actions"><button class="chip" data-close>Fechar</button><button class="chip primary" id="bmtPermOk">Entrar de novo</button></div>`, (el) => { el.querySelector('#bmtPermOk').onclick = () => { fecha(el); entrar(); }; });
}
let loginTimer = 0;
// modo: 'codigo' (código de dispositivo, o padrão) ou 'navegador' (PKCE, para empresas que bloqueiam o código)
async function entrar(modo = 'codigo') {
  let l;
  try { l = (await chamar('login', { acao: modo === 'navegador' ? 'navegador' : 'iniciar' })).login; } catch (e) { if (codigo(e) === 'sem-app') return dlgApp(); return dlgErroLogin(e.message); }
  const porCodigo = l.modo !== 'navegador';
  const el = dialog('bmtLogin', `<div class="dlg-hd"><span class="dlg-ic">${ICON}</span><div><h3>Entrar com a conta Microsoft</h3><p>${porCodigo ? 'Digite este código na página da Microsoft.' : 'A página da Microsoft abriu no navegador. Entre por lá e volte.'}</p></div></div>
    ${porCodigo ? `<div class="bmt-codigo" id="bmtLgCod" title="Clique para copiar">${esc(l.codigo)}</div>` : '<div class="bmt-espera"><i class="bmt-giro"></i></div>'}
    <p class="bmt-lg-st" id="bmtLgSt"></p>
    ${porCodigo ? '<p class="bmt-nota">A empresa bloqueia o código? <button class="bmt-link" id="bmtLgNav">Entrar pelo navegador</button></p>' : ''}
    <div class="actions"><button class="chip" data-close>Cancelar</button><button class="chip primary" id="bmtLgGo">${porCodigo ? 'Copiar e abrir a página' : 'Abrir a página de novo'}</button></div>`, (d) => {
    if (porCodigo) d.querySelector('#bmtLgCod').onclick = () => bs.copyText(l.codigo);
    const nav = d.querySelector('#bmtLgNav');
    if (nav) nav.onclick = () => { clearInterval(loginTimer); fecha(d); entrar('navegador'); };
    d.querySelector('#bmtLgGo').onclick = async () => { if (porCodigo) { await copiar(l.codigo); } try { await chamar('login', { acao: 'abrir' }); if (porCodigo) toast('Código copiado. Cole na página que abriu.', 'ok'); } catch (e) { toast(e.message, 'err'); } };
  });
  const st = el.querySelector('#bmtLgSt');
  let fim = Date.now() + l.restam * 1000;
  clearInterval(loginTimer);
  const passo = async () => {
    if (el.hidden || !el.isConnected) { clearInterval(loginTimer); if (l && l.estado === 'aguardando') chamar('login', { acao: 'cancelar' }).catch(() => {}); return; }
    try { l = (await chamar('login')).login || l; } catch {}
    if (l.estado === 'ok') { clearInterval(loginTimer); l = null; fecha(el); toast('Conta Microsoft conectada', 'ok'); carregar(); return; }
    if (l.estado !== 'aguardando') { clearInterval(loginTimer); const msg = l.erro; l = null; fecha(el); dlgErroLogin(msg); return; }
    const s = Math.max(0, Math.round((fim - Date.now()) / 1000));
    st.textContent = porCodigo ? `Aguardando você entrar em ${l.url.replace(/^https:\/\//, '')} · o código vale mais ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `Aguardando o retorno da Microsoft · mais ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  loginTimer = setInterval(passo, 2000); passo();
}
function dlgErroLogin(msg) {
  dialog('bmtLgErr', `<div class="dlg-hd"><span class="dlg-ic del">${IC.erro}</span><div><h3>Não deu para entrar</h3><p>Conta Microsoft</p></div></div>
    <p class="bmt-msg">${esc(msg || 'A Microsoft não aceitou o login.')}</p>
    <div class="actions"><button class="chip" id="bmtLeCfg">Configurações…</button><button class="chip" data-close>Fechar</button><button class="chip primary" id="bmtLeDeNovo">Tentar de novo</button></div>`, (el) => {
    el.querySelector('#bmtLeCfg').onclick = () => { fecha(el); plugin.settings.open(); };
    el.querySelector('#bmtLeDeNovo').onclick = () => { fecha(el); entrar(); };
  });
}

// ---------- tela ----------
function montar(el) {
  R.tela = el; el.classList.add('bmt-pg');
  el.innerHTML = `<div class="bmt-rolo"><div class="bmt-in">
    <header class="bmt-topo"><h2>${ICON}<span>Teams</span></h2><span class="bmt-quem" id="bmtQuem"></span><span class="bmt-esp"></span><button class="icon-btn" id="bmtAtualizar" title="Atualizar">${IC.atualizar}</button><button class="icon-btn" id="bmtConfig" title="Configurações do plugin">${IC.config}</button></header>
    <div class="bmt-aviso" id="bmtAviso" hidden></div>
    <div class="bmt-grade">
      <div class="bmt-col"><section class="bmt-cartao" id="bmtComp"></section><section class="bmt-cartao" id="bmtFeed"></section></div>
      <div class="bmt-col bmt-lateral"><section class="bmt-cartao" id="bmtStatus"></section><section class="bmt-cartao" id="bmtReun"></section><section class="bmt-cartao" id="bmtAbrir"></section></div>
    </div></div></div>`;
  for (const k of ['Quem', 'Aviso', 'Comp', 'Feed', 'Status', 'Reun', 'Abrir']) R[k.toLowerCase()] = el.querySelector('#bmt' + k);
  el.querySelector('#bmtAtualizar').onclick = () => { carregar(); if (T.aba === 'mensagens') carregarMensagens(); };
  el.querySelector('#bmtConfig').onclick = () => plugin.settings.open();
  R.comp.addEventListener('click', cliqueComp); R.comp.addEventListener('input', digitouComp); R.comp.addEventListener('change', mudouComp);
  R.comp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); } });
  R.feed.addEventListener('click', cliqueFeed);
  R.status.addEventListener('click', cliqueStatus);
  R.status.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'bmtStMsg') definirMensagem(); });
  R.reun.addEventListener('click', cliqueReun);
  R.abrir.addEventListener('click', cliqueAbrir);
  R.aviso.addEventListener('click', (e) => { const a = e.target.closest('[data-av]'); if (!a) return; if (a.dataset.av === 'entrar') entrar(); else if (a.dataset.av === 'perm') dlgPermissoes(); });
  pintarTela();
}
function pintarTela() {
  if (!R.tela) return;
  if (!T.est) { R.comp.innerHTML = `<div class="empty">${esc(T.erroGeral || 'Carregando…')}</div>`; for (const k of ['feed', 'status', 'reun', 'abrir']) R[k].hidden = true; return; }
  for (const k of ['feed', 'status', 'reun', 'abrir']) R[k].hidden = false;
  const g = T.est.graph;
  R.quem.textContent = g.conta && g.situacao === 'ok' ? g.conta.nome : '';
  pintarAviso(); pintarComp(); pintarFeed(); pintarStatus(); pintarReunioes(); pintarAbrir();
}
function pintarAviso() {
  if (!R.aviso || !T.est) return;
  const g = T.est.graph, avisos = [];
  const resta = Math.ceil((T.esperaAte - Date.now()) / 1000);
  if (resta > 0) avisos.push(`<div class="bmt-av ambar"><b>O Teams pediu uma pausa.</b><span>Dá para enviar de novo em ${resta} s.</span></div>`);
  if (g.situacao === 'vencido') avisos.push('<div class="bmt-av ambar"><b>A sessão da conta Microsoft venceu.</b><span>Os webhooks e os links diretos continuam funcionando.</span><button class="chip" data-av="entrar">Entrar de novo</button></div>');
  if (g.situacao === 'ok' && g.faltando.length) avisos.push(`<div class="bmt-av ambar"><b>${g.faltando.length === 1 ? 'Falta uma permissão' : `Faltam ${g.faltando.length} permissões`} na conta Microsoft.</b><span>${esc(g.faltando.map((f) => f.escopo).join(', '))}</span><button class="chip" data-av="perm">Ver</button></div>`);
  R.aviso.innerHTML = avisos.join(''); R.aviso.hidden = !avisos.length;
  const b = R.comp && R.comp.querySelector('#bmtEnviar');
  if (b) b.disabled = resta > 0 || T.enviando;
}

// ----- compositor -----
const nadaConfigurado = () => !destinos().length && !graphOk();
function pintarComp() {
  if (nadaConfigurado()) return pintarAssistente();
  const d = destinoAtual(), porGraph = d && d.tipo !== 'webhook';
  const grupo = (rotulo, tipo) => { const l = destinos(tipo); return l.length ? `<optgroup label="${rotulo}">${l.map((x) => `<option value="${esc(x.apelido)}"${x.apelido === T.destino ? ' selected' : ''}>${esc(x.apelido)}</option>`).join('')}</optgroup>` : ''; };
  const semGraph = porGraph && !graphOk();
  R.comp.innerHTML = `
    <div class="bmt-linha">
      <label class="bmt-campo bmt-cresce"><span>Para</span><select id="bmtPara">${grupo('Webhooks', 'webhook')}${grupo('Canais', 'canal')}${grupo('Chats', 'chat')}${graphOk() ? `<option value="@pessoas"${T.destino === '@pessoas' ? ' selected' : ''}>Pessoas por e-mail…</option>` : ''}<option value="@novo">Novo destino…</option></select></label>
      <div class="seg bmt-seg" id="bmtModo"><button data-m="texto" class="${T.modo === 'texto' ? 'on' : ''}">Texto</button><button data-m="cartao" class="${T.modo === 'cartao' ? 'on' : ''}">Cartão</button></div>
    </div>
    ${T.destino === '@pessoas' ? `<label class="bmt-campo"><span>E-mails</span><input id="bmtPessoas" data-k="pessoas" value="${esc(T.pessoas)}" placeholder="ana@empresa.com, joao@empresa.com" spellcheck="false" autocomplete="off"></label>` : ''}
    ${T.raiz ? `<div class="bmt-resp">${IC.responder}<span>Respondendo a <b>${esc(T.raiz.de)}</b>: ${esc(T.raiz.texto.slice(0, 90))}</span><button class="icon-btn" data-semresp title="Não responder: abrir conversa nova">${IC.erro}</button></div>` : ''}
    ${T.modo === 'texto' ? formTexto(d) : formCartao()}
    <div class="bmt-erro" id="bmtErro"${T.erroEnvio ? '' : ' hidden'}>${esc(T.erroEnvio)}</div>
    <div class="bmt-pe">
      <span class="bmt-dica">${semGraph ? 'Este destino pede a conta Microsoft.' : d && d.tipo === 'webhook' ? 'Vai pelo webhook, em nome do fluxo.' : d ? 'Vai em seu nome.' : ''}</span>
      ${semGraph ? '<button class="chip primary" data-entrar>Entrar</button>' : `<button class="chip primary" id="bmtEnviar" title="Ctrl+Enter">${IC.enviar}<span>${T.raiz ? 'Responder' : 'Enviar'}</span></button>`}
    </div>`;
  pintarAviso();
  if (T.modo === 'cartao') previa();
}
function formTexto(d) {
  const web = !d || d.tipo === 'webhook', canal = d && d.tipo === 'canal';
  return `${web ? `<label class="bmt-campo"><span>Título</span><input data-k="titulo" value="${esc(T.titulo)}" placeholder="Opcional"></label>` : canal && !T.raiz ? `<label class="bmt-campo"><span>Assunto</span><input data-k="assunto" value="${esc(T.assunto)}" placeholder="Opcional"></label>` : ''}
    <label class="bmt-campo"><span>Mensagem</span><textarea data-k="texto" rows="5" placeholder="${web ? 'O que avisar?' : '**negrito**, `código` e @ana@empresa.com para mencionar'}">${esc(T.texto)}</textarea></label>
    <div class="bmt-linha">
      <label class="bmt-campo bmt-cresce"><span>Mencionar</span><input data-k="mencionar" value="${esc(T.mencionar)}" placeholder="ana@empresa.com" spellcheck="false" autocomplete="off"></label>
      ${web ? '' : `<label class="bmt-campo"><span>Importância</span><select data-k="importancia"><option value="normal">Normal</option><option value="high"${T.importancia === 'high' ? ' selected' : ''}>Importante</option>${canal ? '' : `<option value="urgent"${T.importancia === 'urgent' ? ' selected' : ''}>Urgente</option>`}</select></label>`}
    </div>`;
}
function dadosModelo() {
  const m = T.modelos.find((x) => x.id === T.modelo) || T.modelos[0];
  if (!m) return { m: null, d: {} };
  if (!T.rascunho[m.id]) { const r = {}; for (const c of m.campos) r[c.nome] = c.tipo === 'pares' ? [] : c.padrao || ''; T.rascunho[m.id] = r; }
  return { m, d: T.rascunho[m.id] };
}
function formCartao() {
  const { m, d } = dadosModelo();
  if (!m) return '';
  const campo = (c) => {
    const v = d[c.nome];
    const rot = `<span>${esc(c.rotulo)}${c.obrigatorio ? '<i class="bmt-ob" title="Obrigatório">*</i>' : ''}</span>`;
    if (c.tipo === 'select') return `<label class="bmt-campo">${rot}<select data-c="${c.nome}">${c.opcoes.map((o) => { const val = typeof o === 'string' ? o : o.value, lab = typeof o === 'string' ? o : o.label; return `<option value="${esc(val)}"${val === v ? ' selected' : ''}>${esc(lab)}</option>`; }).join('')}</select></label>`;
    if (c.tipo === 'area') return `<label class="bmt-campo bmt-largo">${rot}<textarea data-c="${c.nome}" rows="3">${esc(v)}</textarea></label>`;
    if (c.tipo === 'pares') return `<div class="bmt-campo bmt-largo">${rot}<div class="bmt-pares" data-pares="${c.nome}">${(v || []).map((p, i) => `<div class="bmt-par"><input data-p="${i}" data-q="0" value="${esc(p[0] || '')}" placeholder="${esc(c.colunas[0])}"><input data-p="${i}" data-q="1" value="${esc(p[1] || '')}" placeholder="${esc(c.colunas[1])}"><button class="icon-btn" data-tirar="${i}" title="Tirar">${IC.erro}</button></div>`).join('')}<button class="chip bmt-add" data-add="${c.nome}">${IC.mais}${esc(c.adicionar)}</button></div></div>`;
    return `<label class="bmt-campo${c.obrigatorio || c.tipo === 'link' ? ' bmt-largo' : ''}"${c.ajuda ? ` title="${esc(c.ajuda)}"` : ''}>${rot}<input data-c="${c.nome}" value="${esc(v)}" placeholder="${esc(c.tipo === 'link' ? 'https://…' : c.exemplo || '')}"${c.tipo === 'numero' ? ' inputmode="numeric"' : ''}${c.tipo === 'link' ? ' spellcheck="false"' : ''}></label>`;
  };
  return `<div class="bmt-cartao-ed">
    <div class="bmt-form">
      <label class="bmt-campo bmt-largo"><span>Modelo</span><select id="bmtModelo">${T.modelos.map((x) => `<option value="${x.id}"${x.id === m.id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
      ${m.campos.map(campo).join('')}
      <label class="bmt-campo bmt-largo"><span>Mencionar</span><input data-k="mencionar" value="${esc(T.mencionar)}" placeholder="ana@empresa.com" spellcheck="false" autocomplete="off"></label>
    </div>
    <div class="bmt-previa"><div class="bmt-previa-t">Prévia</div><div class="bmt-msg-falsa"><span class="bmt-avatar">${ICON}</span><div class="bmt-msg-c"><div class="bmt-msg-h"><b id="bmtPvQuem"></b><span>agora</span></div><div class="bmt-ac" id="bmtPrevia"></div></div></div></div>
  </div>`;
}
function pintarAssistente() {
  const g = T.est.graph;
  R.comp.innerHTML = `<div class="bmt-ola"><h3>Três formas de ligar o Teams</h3><p>Comece pela mais fácil. O plugin funciona com a que você tiver.</p></div>
    <ol class="bmt-etapas">
      <li class="feito"><span class="bmt-n">${IC.ok}</span><div><b>Links diretos</b><p>Já funciona, sem login: abra chat, chamada ou reunião pelo bloco <i>Abrir no Teams</i>.</p></div></li>
      <li><span class="bmt-n">2</span><div><b>Webhook de um canal</b><p>Sem login e sem TI. Você cria um fluxo nos Workflows do Teams e cola a URL aqui. Envia texto e cartões.</p><button class="chip primary" data-novo="webhook">Adicionar webhook</button></div></li>
      <li><span class="bmt-n">3</span><div><b>Conta Microsoft</b><p>Envia em seu nome, lê mensagens, muda a presença e cria reunião. Pede um app registrado no Entra (o README mostra como).</p><button class="chip" data-conta>${g.situacao === 'sem-app' ? 'Configurar' : 'Entrar'}</button></div></li>
    </ol>`;
}
function escolherDestino(apelido) {
  T.destino = apelido; T.raiz = null; T.erroEnvio = '';
  guardarTela(); pintarLado(); if (R.tela) { pintarComp(); if (T.aba === 'mensagens') carregarMensagens(); else pintarFeed(); }
}
function cliqueComp(e) {
  const q = (s) => e.target.closest(s);
  if (q('[data-novo]')) return dlgWebhook();
  if (q('[data-conta]')) return T.est.graph.situacao === 'sem-app' ? dlgApp() : entrar();
  if (q('[data-entrar]')) return T.est.graph.situacao === 'sem-app' ? dlgApp() : entrar();
  if (q('#bmtEnviar')) return enviar();
  if (q('[data-semresp]')) { T.raiz = null; return pintarComp(); }
  const modo = q('#bmtModo button');
  if (modo) { T.modo = modo.dataset.m; T.erroEnvio = ''; guardarTela(); return pintarComp(); }
  const add = q('[data-add]');
  if (add) { const { d } = dadosModelo(); d[add.dataset.add].push(['', '']); pintarComp(); const ins = R.comp.querySelectorAll(`[data-pares="${add.dataset.add}"] .bmt-par input[data-q="0"]`); if (ins.length) ins[ins.length - 1].focus(); return; }
  const tirar = q('[data-tirar]');
  if (tirar) { const { d } = dadosModelo(); d[tirar.closest('[data-pares]').dataset.pares].splice(Number(tirar.dataset.tirar), 1); pintarComp(); }
}
function digitouComp(e) {
  const el = e.target;
  if (el.dataset.k) { T[el.dataset.k] = el.value; if (el.dataset.k === 'mencionar' && T.modo === 'cartao') previaDepois(); return; }
  const { d } = dadosModelo();
  if (el.dataset.c) { d[el.dataset.c] = el.value; previaDepois(); return; }
  if (el.dataset.p !== undefined) { const nome = el.closest('[data-pares]').dataset.pares; d[nome][Number(el.dataset.p)][Number(el.dataset.q)] = el.value; previaDepois(); }
}
function mudouComp(e) {
  const el = e.target;
  if (el.id === 'bmtPara') { if (el.value === '@novo') { el.value = T.destino; return bs.showMenu({ preventDefault() {}, stopPropagation() {}, clientX: el.getBoundingClientRect().left, clientY: el.getBoundingClientRect().bottom + 4 }, [{ label: 'Webhook…', icon: IC.gancho, action: () => dlgWebhook() }, { label: 'Canal ou chat…', icon: IC.canal, action: dlgCanal }]); } return escolherDestino(el.value); }
  if (el.id === 'bmtModelo') { T.modelo = el.value; guardarTela(); return pintarComp(); }
  if (el.id === 'bmtPessoas' && T.aba === 'mensagens') carregarMensagens();
}
let previaT = 0, previaN = 0;
function previaDepois() { clearTimeout(previaT); previaT = setTimeout(previa, 220); }
async function previa() {
  const alvo = R.comp.querySelector('#bmtPrevia');
  if (!alvo) return;
  const quem = R.comp.querySelector('#bmtPvQuem'), d = destinoAtual();
  quem.textContent = d && d.tipo === 'webhook' ? 'Workflows' : (T.est.graph.conta && T.est.graph.conta.nome) || 'Você';
  const { m, d: dados } = dadosModelo(), n = ++previaN;
  try {
    const r = await chamar('previa', { modelo: m.id, dados, mencionar: T.mencionar });
    if (n !== previaN) return;
    alvo.innerHTML = desenhaCartao(r.cartao); alvo.classList.remove('falta');
  } catch (e) { if (n !== previaN) return; alvo.innerHTML = `<div class="bmt-ac-falta">${esc(e.message)}</div>`; alvo.classList.add('falta'); }
}
// Desenha o JSON do cartão (o mesmo que vai para o Teams) com os elementos que os modelos usam.
function desenhaCartao(c) {
  const md = (t) => esc(t).replace(/&lt;at&gt;(.*?)&lt;\/at&gt;/g, '<span class="bmt-ac-at">@$1</span>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|\n)- /g, '$1• ').replace(/\n/g, '<br>');
  const el = (x) => {
    if (x.type === 'Container') return `<div class="bmt-ac-box s-${esc(x.style || 'default')}">${(x.items || []).map(el).join('')}</div>`;
    if (x.type === 'ColumnSet') return `<div class="bmt-ac-cols">${(x.columns || []).map((k) => `<div class="bmt-ac-col${k.width === 'auto' ? ' auto' : ''}${k.verticalContentAlignment === 'Center' ? ' meio' : ''}">${(k.items || []).map(el).join('')}</div>`).join('')}</div>`;
    if (x.type === 'TextBlock') return `<div class="bmt-ac-t z-${esc((x.size || 'default').toLowerCase())}${x.weight === 'Bolder' ? ' forte' : ''}${x.isSubtle ? ' sutil' : ''}${x.color ? ' c-' + esc(x.color.toLowerCase()) : ''}${x.wrap === false ? ' semquebra' : ''}${x.horizontalAlignment === 'Center' ? ' centro' : ''}${x.spacing === 'None' ? ' junto' : ''}">${md(x.text)}</div>`;
    if (x.type === 'FactSet') return `<dl class="bmt-ac-fatos">${(x.facts || []).map((f) => `<dt>${esc(f.title)}</dt><dd>${esc(f.value)}</dd>`).join('')}</dl>`;
    return '';
  };
  return (c.body || []).map(el).join('') + ((c.actions || []).length ? `<div class="bmt-ac-acoes">${c.actions.map((a) => `<span class="bmt-ac-btn" title="${esc(a.url)}">${esc(a.title)}</span>`).join('')}</div>` : '');
}
async function enviar() {
  if (T.enviando || T.esperaAte > Date.now()) return;
  const d = destinoAtual(), erro = R.comp.querySelector('#bmtErro');
  if (!d) return;
  const corpo = { to: T.destino === '@pessoas' ? T.pessoas : d.apelido, mencionar: T.mencionar, raiz: T.raiz ? T.raiz.id : '' };
  if (T.modo === 'cartao') { const { m, d: dados } = dadosModelo(); Object.assign(corpo, { modelo: m.id, dados }); } else Object.assign(corpo, { texto: T.texto, titulo: d.tipo === 'webhook' ? T.titulo : '', assunto: T.assunto, importancia: T.importancia });
  T.enviando = true; T.erroEnvio = ''; erro.hidden = true; pintarAviso();
  try {
    const r = await chamar('enviar', corpo);
    toast(`Enviado para ${r.destino}`, 'ok');
    if (T.modo === 'texto') { T.texto = ''; T.titulo = ''; T.assunto = ''; }
    T.raiz = null; T.enviando = false;
    pintarComp();
    if (T.aba === 'mensagens') carregarMensagens();
  } catch (e) { T.enviando = false; if (codigo(e) !== 'limite') T.erroEnvio = e.message; falhou(e, erro); pintarAviso(); }
  carregarHistorico();
}

// ----- histórico e mensagens -----
function pintarFeed(carregando) {
  if (!R.feed || !T.est) return;
  const d = destinoAtual();
  const cab = `<div class="bmt-cab"><div class="seg bmt-seg" id="bmtAba"><button data-a="historico" class="${T.aba === 'historico' ? 'on' : ''}">Enviadas</button><button data-a="mensagens" class="${T.aba === 'mensagens' ? 'on' : ''}">No destino</button></div><span class="bmt-esp"></span>${T.aba === 'historico' && T.hist.length ? '<button class="chip" data-limpar>Limpar</button>' : ''}${T.aba === 'mensagens' && T.msgs ? `<button class="icon-btn" data-recarregar title="Atualizar">${IC.atualizar}</button>` : ''}</div>`;
  let corpo;
  if (T.aba === 'historico') {
    corpo = T.hist.length ? `<div class="bmt-lista">${T.hist.map((h) => `<div class="bmt-item${h.ok ? '' : ' ruim'}"><span class="bmt-sinal">${h.ok ? IC.ok : IC.erro}</span><div class="bmt-item-c"><div class="bmt-item-h"><b>${esc(h.destino)}</b><span class="bmt-tag">${esc(h.forma)}</span>${h.via === 'automator' ? '<span class="bmt-tag">Automator</span>' : ''}<span class="bmt-quando">${faz(h.quando)}</span></div><div class="bmt-item-t">${esc(h.resumo || '')}</div>${h.ok ? '' : `<div class="bmt-item-e">${esc(h.erro || '')}</div>`}</div>${h.link ? `<button class="icon-btn" data-link="${esc(h.link)}" title="Abrir no Teams">${IC.fora}</button>` : ''}</div>`).join('')}</div>` : '<div class="empty">O que este PC enviar para o Teams aparece aqui.</div>';
  } else if (!d) corpo = '<div class="empty">Escolha um destino.</div>';
  else if (d.tipo === 'webhook') corpo = '<div class="empty">Webhook só envia. Escolha um canal ou chat para ler.</div>';
  else if (!graphOk()) corpo = '<div class="empty">Ler mensagens pede a conta Microsoft.</div>';
  else if (T.destino === '@pessoas' && !T.pessoas.trim()) corpo = '<div class="empty">Informe os e-mails para ver a conversa.</div>';
  else if (T.msgsErro) corpo = `<div class="empty bmt-vazio-erro"><b>${T.msgsErro.data && T.msgsErro.data.falta && T.msgsErro.data.falta.length ? 'Falta a permissão ' + esc(T.msgsErro.data.falta[0]) : 'Não deu para ler'}</b><span>${esc(T.msgsErro.message)}</span>${T.msgsErro.data && T.msgsErro.data.falta && T.msgsErro.data.falta.length ? '<button class="chip" data-cfg>Configurações…</button>' : '<button class="chip" data-recarregar>Tentar de novo</button>'}</div>`;
  else if (carregando || !T.msgs) corpo = '<div class="empty">Lendo…</div>';
  else corpo = T.msgs.length ? `<div class="bmt-lista">${T.msgs.map((m, i) => `<div class="bmt-item"><span class="bmt-avatar p">${esc((m.de || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase())}</span><div class="bmt-item-c"><div class="bmt-item-h"><b>${esc(m.de)}</b>${m.importancia !== 'normal' ? `<span class="bmt-tag ruim">${m.importancia === 'urgent' ? 'Urgente' : 'Importante'}</span>` : ''}<span class="bmt-quando" title="${esc(new Date(m.quando).toLocaleString('pt-BR'))}">${faz(Date.parse(m.quando))}</span></div>${m.assunto ? `<div class="bmt-item-a">${esc(m.assunto)}</div>` : ''}<div class="bmt-item-t solto">${esc(m.texto)}</div></div>${d.tipo === 'canal' ? `<button class="icon-btn" data-resp="${i}" title="Responder nesta conversa">${IC.responder}</button>` : ''}${m.link ? `<button class="icon-btn" data-link="${esc(m.link)}" title="Abrir no Teams">${IC.fora}</button>` : ''}</div>`).join('')}</div>` : '<div class="empty">Nenhuma mensagem ainda.</div>';
  R.feed.innerHTML = cab + corpo;
}
function cliqueFeed(e) {
  const q = (s) => e.target.closest(s);
  const aba = q('#bmtAba button');
  if (aba) { T.aba = aba.dataset.a; guardarTela(); if (T.aba === 'mensagens') carregarMensagens(); else { pintarFeed(); carregarHistorico(); } return; }
  if (q('[data-recarregar]')) return carregarMensagens();
  if (q('[data-cfg]')) return plugin.settings.open();
  if (q('[data-limpar]')) return dialog('bmtLimpa', `<div class="dlg-hd"><span class="dlg-ic del">${IC.erro}</span><div><h3>Limpar o histórico?</h3><p>Some só desta lista. As mensagens continuam no Teams.</p></div></div><div class="actions"><button class="chip" data-close>Cancelar</button><button class="chip primary danger" id="bmtLimpaOk">Limpar</button></div>`, (el) => { el.querySelector('#bmtLimpaOk').onclick = async () => { await chamar('historico', { acao: 'limpar' }); fecha(el); carregarHistorico(); }; });
  const link = q('[data-link]');
  if (link) return abrir({ tipo: 'link', to: link.dataset.link });
  const resp = q('[data-resp]');
  if (resp && T.msgs) { const m = T.msgs[Number(resp.dataset.resp)]; T.raiz = { id: m.respostaDe || m.id, de: m.de, texto: m.texto }; T.modo = 'texto'; pintarComp(); const ta = R.comp.querySelector('textarea'); if (ta) ta.focus(); }
}

// ----- meu status -----
function pintarStatus() {
  if (!R.status || !T.est) return;
  if (!graphOk()) { R.status.innerHTML = `<h4>Meu status</h4><div class="bmt-pede"><span>Com a conta Microsoft você vê e muda a presença daqui.</span><button class="chip" data-entrar>${T.est.graph.situacao === 'sem-app' ? 'Configurar' : 'Entrar'}</button></div>`; return; }
  if (falta('Presence.ReadWrite') && falta('Presence.Read')) { R.status.innerHTML = '<h4>Meu status</h4><div class="bmt-pede"><span>Faltam as permissões Presence.Read e Presence.ReadWrite.</span><button class="chip" data-perm>Ver</button></div>'; return; }
  const p = T.presenca;
  const ate = p && p.mensagemAte ? ` · até ${hora(p.mensagemAte)}` : '';
  R.status.innerHTML = `<h4>Meu status</h4>
    <div class="bmt-agora"><span class="bmt-pt g ${p ? COR_PRESENCA[p.disponibilidade] || 'cinza' : 'cinza'}"></span><div><b>${esc(p ? p.rotulo : T.presencaErro ? 'Sem leitura' : '…')}</b><span>${esc(p && p.mensagem ? p.mensagem + ate : T.presencaErro || 'Sem mensagem de status')}</span></div></div>
    <div class="bmt-atalhos">${ATALHOS.map((a) => `<button class="chip bmt-atalho" data-atalho="${a.id}">${esc(a.rotulo)}</button>`).join('')}</div>
    <div class="bmt-pres">${PRESENCAS.map(([v, r, cor]) => `<button class="bmt-pb${p && (p.disponibilidade === v) ? ' on' : ''}" data-pres="${v}"><span class="bmt-pt ${cor}"></span>${esc(r)}</button>`).join('')}</div>
    <label class="bmt-campo"><span>Por</span><select id="bmtStDur">${[[30, '30 minutos'], [60, '1 hora'], [120, '2 horas'], [240, '4 horas'], [480, '8 horas']].map(([v, r]) => `<option value="${v}"${v === T.duracao ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
    <div class="bmt-linha bmt-fim"><label class="bmt-campo bmt-cresce"><span>Mensagem de status</span><input id="bmtStMsg" maxlength="280" placeholder="Em incidente, respondo depois." value=""></label><button class="chip" data-stmsg>Definir</button></div>
    ${p && p.mensagem ? '<button class="chip bmt-solto" data-stlimpa>Apagar a mensagem</button>' : ''}`;
  R.status.querySelector('#bmtStDur').onchange = (e) => { T.duracao = Number(e.target.value); guardarTela(); };
}
async function mudarStatus(corpo, aviso) {
  try { const r = await chamar('presenca', corpo); if (r.presenca) T.presenca = r.presenca; toast(aviso, 'ok'); } catch (e) { falhou(e); }
  pintarStatus();
}
const definirMensagem = () => { const v = R.status.querySelector('#bmtStMsg').value.trim(); if (!v) return toast('Escreva a mensagem de status'); mudarStatus({ mensagem: v, minutosMensagem: T.duracao }, 'Mensagem de status definida'); };
function cliqueStatus(e) {
  const q = (s) => e.target.closest(s);
  if (q('[data-entrar]')) return T.est.graph.situacao === 'sem-app' ? dlgApp() : entrar();
  if (q('[data-perm]')) return dlgPermissoes();
  const a = q('[data-atalho]');
  if (a) { const x = ATALHOS.find((y) => y.id === a.dataset.atalho); return mudarStatus({ disponibilidade: x.disponibilidade, minutos: x.minutos, mensagem: x.mensagem, minutosMensagem: x.minutos }, x.rotulo.replace(' · ', ' por ')); }
  const pr = q('[data-pres]');
  if (pr) { const v = pr.dataset.pres; return mudarStatus({ disponibilidade: v, minutos: T.duracao }, v === 'auto' ? 'Presença automática' : `${PRESENCAS.find((x) => x[0] === v)[1]} por ${T.duracao >= 60 ? T.duracao / 60 + ' h' : T.duracao + ' min'}`); }
  if (q('[data-stmsg]')) return definirMensagem();
  if (q('[data-stlimpa]')) return mudarStatus({ mensagem: '' }, 'Mensagem de status apagada');
}

// ----- reuniões -----
function pintarReunioes() {
  if (!R.reun || !T.est) return;
  if (!graphOk()) { R.reun.innerHTML = '<h4>Reuniões de hoje</h4><div class="bmt-pede"><span>Com a conta Microsoft você vê a agenda e cria a war room com um clique.</span></div>'; return; }
  const l = T.agenda;
  const em = (m) => (m <= 0 ? 'agora' : m < 60 ? `em ${m} min` : `em ${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`);
  R.reun.innerHTML = `<div class="bmt-cab"><h4>Reuniões de hoje</h4><span class="bmt-esp"></span><button class="chip" data-warroom title="Cria uma reunião agora e copia o link">${IC.video}<span>War room</span></button></div>
    ${T.agendaErro ? `<div class="bmt-pede"><span>${esc(T.agendaErro)}</span></div>` : !l ? '<div class="bmt-pede"><span>Lendo a agenda…</span></div>' : l.length ? `<div class="bmt-reunioes">${l.slice(0, 6).map((r) => `<div class="bmt-reuniao${r.emMinutos <= 5 && r.online ? ' ja' : ''}"><span class="bmt-hora">${r.diaInteiro ? 'dia' : hora(r.inicio)}</span><div><b title="${esc(r.assunto)}">${esc(r.assunto)}</b><span>${esc(em(r.emMinutos))}${r.organizador ? ' · ' + esc(r.organizador) : ''}</span></div>${r.link ? `<button class="chip" data-entrarreun="${esc(r.link)}">Entrar</button>` : ''}</div>`).join('')}</div>${l.length > 6 ? `<div class="bmt-mais-n">e mais ${l.length - 6}</div>` : ''}` : '<div class="bmt-pede"><span>Nada mais na agenda hoje.</span></div>'}`;
}
function cliqueReun(e) {
  const r = e.target.closest('[data-entrarreun]');
  if (r) return abrir({ tipo: 'link', to: r.dataset.entrarreun });
  if (e.target.closest('[data-warroom]')) dlgWarRoom();
}
function dlgWarRoom(assunto) {
  const d = destinoAtual(), pode = d && T.destino !== '@pessoas';
  dialog('bmtWar', `<div class="dlg-hd"><span class="dlg-ic">${IC.video}</span><div><h3>War room agora</h3><p>Cria a reunião e copia o link para entrar.</p></div></div>
    <label class="fld">Assunto<input id="bmtWarAss" maxlength="120" value="${esc(assunto || 'War room')}"></label>
    <label class="fld">Duração<select id="bmtWarDur"><option value="30">30 minutos</option><option value="60" selected>1 hora</option><option value="120">2 horas</option></select></label>
    ${pode ? `<label class="chk"><input type="checkbox" id="bmtWarPost" checked>Avisar em <b>${esc(d.apelido)}</b> com o link</label>` : ''}
    <div class="err" id="bmtWarErr"></div>
    <div class="actions"><button class="chip" data-close>Cancelar</button><button class="chip primary" id="bmtWarOk">Criar</button></div>`, (el) => {
    const ass = el.querySelector('#bmtWarAss'); ass.focus(); ass.select();
    const criar = async () => {
      const b = el.querySelector('#bmtWarOk'); b.disabled = true;
      try {
        const r = (await chamar('reuniao', { assunto: ass.value, minutos: Number(el.querySelector('#bmtWarDur').value), modo: 'link' })).reuniao;
        await copiar(r.link);
        const post = el.querySelector('#bmtWarPost');
        if (post && post.checked) { try { await chamar('enviar', d.tipo === 'webhook' ? { to: d.apelido, modelo: 'livre', dados: { titulo: r.assunto, cor: 'attention', texto: 'A war room está aberta.', botoes: [['Entrar na war room', r.link]] } } : { to: d.apelido, texto: `**${r.assunto}**: a war room está aberta.\n${r.link}` }); } catch (e2) { toast('Reunião criada, mas o aviso falhou: ' + e2.message, 'err'); } carregarHistorico(); }
        fecha(el); toast('War room criada. Link copiado.', 'ok'); carregarAgenda();
      } catch (e) { b.disabled = false; el.querySelector('#bmtWarErr').textContent = e.message; if (codigo(e) === 'limite') falhou(e); }
    };
    el.querySelector('#bmtWarOk').onclick = criar;
    ass.onkeydown = (e) => { if (e.key === 'Enter') criar(); };
  });
}

// ----- abrir no Teams (links diretos) -----
let gente = '';
function pintarAbrir() {
  if (!R.abrir) return;
  R.abrir.innerHTML = `<h4>Abrir no Teams</h4>
    <label class="bmt-campo"><span>Pessoas (e-mails)</span><input id="bmtGente" value="${esc(gente)}" placeholder="ana@empresa.com, joao@empresa.com" spellcheck="false" autocomplete="off"></label>
    <div class="bmt-quatro"><button class="chip" data-ab="chat">${IC.chat}<span>Chat</span></button><button class="chip" data-ab="chamada">${IC.telefone}<span>Ligar</span></button><button class="chip" data-ab="video">${IC.video}<span>Vídeo</span></button><button class="chip" data-ab="agendar">${IC.agenda}<span>Agendar</span></button></div>
    <div class="bmt-dica">Não precisa de login: abre o ${T.est && T.est.abrir === 'web' ? 'Teams no navegador' : 'aplicativo do Teams'}.</div>`;
  R.abrir.querySelector('#bmtGente').oninput = (e) => { gente = e.target.value; };
}
async function abrir(corpo) {
  try { const r = await chamar('abrir', corpo); return r; } catch (e) { toast(e.message, 'err'); return null; }
}
function cliqueAbrir(e) {
  const b = e.target.closest('[data-ab]');
  if (!b) return;
  if (b.dataset.ab !== 'agendar' && !gente.trim()) { R.abrir.querySelector('#bmtGente').focus(); return toast('Informe o e-mail de pelo menos uma pessoa'); }
  abrir({ tipo: b.dataset.ab, pessoas: gente }).then((r) => { if (r) toast('Abrindo o Teams…'); });
}

// ---------- o que vem de fora da tela ----------
function escrever({ texto, modo, modelo }) {
  bs.pages.open('bluemsteams');
  if (texto !== undefined) T.texto = texto;
  if (modo) T.modo = modo;
  if (modelo) T.modelo = modelo;
  T.erroEnvio = '';
  if (R.tela && T.est) { pintarComp(); const alvo = R.comp.querySelector(T.modo === 'cartao' ? '.bmt-form input[data-c]' : 'textarea'); if (alvo) alvo.focus(); if (nadaConfigurado()) toast('Adicione um webhook ou conecte a conta para enviar'); }
}
async function enviarArquivo(rel) {
  try {
    const f = await bs.api('file', { project: bs.S.project.path, file: rel });
    const linhas = String(f.content || '').split('\n');
    let trecho = linhas.slice(0, 40).join('\n');
    if (trecho.length > 3000) trecho = trecho.slice(0, 3000);
    escrever({ texto: `**${rel.split('/').pop()}**\n${trecho}${linhas.length > 40 || trecho.length >= 3000 ? '\n…' : ''}`, modo: 'texto' });
  } catch (e) { toast('Não deu para ler o arquivo: ' + e.message, 'err'); }
}
function enviarSelecao() {
  const ed = bs.editor;
  const sel = ed && ed.getModel() ? ed.getModel().getValueInRange(ed.getSelection()) : '';
  if (!sel.trim()) return toast('Selecione um trecho no editor');
  const aba = bs.S.active;
  escrever({ texto: `${aba && aba.path ? '**' + String(aba.path).split(/[\\/]/).pop() + '**\n' : ''}${sel.slice(0, 3000)}${sel.length > 3000 ? '\n…' : ''}`, modo: 'texto' });
}

// (o painel antes da tela: ao reabrir a aba num recarregamento, o núcleo já acha o painel dela)
bs.tools.register({ id: 'bluemsteams', title: 'Teams', icon: ICON, order: 71, page: 'bluemsteams', render() { pintarLado(); bs.$('#toolBody').replaceChildren(R.lado); if (!T.est) carregar(12); } });
bs.pages.register({ id: 'bluemsteams', title: 'Teams', icon: ICON, pinned: true, render: montar, show() { carregar(T.est ? 1 : 12); if (T.aba === 'mensagens') carregarMensagens(); }, hide() {} });
bs.actions.add([
  { label: 'Teams: abrir', icon: ICON, run: () => bs.pages.open('bluemsteams') },
  { label: 'Teams: escrever mensagem…', icon: ICON, run: () => escrever({ modo: 'texto' }) },
  { label: 'Teams: alerta de incidente…', icon: ICON, run: () => escrever({ modo: 'cartao', modelo: 'incidente' }) },
  { label: 'Teams: resultado de testes…', icon: ICON, run: () => escrever({ modo: 'cartao', modelo: 'testes' }) },
  { label: 'Teams: avisar deploy…', icon: ICON, run: () => escrever({ modo: 'cartao', modelo: 'deploy' }) },
  { label: 'Teams: enviar a seleção do editor…', icon: ICON, run: enviarSelecao },
  { label: 'Teams: em incidente por 1 h (presença)', icon: ICON, run: () => { const x = ATALHOS[0]; if (!graphOk()) return toast('Conecte a conta Microsoft no painel Teams'); mudarStatus({ disponibilidade: x.disponibilidade, minutos: x.minutos, mensagem: x.mensagem, minutosMensagem: x.minutos }, 'Em incidente por 1 h'); } },
  { label: 'Teams: presença automática', icon: ICON, run: () => { if (!graphOk()) return toast('Conecte a conta Microsoft no painel Teams'); mudarStatus({ disponibilidade: 'auto', mensagem: '' }, 'Presença automática'); } },
  { label: 'Teams: war room agora…', icon: ICON, run: () => { if (!graphOk()) return toast('Conecte a conta Microsoft no painel Teams'); dlgWarRoom(); } },
  { label: 'Teams: novo webhook…', icon: ICON, run: () => dlgWebhook() },
]);
bs.hooks.filter('menu:file', (items, ctx) => (ctx && !ctx.isDir ? [...items, '-', { label: 'Enviar para o Teams…', icon: ICON, action: () => enviarArquivo(ctx.rel) }] : items));
plugin.settings.onChange(() => carregar());
// a contagem da pausa, e a presença e a agenda em dia enquanto a tela está na frente
let voltas = 0;
timers.push(setInterval(() => {
  if (!R.tela || !R.tela.isConnected || !bs.pages.isActive('bluemsteams')) return;
  if (T.esperaAte) { if (T.esperaAte <= Date.now()) T.esperaAte = 0; pintarAviso(); }
  if (++voltas % 90 === 0 && graphOk() && !document.hidden) { carregarPresenca(); carregarAgenda(); }
}, 1000));
plugin.onUnload(() => { timers.forEach(clearInterval); clearInterval(loginTimer); clearTimeout(previaT); for (const id of ['bmtWebhook', 'bmtRen', 'bmtDel', 'bmtCanal', 'bmtApp', 'bmtPerm', 'bmtLogin', 'bmtLgErr', 'bmtLimpa', 'bmtWar']) { const el = document.getElementById(id); if (el) el.remove(); } });
