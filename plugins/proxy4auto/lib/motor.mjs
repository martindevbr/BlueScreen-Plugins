/*
 * Proxy4Auto: o motor do proxy, embutido no plugin (não precisa de nenhuma pasta de fora).
 * É o localhost-proxy (github.com/martindevbr/proxy-server) como módulo do plugin:
 *
 *  - HTTP/HTTPS por nome de host  (apontamentos.txt: "nome destino")
 *  - TCP puro por porta           (apontamentos.txt: "tcp porta destino:porta")
 *  - Servidor DNS local opcional  (responde 127.0.0.1 para os nomes mapeados)
 *  - Sincronização opcional do arquivo hosts do Windows
 *  - Reescrita de links: URLs do destino no HTML/CSS/JS/JSON viram o endereço local
 *  - Porta de controle em 127.0.0.1 (--painel): é por ela que os nós do Automator mandam
 *
 *  Uso (quem chama são os nós):  node motor.mjs --dados <pasta> --painel <porta> [--dono <pid>]
 *  A pasta de dados guarda só texto: config.txt, apontamentos.txt e proxy.log.
 *  Sem dependências externas. Node >= 18.
 */
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? (process.argv[i + 1] || '') : ''; };
if (!arg('--dados')) { console.error('Falta --dados <pasta>.'); process.exit(64); }
const DIR        = path.resolve(arg('--dados'));
const UMA_VEZ    = process.argv.includes('--so-limpar') || process.argv.includes('--so-gravar-hosts');
const INICIO     = Date.now();
fs.mkdirSync(DIR, { recursive: true });
const ARQ_CONFIG = path.join(DIR, 'config.txt');
const ARQ_APONT  = path.join(DIR, 'apontamentos.txt');
const ARQ_LOG    = path.join(DIR, 'proxy.log');
const ARQ_HOSTS  = process.env.PROXY4AUTO_HOSTS || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts');
const MARCA_INI  = '# >>> proxy4auto (gerado automaticamente, nao edite este bloco)';
const MARCA_FIM  = '# <<< proxy4auto';
const IP_LOCAL   = '127.0.0.1';

// o motor roda sem console: o que ele diria na tela vai para o proxy.log (recomeça a cada ligada, até 2 MB)
let tamLog = 0;
if (!UMA_VEZ) { try { fs.writeFileSync(ARQ_LOG, ''); } catch {} }
const noLog = (...a) => {
  if (UMA_VEZ) return;
  const l = a.join(' ') + '\n';
  tamLog += l.length;
  try { if (tamLog > 2 << 20) { fs.writeFileSync(ARQ_LOG, l); tamLog = l.length; } else fs.appendFileSync(ARQ_LOG, l); } catch {}
};
console.log = noLog; console.error = noLog;

// ------------------------------------------------------------------ util
const hora = () => new Date().toLocaleTimeString('pt-BR', { hour12: false });
const log  = (tag, ...a) => { console.log(`${hora()} [${tag}]`, ...a); registrar('info', tag, a.join(' ')); };
const erro = (tag, ...a) => { console.error(`${hora()} [${tag}] ERRO:`, ...a); registrar('erro', tag, a.join(' ')); };
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ------------------------------------------------------------------ eventos (para o painel)
let ordem = 0;         // número de ordem de cada registro
const registros = [];          // últimas linhas de log/requisições
const ouvintes  = new Set();   // respostas SSE abertas no painel
/** @type {Map<string, {total:number, erros:number, status:number|null, ms:number|null, t:number|null}>} */
const estatisticas = new Map(); // por rota: "nome:porta" ou "tcp:porta"

function emitir(evento, dados) {
  const s = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
  for (const res of ouvintes) res.write(s);
}

function registrar(tipo, tag, texto, extra) {
  const r = { n: ++ordem, t: Date.now(), tipo, tag, texto, ...extra }; // n: a ordem, para quem acompanha não perder nem repetir
  registros.push(r);
  if (registros.length > 1000) registros.shift();
  emitir('log', r);
}

function contar(rota, status, ms) {
  const e = estatisticas.get(rota) || { total: 0, erros: 0, status: null, ms: null, t: null };
  e.total++;
  if (!status || status >= 500) e.erros++;
  Object.assign(e, { status, ms, t: Date.now() });
  estatisticas.set(rota, e);
  return e;
}

function lerLinhas(arq) {
  try { return fs.readFileSync(arq, 'utf8').split(/\r?\n/); }
  catch { return []; }
}

