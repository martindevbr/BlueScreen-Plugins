import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { HOME, GRUPOS, normalizar, chave, alvoDe, alvosDoComando, soLeitura, riscosDe, chamadosDe, definirPadraoChamado, limparCaches } from './lib/alvos.mjs';
import { diffUnificado } from './lib/diff.mjs';
import { versoes, lerDisco, hash, backup, gravar } from './lib/versoes.mjs';

const require = createRequire(import.meta.url);
const { Plugin } = require(path.join(process.env.BLUESCREEN_SDK, 'bluescreen.js'));

const p = new Plugin();
const DIAS_PADRAO = 30;
const MAX_LINHAS_PATCH = 1500;
const MAX_SAIDA = 6000;
const INTERVALO_VARREDURA = 2000;
const DIAS_MARCAS = 7;
const REPETICAO = 3;
const HERANCA_PEDIDOS = 1;
const HERANCA_MS = 30 * 60000;
const LEITURA = new Set([
  'Read', 'Grep', 'Glob', 'LS', 'ToolSearch', 'Skill', 'WebSearch', 'WebFetch', 'AskUserQuestion', 'ListAgents',
  'ScheduleWakeup', 'EnterPlanMode', 'ExitPlanMode', 'TodoWrite', 'TaskStop', 'Monitor', 'ReportFindings', 'SendFeedback',
  'CronList', 'BashOutput', 'KillShell',
]);
const MCP_LEITURA = /(snapshot|screenshot|navigate|read|list|get|query|search|find|console|network|wait|hover|evaluate|tabs|guide)/i;
const ARQUIVO = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const COMANDO = new Set(['Bash', 'PowerShell']);
const PASTA_DADOS = process.env.BLUESCREEN_PLUGIN_DATA || path.join(HOME, '.bluescreen', 'plugin-data', 'pegadas');

const ARQ_ROTULOS = path.join(PASTA_DADOS, 'rotulos.json');
const MAX_ROTULO = 60;

const E = { arquivos: new Map(), eventos: [], porId: new Map(), pedidos: new Map(), sessoes: new Map(), ultimaVarredura: 0, rev: 0 };

async function config() {
  let cfg = {};
  try { cfg = (await p.settings()) || {}; } catch {}
  const dias = Number(cfg.dias) > 0 ? Number(cfg.dias) : DIAS_PADRAO;
  definirPadraoChamado(String(cfg.chamados || '').trim());
  return { pasta: String(cfg.pasta || '').trim() || path.join(HOME, '.claude', 'projects'), dias };
}

function lerRotulos() {
  try {
    const r = JSON.parse(fs.readFileSync(ARQ_ROTULOS, 'utf8'));
    return { pedidos: r.pedidos || {}, sessoes: r.sessoes || {} };
  } catch { return { pedidos: {}, sessoes: {} }; }
}

const R = lerRotulos();
const unicos = (lista) => [...new Set(lista)];
const rotulosDe = (pedido, sessao) => ({ pedido: R.pedidos[pedido] || [], sessao: R.sessoes[sessao] || [] });

function chamadosCom(auto, pedido, sessao) {
  const r = rotulosDe(pedido, sessao);
  return unicos([...auto, ...r.sessao, ...r.pedido]);
}

function reaplicarRotulos() {
  for (const pd of E.pedidos.values()) {
    pd.chamados = chamadosCom(pd.auto, pd.id, pd.sessao);
    pd.manuais = rotulosDe(pd.id, pd.sessao);
  }
  for (const ev of E.eventos) ev.chamados = E.pedidos.get(ev.pedido)?.chamados || chamadosCom([], '', ev.sessao);
}

function normalizarRotulo(nome) {
  const t = String(nome ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ROTULO);
  if (!t) throw new Error('Diga o chamado ou o nome');
  const [numero] = chamadosDe(t);
  return numero && numero.length === t.length ? numero : t;
}

