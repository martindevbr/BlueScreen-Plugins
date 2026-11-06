import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { spawn, execFile, execFileSync } from 'node:child_process';

const TOKEN = process.env.BLUESCREEN_TOKEN || '';
const HOME = os.homedir();
const PROJETOS_CLAUDE = path.join(HOME, '.claude', 'projects');
const DADOS = path.join(HOME, '.bluescreen');
const ARQ_ABAS = path.join(DADOS, 'claude-abas.json');
const ARQ_PREFS = path.join(DADOS, 'claude.json');
const REPOS = process.env.CLAUDE_REPOS || ['Repositorys', 'Repositories', 'source/repos', 'repos', 'Projetos', 'Projects', 'git', 'dev', 'workspace'].map((n) => path.join(HOME, n)).find((p) => fs.existsSync(p)) || HOME;
const OCIOSO_MS = 30 * 60 * 1000;
const LIMITE_RESULTADO = 20000;
const EXE = acharClaude();
const prefs = { cores: true };

const PROMPT_CORES = [
  'Suas respostas aparecem no painel do Claude dentro do BlueScreen, a IDE do usuário, que renderiza Markdown e também cores do tema dele.',
  'Para colorir um trecho use <span class="verde">texto</span>; as cores são vermelho, verde, amarelo, azul, roxo, laranja, ciano, rosa e cinza.',
  'Para uma etiqueta use <span class="tag verde">OK</span>. Também funcionam <mark>, <kbd>, <u>, <sub>, <sup> e <details><summary>título</summary>conteúdo</details>.',
  'Use cor para dar sentido (sucesso em verde, erro em vermelho, atenção em amarelo, nomes e números importantes em destaque), sem exagero.',
  'Caminhos de arquivo em código inline, como `src/App.java:42`, viram links que abrem o arquivo no editor.',
  'Isso vale só para as respostas no chat: nunca use essas marcações em arquivos, código, commits ou textos que o usuário vai enviar para outra pessoa.',
].join(' ');

async function lerPrefs() {
  try {
    Object.assign(prefs, JSON.parse(await fsp.readFile(ARQ_PREFS, 'utf8')));
  } catch {}
}

async function salvarPrefs() {
  await fsp.mkdir(DADOS, { recursive: true });
  await fsp.writeFile(ARQ_PREFS, JSON.stringify(prefs, null, 2));
}

function acharClaude() {
  if (process.env.CLAUDE_EXE) return process.env.CLAUDE_EXE;
  const candidatos = [
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    path.join(HOME, '.local', 'bin', 'claude.exe'),
  ];
  for (const c of candidatos) if (fs.existsSync(c)) return c;
  try {
    return execFileSync('where', ['claude.exe']).toString().split(/\r?\n/)[0].trim();
  } catch {
    return 'claude';
  }
}

const clientes = new Set();
const abas = new Map();

function emitir(evento) {
  const linha = `data: ${JSON.stringify(evento)}\n\n`;
  for (const res of clientes) res.write(linha);
}

function truncar(texto) {
  if (typeof texto !== 'string' || texto.length <= LIMITE_RESULTADO) return texto;
  return texto.slice(0, LIMITE_RESULTADO) + `\n… [${texto.length - LIMITE_RESULTADO} caracteres omitidos]`;
}

function enxugar(m) {
  if (m.type !== 'user' || !Array.isArray(m.message?.content)) return m;
  const content = m.message.content.map((b) => {
    if (b.type !== 'tool_result') return b;
    if (typeof b.content === 'string') return { ...b, content: truncar(b.content) };
    if (Array.isArray(b.content)) {
      return {
        ...b,
        content: b.content.map((c) => (c.type === 'text' ? { ...c, text: truncar(c.text) } : c.type === 'image' ? { type: 'text', text: '[imagem]' } : c)),
      };
    }
    return b;
  });
  return { ...m, message: { ...m.message, content } };
}

function resumoEntrada(nome, entrada = {}) {
  const v = entrada.command || entrada.file_path || entrada.path || entrada.pattern || entrada.url || entrada.query || entrada.description || entrada.prompt || entrada.skill || '';
  return String(v).replace(/\s+/g, ' ').slice(0, 160);
}