// ------------------------------------------------------------------ config
let cfg = {};
function carregarConfig() {
  const c = {
    porta_http: 80, dns: 'desativado', porta_dns: 53, dns_upstream: '8.8.8.8',
    hosts: 'ativo', log_detalhado: 'nao', reescrever_links: 'sim', rede: 'nao',
  };
  for (const l of lerLinhas(ARQ_CONFIG)) {
    const s = l.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    c[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  }
  c.porta_http = Number(c.porta_http) || 80;
  c.porta_dns  = Number(c.porta_dns)  || 53;
  c.porta_painel = Number(arg('--painel')) || 7170;
  c.rede       = /^(ativo|sim|true|1)$/i.test(c.rede); // sim: outros aparelhos da rede também acessam
  c.dnsAtivo   = /^(ativo|sim|true|1)$/i.test(c.dns);
  c.hostsAtivo = /^(ativo|sim|true|1)$/i.test(c.hosts);
  c.logDet     = /^(sim|true|1)$/i.test(c.log_detalhado);
  c.reescrever = /^(ativo|sim|true|1)$/i.test(c.reescrever_links);
  cfg = c;
  return c;
}

// ------------------------------------------------------------------ apontamentos
/** @type {Map<string, URL>} "nome:porta" -> URL de destino */
let mapaHttp = new Map();
/** @type {Set<string>} nomes (sem porta) que resolvem para 127.0.0.1 */
let nomesHttp = new Set();
/** @type {Array<{porta:number, host:string, portaDestino:number}>} */
let listaTcp = [];

function normalizarDestino(d) {
  if (!/^[a-z]+:\/\//i.test(d)) d = 'http://' + d;
  const u = new URL(d);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('protocolo não suportado: ' + u.protocol);
  return u;
}

// "nome:80" -> "nome", "nome:6544" -> "nome:6544"
const enderecoLocal = chave => chave.endsWith(':80') ? chave.slice(0, -3) : chave;
const portaDaChave  = chave => Number(chave.slice(chave.lastIndexOf(':') + 1));

/** Interpreta uma linha de apontamentos.txt (já sem espaços nas pontas). Lança erro se inválida. */
function interpretarLinha(s) {
  const p = s.replace(/\s+#.*$/, '').split(/\s+/);
  if (p[0].toLowerCase() === 'tcp') {
    if (p.length < 3) throw new Error('esperado: tcp porta destino:porta');
    const porta = Number(p[1]);
    const m = p[2].match(/^(.+):(\d+)$/);
    if (!porta || porta > 65535 || !m) throw new Error('porta ou destino inválido');
    return { tipo: 'tcp', porta, host: m[1].replace(/^\[|\]$/g, ''), portaDestino: Number(m[2]) };
  }
  // aceita "nome destino" e também "nome -> destino"
  const semSeta = p.filter(x => x !== '->' && x !== '=>' && x !== '=');
  if (semSeta.length < 2) throw new Error('esperado: nome destino');
  // "nome" usa porta_http; "nome:6544" escuta também na porta 6544
  const m = semSeta[0].toLowerCase().match(/^(.+?)(?::(\d+))?$/);
  const porta = m[2] ? Number(m[2]) : cfg.porta_http;
  if (!porta || porta > 65535) throw new Error('porta local inválida');
  if (!/^[a-z0-9._-]+$/.test(m[1])) throw new Error('nome local inválido (use letras, números, ponto e hífen)');
  return { tipo: 'http', chave: `${m[1]}:${porta}`, url: normalizarDestino(semSeta[1]) };
}

/** Linhas válidas de apontamentos.txt, com a posição no arquivo (usado pelo painel para editar). */
let entradas = [];

function carregarApontamentos() {
  const novoHttp = new Map();
  const novoTcp  = [];
  const novas    = [];
  lerLinhas(ARQ_APONT).forEach((l, n) => {
    const s = l.trim();
    if (!s || s.startsWith('#')) return;
    try {
      const r = interpretarLinha(s);
      if (r.tipo === 'tcp') novoTcp.push(r);
      else novoHttp.set(r.chave, r.url);
      novas.push({ linha: n, texto: s, ...r });
    } catch (e) {
      erro('CONFIG', `apontamentos.txt linha ${n + 1}: ${e.message}  ->  "${s}"`);
      novas.push({ linha: n, texto: s, tipo: 'invalida', erro: e.message });
    }
  });
  entradas  = novas;
  mapaHttp  = novoHttp;
  nomesHttp = new Set([...novoHttp.keys()].map(k => k.slice(0, k.lastIndexOf(':'))));
  listaTcp  = novoTcp;

  log('CONFIG', `${mapaHttp.size} apontamento(s) HTTP, ${listaTcp.length} TCP:`);
  for (const [k, v] of mapaHttp) console.log(`             http://${enderecoLocal(k)}  ->  ${v.origin}`);
  for (const t of listaTcp)      console.log(`             tcp 127.0.0.1:${t.porta}  ->  ${t.host}:${t.portaDestino}`);
}

// ------------------------------------------------------------------ proxy HTTP
function destinoPara(req) {
  // a porta vem do socket (porta em que a conexão chegou), não do cabeçalho Host
  const h = (req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  const chave = `${h}:${req.socket.localPort}`;
  return { chave, nome: enderecoLocal(chave), url: mapaHttp.get(chave) };
}

// conta a requisição na rota e avisa o painel (status 0 = falha de conexão)
function registrarRequisicao(chave, req, status, ms, obs) {
  const stats = mapaHttp.has(chave) ? contar(chave, status, ms) : null;
  registrar('req', 'HTTP', `${enderecoLocal(chave)} ${req.method} ${req.url} ${status || 'falha'} ${ms}ms${obs || ''}`,
    { rota: chave, metodo: req.method, caminho: req.url, status, ms, stats });
}

function cabecalhosSaida(req, destino) {
  const h = { ...req.headers };
  h.host = destino.host;
  h['x-forwarded-host']  = req.headers.host || '';
  h['x-forwarded-for']   = req.socket.remoteAddress || '';
  h['x-forwarded-proto'] = 'http';
  // Origin/Referer chegam com o endereço local; o destino espera o próprio endereço (CSRF, CORS)
  const local = 'http://' + (req.headers.host || '');
  for (const k of ['origin', 'referer']) {
    if (h[k] && h[k].toLowerCase().startsWith(local.toLowerCase())) h[k] = destino.origin + h[k].slice(local.length);
  }
  if (cfg.reescrever) {
    // só pede compressões que sabemos abrir para reescrever o corpo
    const aceitas = String(h['accept-encoding'] || '').split(',')
      .map(x => x.trim().split(';')[0].toLowerCase())
      .filter(x => ['gzip', 'deflate', 'br'].includes(x));
    if (aceitas.length) h['accept-encoding'] = aceitas.join(', ');
    else delete h['accept-encoding'];
    restaurarVercelNaSaida(h);
  }
  return h;
}

// ------------------------------------------------------------------ vestígios da Vercel
// Domínios da Vercel (*.vercel.app, vercel.live, *.vercel-storage.com...) viram o endereço local e a
// palavra "vercel" vira "localhost". O que volta do navegador é restaurado antes de ir ao destino,
// senão /_vercel/..., x-vercel-* e o cookie _vercel_* deixariam de funcionar.
const DOMINIO_VERCEL = '(?:[a-z0-9-]+\\.)*vercel(?:-[a-z]+)?\\.(?:app|com|live|sh)(?![\\w-]|\\.\\w)';
const RE_VERCEL_URL  = new RegExp(`(?<![\\w@./-])((?:http|ws)s?:)?(\\\\?/\\\\?/)?(?:\\*\\.)?${DOMINIO_VERCEL}`, 'gi');
const RE_VERCEL_COD  = new RegExp(`(http|ws)s?%3A%2F%2F${DOMINIO_VERCEL}`, 'gi');

const comCaixa = (orig, novo) => orig === orig.toUpperCase() ? novo.toUpperCase()
  : orig[0] === orig[0].toUpperCase() ? novo[0].toUpperCase() + novo.slice(1) : novo;
const palavraParaLocal  = s => s.replace(/vercel/gi, m => comCaixa(m, 'localhost'));
const palavraParaVercel = s => s.replace(/localhost/gi, m => comCaixa(m, 'vercel'));

// só o caminho: na query um "localhost" pode ser legítimo (ex.: ?volta=http://localhost:3000)
function caminhoParaDestino(caminho) {
  if (!cfg.reescrever) return caminho;
  const i = caminho.indexOf('?');
  return i < 0 ? palavraParaVercel(caminho) : palavraParaVercel(caminho.slice(0, i)) + caminho.slice(i);
}

function restaurarVercelNaSaida(h) {
  for (const k of Object.keys(h)) {
    if (!k.startsWith('x-localhost-')) continue;
    h[palavraParaVercel(k)] = h[k];
    delete h[k];
  }
  if (h.cookie) h.cookie = h.cookie.replace(/(^|;\s*)([^=;]+)/g, (m, sep, nome) => sep + palavraParaVercel(nome));
}

// ------------------------------------------------------------------ reescrita de links
// Troca as URLs que apontam para o destino pelo endereço local (ex.: localhost:2111).
// Cobre "https://site", "//site", "https:\/\/site" (JSON) e "https%3A%2F%2Fsite" (URL codificada).
// Para "www.site" também reescreve "site" e vice-versa.
function criarReescritor(destino, enderecoLocal) {
  const h = destino.hostname.replace(/^\[|\]$/g, '');
  const nomes = [h];
  if (!net.isIP(h)) nomes.push(h.startsWith('www.') ? h.slice(4) : 'www.' + h);
  const alt = nomes.map(escRe).join('|');

  const porta    = destino.port ? `:${destino.port}`   : '(?::(?:80|443))?';
  const portaCod = destino.port ? `%3A${destino.port}` : '(?:%3A(?:80|443))?';
  const reUrl = new RegExp(`((?:http|ws)s?:)?(\\\\?/\\\\?/)(?:${alt})${porta}(?![\\w-]|\\.\\w|:\\d)`, 'gi');
  const reCod = new RegExp(`(http|ws)s?%3A%2F%2F(?:${alt})${portaCod}(?![\\w-]|\\.\\w|%3A\\d)`, 'gi');
  const localCod = encodeURIComponent(enderecoLocal);

  const paraLocal = (m, esquema, barras) =>
    (esquema ? (/^ws/i.test(esquema) ? 'ws:' : 'http:') : '') + (barras || '') + enderecoLocal;
  const paraLocalCod = (m, esquema) => `${esquema.toLowerCase()}%3A%2F%2F${localCod}`;

  const vercel = t => palavraParaLocal(t
    .replace(RE_VERCEL_COD, paraLocalCod)
    .replace(RE_VERCEL_URL, paraLocal));

  const texto = t => vercel(t
    .replace(reUrl, paraLocal)
    .replace(reCod, paraLocalCod));

  const cookie = c => c
    .replace(/;\s*domain=[^;]*/gi, '')                 // cookie passa a valer para o nome local
    .replace(/;\s*secure(?=\s*;|\s*$)/gi, '')          // o acesso local é http
    .replace(/;\s*samesite=none/gi, '; SameSite=Lax')  // None sem Secure é recusado pelo navegador
    .replace(/^[^=]*/, vercel)                         // nome e atributos; o valor do cookie fica intacto
    .replace(/;.*$/s, vercel);

  return { texto, cookie, vercel };
}

const CAB_COM_URL = ['location', 'content-location', 'refresh', 'link',
  'content-security-policy', 'content-security-policy-report-only', 'access-control-allow-origin'];

// ------------------------------------------------------------------ vestígios da Cloudflare
// Só nos cabeçalhos da resposta: "cloudflare" vira "mockflare" (Server, NEL/Report-To em a.nel.cloudflare.com...)
// e os cabeçalhos cf-* viram mockflare-* (cf-ray, cf-cache-status...). O corpo não é tocado, senão
// cdnjs.cloudflare.com, challenges.cloudflare.com (Turnstile) etc. quebrariam; cookies __cf_bm/cf_clearance também ficam.
const nomeMockflare  = k => /^cf-/i.test(k) ? 'mockflare-' + k.slice(3) : palavraParaMockflare(k);
const valorMockflare = v => palavraParaMockflare(v).replace(/\bcf-nel\b/gi, 'mockflare-nel'); // grupo do NEL/Report-To
const palavraParaMockflare = s => s.replace(/cloudflare/gi, m => comCaixa(m, 'mockflare'));

function reescreverCabecalhos(headers, rw) {
  for (const k of CAB_COM_URL) if (typeof headers[k] === 'string') headers[k] = rw.texto(headers[k]);
  if (headers['set-cookie']) headers['set-cookie'] = headers['set-cookie'].map(rw.cookie);
  delete headers['strict-transport-security'];
  // nome e valor de qualquer cabeçalho (Server: Vercel, X-Vercel-Id, Server: cloudflare, CF-Ray, NEL...)
  for (const k of Object.keys(headers)) {
    if (k === 'set-cookie') continue;
    const novo = nomeMockflare(rw.vercel(k)), valor = valorMockflare(rw.vercel(headers[k]));
    if (novo !== k) delete headers[k];
    headers[novo] = valor;
  }
}

function corpoReescrevivel(req, pres) {
  if (req.method === 'HEAD' || pres.statusCode === 204 || pres.statusCode === 304) return false;
  const tipo = String(pres.headers['content-type'] || '');
  if (/event-stream/i.test(tipo)) return false; // streaming: não dá para acumular
  return /text\/|javascript|ecmascript|json|xml/i.test(tipo);
}

function descompactar(buf, codificacao) {
  switch (String(codificacao || '').trim().toLowerCase()) {
    case '': case 'identity': return buf;
    case 'gzip': case 'x-gzip': return zlib.gunzipSync(buf);
    case 'br': return zlib.brotliDecompressSync(buf);
    case 'deflate':
      try { return zlib.inflateSync(buf); } catch { return zlib.inflateRawSync(buf); }
    default: throw new Error('compressão não suportada: ' + codificacao);
  }
}

function tratarHttp(req, res) {
  const t0 = Date.now();
  const { chave, nome, url } = destinoPara(req);

  if (!url) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`localhost-proxy: nenhum apontamento para "${nome}".\n\nNomes configurados:\n` +
            [...mapaHttp.keys()].map(k => '  - ' + enderecoLocal(k)).join('\n') + '\n');
    console.log(`${hora()} [HTTP]`, `${nome} ${req.method} ${req.url} -> (sem apontamento) 502`);
    registrarRequisicao(chave, req, 502, Date.now() - t0, ' (sem apontamento)');
    return;
  }

  const mod = url.protocol === 'https:' ? https : http;
  const opts = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: caminhoParaDestino(req.url),
    headers: cabecalhosSaida(req, url),
    servername: url.hostname,
    rejectUnauthorized: false, // aceita certificados self-signed no destino
  };

  const preq = mod.request(opts, pres => {
    const headers = { ...pres.headers };
    const fim = extra => {
      const ms = Date.now() - t0;
      console.log(`${hora()} [HTTP]`, `${nome} ${req.method} ${req.url} -> ${url.origin} ${pres.statusCode} ${ms}ms${extra || ''}`);
      registrarRequisicao(chave, req, pres.statusCode, ms, extra);
    };
    const repassar = () => {
      res.writeHead(pres.statusCode, pres.statusMessage, headers);
      pres.pipe(res);
      pres.on('end', () => fim());
    };

    if (!cfg.reescrever) {
      // sem reescrita completa: ainda devolve redirecionamentos para o nome local
      if (headers.location) {
        try {
          const loc = new URL(headers.location, url);
          if (loc.host === url.host) {
            loc.protocol = 'http:';
            loc.host = req.headers.host || nome;
            headers.location = loc.toString();
          }
        } catch { /* ignora */ }
      }
      return repassar();
    }

    const rw = criarReescritor(url, req.headers.host || nome);
    reescreverCabecalhos(headers, rw);
    if (!corpoReescrevivel(req, pres)) return repassar();

    const partes = [];
    pres.on('data', c => partes.push(c));
    pres.on('error', e => { erro('HTTP', `${nome} ${req.url}: ${e.message}`); res.destroy(); });
    pres.on('end', () => {
      let corpo = Buffer.concat(partes);
      let obs = ' (links reescritos)';
      try {
        // latin1 preserva os bytes (UTF-8 inclusive); os padrões trocados são só ASCII
        const texto = descompactar(corpo, headers['content-encoding']).toString('latin1');
        corpo = Buffer.from(rw.texto(texto), 'latin1');
        delete headers['content-encoding'];
      } catch (e) {
        obs = ` (sem reescrita: ${e.message})`;
      }
      delete headers['transfer-encoding'];
      headers['content-length'] = corpo.length;
      res.writeHead(pres.statusCode, pres.statusMessage, headers);
      res.end(corpo);
      fim(obs);
    });
  });

  preq.on('error', e => {
    erro('HTTP', `${nome} ${req.method} ${req.url} -> ${url.origin}: ${e.message}`);
    registrarRequisicao(chave, req, 0, Date.now() - t0);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`localhost-proxy: falha ao conectar em ${url.origin}\n${e.message}\n`);
  });

  if (cfg.logDet) log('HTTP', `${nome} ${req.method} ${req.url}`, JSON.stringify(req.headers));
  req.pipe(preq);
}

