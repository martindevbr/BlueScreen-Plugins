import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Plugin } = require(path.join(process.env.BLUESCREEN_SDK, 'bluescreen.js'));

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const p = new Plugin();
const BACKUPS_MANTIDOS = 30;
const TIPOS = ['linha', 'texto', 'data', 'numero', 'opcoes'];
const NO_CARTAO = ['', 'titulo', 'texto', 'linha', 'selo'];
const RESERVADOS = ['id', 'aba', 'numero', 'status', 'historico', 'desativado', 'editadoAqui', 'dataAbertura', 'dataAtualizacao', 'dataEncerramento'];
const DATAS_EDITAVEIS = ['dataAbertura', 'dataAtualizacao', 'dataEncerramento'];

const CONFIG_PADRAO = {
  titulo: 'Dashboard',
  subtitulo: 'quadros e tarefas',
  arquivo: '',
  numeracao: { rotulo: 'Número', ajuda: 'Código da tarefa. Vazio: o Dashboard gera um.', prefixo: 'DEM', digitos: 3 },
  diasParado: 14,
  diasConcluido: 14,
  quadros: [{ id: 'geral', nome: 'Geral', descricao: '', protegido: false }],
  colunas: [
    { id: 'afazer', nome: 'A fazer', ajuda: 'Ninguém começou ainda.', status: ['Aberto'], fechado: false },
    { id: 'andamento', nome: 'Em andamento', ajuda: 'Alguém está trabalhando nela.', status: ['Em andamento'], fechado: false },
    { id: 'aguardando', nome: 'Aguardando', ajuda: 'Depende de outra pessoa ou time.', status: ['Aguardando'], fechado: false },
    { id: 'concluido', nome: 'Concluído', ajuda: 'Pronto.', status: ['Concluído'], fechado: true },
  ],
  campos: [
    { id: 'assunto', rotulo: 'Assunto', ajuda: '', tipo: 'linha', criacao: true, cartao: 'titulo', busca: true },
    { id: 'descricao', rotulo: 'Descrição', ajuda: 'O texto que aparece no cartão.', tipo: 'texto', criacao: true, cartao: 'texto', busca: true },
    { id: 'prioridade', rotulo: 'Prioridade', ajuda: 'Ordena o cartão na coluna.', tipo: 'opcoes', opcoes: ['Alta', 'Média', 'Baixa'], padrao: 'Média', criacao: true, cartao: 'selo', ordena: true },
    { id: 'proximoPasso', rotulo: 'Próximo passo', ajuda: '', tipo: 'texto', criacao: true, cartao: 'linha', busca: true },
    { id: 'responsavel', rotulo: 'Responsável', ajuda: '', tipo: 'linha', criacao: true },
    { id: 'links', rotulo: 'Links', ajuda: '', tipo: 'linha' },
    { id: 'dataPrevisao', rotulo: 'Previsão', ajuda: '', tipo: 'data' },
  ],
};

const pastaDados = process.env.BLUESCREEN_PLUGIN_DATA || path.join(os.homedir(), '.bluescreen', 'plugin-data', 'dashboard');
const arquivoConfig = path.join(pastaDados, 'config.json');
const arquivoQuadrosAntigo = path.join(pastaDados, 'quadros.json');

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function gravarAtomico(destino, texto) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino + '.tmp', texto, 'utf8');
  fs.renameSync(destino + '.tmp', destino);
}

function erro(mensagem, status = 400) {
  return Object.assign(new Error(mensagem), { status });
}