class Aba {
  constructor({ id, titulo, cwd, sessionId, modelo, modo, esforco }) {
    this.id = id || crypto.randomUUID();
    this.titulo = titulo || path.basename(cwd) || cwd;
    this.cwd = cwd;
    this.sessionId = sessionId || null;
    this.modelo = modelo || '';
    this.modo = modo || 'default';
    this.esforco = esforco || '';
    this.log = [];
    this.logCarregado = !sessionId;
    this.proc = null;
    this.estado = 'parada';
    this.pendentes = new Map();
    this.ferramentas = new Map();
    this.custoAnterior = 0;
    this.custo = 0;
    this.contexto = 0;
    this.modeloAtivo = '';
    this.inicioProc = null;
    this.ultimoUso = Date.now();
    this.stderr = '';
    this.controles = new Map();
    this.seq = 0;
  }

  resumo() {
    return {
      id: this.id,
      titulo: this.titulo,
      cwd: this.cwd,
      sessionId: this.sessionId,
      modelo: this.modelo,
      modo: this.modo,
      esforco: this.esforco,
      estado: this.estado,
      pid: this.proc?.pid || null,
      inicioProc: this.inicioProc,
      custo: this.custo,
      contexto: this.contexto,
      modeloAtivo: this.modeloAtivo,
      pendentes: this.pendentes.size,
      ferramentas: [...this.ferramentas.entries()].map(([id, f]) => ({ id, ...f })),
    };
  }

  persistivel() {
    const { id, titulo, cwd, sessionId, modelo, modo, esforco } = this;
    return { id, titulo, cwd, sessionId, modelo, modo, esforco };
  }

  avisar() {
    emitir({ t: 'aba', aba: this.resumo() });
  }

  definirEstado(estado) {
    this.estado = estado;
    this.avisar();
  }

  registrar(m) {
    const limpo = enxugar(m);
    limpo.seq = ++this.seq;
    this.log.push(limpo);
    emitir({ t: 'msg', aba: this.id, m: limpo });
  }

  async carregarLog() {
    if (this.logCarregado) return;
    this.logCarregado = true;
    const arquivo = await acharTranscricao(this.sessionId);
    if (arquivo) this.log = [...(await lerTranscricao(arquivo)).map((m) => ({ ...m, seq: ++this.seq })), ...this.log];
  }

