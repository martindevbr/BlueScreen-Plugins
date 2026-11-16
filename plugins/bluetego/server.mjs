// Bluetego: servidor do plugin. Roda as transformações (a página não consegue: CORS, e a rede fica num lugar só),
// guarda as respostas por alguns minutos para não repetir consultas e abre links no navegador.
// As investigações não passam por aqui: a página grava direto em plugin.files.
// Os nós do Automator (no.mjs) chegam por /ponte: uma porta local com uma chave sorteada a cada início, gravadas em
// <pasta de dados>/ponte.json (só programas deste PC que leem a pasta de dados do plugin alcançam).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { TIPOS, detectar, extrair, normalizar, chave, tipoValido } from './lib/entidades.mjs';
import { TRANSFORMACOES, rodar, Falha } from './lib/transformacoes.mjs';
import { MAQUINAS } from './lib/maquinas.mjs';
import { INICIO, podar } from './lib/inicio.mjs';
import { pensar } from './lib/pistas.mjs';
import { montarPedido, lerResposta } from './lib/ia.mjs';
import { novoGrafo, roteiro, resumir, comoInvestigacao, aplicar } from './lib/automator.mjs';

const require = createRequire(import.meta.url);
const { Plugin } = require(path.join(process.env.BLUESCREEN_SDK, 'bluescreen.js'));
const p = new Plugin();
const AGENTE = 'Bluetego/0.2 (BlueScreen; +https://github.com/martindevbr/BlueScreen-Plugins)';
// busca na web e páginas que só respondem a navegador (DuckDuckGo, Telegram, Steam)
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_PAGINA = 2_000_000;