function semAcento(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function slug(texto) {
  return semAcento(texto).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function camelo(texto) {
  const partes = semAcento(texto).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return partes.map((x, i) => (i ? x[0].toUpperCase() + x.slice(1) : x)).join('').slice(0, 40);
}

const texto = (v) => String(v ?? '').trim();
const lista = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map(texto).filter(Boolean);
const inteiro = (v, padrao) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : padrao);

function migrarConfig() {
  const cfg = structuredClone(CONFIG_PADRAO);
  let antigos = [];
  try { antigos = JSON.parse(fs.readFileSync(arquivoQuadrosAntigo, 'utf8')); } catch {}
  if (Array.isArray(antigos) && antigos.length) cfg.quadros = antigos.map(({ fixo, ...q }) => q);
  return normalizar(cfg, null);
}

function lerConfig() {
  if (!fs.existsSync(arquivoConfig)) {
    const cfg = migrarConfig();
    gravarAtomico(arquivoConfig, JSON.stringify(cfg, null, 2));
    return cfg;
  }
  return normalizar(JSON.parse(fs.readFileSync(arquivoConfig, 'utf8')), null);
}

function normalizar(bruto, anterior) {
  const b = bruto && typeof bruto === 'object' ? bruto : {};
  const n = b.numeracao || {};
  const cfg = {
    titulo: texto(b.titulo) || CONFIG_PADRAO.titulo,
    subtitulo: texto(b.subtitulo),
    arquivo: texto(b.arquivo),
    numeracao: {
      rotulo: texto(n.rotulo) || CONFIG_PADRAO.numeracao.rotulo,
      ajuda: texto(n.ajuda),
      prefixo: (texto(n.prefixo) || CONFIG_PADRAO.numeracao.prefixo).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'DEM',
      digitos: Math.min(8, Math.max(1, inteiro(n.digitos, 3))),
    },
    diasParado: inteiro(b.diasParado, 14),
    diasConcluido: inteiro(b.diasConcluido, 14),
    quadros: [],
    colunas: [],
    campos: [],
  };

  for (const q of Array.isArray(b.quadros) ? b.quadros : []) {
    const nome = texto(q.nome);
    const id = slug(q.id || nome);
    if (!nome || !id) throw erro('Todo quadro precisa de nome');
    if (cfg.quadros.some((x) => x.id === id)) throw erro(`Quadro repetido: "${id}"`);
    cfg.quadros.push({ id, nome, descricao: texto(q.descricao), cor: texto(q.cor), protegido: Boolean(q.protegido), criadoEm: texto(q.criadoEm) || hoje() });
  }
  if (!cfg.quadros.length) throw erro('Precisa de pelo menos um quadro');

  const vistos = new Set();
  for (const c of Array.isArray(b.colunas) ? b.colunas : []) {
    const nome = texto(c.nome);
    const id = slug(c.id || nome);
    if (!nome || !id) throw erro('Toda coluna precisa de nome');
    if (cfg.colunas.some((x) => x.id === id)) throw erro(`Coluna repetida: "${id}"`);
    const status = lista(c.status);
    if (!status.length) status.push(nome);
    for (const s of status) {
      if (vistos.has(s.toLowerCase())) throw erro(`O status "${s}" está em mais de uma coluna`);
      vistos.add(s.toLowerCase());
    }
    cfg.colunas.push({ id, nome, ajuda: texto(c.ajuda), status, fechado: Boolean(c.fechado) });
  }
  if (!cfg.colunas.length) throw erro('Precisa de pelo menos uma coluna');

  for (const c of Array.isArray(b.campos) ? b.campos : []) {
    const rotulo = texto(c.rotulo);
    const id = texto(c.id) || camelo(rotulo);
    if (!rotulo || !id) throw erro('Todo campo precisa de rótulo');
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) throw erro(`Id de campo inválido: "${id}" (só letras, números e _)`);
    if (RESERVADOS.includes(id)) throw erro(`"${id}" é um campo interno do Dashboard; escolha outro id`);
    if (cfg.campos.some((x) => x.id === id)) throw erro(`Campo repetido: "${id}"`);
    const tipo = TIPOS.includes(c.tipo) ? c.tipo : 'linha';
    const campo = { id, rotulo, ajuda: texto(c.ajuda), tipo, criacao: Boolean(c.criacao), cartao: NO_CARTAO.includes(c.cartao) ? c.cartao : '', busca: Boolean(c.busca) };
    if (tipo === 'opcoes') {
      campo.opcoes = lista(c.opcoes);
      if (!campo.opcoes.length) throw erro(`O campo "${rotulo}" é de opções e não tem nenhuma`);
      campo.ordena = Boolean(c.ordena);
    }
    const padrao = texto(c.padrao);
    if (padrao) campo.padrao = padrao;
    const quadros = lista(c.quadros).filter((q) => cfg.quadros.some((x) => x.id === q));
    if (quadros.length) campo.quadros = quadros;
    cfg.campos.push(campo);
  }

  if (anterior) {
    const ids = new Set(cfg.quadros.map((q) => q.id));
    for (const q of anterior.quadros) {
      if (ids.has(q.id)) continue;
      if (q.protegido) throw erro(`O quadro "${q.nome}" está protegido; desmarque a proteção antes de removê-lo`);
    }
  }
  return cfg;
}

async function arquivoTarefas(cfg = lerConfig()) {
  return cfg.arquivo || path.join(pastaDados, 'tarefas.json');
}