function rotular({ alvo, id, nome, remover }) {
  const mapa = alvo === 'sessao' ? R.sessoes : alvo === 'pedido' ? R.pedidos : null;
  if (!mapa) throw new Error('alvo precisa ser "pedido" ou "sessao"');
  if (!id) throw new Error('Falta o id do ' + alvo);
  if (alvo === 'pedido' && !E.pedidos.has(id)) throw new Error('Pedido não encontrado');
  if (alvo === 'sessao' && !E.sessoes.has(id)) throw new Error('Sessão não encontrada');
  const rotulo = normalizarRotulo(nome);
  const atuais = mapa[id] || [];
  const novos = remover ? atuais.filter((x) => x.toLowerCase() !== rotulo.toLowerCase()) : unicos([...atuais, rotulo]);
  if (novos.length) mapa[id] = novos; else delete mapa[id];
  fs.mkdirSync(PASTA_DADOS, { recursive: true });
  fs.writeFileSync(ARQ_ROTULOS + '.tmp', JSON.stringify(R, null, 2));
  fs.renameSync(ARQ_ROTULOS + '.tmp', ARQ_ROTULOS);
  reaplicarRotulos();
  E.rev++;
  return { rotulo, rotulos: novos };
}

const usoVazio = () => ({ entrada: 0, saida: 0, cacheLido: 0, cacheCriado: 0 });

function somarUso(alvo, u) {
  alvo.entrada += u.input_tokens || 0;
  alvo.saida += u.output_tokens || 0;
  alvo.cacheLido += u.cache_read_input_tokens || 0;
  alvo.cacheCriado += u.cache_creation_input_tokens || 0;
}

function textoDoPedido(conteudo) {
  let t = typeof conteudo === 'string' ? conteudo : (Array.isArray(conteudo) ? conteudo.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '');
  t = t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').replace(/<\/?pasted_content[^>]*>/g, '').trim();
  if (!t || /^<(command-|local-command|bash-|task-notification)/.test(t)) return '';
  return t.length > 600 ? t.slice(0, 600) + '…' : t;
}

function linhasDoPatch(resultado, entrada) {
  const hunks = Array.isArray(resultado?.structuredPatch) ? resultado.structuredPatch : [];
  let linhas = [];
  if (hunks.length) {
    for (const h of hunks) {
      linhas.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
      linhas.push(...(h.lines || []));
    }
  } else if (typeof (resultado?.content ?? entrada?.content) === 'string') {
    const texto = String(resultado?.content ?? entrada.content);
    linhas = [`@@ -0,0 +1,${texto.split('\n').length} @@`, ...texto.split('\n').map((l) => '+' + l)];
  } else if (entrada?.old_string !== undefined) {
    linhas = [...String(entrada.old_string).split('\n').map((l) => '-' + l), ...String(entrada.new_string ?? '').split('\n').map((l) => '+' + l)];
  }
  const mais = linhas.filter((l) => l[0] === '+').length;
  const menos = linhas.filter((l) => l[0] === '-').length;
  const cortadas = Math.max(0, linhas.length - MAX_LINHAS_PATCH);
  return { linhas: linhas.slice(0, MAX_LINHAS_PATCH), mais, menos, cortadas };
}

function saidaDe(resultado, blocoResultado) {
  let s = '';
  if (resultado && typeof resultado === 'object' && ('stdout' in resultado || 'stderr' in resultado)) s = [resultado.stdout, resultado.stderr].filter(Boolean).join('\n');
  else if (typeof blocoResultado?.content === 'string') s = blocoResultado.content;
  else if (Array.isArray(blocoResultado?.content)) s = blocoResultado.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return s.length > MAX_SAIDA ? s.slice(0, MAX_SAIDA) + `\n… (${s.length - MAX_SAIDA} caracteres cortados)` : s;
}

