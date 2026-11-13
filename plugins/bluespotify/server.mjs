// Servidor do BlueSpotify (Node.js 18+, sem dependências).
// - Guarda a conexão com o Spotify: o refresh token fica nos segredos do BlueScreen (cifrado pelo Windows) e o token
//   de acesso só na memória deste processo, renovado sozinho.
// - Atende as rotas da tela (/api/bluespotify/...), que só o BlueScreen alcança (cabeçalho x-bluescreen-token).
// - Abre a porta do retorno do login (http://127.0.0.1:<porta>/callback) só enquanto um login está em andamento.
// - Atende os nós do Automator em /ponte: o programa do nó (no.mjs) não recebe token nenhum, só a porta e uma chave
//   sorteada a cada início, gravadas em <pasta de dados>/ponte.json.
// - Abre, quando a tela pede, o player em segundo plano (lib/fundo.mjs): o Edge escondido tocando como "BlueScreen",
//   para quem não tem o aplicativo do Spotify. A página dele fala com /tocador usando outra chave sorteada.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { Spotify, Falha, BASE_API, BASE_CONTAS } from './lib/spotify.mjs';
import { Acoes } from './lib/acoes.mjs';
import { acharNavegador, argumentosNavegador, esconderJanela, paginaTocador } from './lib/fundo.mjs';

const require = createRequire(import.meta.url);
const { Plugin } = require(path.join(process.env.BLUESCREEN_SDK, 'bluescreen.js'));

const p = new Plugin();
const TOKEN_NUCLEO = process.env.BLUESCREEN_TOKEN || '';
const PASTA_DADOS = process.env.BLUESCREEN_PLUGIN_DATA || '';
const ARQ_PONTE = PASTA_DADOS ? path.join(PASTA_DADOS, 'ponte.json') : '';
const CHAVE_PONTE = crypto.randomBytes(32).toString('hex');
const CHAVE_TOCADOR = crypto.randomBytes(32).toString('hex');
const TITULO_TOCADOR = 'bluespotify-' + crypto.randomBytes(6).toString('hex'); // acha a janela do player para escondê-la
const PORTA_PADRAO = 8974;
const SDK_URL = process.env.BLUESPOTIFY_SDK_URL || 'https://sdk.scdn.co/spotify-player.js';
const TESTE = BASE_API !== 'https://api.spotify.com/v1';

async function config() {
  let c = {};
  try { c = (await p.settings()) || {}; } catch {}
  const porta = Number(c.porta);
  return { clientId: String(c.clientId || '').trim(), porta: porta >= 1024 && porta <= 65535 ? Math.round(porta) : PORTA_PADRAO, local: c.local !== false };
}
const redirectDe = (porta) => `http://127.0.0.1:${porta}/callback`;

