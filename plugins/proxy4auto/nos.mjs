// Programa dos nós do Proxy4Auto no Automator.
// Entrada (stdin): { node, params, input, data }. Saída (stdout): o resultado, em JSON; com duas saídas,
// { port: "true" | "false", value }. Falha: código diferente de zero e o motivo na saída de erro.
// O proxy é o lib/motor.mjs, embutido no plugin: os nós o ligam quando precisam e mandam nele pela porta de controle.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SCRIPTS } from './lib/admin.mjs';
import { semBlocoDoProxy, nomesNoHosts, configuracoes, lerAlvo, acharRota, descreverRota, sugerirNome, normalizarDestino, paraLocal, paraOriginal, conferirDisfarce, trafego } from './lib/proxy.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MOTOR = path.join(AQUI, 'lib', 'motor.mjs');
class Falha extends Error {}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const sim = (v) => v === true || /^(sim|true|1|on)$/i.test(String(v ?? ''));
const limitar = (v, min, max, padrao) => Math.max(min, Math.min(max, Number(v) || padrao));

// ---------- a porta de controle do motor ----------
async function chamar(cfg, metodo, caminho, corpo) {
  const r = await fetch(cfg.painel + caminho, {
    method: metodo, headers: corpo ? { 'content-type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(15000),
  });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, ok: r.ok, j };
}
// quem responde na porta de controle: o estado do nosso motor, 'outro' (outro programa) ou null (ninguém)
async function sondar(cfg) {
  let r;
  try { r = await chamar(cfg, 'GET', '/api/estado'); } catch { return null; }
  return r.ok && r.j && r.j.motor === 'proxy4auto' ? r.j : 'outro';
}
async function noAr(cfg) { const e = await sondar(cfg); return e && e !== 'outro' ? e : null; }
const OUTRO = (cfg) => new Falha(`A porta de controle ${cfg.porta} está em uso por outro programa. Troque em Plugins › engrenagem do Proxy4Auto › Porta de controle.`);

// o estado do proxy; desligado, liga sozinho (a não ser que isso esteja desligado nas configurações)
async function estado(cfg) {
  const e = await sondar(cfg);
  if (e === 'outro') throw OUTRO(cfg);
  if (e) return e;
  if (!cfg.ligarSozinho) throw new Falha('O proxy está desligado. Ponha o nó Ligar o proxy antes, ou ative "Ligar o proxy sozinho" nas configurações do Proxy4Auto.');
  const est = await ligarMotor(cfg, { modo: 'normal', ateFechar: true });
  cfg.ligouAgora = true;
  return est;
}
async function api(cfg, metodo, caminho, corpo) {
  let r;
  try { r = await chamar(cfg, metodo, caminho, corpo); }
  catch { throw new Falha('O proxy parou de responder no meio do trabalho. Veja o proxy.log na pasta de dados do plugin.'); }
  if (!r.ok) throw new Falha((r.j && r.j.erro) || `O proxy respondeu ${r.status}.`);
  return r.j;
}