  iniciar() {
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-prompt-tool', 'stdio',
      '--allow-dangerously-skip-permissions',
      '--permission-mode', this.modo,
    ];
    if (this.modelo) args.push('--model', this.modelo);
    if (this.esforco) args.push('--effort', this.esforco);
    if (this.sessionId) args.push('--resume', this.sessionId);
    if (prefs.cores) args.push('--append-system-prompt', PROMPT_CORES);
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;
    delete env.CLAUDE_CODE_SSE_PORT;
    const proc = spawn(EXE, args, { cwd: this.cwd, env, windowsHide: true });
    this.proc = proc;
    this.inicioProc = Date.now();
    this.stderr = '';
    readline.createInterface({ input: proc.stdout }).on('line', (linha) => {
      if (!linha.trim()) return;
      try {
        this.receber(JSON.parse(linha));
      } catch {
        this.stderr = (this.stderr + linha + '\n').slice(-4000);
      }
    });
    proc.stderr.on('data', (d) => {
      this.stderr = (this.stderr + d).slice(-4000);
    });
    proc.on('error', (e) => {
      this.registrar({ type: 'painel', nivel: 'erro', texto: `Não consegui iniciar o Claude (${EXE}): ${e.message}` });
    });
    proc.on('exit', (codigo) => {
      if (this.proc !== proc) return;
      this.proc = null;
      this.inicioProc = null;
      this.pidsBase = null;
      this.custoAnterior = this.custo;
      for (const [id, f] of this.ferramentas) if (!f.fim) this.ferramentas.set(id, { ...f, fim: Date.now(), erro: true, interrompida: true });
      for (const id of this.pendentes.keys()) emitir({ t: 'perm-fim', aba: this.id, id });
      this.pendentes.clear();
      if (codigo && codigo !== 0 && !this.encerrando) {
        this.registrar({ type: 'painel', nivel: 'erro', texto: `O processo do Claude terminou com código ${codigo}.\n${this.stderr.trim()}` });
        this.definirEstado('erro');
      } else {
        this.definirEstado('parada');
      }
      this.encerrando = false;
    });
    this.definirEstado('ociosa');
  }

  escrever(obj) {
    if (!this.proc) this.iniciar();
    this.proc.stdin.write(JSON.stringify(obj) + '\n');
  }

  controle(request) {
    if (!this.proc) return Promise.resolve(null);
    const request_id = crypto.randomUUID();
    return new Promise((resolve) => {
      this.controles.set(request_id, resolve);
      setTimeout(() => {
        if (this.controles.delete(request_id)) resolve(null);
      }, 10000);
      this.escrever({ type: 'control_request', request_id, request });
    });
  }

  enviar(texto, imagens = []) {
    this.ultimoUso = Date.now();
    const content = [];
    for (const img of imagens) content.push({ type: 'image', source: { type: 'base64', media_type: img.tipo, data: img.dados } });
    if (texto) content.push({ type: 'text', text: texto });
    const m = { type: 'user', message: { role: 'user', content: imagens.length ? content : texto } };
    if (this.log.filter((x) => x.type === 'user').length === 0 && texto && !this.tituloManual) {
      this.titulo = texto.replace(/\s+/g, ' ').slice(0, 40);
      salvarAbas();
    }
    this.registrar({ ...m, local: true, message: { ...m.message, content: imagens.length ? content.map((b) => (b.type === 'image' ? { type: 'text', text: '[imagem colada]' } : b)) : texto } });
    this.escrever(m);
    this.definirEstado('ocupada');
  }

  receber(m) {
    this.ultimoUso = Date.now();
    switch (m.type) {
      case 'stream_event':
        if (m.event?.type === 'message_start' && m.event.message?.usage && !m.parent_tool_use_id) {
          const u = m.event.message.usage;
          this.contexto = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        }
        emitir({ t: 'msg', aba: this.id, m });
        return;
      case 'system':
        if (m.subtype === 'init') {
          if (!this.pidsBase) this.marcarBase = true;
          if (m.session_id && m.session_id !== this.sessionId) {
            this.sessionId = m.session_id;
            salvarAbas();
          }
          this.modeloAtivo = m.model || '';
          this.avisar();
          return;
        }
        if (m.subtype === 'compact_boundary') this.registrar(m);
        return;
      case 'assistant':
        for (const b of m.message?.content || []) {
          if (b.type === 'tool_use') {
            this.ferramentas.set(b.id, { nome: b.name, resumo: resumoEntrada(b.name, b.input), inicio: Date.now(), pai: m.parent_tool_use_id || null });
          }
        }
        this.registrar(m);
        this.avisar();
        return;
      case 'user':
        for (const b of Array.isArray(m.message?.content) ? m.message.content : []) {
          if (b.type === 'tool_result' && this.ferramentas.has(b.tool_use_id)) {
            this.ferramentas.set(b.tool_use_id, { ...this.ferramentas.get(b.tool_use_id), fim: Date.now(), erro: !!b.is_error });
          }
        }
        this.registrar(m);
        this.avisar();
        return;
      case 'result':
        this.custo = this.custoAnterior + (m.total_cost_usd || 0);
        this.registrar({ type: 'result', subtype: m.subtype, is_error: m.is_error, duration_ms: m.duration_ms, total_cost_usd: m.total_cost_usd, num_turns: m.num_turns, result: m.is_error ? m.result : undefined });
        for (const [id, f] of this.ferramentas) if (f.fim && Date.now() - f.fim > 60000) this.ferramentas.delete(id);
        this.definirEstado(this.pendentes.size ? 'aguardando' : 'ociosa');
        return;
      case 'control_request':
        if (m.request?.subtype === 'can_use_tool') {
          this.pendentes.set(m.request_id, m.request);
          emitir({ t: 'perm', aba: this.id, id: m.request_id, req: m.request });
          this.definirEstado('aguardando');
        }
        return;
      case 'control_cancel_request':
        this.pendentes.delete(m.request_id);
        emitir({ t: 'perm-fim', aba: this.id, id: m.request_id });
        this.definirEstado(this.pendentes.size ? 'aguardando' : 'ocupada');
        return;
      case 'control_response': {
        const id = m.response?.request_id;
        const resolver = this.controles.get(id);
        if (resolver) {
          this.controles.delete(id);
          resolver(m.response);
        }
        return;
      }
      default:
        return;
    }
  }

  responderPermissao(id, { permitir, sempre, entrada, motivo }) {
    const req = this.pendentes.get(id);
    if (!req) return false;
    this.pendentes.delete(id);
    const response = permitir
      ? { behavior: 'allow', updatedInput: entrada || req.input, ...(sempre && req.permission_suggestions ? { updatedPermissions: req.permission_suggestions } : {}) }
      : { behavior: 'deny', message: motivo || 'O usuário negou esta ação pelo painel.' };
    this.escrever({ type: 'control_response', response: { subtype: 'success', request_id: id, response } });
    emitir({ t: 'perm-fim', aba: this.id, id });
    this.definirEstado(this.pendentes.size ? 'aguardando' : 'ocupada');
    return true;
  }

  async interromper() {
    if (!this.proc) return;
    await this.controle({ subtype: 'interrupt' });
  }

  encerrar() {
    if (!this.proc) return;
    this.encerrando = true;
    matarArvore(this.proc.pid);
  }

  async configurar({ modelo, modo, esforco, titulo }) {
    if (titulo !== undefined) {
      this.titulo = String(titulo).slice(0, 80) || this.titulo;
      this.tituloManual = true;
    }
    if (modo !== undefined && modo !== this.modo) {
      this.modo = modo;
      if (this.proc) await this.controle({ subtype: 'set_permission_mode', mode: modo });
    }
    if (modelo !== undefined && modelo !== this.modelo) {
      this.modelo = modelo;
      if (this.proc) await this.controle({ subtype: 'set_model', model: modelo || 'default' });
    }
    if (esforco !== undefined && esforco !== this.esforco) {
      this.esforco = esforco;
      if (this.proc && this.estado === 'ociosa') this.encerrar();
    }
    salvarAbas();
    this.avisar();
  }
}

