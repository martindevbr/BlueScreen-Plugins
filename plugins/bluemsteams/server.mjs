// BlueMSTeamsAutomator: servidor do plugin.
// Guarda os destinos (webhooks, canais, chats), faz o login por código de dispositivo, renova o token, fala com o
// Microsoft Graph e com os webhooks dos Workflows, e atende os nós do Automator por uma ponte local (ver "ponte").
// Tokens e URLs de webhook ficam em plugin.secrets (cifrados pelo Windows); nunca vão para a página nem para o fluxo.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { emails, lerLink, ehLinkTeams, linkChat, linkChamada, linkAgendar, paraApp } from './lib/links.mjs';
import { montarCartao, cartaoTexto, envelope, modelo, modelosParaTela } from './lib/cartoes.mjs';
import { filtrarNovas } from './lib/novas.mjs';

const require = createRequire(import.meta.url);
const { Plugin } = require(path.join(process.env.BLUESCREEN_SDK, 'bluescreen.js'));
const p = new Plugin();
const DADOS = process.env.BLUESCREEN_PLUGIN_DATA || '';

const GRAPH_PADRAO = 'https://graph.microsoft.com/v1.0';
const LOGIN_PADRAO = 'https://login.microsoftonline.com';
// Permissões delegadas que o plugin pede. Nenhuma destas exige consentimento do administrador.
const ESCOPOS = [
  ['User.Read', 'saber quem é você'],
  ['User.ReadBasic.All', 'achar pessoas pelo e-mail (menções e chats)'],
  ['Team.ReadBasic.All', 'listar os seus times'],
  ['Channel.ReadBasic.All', 'listar os canais de um time'],
  ['ChannelMessage.Send', 'enviar e responder em canais'],
  ['Chat.Read', 'listar os seus chats e ler as mensagens'],
  ['ChatMessage.Send', 'enviar em chats'],
  ['Chat.Create', 'abrir um chat com uma pessoa'],
  ['Presence.Read', 'ler a sua presença'],
  ['Presence.ReadWrite', 'mudar a presença e a mensagem de status'],
  ['OnlineMeetings.ReadWrite', 'criar reunião e pegar o link'],
  ['Calendars.ReadWrite', 'ler a agenda e marcar reunião com convidados'],
  ['Files.ReadWrite.All', 'enviar arquivos para canais e chats'],
];
// Esta exige o administrador: só entra no pedido se a pessoa ligar "Ler mensagens de canal" nas configurações.
const ESCOPO_LER_CANAL = ['ChannelMessage.Read.All', 'ler as mensagens de um canal'];

class Falha extends Error {
  constructor(msg, extra = {}) { super(msg); Object.assign(this, { status: 400 }, extra); }
}
const txt = (v) => String(v ?? '').trim();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const id8 = () => crypto.randomBytes(4).toString('hex');

// ---------- configuração ----------
let cfgCache = null, cfgEm = 0;
async function config() {
  if (cfgCache && Date.now() - cfgEm < 2000) return cfgCache;
  const v = await p.settings();
  const base = (valor, padrao) => (txt(valor) || padrao).replace(/\/+$/, '');
  cfgCache = {
    clientId: txt(v.clientId), tenant: txt(v.tenant) || 'organizations',
    graph: base(process.env.BLUEMSTEAMS_GRAPH || v.graphBase, GRAPH_PADRAO), login: base(process.env.BLUEMSTEAMS_LOGIN || v.loginBase, LOGIN_PADRAO),
    lerCanal: v.lerCanal === true || v.lerCanal === 'true', abrir: v.abrirCom === 'web' ? 'web' : 'app',
  };
  cfgEm = Date.now();
  return cfgCache;
}
const escoposPedidos = (c) => [...ESCOPOS, ...(c.lerCanal ? [ESCOPO_LER_CANAL] : [])];

// ---------- HTTP ----------
async function pedir(url, opt = {}) {
  let host = url;
  try { host = new URL(url).host; } catch { throw new Falha('endereço inválido'); }
  try { return await fetch(url, { ...opt, redirect: 'error', signal: AbortSignal.timeout(opt.timeout || 25000) }); } catch (e) {
    if (e.name === 'TimeoutError') throw new Falha(`${host} demorou demais para responder.`, { status: 504, codigo: 'offline' });
    throw new Falha(`Sem conexão: não deu para falar com ${host}.`, { status: 503, codigo: 'offline' });
  }
}
function esperaPedida(r) {
  const h = r.headers.get('retry-after');
  if (!h) return 10;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(1, Math.ceil(n));
  const d = Date.parse(h);
  return Number.isFinite(d) ? Math.max(1, Math.ceil((d - Date.now()) / 1000)) : 10;
}
// quando o Teams manda esperar, a tela mostra a contagem em vez de insistir
const LIMITE = { graph: 0, webhook: 0 };
function limite(qual, segundos) {
  LIMITE[qual] = Date.now() + segundos * 1000;
  return new Falha(`O Teams pediu para esperar ${segundos} s antes de enviar de novo (limite de pedidos).`, { status: 429, codigo: 'limite', retryAfter: segundos });
}

// ---------- conta Microsoft: código de dispositivo, token e renovação ----------
const T = { acesso: '', exp: 0, escopos: [], lido: false, renovando: null };
const L = { atual: null };