function criarEvento(estado, uso, bloco, resultado, ts, fonte) {
  const { nome, input = {} } = uso;
  const pedido = E.pedidos.get(estado.pedido);
  const base = {
    id: uso.id, ts: uso.ts, fimTs: ts, duracaoMs: uso.ts && ts ? Math.max(0, Date.parse(ts) - Date.parse(uso.ts)) : 0,
    sessao: estado.sessao, agente: estado.agente || '', pedido: estado.pedido, chamados: pedido?.chamados || chamadosCom([], '', estado.sessao),
    ferramenta: nome, erro: Boolean(bloco.is_error), fonte,
  };
  let ev;
  if (ARQUIVO.has(nome)) {
    const caminho = normalizar(input.file_path || input.notebook_path || resultado?.filePath || '');
    const alvo = alvoDe(caminho);
    const patch = linhasDoPatch(resultado, nome === 'MultiEdit' ? null : input);
    const acao = nome === 'Write' ? (resultado?.type === 'create' ? 'criou' : 'reescreveu') : 'editou';
    ev = { ...base, tipo: 'arquivo', acao, caminho, chave: caminho.toLowerCase(), rel: caminho.slice(alvo.raiz.length + 1) || path.posix.basename(caminho), alvos: [alvo], mais: patch.mais, menos: patch.menos, patch: patch.linhas, cortadas: patch.cortadas };
  } else if (COMANDO.has(nome)) {
    const comando = String(input.command || '');
    ev = { ...base, tipo: 'comando', acao: input.run_in_background ? 'rodou em segundo plano' : 'rodou', titulo: String(input.description || ''), comando, consulta: soLeitura(comando), alvos: alvosDoComando(comando), saida: saidaDe(resultado, bloco), interrompido: Boolean(resultado?.interrupted) };
  } else {
    const resumo = JSON.stringify(input);
    ev = { ...base, tipo: 'outro', acao: 'usou', titulo: nome.replace(/^mcp__(claude_ai_)?/, '').replace(/__/g, ' · '), comando: resumo.length > 2000 ? resumo.slice(0, 2000) + '…' : resumo, alvos: alvosDoComando(resumo), saida: saidaDe(resultado, bloco) };
  }
  ev.riscos = riscosDe(ev);
  return ev;
}

const ehLeitura = (nome) => LEITURA.has(nome) || (nome.startsWith('mcp__') && MCP_LEITURA.test(nome.split('__').pop()));

function sessaoDe(id, arquivo, cwd) {
  let s = E.sessoes.get(id);
  if (!s) { s = { id, titulo: '', cwd: '', inicio: '', fim: '', arquivo, pedidos: 0, mudancas: 0, comandos: 0, leituras: 0, falhas: 0, uso: usoVazio(), modelos: new Set() }; E.sessoes.set(id, s); }
  if (cwd && !s.cwd) s.cwd = cwd;
  return s;
}

function registrarNoPedido(ev) {
  const pd = E.pedidos.get(ev.pedido);
  if (!pd) return;
  pd.acoes++;
  if (ev.tipo === 'arquivo') pd.mudancas++; else pd.comandos++;
  if (ev.erro) pd.falhas++;
  if (ev.riscos.length) pd.sensiveis++;
  if (ev.tipo === 'comando') {
    pd.cmdMs += ev.duracaoMs;
    const n = (pd.contagemCmd.get(ev.comando) || 0) + 1;
    pd.contagemCmd.set(ev.comando, n);
    if (n >= REPETICAO) ev.repetido = n;
  }
}