function matarArvore(pid) {
  if (!pid) return;
  execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
}

let salvando = null;
function salvarAbas() {
  clearTimeout(salvando);
  salvando = setTimeout(async () => {
    await fsp.mkdir(DADOS, { recursive: true });
    await fsp.writeFile(ARQ_ABAS, JSON.stringify([...abas.values()].map((a) => a.persistivel()), null, 2));
  }, 300);
}

async function restaurarAbas() {
  try {
    const lista = JSON.parse(await fsp.readFile(ARQ_ABAS, 'utf8'));
    for (const dados of lista) if (dados.cwd) abas.set(dados.id, new Aba(dados));
  } catch {}
}

const cacheTranscricoes = new Map();

async function acharTranscricao(sessionId) {
  if (!sessionId) return null;
  if (cacheTranscricoes.has(sessionId)) return cacheTranscricoes.get(sessionId);
  let pastas = [];
  try {
    pastas = await fsp.readdir(PROJETOS_CLAUDE);
  } catch {}
  for (const p of pastas) {
    const arq = path.join(PROJETOS_CLAUDE, p, `${sessionId}.jsonl`);
    if (fs.existsSync(arq)) {
      cacheTranscricoes.set(sessionId, arq);
      return arq;
    }
  }
  return null;
}

function limparTextoUsuario(texto) {
  const comando = texto.match(/<command-name>([^<]*)<\/command-name>[\s\S]*?<command-args>([^<]*)<\/command-args>/);
  if (comando) return `${comando[1]} ${comando[2]}`.trim();
  return texto
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<local-command-(caveat|stdout|stderr)>[\s\S]*?<\/local-command-\1>/g, '')
    .replace(/<pasted_content[^>]*>([\s\S]*?)<\/pasted_content[^>]*>/g, '$1')
    .trim();
}