let refreshMemoria; // evita ler o segredo a cada pedido
const sp = new Spotify({
  clientId: async () => (await config()).clientId,
  guardar: {
    ler: async () => { if (refreshMemoria === undefined) refreshMemoria = (await p.secrets.get('refresh')) || null; return refreshMemoria; },
    gravar: async (v) => { refreshMemoria = v || null; await p.secrets.set('refresh', v || ''); },
  },
});
const acoes = new Acoes(sp);
let premium = null; // true | false | null (o Spotify não diz mais o plano em /me: descobrimos pelo que ele recusa)
let login = { andamento: false, erro: '' };
let urlLogin = '';
// O login abre no navegador do Windows (dentro do BlueScreen, a janela do Spotify ficaria presa ao WebView).
function abrirNavegador(url) {
  if (!/^https?:\/\//.test(url)) return;
  if (process.env.BLUESPOTIFY_NAO_ABRIR) { console.log('BlueSpotify: abriria ' + url); return; }
  if (process.platform === 'win32') spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
sp.aoMudar = () => { acoes.eu = null; };

function marcarPremium(v) {
  if (premium === v) return;
  premium = v;
  p.data.set('premium', v).catch(() => {});
}

// ---------- retorno do login ----------
let ouvinte = null, ouvinteFim = 0;
function fecharOuvinte() { if (ouvinte) { ouvinte.close(); ouvinte.closeAllConnections?.(); ouvinte = null; } clearTimeout(ouvinteFim); }
const paginaRetorno = (ok, texto) => `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BlueSpotify</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#191b21;color:#e1e4ea;font:15px/1.5 system-ui,sans-serif">
<div style="max-width:420px;padding:24px;text-align:center"><div style="font-size:40px;line-height:1;color:${ok ? '#1db954' : '#f0606e'}">${ok ? '&#10003;' : '&#10007;'}</div>
<h1 style="font-size:18px;margin:14px 0 6px">${ok ? 'Spotify conectado' : 'Não deu para conectar'}</h1><p style="margin:0;color:#b4b9c4">${texto}</p></div></body></html>`;
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function abrirOuvinte(porta) {
  return new Promise((ok, falha) => {
    fecharOuvinte();
    const s = http.createServer(async (rq, rs) => {
      const u = new URL(rq.url, 'http://127.0.0.1');
      const responder = (status, html) => { rs.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); rs.end(html); };
      if (rq.method !== 'GET' || u.pathname !== '/callback') return responder(404, paginaRetorno(false, 'Endereço desconhecido.'));
      try {
        if (u.searchParams.get('error')) throw new Falha('login', u.searchParams.get('error') === 'access_denied' ? 'Você não autorizou o acesso no Spotify.' : 'O Spotify devolveu: ' + u.searchParams.get('error'));
        await sp.concluirLogin(u.searchParams.get('state'), u.searchParams.get('code'));
        login = { andamento: false, erro: '' };
        responder(200, paginaRetorno(true, 'Pode fechar esta aba e voltar ao BlueScreen.'));
      } catch (e) {
        login = { andamento: false, erro: e.message };
        responder(400, paginaRetorno(false, escHtml(e.message)));
      }
      setTimeout(fecharOuvinte, 200);
    });
    s.once('error', (e) => falha(new Falha('porta', e.code === 'EADDRINUSE'
      ? `A porta ${porta} já está em uso por outro programa. Troque a porta nas configurações do BlueSpotify e no endereço de retorno do app no Spotify.`
      : `Não deu para abrir a porta ${porta}: ${e.message}`)));
    s.listen(porta, '127.0.0.1', () => {
      ouvinte = s;
      ouvinteFim = setTimeout(() => { fecharOuvinte(); if (login.andamento) login = { andamento: false, erro: 'O login não foi concluído em 5 minutos. Tente de novo.' }; }, 5 * 60000);
      ok();
    });
  });
}

// ---------- player em segundo plano ----------
let portaServidor = 0;
const fundo = { fase: 'desligado', id: '', msg: '', ligado: false, processo: null, visto: 0, prazo: 0 };
const MSG_FUNDO = {
  'sem-navegador': 'Não achei o Microsoft Edge nem o Google Chrome neste PC para tocar sem o aplicativo do Spotify.',
  demora: 'O player em segundo plano não respondeu. Tente de novo em Dispositivos.',
};
const fundoPublico = () => ({ fase: fundo.fase, id: fundo.id, msg: fundo.msg });
function fundoParar(fase = 'desligado', msg = '') {
  clearTimeout(fundo.prazo);
  const pr = fundo.processo; fundo.processo = null; fundo.ligado = false;
  // a página fecha sozinha no próximo aviso (ela recebe "fechar"); matar o processo é a garantia
  if (pr) setTimeout(() => { try { pr.kill(); } catch {} }, 1500);
  Object.assign(fundo, { fase, id: '', msg });
}
function fundoLigar() {
  if (fundo.ligado) return;
  const nav = acharNavegador();
  if (!nav) return fundoParar('erro', MSG_FUNDO['sem-navegador']);
  if (!PASTA_DADOS || !portaServidor) return fundoParar('erro', 'O BlueSpotify ainda está iniciando. Tente de novo.');
  const perfil = path.join(PASTA_DADOS, 'tocador');
  try { fs.mkdirSync(perfil, { recursive: true }); } catch {}
  const url = `http://127.0.0.1:${portaServidor}/tocador?k=${CHAVE_TOCADOR}`;
  Object.assign(fundo, { fase: 'abrindo', id: '', msg: '', ligado: true, visto: Date.now() });
  // windowsHide: o Edge abre a janela escondida; o som sai normalmente. Se já houver um Edge com este perfil, ele
  // abre a página e este processo termina logo: por isso "ligado" não depende do processo.
  const pr = spawn(nav, argumentosNavegador(url, perfil), { stdio: 'ignore', windowsHide: true });
  esconderJanela(TITULO_TOCADOR);
  fundo.processo = pr;
  pr.once('error', (e) => { if (fundo.processo === pr) fundoParar('erro', 'Não deu para abrir o navegador: ' + e.message); });
  pr.once('exit', () => { if (fundo.processo === pr) fundo.processo = null; });
  clearTimeout(fundo.prazo);
  fundo.prazo = setTimeout(() => { if (fundo.fase === 'abrindo' || fundo.fase === 'carregando') fundoParar('erro', MSG_FUNDO.demora); }, 60000);
}
// Abre o player (se preciso) e espera ficar pronto: é o que as ações usam quando não há aparelho nenhum aberto
acoes.garantirLocal = async () => {
  if (!(await config()).local || premium === false) return '';
  fundoLigar();
  for (let i = 0; i < 100 && fundo.ligado && fundo.fase !== 'pronto'; i++) await new Promise((r) => setTimeout(r, 300));
  return fundo.fase === 'pronto' ? fundo.id : '';
};
// o player dentro do WebView não ficou pronto neste PC: nas próximas vezes, direto para o de segundo plano
let webview = null;
p.data.get('webview').then((v) => { if (typeof v === 'boolean') webview = v; }).catch(() => {});

// a página avisa a cada 5 s; sem aviso por 20 s, a janela foi fechada
setInterval(() => { if (fundo.fase === 'pronto' && Date.now() - fundo.visto > 20000) fundoParar(); }, 5000).unref();

async function atenderTocador(rq, rs, u) {
  const enviar = (status, corpo, tipo = 'application/json; charset=utf-8') => {
    rs.writeHead(status, { 'content-type': tipo, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' });
    rs.end(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
  };
  if (!igual(u.searchParams.get('k'), CHAVE_TOCADOR)) return enviar(403, { erro: 'acesso negado' });
  if (u.pathname === '/tocador' && rq.method === 'GET') return enviar(200, paginaTocador(SDK_URL, TITULO_TOCADOR), 'text/html; charset=utf-8');
  if (rq.headers['sec-fetch-site'] && rq.headers['sec-fetch-site'] !== 'same-origin') return enviar(403, { erro: 'acesso negado' });
  if (u.pathname === '/tocador/token' && rq.method === 'GET') {
    try { return enviar(200, { token: fundo.ligado ? await sp.token() : '' }); } catch { return enviar(200, { token: '' }); }
  }
  if (u.pathname === '/tocador/estado' && rq.method === 'POST') {
    if (!fundo.ligado) return enviar(200, { fechar: true });
    const b = await lerCorpo(rq);
    fundo.visto = Date.now();
    const fase = ['carregando', 'pronto', 'erro', 'auth', 'sem-premium', 'rede'].includes(b.fase) ? b.fase : 'carregando';
    if (fase !== 'carregando' && fase !== 'pronto') { fundoParar(fase === 'sem-premium' ? 'sem-premium' : 'erro', String(b.msg || '').slice(0, 300)); if (fase === 'sem-premium') marcarPremium(false); return enviar(200, { fechar: true }); }
    // ficou pronto agora: confere de novo que a janela não está à vista (a página pode ter recarregado)
    if (fase === 'pronto' && fundo.fase !== 'pronto') { clearTimeout(fundo.prazo); esconderJanela(TITULO_TOCADOR, 5); }
    fundo.fase = fase; fundo.id = fase === 'pronto' ? String(b.id || '').slice(0, 100) : '';
    return enviar(200, { fechar: false });
  }
  return enviar(404, { erro: 'rota desconhecida' });
}

// ---------- rotas da tela ----------
const rotas = {
  async estado() {
    const c = await config();
    const logado = !!c.clientId && (await sp.logado());
    let usuario = null, aviso = null;
    if (logado) {
      try { usuario = await acoes.perfil(); }
      catch (e) { if (e.codigo === 'deslogado') return { ...(await rotas.estado()) }; aviso = { codigo: e.codigo, erro: e.message, esperar: e.esperar }; }
    }
    return { configurado: !!c.clientId, logado, usuario, premium, webview, redirect: redirectDe(c.porta), porta: c.porta, login, aviso, sdk: SDK_URL, teste: TESTE };
  },
  async entrar() {
    const c = await config();
    if (!c.clientId) throw new Falha('sem-client-id');
    await abrirOuvinte(c.porta);
    login = { andamento: true, erro: '' };
    urlLogin = await sp.iniciarLogin(redirectDe(c.porta));
    abrirNavegador(urlLogin);
    return { url: urlLogin };
  },
  // abre de novo a página de login (a aba foi fechada sem querer)
  async 'abrir-login'() { if (!login.andamento || !urlLogin) throw new Falha('login', 'Clique em Conectar de novo.'); abrirNavegador(urlLogin); return {}; },
  // Confere o Client ID antes de abrir o navegador (ideia do Spotifast): um pedido de token com um código que não
  // pode valer volta "invalid_client" para um ID que o Spotify não conhece e "invalid_grant" para um que conhece.
  async verificar(q, corpo) {
    const id = String(corpo.clientId || '').trim();
    if (!TESTE && !/^[0-9a-f]{32}$/i.test(id)) return { valido: false, motivo: 'formato' };
    try {
      const r = await fetch(`${BASE_CONTAS}/api/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
        body: new URLSearchParams({ client_id: id, grant_type: 'authorization_code', code: 'bluespotify-conferencia', redirect_uri: redirectDe((await config()).porta), code_verifier: crypto.randomBytes(48).toString('base64url') }) });
      const j = await r.json().catch(() => null);
      if (j && j.error === 'invalid_client') return { valido: false, motivo: 'desconhecido' };
      return { valido: true };
    } catch { return { valido: true, semConferir: true }; } // sem rede: o navegador descobre
  },
  async sair() {
    fecharOuvinte(); login = { andamento: false, erro: '' }; fundoParar();
    await sp.esquecer(); marcarPremium(null);
    return {};
  },
  // o token de acesso só sai daqui para o Web Playback SDK (que roda na página e exige recebê-lo)
  async token() { return { token: await sp.token() }; },
  // player em segundo plano: a tela liga quando o WebView não toca (sem Widevine) e acompanha a fase
  async fundo() { if (!(await sp.logado())) throw new Falha('deslogado'); fundoLigar(); return fundoPublico(); },
  async 'fundo-estado'() { return fundoPublico(); },
  async 'fundo-parar'() { fundoParar(); return {}; },
  async webview(q, corpo) { webview = corpo.ok === true ? true : corpo.ok === false ? false : null; p.data.set('webview', webview).catch(() => {}); return {}; },
  async lista(q) { return acoes.lista(q.tipo, { id: q.id, offset: q.offset, depois: q.depois }); },
  async busca(q) { return acoes.busca(q.q); },
  async player() { return acoes.player(); },
  async dispositivos() { return { dispositivos: await acoes.dispositivos() }; },
  // listas dos seletores do Automator (campo "choicesFrom"): os dispositivos abertos e as suas playlists
  async opcoes(q) {
    if (!(await sp.logado())) return { choices: [] };
    if (q.tipo === 'dispositivos') return { choices: (await acoes.dispositivos()).filter((d) => !d.restrito).map((d) => ({ value: d.nome, label: d.nome + (d.ativo ? ' (tocando)' : '') })) };
    if (q.tipo === 'playlists') {
      const out = [];
      for (let offset = 0; offset < 500; offset += 50) {
        const pg = await acoes.lista('playlists', { offset });
        out.push(...pg.itens.filter((x) => q.minhas !== '1' || x.minha));
        if (offset + 50 >= pg.total || !pg.itens.length) break;
      }
      return { choices: out.map((x) => ({ value: x.nome, label: x.nome })) };
    }
    return { choices: [] };
  },
  async fila() { return acoes.fila(); },
  async comando(q, corpo) {
    try { await acoes.comando(corpo); marcarPremium(true); }
    catch (e) { if (e.codigo === 'premium') marcarPremium(false); throw e; }
    return {};
  },
  async contem(q, corpo) { return { contem: await acoes.curtidasContem((corpo.uris || []).slice(0, 200)) }; },
  async curtir(q, corpo) { await acoes.curtir((corpo.uris || []).slice(0, 200), !!corpo.on); return {}; },
  async 'playlist-adicionar'(q, corpo) { await acoes.playlistAdicionar(String(corpo.playlist), (corpo.uris || []).slice(0, 500)); return {}; },
  async premium(q, corpo) { marcarPremium(corpo.valor === true ? true : corpo.valor === false ? false : null); return {}; },
  // abre o item no aplicativo do Spotify (spotify:...) pelo Windows
  async abrir(q, corpo) {
    const uri = String(corpo.uri || '');
    if (!/^spotify:(?:(?:track|album|playlist|artist|episode|show|user):[A-Za-z0-9]+|collection:tracks)?$/.test(uri)) throw new Falha('spotify', 'Endereço do Spotify inválido.');
    if (process.env.BLUESPOTIFY_NAO_ABRIR) return { simulado: uri };
    if (process.platform !== 'win32') throw new Falha('spotify', 'Abrir no aplicativo só funciona no Windows.');
    spawn('rundll32.exe', ['url.dll,FileProtocolHandler', uri], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return {};
  },
};

function resposta(e) {
  if (e instanceof Falha) return { ok: false, codigo: e.codigo, erro: e.message, esperar: e.esperar };
  console.error(e);
  return { ok: false, codigo: 'interno', erro: 'Erro no BlueSpotify: ' + (e && e.message ? e.message : e) };
}
const lerCorpo = async (rq) => { const partes = []; let n = 0; for await (const c of rq) { n += c.length; if (n > 1e6) throw new Falha('spotify', 'Pedido grande demais.'); partes.push(c); } const t = Buffer.concat(partes).toString('utf8').trim(); return t ? JSON.parse(t) : {}; };
const igual = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

const servidor = http.createServer(async (rq, rs) => {
  const enviar = (status, corpo) => { rs.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); rs.end(JSON.stringify(corpo)); };
  try {
    const u = new URL(rq.url, 'http://127.0.0.1');
    // nós do Automator: só programas deste PC que leram a chave na pasta de dados (um navegador nunca chega aqui)
    if (u.pathname === '/tocador' || u.pathname.startsWith('/tocador/')) return await atenderTocador(rq, rs, u);
    if (u.pathname === '/ponte') {
      if (rq.method !== 'POST' || rq.headers.origin || rq.headers['sec-fetch-site'] || !igual(rq.headers['x-bluespotify-chave'], CHAVE_PONTE)) return enviar(403, { ok: false, erro: 'acesso negado' });
      const b = await lerCorpo(rq);
      try {
        const valor = await acoes.no(String(b.no || ''), b.params || {}, b.entrada);
        if (/^(tocar|pausar|pular|volume|fila|dispositivo)$/.test(b.no)) marcarPremium(true); // o Spotify aceitou um comando do player
        return enviar(200, { ok: true, valor });
      }
      catch (e) { if (e.codigo === 'premium') marcarPremium(false); return enviar(200, resposta(e)); }
    }
    if (!TOKEN_NUCLEO || !igual(rq.headers['x-bluescreen-token'], TOKEN_NUCLEO)) return enviar(403, { error: 'acesso negado' });
    if (rq.headers['x-bluescreen-remote'] === '1') return enviar(403, { error: 'O BlueSpotify só responde no próprio PC.' });
    const nome = u.pathname.replace(/^\/api\//, '').replace(/^bluespotify\//, '');
    const rota = Object.hasOwn(rotas, nome) ? rotas[nome] : null;
    if (!rota) return enviar(404, { error: 'rota desconhecida' });
    try { enviar(200, { ok: true, ...(await rota(Object.fromEntries(u.searchParams), rq.method === 'POST' ? await lerCorpo(rq) : {})) }); }
    catch (e) { enviar(200, resposta(e)); }
  } catch (e) { enviar(500, { error: String(e && e.message ? e.message : e) }); }
});

function limpar() { try { if (ARQ_PONTE) fs.rmSync(ARQ_PONTE, { force: true }); } catch {} try { if (fundo.processo) fundo.processo.kill(); } catch {} }
process.on('exit', limpar);
for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, () => process.exit(0));

p.data.get('premium').then((v) => { if (premium === null && typeof v === 'boolean') premium = v; }).catch(() => {});
servidor.listen(0, '127.0.0.1', () => {
  const porta = servidor.address().port;
  portaServidor = porta;
  if (ARQ_PONTE) {
    try { fs.mkdirSync(PASTA_DADOS, { recursive: true }); fs.writeFileSync(ARQ_PONTE, JSON.stringify({ porta, chave: CHAVE_PONTE, pid: process.pid }), { mode: 0o600 }); }
    catch (e) { console.error('BlueSpotify: não gravei ponte.json (os nós do Automator não vão funcionar): ' + e.message); }
  }
  process.stdout.write('BLUESCREEN-READY ' + JSON.stringify({ port: porta, routes: Object.keys(rotas).map((r) => 'bluespotify/' + r).sort() }) + '\n');
  if (TESTE) console.log(`BlueSpotify em modo de teste: API ${BASE_API}, contas ${BASE_CONTAS}`);
});