function erroLogin(j, status) {
  const d = txt(j?.error_description), cod = (d.match(/AADSTS\d+/) || [''])[0];
  const dicas = {
    AADSTS700016: 'O Client ID não existe neste tenant. Confira o Client ID e o tenant nas configurações do plugin.',
    AADSTS7000218: 'O app não aceita login sem segredo. No registro do app, em Autenticação, ligue "Permitir fluxos de cliente público".',
    AADSTS70002: 'O app não aceita login sem segredo. No registro do app, em Autenticação, ligue "Permitir fluxos de cliente público".',
    AADSTS90002: 'Tenant não encontrado. Confira o tenant nas configurações do plugin.',
    AADSTS900023: 'Tenant inválido. Use o id do diretório, o domínio (empresa.com.br) ou "organizations".',
    AADSTS65001: 'Falta consentimento para as permissões do app. Peça ao administrador para aprovar, ou desligue "Ler mensagens de canal".',
    AADSTS90094: 'O administrador precisa aprovar as permissões do app antes do primeiro login.',
    AADSTS53003: 'O Acesso Condicional da sua empresa bloqueou o login por código de dispositivo. Fale com o TI.',
    AADSTS50059: 'Informe o tenant nas configurações do plugin (id do diretório ou domínio).',
    AADSTS70011: 'O app não reconhece uma das permissões pedidas. Confira as permissões no registro do app.',
    AADSTS50076: 'A sua empresa pede a verificação em duas etapas de novo. Entre outra vez.',
  };
  const msg = dicas[cod] || (j?.error === 'unauthorized_client' ? dicas.AADSTS7000218 : j?.error === 'invalid_client' ? dicas.AADSTS7000218 : '') || `A Microsoft recusou o login${cod ? ` (${cod})` : status ? ` (${status})` : ''}: ${d.split(/\r?\n/)[0] || j?.error || 'sem detalhe'}`;
  return new Falha(msg, { status: 400, codigo: 'login', aad: cod || txt(j?.error) });
}
async function formulario(url, campos) {
  const r = await pedir(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(campos).toString() });
  let j = null;
  try { j = await r.json(); } catch {}
  return { r, j };
}
async function lerToken() {
  if (T.lido) return;
  try { const j = JSON.parse((await p.secrets.get('graph.acesso')) || 'null'); if (j) Object.assign(T, { acesso: j.acesso, exp: j.exp, escopos: j.escopos || [] }); } catch {}
  T.lido = true;
}
async function guardarToken(j) {
  Object.assign(T, { acesso: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000, escopos: txt(j.scope).split(/\s+/).filter(Boolean), lido: true });
  await p.secrets.set('graph.acesso', JSON.stringify({ acesso: T.acesso, exp: T.exp, escopos: T.escopos }));
  if (j.refresh_token) await p.secrets.set('graph.renovar', j.refresh_token);
  await p.data.merge({ sessao: { estado: 'ok', exp: T.exp, escopos: T.escopos, em: Date.now() } });
}
async function renovar() {
  const c = await config();
  const guardado = await p.secrets.get('graph.renovar');
  if (!guardado) throw new Falha('Conecte a conta Microsoft no painel Teams.', { status: 401, codigo: 'sem-conta' });
  const { r, j } = await formulario(`${c.login}/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`, { grant_type: 'refresh_token', client_id: c.clientId, refresh_token: guardado, scope: ['offline_access', ...escoposPedidos(c).map((e) => e[0])].join(' ') });
  if (r.ok && j?.access_token) { await guardarToken(j); return T.acesso; }
  if (r.status === 429 || r.status >= 500) throw limite('graph', esperaPedida(r));
  // invalid_grant: o token de renovação venceu (90 dias parado), foi revogado ou a senha mudou
  Object.assign(T, { acesso: '', exp: 0 });
  await p.secrets.set('graph.acesso', null);
  await p.data.merge({ sessao: { estado: 'vencido', em: Date.now(), motivo: (txt(j?.error_description).match(/AADSTS\d+/) || [txt(j?.error)])[0] } });
  throw new Falha('A sessão da conta Microsoft venceu. Entre de novo no painel Teams.', { status: 401, codigo: 'vencido' });
}
async function token(forcar = false) {
  await lerToken();
  if (!forcar && T.acesso && T.exp - 120000 > Date.now()) return T.acesso;
  // uma renovação por vez: dois pedidos juntos gastariam o mesmo token de renovação
  T.renovando ||= renovar().finally(() => { T.renovando = null; });
  return T.renovando;
}
async function loginIniciar() {
  const c = await config();
  if (!c.clientId) throw new Falha('Informe o Client ID do app nas configurações do plugin.', { codigo: 'sem-app' });
  const { r, j } = await formulario(`${c.login}/${encodeURIComponent(c.tenant)}/oauth2/v2.0/devicecode`, { client_id: c.clientId, scope: ['offline_access', ...escoposPedidos(c).map((e) => e[0])].join(' ') });
  if (!r.ok || !j?.device_code) throw erroLogin(j, r.status);
  const l = L.atual = { codigo: j.user_code, url: j.verification_uri || 'https://microsoft.com/devicelogin', expira: Date.now() + (Number(j.expires_in) || 900) * 1000, intervalo: Math.max(1, Number(j.interval) || 5), device: j.device_code, estado: 'aguardando', erro: '' };
  sondarLogin(l, c).catch((e) => { l.estado = 'erro'; l.erro = e.message; });
  return loginVisivel();
}
async function sondarLogin(l, c) {
  while (L.atual === l && l.estado === 'aguardando') {
    if (Date.now() > l.expira) { l.estado = 'expirou'; l.erro = 'O código venceu. Peça outro.'; return; }
    await dormir(l.intervalo * 1000);
    if (L.atual !== l) return;
    let resp;
    try { resp = await formulario(`${c.login}/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: c.clientId, device_code: l.device }); } catch { continue; } // sem rede por um instante: tenta de novo
    const { r, j } = resp;
    if (r.ok && j?.access_token) {
      await guardarToken(j);
      try { const eu = await g('GET', '/me?$select=id,displayName,userPrincipalName,mail'); await p.data.set('conta', { id: eu.id, nome: eu.displayName, email: eu.mail || eu.userPrincipalName }); } catch {}
      l.estado = 'ok';
      return;
    }
    const erro = txt(j?.error);
    if (erro === 'authorization_pending') continue;
    if (erro === 'slow_down') { l.intervalo += 5; continue; }
    if (erro === 'authorization_declined') { l.estado = 'recusado'; l.erro = 'O login foi cancelado na página da Microsoft.'; return; }
    if (erro === 'expired_token') { l.estado = 'expirou'; l.erro = 'O código venceu. Peça outro.'; return; }
    l.estado = 'erro'; l.erro = erroLogin(j, r.status).message;
    return;
  }
}
// Login pelo navegador (Authorization Code com PKCE), para empresas que bloqueiam o código de dispositivo.
// O app precisa da plataforma "Aplicativos móveis e da área de trabalho" com o endereço http://localhost: a Microsoft
// aceita qualquer porta nele, então o plugin abre uma porta livre só durante o login, no 127.0.0.1 e no ::1.
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function loginNavegador() {
  const c = await config();
  if (!c.clientId) throw new Falha('Informe o Client ID do app na configuração da conta Microsoft.', { codigo: 'sem-app' });
  L.atual = null;
  const verificador = b64url(crypto.randomBytes(48)), estado = b64url(crypto.randomBytes(18));
  const desafio = b64url(crypto.createHash('sha256').update(verificador).digest());
  const l = { modo: 'navegador', codigo: '', url: '', expira: Date.now() + 10 * 60000, estado: 'aguardando', erro: '' };
  const servidores = [];
  const fechar = () => { for (const s of servidores) { try { s.close(); s.closeAllConnections?.(); } catch {} } };
  const pagina = (ok, texto) => `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>BlueMSTeamsAutomator</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#191b21;color:#e1e4ea;font:15px/1.5 system-ui,sans-serif"><div style="max-width:420px;padding:24px;text-align:center"><div style="font-size:40px;color:${ok ? '#5b9cf5' : '#f0606e'}">${ok ? '&#10003;' : '&#10007;'}</div><h1 style="font-size:18px;margin:12px 0 6px">${ok ? 'Conta Microsoft conectada' : 'Não deu para entrar'}</h1><p style="margin:0;color:#b4b9c4">${escHtml(texto)}</p></div></body></html>`;
  const atender = async (rq, rs) => {
    const u = new URL(rq.url, 'http://localhost');
    const responde = (ok, texto) => { rs.writeHead(ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); rs.end(pagina(ok, texto)); };
    if (u.pathname !== '/' || (!u.searchParams.get('code') && !u.searchParams.get('error'))) { rs.writeHead(404); return rs.end(); } // favicon e afins
    if (u.searchParams.get('state') !== estado) return responde(false, 'Este retorno não é desta tentativa. Volte ao BlueScreen e entre de novo.');
    if (u.searchParams.get('error')) {
      const e = erroLogin({ error: u.searchParams.get('error'), error_description: u.searchParams.get('error_description') });
      l.estado = 'erro'; l.erro = u.searchParams.get('error') === 'access_denied' ? 'O login foi cancelado na página da Microsoft.' : e.message;
      responde(false, l.erro); return setTimeout(fechar, 300);
    }
    try {
      const { r, j } = await formulario(`${c.login}/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`, { grant_type: 'authorization_code', client_id: c.clientId, code: u.searchParams.get('code'), redirect_uri: l.redirect, code_verifier: verificador, scope: ['offline_access', ...escoposPedidos(c).map((e) => e[0])].join(' ') });
      if (!r.ok || !j?.access_token) throw erroLogin(j, r.status);
      await guardarToken(j);
      try { const me = await g('GET', '/me?$select=id,displayName,userPrincipalName,mail'); await p.data.set('conta', { id: me.id, nome: me.displayName, email: me.mail || me.userPrincipalName }); } catch {}
      l.estado = 'ok'; responde(true, 'Pode fechar esta aba e voltar ao BlueScreen.');
    } catch (e) { l.estado = 'erro'; l.erro = e.message; responde(false, e.message); }
    setTimeout(fechar, 300);
  };
  const ouvir = (host, porta) => new Promise((ok, falha) => { const s = http.createServer(atender); s.once('error', falha); s.listen(porta, host, () => { servidores.push(s); ok(s.address().port); }); });
  const porta = await ouvir('127.0.0.1', 0);
  await ouvir('::1', porta).catch(() => {}); // sem IPv6: o 127.0.0.1 basta
  l.redirect = `http://localhost:${porta}/`;
  l.url = `${c.login}/${encodeURIComponent(c.tenant)}/oauth2/v2.0/authorize?` + new URLSearchParams({ client_id: c.clientId, response_type: 'code', redirect_uri: l.redirect, response_mode: 'query', scope: ['offline_access', ...escoposPedidos(c).map((e) => e[0])].join(' '), state: estado, code_challenge: desafio, code_challenge_method: 'S256', prompt: 'select_account' });
  L.atual = l;
  setTimeout(() => { if (l.estado === 'aguardando') { l.estado = 'expirou'; l.erro = 'O login não foi concluído em 10 minutos. Tente de novo.'; } fechar(); }, 10 * 60000).unref();
  abrirUrl(l.url);
  return loginVisivel();
}
function abrirUrl(u) {
  ultimoAberto = u;
  if (process.env.BLUEMSTEAMS_NAO_ABRIR) return;
  spawn('rundll32.exe', ['url.dll,FileProtocolHandler', u], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
const loginVisivel = () => (L.atual ? { modo: L.atual.modo || 'codigo', codigo: L.atual.codigo, url: L.atual.url, restam: Math.max(0, Math.round((L.atual.expira - Date.now()) / 1000)), estado: L.atual.estado, erro: L.atual.erro } : null);
async function sair() {
  L.atual = null;
  Object.assign(T, { acesso: '', exp: 0, escopos: [] });
  await p.secrets.set('graph.acesso', null);
  await p.secrets.set('graph.renovar', null);
  await p.data.merge({ sessao: null, conta: null });
}

// ---------- Microsoft Graph ----------
const tem = (escopo) => T.escopos.some((e) => e.toLowerCase() === escopo.toLowerCase());
const paraQue = (escopo) => (escopo === ESCOPO_LER_CANAL[0] ? ESCOPO_LER_CANAL[1] : (ESCOPOS.find((e) => e[0] === escopo) || [])[1]) || '';
function faltaPermissao(escopos) {
  const e = escopos[0];
  const admin = e === ESCOPO_LER_CANAL[0];
  return new Falha(`Falta a permissão ${e} (${paraQue(e)}).${admin ? ' Ela exige o consentimento do administrador: ligue "Ler mensagens de canal" nas configurações do plugin e entre de novo.' : ' Acrescente no registro do app e entre de novo.'}`, { status: 403, codigo: 'permissao', falta: [e] });
}
// escopo: a permissão que a operação usa (ou alternativas que servem). Sem ela, nem chama o Graph.
async function g(metodo, caminho, corpo, { escopo, cabecalhos, insistir = false, bruto } = {}) {
  const c = await config();
  const url = /^https?:/.test(caminho) ? caminho : c.graph + caminho;
  const precisa = [].concat(escopo || []);
  let renovou = false, esperas = 0;
  for (;;) {
    const t = await token();
    if (precisa.length && T.escopos.length && !precisa.some(tem)) throw faltaPermissao(precisa);
    if (LIMITE.graph > Date.now() && !insistir) throw limite('graph', Math.ceil((LIMITE.graph - Date.now()) / 1000));
    // bruto: o conteúdo de um arquivo (envio de arquivo), sem passar por JSON
    const r = await pedir(url, { method: metodo, timeout: bruto ? 300000 : undefined, headers: { authorization: 'Bearer ' + t, accept: 'application/json', ...(bruto ? { 'content-type': 'application/octet-stream' } : corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...cabecalhos }, body: bruto || (corpo !== undefined ? JSON.stringify(corpo) : undefined) });
    if (r.status === 401 && !renovou) { renovou = true; await token(true); continue; }
    if (r.status === 429 || r.status === 503 || r.status === 504) {
      const s = esperaPedida(r);
      // nó do Automator: uma espera curta é melhor do que falhar o fluxo
      if (insistir && s <= 30 && esperas < 3) { esperas++; await dormir(s * 1000); continue; }
      throw limite('graph', s);
    }
    if (r.status === 204 || r.status === 202) return null;
    let j = null;
    try { j = await r.json(); } catch {}
    if (r.ok) return j;
    const msg = txt(j?.error?.message), cod = txt(j?.error?.code);
    if (r.status === 401) { await p.data.merge({ sessao: { estado: 'vencido', em: Date.now() } }); throw new Falha('A sessão da conta Microsoft venceu. Entre de novo no painel Teams.', { status: 401, codigo: 'vencido' }); }
    if (r.status === 403) {
      if (precisa.length) throw Object.assign(faltaPermissao(precisa), { message: `O Teams recusou (403): falta a permissão ${precisa[0]} (${paraQue(precisa[0])}) ou o consentimento para ela${precisa[0] === ESCOPO_LER_CANAL[0] ? ', que é do administrador' : ''}.` });
      throw new Falha(`O Teams recusou (403): ${msg || cod}`, { status: 403, codigo: 'permissao' });
    }
    if (r.status === 404) throw new Falha('O Teams não achou o canal, o chat ou a mensagem (foi apagado, ou você não participa).', { status: 404, codigo: 'nao-achou' });
    throw new Falha(`O Teams respondeu ${r.status}: ${msg || cod || 'sem detalhe'}`, { status: r.status >= 500 ? 502 : 400, codigo: 'graph' });
  }
}
async function eu() {
  let c = await p.data.get('conta');
  if (!c?.id) { const j = await g('GET', '/me?$select=id,displayName,userPrincipalName,mail', undefined, { escopo: 'User.Read' }); c = { id: j.id, nome: j.displayName, email: j.mail || j.userPrincipalName }; await p.data.set('conta', c); }
  return c;
}
const PESSOAS = new Map();
async function pessoa(email, opt) {
  const k = email.toLowerCase();
  if (PESSOAS.has(k)) return PESSOAS.get(k);
  let j;
  try { j = await g('GET', `/users/${encodeURIComponent(email)}?$select=id,displayName,userPrincipalName,mail`, undefined, { escopo: 'User.ReadBasic.All', ...opt }); } catch (e) {
    if (e.status === 404) throw new Falha(`Não achei ${email} no diretório da empresa.`, { status: 404, codigo: 'nao-achou' });
    throw e;
  }
  const v = { id: j.id, nome: j.displayName || email, email: j.mail || j.userPrincipalName || email };
  PESSOAS.set(k, v);
  return v;
}
const pessoas = async (lista, opt) => { const out = []; for (const e of emails(lista)) out.push(await pessoa(e, opt)); return out; };

// ---------- destinos ----------
async function destinos() { return (await p.data.get('destinos')) || []; }
const publico = (d) => ({ id: d.id, tipo: d.tipo, apelido: d.apelido, nome: d.nome || '', time: d.time || '', host: d.host || '' });
function urlWebhook(valor) {
  let u;
  try { u = new URL(txt(valor)); } catch { throw new Falha('Cole a URL inteira do webhook (começa com https://).'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Falha('A URL do webhook precisa ser https://.');
  if (/(^|\.)webhook\.office\.com$/i.test(u.hostname)) throw new Falha('Esta é uma URL dos conectores antigos do Office 365, que a Microsoft aposentou. Crie um webhook pelos Workflows do Teams (o README do plugin mostra como).', { codigo: 'conector-antigo' });
  return u;
}
async function salvarDestino(b) {
  const lista = await destinos();
  const apelido = txt(b.apelido).replace(/\s+/g, ' ').slice(0, 40);
  const livre = (nome, menos) => { if (!nome) throw new Falha('Dê um apelido ao destino.'); if (/[:{}@/\\]/.test(nome)) throw new Falha('O apelido não pode ter : / @ { }.'); if (lista.some((d) => d.id !== menos && semAcento(d.apelido) === semAcento(nome))) throw new Falha(`Já existe um destino chamado "${nome}".`); };
  if (b.acao === 'remover') {
    const d = lista.find((x) => x.id === b.id);
    if (d?.tipo === 'webhook') await p.secrets.set('webhook.' + d.id, null);
    await p.data.set('destinos', lista.filter((x) => x.id !== b.id));
    return null;
  }
  if (b.acao === 'renomear' || b.acao === 'trocar') {
    const d = lista.find((x) => x.id === b.id);
    if (!d) throw new Falha('Destino não encontrado.', { status: 404 });
    if (b.acao === 'renomear') { livre(apelido, d.id); d.apelido = apelido; } else {
      if (d.tipo !== 'webhook') throw new Falha('Só webhook tem URL.');
      const u = urlWebhook(b.url);
      await p.secrets.set('webhook.' + d.id, u.href); d.host = u.host;
    }
    await p.data.set('destinos', lista);
    return publico(d);
  }
  livre(apelido);
  const d = { id: id8(), apelido, criado: Date.now() };
  if (b.acao === 'webhook') {
    const u = urlWebhook(b.url);
    Object.assign(d, { tipo: 'webhook', host: u.host });
    await p.secrets.set('webhook.' + d.id, u.href);
  } else if (b.acao === 'canal') {
    let teamId = txt(b.teamId), channelId = txt(b.channelId), nome = txt(b.nome), time = txt(b.time);
    if (b.link) {
      const l = lerLink(b.link);
      if (!l || !l.teamId || !l.channelId) throw new Falha('Não reconheci o link. No Teams, clique em ⋯ ao lado do canal › "Obter link para o canal" e cole aqui.');
      teamId = l.teamId; channelId = l.channelId; nome ||= l.nome;
      try { time = (await g('GET', `/teams/${teamId}?$select=displayName`, undefined, { escopo: 'Team.ReadBasic.All' })).displayName || ''; nome = (await g('GET', `/teams/${teamId}/channels/${encodeURIComponent(channelId)}?$select=displayName`, undefined, { escopo: 'Channel.ReadBasic.All' })).displayName || nome; } catch {}
    }
    if (!teamId || !channelId) throw new Falha('Escolha o time e o canal.');
    Object.assign(d, { tipo: 'canal', teamId, channelId, nome, time });
  } else if (b.acao === 'chat') {
    let chatId = txt(b.chatId), nome = txt(b.nome);
    if (b.link) { const l = lerLink(b.link); if (!l?.chatId) throw new Falha('Não reconheci o link do chat.'); chatId = l.chatId; }
    if (!chatId && b.pessoas) { const c = await chatCom(b.pessoas); chatId = c.chatId; nome ||= c.nome; }
    if (!chatId) throw new Falha('Escolha o chat ou informe os e-mails das pessoas.');
    Object.assign(d, { tipo: 'chat', chatId, nome });
  } else throw new Falha('Ação desconhecida.');
  await p.data.set('destinos', [...lista, d]);
  return publico(d);
}
// Onde a mensagem vai. Aceita, nesta ordem: referência devolvida por outro nó (canal:…, chat:…), link copiado do Teams,
// URL de webhook (vinda de {{cred:nome}} ou {{vault:nome}}), apelido de um destino salvo, e-mails de pessoas ou id de chat.
async function resolver(texto, aceita = ['webhook', 'canal', 'chat']) {
  const t = txt(texto);
  const recusa = (tipo) => new Falha(`Este envio não serve para ${tipo === 'webhook' ? 'webhook' : tipo === 'canal' ? 'canal' : 'chat'}: escolha ${aceita.map((a) => (a === 'webhook' ? 'um webhook' : a === 'canal' ? 'um canal' : 'um chat ou pessoas')).join(' ou ')}.`);
  if (!t) throw new Falha('Informe o destino: o apelido de um destino salvo no painel Teams, o link do canal ou os e-mails das pessoas.');
  let d = null;
  const ref = /^(canal|chat):(.+)$/i.exec(t);
  if (ref) {
    if (ref[1].toLowerCase() === 'chat') d = { tipo: 'chat', chatId: ref[2].trim(), nome: 'chat' };
    else { const i = ref[2].indexOf('/'); d = { tipo: 'canal', teamId: ref[2].slice(0, i).trim(), channelId: ref[2].slice(i + 1).trim(), nome: 'canal' }; }
  } else if (ehLinkTeams(t)) {
    const l = lerLink(t);
    if (l?.tipo === 'canal') d = { tipo: 'canal', teamId: l.teamId, channelId: l.channelId, nome: l.nome || 'canal' };
    else if (l?.tipo === 'mensagem') d = l.chatId ? { tipo: 'chat', chatId: l.chatId, nome: 'chat', raizId: l.raizId } : { tipo: 'canal', teamId: l.teamId, channelId: l.channelId, nome: l.nome || 'canal', raizId: l.raizId };
    else if (l?.tipo === 'chat') d = { tipo: 'chat', chatId: l.chatId, nome: 'chat' };
    else throw new Falha('Não reconheci o link do Teams. Use "Obter link para o canal" (⋯ ao lado do canal) ou "Copiar link" de uma mensagem.');
  } else if (/^https?:\/\//i.test(t)) {
    d = { tipo: 'webhook', url: urlWebhook(t).href, apelido: 'webhook' };
  } else {
    const salvo = (await destinos()).find((x) => semAcento(x.apelido) === semAcento(t));
    if (salvo) d = { ...salvo };
    else if (emails(t).length) { if (!aceita.includes('chat')) throw recusa('chat'); d = await chatCom(t); }
    else if (/^19:[^\s]+@(thread\.v2|unq\.gbl\.spaces)$/i.test(t)) d = { tipo: 'chat', chatId: t, nome: 'chat' };
    else throw new Falha(`Não achei o destino "${t}". Use o apelido de um destino salvo no painel Teams, o link do canal copiado do Teams ou os e-mails das pessoas.`, { status: 404, codigo: 'nao-achou' });
  }
  if (!aceita.includes(d.tipo)) throw recusa(d.tipo);
  if (d.tipo === 'webhook' && !d.url) {
    d.url = await p.secrets.get('webhook.' + d.id);
    if (!d.url) throw new Falha(`O webhook "${d.apelido}" está sem URL. Cole de novo no painel Teams.`, { codigo: 'sem-url' });
  }
  // referência vinda do seletor do Automator (canal:…, chat:…): o nome legível sai das listas já lidas
  if (ref) {
    const achado = d.tipo === 'canal' ? (LISTAS.get('canais:' + d.teamId)?.valor || []).find((c) => c.id === d.channelId) : (LISTAS.get('chats')?.valor || []).find((c) => c.id === d.chatId);
    if (achado) d.nome = d.tipo === 'canal' ? `${achado.time} › ${achado.nome}` : achado.nome;
  }
  d.ref = d.tipo === 'canal' ? `canal:${d.teamId}/${d.channelId}` : d.tipo === 'chat' ? `chat:${d.chatId}` : d.apelido;
  d.rotulo = d.apelido || d.nome || d.tipo;
  return d;
}
async function chatCom(lista, opt) {
  const outros = await pessoas(lista, opt);
  if (!outros.length) throw new Falha('Informe o e-mail de pelo menos uma pessoa.');
  const me = await eu();
  const ids = [...new Set([me.id, ...outros.map((x) => x.id)])];
  if (ids.length < 2) throw new Falha('Para conversar com você mesmo, salve o chat "Anotações" como destino.');
  const chave = ids.slice().sort().join(',');
  const guardados = (await p.data.get('chatsDeGrupo')) || {};
  const nome = outros.map((x) => x.nome).join(', ');
  // chat de grupo: o Graph cria um novo a cada pedido, por isso o plugin lembra o que já criou para as mesmas pessoas
  if (ids.length > 2 && guardados[chave]) return { tipo: 'chat', chatId: guardados[chave], nome };
  const j = await g('POST', '/chats', {
    chatType: ids.length === 2 ? 'oneOnOne' : 'group',
    members: ids.map((id) => ({ '@odata.type': '#microsoft.graph.aadUserConversationMember', roles: ['owner'], 'user@odata.bind': `${GRAPH_PADRAO}/users('${id}')` })),
  }, { escopo: ['Chat.Create', 'Chat.ReadWrite'], ...opt });
  if (ids.length > 2) await p.data.set('chatsDeGrupo', { ...guardados, [chave]: j.id });
  return { tipo: 'chat', chatId: j.id, nome };
}

// ---------- mensagens ----------
// texto simples -> HTML do Teams: **negrito**, `código`, links e quebras de linha. @fulano@empresa.com no meio do
// texto vira menção; as pessoas do campo "Mencionar" que não aparecem no texto vão no começo.
async function corpoHtml(texto, mencionar, opt) {
  const noTexto = [...String(texto).matchAll(/@([^\s@<>,;()]+@[^\s@<>,;()]+\.[a-z]{2,})/gi)].map((m) => m[1]);
  const porEmail = new Map();
  for (const x of await pessoas([...noTexto, ...emails(mencionar)], opt)) porEmail.set(x.email.toLowerCase(), x);
  const acha = async (e) => porEmail.get(e.toLowerCase()) || pessoa(e, opt);
  const mentions = [];
  const marca = (x) => { const i = mentions.length; mentions.push({ id: i, mentionText: x.nome, mentioned: { user: { id: x.id, displayName: x.nome, userIdentityType: 'aadUser' } } }); return `<at id="${i}">${escHtml(x.nome)}</at>`; };
  const formata = (s) => escHtml(s).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1">$1</a>').replace(/\r?\n/g, '<br>');
  let html = '', resto = String(texto), usados = new Set();
  for (const e of noTexto) {
    const i = resto.indexOf('@' + e);
    const x = await acha(e);
    html += formata(resto.slice(0, i)) + marca(x); usados.add(x.id);
    resto = resto.slice(i + e.length + 1);
  }
  html += formata(resto);
  const antes = [];
  for (const e of emails(mencionar)) { const x = await acha(e); if (!usados.has(x.id)) { usados.add(x.id); antes.push(marca(x)); } }
  if (antes.length) html = antes.join(' ') + (html ? ' ' + html : '');
  return { html, mentions };
}
// menções num cartão: por webhook o Teams aceita o e-mail (UPN) no lugar do id; com a conta conectada vai o nome certo
async function mencoesCartao(mencionar) {
  const out = [];
  for (const e of emails(mencionar)) {
    let x = null;
    if (T.acesso || (await p.data.get('sessao'))?.estado === 'ok') { try { x = await pessoa(e); } catch {} }
    out.push(x ? { id: x.id, nome: x.nome } : { id: e, nome: e.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) });
  }
  return out;
}
const textoDe = (html) => String(html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<attachment[^>]*><\/attachment>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
function normal(m) {
  const tipoConteudo = m.body?.contentType;
  let texto = tipoConteudo === 'html' ? textoDe(m.body?.content) : txt(m.body?.content);
  const cartoes = (m.attachments || []).filter((a) => /card/.test(a.contentType || ''));
  if (!texto && cartoes.length) texto = '[cartão]';
  const arquivos = (m.attachments || []).filter((a) => a.contentType === 'reference').map((a) => a.name).filter(Boolean);
  if (arquivos.length) texto = [texto, ...arquivos.map((n) => `[arquivo: ${n}]`)].filter(Boolean).join('\n');
  return {
    id: m.id, de: m.from?.user?.displayName || m.from?.application?.displayName || 'Teams', deId: m.from?.user?.id || '', texto, assunto: m.subject || '',
    quando: m.createdDateTime, respostaDe: m.replyToId || '', link: m.webUrl || '', importancia: m.importance || 'normal', mencoes: (m.mentions || []).map((x) => x.mentionText).filter(Boolean),
  };
}
async function lerMensagens(d, { quantas = 20, desde = 0, raiz = '', insistir = false } = {}) {
  const n = Math.max(1, Math.min(50, Math.round(Number(quantas) || 20)));
  let j;
  if (d.tipo === 'canal') {
    const base = `/teams/${d.teamId}/channels/${encodeURIComponent(d.channelId)}/messages`;
    j = await g('GET', raiz ? `${base}/${raiz}/replies?$top=${n}` : `${base}?$top=${n}`, undefined, { escopo: ESCOPO_LER_CANAL[0], insistir });
  } else if (d.tipo === 'chat') {
    j = await g('GET', `/chats/${encodeURIComponent(d.chatId)}/messages?$top=${n}&$orderby=createdDateTime desc`, undefined, { escopo: ['Chat.Read', 'Chat.ReadWrite'], insistir });
  } else throw new Falha('Webhook só envia: para ler, escolha um canal ou um chat.');
  return (j?.value || []).filter((m) => (m.messageType || 'message') === 'message' && !m.deletedDateTime).map(normal)
    .filter((m) => !desde || Date.parse(m.quando) > desde).sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando));
}
// O envio de verdade. conteudo: { texto, titulo } ou { modelo, dados } (cartão).
async function enviar({ to, aceita, texto, titulo, assunto, importancia, mencionar, modelo: idModelo, dados, raiz, via = 'tela', insistir = false }) {
  const d = await resolver(to, aceita);
  const ehCartao = !!idModelo;
  const resumo = ehCartao ? modelo(idModelo)?.resumo(dados || {}) || idModelo : [txt(titulo), txt(texto)].filter(Boolean).join(': ');
  const reg = { quando: Date.now(), destino: d.rotulo, tipo: d.tipo, via, forma: ehCartao ? modelo(idModelo)?.nome || 'Cartão' : raiz || d.raizId ? 'Resposta' : 'Mensagem', resumo: resumo.slice(0, 200) };
  try {
    let out;
    if (d.tipo === 'webhook') {
      const cartao = ehCartao ? montarCartao(idModelo, dados, await mencoesCartao(mencionar)) : cartaoTexto(titulo, texto, await mencoesCartao(mencionar));
      await postarWebhook(d.url, envelope(cartao), insistir);
      out = { ok: true, via: 'webhook', to: d.ref, destino: d.rotulo, id: '', link: '' };
    } else {
      let corpo;
      if (ehCartao) {
        const anexo = crypto.randomUUID().replace(/-/g, '');
        const cartao = montarCartao(idModelo, dados, (await pessoas(mencionar, { insistir })).map((x) => ({ id: x.id, nome: x.nome })));
        corpo = { body: { contentType: 'html', content: `<attachment id="${anexo}"></attachment>` }, attachments: [{ id: anexo, contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: JSON.stringify(cartao) }] };
      } else {
        if (!txt(texto)) throw new Falha('Escreva a mensagem.');
        const { html, mentions } = await corpoHtml(texto, mencionar, { insistir });
        corpo = { body: { contentType: 'html', content: html }, ...(mentions.length ? { mentions } : {}) };
      }
      const pai = txt(raiz) || d.raizId || '';
      let j;
      if (d.tipo === 'canal') {
        const base = `/teams/${d.teamId}/channels/${encodeURIComponent(d.channelId)}/messages`;
        if (!pai) { if (txt(assunto)) corpo.subject = txt(assunto); if (['high', 'urgent'].includes(importancia)) corpo.importance = importancia; }
        j = await g('POST', pai ? `${base}/${pai}/replies` : base, corpo, { escopo: 'ChannelMessage.Send', insistir });
      } else {
        if (['high', 'urgent'].includes(importancia)) corpo.importance = importancia;
        j = await g('POST', `/chats/${encodeURIComponent(d.chatId)}/messages`, corpo, { escopo: ['ChatMessage.Send', 'Chat.ReadWrite'], insistir });
      }
      out = { ok: true, via: 'graph', to: d.ref, destino: d.rotulo, id: j?.id || '', conversa: pai || j?.id || '', link: j?.webUrl || '' };
    }
    await anotar({ ...reg, ok: true, link: out.link });
    return out;
  } catch (e) {
    await anotar({ ...reg, ok: false, erro: e.message });
    throw e;
  }
}
async function postarWebhook(url, corpo, insistir) {
  const texto = JSON.stringify(corpo);
  if (Buffer.byteLength(texto) > 27000) throw new Falha('O cartão ficou grande demais para o Teams (limite de 28 KB). Encurte o texto.');
  for (let esperas = 0; ; esperas++) {
    if (LIMITE.webhook > Date.now() && !insistir) throw limite('webhook', Math.ceil((LIMITE.webhook - Date.now()) / 1000));
    const r = await pedir(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: texto });
    if (r.ok) return;
    if (r.status === 429) { const s = esperaPedida(r); if (insistir && s <= 30 && esperas < 3) { await dormir(s * 1000); continue; } throw limite('webhook', s); }
    let detalhe = '';
    try { const b = await r.text(); try { detalhe = JSON.parse(b)?.error?.message || ''; } catch { detalhe = b.slice(0, 200); } } catch {}
    if (r.status === 401 || r.status === 403) throw new Falha('O Teams recusou a URL do webhook (sem a assinatura ou revogada). Copie a URL de novo no fluxo dos Workflows e troque no painel Teams.', { status: 403, codigo: 'webhook' });
    if (r.status === 404 || r.status === 410) throw new Falha('O fluxo deste webhook não existe mais (apagado ou desligado nos Workflows). Crie outro e troque a URL no painel Teams.', { status: 404, codigo: 'webhook' });
    throw new Falha(`O webhook respondeu ${r.status}${detalhe ? ': ' + detalhe : ''}`, { status: r.status >= 500 ? 502 : 400, codigo: 'webhook' });
  }
}

// ---------- histórico do que saiu deste PC ----------
const ARQ_HIST = DADOS ? path.join(DADOS, 'historico.json') : '';
let hist = null;
function historico() {
  if (hist) return hist;
  try { hist = JSON.parse(fs.readFileSync(ARQ_HIST, 'utf8')); } catch { hist = []; }
  if (!Array.isArray(hist)) hist = [];
  return hist;
}
async function anotar(item) {
  historico().unshift(item);
  hist.length = Math.min(hist.length, 200);
  try { fs.mkdirSync(DADOS, { recursive: true }); fs.writeFileSync(ARQ_HIST + '.tmp', JSON.stringify(hist)); fs.renameSync(ARQ_HIST + '.tmp', ARQ_HIST); } catch {}
}

// ---------- presença e mensagem de status ----------
const PRESENCAS = {
  Available: ['Available', 'Disponível'], Busy: ['Busy', 'Ocupado'], DoNotDisturb: ['DoNotDisturb', 'Não incomodar'],
  BeRightBack: ['BeRightBack', 'Volto logo'], Away: ['Away', 'Ausente'], Offline: ['OffWork', 'Aparecer offline'],
};
const ATIVIDADES = { InACall: 'Em chamada', InAMeeting: 'Em reunião', InAConferenceCall: 'Em chamada', Presenting: 'Apresentando', OutOfOffice: 'Fora do escritório', OffWork: 'Fora do expediente', Inactive: 'Inativo', UrgentInterruptionsOnly: 'Só urgências', PresenceUnknown: 'Desconhecido', AvailableIdle: 'Disponível (inativo)', BusyIdle: 'Ocupado (inativo)' };
const rotuloPresenca = (a, ativ) => ATIVIDADES[ativ] || (PRESENCAS[a] || PRESENCAS[ativ] || [])[1] || (a === 'Offline' ? 'Offline' : a || 'Desconhecido');
const duracaoIso = (min) => { const m = Math.max(5, Math.min(1440, Math.round(Number(min) || 60))); return `PT${Math.floor(m / 60) ? Math.floor(m / 60) + 'H' : ''}${m % 60 ? (m % 60) + 'M' : ''}`; };
async function lerPresenca(opt) {
  const j = await g('GET', '/me/presence', undefined, { escopo: ['Presence.Read', 'Presence.ReadWrite', 'Presence.Read.All'], ...opt });
  const msg = j.statusMessage?.message?.content;
  return { disponibilidade: j.availability || 'PresenceUnknown', atividade: j.activity || '', rotulo: rotuloPresenca(j.availability, j.activity), mensagem: j.statusMessage?.message?.contentType === 'html' ? textoDe(msg) : txt(msg), mensagemAte: j.statusMessage?.expiryDateTime?.dateTime ? new Date(j.statusMessage.expiryDateTime.dateTime.replace(/Z?$/, 'Z')).toISOString() : '' };
}
async function mudarPresenca(qual, minutos, opt) {
  const me = await eu();
  if (qual === 'auto' || qual === 'limpar') { await g('POST', `/users/${me.id}/presence/clearUserPreferredPresence`, {}, { escopo: 'Presence.ReadWrite', ...opt }); return { disponibilidade: 'auto', rotulo: 'Automático' }; }
  const par = PRESENCAS[qual];
  if (!par) throw new Falha('Presença desconhecida.');
  // passado o prazo, o Teams volta ao automático (sem prazo, o Graph deixaria Ocupado por um dia inteiro)
  const min = Math.max(5, Math.min(1440, Math.round(Number(minutos) || 60)));
  await g('POST', `/users/${me.id}/presence/setUserPreferredPresence`, { availability: qual, activity: par[0], expirationDuration: duracaoIso(min) }, { escopo: 'Presence.ReadWrite', ...opt });
  return { disponibilidade: qual, rotulo: par[1], minutos: min, ate: new Date(Date.now() + min * 60000).toISOString() };
}
async function mudarStatus(texto, minutos, opt) {
  const me = await eu();
  const corpo = { statusMessage: { message: { content: txt(texto).slice(0, 280), contentType: 'text' } } };
  const min = Math.round(Number(minutos) || 0);
  if (txt(texto) && min > 0) corpo.statusMessage.expiryDateTime = { dateTime: new Date(Date.now() + min * 60000).toISOString().replace(/\.\d+Z$/, ''), timeZone: 'UTC' };
  await g('POST', `/users/${me.id}/presence/setStatusMessage`, corpo, { escopo: 'Presence.ReadWrite', ...opt });
  return { mensagem: txt(texto), ate: min > 0 && txt(texto) ? new Date(Date.now() + min * 60000).toISOString() : '' };
}

// ---------- reuniões ----------
// "agora", "15:30" (hoje; se já passou, amanhã), "13/11/2026 15:30", "2026-11-13T15:30" ou minutos a partir de agora
function quando(valor, emMinutos) {
  const t = txt(valor);
  if (!t || /^agora$/i.test(t)) return new Date(Date.now() + (Math.max(0, Number(emMinutos) || 0)) * 60000);
  let m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m) { const d = new Date(); d.setHours(+m[1], +m[2], 0, 0); if (d.getTime() < Date.now() - 60000) d.setDate(d.getDate() + 1); return d; }
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?[ ,T]+(\d{1,2}):(\d{2})$/.exec(t);
  if (m) return new Date(+(m[3] || new Date().getFullYear()), +m[2] - 1, +m[1], +m[4], +m[5]);
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) throw new Falha(`Não entendi o horário "${t}". Use 15:30, 13/11/2026 15:30 ou deixe vazio para agora.`);
  return d;
}
async function criarReuniao({ assunto, inicio, minutos, modo, convidados, descricao }, opt) {
  const ini = inicio instanceof Date ? inicio : quando(inicio);
  const dur = Math.max(5, Math.min(1440, Math.round(Number(minutos) || 30)));
  const fim = new Date(ini.getTime() + dur * 60000);
  const titulo = txt(assunto) || 'Reunião';
  const gente = emails(convidados);
  if (modo === 'agenda' || gente.length) {
    const semMs = (d) => d.toISOString().replace(/\.\d+Z$/, '');
    const j = await g('POST', '/me/events', {
      subject: titulo, body: { contentType: 'text', content: txt(descricao) }, start: { dateTime: semMs(ini), timeZone: 'UTC' }, end: { dateTime: semMs(fim), timeZone: 'UTC' },
      attendees: gente.map((e) => ({ emailAddress: { address: e }, type: 'required' })), isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness',
    }, { escopo: 'Calendars.ReadWrite', ...opt });
    return { link: j.onlineMeeting?.joinUrl || '', id: j.id || '', assunto: titulo, inicio: ini.toISOString(), fim: fim.toISOString(), convidados: gente, naAgenda: true, linkAgenda: j.webLink || '' };
  }
  const j = await g('POST', '/me/onlineMeetings', { startDateTime: ini.toISOString(), endDateTime: fim.toISOString(), subject: titulo }, { escopo: 'OnlineMeetings.ReadWrite', ...opt });
  return { link: j.joinWebUrl || j.joinUrl || '', id: j.id || '', assunto: titulo, inicio: ini.toISOString(), fim: fim.toISOString(), convidados: [], naAgenda: false, linkAgenda: '' };
}
async function agenda({ horas, soOnline } = {}, opt) {
  const de = new Date();
  const ate = Number(horas) > 0 ? new Date(de.getTime() + Math.min(168, Number(horas)) * 3600000) : new Date(de.getFullYear(), de.getMonth(), de.getDate(), 23, 59, 59);
  const j = await g('GET', `/me/calendarView?startDateTime=${encodeURIComponent(de.toISOString())}&endDateTime=${encodeURIComponent(ate.toISOString())}&$orderby=start/dateTime&$top=50&$select=subject,start,end,isOnlineMeeting,onlineMeeting,location,organizer,webLink,isCancelled,isAllDay`, undefined, { escopo: ['Calendars.Read', 'Calendars.ReadWrite'], cabecalhos: { Prefer: 'outlook.timezone="UTC"' }, ...opt });
  const utc = (x) => (x?.dateTime ? new Date(x.dateTime.replace(/Z?$/, 'Z')).toISOString() : '');
  return (j?.value || []).filter((e) => !e.isCancelled && (!soOnline || e.onlineMeeting?.joinUrl)).map((e) => {
    const inicio = utc(e.start);
    return { assunto: e.subject || '(sem assunto)', inicio, fim: utc(e.end), link: e.onlineMeeting?.joinUrl || '', online: !!e.onlineMeeting?.joinUrl, local: e.location?.displayName || '', organizador: e.organizer?.emailAddress?.name || '', diaInteiro: !!e.isAllDay, emMinutos: Math.round((Date.parse(inicio) - Date.now()) / 60000), linkAgenda: e.webLink || '' };
  });
}

// ---------- links diretos ----------
function linkDireto({ tipo, pessoas: quem, mensagem, topico, assunto, inicio, minutos, to, destino }) {
  if (tipo === 'chat') return linkChat(quem, { mensagem, topico });
  if (tipo === 'chamada' || tipo === 'video') return linkChamada(quem, tipo === 'video');
  if (tipo === 'agendar') { const ini = txt(inicio) ? quando(inicio) : null; return linkAgendar({ assunto, convidados: quem, inicio: ini?.toISOString(), fim: ini ? new Date(ini.getTime() + (Number(minutos) || 30) * 60000).toISOString() : '', conteudo: mensagem }); }
  if (tipo === 'canal') {
    const d = destino;
    if (!d || d.tipo !== 'canal') throw new Falha('Escolha um canal salvo ou cole o link do canal.');
    return `https://teams.microsoft.com/l/channel/${encodeURIComponent(d.channelId)}/${encodeURIComponent(d.nome || 'canal')}?groupId=${encodeURIComponent(d.teamId)}`;
  }
  if (tipo === 'link') { if (!ehLinkTeams(to)) throw new Falha('Cole um link do Teams (canal, mensagem ou reunião).'); return txt(to).replace(/^msteams:\/?/i, 'https://teams.microsoft.com/'); }
  throw new Falha('Tipo de link desconhecido.');
}
let ultimoAberto = '';
function abrirNoPc(url) {
  if (!/^(msteams:\/l\/|https:\/\/[a-z0-9.-]*teams\.(microsoft\.com|cloud\.microsoft|live\.com|microsoft\.us)\/)/i.test(url)) throw new Falha('Só abro links do Teams.');
  ultimoAberto = url;
  if (process.env.BLUEMSTEAMS_NAO_ABRIR) return; // testes: guarda o endereço e não abre nada
  spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
async function abrirLink(b) {
  const c = await config();
  const d = b.tipo === 'canal' ? await resolver(b.to, ['canal']) : null;
  const link = linkDireto({ ...b, destino: d });
  const linkApp = paraApp(link);
  const abrir = b.abrir !== false && b.abrir !== 'no';
  if (abrir) abrirNoPc(c.abrir === 'web' ? link : linkApp);
  return { link, linkApp, abriu: abrir };
}

// ---------- estado para a tela ----------
async function estado() {
  const c = await config();
  await lerToken();
  const dados = (await p.data.all()) || {};
  const temRenovar = (await p.secrets.keys()).includes('graph.renovar');
  const sessao = dados.sessao || null;
  let situacao = 'sem-app';
  if (c.clientId) situacao = !temRenovar ? 'desconectado' : sessao?.estado === 'vencido' ? 'vencido' : 'ok';
  const pedidos = escoposPedidos(c);
  const faltando = situacao === 'ok' && T.escopos.length ? pedidos.filter(([e]) => !tem(e)).map(([escopo, para]) => ({ escopo, para, admin: escopo === ESCOPO_LER_CANAL[0] })) : [];
  const resta = (quando) => Math.max(0, Math.ceil((quando - Date.now()) / 1000));
  return {
    destinos: (dados.destinos || []).map(publico),
    graph: { situacao, conta: situacao === 'ok' || situacao === 'vencido' ? dados.conta || null : null, escopos: T.escopos, faltando, lerCanal: c.lerCanal, tenant: c.tenant, clientId: c.clientId ? c.clientId.slice(0, 8) + '…' : '' },
    login: loginVisivel(), limite: { graph: resta(LIMITE.graph), webhook: resta(LIMITE.webhook) },
    teste: c.graph !== GRAPH_PADRAO || c.login !== LOGIN_PADRAO ? { graph: c.graph, login: c.login } : null,
    abrir: c.abrir,
  };
}

// ---------- nós do Automator ----------
const sim = (v) => v === true || /^(yes|sim|true|1)$/i.test(txt(v));
const palavras = (v, padrao) => { const l = (Array.isArray(v) ? v : txt(v).split(/[,;\n]+/)).map((x) => semAcento(txt(x))).filter(Boolean); return l.length ? l : padrao; };
function achaPalavra(texto, lista) {
  const t = ' ' + semAcento(texto).replace(/[^\p{L}\p{N}\p{Extended_Pictographic}]+/gu, ' ') + ' ';
  return lista.find((w) => t.includes(' ' + w.replace(/[^\p{L}\p{N}\p{Extended_Pictographic}]+/gu, ' ').trim() + ' ')) || '';
}
const dadosDoCartao = (q) => {
  const m = txt(q.model) || 'incidente';
  const por = {
    incidente: { titulo: q.title, severidade: q.severity, estado: q.state, servico: q.service, resumo: q.text, responsavel: q.owner, link: q.link, warroom: q.warroom },
    testes: { titulo: q.title, passou: q.passed, falhou: q.failed, ignorados: q.skipped, ambiente: q.env, duracao: q.duration, detalhes: q.failures, link: q.link },
    deploy: { app: q.app, versao: q.version, ambiente: q.env, resultado: q.result, autor: q.owner, notas: q.text, link: q.link },
    aprovacao: { pergunta: q.question, detalhes: q.text, sim: 'Aprovar', linkSim: q.yes_url, nao: 'Recusar', linkNao: q.no_url, instrucao: q.hint },
    livre: { titulo: q.title, cor: q.color, texto: q.text, fatos: q.facts, botoes: q.buttons },
  };
  if (!por[m]) throw new Falha('Modelo de cartão desconhecido.');
  return { modelo: m, dados: por[m] };
};
async function rodarNo(no, q, _entrada) {
  const opt = { insistir: true };
  switch (no) {
    case 'mensagem': return { value: await enviar({ to: q.to, aceita: ['webhook'], titulo: q.title, texto: q.text, mencionar: q.mention, via: 'automator', insistir: true }) };
    case 'cartao': return { value: await enviar({ to: q.to, ...dadosDoCartao(q), mencionar: q.mention, via: 'automator', insistir: true }) };
    case 'chat': return { value: await enviar({ to: q.to, aceita: ['chat'], texto: q.text, mencionar: q.mention, importancia: q.importance, via: 'automator', insistir: true }) };
    case 'canal': return { value: await enviar({ to: q.to, aceita: ['canal'], texto: q.text, assunto: q.subject, importancia: q.importance, mencionar: q.mention, via: 'automator', insistir: true }) };
    case 'responder': return { value: await enviar({ to: q.to, aceita: ['canal', 'chat'], texto: q.text, mencionar: q.mention, raiz: q.message, via: 'automator', insistir: true }) };
    case 'mencionar': {
      if (!emails(q.people).length) throw new Falha('Informe o e-mail de quem mencionar.');
      return { value: await enviar({ to: q.to, texto: txt(q.text) || 'Atenção', titulo: '', mencionar: q.people, via: 'automator', insistir: true }) };
    }
    case 'ler': {
      const d = await resolver(q.to, ['canal', 'chat']);
      const min = Number(q.minutes) || 0;
      const lista = await lerMensagens(d, { quantas: q.count, desde: min > 0 ? Date.now() - min * 60000 : 0, raiz: txt(q.message) || d.raizId || '', insistir: true });
      const filtro = semAcento(txt(q.contains));
      return { value: filtro ? lista.filter((m) => semAcento(m.texto + ' ' + m.assunto).includes(filtro)) : lista };
    }
    case 'esperar': {
      const d = await resolver(q.to, ['canal', 'chat']);
      const raiz = txt(q.message) || d.raizId || '';
      const aprova = palavras(q.approve, ['aprovado', 'aprovo', 'ok', 'sim', '👍']), recusa = palavras(q.reject, ['recusado', 'reprovado', 'negado', 'nao']);
      const limiteS = Math.max(5, Math.min(3600, Math.round(Number(q.timeout_s) || 300)));
      const passo = Math.max(1, Math.min(60, Math.round(Number(q.every_s) || 10)));
      const quem = emails(q.from).length ? (await pessoas(q.from, opt)).map((x) => x.id) : null;
      // só vale o que chegar depois de o nó começar (com uma folga para a diferença entre os relógios)
      const inicio = Date.now() - 3000, fim = Date.now() + limiteS * 1000;
      const vistos = new Set();
      for (;;) {
        const lista = (await lerMensagens(d, { quantas: 30, desde: inicio, raiz, insistir: true })).reverse();
        for (const m of lista) {
          if (vistos.has(m.id)) continue;
          vistos.add(m.id);
          if (quem && !quem.includes(m.deId)) continue;
          const nao = achaPalavra(m.texto, recusa);
          if (nao) return { port: 'false', value: { aprovado: false, motivo: 'recusado', palavra: nao, mensagem: m, de: m.de } };
          const ok = achaPalavra(m.texto, aprova);
          if (ok) return { port: 'true', value: { aprovado: true, motivo: 'aprovado', palavra: ok, mensagem: m, de: m.de } };
        }
        if (Date.now() + passo * 1000 > fim) return { port: 'false', value: { aprovado: false, motivo: 'tempo', palavra: '', mensagem: null, de: '' } };
        await dormir(passo * 1000);
      }
    }
    case 'presenca': return { value: await mudarPresenca(txt(q.availability) || 'Busy', q.minutes, opt) };
    case 'status': return { value: await mudarStatus(sim(q.clear) ? '' : q.text, q.minutes, opt) };
    case 'meu_status': return { value: await lerPresenca(opt) };
    case 'reuniao': return { value: await criarReuniao({ assunto: q.subject, inicio: quando(q.when === 'at' ? q.at : 'agora', q.when === 'in' ? q.in_min : 0), minutos: q.minutes, modo: q.mode, convidados: q.mode === 'agenda' ? q.people : '', descricao: q.text }, opt) };
    case 'agenda': {
      const lista = await agenda({ horas: q.range === 'hours' ? q.hours : 0, soOnline: sim(q.online) }, opt);
      return { value: lista };
    }
    case 'times': return { value: await listarTimes(opt) };
    case 'canais': return { value: await listarCanais(q.team, opt) };
    case 'chats': return { value: (await listarChats(opt)).slice(0, Math.max(1, Math.min(50, Math.round(Number(q.count) || 50)))) };
    case 'arquivo': return { value: await enviarArquivo({ to: q.to, caminho: q.path, texto: q.text, via: 'automator', insistir: true }) };
    case 'novas': return novasMensagens(q);
    case 'abrir': return { value: await abrirLink({ tipo: txt(q.what) || 'chat', pessoas: q.people, mensagem: q.text, topico: q.topic, assunto: q.topic, to: q.target, abrir: sim(q.open ?? 'yes') }) };
    default: throw new Falha(`Nó desconhecido: ${no}`);
  }
}

// ---------- times, canais e chats (listas para a tela, para os nós e para os seletores do Automator) ----------
const LISTAS = new Map(); // chave -> { ate, valor }: o Graph é lento e a tela pede de novo a cada nó aberto
async function lembrar(chave, fn, ms = 300000) {
  const x = LISTAS.get(chave);
  if (x && x.ate > Date.now()) return x.valor;
  const valor = await fn();
  LISTAS.set(chave, { ate: Date.now() + ms, valor });
  return valor;
}
const ehGeral = (n) => /^(general|geral)$/i.test(n);
async function listarTimes(opt) {
  return lembrar('times', async () => ((await g('GET', '/me/joinedTeams?$select=id,displayName,description', undefined, { escopo: 'Team.ReadBasic.All', ...opt }))?.value || [])
    .map((t) => ({ id: t.id, nome: t.displayName || 'Time', descricao: t.description || '' })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
}
// o time pelo id ou pelo nome (sem diferença de maiúsculas e acentos)
async function acharTime(qual, opt) {
  const t = txt(qual);
  if (!t) throw new Falha('Escolha o time.');
  const lista = await listarTimes(opt);
  const x = lista.find((y) => y.id === t) || lista.find((y) => semAcento(y.nome) === semAcento(t));
  if (!x) throw new Falha(`Não achei o time "${t}" entre os seus. Times: ${lista.map((y) => y.nome).join(', ') || 'nenhum'}.`, { status: 404, codigo: 'nao-achou' });
  return x;
}
async function listarCanais(qual, opt) {
  const time = await acharTime(qual, opt);
  return lembrar('canais:' + time.id, async () => ((await g('GET', `/teams/${encodeURIComponent(time.id)}/channels?$select=id,displayName,membershipType`, undefined, { escopo: 'Channel.ReadBasic.All', ...opt }))?.value || [])
    .map((c) => ({ id: c.id, nome: c.displayName || 'Canal', tipo: c.membershipType || 'standard', time: time.nome, timeId: time.id, to: `canal:${time.id}/${c.id}` }))
    .sort((a, b) => ehGeral(b.nome) - ehGeral(a.nome) || a.nome.localeCompare(b.nome, 'pt-BR')));
}
async function listarChats(opt) {
  const me = await eu();
  return lembrar('chats', async () => {
    const j = await g('GET', '/me/chats?$expand=members&$top=50', undefined, { escopo: ['Chat.Read', 'Chat.ReadBasic', 'Chat.ReadWrite'], ...opt });
    return (j?.value || []).map((c) => {
      const outros = (c.members || []).filter((m) => m.userId !== me.id).map((m) => m.displayName).filter(Boolean);
      const nome = c.topic || (outros.length ? outros.slice(0, 4).join(', ') + (outros.length > 4 ? ` e mais ${outros.length - 4}` : '') : c.chatType === 'meeting' ? 'Reunião' : 'Anotações');
      return { id: c.id, nome, tipo: c.chatType, pessoas: outros, to: `chat:${c.id}` };
    });
  }, 60000);
}
// Opções dos seletores do Automator (campo com "choicesFrom"): os destinos salvos e, com a conta conectada, os canais
// de todos os seus times e os seus chats. aceita: webhook, canal, chat; tipo=times lista só os times.
async function opcoes(q) {
  const aceita = txt(q.aceita || 'webhook,canal,chat').split(',');
  const sessao = (await p.data.get('sessao'))?.estado === 'ok' && (await p.secrets.keys()).includes('graph.renovar');
  if (q.tipo === 'times') return { choices: sessao ? (await listarTimes().catch(() => [])).map((t) => ({ value: t.nome, label: t.nome })) : [] };
  const salvos = await destinos();
  const choices = salvos.filter((d) => aceita.includes(d.tipo)).map((d) => ({ value: d.apelido, label: `${d.apelido} (${d.tipo === 'webhook' ? 'webhook' : d.tipo === 'canal' ? 'canal salvo' : 'chat salvo'})` }));
  if (!sessao) return { choices };
  const vistos = new Set(salvos.map((d) => d.channelId || d.chatId).filter(Boolean));
  if (aceita.includes('canal')) {
    for (const t of await listarTimes().catch(() => [])) {
      for (const c of await listarCanais(t.id).catch(() => [])) if (!vistos.has(c.id)) choices.push({ value: c.to, label: `${t.nome} › ${c.nome}` });
    }
  }
  if (aceita.includes('chat')) for (const c of await listarChats().catch(() => [])) if (!vistos.has(c.id)) choices.push({ value: c.to, label: `Chat: ${c.nome}` });
  return { choices: choices.slice(0, 300) };
}

// ---------- arquivos ----------
const LIMITE_ARQUIVO = 250 * 1024 * 1024; // o envio simples do Graph aceita até 250 MB
async function enviarArquivo({ to, caminho, texto, via = 'tela', insistir = false }) {
  const opt = { insistir };
  const d = await resolver(to, ['canal', 'chat', 'webhook']);
  if (d.tipo === 'webhook') throw new Falha('Webhook não envia arquivo: escolha um canal ou chat (pela conta Microsoft), ou mande o link do arquivo numa mensagem.');
  const arq = txt(caminho).replace(/^"|"$/g, '');
  if (!arq) throw new Falha('Escolha o arquivo.');
  let info;
  try { info = fs.statSync(arq); } catch { throw new Falha(`Arquivo não encontrado: ${arq}`, { status: 404, codigo: 'nao-achou' }); }
  if (!info.isFile()) throw new Falha('Escolha um arquivo, não uma pasta (para mandar uma pasta, compacte antes).');
  if (info.size > LIMITE_ARQUIVO) throw new Falha(`O arquivo tem ${Math.round(info.size / 1048576)} MB; o limite do envio é 250 MB.`);
  const nome = path.basename(arq);
  const conteudo = fs.readFileSync(arq);
  const reg = { quando: Date.now(), destino: d.rotulo, tipo: d.tipo, via, forma: 'Arquivo', resumo: nome };
  try {
    const conflito = '?@microsoft.graph.conflictBehavior=rename';
    let item;
    if (d.tipo === 'canal') {
      // a pasta do canal fica no SharePoint do time
      const pasta = await g('GET', `/teams/${d.teamId}/channels/${encodeURIComponent(d.channelId)}/filesFolder`, undefined, { escopo: 'Files.ReadWrite.All', ...opt });
      item = await g('PUT', `/drives/${pasta.parentReference.driveId}/items/${pasta.id}:/${encodeURIComponent(nome)}:/content${conflito}`, undefined, { escopo: 'Files.ReadWrite.All', bruto: conteudo, ...opt });
    } else {
      // no chat, o Teams guarda no OneDrive de quem envia e compartilha com quem está na conversa
      item = await g('PUT', `/me/drive/root:/Microsoft Teams Chat Files/${encodeURIComponent(nome)}:/content${conflito}`, undefined, { escopo: 'Files.ReadWrite.All', bruto: conteudo, ...opt });
      try {
        const me = await eu();
        const membros = ((await g('GET', `/chats/${encodeURIComponent(d.chatId)}/members`, undefined, { escopo: ['Chat.Read', 'Chat.ReadWrite'], ...opt }))?.value || []).filter((m) => m.userId !== me.id && m.email);
        if (membros.length) await g('POST', `/me/drive/items/${item.id}/invite`, { recipients: membros.map((m) => ({ email: m.email })), roles: ['read'], requireSignIn: true, sendInvitation: false }, { escopo: 'Files.ReadWrite.All', ...opt });
      } catch (e) { if (e.codigo === 'limite') throw e; } // sem compartilhar, o arquivo ainda aparece para quem já tem acesso
    }
    const guid = (/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(item.eTag || '') || [])[1] || crypto.randomUUID();
    const { html, mentions } = txt(texto) ? await corpoHtml(texto, '', opt) : { html: '', mentions: [] };
    const corpo = { body: { contentType: 'html', content: `${html}<attachment id="${guid}"></attachment>` }, attachments: [{ id: guid, contentType: 'reference', contentUrl: item.webUrl, name: item.name || nome }], ...(mentions.length ? { mentions } : {}) };
    const base = `/teams/${d.teamId}/channels/${encodeURIComponent(d.channelId)}/messages`;
    const j = d.tipo === 'canal'
      ? await g('POST', d.raizId ? `${base}/${d.raizId}/replies` : base, corpo, { escopo: 'ChannelMessage.Send', ...opt })
      : await g('POST', `/chats/${encodeURIComponent(d.chatId)}/messages`, corpo, { escopo: ['ChatMessage.Send', 'Chat.ReadWrite'], ...opt });
    const out = { ok: true, via: 'graph', to: d.ref, destino: d.rotulo, id: j?.id || '', link: j?.webUrl || '', arquivo: item.name || nome, linkArquivo: item.webUrl || '', tamanho: info.size };
    await anotar({ ...reg, ok: true, link: out.link });
    return out;
  } catch (e) { await anotar({ ...reg, ok: false, erro: e.message }); throw e; }
}

// ---------- mensagens novas (o "gatilho" por consulta) ----------
// O Automator não tem gatilho de plugin: o fluxo usa a Agenda (a cada N minutos) e este nó, que lembra até onde já
// leu em cada canal ou chat. Sai por "sim" com as mensagens novas (da mais antiga para a mais nova) e por "não" sem
// nada novo. Na primeira vez só marca o ponto de partida, para não despejar o histórico inteiro.
const ARQ_CURSOR = DADOS ? path.join(DADOS, 'cursores.json') : '';
function cursores() { try { return JSON.parse(fs.readFileSync(ARQ_CURSOR, 'utf8')) || {}; } catch { return {}; } }
function gravarCursor(chave, valor) {
  const c = cursores(); c[chave] = valor;
  try { fs.mkdirSync(DADOS, { recursive: true }); fs.writeFileSync(ARQ_CURSOR + '.tmp', JSON.stringify(c)); fs.renameSync(ARQ_CURSOR + '.tmp', ARQ_CURSOR); } catch {}
}
async function novasMensagens(q) {
  const opt = { insistir: true };
  const d = await resolver(q.to, ['canal', 'chat']);
  const filtro = semAcento(txt(q.contains));
  const quem = emails(q.from).length ? (await pessoas(q.from, opt)).map((x) => x.id) : null;
  const semMinhas = q.mine !== 'yes';
  const chave = crypto.createHash('sha1').update([d.ref, filtro, (quem || []).join(','), semMinhas ? 'sem-minhas' : ''].join('|')).digest('hex').slice(0, 16);
  const antes = cursores()[chave];
  if (!antes) {
    gravarCursor(chave, { desde: Date.now(), vistos: [], destino: d.rotulo });
    return { port: 'false', value: { quantas: 0, mensagens: [], primeira: true, destino: d.rotulo, to: d.ref } };
  }
  const lista = await lerMensagens(d, { quantas: 50, desde: antes.desde - 1, insistir: true });
  const me = semMinhas ? (await eu()).id : '';
  const { novas, cursor } = filtrarNovas(lista, antes, { filtro, quem, me });
  gravarCursor(chave, { ...cursor, destino: d.rotulo });
  if (!novas.length) return { port: 'false', value: { quantas: 0, mensagens: [], primeira: false, destino: d.rotulo, to: d.ref } };
  return { port: 'true', value: { quantas: novas.length, mensagens: novas, ultima: novas[novas.length - 1], primeira: false, destino: d.rotulo, to: d.ref } };
}

// ---------- ponte dos nós ----------
// O programa do nó (nos.mjs) roda fora do servidor e não recebe token nenhum. O servidor abre uma segunda porta só no
// 127.0.0.1 e grava em <pasta de dados>/ponte.json a porta e uma chave sorteada a cada início. O nó lê o arquivo (a
// pasta de dados chega no JSON de entrada), pede a operação e recebe só o resultado. A chave fica na pasta do usuário:
// outro usuário do mesmo PC não consegue ler, e uma página da web não passa (pedido com Origin é recusado).
function abrirPonte() {
  if (!DADOS) return;
  const chave = crypto.randomBytes(24).toString('hex');
  const arquivo = path.join(DADOS, 'ponte.json');
  const srv = http.createServer(async (rq, rs) => {
    const manda = (status, corpo) => { rs.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); rs.end(JSON.stringify(corpo)); };
    const dada = Buffer.from(String(rq.headers['x-bmt-chave'] || ''));
    if (rq.method !== 'POST' || rq.headers.origin || dada.length !== chave.length || !crypto.timingSafeEqual(dada, Buffer.from(chave))) return manda(403, { ok: false, error: 'acesso negado' });
    const partes = [];
    for await (const c of rq) partes.push(c);
    try {
      const { node, params, input } = JSON.parse(Buffer.concat(partes).toString('utf8'));
      const out = await rodarNo(String(node), params || {}, input);
      manda(200, { ok: true, ...out });
    } catch (e) {
      if (!e.status) console.error(e);
      manda(200, { ok: false, error: e.message || String(e), codigo: e.codigo || '' });
    }
  });
  srv.requestTimeout = 0; srv.headersTimeout = 0; srv.timeout = 0; srv.keepAliveTimeout = 0;
  srv.listen(0, '127.0.0.1', () => {
    fs.mkdirSync(DADOS, { recursive: true });
    fs.writeFileSync(arquivo, JSON.stringify({ porta: srv.address().port, chave, pid: process.pid, desde: new Date().toISOString() }));
  });
  const apaga = () => { try { fs.unlinkSync(arquivo); } catch {} };
  process.on('exit', apaga);
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { apaga(); process.exit(0); });
}

// ---------- rotas (só pelo PC local) ----------
function rota(nome, fn) {
  p.route('bluemsteams/' + nome, async (req) => {
    if (req.remote) return Plugin.reply(403, { error: 'O Teams só responde no próprio PC.' });
    try { return (await fn(req.method === 'POST' ? req.json() : {}, req.query, req)) ?? { ok: true }; } catch (e) {
      if (!e.status) console.error(e);
      return Plugin.reply(e.status || 500, { error: e.message || String(e), codigo: e.codigo || '', retryAfter: e.retryAfter || 0, falta: e.falta || [] });
    }
  });
}
rota('estado', () => estado());
rota('modelos', () => ({ modelos: modelosParaTela() }));
rota('destinos', async (b, q, req) => (req.method === 'POST' ? { destino: await salvarDestino(b), destinos: (await destinos()).map(publico) } : { destinos: (await destinos()).map(publico) }));
rota('login', async (b) => {
  if (b.acao === 'iniciar') return { login: await loginIniciar() };
  if (b.acao === 'cancelar') { L.atual = null; return { login: null }; }
  if (b.acao === 'navegador') return { login: await loginNavegador() };
  if (b.acao === 'abrir') { const u = L.atual?.url || ''; if (!/^https?:\/\//.test(u)) throw new Falha('Peça um código primeiro.'); abrirUrl(u); return { login: loginVisivel() }; }
  if (b.acao === 'sair') { await sair(); return { login: null }; }
  return { login: loginVisivel() };
});
rota('times', async () => ({ times: await listarTimes() }));
rota('canais', async (b, q) => ({ canais: await listarCanais(q.time) }));
rota('chats', async () => ({ chats: await listarChats() }));
rota('opcoes', async (b, q) => opcoes(q));
rota('mensagens', async (b, q) => { const d = await resolver(q.to, ['canal', 'chat']); return { destino: d.rotulo, mensagens: await lerMensagens(d, { quantas: q.n || 15 }) }; });
rota('previa', async (b) => ({ cartao: b.modelo ? montarCartao(b.modelo, b.dados || {}, await mencoesCartao(b.mencionar)) : cartaoTexto(b.titulo, b.texto, await mencoesCartao(b.mencionar)) }));
rota('enviar', async (b) => enviar({ to: b.to, texto: b.texto, titulo: b.titulo, assunto: b.assunto, importancia: b.importancia, mencionar: b.mencionar, modelo: b.modelo, dados: b.dados, raiz: b.raiz, via: 'tela' }));
rota('historico', async (b, q, req) => { if (req.method === 'POST' && b.acao === 'limpar') { hist = []; try { fs.writeFileSync(ARQ_HIST, '[]'); } catch {} } return { itens: historico().slice(0, 100) }; });
rota('presenca', async (b, q, req) => {
  if (req.method !== 'POST') return { presenca: await lerPresenca() };
  const feito = {};
  if (b.disponibilidade) feito.presenca = await mudarPresenca(b.disponibilidade, b.minutos);
  if (b.mensagem !== undefined) feito.status = await mudarStatus(b.mensagem, b.minutosMensagem ?? b.minutos);
  return { ...feito, presenca: await lerPresenca().catch(() => null) };
});
rota('reuniao', async (b) => ({ reuniao: await criarReuniao({ assunto: b.assunto, inicio: quando(b.inicio, b.emMinutos), minutos: b.minutos, modo: b.modo, convidados: b.convidados, descricao: b.descricao }) }));
rota('agenda', async (b, q) => ({ reunioes: await agenda({ horas: q.horas }) }));
rota('abrir', async (b) => abrirLink(b));
rota('teste', async () => ({ ultimoAberto }));

abrirPonte();
p.run();