// WebSocket / upgrade: conecta no destino em TCP e repassa o handshake bruto
function tratarUpgrade(req, socket, head) {
  const { nome, url } = destinoPara(req);
  if (!url) { socket.destroy(); return; }
  const porta = url.port || (url.protocol === 'https:' ? 443 : 80);
  const conectar = url.protocol === 'https:'
    ? cb => tls.connect({ host: url.hostname, port: porta, servername: url.hostname, rejectUnauthorized: false }, cb)
    : cb => net.connect({ host: url.hostname, port: porta }, cb);

  const alvo = conectar(() => {
    const h = cabecalhosSaida(req, url);
    let cab = `${req.method} ${caminhoParaDestino(req.url)} HTTP/${req.httpVersion}\r\n`;
    for (const [k, v] of Object.entries(h)) cab += `${k}: ${v}\r\n`;
    alvo.write(cab + '\r\n');
    if (head && head.length) alvo.write(head);
    alvo.pipe(socket).pipe(alvo);
    log('WS', `${nome} ${req.url} -> ${url.origin} (upgrade)`);
  });
  const fechar = () => { socket.destroy(); alvo.destroy(); };
  alvo.on('error', e => { erro('WS', `${nome}: ${e.message}`); fechar(); });
  socket.on('error', fechar);
}