function processarLinha(estado, linha, limite, fonte) {
  let e;
  try { e = JSON.parse(linha); } catch { return; }
  if (e.type === 'ai-title' || e.type === 'custom-title' || e.type === 'summary') {
    const s = sessaoDe(e.sessionId || estado.sessao, estado.arquivo);
    const t = e.customTitle || e.aiTitle || e.summary;
    if (t && (e.type === 'custom-title' || !s.tituloFixo)) { s.titulo = t; if (e.type === 'custom-title') s.tituloFixo = true; }
    return;
  }
  if (e.type !== 'user' && e.type !== 'assistant') return;
  if (e.sessionId) estado.sessao = e.sessionId;
  if (e.agentId) estado.agente = e.agentId;
  const ts = e.timestamp || '';
  const s = sessaoDe(estado.sessao, estado.arquivo, e.cwd);
  if (ts) { if (!s.inicio || ts < s.inicio) s.inicio = ts; if (ts > s.fim) s.fim = ts; }
  const pd = E.pedidos.get(estado.pedido);
  if (pd && ts > pd.fim) pd.fim = ts;
  const conteudo = e.message?.content;
  if (e.type === 'assistant') {
    const id = e.message?.id;
    if (e.message?.usage && id && !estado.msgs.has(id) && (!ts || ts >= limite)) {
      estado.msgs.add(id);
      somarUso(s.uso, e.message.usage);
      if (e.message.model && e.message.model !== '<synthetic>') s.modelos.add(e.message.model);
      if (pd) { somarUso(pd.uso, e.message.usage); if (e.message.model && e.message.model !== '<synthetic>') pd.modelos.add(e.message.model); }
    }
    for (const b of Array.isArray(conteudo) ? conteudo : []) {
      if (b.type === 'tool_use') estado.pendentes.set(b.id, { id: b.id, nome: b.name, input: b.input, ts });
    }
    return;
  }
  const blocos = Array.isArray(conteudo) ? conteudo.filter((b) => b.type === 'tool_result') : [];
  if (!blocos.length) {
    if (e.isMeta || e.isCompactSummary) return;
    const texto = textoDoPedido(conteudo);
    if (!texto) return;
    const id = e.uuid || `${estado.sessao}-${ts}`;
    estado.pedido = id;
    const citados = chamadosDe(texto);
    if (citados.length) Object.assign(estado, { chamados: citados, chamadosTs: ts, herancas: 0 });
    else estado.herancas++;
    const herda = !citados.length && estado.chamados.length && estado.herancas <= HERANCA_PEDIDOS
      && (!ts || !estado.chamadosTs || Date.parse(ts) - Date.parse(estado.chamadosTs) <= HERANCA_MS);
    if (ts && ts < limite) return;
    const auto = citados.length ? citados : herda ? estado.chamados : [];
    E.pedidos.set(id, {
      id, ts, fim: ts, sessao: estado.sessao, agente: estado.agente || '', texto,
      auto, chamados: chamadosCom(auto, id, estado.sessao), manuais: rotulosDe(id, estado.sessao), herdado: Boolean(herda),
      uso: usoVazio(), modelos: new Set(), acoes: 0, mudancas: 0, comandos: 0, falhas: 0, sensiveis: 0, cmdMs: 0, contagemCmd: new Map(),
    });
    s.pedidos++;
    return;
  }
  for (const bloco of blocos) {
    const uso = estado.pendentes.get(bloco.tool_use_id);
    if (!uso) continue;
    estado.pendentes.delete(bloco.tool_use_id);
    if (ehLeitura(uso.nome)) { s.leituras++; continue; }
    if (uso.ts && uso.ts < limite) continue;
    if (E.porId.has(uso.id)) continue;
    const ev = criarEvento(estado, uso, bloco, e.toolUseResult, ts, fonte);
    ev.seq = ++E.rev;
    if (ev.tipo === 'arquivo') s.mudancas++; else s.comandos++;
    if (ev.erro) s.falhas++;
    registrarNoPedido(ev);
    E.eventos.push(ev);
    E.porId.set(ev.id, ev);
  }
}

function listarJsonl(pasta) {
  const lista = [];
  const andar = (dir, prof) => {
    let itens = [];
    try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const it of itens) {
      const c = path.join(dir, it.name);
      if (it.isDirectory()) { if (prof < 3 && it.name !== 'memory') andar(c, prof + 1); } else if (it.name.endsWith('.jsonl')) lista.push(c);
    }
  };
  andar(pasta, 0);
  return lista;
}

async function varrer(forcar = false) {
  if (!forcar && Date.now() - E.ultimaVarredura < INTERVALO_VARREDURA) return;
  E.ultimaVarredura = Date.now();
  const { pasta, dias } = await config();
  const limiteMs = Date.now() - dias * 86400000;
  const limite = new Date(limiteMs).toISOString();
  let novos = false;
  for (const arquivo of listarJsonl(pasta)) {
    let st;
    try { st = fs.statSync(arquivo); } catch { continue; }
    if (st.mtimeMs < limiteMs) continue;
    let estado = E.arquivos.get(arquivo);
    if (!estado) {
      estado = { arquivo, offset: 0, sessao: path.basename(arquivo, '.jsonl'), agente: '', pedido: '', chamados: [], chamadosTs: '', herancas: 0, pendentes: new Map(), msgs: new Set() };
      if (/[\\/]subagents[\\/]/.test(arquivo)) estado.sessao = path.basename(path.dirname(path.dirname(arquivo)));
      E.arquivos.set(arquivo, estado);
    }
    if (st.size < estado.offset) Object.assign(estado, { offset: 0, pendentes: new Map(), msgs: new Set() });
    if (st.size === estado.offset) continue;
    const fd = fs.openSync(arquivo, 'r');
    try {
      const buf = Buffer.alloc(st.size - estado.offset);
      fs.readSync(fd, buf, 0, buf.length, estado.offset);
      let ini = 0;
      for (let fim = buf.indexOf(10, ini); fim >= 0; fim = buf.indexOf(10, ini)) {
        if (fim > ini) processarLinha(estado, buf.toString('utf8', ini, fim), limite, { arquivo, pos: estado.offset + ini, len: fim - ini });
        ini = fim + 1;
      }
      if (ini) novos = true;
      estado.offset += ini;
    } finally { fs.closeSync(fd); }
  }
  if (novos) E.eventos.sort((a, b) => a.ts.localeCompare(b.ts) || a.seq - b.seq);
}