// ---------- processos ----------
const rodar = (prog, args, opt = {}) => new Promise((ok) => execFile(prog, args, { windowsHide: true, timeout: 20000, ...opt }, (e, out, err) => ok({ ok: !e, codigo: e ? (typeof e.code === 'number' ? e.code : -1) : 0, out: String(out || ''), err: String(err || e?.message || '') })));
// quem escuta na porta (netstat) e o nome do programa, para dizer "a porta 80 está com o nginx"
async function quemUsa(porta) {
  const n = await rodar('netstat', ['-ano', '-p', 'TCP']);
  const linha = n.out.split(/\r?\n/).find((l) => new RegExp(`^\\s*TCP\\s+\\S+:${porta}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, 'i').test(l));
  if (!linha) return null;
  const pid = Number(linha.trim().split(/\s+/).pop());
  const p = await rodar('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).ProcessName`]);
  return { pid, nome: p.out.trim() || 'programa desconhecido' };
}
// Roda um programa como administrador pelo próprio Windows (Start-Process -Verb RunAs): aparece a pergunta do
// controle de conta, sem janela de console. Devolve false quando a pessoa recusa.
async function comoAdmin(programa, args, { esperarFim = true } = {}) {
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const lista = args.map((a) => q(/[\s"]/.test(a) ? '"' + String(a).replace(/"/g, '\\"') + '"' : a)).join(',');
  const cmd = `try { Start-Process -FilePath ${q(programa)}${args.length ? ' -ArgumentList ' + lista : ''} -Verb RunAs -WindowStyle Hidden${esperarFim ? ' -Wait' : ''} -ErrorAction Stop; exit 0 } catch { exit 5 }`;
  const r = await rodar('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { timeout: 120000 });
  return r.ok;
}
// Um script do PowerShell como administrador (a pergunta do Windows aparece), sem arquivo de script: vai
// codificado na linha de comando. Devolve { aceitou, codigo }: 1223 é o código do Windows para "a pessoa recusou".
const RECUSOU = 1223;
async function powershellAdmin(script) {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  const cmd = `try { $p = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${b64}' -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop; exit $p.ExitCode } catch { exit ${RECUSOU} }`;
  const r = await rodar('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { timeout: 180000 });
  return { aceitou: r.codigo !== RECUSOU, codigo: r.codigo };
}

// ---------- o motor ----------
const argsMotor = (cfg, ...mais) => [MOTOR, '--dados', cfg.pastaProxy, '--painel', String(cfg.porta), ...mais];
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
// o servidor do plugin (que vive enquanto o BlueScreen está aberto) deixa o PID dele em servidor.json
function arquivoDoServidor(cfg) {
  const f = path.join(cfg.dados, 'servidor.json');
  try { return vivo(JSON.parse(fs.readFileSync(f, 'utf8')).pid) ? f : ''; } catch { return ''; }
}
const fimDoLog = (cfg) => { try { return fs.readFileSync(path.join(cfg.pastaProxy, 'proxy.log'), 'utf8').trim().split(/\r?\n/).slice(-4).join(' | '); } catch { return ''; } };

async function ligarMotor(cfg, { modo = 'normal', ateFechar = true, segundos = 30 } = {}) {
  if (!cfg.pastaProxy) throw new Falha('O BlueScreen não informou a pasta de dados do plugin. Atualize o BlueScreen.');
  if (await sondar(cfg) === 'outro') throw OUTRO(cfg);
  const servidor = ateFechar ? arquivoDoServidor(cfg) : '';
  const args = argsMotor(cfg, ...(servidor ? ['--servidor', servidor] : []));
  if (modo === 'admin') {
    const aceitou = await comoAdmin(process.execPath, args, { esperarFim: false });
    if (!aceitou) throw new Falha('A pergunta de administrador do Windows foi recusada: o proxy não foi ligado. Use o modo Normal para ligar sem administrador.');
  } else {
    spawn(process.execPath, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
  const ate = Date.now() + segundos * 1000;
  while (Date.now() < ate) {
    await esperar(300);
    const est = await noAr(cfg);
    if (est) { await esperar(250); return (await noAr(cfg)) || est; } // um instante para as portas abrirem
  }
  const log = fimDoLog(cfg);
  throw new Falha(`O proxy não subiu em ${segundos} s.${log ? ' O que ele disse: ' + log : ''}`);
}
async function desligarMotor(cfg, est) {
  let hosts = 'sem-permissao';
  try { hosts = (await api(cfg, 'POST', '/api/desligar', {})).hosts; } catch {}
  for (let i = 0; i < 25 && (await sondar(cfg)); i++) await esperar(200);
  if (await sondar(cfg)) {
    // não saiu por bem: encerra o processo (o PID é o que o próprio motor informou)
    const k = await rodar('taskkill', ['/PID', String(est.pid), '/T', '/F']);
    if (!k.ok && /acesso negado|access is denied/i.test(k.err + k.out)) {
      if (!(await comoAdmin('taskkill.exe', ['/PID', String(est.pid), '/T', '/F']))) throw new Falha('O proxy roda como administrador e a pergunta do Windows foi recusada: ele continua ligado.');
    }
    await esperar(400);
    if (await sondar(cfg)) throw new Falha(`Não consegui encerrar o proxy (PID ${est.pid}).`);
  }
  return hosts;
}

// ---------- hosts ----------
const ARQ_HOSTS = process.env.PROXY4AUTO_HOSTS || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts');
const lerHosts = () => { try { return fs.readFileSync(ARQ_HOSTS, 'utf8'); } catch (e) { throw new Falha('Não consegui ler o hosts: ' + e.message); } };
const podeGravarHosts = () => { try { fs.closeSync(fs.openSync(ARQ_HOSTS, 'r+')); return true; } catch { return false; } };
// o motor, chamado uma vez só para mexer no hosts: direto se já dá para gravar, senão com a pergunta do Windows
async function motorNoHosts(cfg, acao) {
  const args = argsMotor(cfg, acao);
  if (podeGravarHosts()) { await rodar(process.execPath, args); return true; }
  return comoAdmin(process.execPath, args);
}
async function limparHosts(cfg) {
  if (semBlocoDoProxy(lerHosts()) === lerHosts()) return 'nada a limpar';
  if (!(await motorNoHosts(cfg, '--so-limpar'))) return 'não limpo: a pergunta de administrador foi recusada';
  if (semBlocoDoProxy(lerHosts()) !== lerHosts()) return 'não limpo: o hosts continua com o bloco do proxy';
  await rodar('ipconfig', ['/flushdns']);
  return 'bloco do proxy removido';
}
const nomesDasRotas = (est) => [...new Set(est.rotas.filter((r) => r.tipo === 'http').map((r) => r.nome))];
async function gravarHosts(cfg, est) {
  const querem = nomesDasRotas(est).sort().join(), tem = () => nomesNoHosts(lerHosts()).sort().join();
  if (querem === tem()) return 'já estava certo';
  if (!(await motorNoHosts(cfg, '--so-gravar-hosts'))) return 'não gravado: a pergunta de administrador foi recusada';
  if (querem !== tem()) return 'não gravado: o hosts não ficou com os nomes das rotas';
  await rodar('ipconfig', ['/flushdns']);
  return querem ? `nomes gravados: ${querem.replace(/,/g, ', ')}` : 'bloco do proxy removido (não há rotas HTTP)';
}
// o nome chega em 127.0.0.1 neste PC? (hosts, DNS do proxy ou o que mais o Windows usar)
async function resolve(nome) {
  if (nome === 'localhost') return true;
  try {
    const r = await Promise.race([dns.promises.lookup(nome, { all: true }), esperar(3000).then(() => [])]);
    return r.some((a) => a.address === '127.0.0.1' || a.address === '::1');
  } catch { return false; }
}
const DICA_NOME = (nome) => `${nome} ainda não chega neste PC${/\.localhost$/.test(nome) ? ' fora do navegador (o navegador abre nomes .localhost sozinho)' : ''}. Use o nó Permissão de administrador com "Gravar os nomes no hosts", ou ligue o proxy como administrador. A Requisição pelo proxy funciona de qualquer jeito.`;

// ---------- rotas ----------
// a rota escolhida no campo (ou a que chega do nó anterior: texto, { id }, { rota: { id } }, { local })
function alvoDe(valor, entrada) {
  const v = valor != null && String(valor).trim() !== '' ? valor : entrada;
  if (v && typeof v === 'object') return (v.rota && (v.rota.id || v.rota)) || v.id || v.local || v.url || '';
  return v ?? '';
}
function rotaDe(est, texto) {
  const alvo = lerAlvo(texto);
  if (!alvo) throw new Falha('Escolha a rota: o nome local (localhost-api), nome:porta, a URL local ou "tcp 5433".');
  const r = acharRota(est.rotas, alvo, est.config.porta_http);
  if (!r) {
    const nomes = est.rotas.filter((x) => x.tipo !== 'invalida').map(descreverRota);
    throw new Falha(`Nenhuma rota "${String(texto).trim()}" no proxy.${nomes.length ? ' As que existem: ' + nomes.join('; ') + '.' : ' O proxy não tem rotas ainda: crie com o nó Apontar um nome.'}`);
  }
  return r;
}
const rotaHttp = (est, texto, para) => { const r = rotaDe(est, texto); if (r.tipo !== 'http') throw new Falha(`${para} é das rotas HTTP. Para TCP, use o Testar destinos.`); return r; };
const enxuta = (r) => ({ id: r.id, tipo: r.tipo, ...(r.nome ? { nome: r.nome } : {}), porta: r.porta, local: r.local, destino: r.destino, ...(r.stats ? { requisicoes: r.stats.total, erros: r.stats.erros, ultimo_status: r.stats.status, ultimo_ms: r.stats.ms } : {}) });
const caminhosDe = (v, max) => (Array.isArray(v) ? v : String(v || '/').split(/[\n,]+/)).map((s) => String(s).trim()).filter(Boolean).slice(0, max).map((s) => (s.startsWith('/') ? s : '/' + s));
// portas que o proxy não conseguiu abrir, com quem está nelas
async function portasFechadas(est) {
  const f = [...est.servicos.http.filter((s) => !s.ativo).map((s) => ({ ...s, tipo: 'http' })), ...(est.servicos.tcp || []).filter((s) => !s.ativo).map((s) => ({ ...s, tipo: 'tcp' }))];
  return Promise.all(f.slice(0, 6).map(async (s) => {
    const q = s.erro === 'EADDRINUSE' ? await quemUsa(s.porta) : null;
    return { porta: s.porta, tipo: s.tipo, erro: s.erro || 'não abriu', ...(q ? { ocupada_por: `${q.nome} (PID ${q.pid})` } : {}) };
  }));
}
const frasePorta = (f) => `a porta ${f.porta} não abriu: ${f.ocupada_por ? 'está com ' + f.ocupada_por : f.erro === 'EACCES' ? 'o Windows não deixou (reservada?)' : f.erro}. O proxy tenta de novo sozinho a cada 5 s`;

// ---------- requisições ----------
function requisitar({ host, porta, seguro = false, metodo = 'GET', caminho = '/', cabecalhos = {}, corpo, tempo = 30000, limite = 2_000_000 }) {
  return new Promise((ok, falhou) => {
    const t0 = Date.now();
    const req = (seguro ? https : http).request({ host, port: porta, method: metodo, path: caminho, setHost: false, rejectUnauthorized: false, ...(seguro ? { servername: String(cabecalhos.host || host).replace(/:\d+$/, '') } : {}), headers: { 'user-agent': 'Proxy4Auto (BlueScreen)', 'accept-encoding': 'identity', ...cabecalhos } }, (res) => {
      const partes = []; let n = 0, cortado = false;
      res.on('data', (c) => { if (n < limite) { partes.push(c); n += c.length; } else cortado = true; });
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, corpo: Buffer.concat(partes).toString('utf8'), bytes: n, ms: Date.now() - t0, cortado }));
      res.on('error', falhou);
    });
    req.setTimeout(tempo, () => req.destroy(new Error(`sem resposta em ${Math.round(tempo / 1000)} s`)));
    req.on('error', falhou);
    if (corpo != null && corpo !== '') req.write(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
    req.end();
  });
}
// pelo proxy: conecta em 127.0.0.1:<porta da rota> com o Host do nome local, exatamente o caminho que um app faria
const pedirLocal = (rota, o = {}) => requisitar({ ...o, host: '127.0.0.1', porta: rota.porta, cabecalhos: { host: rota.porta === 80 ? rota.nome : `${rota.nome}:${rota.porta}`, ...(o.cabecalhos || {}) } })
  .catch((e) => { throw new Falha(e.code === 'ECONNREFUSED' ? `Nada escutando em 127.0.0.1:${rota.porta}: o proxy está no ar, mas a porta da rota não abriu (o nó Proxy no ar? diz quem está nela).` : `Requisição pelo proxy falhou: ${e.message}`); });
// direto no destino, sem o proxy (para comparar)
const pedirDireto = (destino, o = {}) => { const u = new URL(destino); return requisitar({ ...o, caminho: u.pathname + u.search, host: u.hostname, porta: u.port || (u.protocol === 'https:' ? 443 : 80), seguro: u.protocol === 'https:', cabecalhos: { host: u.host, ...(o.cabecalhos || {}) } }); };
const cabecalhosDe = (v) => {
  if (!v) return {};
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return Object.fromEntries(v.split(/\r?\n/).map((l) => l.split(/:(.*)/s)).filter((p) => p[1]).map(([k, x]) => [k.trim(), x.trim()])); } }
  if (Array.isArray(v)) return Object.fromEntries(v.filter((x) => x && x.name).map((x) => [x.name, String(x.value ?? '')]));
  return typeof v === 'object' ? v : {};
};

// ---------- nós ----------
const NOS = {
  async status(p, _e, cfg) {
    const s = await sondar(cfg);
    if (!s || s === 'outro') return { port: 'false', value: { no_ar: false, porta_controle: cfg.porta, motivo: s ? `a porta de controle ${cfg.porta} está com outro programa` : 'o proxy está desligado', liga_sozinho: cfg.ligarSozinho } };
    const est = s;
    const [fechadas, resolvidos] = await Promise.all([portasFechadas(est), Promise.all(nomesDasRotas(est).map(async (n) => [n, await resolve(n)]))]);
    const semResolver = resolvidos.filter(([, ok]) => !ok).map(([n]) => n);
    const invalidas = est.rotas.filter((r) => r.tipo === 'invalida').map((r) => ({ linha: r.linha + 1, texto: r.texto, erro: r.erro }));
    const v = {
      no_ar: true, pid: est.pid, ligado_ha_s: Math.round((Date.now() - est.desde) / 1000), administrador: est.administrador,
      fica_ligado: est.ate_fechar ? 'até fechar o BlueScreen' : 'até ser desligado',
      porta_controle: cfg.porta, porta_http: est.config.porta_http, dns: est.servicos.dns, hosts: est.servicos.hosts,
      reescrever_links: est.config.reescrever_links, rede: est.config.rede,
      rotas_http: est.rotas.filter((r) => r.tipo === 'http').length, rotas_tcp: est.rotas.filter((r) => r.tipo === 'tcp').length,
      linhas_invalidas: invalidas, portas_sem_escutar: fechadas, nomes_sem_resolver: semResolver,
      problemas: [...fechadas.map(frasePorta), ...invalidas.map((l) => `linha ${l.linha} das rotas: ${l.erro}`), ...(est.servicos.dns === 'falhou' ? ['o DNS local não subiu (porta ocupada?)'] : [])],
      avisos: semResolver.map(DICA_NOME),
    };
    const inteiro = !v.problemas.length;
    const passa = p.exigir === 'inteiro' ? inteiro : p.exigir === 'nomes' ? inteiro && !semResolver.length : true;
    return { port: passa ? 'true' : 'false', value: v };
  },

  async ligar(p, _e, cfg) {
    const admin = p.modo === 'admin';
    let est = await sondar(cfg);
    if (est === 'outro') throw OUTRO(cfg);
    let jaEstava = !!est, religado = false;
    // ligado sem administrador e o fluxo pede administrador: religa (as rotas ficam, são texto na pasta de dados)
    if (est && admin && !est.administrador) { await desligarMotor(cfg, est); est = null; jaEstava = false; religado = true; }
    if (!est) est = await ligarMotor(cfg, { modo: admin ? 'admin' : 'normal', ateFechar: p.fica !== 'sempre', segundos: limitar(p.esperar_s, 5, 120, 30) });
    const fechadas = await portasFechadas(est);
    const avisos = fechadas.map(frasePorta);
    if (est.servicos.hosts === 'sem-permissao' && est.rotas.some((r) => r.tipo === 'http')) avisos.push('Sem administrador o proxy não grava o hosts: para os nomes locais chegarem neste PC, use o nó Permissão de administrador com "Gravar os nomes no hosts".');
    if (p.fica !== 'sempre' && !est.ate_fechar && !jaEstava) avisos.push('O BlueScreen não está com o plugin carregado: o proxy fica ligado até o nó Desligar o proxy.');
    return { ligado: true, ja_estava: jaEstava, ...(religado ? { religado_como_administrador: true } : {}), modo: est.administrador ? 'administrador' : 'normal', pid: est.pid, porta_controle: cfg.porta, porta_http: est.config.porta_http, fica_ligado: est.ate_fechar ? 'até fechar o BlueScreen' : 'até ser desligado', rotas: est.rotas.filter((r) => r.tipo !== 'invalida').length, avisos };
  },

  async desligar(p, _e, cfg) {
    const est = await sondar(cfg);
    if (est === 'outro') throw OUTRO(cfg);
    const v = { desligado: true, ja_estava: !est };
    let hosts = 'sem-permissao';
    if (est) { v.pid = est.pid; hosts = await desligarMotor(cfg, est); }
    // o proxy tira o bloco dele do hosts ao sair; sem permissão, o nó tira (o Windows pergunta), senão os nomes
    // locais ficariam apontando para 127.0.0.1 sem ninguém atender
    if (hosts === 'limpo') v.hosts = 'bloco do proxy removido';
    else if (p.hosts === 'manter') { if (semBlocoDoProxy(lerHosts()) !== lerHosts()) v.aviso = 'O hosts continua com os nomes do proxy apontando para 127.0.0.1.'; }
    else v.hosts = await limparHosts(cfg);
    if (cfg.dados && fs.existsSync(path.join(cfg.dados, 'dns-backup.json'))) v.aviso_dns = 'O DNS do Windows ainda aponta para o proxy: sem ele a internet deste PC para. Use o nó Permissão de administrador com "Restaurar o DNS do Windows".';
    return v;
  },

  async rotas(p, _e, cfg) {
    const est = await estado(cfg);
    const f = p.filtro || 'todas';
    return est.rotas.filter((r) => f === 'todas' ? r.tipo !== 'invalida' : f === 'erros' ? r.stats && r.stats.erros > 0 : f === 'invalidas' ? r.tipo === 'invalida' : r.tipo === f)
      .map((r) => r.tipo === 'invalida' ? { tipo: 'invalida', linha: r.linha + 1, texto: r.texto, erro: r.erro } : enxuta(r));
  },

  async apontar(p, entrada, cfg) {
    const est = await estado(cfg);
    const tipo = p.tipo === 'tcp' ? 'tcp' : 'http';
    const destinoBruto = String(p.destino || (typeof entrada === 'string' ? entrada : entrada && (entrada.destino || entrada.url)) || '').trim();
    let corpo, alvo;
    if (tipo === 'tcp') {
      if (!/^.+:\d{1,5}$/.test(destinoBruto)) throw new Falha('No TCP o destino é host:porta (ex.: 203.0.113.10:5432).');
      const porta = Number(p.porta);
      if (!(porta >= 1 && porta <= 65535)) throw new Falha('No TCP informe a porta local (ex.: 5433): o banco fica em 127.0.0.1:<porta>.');
      corpo = { tipo: 'tcp', porta, destino: destinoBruto }; alvo = { tipo: 'tcp', porta };
    } else {
      const u = normalizarDestino(destinoBruto);
      const destino = u.pathname === '/' && !u.search ? u.origin : u.href;
      const porta = p.porta ? Number(p.porta) : est.config.porta_http;
      if (!(porta >= 1 && porta <= 65535)) throw new Falha('Porta local inválida (1 a 65535).');
      if (porta === cfg.porta) throw new Falha(`A porta ${porta} é a porta de controle do proxy: escolha outra.`);
      // sem nome: um que diga de onde vem (api.cliente.com -> localhost-api-cliente) e que não exista ainda
      const nome = String(p.nome || '').trim().toLowerCase() || sugerirNome(destino, est.rotas.filter((r) => r.tipo === 'http' && r.porta === porta).map((r) => r.nome));
      if (!/^[a-z0-9._-]+$/.test(nome)) throw new Falha(`Nome local inválido: "${nome}". Use letras, números, ponto e hífen.`);
      corpo = { tipo: 'http', nome, destino, ...(porta !== est.config.porta_http ? { porta } : {}) }; alvo = { tipo: 'http', nome, porta };
    }
    const mesmoDestino = (r) => r && r.destino.replace(/\/$/, '') === (tipo === 'tcp' ? corpo.destino : new URL(corpo.destino).origin);
    const existe = acharRota(est.rotas, alvo, est.config.porta_http);
    let depois = est, nova = existe;
    const v = {};
    if (existe && mesmoDestino(existe)) Object.assign(v, { criada: false, mudou: false, aviso: 'Já estava assim.' });
    else {
      if (existe && p.se_existir !== 'trocar') throw new Falha(`${descreverRota(existe)} já existe com outro destino. Escolha "Trocar o destino" em Se já existir, ou outro nome.`);
      depois = await api(cfg, 'POST', '/api/rotas', existe ? { ...corpo, original: { linha: existe.linha, texto: existe.texto } } : corpo);
      nova = acharRota(depois.rotas, alvo, depois.config.porta_http);
      if (!nova) { const inv = depois.rotas.find((r) => r.tipo === 'invalida'); throw new Falha('O proxy não aceitou a rota' + (inv ? `: ${inv.erro}` : '.')); }
      Object.assign(v, { criada: !existe, mudou: true, ...(existe ? { destino_anterior: existe.destino } : {}) });
      const outra = depois.rotas.find((r) => r.tipo === tipo && r.id !== nova.id && mesmoDestino(r));
      if (outra) v.aviso = `${descreverRota(outra)} já apontava para o mesmo destino.`;
      await esperar(400); // o proxy recarrega e abre a porta nova
      depois = (await noAr(cfg)) || depois;
    }
    Object.assign(v, { rota: enxuta(nova), local: nova.local });
    const fechada = (await portasFechadas(depois)).find((f) => f.porta === nova.porta);
    if (fechada) v.porta_fechada = frasePorta(fechada);
    if (tipo === 'http') {
      v.resolve = await resolve(nova.nome);
      if (!v.resolve && p.hosts === 'gravar') { v.hosts = await gravarHosts(cfg, depois); v.resolve = await resolve(nova.nome); }
      if (!v.resolve) v.dica = DICA_NOME(nova.nome);
    }
    if (sim(p.testar ?? 'sim')) v.teste = await api(cfg, 'GET', '/api/testar?id=' + encodeURIComponent(nova.id));
    return v;
  },

  async remover(p, entrada, cfg) {
    const est = await estado(cfg);
    const texto = alvoDe(p.rota, entrada);
    let r;
    try { r = rotaDe(est, texto); } catch (e) { if (p.se_nao_existir === 'ignorar') return { removida: false, motivo: e.message }; throw e; }
    const depois = await api(cfg, 'DELETE', '/api/rotas', { linha: r.linha, texto: r.texto });
    return { removida: true, rota: enxuta(r), restam: depois.rotas.filter((x) => x.tipo !== 'invalida').length };
  },

  async testar(p, entrada, cfg) {
    const est = await estado(cfg);
    const texto = alvoDe(p.rota, entrada);
    const lista = String(texto || '').trim() ? [rotaDe(est, texto)] : est.rotas.filter((r) => r.tipo === 'http' || r.tipo === 'tcp');
    if (!lista.length) throw new Falha('O proxy não tem rotas para testar. Crie com o nó Apontar um nome.');
    const res = await Promise.all(lista.map(async (r) => ({ ...enxuta(r), ...(await api(cfg, 'GET', '/api/testar?id=' + encodeURIComponent(r.id))) })));
    const falharam = res.filter((x) => !x.ok);
    const v = { todas_ok: !falharam.length, testadas: res.length, falharam: falharam.length, mais_lento_ms: Math.max(...res.map((x) => x.ms || 0)), resultados: res.map((x) => ({ id: x.id, local: x.local, destino: x.destino, ok: x.ok, status: x.status ?? null, ms: x.ms, ...(x.erro ? { erro: x.erro } : {}) })) };
    return { port: v.todas_ok ? 'true' : 'false', value: v };
  },

  // fica testando o destino até ele responder (um deploy subindo, uma VPN conectando) ou o tempo acabar
  async esperar(p, entrada, cfg) {
    const est = await estado(cfg);
    const r = rotaDe(est, alvoDe(p.rota, entrada));
    const t0 = Date.now(), ate = t0 + limitar(p.tempo_s, 1, 3600, 120) * 1000, intervalo = limitar(p.intervalo_s, 1, 300, 5) * 1000;
    let tentativas = 0, x;
    for (;;) {
      x = await api(cfg, 'GET', '/api/testar?id=' + encodeURIComponent(r.id)); tentativas++;
      if (x.ok || Date.now() + intervalo > ate) break;
      await esperar(intervalo);
    }
    return { port: x.ok ? 'true' : 'false', value: { respondeu: !!x.ok, rota: r.id, local: r.local, destino: r.destino, tentativas, esperou_s: Math.round((Date.now() - t0) / 1000), status: x.status ?? null, ...(x.erro ? { erro: x.erro } : {}) } };
  },

  async pedir(p, entrada, cfg) {
    const est = await estado(cfg);
    let texto = String(alvoDe(p.rota, entrada) || '').trim(), caminho = String(p.caminho || '').trim();
    // a URL do site original também serve: vira a local
    if (/^https?:\/\//i.test(texto)) {
      const conv = paraLocal(texto, est.rotas);
      if (conv) { const u = new URL(texto); if (!caminho) caminho = u.pathname + u.search; texto = conv.rota.id; }
      else { const u = new URL(texto); if (!caminho && (u.pathname !== '/' || u.search)) caminho = u.pathname + u.search; }
    }
    let r = rotaHttp(est, texto, 'A requisição');
    if (!caminho.startsWith('/')) caminho = '/' + caminho;
    let metodo = String(p.metodo || 'GET').toUpperCase();
    const cab = cabecalhosDe(p.cabecalhos);
    let corpo = p.corpo;
    if (corpo && typeof corpo === 'object') { corpo = JSON.stringify(corpo); cab['content-type'] ||= 'application/json'; }
    else if (typeof corpo === 'string' && /^\s*[[{]/.test(corpo) && !Object.keys(cab).some((k) => k.toLowerCase() === 'content-type')) cab['content-type'] = 'application/json';
    if (['GET', 'HEAD'].includes(metodo)) corpo = undefined;
    const tempo = limitar(p.tempo_s, 1, 300, 30) * 1000, t0 = Date.now(), saltos = [];
    let x, aviso;
    for (;;) {
      x = await pedirLocal(r, { metodo, caminho, cabecalhos: cab, corpo, tempo });
      const loc = x.headers.location;
      if (p.seguir !== 'sim' || !(x.status >= 300 && x.status < 400) || !loc) break;
      if (saltos.length >= 8) { aviso = 'Mais de 8 redirecionamentos: parei no último.'; break; }
      // o proxy já devolve o Location com o nome local; segue enquanto for uma rota dele
      const base = r.local.replace(/\/$/, '') + caminho;
      let u; try { u = new URL(loc, base); } catch { break; }
      const prox = paraOriginal(u.href, est.rotas, est.config.porta_http);
      if (!prox) { aviso = `Redirecionou para fora do proxy (${u.origin}): parei aqui.`; break; }
      saltos.push({ status: x.status, para: u.href });
      r = prox.rota; caminho = u.pathname + u.search;
      if (x.status === 303 || ((x.status === 301 || x.status === 302) && metodo === 'POST')) { metodo = 'GET'; corpo = undefined; }
    }
    let json; if (/json/i.test(String(x.headers['content-type'] || ''))) { try { json = JSON.parse(x.corpo); } catch {} }
    if (x.cortado) aviso = 'Resposta maior que 2 MB: veio só o começo.';
    const v = { ok: x.status < 400, status: x.status, ms: Date.now() - t0, url: r.local.replace(/\/$/, '') + caminho, rota: r.id, ...(saltos.length ? { redirecionamentos: saltos } : {}), headers: x.headers, corpo: json !== undefined ? json : x.corpo, ...(aviso ? { aviso } : {}) };
    if (p.falhar_status === 'sim' && x.status >= 400) throw new Falha(`${metodo} ${v.url} respondeu ${x.status}.`);
    return v;
  },

  async disfarce(p, entrada, cfg) {
    const est = await estado(cfg);
    const r = rotaHttp(est, alvoDe(p.rota, entrada), 'O disfarce');
    const paginas = [];
    for (const c of caminhosDe(p.caminhos, 20)) {
      const x = await pedirLocal(r, { caminho: c, cabecalhos: { accept: 'text/html,application/json,*/*;q=0.8' } });
      const d = conferirDisfarce(x, r.destino);
      paginas.push({ caminho: c, status: x.status, limpo: d.limpo, vazamentos: d.vazamentos, avisos: d.avisos });
    }
    const vaz = paginas.flatMap((pg) => pg.vazamentos.map((v) => ({ caminho: pg.caminho, ...v })));
    const v = {
      limpo: !vaz.length, rota: r.id, local: r.local, paginas: paginas.length, vazamentos: vaz,
      avisos: paginas.flatMap((pg) => pg.avisos.map((a) => ({ caminho: pg.caminho, ...a }))),
      reescrever_links: est.config.reescrever_links,
      ...(!est.config.reescrever_links && vaz.length ? { dica: 'A reescrita de links está desligada: ligue com o nó Ajustar o proxy (Reescrever links = sim).' } : {}),
    };
    return { port: v.limpo ? 'true' : 'false', value: v };
  },

  // a mesma página pelo proxy e direto no destino: o proxy está entregando o que o site entrega?
  async comparar(p, entrada, cfg) {
    const est = await estado(cfg);
    const r = rotaHttp(est, alvoDe(p.rota, entrada), 'A comparação');
    const tipoDe = (x) => String(x.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const folga = limitar(p.folga, 0, 100, 15) / 100;
    const paginas = [];
    for (const c of caminhosDe(p.caminhos, 10)) {
      const cab = { accept: 'text/html,application/json,*/*;q=0.8' };
      const via = await pedirLocal(r, { caminho: c, cabecalhos: cab });
      let direto, dif = [];
      try { direto = await pedirDireto(r.destino.replace(/\/$/, '') + c, { cabecalhos: cab }); }
      catch (e) { paginas.push({ caminho: c, igual: false, proxy: { status: via.status, ms: via.ms }, diferencas: [`direto no destino falhou: ${e.code || e.message}`] }); continue; }
      if (via.status !== direto.status) dif.push(`status ${via.status} pelo proxy e ${direto.status} direto`);
      if (tipoDe(via) !== tipoDe(direto)) dif.push(`tipo ${tipoDe(via) || 'nenhum'} pelo proxy e ${tipoDe(direto) || 'nenhum'} direto`);
      const maior = Math.max(via.bytes, direto.bytes), delta = Math.abs(via.bytes - direto.bytes);
      if (delta > 512 && delta > maior * folga) dif.push(`tamanho ${via.bytes} bytes pelo proxy e ${direto.bytes} direto`);
      paginas.push({ caminho: c, igual: !dif.length, proxy: { status: via.status, ms: via.ms, bytes: via.bytes, tipo: tipoDe(via) }, direto: { status: direto.status, ms: direto.ms, bytes: direto.bytes, tipo: tipoDe(direto) }, custo_ms: via.ms - direto.ms, diferencas: dif });
    }
    const dif = paginas.filter((x) => !x.igual);
    const v = { igual: !dif.length, rota: r.id, local: r.local, destino: r.destino, paginas, diferentes: dif.length, custo_medio_ms: Math.round(paginas.filter((x) => x.direto).reduce((a, x) => a + x.custo_ms, 0) / Math.max(1, paginas.filter((x) => x.direto).length)) };
    return { port: v.igual ? 'true' : 'false', value: v };
  },

  async converter(p, entrada, cfg) {
    const est = await estado(cfg);
    const url = String(p.url || (typeof entrada === 'string' ? entrada : entrada && (entrada.url || entrada.local)) || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Falha('Informe uma URL completa, com http:// ou https://.');
    const local = paraOriginal(url, est.rotas, est.config.porta_http);
    if (local && p.direcao !== 'para_local') return { de: url, para: local.url, sentido: 'local → original', rota: local.rota.id };
    const orig = paraLocal(url, est.rotas);
    if (orig) return { de: url, para: orig.url, sentido: 'original → local', rota: orig.rota.id };
    if (p.direcao === 'para_original') throw new Falha(`${url} não é de nenhuma rota do proxy.`);
    if (p.criar !== 'sim') throw new Falha(`Nenhuma rota leva para ${new URL(url).origin}. Marque "Criar a rota se faltar" ou use o nó Apontar um nome.`);
    const criada = await NOS.apontar({ destino: new URL(url).origin, tipo: 'http', testar: 'nao' }, null, cfg);
    const u = new URL(url);
    return { de: url, para: criada.local.replace(/\/$/, '') + u.pathname + u.search + u.hash, sentido: 'original → local', rota: criada.rota.id, rota_criada: true };
  },

  async admin(p, entrada, cfg) {
    const acao = p.acao || 'nada';
    const pasta = cfg.dados || fs.mkdtempSync(path.join(process.env.TEMP || '.', 'proxy4auto-'));
    fs.mkdirSync(pasta, { recursive: true });
    const saida = path.join(pasta, 'admin-saida.json'), backup = path.join(pasta, 'dns-backup.json');
    try { fs.rmSync(saida, { force: true }); } catch {}
    const motivo = String(p.motivo || '').trim();
    const v = { acao, ...(motivo ? { motivo } : {}) };
    if (acao === 'hosts' || acao === 'hosts_gravar') {
      const r = acao === 'hosts' ? await limparHosts(cfg) : await gravarHosts(cfg, await estado(cfg));
      v.permitido = !/recusada/.test(r); v.resultado = r;
      return { port: /^não /.test(r) ? 'false' : 'true', value: v };
    }
    let script;
    if (acao === 'nada') script = SCRIPTS.nada(saida);
    else if (acao === 'dns_proxy') {
      // sem o DNS do proxy no ar, apontar o Windows para 127.0.0.1 derruba a internet do PC inteiro
      let est = await estado(cfg);
      if (est.config.porta_dns !== 53) throw new Falha(`O Windows só consulta DNS na porta 53, e o DNS do proxy está na ${est.config.porta_dns}. Troque com o nó Ajustar o proxy (Porta do DNS = 53).`);
      if (!est.config.dns) { await api(cfg, 'POST', '/api/config', { chave: 'dns', valor: true }); await esperar(600); est = await estado(cfg); v.dns_local_ligado_agora = true; }
      if (est.servicos.dns !== 'ok') { const q = await quemUsa(53); throw new Falha(`O DNS do proxy não subiu${q ? `: a porta 53 está com ${q.nome} (PID ${q.pid})` : ' (porta 53 ocupada?)'}. Sem ele a internet do PC pararia, então não mexi no Windows.`); }
      script = SCRIPTS.dns_proxy(saida, backup);
    } else if (acao === 'dns_restaurar') script = SCRIPTS.dns_restaurar(saida, backup);
    else if (acao === 'programa') {
      const programa = String(p.programa || (typeof entrada === 'string' ? entrada : '') || '').trim();
      if (!programa) throw new Falha('Informe o programa que vai rodar como administrador.');
      const args = String(p.argumentos || '').match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"|"$/g, '')) || [];
      script = SCRIPTS.programa(saida, backup, programa, args, String(p.pasta || '').trim());
      v.programa = programa;
    } else throw new Falha('Escolha a ação.');
    const r = await powershellAdmin(script);
    v.permitido = r.aceitou;
    if (!r.aceitou) { v.resultado = 'a pergunta de administrador foi recusada'; return { port: 'false', value: v }; }
    let res = null; try { res = JSON.parse(fs.readFileSync(saida, 'utf8').replace(/^\uFEFF/, '')); } catch {}
    try { fs.rmSync(saida, { force: true }); } catch {}
    if (!res) throw new Falha(`A ação rodou como administrador mas não terminou bem (código ${r.codigo}).`);
    Object.assign(v, res.adaptadores ? { adaptadores: [].concat(res.adaptadores) } : {}, res.codigo != null ? { codigo: res.codigo } : {});
    v.resultado = acao === 'nada' ? 'permissão concedida' : acao === 'programa' ? (res.ok ? 'o programa terminou sem erro' : `o programa terminou com o código ${res.codigo}`) : acao === 'dns_proxy' ? 'o Windows agora resolve nomes pelo proxy' : 'DNS do Windows restaurado';
    return { port: res.ok ? 'true' : 'false', value: v };
  },

  async ajustar(p, _e, cfg) {
    const chave = String(p.ajuste || '');
    const bool = ['dns', 'hosts', 'reescrever_links', 'log_detalhado', 'rede'].includes(chave);
    if (!bool && !['porta_http', 'porta_dns', 'dns_upstream'].includes(chave)) throw new Falha('Escolha o que ajustar.');
    const valor = bool ? sim(p.ligado) : String(p.valor ?? '').trim();
    if (chave === 'porta_http' && Number(valor) === cfg.porta) throw new Falha(`A porta ${valor} é a porta de controle do proxy: escolha outra.`);
    const antes = (await estado(cfg)).config;
    await api(cfg, 'POST', '/api/config', { chave, valor });
    await esperar(400); // as portas reabrem
    const depois = await estado(cfg);
    const v = { ajuste: chave, antes: antes[chave], depois: depois.config[chave], mudou: antes[chave] !== depois.config[chave], config: depois.config };
    const avisos = (await portasFechadas(depois)).map(frasePorta);
    if (chave === 'dns' && valor && depois.servicos.dns !== 'ok') avisos.push('O DNS local não subiu (porta ocupada?).');
    if (chave === 'dns' && !valor && cfg.dados && fs.existsSync(path.join(cfg.dados, 'dns-backup.json'))) avisos.push('O DNS do Windows ainda aponta para o proxy: restaure com o nó Permissão de administrador, senão a internet deste PC para.');
    if (chave === 'hosts' && valor && depois.servicos.hosts === 'sem-permissao') avisos.push('O proxy não roda como administrador: quem grava o hosts é o nó Permissão de administrador ("Gravar os nomes no hosts").');
    if (chave === 'rede' && valor) avisos.push('Outros aparelhos da rede agora alcançam as rotas pelo IP deste PC (o Windows pode pedir para liberar no firewall).');
    if (avisos.length) v.avisos = avisos;
    return v;
  },

  async trafego(p, entrada, cfg) {
    const est = await estado(cfg);
    const texto = String(alvoDe(p.rota, entrada) || '').trim();
    const rota = texto ? rotaDe(est, texto).id : null;
    return trafego(est.log, { rota, soErros: p.so_erros === 'sim', minutos: Number(p.minutos) || 0, quantas: Number(p.quantas) || 50 });
  },
};

// ---------- entrada ----------
let texto = '';
process.stdin.setEncoding('utf8');
for await (const c of process.stdin) texto += c;
try {
  const pedido = JSON.parse(texto || '{}');
  const fn = Object.hasOwn(NOS, pedido.node) ? NOS[pedido.node] : null;
  if (!fn) throw new Falha('Nó desconhecido: ' + pedido.node);
  const cfg = configuracoes(pedido.data, AQUI);
  const v = await fn(pedido.params || {}, pedido.input ?? null, cfg);
  // o nó ligou o proxy sozinho: fica dito no resultado
  const alvo = v && v.port && v.value ? v.value : v;
  if (cfg.ligouAgora && alvo && typeof alvo === 'object' && !Array.isArray(alvo)) alvo.proxy_ligado_agora = true;
  process.stdout.write(JSON.stringify(v ?? null));
} catch (e) {
  // Falha e os erros de validação (Error) são para a pessoa; o resto é defeito do plugin e vai com a pilha
  process.stderr.write((e instanceof Falha || e.constructor === Error ? e.message : 'Erro no Proxy4Auto: ' + (e.stack || e.message)) + '\n');
  process.exit(1);
}