// Um servidor HTTP por porta: porta_http + as portas usadas em "nome:porta"
/** @type {Map<number, http.Server>} */
const servidoresHttp = new Map();
/** @type {Map<number, string>} portas que não abriram -> código do erro (EADDRINUSE, EACCES...) */
const falhasHttp = new Map();
let escutaHttp = null; // endereço em que as portas foram abertas
const enderecoEscuta = () => (cfg.rede ? '0.0.0.0' : IP_LOCAL);

function criarServidorHttp(porta) {
  const srv = http.createServer(tratarHttp);
  srv.on('upgrade', tratarUpgrade);
  srv.on('error', e => {
    // só reclama na primeira vez: a porta é tentada de novo a cada 5 s
    if (falhasHttp.get(porta) !== e.code) erro('HTTP', `não foi possível escutar na porta ${porta}: ${e.message}`);
    falhasHttp.set(porta, e.code || 'erro');
    if (servidoresHttp.get(porta) === srv) servidoresHttp.delete(porta);
  });
  srv.listen(porta, enderecoEscuta(), () => {
    falhasHttp.delete(porta);
    log('HTTP', `proxy escutando em ${enderecoEscuta()}:${porta}  (acesse http://<nome>${porta === 80 ? '' : ':' + porta}/)`);
    emitir('estado', {});
  });
  return srv;
}