function leve(ev) {
  const { patch, saida, comando, fonte, ...resto } = ev;
  return { ...resto, comando: comando && comando.length > 300 ? comando.slice(0, 300) + '…' : comando };
}

function pedidoPublico(pd) {
  if (!pd) return null;
  const { contagemCmd, modelos, ...resto } = pd;
  return { ...resto, modelos: [...modelos], repetidos: [...contagemCmd.values()].filter((n) => n >= REPETICAO).length };
}

function sessaoPublica(s) {
  if (!s) return null;
  const { modelos, tituloFixo, ...resto } = s;
  return { ...resto, modelos: [...modelos] };
}

function filtrar(q) {
  const desde = q.desde || new Date(Date.now() - (Number(q.dias) || 1) * 86400000).toISOString();
  const termo = String(q.q || '').toLowerCase();
  const tipos = q.tipos ? String(q.tipos).split(',') : null;
  return E.eventos.filter((ev) => {
    if (ev.ts < desde) return false;
    if (tipos && !tipos.includes(ev.tipo)) return false;
    if (q.consultas !== '1' && ev.consulta) return false;
    if (q.sensiveis === '1' && !ev.riscos.length) return false;
    if (q.sessao && ev.sessao !== q.sessao) return false;
    if (q.pedido && ev.pedido !== q.pedido) return false;
    if (q.chamado && !ev.chamados.includes(q.chamado)) return false;
    if (q.grupo && !ev.alvos.some((a) => a.grupo === q.grupo && (!q.alvo || a.id === q.alvo))) return false;
    if (q.semAlvo === '1' && ev.alvos.length) return false;
    if (termo && ![ev.caminho, ev.comando, ev.titulo, ev.saida, E.pedidos.get(ev.pedido)?.texto].some((v) => String(v || '').toLowerCase().includes(termo))) return false;
    return true;
  });
}

function contarAlvos(lista) {
  const m = new Map();
  for (const ev of lista) {
    for (const a of ev.alvos) {
      const k = a.grupo + '|' + a.id;
      const x = m.get(k) || { grupo: a.grupo, id: a.id, nome: a.nome, raiz: a.raiz, mudancas: 0, comandos: 0, ultimo: '' };
      if (ev.tipo === 'arquivo') x.mudancas++; else x.comandos++;
      if (ev.ts > x.ultimo) x.ultimo = ev.ts;
      m.set(k, x);
    }
  }
  return [...m.values()].sort((a, b) => b.ultimo.localeCompare(a.ultimo));
}

function contarChamados(lista) {
  const m = new Map();
  for (const ev of lista) {
    for (const c of ev.chamados) {
      const x = m.get(c) || { numero: c, acoes: 0, mudancas: 0, ultimo: '' };
      x.acoes++;
      if (ev.tipo === 'arquivo') x.mudancas++;
      if (ev.ts > x.ultimo) x.ultimo = ev.ts;
      m.set(c, x);
    }
  }
  return [...m.values()].sort((a, b) => b.ultimo.localeCompare(a.ultimo));
}

const eventosDoArquivo = (k) => E.eventos.filter((ev) => ev.tipo === 'arquivo' && ev.chave === k);

function versoesDoArquivo(caminho) {
  const lista = eventosDoArquivo(chave(caminho));
  const disco = lerDisco(caminho);
  return { lista: versoes(lista, disco), disco };
}