async function lerTranscricao(arquivo) {
  const saida = [];
  const rl = readline.createInterface({ input: fs.createReadStream(arquivo, 'utf8'), crlfDelay: Infinity });
  for await (const linha of rl) {
    if (!linha.startsWith('{')) continue;
    let o;
    try {
      o = JSON.parse(linha);
    } catch {
      continue;
    }
    if (o.type === 'system' && o.subtype === 'compact_boundary') {
      saida.push({ type: 'system', subtype: 'compact_boundary' });
      continue;
    }
    if ((o.type !== 'user' && o.type !== 'assistant') || o.isMeta || o.isSidechain || !o.message) continue;
    if (o.type === 'user') {
      let content = o.message.content;
      if (typeof content === 'string') {
        content = limparTextoUsuario(content);
        if (!content) continue;
      } else if (Array.isArray(content)) {
        content = content
          .map((b) => (b.type === 'text' ? { ...b, text: limparTextoUsuario(b.text) } : b))
          .filter((b) => b.type !== 'text' || b.text);
        if (!content.length) continue;
      }
      saida.push(enxugar({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, historico: true }));
    } else {
      saida.push({ type: 'assistant', message: o.message, parent_tool_use_id: null, historico: true });
    }
  }
  return saida;
}

async function lerTrecho(arquivo, inicio, tamanho) {
  const fh = await fsp.open(arquivo, 'r');
  try {
    const buf = Buffer.alloc(tamanho);
    const { bytesRead } = await fh.read(buf, 0, tamanho, inicio);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    await fh.close();
  }
}

const cacheHistorico = new Map();

async function infoSessao(arquivo, stat) {
  const chave = arquivo + stat.mtimeMs;
  if (cacheHistorico.has(chave)) return cacheHistorico.get(chave);
  const cabeca = await lerTrecho(arquivo, 0, Math.min(stat.size, 256 * 1024));
  const cauda = stat.size > 256 * 1024 ? await lerTrecho(arquivo, stat.size - 128 * 1024, 128 * 1024) : cabeca;
  let cwd = null;
  let primeiro = null;
  for (const linha of cabeca.split('\n')) {
    if (!linha.startsWith('{')) continue;
    let o;
    try {
      o = JSON.parse(linha);
    } catch {
      continue;
    }
    if (!cwd && o.cwd) cwd = o.cwd;
    if (!primeiro && o.type === 'user' && !o.isMeta && typeof o.message?.content === 'string') {
      const t = limparTextoUsuario(o.message.content);
      if (t && !t.startsWith('/clear')) primeiro = t;
    }
    if (cwd && primeiro) break;
  }
  let titulo = null;
  for (const m of cauda.matchAll(/"(customTitle|aiTitle)":"((?:[^"\\]|\\.)*)"/g)) {
    try {
      titulo = JSON.parse(`"${m[2]}"`);
    } catch {}
  }
  const info = {
    sessionId: path.basename(arquivo, '.jsonl'),
    cwd,
    titulo: titulo || (primeiro ? primeiro.replace(/\s+/g, ' ').slice(0, 80) : '(sem título)'),
    atualizado: stat.mtimeMs,
    tamanho: stat.size,
  };
  cacheHistorico.set(chave, info);
  return info;
}

async function listarHistorico(limite = 150) {
  const arquivos = [];
  let pastas = [];
  try {
    pastas = await fsp.readdir(PROJETOS_CLAUDE, { withFileTypes: true });
  } catch {}
  for (const p of pastas) {
    if (!p.isDirectory()) continue;
    const dir = path.join(PROJETOS_CLAUDE, p.name);
    for (const nome of await fsp.readdir(dir).catch(() => [])) {
      if (!nome.endsWith('.jsonl')) continue;
      const arq = path.join(dir, nome);
      const stat = await fsp.stat(arq).catch(() => null);
      if (stat && stat.size > 0) arquivos.push({ arq, stat });
    }
  }
  arquivos.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  const lista = [];
  for (const { arq, stat } of arquivos.slice(0, limite)) {
    const info = await infoSessao(arq, stat).catch(() => null);
    if (info?.cwd) {
      cacheTranscricoes.set(info.sessionId, arq);
      lista.push(info);
    }
  }
  return lista;
}