const revisao = (arquivo) => (fs.existsSync(arquivo) ? String(Math.round(fs.statSync(arquivo).mtimeMs)) : '0');

function lerTarefas(arquivo) {
  if (!fs.existsSync(arquivo)) return { versao: 1, items: [] };
  const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  if (!Array.isArray(dados?.items)) throw new Error(`${arquivo} sem a lista de tarefas`);
  return dados;
}

function gravarTarefas(arquivo, dados) {
  dados.atualizadoEm = new Date().toISOString();
  const conteudo = JSON.stringify(dados, null, 2);
  gravarAtomico(arquivo, conteudo);
  const backups = path.join(path.dirname(arquivo), 'backups');
  const base = path.basename(arquivo, '.json');
  gravarAtomico(path.join(backups, `${base}-${hoje()}.json`), conteudo);
  const antigos = fs.readdirSync(backups).filter((n) => n.startsWith(base + '-') && n.endsWith('.json')).sort();
  for (const nome of antigos.slice(0, -BACKUPS_MANTIDOS)) fs.unlinkSync(path.join(backups, nome));
  return revisao(arquivo);
}

function gravarConfig(cfg) {
  gravarAtomico(arquivoConfig, JSON.stringify(cfg, null, 2));
  return cfg;
}

async function salvarConfig(corpo) {
  const anterior = lerConfig();
  const cfg = normalizar(corpo?.config ?? corpo, anterior);
  const ids = new Set(cfg.quadros.map((q) => q.id));
  const removidos = anterior.quadros.filter((q) => !ids.has(q.id));
  if (removidos.length) {
    const items = lerTarefas(await arquivoTarefas(cfg)).items;
    for (const q of removidos) {
      const n = items.filter((i) => i.aba === q.id).length;
      if (n) throw erro(`O quadro "${q.nome}" ainda tem ${n} tarefa(s). Mova ou exclua antes.`, 409);
    }
  }
  return { config: gravarConfig(cfg) };
}

function salvarQuadro({ id, nome, descricao, cor }) {
  const cfg = lerConfig();
  nome = texto(nome);
  if (id) {
    const q = cfg.quadros.find((x) => x.id === id);
    if (!q) throw erro('Quadro não existe', 404);
    if (nome) q.nome = nome;
    if (descricao !== undefined) q.descricao = String(descricao);
    if (cor !== undefined) q.cor = String(cor);
    gravarConfig(cfg);
    return q;
  }
  if (!nome) throw erro('Dê um nome ao quadro');
  const novoId = slug(nome);
  if (!novoId) throw erro('Nome sem letras ou números');
  if (cfg.quadros.some((q) => q.id === novoId)) throw erro(`Já existe um quadro "${novoId}"`, 409);
  const q = { id: novoId, nome, descricao: String(descricao ?? ''), cor: String(cor ?? ''), protegido: false, criadoEm: hoje() };
  cfg.quadros.push(q);
  gravarConfig(cfg);
  return q;
}

async function excluirQuadro({ id }) {
  const cfg = lerConfig();
  const q = cfg.quadros.find((x) => x.id === id);
  if (!q) throw erro('Quadro não existe', 404);
  if (q.protegido) throw erro(`O quadro "${q.nome}" está protegido; desmarque a proteção na configuração antes`);
  if (cfg.quadros.length === 1) throw erro('É o único quadro; crie outro antes');
  const itens = lerTarefas(await arquivoTarefas(cfg)).items.filter((i) => i.aba === id).length;
  if (itens) throw erro(`O quadro ainda tem ${itens} tarefa(s). Mova ou exclua antes.`, 409);
  cfg.quadros = cfg.quadros.filter((x) => x.id !== id);
  gravarConfig(cfg);
  return { id };
}

function proximoNumero(cfg, items) {
  const { prefixo, digitos } = cfg.numeracao;
  const padrao = new RegExp(`^${prefixo}-(\\d+)$`, 'i');
  const usados = items.map((i) => padrao.exec(String(i.numero))?.[1]).filter(Boolean).map(Number);
  return `${prefixo}-${String(Math.max(0, ...usados) + 1).padStart(digitos, '0')}`;
}