function arquivosDoPedido(pedidoId) {
  const evs = E.eventos.filter((ev) => ev.pedido === pedidoId && ev.tipo === 'arquivo');
  const porArquivo = new Map();
  for (const ev of evs) {
    if (!porArquivo.has(ev.chave)) porArquivo.set(ev.chave, []);
    porArquivo.get(ev.chave).push(ev);
  }
  return [...porArquivo.values()].map((lista) => {
    const caminho = lista[0].caminho;
    const { lista: vs, disco } = versoesDoArquivo(caminho);
    const primeira = vs.find((v) => v.ev.id === lista[0].id);
    const ultima = vs.find((v) => v.ev.id === lista[lista.length - 1].id);
    const criado = primeira?.b?.tipo === 'write' && primeira.b.criado;
    const antes = primeira?.antes ?? null;
    const depois = ultima?.depois ?? null;
    return { caminho, rel: lista[0].rel, alvo: lista[0].alvos[0], criado, antes, depois, disco, edicoes: lista.map((ev) => ev.id), ultimaVersao: vs[vs.length - 1]?.ev.id === ultima?.ev.id };
  });
}

function plano(modo, id) {
  if (modo === 'pedido') {
    if (!E.pedidos.has(id) && !E.eventos.some((ev) => ev.pedido === id)) throw new Error('Pedido não encontrado');
    return arquivosDoPedido(id).map((a) => ({
      caminho: a.caminho, rel: a.rel, alvo: a.alvo, atual: a.disco,
      destino: a.criado ? null : a.antes, possivel: a.criado || a.antes != null,
      motivo: a.criado || a.antes != null ? '' : 'a versão de antes não está no transcript nem dá para reconstruir',
      apagar: a.criado,
    }));
  }
  const ev = E.porId.get(id);
  if (!ev || ev.tipo !== 'arquivo') throw new Error('Edição não encontrada');
  const { lista, disco } = versoesDoArquivo(ev.caminho);
  const v = lista.find((x) => x.ev.id === id);
  const criado = v?.b?.tipo === 'write' && v.b.criado;
  const destino = modo === 'antes' ? (criado ? null : v?.antes) : v?.depois;
  const apagar = modo === 'antes' && criado;
  const possivel = apagar || destino != null;
  return [{
    caminho: ev.caminho, rel: ev.rel, alvo: ev.alvos[0], atual: disco, destino, apagar, possivel,
    motivo: possivel ? '' : `a versão de ${modo === 'antes' ? 'antes' : 'depois'} desta edição não está no transcript nem dá para reconstruir`,
  }];
}

function previa(itens) {
  return itens.map((it) => {
    const d = it.possivel ? diffUnificado(it.atual ?? '', it.apagar ? '' : it.destino) : null;
    return {
      caminho: it.caminho, rel: it.rel, alvo: it.alvo, possivel: it.possivel, motivo: it.motivo, apagar: it.apagar,
      existe: it.atual != null, hashAtual: hash(it.atual), igual: it.possivel && (it.apagar ? it.atual == null : it.atual === it.destino),
      diff: d,
    };
  });
}

function marcasDe(caminho) {
  const desde = new Date(Date.now() - DIAS_MARCAS * 86400000).toISOString();
  const lista = eventosDoArquivo(chave(caminho)).filter((ev) => ev.ts >= desde && ev.acao === 'editou').reverse().slice(0, 40);
  return lista.map((ev) => {
    const linhas = [];
    let n = 0;
    for (const l of ev.patch || []) {
      const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
      if (h) { n = Number(h[1]); continue; }
      if (l[0] === '+') { linhas.push({ n, texto: l.slice(1) }); n++; } else if (l[0] === ' ') n++;
    }
    const pd = E.pedidos.get(ev.pedido);
    return { id: ev.id, ts: ev.ts, acao: ev.acao, pedido: pd ? pd.texto.slice(0, 200) : '', linhas: linhas.slice(0, 400) };
  });
}