// ---------- rede ----------
// disjuntor: um site fora do ar faz cada consulta seguinte esperar o tempo inteiro (30 subdomínios × 25 s). Depois de
// uma falha de conexão, o mesmo site falha na hora por 2 minutos, com o motivo
const FORA = new Map();
// só falha de rede (DNS, conexão recusada ou caída, tempo esgotado) liga o disjuntor; cabeçalho inválido, certificado
// ruim ou redirecionamento em laço são do pedido ou do site, e o site continua no ar para as outras consultas
const DE_CONEXAO = /^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENETDOWN|EPIPE|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|UND_ERR_HEADERS_TIMEOUT)$/;
// corpo que não vai ser lido é cancelado (senão a conexão fica presa até o coletor de lixo passar)
const descartar = (r) => { try { r.body?.cancel().catch(() => {}); } catch {} };
// lê o corpo inteiro; o tempo do pedido também vale para o corpo, e estourar vira uma Falha com o motivo
async function corpo(r, host) {
  try { return await r.text(); } catch (e) { throw new Falha(e.name === 'TimeoutError' ? `${host} demorou demais para responder.` : `${host} cortou a resposta.`, { status: 504 }); }
}
async function pedir(url, opt = {}) {
  let host = url;
  try { host = new URL(url).host; } catch { throw new Falha('endereço inválido: ' + url); }
  const fora = FORA.get(host);
  if (fora && Date.now() < fora.ate) throw new Falha(`${fora.motivo} (pulado: tento de novo às ${new Date(fora.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})`, { status: 503 });
  try {
    const r = await fetch(url, { method: opt.method || 'GET', body: opt.body, headers: { 'user-agent': AGENTE, ...(opt.headers || {}) }, redirect: opt.redirect || 'follow', signal: AbortSignal.timeout(opt.timeout || 25000) });
    FORA.delete(host);
    return r;
  } catch (e) {
    const codigo = (e.cause && e.cause.code) || e.code || '';
    // conexão derrubada no meio (o PNCP faz isso de vez em quando): uma nova tentativa antes de dar o site como fora
    if (/ECONNRESET|UND_ERR_SOCKET/.test(codigo) && !opt.tentouDeNovo) return pedir(url, { ...opt, tentouDeNovo: true });
    if (e.name !== 'TimeoutError' && !DE_CONEXAO.test(codigo)) throw new Falha(`${host}: ${(e.cause && e.cause.message) || e.message || e}`, { status: 502 });
    const motivo = e.name === 'TimeoutError' ? `${host} demorou demais para responder.` : `Sem conexão com ${host}.`;
    // é por site: um subdomínio do alvo que não responde só pula a si mesmo
    FORA.set(host, { ate: Date.now() + 120000, motivo });
    throw new Falha(motivo, { status: e.name === 'TimeoutError' ? 504 : 503 });
  }
}
const ctxRede = {
  async json(url, opt = {}) {
    const r = await pedir(url, { ...opt, headers: { accept: 'application/json', ...(opt.headers || {}) } });
    return lerJson(r, new URL(url).host, opt);
  },
  async pagina(url, opt = {}) {
    const r = await pedir(url, { redirect: opt.seguir === false ? 'manual' : 'follow', timeout: opt.timeout, headers: { accept: 'text/html,*/*;q=0.8', ...(opt.navegador ? { 'user-agent': NAVEGADOR, 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7' } : {}), ...(opt.headers || {}) } });
    const headers = Object.fromEntries([...r.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
    let texto = '';
    // texto também quando o tipo é de chave PGP ou JavaScript (o keys.openpgp.org responde application/pgp-keys)
    if (/text|html|json|xml|javascript|pgp/i.test(headers['content-type'] || '') && r.body) {
      // lê no máximo 2 MB: uma página enorme (ou um download) não trava o servidor
      const leitor = r.body.getReader(), partes = [];
      let total = 0;
      try {
        while (total < MAX_PAGINA) { const { done, value } = await leitor.read(); if (done) break; partes.push(value); total += value.length; }
      } catch (e) { leitor.cancel().catch(() => {}); throw new Falha(e.name === 'TimeoutError' ? `${new URL(url).host} demorou demais para responder.` : `${new URL(url).host} cortou a resposta.`, { status: 504 }); }
      leitor.cancel().catch(() => {});
      texto = Buffer.concat(partes.map((x) => Buffer.from(x))).toString('utf8');
    } else r.body?.cancel().catch(() => {});
    return { status: r.status, url: r.url || url, headers, texto };
  },
  async post(url, dados, opt = {}) {
    const r = await pedir(url, { method: 'POST', timeout: opt.timeout || 30000, headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(dados) });
    return lerJson(r, new URL(url).host, opt);
  },
  // formulário (a consulta de improbidade do CNJ): devolve o texto no charset que o site declarar (ISO-8859-1 lá)
  async form(url, corpoTexto, opt = {}) {
    const r = await pedir(url, { method: 'POST', timeout: opt.timeout || 30000, headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', accept: '*/*' }, body: corpoTexto });
    if (!r.ok) { descartar(r); throw new Falha(`${new URL(url).host} respondeu ${r.status}.`, { status: 502 }); }
    const cs = (/charset=([\w-]+)/i.exec(r.headers.get('content-type') || '') || [])[1] || 'utf-8';
    const buf = await r.arrayBuffer();
    try { return new TextDecoder(cs).decode(buf); } catch { return new TextDecoder().decode(buf); }
  },
  // arquivo inteiro (documentos para ler os metadados), até "max" bytes: maior que isso, desiste sem baixar o resto
  async binario(url, opt = {}) {
    const max = opt.max || 15_000_000;
    const r = await pedir(url, { timeout: opt.timeout || 40000, headers: { 'user-agent': NAVEGADOR, accept: '*/*' } });
    if (!r.ok || !r.body) { r.body?.cancel().catch(() => {}); return { status: r.status, tipo: '', dados: null }; }
    const tam = Number(r.headers.get('content-length') || 0);
    if (tam > max) { r.body.cancel().catch(() => {}); return { status: r.status, tipo: r.headers.get('content-type') || '', dados: null, grande: true }; }
    const leitor = r.body.getReader(), partes = [];
    let total = 0;
    try {
      while (true) { const { done, value } = await leitor.read(); if (done) break; total += value.length; if (total > max) { leitor.cancel().catch(() => {}); return { status: r.status, dados: null, grande: true }; } partes.push(value); }
    } catch { leitor.cancel().catch(() => {}); return { status: r.status, dados: null }; }
    return { status: r.status, url: r.url || url, tipo: r.headers.get('content-type') || '', dados: Buffer.concat(partes.map((x) => Buffer.from(x))) };
  },
  // pelo plugin.fetch da IDE: o {{vault:...}} é trocado lá dentro, e a chave nunca passa por este processo
  async cofre(url, headers) {
    try {
      const r = await p.fetch(url, { headers: { 'user-agent': AGENTE, ...headers }, timeout: 25000 });
      return { status: r.status, ok: r.status >= 200 && r.status < 300, json: () => r.json() };
    } catch (e) {
      throw new Falha('Falta liberar a chave no Cofre (' + (e.message || e) + ').', { status: 403, codigo: 'cofre' });
    }
  },
  // GitHub: com o token do Cofre (5.000 consultas por hora), pelo plugin.fetch da IDE; sem ele, direto (60 por hora)
  async gh(caminho, opt = {}) {
    const url = 'https://api.github.com/' + caminho;
    const cab = { 'user-agent': AGENTE, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(opt.headers || {}) };
    if (await temTokenGithub()) {
      try {
        const r = await p.fetch(url, { headers: { ...cab, authorization: 'Bearer {{vault:bluetego.github}}' }, timeout: 25000 });
        if (r.status === 404) return null;
        if (r.status >= 200 && r.status < 300) return r.json();
        if (r.status === 401) { tokenGithub = { em: Date.now(), tem: false }; throw new Falha('O GitHub recusou o token guardado no Cofre (bluetego.github). Troque o valor no Cofre.', { status: 403, codigo: 'cofre', cofre: 'bluetego.github' }); }
        if (r.status !== 403 && r.status !== 429) throw new Falha(`api.github.com respondeu ${r.status}.`, { status: 502 });
      } catch (e) { if (e instanceof Falha) throw e; tokenGithub = { em: Date.now(), tem: false }; }
    }
    const r = await pedir(url, { headers: cab, timeout: opt.timeout });
    if (r.status === 404) { descartar(r); return null; }
    if (!r.ok) descartar(r);
    if ((r.status === 403 || r.status === 429) && r.headers.get('x-ratelimit-remaining') === '0') {
      const volta = Number(r.headers.get('x-ratelimit-reset')) * 1000;
      throw new Falha(`Acabou a cota da API do GitHub sem token (60 consultas por hora)${volta ? `, volta às ${new Date(volta).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}. Guarde um token do GitHub no Cofre (bluetego.github) para ter 5.000 por hora.`, { status: 429, codigo: 'cofre', cofre: 'bluetego.github' });
    }
    if (!r.ok) throw new Falha(`api.github.com respondeu ${r.status}.`, { status: 502 });
    const t = await corpo(r, 'api.github.com');
    try { return JSON.parse(t); } catch { throw new Falha('api.github.com não devolveu JSON.', { status: 502 }); }
  },
};
// resposta JSON: 404 (com nulo404), 429 e erro viram Falha com o motivo; o corpo que não serve é descartado
async function lerJson(r, host, opt = {}) {
  if (r.status === 404 && opt.nulo404) { descartar(r); return null; }
  if (r.status === 429) { descartar(r); throw new Falha(`${host} pediu para esperar (limite de consultas). Tente daqui a pouco.`, { status: 429 }); }
  if (!r.ok) { descartar(r); throw new Falha(`${host} respondeu ${r.status}.`, { status: 502 }); }
  const t = await corpo(r, host);
  try { return JSON.parse(t); } catch { throw new Falha(`${host} não devolveu JSON.`, { status: 502 }); }
}
// se há token do GitHub liberado no Cofre: conferido a cada 5 minutos (o usuário pode guardar um a qualquer hora)
let tokenGithub = { em: 0, tem: false };
async function temTokenGithub() {
  if (Date.now() - tokenGithub.em < 5 * 60 * 1000) return tokenGithub.tem;
  let tem = false;
  try { tem = !!((await p.vault.status()) || []).find((k) => k.key === 'bluetego.github' && k.exists && k.granted); } catch {}
  tokenGithub = { em: Date.now(), tem };
  return tem;
}

// ---------- respostas guardadas ----------
const CACHE = new Map();
const VALIDADE = 10 * 60 * 1000;
function lembrar(k, v) {
  CACHE.set(k, { em: Date.now(), v });
  if (CACHE.size > 800) CACHE.delete(CACHE.keys().next().value);
}
async function limite() {
  const v = Number((await p.settings().catch(() => ({}))).limite);
  return Number.isFinite(v) && v > 0 ? Math.min(500, Math.round(v)) : 40;
}

// ---------- rotas ----------
function rota(nome, fn) {
  p.route('bluetego/' + nome, async (req) => {
    if (req.remote) return Plugin.reply(403, { error: 'O Bluetego só responde no próprio PC.' });
    try { return (await fn(req.method === 'POST' ? req.json() : {}, req.query, req)) ?? { ok: true }; } catch (e) {
      if (!e.status) console.error(e);
      return Plugin.reply(e.status || 500, { error: e.message || String(e), codigo: e.codigo || '', cofre: e.cofre || '' });
    }
  });
}
rota('catalogo', () => ({
  tipos: TIPOS,
  transformacoes: TRANSFORMACOES.map(({ id, de, nome, fonte, rapida, cofre }) => ({ id, de, nome, fonte, rapida: !!rapida, cofre: cofre || '' })),
  maquinas: MAQUINAS,
  inicio: INICIO,
}));
rota('transformar', (b) => transformar(b));
async function transformar(b) {
  const lim = await limite();
  const cfg = await p.settings().catch(() => ({}));
  // as entidades ligadas (só as que a transformação usa, como os domínios para os e-mails prováveis)
  const vizinhos = Array.isArray(b.vizinhos) ? b.vizinhos.slice(0, 40).map((v) => ({ tipo: String(v.tipo || ''), valor: String(v.valor || '') })) : [];
  const sitesAmplo = Number(cfg.sitesAmplo) || 500;
  // a chave leva tudo o que muda o resultado: os vizinhos (e-mails prováveis), o texto inteiro (o valor de um texto
  // longo é só o começo dele) e quantos sites a busca ampla confere
  const extra = b.t === 'emails-provaveis' ? JSON.stringify(vizinhos) : b.tipo === 'texto' && b.completo ? crypto.createHash('sha1').update(String(b.completo)).digest('hex') : b.t === 'contas-amplo' ? String(sitesAmplo) : '';
  const k = [b.t, b.tipo, b.valor, lim, extra].join('|');
  const guardada = CACHE.get(k);
  // o primeiro olhar pede o resultado podado (só o que importa); o cache guarda sempre o inteiro
  const poda = b.poda && typeof b.poda === 'object' ? { lim: Number.isFinite(b.poda.lim) ? b.poda.lim : undefined, so: Array.isArray(b.poda.so) ? b.poda.so.map(String) : undefined } : null;
  if (guardada && Date.now() - guardada.em < VALIDADE && !b.deNovo) return podar({ ...guardada.v, guardada: true }, poda);
  const r = await rodar(String(b.t || ''), String(b.tipo || ''), String(b.valor || ''), { ...ctxRede, limite: lim, vizinhos, sitesAmplo }, b.completo);
  lembrar(k, r);
  return podar(r, poda);
}
rota('extrair', (b) => ({ entidades: extrair(String(b.texto || '')).filter((e) => e.tipo !== 'texto').map((e) => ({ ...e, id: chave(e.tipo, e.valor) })) }));
// o que a pessoa digitou: o tipo (o escolhido ou o adivinhado), o valor na forma canônica e o id
rota('entidade', (b) => {
  const bruto = String(b.valor || '').trim();
  if (!bruto) throw new Falha('Escreva um valor.');
  // só pontuação ("???", "---") não é nada que dê para investigar
  if (!/[\p{L}\p{N}]/u.test(bruto)) throw new Falha('Esse valor não tem letras nem números: escreva um domínio, e-mail, nome, telefone, IP…');
  const tipo = tipoValido(b.tipo) ? b.tipo : detectar(bruto);
  const valor = normalizar(tipo, bruto);
  return { tipo, valor, id: chave(tipo, valor), adivinhado: detectar(bruto) };
});
// o grafo pensando sem IA: pistas com a ação pronta (ligar, rodar)
rota('pensar', (b) => ({ pistas: pensar(b.grafo || {}, TRANSFORMACOES, b.aprendizado || {}) }));
// IA: o pedido sai daqui (a página manda para o provedor escolhido) e a resposta volta para ser conferida
rota('ia-pedido', (b) => montarPedido({ ...b, transformacoes: TRANSFORMACOES.filter((t) => !t.cofre) }));
rota('ia-ler', (b) => lerResposta(b.texto, b.mapa || {}, b.grafo || {}, TRANSFORMACOES, { modo: b.modo }));
rota('abrir', (b) => {
  const u = String(b.url || '');
  if (!/^https?:\/\/[^\s"]+$/i.test(u)) throw new Falha('só abro endereços http e https');
  spawn('rundll32.exe', ['url.dll,FileProtocolHandler', u], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return { ok: true };
});

// listas dos campos do Automator ("choicesFrom": "bluetego/opcoes?tipo=...")
rota('opcoes', (b, q) => {
  const nomeTipo = (t) => (TIPOS[t] && TIPOS[t].nome) || t;
  if (q.tipo === 'roteiros') return { choices: [{ value: 'olhar', label: 'Primeiro olhar (rápido, qualquer tipo)' }, ...MAQUINAS.map((m) => ({ value: m.id, label: `${m.nome} (${nomeTipo(m.de)})` }))] };
  if (q.tipo === 'transformacoes') return { choices: [...TRANSFORMACOES].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((t) => ({ value: t.id, label: `${t.nome} · ${t.de.map(nomeTipo).join(', ')}${t.cofre ? ' (chave no Cofre)' : ''}` })) };
  if (q.tipo === 'tipos') return { choices: [{ value: 'auto', label: 'Adivinhar pelo valor' }, ...Object.entries(TIPOS).map(([v, x]) => ({ value: v, label: x.nome }))] };
  throw new Falha('lista desconhecida: ' + q.tipo, { status: 404 });
});

// ---------- nós do Automator ----------
const NOMES = Object.fromEntries(TRANSFORMACOES.map((t) => [t.id, { nome: t.nome, de: t.de }]));
function entidade(valor, tipoPedido) {
  const bruto = String(valor ?? '').trim();
  if (!bruto) throw new Falha('Nada para investigar: o valor chegou vazio.');
  if (!/[\p{L}\p{N}]/u.test(bruto)) throw new Falha('Esse valor não tem letras nem números: use um domínio, e-mail, nome, telefone, IP…');
  const adivinhado = detectar(bruto);
  const tipo = tipoValido(tipoPedido) ? tipoPedido : adivinhado;
  const v = normalizar(tipo, bruto);
  return { tipo, valor: v, id: chave(tipo, v), adivinhado, tipo_nome: TIPOS[tipo].nome };
}
// o texto que chega de outro nó: o valor direto, ou o campo "valor" de um objeto (a saída de Reconhecer entidade)
const valorDe = (x, entrada) => {
  const v = x != null && String(x).trim() !== '' ? x : entrada;
  if (v && typeof v === 'object') return v.valor ?? v.value ?? v.semente?.valor ?? '';
  return v ?? '';
};
const transformarNo = (t, n, poda) => transformar({ t, tipo: n.tipo, valor: n.valor, poda, completo: n.tipo === 'texto' ? n.props.completo || n.valor : undefined });
async function gravar(g, nome) {
  const inv = comoInvestigacao(g, nome);
  await p.files.write('investigacoes/' + inv.id + '.json', JSON.stringify(inv));
  return { id: inv.id, nome: inv.nome };
}
const NOS = {
  async identificar(pr, entrada) { return entidade(valorDe(pr.valor, entrada), pr.tipo); },
  async extrair(pr, entrada) {
    const texto = typeof (pr.texto || entrada) === 'object' ? JSON.stringify(pr.texto || entrada) : String(pr.texto || entrada || '');
    const so = String(pr.tipos || '').split(/[,;\s]+/).filter(tipoValido);
    const l = extrair(texto).filter((e) => e.tipo !== 'texto' && (!so.length || so.includes(e.tipo)));
    return l.map((e) => ({ tipo: e.tipo, tipo_nome: TIPOS[e.tipo].nome, valor: e.valor }));
  },
  async transformar(pr, entrada) {
    const t = TRANSFORMACOES.find((x) => x.id === String(pr.transformacao || '').trim());
    if (!t) throw new Falha('Escolha a transformação no campo Transformação.');
    // sem tipo escolhido: o adivinhado, se a transformação aceita; senão o único tipo que ela aceita (um nome vira pessoa)
    const bruto = valorDe(pr.valor, entrada), adiv = detectar(String(bruto).trim());
    const e = entidade(bruto, tipoValido(pr.tipo) ? pr.tipo : t.de.includes(adiv) || t.de.length > 1 ? adiv : t.de[0]);
    if (!t.de.includes(e.tipo)) throw new Falha(`"${t.nome}" serve para ${t.de.map((x) => TIPOS[x].nome).join(', ')}, e o valor é ${TIPOS[e.tipo].nome}. Escolha o tipo no campo Tipo.`);
    const g = novoGrafo(e);
    const r = await transformarNo(t.id, g.nos.get(e.id));
    aplicar(g, g.nos.get(e.id), t.id, r);
    const saida = resumir(g, e, TIPOS, { transformacao: t.nome, ...(r.aviso ? { aviso: r.aviso } : {}) });
    if (pr.salvar === 'sim') saida.investigacao = await gravar(g, pr.nome || `${t.nome}: ${e.valor}`);
    return saida;
  },
  async investigar(pr, entrada) {
    const e = entidade(valorDe(pr.valor, entrada), pr.tipo);
    const id = String(pr.roteiro || 'olhar');
    let passos, escopo = false, nome;
    if (id === 'olhar') {
      passos = INICIO[e.tipo];
      nome = 'Primeiro olhar';
      // tipo sem roteiro curto: as transformações rápidas dele, como a tela faz
      if (!passos) passos = TRANSFORMACOES.filter((t) => t.rapida && t.de.includes(e.tipo)).map((t) => ({ t: t.id, max: 1 }));
    } else {
      const m = MAQUINAS.find((x) => x.id === id);
      if (!m) throw new Falha('Máquina desconhecida: ' + id + '. Escolha uma no campo Roteiro.');
      if (m.de !== e.tipo) throw new Falha(`A máquina "${m.nome}" começa num ${TIPOS[m.de].nome}, e o valor é ${TIPOS[e.tipo].nome}. Troque o roteiro ou escolha o tipo.`);
      passos = m.passos; escopo = !!m.escopo; nome = m.nome;
    }
    if (!passos.length) throw new Falha(`Nenhuma transformação automática para ${TIPOS[e.tipo].nome}.`);
    const g = novoGrafo(e);
    const inicio = Date.now();
    const r = await roteiro(g, g.nos.get(e.id), passos, { escopo, transformar: transformarNo, nomes: NOMES, avisar: (x) => g.historico.unshift({ quando: new Date().toISOString(), texto: x }) });
    g.historico.unshift({ quando: new Date().toISOString(), texto: `${nome} pelo Automator em ${e.valor}: ${r.novas} entidades` });
    const saida = resumir(g, e, TIPOS, {
      roteiro: nome, segundos: Math.round((Date.now() - inicio) / 100) / 10,
      ...(r.foraDoEscopo ? { fora_do_escopo: r.foraDoEscopo } : {}), avisos: r.avisos, erros: r.erros,
    });
    if (pr.salvar === 'sim') saida.investigacao = await gravar(g, pr.nome || `${nome}: ${e.valor}`);
    return saida;
  },
};

const PASTA_DADOS = process.env.BLUESCREEN_PLUGIN_DATA || '';
const ARQ_PONTE = PASTA_DADOS ? path.join(PASTA_DADOS, 'ponte.json') : '';
const CHAVE_PONTE = crypto.randomBytes(32).toString('hex');
const igual = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const ponte = http.createServer(async (rq, rs) => {
  const enviar = (status, corpoR) => { rs.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); rs.end(JSON.stringify(corpoR)); };
  // um navegador nunca chega aqui: sem origem, sem sec-fetch e com a chave que só a pasta de dados tem
  if (rq.url !== '/ponte' || rq.method !== 'POST' || rq.headers.origin || rq.headers['sec-fetch-site'] || !igual(rq.headers['x-bluetego-chave'], CHAVE_PONTE)) return enviar(403, { ok: false, erro: 'acesso negado' });
  try {
    const partes = []; let n = 0;
    for await (const c of rq) { n += c.length; if (n > 4e6) throw new Falha('Pedido grande demais.'); partes.push(c); }
    const b = JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
    const fn = Object.hasOwn(NOS, b.no) ? NOS[b.no] : null;
    if (!fn) return enviar(200, { ok: false, erro: 'Nó desconhecido: ' + b.no });
    enviar(200, { ok: true, valor: await fn(b.params || {}, b.entrada) });
  } catch (e) {
    if (!e.status) console.error(e);
    enviar(200, { ok: false, erro: e.message || String(e), cofre: e.cofre || '' });
  }
});
ponte.listen(0, '127.0.0.1', () => {
  if (!ARQ_PONTE) return;
  try { fs.mkdirSync(PASTA_DADOS, { recursive: true }); fs.writeFileSync(ARQ_PONTE, JSON.stringify({ porta: ponte.address().port, chave: CHAVE_PONTE, pid: process.pid }), { mode: 0o600 }); }
  catch (e) { console.error('Bluetego: não gravei ponte.json (os nós do Automator não vão funcionar): ' + e.message); }
});
ponte.unref();
process.on('exit', () => { try { if (ARQ_PONTE) fs.rmSync(ARQ_PONTE, { force: true }); } catch {} });
for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, () => process.exit(0));

p.run();