function reiniciarHttp() {
  const portas = new Set([cfg.porta_http, ...[...mapaHttp.keys()].map(portaDaChave)]);
  const mudouEscuta = escutaHttp !== null && escutaHttp !== enderecoEscuta();
  escutaHttp = enderecoEscuta();
  for (const p of [...falhasHttp.keys()]) if (!portas.has(p)) falhasHttp.delete(p);
  for (const [p, srv] of servidoresHttp) {
    if (portas.has(p) && !mudouEscuta) continue;
    srv.close();
    srv.closeAllConnections?.();
    servidoresHttp.delete(p);
    log('HTTP', `porta ${p} liberada`);
  }
  for (const p of portas) if (!servidoresHttp.has(p)) servidoresHttp.set(p, criarServidorHttp(p));
}

// ------------------------------------------------------------------ TCP puro
let servidoresTcp = [];
const falhasTcp = new Map();
function reiniciarTcp() {
  for (const s of servidoresTcp) s.close();
  servidoresTcp = [];
  falhasTcp.clear();
  for (const t of listaTcp) {
    const srv = net.createServer(cli => {
      const alvo = net.connect({ host: t.host, port: t.portaDestino }, () => {
        log('TCP', `:${t.porta} ${cli.remoteAddress} -> ${t.host}:${t.portaDestino}`);
        emitir('tcp', { rota: `tcp:${t.porta}`, stats: contar(`tcp:${t.porta}`, 200, null) });
        cli.pipe(alvo).pipe(cli);
      });
      const fechar = () => { cli.destroy(); alvo.destroy(); };
      alvo.on('error', e => {
        erro('TCP', `:${t.porta} -> ${t.host}:${t.portaDestino}: ${e.message}`);
        if (!alvo.remoteAddress) emitir('tcp', { rota: `tcp:${t.porta}`, stats: contar(`tcp:${t.porta}`, 0, null) });
        fechar();
      });
      cli.on('error', fechar);
    });
    srv.on('error', e => { falhasTcp.set(t.porta, e.code || 'erro'); erro('TCP', `porta ${t.porta}: ${e.message}`); });
    srv.listen(t.porta, IP_LOCAL);
    servidoresTcp.push(srv);
  }
}

// ------------------------------------------------------------------ DNS local
let dnsSock = null;   // atende os clientes locais (127.0.0.1:53)
let upSock  = null;   // fala com o DNS upstream (precisa sair pela interface real)
const pendentes = new Map(); // id -> { rinfo, timer }

function lerNomeDns(buf, off) {
  const partes = [];
  while (off < buf.length) {
    const len = buf[off++];
    if (len === 0) break;
    if ((len & 0xc0) === 0xc0) { off++; break; } // ponteiro (não ocorre em perguntas)
    partes.push(buf.toString('ascii', off, off + len));
    off += len;
  }
  return { nome: partes.join('.').toLowerCase(), fim: off };
}

function respostaLocal(msg, tipo, fimPergunta) {
  // cabeçalho: copia ID, seta QR=1, AA=1, RD copiado, RA=1; QDCOUNT=1; ANCOUNT=0/1
  const cab = Buffer.from(msg.subarray(0, 12));
  cab[2] = 0x84 | (msg[2] & 0x01);
  cab[3] = 0x80;
  cab.writeUInt16BE(1, 4);
  const temResposta = tipo === 1; // A
  cab.writeUInt16BE(temResposta ? 1 : 0, 6);
  cab.writeUInt16BE(0, 8);
  cab.writeUInt16BE(0, 10);
  const pergunta = msg.subarray(12, fimPergunta);
  if (!temResposta) return Buffer.concat([cab, pergunta]); // AAAA etc: NOERROR sem dados
  const resp = Buffer.alloc(16);
  resp.writeUInt16BE(0xc00c, 0); // ponteiro para o nome na pergunta
  resp.writeUInt16BE(1, 2);      // tipo A
  resp.writeUInt16BE(1, 4);      // classe IN
  resp.writeUInt32BE(5, 6);      // TTL 5s (recarga rápida ao editar)
  resp.writeUInt16BE(4, 10);
  Buffer.from(IP_LOCAL.split('.').map(Number)).copy(resp, 12);
  return Buffer.concat([cab, pergunta, resp]);
}

function iniciarDns() {
  if (dnsSock) { try { dnsSock.close(); } catch {} dnsSock = null; }
  if (upSock)  { try { upSock.close();  } catch {} upSock  = null; }
  if (!cfg.dnsAtivo) return;

  upSock = dgram.createSocket('udp4');
  upSock.on('message', msg => { // resposta do upstream
    if (msg.length < 12) return;
    const p = pendentes.get(msg.readUInt16BE(0));
    if (!p || !dnsSock) return;
    clearTimeout(p.timer);
    pendentes.delete(msg.readUInt16BE(0));
    dnsSock.send(msg, p.rinfo.port, p.rinfo.address);
  });
  upSock.on('error', e => erro('DNS', `upstream: ${e.message}`));
  upSock.bind(0);

  dnsSock = dgram.createSocket('udp4');
  dnsSock.on('message', (msg, rinfo) => {
    if (msg.length < 12) return;
    const id = msg.readUInt16BE(0);
    if (msg[2] & 0x80) return; // ignora respostas enviadas a nós

    const { nome, fim } = lerNomeDns(msg, 12);
    if (fim + 4 > msg.length) return;
    const tipo = msg.readUInt16BE(fim);
    const fimPergunta = fim + 4;

    if (nomesHttp.has(nome)) {
      dnsSock.send(respostaLocal(msg, tipo, fimPergunta), rinfo.port, rinfo.address);
      if (tipo === 1) log('DNS', `${nome} -> ${IP_LOCAL}`);
      return;
    }
    // repassa ao upstream
    const timer = setTimeout(() => pendentes.delete(id), 5000);
    pendentes.set(id, { rinfo, timer });
    upSock.send(msg, 53, cfg.dns_upstream);
  });
  dnsSock.on('error', e => {
    erro('DNS', `porta ${cfg.porta_dns}: ${e.message}`);
    if (e.code === 'EADDRINUSE') erro('DNS', 'porta do DNS ocupada (Docker/WSL/ICS?). Desligue o DNS local ou mude a porta do DNS.');
    try { dnsSock.close(); } catch {}
    dnsSock = null;
  });
  dnsSock.bind(cfg.porta_dns, IP_LOCAL, () =>
    log('DNS', `escutando em ${IP_LOCAL}:${cfg.porta_dns} (upstream ${cfg.dns_upstream})`));
}