function resumoTexto(lista, titulo) {
  const pedidos = [];
  for (const ev of lista) {
    let g = pedidos.find((x) => x.id === ev.pedido);
    if (!g) { g = { id: ev.pedido, ts: ev.ts, texto: E.pedidos.get(ev.pedido)?.texto || '', arquivos: new Map(), comandos: 0, falhas: 0 }; pedidos.push(g); }
    if (ev.tipo === 'arquivo') {
      const a = g.arquivos.get(ev.caminho) || { rel: ev.rel, alvo: ev.alvos[0]?.nome, mais: 0, menos: 0, criou: false };
      a.mais += ev.mais; a.menos += ev.menos; a.criou ||= ev.acao === 'criou';
      g.arquivos.set(ev.caminho, a);
    } else g.comandos++;
    if (ev.erro) g.falhas++;
  }
  pedidos.sort((a, b) => a.ts.localeCompare(b.ts));
  const linhas = [titulo, ''];
  for (const g of pedidos) {
    const quando = new Date(g.ts).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    linhas.push(`- ${quando}: ${(g.texto || '(pedido fora da janela)').replace(/\s+/g, ' ').slice(0, 160)}`);
    for (const a of g.arquivos.values()) linhas.push(`  - ${a.criou ? 'criou' : 'alterou'} ${a.rel} (${a.alvo}, +${a.mais} -${a.menos})`);
    if (g.comandos) linhas.push(`  - ${g.comandos} comando(s)${g.falhas ? `, ${g.falhas} com falha` : ''}`);
  }
  return linhas.join('\n');
}

function rota(nome, fn, { escrita = false } = {}) {
  p.route('pegadas/' + nome, async (req) => {
    if (escrita && req.remote) throw Plugin.error('só neste computador', 403);
    try {
      await varrer();
      const corpo = req.method === 'GET' ? {} : req.json();
      return { ok: true, ...(await fn({ ...(req.query || {}), ...corpo }, req)) };
    } catch (err) {
      return { ok: false, erro: err?.message ?? String(err) };
    }
  });
}

