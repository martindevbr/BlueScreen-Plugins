// Servidor do BlueSpotify (Node.js 18+, sem dependências).
// - Guarda a conexão com o Spotify: o refresh token fica nos segredos do BlueScreen (cifrado pelo Windows) e o token
//   de acesso só na memória deste processo, renovado sozinho.
// - Atende as rotas da tela (/api/bluespotify/...), que só o BlueScreen alcança (cabeçalho x-bluescreen-token).
// - Abre a porta do retorno do login (http://127.0.0.1:<porta>/callback) só enquanto um login está em andamento.
// - Atende os nós do Automator em /ponte: o programa do nó (no.mjs) não recebe token nenhum, só a porta e uma chave
//   sorteada a cada início, gravadas em <pasta de dados>/ponte.json.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { Spotify, Falha, BASE_API, BASE_CONTAS } from './lib/spotify.mjs';
import { Acoes } from './lib/acoes.mjs';

const require = createRequire(import.meta.url);
const { Plugin } = require(path.join(process.env.BLUESCREEN_SDK, 'bluescreen.js'));

const p = new Plugin();
const TOKEN_NUCLEO = process.env.BLUESCREEN_TOKEN || '';
const PASTA_DADOS = process.env.BLUESCREEN_PLUGIN_DATA || '';
const ARQ_PONTE = PASTA_DADOS ? path.join(PASTA_DADOS, 'ponte.json') : '';
const CHAVE_PONTE = crypto.randomBytes(32).toString('hex');
const PORTA_PADRAO = 8974;
const SDK_URL = process.env.BLUESPOTIFY_SDK_URL || 'https://sdk.scdn.co/spotify-player.js';
const TESTE = BASE_API !== 'https://api.spotify.com/v1';

async function config() {
  let c = {};
  try { c = (await p.settings()) || {}; } catch {}
  const porta = Number(c.porta);
  return { clientId: String(c.clientId || '').trim(), porta: porta >= 1024 && porta <= 65535 ? Math.round(porta) : PORTA_PADRAO };
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
    return { configurado: !!c.clientId, logado, usuario, premium, redirect: redirectDe(c.porta), porta: c.porta, login, aviso, sdk: SDK_URL, teste: TESTE };
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
    fecharOuvinte(); login = { andamento: false, erro: '' };
    await sp.esquecer(); marcarPremium(null);
    return {};
  },
  // o token de acesso só sai daqui para o Web Playback SDK (que roda na página e exige recebê-lo)
  async token() { return { token: await sp.token() }; },
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

function limpar() { try { if (ARQ_PONTE) fs.rmSync(ARQ_PONTE, { force: true }); } catch {} }
process.on('exit', limpar);
for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, () => process.exit(0));

p.data.get('premium').then((v) => { if (premium === null && typeof v === 'boolean') premium = v; }).catch(() => {});
servidor.listen(0, '127.0.0.1', () => {
  const porta = servidor.address().port;
  if (ARQ_PONTE) {
    try { fs.mkdirSync(PASTA_DADOS, { recursive: true }); fs.writeFileSync(ARQ_PONTE, JSON.stringify({ porta, chave: CHAVE_PONTE, pid: process.pid }), { mode: 0o600 }); }
    catch (e) { console.error('BlueSpotify: não gravei ponte.json (os nós do Automator não vão funcionar): ' + e.message); }
  }
  process.stdout.write('BLUESCREEN-READY ' + JSON.stringify({ port: porta, routes: Object.keys(rotas).map((r) => 'bluespotify/' + r).sort() }) + '\n');
  if (TESTE) console.log(`BlueSpotify em modo de teste: API ${BASE_API}, contas ${BASE_CONTAS}`);
});