async function aplicar(pedido) {
  const cfg = lerConfig();
  const arquivo = await arquivoTarefas(cfg);
  const dados = lerTarefas(arquivo);
  let item = pedido.id ? dados.items.find((i) => i.id === pedido.id) : null;
  if (pedido.id && !item) throw erro('A tarefa não existe mais', 404);

  const fechados = cfg.colunas.filter((c) => c.fechado).flatMap((c) => c.status);
  const campos = pedido.campos ?? {};
  if (campos.aba !== undefined && !cfg.quadros.some((q) => q.id === campos.aba)) throw erro(`Quadro "${campos.aba}" não existe`);
  const criado = !item;
  if (criado) {
    if (!campos.aba) throw erro('Diga em qual quadro (campo aba) a tarefa entra');
    const numero = texto(campos.numero).toUpperCase() || proximoNumero(cfg, dados.items);
    if (dados.items.some((i) => String(i.numero).toUpperCase() === numero)) throw erro(`${numero} já existe`, 409);
    item = { id: numero.toLowerCase() + '-' + Date.now().toString(36), aba: campos.aba, numero, status: cfg.colunas[0].status[0], dataAbertura: hoje(), dataAtualizacao: '', dataEncerramento: '' };
    for (const c of cfg.campos) item[c.id] = c.padrao ?? '';
    item.historico = [];
    dados.items.push(item);
  }

  const statusAntes = item.status;
  const gravaveis = ['aba', 'status', ...DATAS_EDITAVEIS, ...cfg.campos.map((c) => c.id)];
  for (const campo of gravaveis) {
    if (campos[campo] !== undefined) item[campo] = String(campos[campo]);
  }
  if (campos.desativado !== undefined) item.desativado = campos.desativado === true || campos.desativado === 'true';
  item.historico ??= [];
  if (!criado && item.status !== statusAntes) item.historico.push({ data: hoje(), texto: `Status: ${statusAntes} → ${item.status}` });
  const andamento = texto(pedido.andamento);
  if (andamento) item.historico.push({ data: hoje(), texto: andamento });
  if (criado || andamento || item.status !== statusAntes) item.dataAtualizacao = hoje();
  if (fechados.includes(item.status) && !item.dataEncerramento) item.dataEncerramento = hoje();
  if (!fechados.includes(item.status) && fechados.includes(statusAntes)) item.dataEncerramento = '';
  item.editadoAqui = true;

  return { item, criado, rev: gravarTarefas(arquivo, dados) };
}

async function excluirItem({ id }) {
  const arquivo = await arquivoTarefas();
  const dados = lerTarefas(arquivo);
  const item = dados.items.find((i) => i.id === id);
  if (!item) throw erro('A tarefa não existe mais', 404);
  dados.items = dados.items.filter((i) => i.id !== id);
  return { numero: item.numero, rev: gravarTarefas(arquivo, dados) };
}

function rota(nome, fn, { escrita = false } = {}) {
  p.route('dashboard/' + nome, async (req) => {
    if (escrita && req.remote) throw Plugin.error('só neste computador', 403);
    try {
      return { ok: true, ...(await fn(req.method === 'GET' ? {} : req.json(), req)) };
    } catch (err) {
      return { ok: false, erro: err?.message ?? String(err), status: err?.status ?? 400 };
    }
  });
}

rota('rev', async () => ({ rev: revisao(await arquivoTarefas()) }));
rota('dados', async () => {
  const config = lerConfig();
  const arquivo = await arquivoTarefas(config);
  return { arquivo, arquivoConfig, rev: revisao(arquivo), config, quadros: config.quadros, items: lerTarefas(arquivo).items };
});
rota('config', async (corpo, req) => (req.method === 'GET' ? { config: lerConfig(), arquivoConfig } : salvarConfig(corpo)), { escrita: true });
rota('quadros', async () => ({ quadros: lerConfig().quadros }));
rota('quadro', async (corpo) => ({ quadro: salvarQuadro(corpo) }), { escrita: true });
rota('quadro-excluir', excluirQuadro, { escrita: true });
rota('item', aplicar, { escrita: true });
rota('item-excluir', excluirItem, { escrita: true });
rota('status', async () => {
  const config = lerConfig();
  const arquivo = await arquivoTarefas(config);
  return { up: true, arquivo, quadros: config.quadros.length, items: fs.existsSync(arquivo) ? lerTarefas(arquivo).items.length : 0 };
});
p.route('dashboard/ajuda', async () => Plugin.reply(200, fs.readFileSync(path.join(AQUI, 'AGENTES.md')), { 'content-type': 'text/markdown; charset=utf-8' }));

p.run().once('listening', async () => {
  const arquivo = await arquivoTarefas();
  console.log(`  Dashboard: ${arquivo} (${fs.existsSync(arquivo) ? lerTarefas(arquivo).items.length + ' tarefa(s)' : 'ainda não existe'})`);
});
