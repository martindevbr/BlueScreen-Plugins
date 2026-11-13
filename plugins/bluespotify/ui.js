// BlueSpotify: painel da esquerda (biblioteca) + aba fixa (listas, busca, fila e player) + mini player na barra de baixo.
// A página nunca guarda token: tudo passa pelo servidor do plugin (server.mjs). O único token que chega aqui é o de
// acesso, entregue ao Web Playback SDK quando ele pede (é exigência do SDK), e ele fica só na memória.
const { $, esc, toast } = bs;
const ID = 'bluespotify';
const ALT = 48; // altura de uma linha de faixa (px): a lista virtual depende dela
const PAG = 50; // itens por página da API
const BLOCO = 8; // a lista virtual redesenha de 8 em 8 linhas

const svg = (d, cls = '') => `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24">${d}</svg>`;
const IC = {
  app: svg('<circle cx="12" cy="12" r="9"/><path d="M7.6 9.7c3.1-1 6.5-.7 9.1.9M8.3 12.7c2.5-.8 5.1-.5 7.2.8M9.1 15.5c1.8-.5 3.6-.3 5.1.6"/>'),
  play: svg('<path d="M8 5.2v13.6L19.5 12z"/>', 'bsp-f'),
  pause: svg('<path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/>', 'bsp-f'),
  next: svg('<path d="M6 5.5v13l9.5-6.5z"/><path d="M18 5v14" style="fill:none;stroke:currentColor;stroke-width:2.2"/>', 'bsp-f'),
  prev: svg('<path d="M18 5.5v13L8.5 12z"/><path d="M6 5v14" style="fill:none;stroke:currentColor;stroke-width:2.2"/>', 'bsp-f'),
  shuffle: svg('<path d="M3 7h3.2c1.9 0 3.2.9 4.3 2.6l2.6 4c1.1 1.7 2.4 2.6 4.3 2.6H21M18 13.2l3 3-3 3M3 17.2h3.2c1.3 0 2.3-.4 3.1-1.2M21 7.8h-3.6c-1.3 0-2.3.4-3.1 1.2M18 4.8l3 3-3 3"/>'),
  repeat: svg('<path d="M17 2.5l3 3-3 3M4 11V9.500a4 4 0 0 1 4-4h12M7 21.500l-3-3 3-3M20 13v1.500a4 4 0 0 1-4 4H4"/>'),
  repeat1: svg('<path d="M17 2.5l3 3-3 3M4 11V9.500a4 4 0 0 1 4-4h12M7 21.500l-3-3 3-3M20 13v1.500a4 4 0 0 1-4 4H4M11.300 10.400l1.200-.8v4.900"/>'),
  heart: svg('<path d="M12 20s-7-4.300-9-8.600C1.600 8.300 3.300 5 6.600 5c2 0 3.500 1 4.500 2.600.400.600 1.400.600 1.800 0C13.900 6 15.400 5 17.400 5c3.300 0 5 3.300 3.600 6.400C19 15.700 12 20 12 20z"/>'),
  device: svg('<rect x="2.500" y="4.500" width="13" height="9" rx="1.500"/><path d="M6 17.500h6M9 13.500v4"/><rect x="18" y="8" width="3.500" height="11.500" rx="1"/>'),
  queue: svg('<path d="M4 6h13M4 11h13M4 16h7"/><path d="M15.500 14.500v5.500l4.700-2.750z" style="fill:currentColor;stroke-width:1"/>'),
  vol: svg('<path d="M4 9.500h3l4-3.500v12l-4-3.500H4zM15 9.200a4 4 0 0 1 0 5.600M17.600 6.600a7.600 7.600 0 0 1 0 10.800"/>'),
  mute: svg('<path d="M4 9.500h3l4-3.500v12l-4-3.500H4zM15.500 9.500l5 5M20.500 9.500l-5 5"/>'),
  search: svg('<circle cx="11" cy="11" r="6.500"/><path d="M16 16l4.500 4.500"/>'),
  more: svg('<circle cx="5.500" cy="12" r="1.300"/><circle cx="12" cy="12" r="1.300"/><circle cx="18.500" cy="12" r="1.300"/>', 'bsp-f'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  ext: svg('<path d="M14 4h6v6M20 4l-9 9M18 13.500V19H5V6h5.500"/>'),
  refresh: svg('<path d="M20 11a8 8 0 0 0-14.500-4M4 4v3.500h3.500M4 13a8 8 0 0 0 14.500 4M20 20v-3.500h-3.500"/>'),
  user: svg('<circle cx="12" cy="8.500" r="3.500"/><path d="M5 19.500c.8-3.300 3.500-5 7-5s6.200 1.700 7 5"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>'),
  disc: svg('<circle cx="12" cy="12" r="8.500"/><circle cx="12" cy="12" r="2.500"/>'),
  mic: svg('<rect x="9" y="3.500" width="6" height="10" rx="3"/><path d="M6 11.500a6 6 0 0 0 12 0M12 17.500v3"/>'),
  note: svg('<path d="M9 17.500V5.500l10-2v12"/><circle cx="6.500" cy="17.500" r="2.500"/><circle cx="16.500" cy="15.500" r="2.500"/>'),
  list: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  copy: svg('<rect x="8.500" y="8.500" width="11" height="11" rx="2"/><path d="M5 15.500V6a1.500 1.500 0 0 1 1.500-1.500H15"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.500M12 18.500V21M3 12h2.500M18.500 12H21M5.600 5.600l1.800 1.800M16.600 16.600l1.800 1.800M5.600 18.400l1.800-1.800M16.600 7.400l1.800-1.800"/>'),
  out: svg('<path d="M10 4.500H5.500v15H10M14.500 8l4 4-4 4M18.500 12H9"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  phone: svg('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 17.500h2"/>'),
  speaker: svg('<rect x="6" y="3" width="12" height="18" rx="2"/><circle cx="12" cy="14" r="3"/><path d="M12 7h.01"/>'),
};
const FIXOS = [['curtidas', 'Curtidas', IC.heart], ['recentes', 'Tocadas recentemente', IC.clock], ['albuns', 'Álbuns', IC.disc], ['artistas', 'Artistas', IC.mic]];

const R = {}; // elementos
const E = {
  est: null, erroServidor: '', cfg: { local: true, mini: true }, vista: null, hist: [], cache: new Map(),
  bib: { itens: [], total: 0, carregando: false, feito: false, erro: '' }, filtro: '', aviso: null, esperandoLogin: false, urlLogin: '',
};
const P = { s: { ativo: false }, fonte: '', curtida: null, curtidaDe: '', arrastando: false, volTimer: 0, pedido: 0 };
const T = { sinc: 0, prog: 0, busca: 0, login: 0, aviso: 0 };
let morto = false, montada = false;

// ---------- utilidades ----------
const tempo = (ms) => { const s = Math.max(0, Math.round((ms || 0) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s % 60).padStart(2, '0'); };
const plural = (n, um, varios) => `${Number(n || 0).toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
const nomes = (l) => (l || []).map((a) => a.nome).filter(Boolean).join(', ');
const capaHtml = (url, cls = '', icone = IC.note) => `<span class="bsp-capa ${cls}">${icone}${url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async" draggable="false">` : ''}</span>`;
const MINI = 'bluespotify-mini';
const miniAberto = () => !!(bs.bubble.isOpen && bs.bubble.isOpen(MINI) && R.mini && R.mini.isConnected && R.mini.offsetParent);
const naTela = () => !morto && document.visibilityState === 'visible' && (bs.pages.isActive(ID) || miniAberto());
const eFaixa = (o) => o && (o.tipo === 'faixa' || o.tipo === 'episodio');

class Erro extends Error { constructor(codigo, msg, esperar) { super(msg); this.codigo = codigo; this.esperar = esperar; } }

async function chamar(rota, query, corpo) {
  let j;
  try {
    j = await bs.api(ID + '/' + rota, query || {}, corpo === undefined ? { quiet: true } : { quiet: true, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  } catch (e) {
    throw new Erro('servidor', e && e.status === 404 ? 'O servidor do BlueSpotify não está rodando. Ele precisa do Node.js 18 ou mais novo: instale e religue o plugin na aba Plugins.' : (e && e.message) || 'O BlueSpotify não respondeu.');
  }
  if (j && j.ok) { if (E.aviso && E.aviso.codigo === 'offline') avisar(null); return j; }
  const e = new Erro((j && j.codigo) || 'interno', (j && j.erro) || 'Falhou: ' + rota, j && j.esperar);
  if (e.codigo === 'deslogado' || e.codigo === 'sem-client-id') { if (E.est && E.est.logado) { E.est.logado = false; atualizarEstado(); } }
  else if (e.codigo === 'limite') avisar({ codigo: 'limite', ate: Date.now() + (e.esperar || 5) * 1000 });
  else if (e.codigo === 'offline') avisar({ codigo: 'offline', texto: e.message });
  else if (e.codigo === 'premium') marcarSemPremium();
  throw e;
}
// erros que já viraram faixa de aviso ou tela não precisam de um toast por cima
const silencioso = (e) => ['limite', 'offline', 'deslogado', 'sem-client-id', 'premium'].includes(e && e.codigo);
const falhou = (e) => { if (!silencioso(e)) toast((e && e.message) || String(e), 'err', 'bsp'); };
const copiar = (texto, msg) => { (bs.copyText ? Promise.resolve(bs.copyText(texto)) : navigator.clipboard.writeText(texto)).then(() => toast(msg || 'Copiado.', 'ok', 'bsp')).catch(() => toast('Não deu para copiar.', 'err', 'bsp')); };
const abrirFora = (url) => window.open(url, '_blank', 'noopener');
const abrirNoApp = (uri) => chamar('abrir', {}, { uri }).catch(falhou);

// ---------- avisos (faixa no topo da tela) ----------
function avisar(a) {
  E.aviso = a; clearInterval(T.aviso); T.aviso = 0;
  if (a && a.codigo === 'limite') T.aviso = setInterval(() => { if (Date.now() >= a.ate) { avisar(null); sincronizar(); } else pintarAviso(); }, 1000);
  pintarAviso();
}
function pintarAviso() {
  if (!R.aviso) return;
  const a = E.aviso;
  if (!a) { R.aviso.hidden = true; return; }
  let texto = a.texto || '', botoes = '';
  if (a.codigo === 'limite') texto = `O Spotify pediu uma pausa por excesso de pedidos. Volta em ${Math.max(1, Math.ceil((a.ate - Date.now()) / 1000))} s.`;
  if (a.codigo === 'offline') botoes = '<button class="chip" data-a="de-novo">Tentar de novo</button>';
  if (a.codigo === 'premium') { texto = 'Esta conta não é Premium: o Spotify não deixa tocar nem controlar por aqui. Dá para navegar e abrir no aplicativo.'; botoes = '<button class="icon-btn" data-a="fechar-aviso" title="Fechar">' + IC.x + '</button>'; }
  R.aviso.className = 'bsp-aviso ' + a.codigo;
  R.aviso.innerHTML = `<span>${esc(texto)}</span>${botoes}`;
  R.aviso.hidden = false;
}
function marcarSemPremium() {
  if (E.est && E.est.premium !== false) { E.est.premium = false; avisar({ codigo: 'premium' }); pintarPlayer(); }
  Local.desligar();
}

// ---------- estado da conta ----------
async function atualizarEstado() {
  try { E.est = (await chamar('estado')); E.erroServidor = ''; }
  catch (e) { E.est = null; E.erroServidor = e.message; }
  if (morto) return;
  if (E.est && E.est.aviso && E.est.aviso.codigo === 'offline') avisar({ codigo: 'offline', texto: E.est.aviso.erro });
  if (E.est && E.est.logado) {
    if (!E.vista) { E.vista = criarVista('recentes'); E.cache.set(E.vista.chave, E.vista); }
    if (!E.vista.pronto) carregarVista(E.vista);
    if (!E.bib.feito && !E.bib.carregando) carregarBiblioteca();
    if (E.cfg.local && E.est.premium !== false) Local.ligar();
    sincronizar();
  } else { Local.desligar(); aplicarEstado({ ativo: false }, ''); }
  desenhar(); pintarLado();
}

async function entrar() {
  try {
    const r = await chamar('entrar', {}, {});
    E.urlLogin = r.url; E.esperandoLogin = true; desenhar();
    clearInterval(T.login);
    const inicio = Date.now();
    T.login = setInterval(async () => {
      let est = null;
      try { est = await chamar('estado'); } catch { return; }
      if (est.logado || (est.login && est.login.erro) || Date.now() - inicio > 5 * 60000) {
        clearInterval(T.login); E.esperandoLogin = false;
        if (est.login && est.login.erro) toast(est.login.erro, 'err', 'bsp');
        if (est.logado) toast('Spotify conectado.', 'ok', 'bsp');
        atualizarEstado();
      }
    }, 1500);
  } catch (e) { toast(e.message, 'err', 'bsp'); }
}
function cancelarLogin() { clearInterval(T.login); E.esperandoLogin = false; desenhar(); }
function sair() {
  dialog('bspSair', `<div class="dlg-hd"><span class="dlg-ic">${IC.out}</span><div><h3>Sair da conta do Spotify?</h3><p>O BlueSpotify esquece a conexão neste PC. O Client ID continua guardado.</p></div></div>
    <div class="actions"><button class="chip" data-close>Cancelar</button><button class="chip primary" data-ok>Sair</button></div>`, (el) => {
    el.querySelector('[data-ok]').onclick = async () => {
      el.hidden = true;
      try { await chamar('sair', {}, {}); } catch (e) { falhou(e); }
      E.cache.clear(); E.hist = []; E.vista = null; E.bib = { itens: [], total: 0, carregando: false, feito: false, erro: '' }; avisar(null);
      atualizarEstado();
    };
  });
}

// ---------- tocar aqui: Web Playback SDK, isolado atrás deste objeto ----------
// O SDK só cria um dispositivo do Spotify Connect chamado "BlueScreen" dentro desta página. Os comandos seguem pela
// Web API (iguais aos de qualquer outro dispositivo); do SDK vêm os eventos de estado, que dispensam consultar a API.
// Exige Premium e um WebView com DRM (Widevine). Sem um dos dois, o resto do plugin continua pelo Spotify Connect.
const Local = {
  player: null, id: '', fase: 'desligado', msg: '', volume: 0.8, ativo: false,
  ligar() {
    if (this.fase !== 'desligado' || !E.est || !E.est.sdk) return;
    this.fase = 'carregando';
    const criar = () => { if (!morto && this.fase === 'carregando') this.criar(); };
    if (window.Spotify && window.Spotify.Player) return criar();
    window.onSpotifyWebPlaybackSDKReady = criar;
    if (!document.getElementById('bspSdk')) {
      const s = document.createElement('script'); s.id = 'bspSdk'; s.src = E.est.sdk; s.async = true;
      s.onerror = () => { s.remove(); this.fase = 'erro'; this.msg = 'Não deu para carregar o player do Spotify (sem internet?).'; };
      document.head.appendChild(s);
    }
  },
  criar() {
    let pl;
    try {
      pl = new window.Spotify.Player({ name: 'BlueScreen', volume: this.volume, getOAuthToken: (cb) => { chamar('token').then((r) => cb(r.token)).catch(() => cb('')); } });
    } catch (e) { this.fase = 'erro'; this.msg = 'O player do Spotify não iniciou: ' + e.message; return; }
    this.player = pl;
    pl.addListener('ready', ({ device_id }) => { this.id = device_id; this.fase = 'pronto'; this.msg = ''; if (R.disp) pintarPlayer(); });
    pl.addListener('not_ready', () => { this.id = ''; this.ativo = false; if (P.fonte === 'sdk') { P.fonte = ''; sincronizar(); } });
    pl.addListener('player_state_changed', (st) => {
      if (morto) return;
      if (!st || !st.track_window || !st.track_window.current_track) { this.ativo = false; if (P.fonte === 'sdk') { P.fonte = ''; sincronizar(); } return; }
      this.ativo = true;
      aplicarEstado(this.converter(st), 'sdk');
    });
    pl.addListener('initialization_error', ({ message }) => { this.fase = 'erro'; this.msg = 'Este PC não tem o DRM (Widevine) que o Spotify exige para tocar dentro do BlueScreen. Use o Spotify aberto no PC ou no celular como dispositivo.'; console.warn('BlueSpotify SDK:', message); this.soltar(); });
    pl.addListener('account_error', () => { this.fase = 'sem-premium'; this.soltar(); chamar('premium', {}, { valor: false }).catch(() => {}); marcarSemPremium(); });
    pl.addListener('authentication_error', ({ message }) => { console.warn('BlueSpotify SDK:', message); this.fase = 'erro'; this.msg = 'O Spotify recusou a conexão do player. Saia da conta e conecte de novo.'; this.soltar(); });
    pl.addListener('playback_error', ({ message }) => { toast('O Spotify não conseguiu tocar esta faixa aqui' + (message ? ': ' + message : '.'), 'err', 'bsp'); });
    pl.addListener('autoplay_failed', () => { toast('O navegador segurou o áudio: clique em tocar de novo.', '', 'bsp'); });
    Promise.resolve(pl.connect()).then((ok) => { if (ok === false && this.fase === 'carregando') { this.fase = 'erro'; this.msg = this.msg || 'O player do Spotify não conectou.'; } }).catch(() => {});
  },
  converter(st) {
    const t = st.track_window.current_track, id = (u) => String(u || '').split(':').pop();
    const im = (t.album && t.album.images) || [], menor = im.length ? im.reduce((a, b) => ((b.width || 999) < (a.width || 999) ? b : a)) : null;
    return {
      ativo: true, tocando: !st.paused, posMs: st.position || 0, em: Date.now(), aleatorio: !!st.shuffle, repetir: ['off', 'context', 'track'][st.repeat_mode] || 'off', contexto: (st.context && st.context.uri) || '',
      faixa: { id: t.id || id(t.uri), uri: t.uri, nome: t.name || '', ms: st.duration || t.duration_ms || 0, artistas: (t.artists || []).map((a) => ({ id: id(a.uri), nome: a.name })), album: t.album ? { id: id(t.album.uri), nome: t.album.name } : null,
        capa: menor ? menor.url : '', capaG: im[0] ? im[0].url : '', tocavel: true, tipo: t.type === 'episode' ? 'episodio' : 'faixa', link: t.id ? `https://open.spotify.com/track/${t.id}` : '' },
      dispositivo: { id: this.id, nome: 'BlueScreen', tipo: 'Computer', ativo: true, volume: Math.round(this.volume * 100), temVolume: true, local: true },
    };
  },
  // precisa rodar dentro de um clique: libera o áudio no navegador antes de o Spotify mandar tocar aqui
  ativar() { try { if (this.player && this.player.activateElement) this.player.activateElement(); } catch {} },
  soltar() { try { if (this.player) this.player.disconnect(); } catch {} this.player = null; this.id = ''; this.ativo = false; if (P.fonte === 'sdk') { P.fonte = ''; } },
  desligar() { if (this.fase === 'desligado') return; const sem = this.fase === 'sem-premium'; this.soltar(); this.fase = sem ? 'sem-premium' : 'desligado'; },
  get mandando() { return P.fonte === 'sdk' && this.ativo && !!this.player; },
};

// ---------- player: estado e sincronização ----------
function aplicarEstado(s, fonte) {
  const antes = P.s, uriAntes = antes.faixa && antes.faixa.uri;
  P.s = s; P.fonte = fonte;
  const uri = s.faixa && s.faixa.uri;
  if (uri !== uriAntes) {
    P.curtida = null; P.curtidaDe = uri || '';
    if (uri && eFaixa(s.faixa)) chamar('contem', {}, { uris: [uri] }).then((r) => { if (P.curtidaDe === uri) { P.curtida = !!r.contem[uri]; pintarPlayer(); } }).catch(() => {});
    marcarTocando();
    if (E.vista && E.vista.tipo === 'fila') carregarVista(E.vista);
  }
  pintarPlayer(); pintarMini(); pintarJanelinha(); agendar();
}
function marcarTocando() {
  if (!montada) return;
  const uri = P.s.faixa ? P.s.faixa.uri : '';
  R.view.querySelectorAll('.bsp-fx[data-u]').forEach((l) => l.classList.toggle('toc', l.dataset.u === uri));
}
const posicaoAgora = () => { const s = P.s; if (!s.faixa) return 0; return Math.min(s.faixa.ms || 0, (s.posMs || 0) + (s.tocando ? Date.now() - s.em : 0)); };

async function sincronizar() {
  if (morto || !E.est || !E.est.logado) return;
  if (Local.mandando) return agendar(); // o SDK já avisa cada mudança
  const pedido = ++P.pedido;
  try {
    const s = await chamar('player');
    if (pedido !== P.pedido || Local.mandando) return;
    aplicarEstado(s, 'api');
  } catch { agendar(); }
}
// Consulta espaçada: 5 s com a tela aberta e tocando, 12 s parado; com a tela fechada, 30 s (só para o mini player)
// e uma consulta logo depois do fim da faixa. Janela escondida ou SDK no comando: nenhuma.
function agendar() {
  clearTimeout(T.sinc); T.sinc = 0;
  clearInterval(T.prog); T.prog = 0;
  if (morto || !E.est || !E.est.logado || document.visibilityState !== 'visible') return;
  const visivel = naTela(), s = P.s;
  if (visivel && s.tocando) T.prog = setInterval(() => { pintarProgresso(); pintarJanelinha(true); }, 500);
  if (Local.mandando) return;
  if (E.aviso && E.aviso.codigo === 'limite') return;
  let ms = visivel ? (s.tocando ? 5000 : 12000) : (E.cfg.mini ? 30000 : 0);
  if (s.tocando && s.faixa) { const resta = s.faixa.ms - posicaoAgora() + 1200; if (resta > 0 && (!ms || resta < ms)) ms = Math.max(1500, resta); }
  if (ms) T.sinc = setTimeout(sincronizar, ms);
}
const depois = (ms = 450) => { clearTimeout(T.sinc); T.sinc = setTimeout(sincronizar, ms); };

async function comando(c, otimista) {
  if (otimista) { otimista(P.s); pintarPlayer(); pintarMini(); pintarJanelinha(); }
  try { await chamar('comando', {}, c); if (E.est && E.est.premium == null) E.est.premium = true; depois(); return true; }
  catch (e) {
    depois(200);
    if (e.codigo === 'sem-dispositivo') { dialogoDispositivos(c.acao === 'tocar' ? c : null); return false; }
    if (e.codigo === 'proibido' && c.acao === 'volume') { toast('Este dispositivo não deixa mudar o volume de fora.', '', 'bsp'); return false; }
    falhou(e); return false;
  }
}

// Sem Premium não há como tocar por aqui: o botão de tocar abre o item no aplicativo do Spotify.
const semPremium = () => !!E.est && E.est.premium === false;
async function tocar(o, uriParaApp) {
  if (semPremium()) { if (uriParaApp) abrirNoApp(uriParaApp); return; }
  Local.ativar();
  const c = { acao: 'tocar', ...o };
  if (!P.s.ativo && Local.id && !c.dispositivo) c.dispositivo = Local.id; // nada tocando em lugar nenhum: toca aqui
  await comando(c);
}
function alternar() {
  const s = P.s;
  if (semPremium()) return s.faixa ? abrirNoApp(s.faixa.uri) : abrirNoApp('spotify:');
  Local.ativar();
  if (Local.mandando) { Local.player.togglePlay(); return; }
  if (!s.ativo || !s.faixa) {
    // nada carregado: retoma o que o Spotify tiver; sem nada, toca a lista aberta
    if (!s.ativo && Local.id) return comando({ acao: 'transferir', dispositivo: Local.id, tocar: true });
    return comando({ acao: 'retomar' });
  }
  const pos = posicaoAgora();
  if (s.tocando) comando({ acao: 'pausar' }, (x) => { x.posMs = pos; x.em = Date.now(); x.tocando = false; });
  else comando({ acao: 'retomar' }, (x) => { x.posMs = pos; x.em = Date.now(); x.tocando = true; });
}
function pular(d) {
  if (semPremium()) return;
  if (Local.mandando) { d > 0 ? Local.player.nextTrack() : Local.player.previousTrack(); return; }
  comando({ acao: d > 0 ? 'proxima' : 'anterior' }).then(() => depois(700));
}
function irPara(ms) {
  if (!P.s.faixa || semPremium()) return;
  ms = Math.max(0, Math.min(P.s.faixa.ms - 500, Math.round(ms)));
  if (Local.mandando) { P.s.posMs = ms; P.s.em = Date.now(); pintarProgresso(); Local.player.seek(ms); return; }
  comando({ acao: 'posicao', ms }, (x) => { x.posMs = ms; x.em = Date.now(); });
}
function volume(v, agora) {
  v = Math.max(0, Math.min(100, Math.round(v)));
  if (P.s.dispositivo) P.s.dispositivo.volume = v;
  pintarVolume();
  clearTimeout(P.volTimer);
  P.volTimer = setTimeout(() => {
    if (Local.mandando) { Local.volume = v / 100; Local.player.setVolume(v / 100); return; }
    comando({ acao: 'volume', valor: v });
  }, agora ? 0 : 220);
}
const alternarAleatorio = () => comando({ acao: 'aleatorio', on: !P.s.aleatorio }, (x) => { x.aleatorio = !x.aleatorio; });
const alternarRepetir = () => { const prox = { off: 'context', context: 'track', track: 'off' }[P.s.repetir || 'off']; return comando({ acao: 'repetir', modo: prox }, (x) => { x.repetir = prox; }); };
async function curtirAtual() {
  const f = P.s.faixa; if (!f || !eFaixa(f)) return toast('Não há faixa tocando.', '', 'bsp');
  const on = !P.curtida;
  P.curtida = on; pintarPlayer();
  try { await chamar('curtir', {}, { uris: [f.uri], on }); toast(on ? 'Adicionada às Curtidas.' : 'Tirada das Curtidas.', 'ok', 'bsp'); E.cache.delete('curtidas:'); }
  catch (e) { P.curtida = !on; pintarPlayer(); falhou(e); }
}

// ---------- vistas ----------
const criarVista = (tipo, id, extra) => ({ tipo, id: id || '', chave: tipo + ':' + (id || ''), itens: [], total: 0, cab: null, pronto: false, erro: null, pedindo: new Set(), rolagem: 0, sel: -1, ...extra });
const MODO = { curtidas: 'faixas', recentes: 'faixas', playlist: 'faixas', album: 'faixas', albuns: 'grade', artistas: 'grade', artista: 'grade', busca: 'busca', fila: 'fila' };

function ir(tipo, id, extra) {
  if (!E.est || !E.est.logado) return;
  const atual = E.vista;
  if (atual) { const rol = R.view.querySelector('.bsp-rolagem'); if (rol) atual.rolagem = rol.scrollTop; }
  const chave = tipo + ':' + (id || '');
  if (atual && atual.chave === chave && tipo !== 'busca') return;
  let v = tipo === 'busca' || tipo === 'fila' ? null : E.cache.get(chave);
  if (!v) {
    v = criarVista(tipo, id, extra);
    if (tipo !== 'busca' && tipo !== 'fila') { E.cache.set(chave, v); if (E.cache.size > 14) E.cache.delete(E.cache.keys().next().value); }
  }
  if (atual && !(atual.tipo === 'busca' && tipo === 'busca')) { E.hist.push(atual); if (E.hist.length > 40) E.hist.shift(); }
  E.vista = v;
  if (tipo !== 'busca' && R.busca) R.busca.value = '';
  desenhar(); pintarLado();
  if (!v.pronto) carregarVista(v);
}
function voltar() {
  const v = E.hist.pop(); if (!v) return;
  E.vista = v; if (R.busca) R.busca.value = v.tipo === 'busca' ? v.q || '' : '';
  desenhar(); pintarLado();
  if (!v.pronto) carregarVista(v);
}

async function carregarVista(v) {
  v.erro = null;
  try {
    if (v.tipo === 'busca') { v.res = await chamar('busca', { q: v.q }); v.itens = v.res.faixas; v.total = v.itens.length; }
    else if (v.tipo === 'fila') { const r = await chamar('fila'); v.atual = r.atual; v.itens = r.fila; v.total = r.fila.length; }
    else {
      const r = await chamar('lista', { tipo: v.tipo, id: v.id, offset: 0 });
      v.itens = r.itens.slice(); v.total = r.total ?? r.itens.length; v.cab = r.cab || v.cab; v.bloqueada = !!r.bloqueada; v.depois = r.depois || null;
    }
    v.pronto = true;
  } catch (e) { v.erro = e; }
  if (E.vista === v && !morto) desenhar();
}
// página de uma lista de faixas (a lista virtual pede conforme a rolagem chega)
async function pedirPagina(v, offset) {
  if (v.pedindo.has(offset) || offset >= v.total) return;
  v.pedindo.add(offset);
  try {
    const r = await chamar('lista', { tipo: v.tipo, id: v.id, offset });
    r.itens.forEach((f, k) => { v.itens[offset + k] = f || null; });
    for (let k = r.itens.length; k < PAG && offset + k < v.total; k++) v.itens[offset + k] = null;
    v.pedindo.delete(offset);
    if (E.vista === v && v.pintar) v.pintar(true);
  } catch (e) { setTimeout(() => v.pedindo.delete(offset), 4000); falhou(e); }
}
// mais itens de uma grade (álbuns, artistas, álbuns do artista)
async function pedirMais(v) {
  if (v.pedindoMais || v.itens.length >= v.total) return;
  if (v.tipo === 'artistas' && !v.depois) return;
  v.pedindoMais = true;
  try {
    const r = await chamar('lista', { tipo: v.tipo, id: v.id, offset: v.itens.length, depois: v.depois || '' });
    v.itens.push(...r.itens); v.depois = r.depois || null;
    if (!r.itens.length) v.total = v.itens.length;
    if (E.vista === v) desenharVista();
  } catch (e) { falhou(e); v.total = v.itens.length; }
  v.pedindoMais = false;
}

// ---------- desenho ----------
function desenhar() {
  if (!montada) return;
  const est = E.est;
  R.pg.classList.toggle('sem-conta', !est || !est.logado);
  pintarAviso(); pintarTopo();
  if (!est) return telaEstado(E.erroServidor ? { icone: IC.app, titulo: 'O BlueSpotify não iniciou', texto: E.erroServidor, botoes: '<button class="chip primary" data-a="recarregar">Tentar de novo</button>' } : { icone: IC.app, titulo: 'Abrindo…', texto: '' });
  if (!est.configurado) return telaAssistente();
  if (!est.logado) {
    if (E.esperandoLogin) return telaEstado({ icone: IC.app, titulo: 'Autorize no navegador', texto: 'O Spotify abriu no seu navegador. Depois de aceitar, esta tela continua sozinha.', botoes: '<button class="chip" data-a="abrir-login">Abrir de novo</button><button class="chip" data-a="cancelar-login">Cancelar</button>', girando: true });
    return telaEstado({ icone: IC.app, titulo: 'Conecte sua conta do Spotify', texto: 'O login acontece no site do Spotify. O BlueSpotify não vê a sua senha.', botoes: '<button class="chip primary bsp-verde" data-a="entrar">Conectar ao Spotify</button><button class="chip" data-a="config">Trocar o Client ID</button>' });
  }
  desenharVista(); pintarPlayer();
}

function telaEstado({ icone, titulo, texto, botoes = '', girando }) {
  R.view.innerHTML = `<div class="bsp-estado"><div class="bsp-estado-ic${girando ? ' girando' : ''}">${icone}</div><h2>${esc(titulo)}</h2>${texto ? `<p>${esc(texto)}</p>` : ''}${botoes ? `<div class="bsp-botoes">${botoes}</div>` : ''}</div>`;
}
function telaAssistente() {
  const red = E.est.redirect;
  R.view.innerHTML = `<div class="bsp-rolagem"><div class="bsp-assist">
    <h2>Ligue o BlueSpotify à sua conta</h2>
    <p class="bsp-sub">O Spotify pede que cada pessoa use um app próprio, criado de graça no painel de desenvolvedores. São três passos.</p>
    <ol class="bsp-passos">
      <li><b>Crie o app</b><p>No painel do Spotify, entre com a sua conta e clique em <i>Create app</i>. Nome e descrição ficam a seu gosto.</p>
        <button class="chip bsp-borda" data-a="painel">${IC.ext}Abrir o painel do Spotify</button></li>
      <li><b>Cadastre o endereço de retorno</b><p>Em <i>Redirect URIs</i>, cole este endereço e clique em <i>Add</i>. Em <i>Which API/SDKs are you planning to use?</i>, marque <i>Web API</i> e <i>Web Playback SDK</i>. Depois, <i>Save</i>.</p>
        <div class="bsp-copia"><code>${esc(red)}</code><button class="chip" data-a="copiar-red">${IC.copy}Copiar</button></div></li>
      <li><b>Traga o Client ID</b><p>Na página do app, copie o <i>Client ID</i> (não precisa do Client secret) e cole aqui.</p>
        <form class="bsp-copia" data-f="client"><input name="id" placeholder="Client ID" autocomplete="off" spellcheck="false" maxlength="64"><button class="chip primary" type="submit">Salvar e conectar</button></form>
        <div class="bsp-erro" hidden></div></li>
    </ol>
    <p class="bsp-nota">Apps novos ficam no modo de desenvolvimento do Spotify: valem para a conta que criou o app, que precisa ser Premium, e para até 5 contas convidadas em <i>User Management</i>.</p>
  </div></div>`;
}

function pintarTopo() {
  const est = E.est, logado = est && est.logado;
  R.voltar.disabled = !E.hist.length;
  R.conta.hidden = !logado;
  if (logado) R.conta.innerHTML = `${est.usuario && est.usuario.foto ? `<img src="${esc(est.usuario.foto)}" alt="" width="20" height="20">` : IC.user}<span>${esc((est.usuario && est.usuario.nome) || 'Conta')}</span>`;
}

function cabecalho(v) {
  const c = v.cab || {}, tipo = v.tipo;
  let capa, sub = '', rotulo = '';
  if (tipo === 'curtidas') { capa = `<span class="bsp-capa g bsp-tile curt">${IC.heart}</span>`; sub = plural(v.total, 'faixa', 'faixas'); }
  else if (tipo === 'recentes') { capa = `<span class="bsp-capa g bsp-tile rec">${IC.clock}</span>`; sub = plural(v.total, 'faixa', 'faixas'); }
  else if (tipo === 'artista') { capa = capaHtml(c.capa, 'g redonda', IC.mic); rotulo = 'Artista'; }
  else if (tipo === 'album') { capa = capaHtml(c.capa, 'g', IC.disc); rotulo = 'Álbum'; sub = [nomes(c.artistas), c.ano, plural(v.total, 'faixa', 'faixas')].filter(Boolean).join(' · '); }
  else { capa = capaHtml(c.capa, 'g', IC.list); rotulo = 'Playlist'; sub = [c.dono, v.bloqueada ? plural(c.total, 'faixa', 'faixas') : plural(v.total, 'faixa', 'faixas')].filter(Boolean).join(' · '); }
  const nome = c.nome || (tipo === 'curtidas' ? 'Curtidas' : tipo === 'recentes' ? 'Tocadas recentemente' : '');
  const podeTocar = tipo === 'artista' || v.bloqueada || v.total > 0;
  return `<header class="bsp-cab">${capa}<div class="bsp-cab-t">${rotulo ? `<span class="bsp-rot">${rotulo}</span>` : ''}<h2 title="${esc(nome)}">${esc(nome)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}${c.descricao ? `<p class="bsp-desc" title="${esc(c.descricao)}">${esc(c.descricao)}</p>` : ''}
    <div class="bsp-cab-a">${podeTocar ? `<button class="bsp-tocar" data-a="tocar-tudo" title="${semPremium() ? 'Abrir no Spotify' : 'Tocar'}">${IC.play}</button>` : ''}${c.uri ? `<button class="icon-btn" data-a="menu-cab" title="Mais">${IC.more}</button>` : ''}</div></div></header>`;
}

function linhaFaixa(f, i, v, opt = {}) {
  const estilo = opt.fixa ? '' : ` style="top:${i * ALT}px"`;
  if (f === undefined) return `<div class="bsp-fx bsp-esq"${estilo}><span class="bsp-fx-n"></span><span class="bsp-capa p"></span><div class="bsp-fx-t"><b></b><span></span></div></div>`;
  if (f === null) return `<div class="bsp-fx off"${estilo}><span class="bsp-fx-n"><span>${i + 1}</span></span><span class="bsp-capa p">${IC.note}</span><div class="bsp-fx-t"><b>Faixa indisponível</b><span></span></div></div>`;
  const toc = P.s.faixa && P.s.faixa.uri === f.uri;
  const arts = f.artistas.map((a) => (a.id ? `<a data-ir="artista:${esc(a.id)}">${esc(a.nome)}</a>` : esc(a.nome))).join(', ');
  return `<div class="bsp-fx${toc ? ' toc' : ''}${f.tocavel ? '' : ' off'}${v.sel === i ? ' sel' : ''}"${estilo} data-i="${i}" data-u="${esc(f.uri)}"${opt.lista ? ` data-l="${opt.lista}"` : ''}>
    <button class="bsp-fx-n" data-a="tocar-faixa" tabindex="-1" title="${semPremium() ? 'Abrir no Spotify' : 'Tocar'}"><span>${i + 1}</span><i class="bsp-eq"><i></i><i></i><i></i></i>${IC.play}</button>
    ${capaHtml(f.capa, 'p')}
    <div class="bsp-fx-t"><b title="${esc(f.nome)}">${esc(f.nome)}</b><span>${f.explicita ? '<i class="bsp-e" title="Conteúdo explícito">E</i>' : ''}${arts}</span></div>
    <div class="bsp-fx-al">${f.album && f.album.id && v.tipo !== 'album' ? `<a data-ir="album:${esc(f.album.id)}" title="${esc(f.album.nome)}">${esc(f.album.nome)}</a>` : ''}</div>
    <div class="bsp-fx-d">${tempo(f.ms)}</div>
    <button class="icon-btn bsp-fx-m" data-a="menu-faixa" tabindex="-1" title="Mais">${IC.more}</button>
  </div>`;
}
const cartao = (o, semArtista) => `<button class="bsp-card" data-ir="${o.tipo === 'artista' ? 'artista' : o.tipo === 'playlist' ? 'playlist' : 'album'}:${esc(o.id)}" data-uri="${esc(o.uri)}" title="${esc(o.nome)}">
  ${capaHtml(o.capa, 'c' + (o.tipo === 'artista' ? ' redonda' : ''), o.tipo === 'artista' ? IC.mic : o.tipo === 'playlist' ? IC.list : IC.disc)}<b>${esc(o.nome)}</b><span>${esc(o.tipo === 'artista' ? 'Artista' : o.tipo === 'playlist' ? o.dono : [semArtista ? '' : nomes(o.artistas), o.ano].filter(Boolean).join(' · '))}</span></button>`;

function desenharVista() {
  const v = E.vista; if (!v) return;
  const modo = MODO[v.tipo];
  if (v.erro) {
    const e = v.erro;
    return telaEstado({ icone: IC.app, titulo: e.codigo === 'offline' ? 'Sem conexão com o Spotify' : e.codigo === 'limite' ? 'O Spotify pediu uma pausa' : 'Não deu para abrir', texto: e.message, botoes: '<button class="chip primary" data-a="recarregar-vista">Tentar de novo</button>' });
  }
  if (!v.pronto) {
    R.view.innerHTML = `<div class="bsp-rolagem">${modo === 'faixas' ? `<header class="bsp-cab bsp-esq"><span class="bsp-capa g"></span><div class="bsp-cab-t"><h2></h2><p></p></div></header><div class="bsp-faixas" style="height:${ALT * 8}px">${Array.from({ length: 8 }, (_, i) => linhaFaixa(undefined, i, v)).join('')}</div>` : '<div class="bsp-carregando"><i class="bsp-giro"></i></div>'}</div>`;
    return;
  }
  if (modo === 'faixas') {
    const vazio = v.bloqueada ? 'O Spotify só deixa apps listarem as faixas de playlists suas ou colaborativas. Esta dá para tocar inteira ou abrir no aplicativo.'
      : !v.total ? (v.tipo === 'curtidas' ? 'Você ainda não curtiu nenhuma faixa.' : v.tipo === 'recentes' ? 'Nada tocado recentemente.' : 'Sem faixas por aqui.') : '';
    R.view.innerHTML = `<div class="bsp-rolagem" tabindex="-1">${cabecalho(v)}${vazio ? `<div class="empty">${esc(vazio)}</div>` : `<div class="bsp-faixas${v.tipo === 'album' ? ' sem-album' : ''}" style="height:${v.total * ALT}px" role="list"></div>`}</div>`;
    if (!vazio) listaVirtual(v);
    const rol = R.view.querySelector('.bsp-rolagem'); rol.scrollTop = v.rolagem || 0;
    return;
  }
  if (modo === 'grade') {
    const titulo = v.tipo === 'albuns' ? 'Álbuns' : v.tipo === 'artistas' ? 'Artistas' : '';
    const vazio = !v.itens.length ? (v.tipo === 'albuns' ? 'Você ainda não salvou nenhum álbum.' : v.tipo === 'artistas' ? 'Você ainda não segue nenhum artista.' : 'Sem álbuns por aqui.') : '';
    R.view.innerHTML = `<div class="bsp-rolagem" tabindex="-1">${v.tipo === 'artista' ? cabecalho(v) + '<h3 class="bsp-h">Álbuns e singles</h3>' : `<h2 class="bsp-h1">${titulo}<span>${v.total ? v.total.toLocaleString('pt-BR') : ''}</span></h2>`}
      ${vazio ? `<div class="empty">${vazio}</div>` : `<div class="bsp-grade">${v.itens.map((o) => cartao(o, v.tipo === 'artista')).join('')}</div>`}${v.itens.length < v.total ? '<div class="bsp-mais"><i class="bsp-giro"></i></div>' : ''}</div>`;
    const rol = R.view.querySelector('.bsp-rolagem'); rol.scrollTop = v.rolagem || 0;
    const mais = R.view.querySelector('.bsp-mais');
    if (mais) { const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { io.disconnect(); v.rolagem = rol.scrollTop; pedirMais(v); } }, { root: rol, rootMargin: '300px' }); io.observe(mais); }
    return;
  }
  if (modo === 'busca') {
    const r = v.res, nada = !r.faixas.length && !r.albuns.length && !r.artistas.length && !r.playlists.length;
    const sec = (titulo, itens) => (itens.length ? `<h3 class="bsp-h">${titulo}</h3><div class="bsp-grade">${itens.map((o) => cartao(o)).join('')}</div>` : '');
    R.view.innerHTML = `<div class="bsp-rolagem" tabindex="-1">${nada ? `<div class="empty">Nada encontrado para “${esc(v.q)}”.</div>` : ''}
      ${r.faixas.length ? `<h3 class="bsp-h">Faixas</h3><div class="bsp-faixas fixa">${r.faixas.map((f, i) => linhaFaixa(f, i, v, { fixa: true })).join('')}</div>` : ''}
      ${sec('Artistas', r.artistas)}${sec('Álbuns', r.albuns)}${sec('Playlists', r.playlists)}</div>`;
    return;
  }
  // fila
  R.view.innerHTML = `<div class="bsp-rolagem" tabindex="-1"><h2 class="bsp-h1">Fila</h2>
    ${v.atual ? `<h3 class="bsp-h">Tocando agora</h3><div class="bsp-faixas fixa">${linhaFaixa(v.atual, 0, { tipo: 'fila', sel: -1 }, { fixa: true, lista: 'atual' })}</div>` : ''}
    ${v.itens.length ? `<h3 class="bsp-h">A seguir</h3><div class="bsp-faixas fixa">${v.itens.map((f, i) => linhaFaixa(f, i, v, { fixa: true })).join('')}</div>` : `<div class="empty">${v.atual ? 'Nada na fila depois desta faixa.' : 'A fila está vazia. Toque alguma coisa.'}</div>`}</div>`;
}

// Lista virtual: só as linhas à vista (e uma folga) existem no DOM; as páginas chegam conforme a rolagem para.
function listaVirtual(v) {
  const rol = R.view.querySelector('.bsp-rolagem'), caixa = R.view.querySelector('.bsp-faixas');
  let ini = -1, fim = -1, espera = 0, quadro = 0;
  v.pintar = (forcar) => {
    if (!caixa.isConnected) return;
    const y = rol.scrollTop - caixa.offsetTop, alt = rol.clientHeight || 600;
    const a = Math.max(0, Math.floor(y / ALT / BLOCO) * BLOCO - BLOCO), b = Math.min(v.total, Math.ceil((y + alt) / ALT / BLOCO) * BLOCO + BLOCO);
    if (!forcar && a === ini && b === fim) return;
    ini = a; fim = b;
    let html = ''; const faltam = new Set();
    for (let i = a; i < b; i++) { const f = v.itens[i]; if (f === undefined) faltam.add(Math.floor(i / PAG) * PAG); html += linhaFaixa(f, i, v); }
    caixa.innerHTML = html;
    clearTimeout(espera);
    if (faltam.size) espera = setTimeout(() => faltam.forEach((off) => pedirPagina(v, off)), 130);
  };
  rol.addEventListener('scroll', () => { if (!quadro) quadro = requestAnimationFrame(() => { quadro = 0; v.pintar(); }); }, { passive: true });
  v.pintar(true);
}

// ---------- barra do player ----------
const pintado = {};
const troca = (chave, valor, fn) => { if (pintado[chave] === valor) return; pintado[chave] = valor; fn(); };
function pintarPlayer() {
  pintarJanelinha();
  if (!montada) return;
  const s = P.s, f = s.faixa, sp = semPremium();
  R.player.hidden = !(E.est && E.est.logado);
  troca('faixa', f ? f.uri + '|' + f.capa : '', () => {
    R.plInfo.innerHTML = f
      ? `${capaHtml(f.capa, 'm')}<div class="bsp-pl-t"><b title="${esc(f.nome)}">${f.album && f.album.id ? `<a data-ir="album:${esc(f.album.id)}">${esc(f.nome)}</a>` : esc(f.nome)}</b><span>${f.artistas.map((a) => (a.id ? `<a data-ir="artista:${esc(a.id)}">${esc(a.nome)}</a>` : esc(a.nome))).join(', ')}</span></div><button class="icon-btn bsp-curtir" data-a="curtir" title="Curtir">${IC.heart}</button>`
      : `${capaHtml('', 'm')}<div class="bsp-pl-t"><b>Nada tocando</b><span>${sp ? 'Abra uma faixa no aplicativo' : 'Escolha uma faixa'}</span></div>`;
    pintado.curtida = undefined;
  });
  troca('curtida', String(P.curtida) + (f ? f.uri : ''), () => { const b = R.plInfo.querySelector('.bsp-curtir'); if (b) { b.classList.toggle('on', !!P.curtida); b.title = P.curtida ? 'Tirar das Curtidas' : 'Curtir'; b.hidden = !eFaixa(f); } });
  troca('tocando', !!s.tocando, () => { R.pg.classList.toggle('tocando', !!s.tocando); R.btToca.innerHTML = s.tocando ? IC.pause : IC.play; R.btToca.title = (s.tocando ? 'Pausar' : 'Tocar') + ' (Ctrl+Alt+P)'; });
  troca('modos', `${s.aleatorio}|${s.repetir}`, () => {
    R.btAleat.classList.toggle('on', !!s.aleatorio); R.btAleat.title = s.aleatorio ? 'Ordem aleatória ligada' : 'Ordem aleatória';
    R.btRep.classList.toggle('on', s.repetir && s.repetir !== 'off'); R.btRep.innerHTML = s.repetir === 'track' ? IC.repeat1 : IC.repeat;
    R.btRep.title = s.repetir === 'track' ? 'Repetindo a faixa' : s.repetir === 'context' ? 'Repetindo a lista' : 'Repetir';
  });
  const d = s.dispositivo;
  troca('disp', (d ? d.id + d.nome : '') + '|' + Local.fase, () => {
    R.disp.classList.toggle('on', !!d);
    R.disp.title = d ? 'Tocando em ' + d.nome : 'Escolher dispositivo';
    R.dispNome.textContent = d ? d.nome : '';
  });
  for (const b of [R.btAnt, R.btProx, R.btAleat, R.btRep]) b.disabled = sp || !s.ativo;
  R.vol.disabled = sp || !d || d.temVolume === false;
  R.prog.classList.toggle('parado', sp || !f);
  pintarVolume(); pintarProgresso();
}
// ---------- janelinha do rodapé: o player compacto, sem abrir a biblioteca ----------
function montarJanelinha(el) {
  R.mini = el;
  el.innerHTML = `<div class="bsp bsp-jan">
    <div class="bsp-jan-info"></div>
    <div class="bsp-jan-prog"><span class="bsp-tm"></span><div class="bsp-prog-t"><div class="bsp-prog-b"></div></div><span class="bsp-tm"></span></div>
    <div class="bsp-jan-ctl">
      <button class="icon-btn" data-m="aleatorio">${IC.shuffle}</button>
      <button class="icon-btn" data-m="anterior" title="Anterior (Ctrl+Alt+,)">${IC.prev}</button>
      <button class="bsp-toca" data-m="alternar">${IC.play}</button>
      <button class="icon-btn" data-m="proxima" title="Próxima (Ctrl+Alt+.)">${IC.next}</button>
      <button class="icon-btn" data-m="curtir">${IC.heart}</button>
    </div>
    <div class="bsp-jan-pe">
      <button class="chip bsp-disp" data-m="dispositivos">${IC.device}<span></span></button>
      <input class="bsp-vol" type="range" min="0" max="100" step="1" aria-label="Volume">
      <button class="icon-btn" data-m="biblioteca" title="Abrir a biblioteca (Ctrl+Alt+M)">${IC.list}</button>
    </div></div>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]'); if (!b || b.disabled) return;
    const a = b.dataset.m;
    if (a === 'biblioteca') { bs.bubble.close(MINI); return bs.pages.open(ID); }
    if (a === 'dispositivos') return dialogoDispositivos();
    ({ aleatorio: alternarAleatorio, anterior: () => pular(-1), alternar, proxima: () => pular(1), curtir: curtirAtual }[a] || (() => {}))();
  });
  el.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
  el.querySelector('.bsp-vol').addEventListener('input', (e) => volume(Number(e.target.value)));
  pintarJanelinha();
}
function pintarJanelinha(soTempo) {
  const el = R.mini; if (!el || !el.isConnected) return;
  const s = P.s, f = s.faixa, sp = semPremium(), logado = E.est && E.est.logado;
  const pos = posicaoAgora(), dur = f ? f.ms : 0, tm = el.querySelectorAll('.bsp-tm');
  tm[0].textContent = tempo(pos); tm[1].textContent = tempo(dur);
  el.querySelector('.bsp-prog-b').style.width = (dur ? Math.min(100, (pos / dur) * 100) : 0) + '%';
  if (soTempo) return;
  const info = el.querySelector('.bsp-jan-info'), chave = (f ? f.uri + f.capaG : '') + '|' + logado;
  if (info.dataset.k !== chave) {
    info.dataset.k = chave;
    info.innerHTML = !logado ? `<div class="bsp-jan-t"><b>BlueSpotify</b><span>Conecte o Spotify na biblioteca.</span></div>`
      : f ? `${capaHtml(f.capaG || f.capa, 'j')}<div class="bsp-jan-t"><b title="${esc(f.nome)}">${esc(f.nome)}</b><span title="${esc(nomes(f.artistas))}">${esc(nomes(f.artistas))}</span></div>`
        : `${capaHtml('', 'j')}<div class="bsp-jan-t"><b>Nada tocando</b><span>${sp ? 'Abra uma faixa no aplicativo' : 'Escolha uma faixa na biblioteca'}</span></div>`;
  }
  const q = (x) => el.querySelector(`[data-m="${x}"]`);
  q('alternar').innerHTML = s.tocando ? IC.pause : IC.play; q('alternar').title = (s.tocando ? 'Pausar' : 'Tocar') + ' (Ctrl+Alt+P)';
  q('aleatorio').classList.toggle('on', !!s.aleatorio); q('aleatorio').title = s.aleatorio ? 'Ordem aleatória ligada' : 'Ordem aleatória';
  q('curtir').classList.toggle('on', !!P.curtida); q('curtir').title = P.curtida ? 'Tirar das Curtidas' : 'Curtir'; q('curtir').hidden = !eFaixa(f);
  for (const x of ['aleatorio', 'anterior', 'proxima']) q(x).disabled = sp || !s.ativo;
  q('alternar').disabled = !logado;
  const d = s.dispositivo, disp = q('dispositivos');
  disp.classList.toggle('on', !!d); disp.title = d ? 'Tocando em ' + d.nome : 'Escolher dispositivo'; disp.querySelector('span').textContent = d ? d.nome : 'Dispositivo';
  disp.disabled = !logado;
  const vol = el.querySelector('.bsp-vol'), v = d && typeof d.volume === 'number' ? d.volume : 0;
  if (document.activeElement !== vol) vol.value = v;
  vol.style.setProperty('--v', v + '%'); vol.disabled = sp || !d || d.temVolume === false;
  vol.title = d && d.temVolume === false ? 'Este dispositivo não deixa mudar o volume de fora' : 'Volume ' + v + '%';
}

function pintarVolume() {
  const d = P.s.dispositivo, v = d && typeof d.volume === 'number' ? d.volume : 0;
  if (document.activeElement !== R.vol || !P.volTimer) R.vol.value = v;
  R.vol.style.setProperty('--v', v + '%');
  R.vol.title = d && d.temVolume === false ? 'Este dispositivo não deixa mudar o volume de fora' : 'Volume ' + v + '%';
  troca('mudo', v === 0 && !!d, () => { R.btVol.innerHTML = v === 0 && d ? IC.mute : IC.vol; });
}
function pintarProgresso() {
  if (!montada || P.arrastando) return;
  const f = P.s.faixa, pos = posicaoAgora(), dur = f ? f.ms : 0;
  R.t1.textContent = tempo(pos); R.t2.textContent = tempo(dur);
  R.barra.style.width = (dur ? Math.min(100, (pos / dur) * 100) : 0) + '%';
  R.prog.setAttribute('aria-valuenow', dur ? Math.round((pos / dur) * 100) : 0);
}
function pintarMini() {
  const f = P.s.faixa;
  if (!E.cfg.mini || !f || !E.est || !E.est.logado) { if (pintado.mini) { bs.footer.remove(ID); pintado.mini = ''; } return; }
  troca('mini', f.uri + '|' + !!P.s.tocando, () => {
    const ic = (P.s.tocando ? IC.pause : IC.play).replace('<svg ', '<svg data-bsp="alternar" style="fill:currentColor;stroke:none" ');
    bs.footer.set(ID, {
      icon: ic, text: `${f.nome} · ${nomes(f.artistas)}`, title: `${P.s.tocando ? 'Tocando' : 'Pausado'}: ${f.nome}, de ${nomes(f.artistas)}. Clique no ícone para ${P.s.tocando ? 'pausar' : 'tocar'}; no nome, para os controles.`,
      run: (e) => { if (e && e.target && e.target.closest && e.target.closest('[data-bsp="alternar"]')) alternar(); else bs.bubble.toggle(MINI); },
    });
  });
}

// ---------- menus e diálogos ----------
const naPosicao = (el) => { const r = el.getBoundingClientRect(); return { preventDefault() {}, stopPropagation() {}, clientX: r.left, clientY: r.bottom + 4 }; };
function menuFaixa(ev, f, v) {
  if (!f) return;
  const minhas = E.bib.itens.filter((p) => p.minha).slice(0, 24);
  const naCurtidas = v && v.tipo === 'curtidas';
  bs.showMenu(ev, [
    { label: semPremium() ? 'Abrir no Spotify' : 'Tocar', icon: IC.play, action: () => tocar({ uris: [f.uri] }, f.uri) },
    ...(semPremium() ? [] : [{ label: 'Adicionar à fila', icon: IC.queue, action: async () => { if (await comando({ acao: 'fila', uri: f.uri })) toast('Na fila: ' + f.nome, 'ok', 'bsp'); } }]),
    ...(eFaixa(f) ? [{ label: naCurtidas ? 'Tirar das Curtidas' : 'Curtir', icon: IC.heart, action: async () => {
      try { await chamar('curtir', {}, { uris: [f.uri], on: !naCurtidas }); toast(naCurtidas ? 'Tirada das Curtidas.' : 'Adicionada às Curtidas.', 'ok', 'bsp'); if (P.s.faixa && P.s.faixa.uri === f.uri) { P.curtida = !naCurtidas; pintarPlayer(); } E.cache.delete('curtidas:'); if (naCurtidas && E.vista === v) refazerVista(); }
      catch (e) { falhou(e); }
    } }] : []),
    ...(eFaixa(f) && minhas.length ? [{ label: 'Adicionar à playlist', icon: IC.plus, sub: minhas.map((p) => ({ label: p.nome, action: async () => {
      try { await chamar('playlist-adicionar', {}, { playlist: p.id, uris: [f.uri] }); p.total++; E.cache.delete('playlist:' + p.id); toast(`Adicionada a “${p.nome}”.`, 'ok', 'bsp'); pintarLado(); } catch (e) { falhou(e); }
    } })) }] : []),
    '-',
    ...(f.album && f.album.id ? [{ label: 'Ir para o álbum', icon: IC.disc, action: () => ir('album', f.album.id) }] : []),
    ...(f.artistas[0] && f.artistas[0].id ? [{ label: 'Ir para o artista', icon: IC.mic, action: () => ir('artista', f.artistas[0].id) }] : []),
    '-',
    ...(semPremium() ? [] : [{ label: 'Abrir no Spotify', icon: IC.ext, action: () => abrirNoApp(f.uri) }]),
    ...(f.link ? [{ label: 'Copiar link', icon: IC.copy, action: () => copiar(f.link, 'Link copiado.') }] : []),
  ], f.nome);
}
function menuItem(ev, o) {
  bs.showMenu(ev, [
    { label: semPremium() ? 'Abrir no Spotify' : 'Tocar', icon: IC.play, action: () => tocar({ contexto: o.uri }, o.uri) },
    ...(semPremium() ? [] : [{ label: 'Abrir no Spotify', icon: IC.ext, action: () => abrirNoApp(o.uri) }]),
    ...(o.link ? [{ label: 'Abrir no navegador', icon: IC.ext, action: () => abrirFora(o.link) }, { label: 'Copiar link', icon: IC.copy, action: () => copiar(o.link, 'Link copiado.') }] : []),
  ], o.nome);
}
function menuConta(ev) {
  const est = E.est;
  bs.showMenu(ev, [
    ...(est.usuario && est.usuario.link ? [{ label: 'Meu perfil no Spotify', icon: IC.ext, action: () => abrirFora(est.usuario.link) }] : []),
    { label: 'Atualizar a biblioteca', icon: IC.refresh, action: () => recarregarTudo() },
    ...(est.premium === false ? [{ label: 'Tentar tocar por aqui de novo', icon: IC.play, action: async () => { await chamar('premium', {}, { valor: null }).catch(() => {}); E.est.premium = null; if (E.aviso && E.aviso.codigo === 'premium') avisar(null); if (E.cfg.local) { Local.fase = 'desligado'; Local.ligar(); } desenhar(); } }] : []),
    { label: 'Configurações', icon: IC.gear, action: () => plugin.settings.open() },
    '-',
    { label: 'Sair da conta', icon: IC.out, action: sair },
  ], (est.usuario && est.usuario.nome) || 'Conta');
}
function menuMais(ev) {
  const s = P.s, sp = semPremium();
  bs.showMenu(ev, [
    ...(sp ? [] : [{ label: s.aleatorio ? 'Desligar a ordem aleatória' : 'Ordem aleatória', icon: IC.shuffle, action: alternarAleatorio }, { label: s.repetir === 'off' ? 'Repetir a lista' : s.repetir === 'context' ? 'Repetir a faixa' : 'Não repetir', icon: IC.repeat, action: alternarRepetir }]),
    ...(s.faixa && eFaixa(s.faixa) ? [{ label: P.curtida ? 'Tirar das Curtidas' : 'Curtir', icon: IC.heart, action: curtirAtual }] : []),
    { label: 'Fila', icon: IC.queue, action: () => ir('fila') },
    { label: 'Dispositivos', icon: IC.device, action: () => dialogoDispositivos() },
    ...(sp || !s.dispositivo || s.dispositivo.temVolume === false ? [] : ['-', ...[100, 75, 50, 25, 0].map((n) => ({ label: `Volume ${n}%`, icon: n ? IC.vol : IC.mute, action: () => volume(n, true) }))]),
  ]);
}

const iconeDisp = (t) => (/phone|tablet/i.test(t) ? IC.phone : /speaker|avr|cast|audio/i.test(t) ? IC.speaker : IC.device);
// pendente: um pedido de tocar que ficou sem dispositivo; escolher um aqui toca nele
async function dialogoDispositivos(pendente) {
  const corpo = (lista, erro) => {
    const itens = lista.map((d) => `<button class="bsp-dev${d.ativo ? ' on' : ''}" data-id="${esc(d.id)}" ${d.restrito ? 'disabled' : ''}>${iconeDisp(d.tipo)}<span><b>${esc(d.nome)}</b><small>${d.ativo ? 'Tocando aqui' : d.restrito ? 'Não aceita controle de fora' : d.id === Local.id ? 'Este BlueScreen' : ({ Computer: 'Computador', Smartphone: 'Celular', Speaker: 'Caixa de som', TV: 'TV', Tablet: 'Tablet' }[d.tipo] || d.tipo || '')}</small></span></button>`).join('');
    const nota = Local.fase === 'erro' && Local.msg ? `<p class="bsp-dev-nota">${esc(Local.msg)}</p>` : '';
    return `<div class="dlg-hd"><span class="dlg-ic">${IC.device}</span><div><h3>${pendente ? 'Onde tocar?' : 'Dispositivos'}</h3><p>${lista.length ? 'Aparelhos com o Spotify aberto na sua conta.' : 'Nenhum aparelho com o Spotify aberto.'}</p></div></div>
      <div class="bsp-devs">${erro ? `<div class="empty">${esc(erro)}</div>` : itens || `<div class="empty">Abra o Spotify neste PC ou no celular e clique em Atualizar.${semPremium() ? '' : ' Com Premium, o BlueScreen também aparece aqui.'}</div>`}</div>${nota}
      <div class="actions"><button class="chip" data-app>${IC.ext}Abrir o Spotify neste PC</button><button class="chip" data-atualizar>${IC.refresh}Atualizar</button></div>`;
  };
  const abrir = async () => {
    let lista = [], erro = '';
    try { lista = (await chamar('dispositivos')).dispositivos; } catch (e) { erro = e.message; }
    if (morto) return;
    dialog('bspDisp', corpo(lista, erro), (el) => {
      el.querySelector('[data-atualizar]').onclick = abrir;
      el.querySelector('[data-app]').onclick = () => { abrirNoApp('spotify:'); setTimeout(() => { if (!el.hidden) abrir(); }, 4000); };
      el.querySelectorAll('.bsp-dev').forEach((b) => { b.onclick = async () => {
        el.hidden = true;
        if (b.dataset.id === Local.id) Local.ativar();
        if (pendente) await comando({ ...pendente, dispositivo: b.dataset.id });
        else await comando({ acao: 'transferir', dispositivo: b.dataset.id, tocar: !!P.s.tocando });
        depois(900);
      }; });
    });
  };
  abrir();
}

// ---------- painel da esquerda ----------
async function carregarBiblioteca() {
  const b = E.bib; if (b.carregando) return;
  b.carregando = true; b.erro = ''; pintarLado();
  try {
    const itens = [];
    for (let offset = 0; offset < 1000; offset += PAG) {
      const r = await chamar('lista', { tipo: 'playlists', offset });
      itens.push(...r.itens); b.total = r.total;
      if (!offset) { b.itens = itens.slice(); pintarLado(); }
      if (offset + PAG >= r.total || !r.itens.length) break;
    }
    b.itens = itens; b.feito = true;
  } catch (e) { b.erro = e.message; }
  b.carregando = false; pintarLado();
}
function recarregarTudo() {
  E.cache.clear(); E.bib.feito = false; carregarBiblioteca();
  refazerVista(); sincronizar();
}
// carrega de novo a vista aberta (depois de mudar o que ela mostra), mantendo a rolagem
function refazerVista() {
  const v = E.vista; if (!v) return;
  const rol = R.view && R.view.querySelector('.bsp-rolagem');
  const n = criarVista(v.tipo, v.id, { ...(v.tipo === 'busca' ? { q: v.q } : {}), cab: v.cab, rolagem: rol ? rol.scrollTop : 0 });
  E.vista = n; if (v.tipo !== 'busca' && v.tipo !== 'fila') E.cache.set(n.chave, n);
  carregarVista(n);
}
function pintarLado() {
  const el = R.ladoLista; if (!el) return;
  const est = E.est, v = E.vista;
  R.lado.classList.toggle('sem-conta', !est || !est.logado);
  if (!est || !est.logado) { el.innerHTML = `<div class="empty">${!est ? esc(E.erroServidor || 'Abrindo…') : est.configurado ? 'Conecte sua conta na tela ao lado.' : 'Configure o BlueSpotify na tela ao lado.'}</div>`; return; }
  const q = E.filtro.trim().toLowerCase(), b = E.bib;
  const fixos = FIXOS.filter(([, nome]) => !q || nome.toLowerCase().includes(q));
  const pls = b.itens.filter((p) => !q || p.nome.toLowerCase().includes(q));
  el.innerHTML = fixos.map(([tipo, nome, ic]) => `<button class="bsp-it${v && v.tipo === tipo ? ' sel' : ''}" data-ir="${tipo}:"><span class="bsp-it-ic">${ic}</span><span class="bsp-it-n">${nome}</span></button>`).join('')
    + `<div class="section">Playlists<span class="meta">${b.carregando ? '<i class="bsp-giro p"></i>' : b.total ? b.total.toLocaleString('pt-BR') : ''}</span></div>`
    + (pls.map((p) => `<button class="bsp-it pl${v && v.tipo === 'playlist' && v.id === p.id ? ' sel' : ''}" data-ir="playlist:${esc(p.id)}" data-uri="${esc(p.uri)}" title="${esc(p.nome)}">${capaHtml(p.capaP, 'p', IC.list)}<span class="bsp-it-n"><b>${esc(p.nome)}</b><small>${esc(p.minha ? plural(p.total, 'faixa', 'faixas') : p.dono)}</small></span></button>`).join('')
      || `<div class="empty">${b.erro ? esc(b.erro) : b.carregando ? '' : q ? 'Nenhuma playlist com esse nome.' : 'Você ainda não tem playlists.'}</div>`);
}

// ---------- montagem ----------
function montarLado() {
  const el = document.createElement('div'); el.className = 'bsp bsp-lado';
  el.innerHTML = `<div class="bsp-lado-top"><label class="bsp-campo">${IC.search}<input type="search" placeholder="Filtrar a biblioteca" spellcheck="false"></label><button class="icon-btn" data-a="atualizar" title="Atualizar a biblioteca">${IC.refresh}</button></div><div class="bsp-lado-lista"></div>`;
  R.lado = el; R.ladoLista = el.querySelector('.bsp-lado-lista');
  el.querySelector('input').oninput = (e) => { E.filtro = e.target.value; pintarLado(); };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-a="atualizar"]')) return recarregarTudo();
    const it = e.target.closest('[data-ir]'); if (!it) return;
    const [tipo, id] = it.dataset.ir.split(':');
    bs.pages.open(ID); ir(tipo, id);
  });
  el.addEventListener('contextmenu', (e) => { const it = e.target.closest('.bsp-it.pl'); if (!it) return; const p = E.bib.itens.find((x) => x.uri === it.dataset.uri); if (p) menuItem(e, p); });
}

function montar(el) {
  el.innerHTML = `<div class="bsp bsp-pg sem-conta" tabindex="-1">
    <div class="bsp-top"><button class="icon-btn" data-a="voltar" title="Voltar (Alt+←)" disabled>${IC.back}</button>
      <label class="bsp-campo bsp-busca">${IC.search}<input type="search" placeholder="Buscar músicas, álbuns, artistas e playlists" spellcheck="false" maxlength="120"></label>
      <button class="chip bsp-conta" data-a="conta" hidden></button></div>
    <div class="bsp-aviso" hidden></div>
    <div class="bsp-view"></div>
    <footer class="bsp-player" hidden>
      <div class="bsp-pl-info"></div>
      <div class="bsp-pl-ctl">
        <button class="icon-btn bsp-largo" data-a="aleatorio">${IC.shuffle}</button>
        <button class="icon-btn" data-a="anterior" title="Anterior (Ctrl+Alt+,)">${IC.prev}</button>
        <button class="bsp-toca" data-a="alternar">${IC.play}</button>
        <button class="icon-btn" data-a="proxima" title="Próxima (Ctrl+Alt+.)">${IC.next}</button>
        <button class="icon-btn bsp-largo" data-a="repetir">${IC.repeat}</button>
        <button class="icon-btn bsp-estreito" data-a="mais" title="Mais">${IC.more}</button>
      </div>
      <div class="bsp-pl-prog"><span class="bsp-tm"></span><div class="bsp-prog" role="slider" tabindex="0" aria-label="Posição na faixa" aria-valuemin="0" aria-valuemax="100"><div class="bsp-prog-t"><div class="bsp-prog-b"></div></div></div><span class="bsp-tm"></span></div>
      <div class="bsp-pl-extra">
        <button class="icon-btn" data-a="fila" title="Fila">${IC.queue}</button>
        <button class="chip bsp-disp" data-a="dispositivos">${IC.device}<span></span></button>
        <button class="icon-btn" data-a="mudo">${IC.vol}</button>
        <input class="bsp-vol" type="range" min="0" max="100" step="1" aria-label="Volume">
      </div>
    </footer></div>`;
  const q = (s) => el.querySelector(s);
  Object.assign(R, {
    pg: q('.bsp-pg'), view: q('.bsp-view'), aviso: q('.bsp-aviso'), busca: q('.bsp-busca input'), voltar: q('[data-a="voltar"]'), conta: q('.bsp-conta'),
    player: q('.bsp-player'), plInfo: q('.bsp-pl-info'), btToca: q('[data-a="alternar"]'), btAnt: q('[data-a="anterior"]'), btProx: q('[data-a="proxima"]'), btAleat: q('[data-a="aleatorio"]'), btRep: q('[data-a="repetir"]'),
    prog: q('.bsp-prog'), barra: q('.bsp-prog-b'), t1: el.querySelectorAll('.bsp-tm')[0], t2: el.querySelectorAll('.bsp-tm')[1], disp: q('.bsp-disp'), dispNome: q('.bsp-disp span'), vol: q('.bsp-vol'), btVol: q('[data-a="mudo"]'),
  });
  montada = true;

  // busca global: espera a digitação parar; Enter busca na hora
  const buscar = (agora) => {
    clearTimeout(T.busca);
    const termo = R.busca.value.trim();
    if (termo.length < 2) { if (!termo && E.vista && E.vista.tipo === 'busca') voltar(); return; }
    T.busca = setTimeout(() => { if (E.vista && E.vista.tipo === 'busca' && E.vista.q === termo) return; ir('busca', '', { q: termo }); }, agora ? 0 : 420);
  };
  R.busca.oninput = () => buscar(false);
  R.busca.onkeydown = (e) => { if (e.key === 'Enter') buscar(true); if (e.key === 'Escape') { e.stopPropagation(); R.busca.value = ''; R.busca.blur(); buscar(true); } };

  const faixaDe = (linha) => {
    const v = E.vista; if (!linha || !v) return null;
    if (linha.dataset.l === 'atual') return { f: v.atual, i: -1, v };
    const i = Number(linha.dataset.i); return { f: v.itens[i], i, v };
  };
  // tocar a partir de uma linha: playlist e álbum tocam no contexto (a fila segue a lista); o resto, as faixas carregadas
  const tocarLinha = ({ f, i, v }) => {
    if (!f || !f.tocavel) return;
    if (semPremium()) return abrirNoApp(f.uri);
    if ((v.tipo === 'playlist' || v.tipo === 'album') && v.cab && v.cab.uri) return tocar({ contexto: v.cab.uri, indice: i });
    if (i < 0) return;
    const uris = []; for (let k = i; k < v.itens.length && uris.length < 100; k++) { const x = v.itens[k]; if (x && x.tocavel) uris.push(x.uri); }
    tocar({ uris });
  };
  const acoes = {
    voltar, conta: (e, b) => menuConta(naPosicao(b)), entrar, 'cancelar-login': cancelarLogin, 'abrir-login': () => chamar('abrir-login', {}, {}).catch(falhou), config: () => plugin.settings.open(),
    recarregar: atualizarEstado, 'recarregar-vista': () => carregarVista(E.vista).then(desenhar), 'de-novo': () => { avisar(null); atualizarEstado(); if (E.vista && !E.vista.pronto) carregarVista(E.vista); },
    'fechar-aviso': () => avisar(null), painel: () => abrirFora('https://developer.spotify.com/dashboard'), 'copiar-red': () => copiar(E.est.redirect, 'Endereço copiado.'),
    alternar, anterior: () => pular(-1), proxima: () => pular(1), aleatorio: alternarAleatorio, repetir: alternarRepetir, curtir: curtirAtual,
    fila: () => (E.vista && E.vista.tipo === 'fila' ? voltar() : ir('fila')), dispositivos: () => dialogoDispositivos(), mais: (e, b) => menuMais(naPosicao(b)),
    mudo: () => { const d = P.s.dispositivo; if (!d || d.temVolume === false || semPremium()) return; if (d.volume > 0) { P.volAntes = d.volume; volume(0, true); } else volume(P.volAntes || 50, true); },
    'tocar-tudo': () => {
      const v = E.vista, c = v.cab || {};
      if (c.uri && v.tipo !== 'curtidas' && v.tipo !== 'recentes') return tocar({ contexto: c.uri }, c.uri);
      const uris = v.itens.filter((x) => x && x.tocavel).slice(0, 100).map((x) => x.uri);
      if (uris.length) tocar({ uris }, 'spotify:collection:tracks');
    },
    'menu-cab': (e, b) => menuItem(naPosicao(b), E.vista.cab),
    'tocar-faixa': (e, b) => tocarLinha(faixaDe(b.closest('.bsp-fx'))),
    'menu-faixa': (e, b) => { const x = faixaDe(b.closest('.bsp-fx')); if (x) menuFaixa(naPosicao(b), x.f, x.v); },
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (b && !b.disabled) { e.preventDefault(); return acoes[b.dataset.a] && acoes[b.dataset.a](e, b); }
    const a = e.target.closest('[data-ir]');
    if (a) { e.preventDefault(); const [tipo, id] = a.dataset.ir.split(':'); return ir(tipo, id); }
    const linha = e.target.closest('.bsp-fx[data-i]');
    if (linha && E.vista && !linha.dataset.l) { E.vista.sel = Number(linha.dataset.i); R.view.querySelectorAll('.bsp-fx.sel').forEach((x) => x.classList.remove('sel')); linha.classList.add('sel'); }
  });
  el.addEventListener('dblclick', (e) => { if (e.target.closest('button, a, input')) return; const x = faixaDe(e.target.closest('.bsp-fx[data-i]')); if (x) tocarLinha(x); });
  el.addEventListener('contextmenu', (e) => {
    const linha = e.target.closest('.bsp-fx[data-i]');
    if (linha) { const x = faixaDe(linha); if (x && x.f) menuFaixa(e, x.f, x.v); return; }
    const c = e.target.closest('.bsp-card');
    if (c) { const v = E.vista, todos = v.tipo === 'busca' ? [...v.res.albuns, ...v.res.artistas, ...v.res.playlists] : v.itens; const o = todos.find((x) => x && x.uri === c.dataset.uri); if (o) menuItem(e, o); }
  });
  el.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-f="client"]'); if (!f) return;
    e.preventDefault();
    const id = f.elements.id.value.trim(), err = f.parentElement.querySelector('.bsp-erro');
    const mostra = (t) => { err.textContent = t; err.hidden = false; };
    if (!/^[0-9a-f]{32}$/i.test(id) && !(E.est && E.est.teste && id)) return mostra('O Client ID tem 32 letras e números, sem espaços. Copie de novo do painel do Spotify.');
    err.hidden = true;
    const botao = f.querySelector('button'); botao.disabled = true;
    try {
      const v = await chamar('verificar', {}, { clientId: id });
      if (!v.valido) return mostra('O Spotify não conhece este Client ID. Confira se copiou o Client ID (não o Client secret) do app certo.');
      await plugin.settings.set({ clientId: id }); await atualizarEstado(); if (E.est && E.est.configurado) entrar();
    }
    catch (x) { mostra(x.message); }
    finally { botao.disabled = false; }
  });
  el.addEventListener('error', (e) => { if (e.target.tagName === 'IMG' && e.target.closest('.bsp-capa')) e.target.remove(); }, true);

  // progresso: clique ou arraste para ir a um ponto da faixa
  const fracao = (e) => { const r = R.prog.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  R.prog.addEventListener('pointerdown', (e) => {
    if (!P.s.faixa || semPremium() || e.button) return;
    P.arrastando = true; R.prog.setPointerCapture(e.pointerId); R.prog.classList.add('arr');
    const mover = (ev) => { const fr = fracao(ev); R.barra.style.width = fr * 100 + '%'; R.t1.textContent = tempo(fr * P.s.faixa.ms); };
    const soltar = (ev) => { R.prog.removeEventListener('pointermove', mover); R.prog.removeEventListener('pointerup', soltar); R.prog.removeEventListener('pointercancel', soltar); R.prog.classList.remove('arr'); P.arrastando = false; if (ev.type === 'pointerup' && P.s.faixa) irPara(fracao(ev) * P.s.faixa.ms); else pintarProgresso(); };
    R.prog.addEventListener('pointermove', mover); R.prog.addEventListener('pointerup', soltar); R.prog.addEventListener('pointercancel', soltar);
    mover(e);
  });
  R.prog.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); irPara(posicaoAgora() + (e.key === 'ArrowRight' ? 5000 : -5000)); } });
  R.vol.addEventListener('input', () => volume(Number(R.vol.value)));

  // teclas dentro da tela (fora dos campos de texto)
  R.pg.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey) return;
    const comer = (fn) => { e.preventDefault(); e.stopPropagation(); fn(); };
    if (e.altKey) { if (e.key === 'ArrowLeft') comer(voltar); return; }
    if (!E.est || !E.est.logado) return;
    if (e.key === ' ' && !e.target.closest('button')) return comer(alternar);
    if (e.key === '/') return comer(() => R.busca.focus());
    const v = E.vista;
    if (v && MODO[v.tipo] === 'faixas' && v.pintar && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return comer(() => {
      v.sel = Math.max(0, Math.min(v.total - 1, v.sel + (e.key === 'ArrowDown' ? 1 : -1)));
      const rol = R.view.querySelector('.bsp-rolagem'), caixa = R.view.querySelector('.bsp-faixas'), y = caixa.offsetTop + v.sel * ALT;
      if (y < rol.scrollTop) rol.scrollTop = y; else if (y + ALT > rol.scrollTop + rol.clientHeight) rol.scrollTop = y + ALT - rol.clientHeight;
      v.pintar(true);
    });
    if (e.key === 'Enter' && v && v.sel >= 0 && !e.target.closest('button, a')) return comer(() => tocarLinha({ f: v.itens[v.sel], i: v.sel, v }));
  });
  new ResizeObserver(() => { if (E.vista && E.vista.pintar && naTela()) E.vista.pintar(); }).observe(R.view);
  desenhar();
}

// ---------- registro (no topo, para o BS.plugins.reload desfazer sozinho) ----------
montarLado();
bs.tools.register({ id: ID, title: 'BlueSpotify', icon: IC.app, order: 70, page: ID, render() { bs.$('#toolBody').replaceChildren(R.lado); pintarLado(); } });
bs.pages.register({
  id: ID, title: 'BlueSpotify', icon: IC.app, pinned: true, render: montar,
  show() { if (E.est && E.est.logado) { sincronizar(); const v = E.vista; if (v && v.pintar) requestAnimationFrame(() => { const rol = R.view.querySelector('.bsp-rolagem'); if (rol && E.vista === v) { rol.scrollTop = v.rolagem || 0; v.pintar(true); } }); } else if (!E.esperandoLogin) atualizarEstado(); },
  hide() { const rol = R.view && R.view.querySelector('.bsp-rolagem'); if (rol && E.vista) E.vista.rolagem = rol.scrollTop; agendar(); },
});
bs.bubble.register({ id: MINI, title: 'BlueSpotify', icon: IC.app, footer: true, order: 70, width: 340, height: 252, render: montarJanelinha, show() { pintarJanelinha(); sincronizar(); }, hide() { agendar(); } });
bs.keys.add('Ctrl+Alt+M', () => { bs.pages.open(ID); });
bs.keys.add('Ctrl+Alt+P', () => { if (!E.est || !E.est.logado) return false; alternar(); });
bs.keys.add('Ctrl+Alt+.', () => { if (!E.est || !E.est.logado) return false; pular(1); });
bs.keys.add('Ctrl+Alt+,', () => { if (!E.est || !E.est.logado) return false; pular(-1); });
const pronto = (fn) => () => { if (!E.est || !E.est.logado) { bs.pages.open(ID); return toast('Conecte o Spotify primeiro.', '', 'bsp'); } fn(); };
bs.actions.add([
  { label: 'BlueSpotify: abrir', k: 'Ctrl+Alt+M', icon: IC.app, run: () => bs.pages.open(ID) },
  { label: 'BlueSpotify: player compacto', icon: IC.app, run: () => bs.bubble.open(MINI) },
  { label: 'BlueSpotify: tocar ou pausar', k: 'Ctrl+Alt+P', icon: IC.play, run: pronto(alternar) },
  { label: 'BlueSpotify: próxima faixa', k: 'Ctrl+Alt+.', icon: IC.next, run: pronto(() => pular(1)) },
  { label: 'BlueSpotify: faixa anterior', k: 'Ctrl+Alt+,', icon: IC.prev, run: pronto(() => pular(-1)) },
  { label: 'BlueSpotify: curtir a faixa atual', icon: IC.heart, run: pronto(curtirAtual) },
  { label: 'BlueSpotify: buscar música', icon: IC.search, run: pronto(() => { bs.pages.open(ID); setTimeout(() => R.busca && R.busca.focus(), 60); }) },
  { label: 'BlueSpotify: fila', icon: IC.queue, run: pronto(() => { bs.pages.open(ID); ir('fila'); }) },
  { label: 'BlueSpotify: escolher dispositivo', icon: IC.device, run: pronto(() => dialogoDispositivos()) },
  { label: 'BlueSpotify: configurações', icon: IC.gear, run: () => plugin.settings.open() },
]);

bs.hooks.on('tab:activate', () => agendar());
const aoVer = () => { if (document.visibilityState === 'visible') sincronizar(); else agendar(); };
document.addEventListener('visibilitychange', aoVer);
plugin.onUnload(() => {
  morto = true;
  Object.values(T).forEach((t) => { clearTimeout(t); clearInterval(t); });
  clearTimeout(P.volTimer);
  document.removeEventListener('visibilitychange', aoVer);
  Local.soltar(); if (window.onSpotifyWebPlaybackSDKReady) window.onSpotifyWebPlaybackSDKReady = () => {};
  bs.footer.remove(ID);
  for (const id of ['bspDisp', 'bspSair']) { const d = document.getElementById(id); if (d) d.remove(); }
});

const aplicarCfg = (c) => { E.cfg = { local: c.local !== false, mini: c.mini !== false }; };
plugin.settings.onChange((c) => {
  aplicarCfg(c || {});
  if (!E.cfg.local) Local.desligar();
  pintado.mini = undefined; pintarMini();
  atualizarEstado();
});
plugin.settings.get().then((c) => aplicarCfg(c || {})).catch(() => {}).then(atualizarEstado);