// ------------------------------------------------------------------ hosts
const RE_BLOCO = () => new RegExp(`\\r?\\n?${escRe(MARCA_INI)}[\\s\\S]*?${escRe(MARCA_FIM)}\\r?\\n?`);

let estadoHosts = 'desativado'; // desativado | ok | sem-permissao | erro

function sincronizarHosts() {
  if (!cfg.hostsAtivo) { if (estadoHosts === 'ok') limparHosts(); estadoHosts = 'desativado'; return; }
  let atual;
  try { atual = fs.readFileSync(ARQ_HOSTS, 'utf8'); }
  catch (e) { estadoHosts = 'erro'; erro('HOSTS', `não consegui ler ${ARQ_HOSTS}: ${e.message}`); return; }

  const linhas = [...nomesHttp].map(n => `${IP_LOCAL}\t${n}`);
  const bloco = [MARCA_INI, ...linhas, MARCA_FIM].join('\r\n');
  let novo = atual.replace(RE_BLOCO(), '\r\n');
  if (!novo.endsWith('\n')) novo += '\r\n';
  if (linhas.length) novo += bloco + '\r\n';
  if (novo === atual) { estadoHosts = 'ok'; return; }

  try {
    fs.writeFileSync(ARQ_HOSTS, novo, 'utf8');
    estadoHosts = 'ok';
    log('HOSTS', `arquivo hosts atualizado com ${linhas.length} nome(s)`);
    execFile('ipconfig', ['/flushdns'], () => {});
  } catch (e) {
    if (estadoHosts !== 'sem-permissao') log('HOSTS', `sem permissão para escrever no hosts (${e.code}): os nomes locais dependem do nó Permissão de administrador ou do DNS local.`);
    estadoHosts = 'sem-permissao';
  }
}

/** Tira o bloco do proxy do hosts. Devolve 'limpo', 'sem-bloco' ou 'sem-permissao'. */
function limparHosts() {
  try {
    const atual = fs.readFileSync(ARQ_HOSTS, 'utf8');
    const novo = atual.replace(RE_BLOCO(), '\r\n');
    if (novo === atual) return 'sem-bloco';
    fs.writeFileSync(ARQ_HOSTS, novo, 'utf8');
    log('HOSTS', 'bloco removido do hosts');
    execFile('ipconfig', ['/flushdns'], () => {});
    return 'limpo';
  } catch (e) { log('HOSTS', `não consegui limpar o hosts: ${e.message}`); return 'sem-permissao'; }
}

// este processo consegue gravar o hosts? (é o que "rodar como administrador" muda)
function podeGravarHosts() {
  try { fs.closeSync(fs.openSync(ARQ_HOSTS, 'r+')); return true; } catch { return false; }
}

// ------------------------------------------------------------------ painel web
// A porta de controle (http://127.0.0.1:<--painel>): por ela os nós leem o estado e mudam rotas e ajustes. Sem tela.
let painel = null, portaPainel = 0;

function iniciarPainel() {
  if (painel && portaPainel === cfg.porta_painel) return;
  if (painel) { painel.close(); painel.closeAllConnections?.(); painel = null; }
  if (servidoresHttp.has(cfg.porta_painel)) {
    const s = servidoresHttp.get(cfg.porta_painel);
    s.close(); s.closeAllConnections?.(); servidoresHttp.delete(cfg.porta_painel);
    falhasHttp.set(cfg.porta_painel, 'RESERVADA'); // a porta de controle não pode ser porta de rota
  }
  const srv = http.createServer((req, res) => tratarPainel(req, res).catch(e => {
    if (!res.headersSent) responder(res, 500, { erro: e.message });
  }));
  srv.on('error', e => {
    erro('PAINEL', `não foi possível abrir a porta de controle ${cfg.porta_painel}: ${e.message}`);
    process.exit(3); // sem ela ninguém comanda o motor
  });
  srv.listen(cfg.porta_painel, IP_LOCAL, () =>
    log('PAINEL', `porta de controle em http://${IP_LOCAL}:${cfg.porta_painel}/`));
  painel = srv;
  portaPainel = cfg.porta_painel;
}

function responder(res, status, dados) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(dados));
}

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let s = '';
    req.setEncoding('utf8');
    req.on('data', c => { s += c; if (s.length > 1e5) { req.destroy(); falha(new Error('corpo grande demais')); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { falha(new Error('JSON inválido')); } });
    req.on('error', falha);
  });
}

function estado() {
  const rotas = entradas.map(e => {
    const base = { linha: e.linha, texto: e.texto, tipo: e.tipo };
    if (e.tipo === 'http') {
      return { ...base, id: e.chave, nome: e.chave.slice(0, e.chave.lastIndexOf(':')), porta: portaDaChave(e.chave),
        local: 'http://' + enderecoLocal(e.chave), destino: e.url.origin, stats: estatisticas.get(e.chave) || null };
    }
    if (e.tipo === 'tcp') {
      return { ...base, id: `tcp:${e.porta}`, porta: e.porta, local: `${IP_LOCAL}:${e.porta}`,
        destino: `${e.host}:${e.portaDestino}`, stats: estatisticas.get(`tcp:${e.porta}`) || null };
    }
    return { ...base, erro: e.erro };
  });
  return {
    motor: 'proxy4auto', pid: process.pid, desde: INICIO, administrador: podeGravarHosts(),
    dados: DIR, dono: DONO || null,
    config: {
      porta_http: cfg.porta_http, porta_dns: cfg.porta_dns, dns_upstream: cfg.dns_upstream,
      dns: cfg.dnsAtivo, hosts: cfg.hostsAtivo, reescrever_links: cfg.reescrever, log_detalhado: cfg.logDet, rede: cfg.rede,
    },
    servicos: {
      http: [...[...servidoresHttp].filter(([porta]) => !falhasHttp.has(porta)).map(([porta, srv]) => ({ porta, ativo: srv.listening })),
        ...[...falhasHttp].map(([porta, erro]) => ({ porta, ativo: false, erro }))].sort((a, b) => a.porta - b.porta),
      tcp: listaTcp.map((t, i) => ({ porta: t.porta, ativo: !falhasTcp.has(t.porta) && !!servidoresTcp[i]?.listening, ...(falhasTcp.has(t.porta) ? { erro: falhasTcp.get(t.porta) } : {}) })),
      dns: cfg.dnsAtivo ? (dnsSock ? 'ok' : 'falhou') : 'desativado',
      hosts: estadoHosts,
    },
    rotas,
    log: registros,
  };
}