async function listarPastas() {
  const itens = await fsp.readdir(REPOS, { withFileTypes: true }).catch(() => []);
  return {
    base: REPOS,
    home: HOME,
    pastas: itens.filter((i) => i.isDirectory() && !i.name.startsWith('.')).map((i) => path.join(REPOS, i.name)),
  };
}

let processosSO = [];
let consultando = false;

function atualizarProcessos() {
  const vivos = [...abas.values()].filter((a) => a.proc);
  if (!vivos.length || !clientes.size) {
    if (processosSO.length) {
      processosSO = [];
      emitir({ t: 'procs', lista: [] });
    }
    return;
  }
  if (consultando) return;
  consultando = true;
  const script = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,WorkingSetSize | ConvertTo-Json -Compress";
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (erro, saida) => {
    consultando = false;
    if (erro) return;
    let todos;
    try {
      todos = JSON.parse(saida);
    } catch {
      return;
    }
    const filhos = new Map();
    for (const p of todos) {
      if (!filhos.has(p.ParentProcessId)) filhos.set(p.ParentProcessId, []);
      filhos.get(p.ParentProcessId).push(p);
    }
    const lista = [];
    const visitar = (pid, abaId, nivel) => {
      for (const f of filhos.get(pid) || []) {
        if (/^conhost\.exe$/i.test(f.Name)) continue;
        lista.push({ aba: abaId, pid: f.ProcessId, pai: pid, nome: f.Name, cmd: (f.CommandLine || '').slice(0, 400), mem: f.WorkingSetSize, nivel });
        if (nivel < 6) visitar(f.ProcessId, abaId, nivel + 1);
      }
    };
    for (const a of vivos) {
      if (!a.proc) continue;
      const raiz = todos.find((p) => p.ProcessId === a.proc.pid);
      if (raiz) lista.push({ aba: a.id, pid: raiz.ProcessId, pai: null, nome: raiz.Name, cmd: 'claude', mem: raiz.WorkingSetSize, nivel: 0 });
      const inicio = lista.length;
      visitar(a.proc.pid, a.id, 1);
      const descendentes = lista.slice(inicio);
      if (a.marcarBase) {
        a.pidsBase = new Set(descendentes.map((p) => p.pid));
        a.marcarBase = false;
      }
      for (const p of descendentes) p.auxiliar = !!a.pidsBase?.has(p.pid);
    }
    processosSO = lista;
    emitir({ t: 'procs', lista });
  });
}

setInterval(atualizarProcessos, 3000);

setInterval(() => {
  for (const a of abas.values()) {
    if (a.proc && a.estado === 'ociosa' && Date.now() - a.ultimoUso > OCIOSO_MS) a.encerrar();
  }
}, 60000);

function json(res, codigo, dados) {
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(dados));
}

async function corpo(req) {
  let dados = '';
  for await (const parte of req) {
    dados += parte;
    if (dados.length > 30 * 1024 * 1024) throw new Error('corpo grande demais');
  }
  return dados ? JSON.parse(dados) : {};
}

const ROTAS = ['eventos', 'abas', 'nova', 'log', 'enviar', 'interromper', 'encerrar', 'permissao', 'config', 'fechar', 'historico', 'pastas', 'matar', 'preferencias'].map((r) => `claude/${r}`);