rota('rev', async () => ({ rev: E.rev }));
rota('eventos', async (q) => {
  const todos = filtrar({ ...q, grupo: '', alvo: '', semAlvo: '', chamado: '', consultas: '1', sensiveis: '' });
  const consultas = todos.filter((ev) => ev.consulta).length;
  const base = q.consultas === '1' ? todos : todos.filter((ev) => !ev.consulta);
  const lista = filtrar(q);
  const limite = Math.min(Number(q.limite) || 600, 3000);
  const fatia = lista.slice(-limite).reverse();
  const pedidos = {};
  const sessoes = {};
  for (const ev of fatia) {
    if (ev.pedido && E.pedidos.has(ev.pedido)) pedidos[ev.pedido] = pedidoPublico(E.pedidos.get(ev.pedido));
    const s = E.sessoes.get(ev.sessao);
    if (s) sessoes[s.id] = { id: s.id, titulo: s.titulo, cwd: s.cwd, inicio: s.inicio, fim: s.fim };
  }
  return {
    rev: E.rev, total: lista.length, cortados: lista.length - fatia.length, eventos: fatia.map(leve), pedidos, sessoes,
    alvos: contarAlvos(base), chamados: contarChamados(base), grupos: GRUPOS, consultas,
    sensiveis: base.filter((ev) => ev.riscos.length).length,
    semAlvo: base.filter((ev) => !ev.alvos.length).length,
    tipos: { arquivo: base.filter((ev) => ev.tipo === 'arquivo').length, comando: base.filter((ev) => ev.tipo === 'comando').length, outro: base.filter((ev) => ev.tipo === 'outro').length },
  };
});
rota('evento', async (q) => {
  const ev = E.porId.get(q.id);
  if (!ev) throw new Error('Ação não encontrada');
  const { fonte, ...resto } = ev;
  return { evento: resto, pedido: pedidoPublico(E.pedidos.get(ev.pedido)), sessao: sessaoPublica(E.sessoes.get(ev.sessao)) };
});
rota('pedido', async (q) => {
  const pd = E.pedidos.get(q.id);
  const arquivos = arquivosDoPedido(q.id).map((a) => {
    const d = a.antes != null && a.depois != null ? diffUnificado(a.antes, a.depois) : null;
    return {
      caminho: a.caminho, rel: a.rel, alvo: a.alvo, criado: a.criado, edicoes: a.edicoes, diff: d,
      mudouDepois: a.ultimaVersao && a.depois != null && a.disco !== a.depois, existe: a.disco != null,
    };
  });
  const comandos = E.eventos.filter((ev) => ev.pedido === q.id && ev.tipo !== 'arquivo').map(leve);
  return { pedido: pedidoPublico(pd), arquivos, comandos };
});
rota('arquivo', async (q) => {
  const caminho = normalizar(q.caminho);
  const { lista, disco } = versoesDoArquivo(caminho);
  const ultima = lista[lista.length - 1];
  return {
    caminho, alvo: alvoDe(caminho), existe: disco != null,
    mudouDepois: Boolean(ultima && ultima.depois != null && disco !== ultima.depois),
    versoes: lista.map((v) => ({
      id: v.ev.id, ts: v.ev.ts, acao: v.ev.acao, mais: v.ev.mais, menos: v.ev.menos, patch: v.ev.patch, cortadas: v.ev.cortadas,
      sessao: v.ev.sessao, pedido: E.pedidos.get(v.ev.pedido)?.texto || '', temAntes: v.antes != null, temDepois: v.depois != null, origem: v.origem,
    })).reverse(),
  };
});
rota('restaurar-previa', async (q) => ({ itens: previa(plano(q.modo, q.id)) }));
rota('restaurar', async (q) => {
  const itens = plano(q.modo, q.id);
  const hashes = q.hashes || {};
  const aplicar = itens.filter((it) => it.possivel && (q.so ? q.so.includes(it.caminho) : true));
  for (const it of aplicar) {
    if (hashes[it.caminho] !== hash(it.atual)) throw new Error(`${it.rel} mudou depois da prévia. Abra a prévia de novo.`);
  }
  if (!aplicar.length) throw new Error('Nada para restaurar');
  const pasta = backup(PASTA_DADOS, aplicar);
  for (const it of aplicar) gravar(it.caminho, it.apagar ? null : it.destino);
  return { backup: pasta, itens: aplicar.map((it) => ({ caminho: it.caminho, rel: it.rel, apagou: it.apagar })) };
}, { escrita: true });
rota('novas', async (q) => {
  const apos = Number(q.apos) || 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const desde = hoje.toISOString();
  const deHoje = E.eventos.filter((ev) => ev.ts >= desde && !ev.consulta);
  return {
    rev: E.rev,
    novas: apos ? E.eventos.filter((ev) => ev.seq > apos && !ev.consulta && Date.parse(ev.fimTs || ev.ts) > Date.now() - 120000).slice(-50).map(leve) : [],
    hoje: { mudancas: deHoje.filter((ev) => ev.tipo === 'arquivo').length, comandos: deHoje.filter((ev) => ev.tipo !== 'arquivo').length, sensiveis: deHoje.filter((ev) => ev.riscos.length).length },
  };
});
rota('rotulo', rotular, { escrita: true });
rota('marcas', async (q) => ({ marcas: marcasDe(q.caminho) }));
rota('resumo', async (q) => {
  const lista = filtrar({ dias: q.dias || 30, chamado: q.chamado, pedido: q.pedido, consultas: '' });
  const titulo = q.chamado ? `${q.chamado} - o que o Claude fez` : 'O que o Claude fez';
  return { texto: resumoTexto(lista, titulo), acoes: lista.length };
});
rota('sessoes', async (q) => {
  const desde = new Date(Date.now() - (Number(q.dias) || 30) * 86400000).toISOString();
  return { sessoes: [...E.sessoes.values()].filter((s) => s.fim >= desde && (s.mudancas || s.comandos || s.uso.saida)).sort((a, b) => b.fim.localeCompare(a.fim)).map(sessaoPublica) };
});
rota('status', async () => {
  const { pasta, dias } = await config();
  return { up: true, pasta, dias, arquivos: E.arquivos.size, eventos: E.eventos.length, sessoes: E.sessoes.size, backups: path.join(PASTA_DADOS, 'backups') };
});
rota('recarregar', async () => {
  Object.assign(E, { arquivos: new Map(), eventos: [], porId: new Map(), pedidos: new Map(), sessoes: new Map() });
  limparCaches();
  await varrer(true);
  return { eventos: E.eventos.length };
});

p.run().once('listening', async () => {
  const t = Date.now();
  await varrer(true);
  console.log(`  Pegadas: ${E.eventos.length} ação(ões) em ${E.arquivos.size} transcript(s), ${Date.now() - t} ms`);
});