/** Grava o arquivo mantendo comentários e quebras de linha, e recarrega na hora. */
function gravarLinhas(arq, alterar) {
  let texto = '';
  try { texto = fs.readFileSync(arq, 'utf8'); } catch { /* arquivo novo */ }
  const eol = texto.includes('\r\n') ? '\r\n' : '\n';
  const linhas = texto.split(/\r?\n/);
  alterar(linhas);
  fs.writeFileSync(arq, linhas.join(eol), 'utf8');
  gravadosPeloPainel.set(arq, fs.statSync(arq).mtimeMs);
  recarregarTudo(`${path.basename(arq)} alterado pelo painel`);
}

// confere que a linha ainda é a que o painel mostrou (o txt pode ter sido editado à mão)
function conferirLinha(linhas, alvo) {
  if (!alvo || !Number.isInteger(alvo.linha) || (linhas[alvo.linha] || '').trim() !== alvo.texto) {
    const e = new Error('As rotas mudaram enquanto o nó trabalhava. Rode de novo.');
    e.status = 409;
    throw e;
  }
}

function montarLinha(b) {
  const destino = String(b.destino || '').trim();
  if (!destino || /\s/.test(destino)) throw new Error('Informe o destino, sem espaços.');
  let linha;
  if (b.tipo === 'tcp') {
    linha = `tcp ${Number(b.porta)}`.padEnd(20) + ' ' + destino;
  } else {
    const nome = String(b.nome || '').trim().toLowerCase();
    if (!nome) throw new Error('Informe o nome local.');
    linha = (b.porta ? `${nome}:${Number(b.porta)}` : nome).padEnd(20) + ' ' + destino;
  }
  interpretarLinha(linha.trim()); // valida com as mesmas regras da leitura do arquivo
  return linha;
}

const validarPorta = v => { const n = Number(v); if (!(n >= 1 && n <= 65535)) throw new Error('Porta inválida (1 a 65535).'); return String(n); };
const CONFIG_EDITAVEL = {
  porta_http:       validarPorta,
  porta_dns:        validarPorta,
  dns_upstream:     v => { if (!net.isIP(String(v).trim())) throw new Error('Informe um IP, ex.: 8.8.8.8'); return String(v).trim(); },
  dns:              v => (v ? 'ativo' : 'desativado'),
  hosts:            v => (v ? 'ativo' : 'desativado'),
  reescrever_links: v => (v ? 'sim' : 'nao'),
  log_detalhado:    v => (v ? 'sim' : 'nao'),
  rede:             v => (v ? 'sim' : 'nao'),
};

function testarRota(id) {
  return new Promise(ok => {
    const t0 = Date.now();
    let feito = false;
    const fim = r => { if (!feito) { feito = true; ok({ ...r, ms: Date.now() - t0 }); } };
    if (id.startsWith('tcp:')) {
      const t = listaTcp.find(x => `tcp:${x.porta}` === id);
      if (!t) return fim({ ok: false, erro: 'rota não encontrada' });
      const s = net.connect({ host: t.host, port: t.portaDestino });
      s.setTimeout(6000, () => { s.destroy(); fim({ ok: false, erro: 'tempo esgotado' }); });
      s.on('connect', () => { s.destroy(); fim({ ok: true }); });
      s.on('error', e => fim({ ok: false, erro: e.code || e.message }));
      return;
    }
    const url = mapaHttp.get(id);
    if (!url) return fim({ ok: false, erro: 'rota não encontrada' });
    const r = (url.protocol === 'https:' ? https : http).get(url, { rejectUnauthorized: false, timeout: 6000 }, pres => {
      pres.destroy();
      fim({ ok: pres.statusCode < 500, status: pres.statusCode });
    });
    r.on('timeout', () => r.destroy(new Error('tempo esgotado')));
    r.on('error', e => fim({ ok: false, erro: e.code || e.message }));
  });
}