const servidor = http.createServer(async (req, res) => {
  try {
    if (TOKEN && req.headers['x-bluescreen-token'] !== TOKEN) return json(res, 403, { error: 'chamada sem o token do BlueScreen' });
    if (req.headers['x-bluescreen-remote'] === '1') return json(res, 403, { error: 'O Claude só pode ser usado no próprio PC, não pela rede.' });
    const url = new URL(req.url, 'http://127.0.0.1');
    const rota = url.pathname.replace(/^\/api\/claude\//, '');
    const idAba = url.searchParams.get('aba');
    const aba = idAba ? abas.get(idAba) : null;
    if (idAba && !aba) return json(res, 404, { error: 'conversa não encontrada' });
    const precisaAba = ['log', 'enviar', 'interromper', 'encerrar', 'permissao', 'config', 'fechar'];
    if (precisaAba.includes(rota) && !aba) return json(res, 400, { error: 'informe a conversa (aba)' });
    const post = req.method === 'POST';

    switch (rota) {
      case 'eventos': {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write(`data: ${JSON.stringify({ t: 'oi', abas: [...abas.values()].map((a) => a.resumo()), procs: processosSO, exe: EXE, prefs })}\n\n`);
        clientes.add(res);
        const pulso = setInterval(() => res.write(': ping\n\n'), 15000);
        req.on('close', () => {
          clearInterval(pulso);
          clientes.delete(res);
        });
        atualizarProcessos();
        return;
      }
      case 'abas':
        return json(res, 200, [...abas.values()].map((a) => a.resumo()));
      case 'nova': {
        const dados = await corpo(req);
        if (!dados.cwd || !fs.existsSync(dados.cwd)) return json(res, 400, { error: 'pasta inexistente' });
        const existente = dados.sessionId && [...abas.values()].find((a) => a.sessionId === dados.sessionId);
        if (existente) return json(res, 200, existente.resumo());
        const nova = new Aba(dados);
        abas.set(nova.id, nova);
        salvarAbas();
        emitir({ t: 'aba', aba: nova.resumo() });
        return json(res, 200, nova.resumo());
      }
      case 'log':
        await aba.carregarLog();
        return json(res, 200, { log: aba.log, pendentes: [...aba.pendentes.entries()].map(([id, r]) => ({ id, req: r })) });
      case 'enviar': {
        if (!post) break;
        const { texto, imagens } = await corpo(req);
        if (!texto && !imagens?.length) return json(res, 400, { error: 'mensagem vazia' });
        await aba.carregarLog();
        aba.enviar(texto, imagens || []);
        return json(res, 200, { ok: true });
      }
      case 'interromper':
        if (!post) break;
        await aba.interromper();
        return json(res, 200, { ok: true });
      case 'encerrar':
        if (!post) break;
        aba.encerrar();
        return json(res, 200, { ok: true });
      case 'permissao': {
        if (!post) break;
        const dados = await corpo(req);
        return json(res, 200, { ok: aba.responderPermissao(dados.id, dados) });
      }
      case 'config':
        if (!post) break;
        await aba.configurar(await corpo(req));
        return json(res, 200, aba.resumo());
      case 'fechar':
        if (!post) break;
        aba.encerrar();
        abas.delete(aba.id);
        salvarAbas();
        emitir({ t: 'aba-fechada', id: aba.id });
        return json(res, 200, { ok: true });
      case 'historico':
        return json(res, 200, await listarHistorico(Number(url.searchParams.get('limite')) || 150));
      case 'pastas':
        return json(res, 200, await listarPastas());
      case 'matar': {
        if (!post) break;
        const { pid } = await corpo(req);
        if (!processosSO.some((p) => p.pid === pid)) return json(res, 400, { error: 'esse processo não foi aberto pelo Claude' });
        matarArvore(pid);
        return json(res, 200, { ok: true });
      }
      case 'preferencias':
        if (post) {
          const dados = await corpo(req);
          if (typeof dados.cores === 'boolean') prefs.cores = dados.cores;
          await salvarPrefs();
          emitir({ t: 'prefs', prefs });
        }
        return json(res, 200, prefs);
    }
    return json(res, 404, { error: 'rota desconhecida' });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

await restaurarAbas();
await lerPrefs();
servidor.listen(0, '127.0.0.1', () => {
  console.log(`BLUESCREEN-READY ${JSON.stringify({ port: servidor.address().port, routes: ROTAS })}`);
  console.log(`Claude: ${EXE}`);
});

const sair = () => {
  for (const a of abas.values()) a.encerrar();
  setTimeout(() => process.exit(0), 300);
};
process.on('SIGINT', sair);
process.on('SIGTERM', sair);

const PAI = process.ppid;
setInterval(() => {
  try {
    process.kill(PAI, 0);
  } catch {
    sair();
  }
}, 2000);