async function tratarPainel(req, res) {
  // só aceita acesso pelo próprio endereço (bloqueia DNS rebinding)
  const host = (req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  if (!['127.0.0.1', 'localhost'].includes(host)) return responder(res, 403, { erro: 'acesse pelo 127.0.0.1' });
  const u = new URL(req.url, 'http://painel');

  // alterações só com JSON: outro site não consegue enviar isso sem permissão de CORS
  if (req.method !== 'GET' && !/^application\/json/i.test(req.headers['content-type'] || '')) {
    return responder(res, 415, { erro: 'use application/json' });
  }

  try {
    switch (`${req.method} ${u.pathname}`) {
      case 'GET /':
        return responder(res, 200, { motor: 'proxy4auto', pid: process.pid });

      case 'POST /api/desligar': { // sai direito: tira o bloco do hosts (se tiver permissão) e fecha
        await lerCorpo(req);
        const hosts = limparHosts();
        responder(res, 200, { desligando: true, pid: process.pid, hosts });
        log('PROXY', 'desligado por um nó');
        setTimeout(() => process.exit(0), 150);
        return;
      }

      case 'GET /api/estado':
        return responder(res, 200, estado());

      case 'GET /api/eventos':
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
        res.write('retry: 2000\n\n');
        ouvintes.add(res);
        req.on('close', () => ouvintes.delete(res));
        return;

      case 'GET /api/testar':
        return responder(res, 200, await testarRota(u.searchParams.get('id') || ''));

      case 'POST /api/rotas': { // cria; com "original" substitui a linha existente
        const b = await lerCorpo(req);
        const linha = montarLinha(b);
        gravarLinhas(ARQ_APONT, linhas => {
          if (b.original) { conferirLinha(linhas, b.original); linhas[b.original.linha] = linha; return; }
          while (linhas.length && linhas[linhas.length - 1].trim() === '') linhas.pop();
          linhas.push(linha, '');
        });
        return responder(res, 200, estado());
      }

      case 'DELETE /api/rotas': {
        const b = await lerCorpo(req);
        gravarLinhas(ARQ_APONT, linhas => { conferirLinha(linhas, b); linhas.splice(b.linha, 1); });
        return responder(res, 200, estado());
      }

      case 'POST /api/config': {
        const b = await lerCorpo(req);
        const ajustar = CONFIG_EDITAVEL[b.chave];
        if (!ajustar) return responder(res, 400, { erro: 'ajuste desconhecido' });
        const valor = ajustar(b.valor);
        gravarLinhas(ARQ_CONFIG, linhas => {
          const re = new RegExp(`^\\s*${escRe(b.chave)}\\s*=`);
          const i = linhas.findIndex(l => re.test(l));
          if (i >= 0) linhas[i] = `${b.chave}=${valor}`;
          else linhas.push(`${b.chave}=${valor}`);
        });
        return responder(res, 200, estado());
      }
    }
  } catch (e) {
    return responder(res, e.status || 400, { erro: e.message });
  }
  responder(res, 404, { erro: 'não encontrado' });
}

// ------------------------------------------------------------------ ciclo de vida
function recarregarTudo(motivo) {
  const antes = { dns: cfg.porta_dns, dnsAtivo: cfg.dnsAtivo };
  carregarConfig();
  if (motivo) log('CONFIG', `recarregando (${motivo})`);
  carregarApontamentos();
  reiniciarHttp();
  reiniciarTcp();
  if (antes.dns !== cfg.porta_dns || antes.dnsAtivo !== cfg.dnsAtivo || !dnsSock) iniciarDns();
  sincronizarHosts();
  iniciarPainel();
  emitir('estado', {});
}

// mtime dos arquivos gravados pelo painel: já foram recarregados, o vigia não precisa repetir
const gravadosPeloPainel = new Map();

function vigiar(arq, rotulo) {
  fs.watchFile(arq, { interval: 800 }, (a, b) => {
    if (a.mtimeMs === b.mtimeMs || gravadosPeloPainel.get(arq) === a.mtimeMs) return;
    recarregarTudo(`${rotulo} alterado`);
  });
}

function encerrar(motivo) {
  log('PROXY', `encerrando${typeof motivo === 'string' ? ' (' + motivo + ')' : ''}...`);
  limparHosts();
  process.exit(0);
}

// os dois arquivos de texto nascem com a explicação dentro
function criarArquivos() {
  if (!fs.existsSync(ARQ_CONFIG)) fs.writeFileSync(ARQ_CONFIG, [
    '# Ajustes do proxy do Proxy4Auto (recarregado ao salvar). Mude pelo nó "Ajustar o proxy" ou aqui.',
    '', '# Porta em que os nomes locais respondem (http://nome)', 'porta_http=80',
    '', '# DNS local: responde 127.0.0.1 para os nomes das rotas e repassa o resto ao dns_upstream', 'dns=desativado', 'porta_dns=53', 'dns_upstream=8.8.8.8',
    '', '# Gravar os nomes no hosts do Windows (precisa de administrador)', 'hosts=ativo',
    '', '# Trocar no que vem do destino as URLs dele pelo endereço local e apagar rastros da Vercel e da Cloudflare', 'reescrever_links=sim',
    '', '# Aceitar outros aparelhos da rede (nao: só este PC)', 'rede=nao',
    '', '# Cabeçalhos de cada requisição no proxy.log', 'log_detalhado=nao', '',
  ].join('\r\n'));
  if (!fs.existsSync(ARQ_APONT)) fs.writeFileSync(ARQ_APONT, [
    '# Rotas do proxy do Proxy4Auto (recarregado ao salvar). Mude pelo nó "Apontar um nome" ou aqui.',
    '#   nome-local         destino            ex.: localhost-api  https://api.exemplo.com',
    '#   nome-local:porta   destino            escuta também nessa porta',
    '#   tcp porta-local    destino:porta      ex.: tcp 5433 203.0.113.10:5432', '',
  ].join('\r\n'));
}

// O proxy vive enquanto o fluxo que o ligou roda: o nó Ligar o proxy passa o PID dele em --dono e fica segurando
// o fluxo. Parou o fluxo, o nó morre; o motor percebe em até 1 s, tira os nomes do hosts e sai.
const DONO = Number(arg('--dono')) || 0;
function vigiarDono() {
  if (!DONO) return;
  setInterval(() => {
    let vivo = false;
    try { process.kill(DONO, 0); vivo = true; } catch (e) { vivo = e.code === 'EPERM'; }
    if (!vivo) encerrar('o fluxo parou');
  }, 1000).unref();
}

// ------------------------------------------------------------------ main
criarArquivos();
// chamados uma vez só (como administrador, pelo nó Permissão de administrador): mexem no hosts e saem
if (process.argv.includes('--so-limpar')) {
  process.exit(limparHosts() === 'sem-permissao' ? 1 : 0);
}
if (process.argv.includes('--so-gravar-hosts')) {
  carregarConfig();
  cfg.hostsAtivo = true;
  carregarApontamentos();
  sincronizarHosts();
  process.exit(estadoHosts === 'ok' ? 0 : 1);
}

log('PROXY', `Proxy4Auto ligando (PID ${process.pid}, dados em ${DIR})`);
carregarConfig();
iniciarPainel(); // primeiro: se a porta de controle estiver ocupada, sai antes de abrir o resto
carregarApontamentos();
reiniciarHttp();
reiniciarTcp();
iniciarDns();
sincronizarHosts();
vigiar(ARQ_APONT, 'apontamentos.txt');
vigiar(ARQ_CONFIG, 'config.txt');
vigiarDono();
// porta que não abriu (outro programa usando) é tentada de novo: quando o outro sair, a rota passa a responder
setInterval(() => { if (falhasHttp.size) reiniciarHttp(); }, 5000);

process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
process.on('uncaughtException', e => erro('PROXY', e.stack || e.message));
