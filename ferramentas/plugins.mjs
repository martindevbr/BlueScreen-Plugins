#!/usr/bin/env node
// Ferramenta do repositório de plugins (Node.js 18+, sem dependências). É ela que define o padrão: o que ela recusa,
// o CI recusa, e a loja do BlueScreen nunca recebe um plugin fora do padrão.
//
//   node ferramentas/plugins.mjs validar [id...]        confere manifesto, README, ícone, nós, sintaxe e segredos
//   node ferramentas/plugins.mjs testes [id...]         roda os testes de cada plugin (tests/*.test.mjs)
//   node ferramentas/plugins.mjs gerar [--conferir]     refaz a ficha dos READMEs e a tabela do README da raiz
//   node ferramentas/plugins.mjs versoes [--base <ref>] plugin com código mudado precisa de versão maior que na base
//   node ferramentas/plugins.mjs novo <id> --nome "Nome" --autor "Fulano" [--categoria x] [--servidor]
//   node ferramentas/plugins.mjs tudo                   validar + testes + gerar --conferir (o que o CI roda)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGINS = path.join(RAIZ, 'plugins');
const MODELO = path.join(RAIZ, 'modelo-de-plugin');

// categorias da loja: a chave vai no plugin.json, o nome aparece no README e na IDE
export const CATEGORIAS = {
  ia: 'Inteligência artificial',
  desenvolvimento: 'Desenvolvimento',
  qualidade: 'Qualidade e testes',
  produtividade: 'Produtividade',
  integracoes: 'Integrações',
  midia: 'Música e mídia',
  aparencia: 'Aparência',
  outros: 'Outros',
};
// licenças permissivas aceitas (as mesmas que o BlueScreen aceita em dependências) e NOASSERTION: autor ainda não disse
export const LICENCAS = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Zlib', '0BSD', 'Unlicense', 'NOASSERTION'];
const CAMPOS = new Set(['id', 'name', 'description', 'version', 'author', 'license', 'category', 'keywords', 'contributors', 'minBlueScreen',
  'icon', 'order', 'server', 'requires', 'hooks', 'settings', 'vault']);
const TIPOS_CONFIG = new Set(['text', 'number', 'bool', 'select', 'password', 'textarea', 'folder', 'file', 'color']);
const MAX_ARQUIVO = 64 << 20; // limite da loja (remote.rs)
const AVISO_PACOTE = 5 << 20;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const MARCA_INICIO = '<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->';
const MARCA_FIM = '<!-- ficha:fim -->';
const SECOES = ['Como usar', 'Autor e licença', 'Histórico de versões'];
// arquivos que não mudam o que a IDE instala de forma relevante: mexer só neles não pede versão nova
const SO_DOCUMENTACAO = (rel) => /^(README\.md|CHANGELOG\.md|docs\/|tests\/)/.test(rel);
// campos do plugin.json que só descrevem o plugin (a loja lê do repositório): mudar só eles não pede versão nova
const SO_METADADOS = new Set(['description', 'author', 'license', 'category', 'keywords', 'contributors', 'minBlueScreen']);
const PROIBIDOS = [/(^|\/)node_modules\//, /(^|\/)\.origin\.json$/, /(^|\/)\.env(\.|$)/, /\.(pem|key|pfx|p12)$/i, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/];
const SEGREDOS = [
  [/ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,}/, 'token do GitHub'],
  [/sk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}/, 'chave de API (OpenAI/Anthropic)'],
  [/AKIA[0-9A-Z]{16}/, 'chave de acesso da AWS'],
  [/xox[abprs]-[A-Za-z0-9-]{10,}/, 'token do Slack'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'chave privada'],
];

// ---------- leitura ----------
const lerTexto = (f) => fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
function arquivosDe(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.name === '.git') continue;
    if (e.isDirectory()) out.push(...arquivosDe(dir, r));
    else if (e.isFile()) out.push(r);
  }
  return out.sort();
}
export function ids() {
  if (!fs.existsSync(PLUGINS)) return [];
  return fs.readdirSync(PLUGINS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
}
export function carregar(id) {
  const dir = path.join(PLUGINS, id);
  const p = { id, dir, arquivos: arquivosDe(dir), manifesto: null, erroManifesto: '', nos: [], erroNos: '', readme: null };
  try { p.manifesto = JSON.parse(lerTexto(path.join(dir, 'plugin.json'))); } catch (e) { p.erroManifesto = fs.existsSync(path.join(dir, 'plugin.json')) ? 'plugin.json não é um JSON válido: ' + e.message : 'falta o plugin.json'; }
  if (p.arquivos.includes('automator.json')) {
    try { const a = JSON.parse(lerTexto(path.join(dir, 'automator.json'))); p.nos = Array.isArray(a.nodes) ? a.nodes : null; if (!p.nos) p.erroNos = 'automator.json precisa de uma lista "nodes"'; }
    catch (e) { p.erroNos = 'automator.json não é um JSON válido: ' + e.message; }
  }
  if (p.arquivos.includes('README.md')) p.readme = lerTexto(path.join(dir, 'README.md'));
  return p;
}

// ---------- o que a ficha mostra ----------
export function runtime(m, arquivos) {
  const s = typeof m.server === 'string' ? m.server : '';
  const tem = (ext) => s.endsWith(ext) || arquivos.includes('server' + ext);
  if (m.server && typeof m.server === 'object') return String(m.server.command || 'programa próprio');
  if (tem('.js') || tem('.mjs') || tem('.cjs')) return 'Node.js 18+';
  if (tem('.py')) return 'Python 3.8+';
  if (tem('.ps1')) return 'PowerShell';
  if (arquivos.includes('server.exe')) return '';
  return '';
}
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
export function ficha(p) {
  const m = p.manifesto, linhas = [];
  linhas.push(['Autor', [m.author, ...(m.contributors || [])].filter(Boolean).join(', ')]);
  linhas.push(['Versão', m.version]);
  linhas.push(['Licença', m.license === 'NOASSERTION' ? 'a definir pelo autor' : m.license]);
  linhas.push(['Categoria', CATEGORIAS[m.category] || m.category]);
  const precisa = [];
  if (m.minBlueScreen) precisa.push(`BlueScreen ${m.minBlueScreen} ou mais novo`);
  const rt = runtime(m, p.arquivos); if (rt) precisa.push(rt);
  for (const r of m.requires || []) precisa.push(`plugin \`${r}\``);
  linhas.push(['Precisa de', precisa.join(' · ') || 'nada além do BlueScreen']);
  if (p.nos && p.nos.length) {
    const cats = [...new Set(p.nos.map((n) => n.category).filter(Boolean))];
    linhas.push(['Automator', `${p.nos.length} ${p.nos.length === 1 ? 'nó' : 'nós'}${cats.length ? ` (categoria ${cats.join(', ')})` : ''}`]);
  }
  linhas.push(['Código', `[plugins/${p.id}](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/${p.id})`]);
  return [MARCA_INICIO, '| | |', '|---|---|', ...linhas.map(([k, v]) => `| **${k}** | ${esc(v)} |`), MARCA_FIM].join('\n');
}
// põe (ou troca) a ficha logo abaixo do título
export function comFicha(readme, p) {
  const nova = ficha(p);
  const i = readme.indexOf(MARCA_INICIO.slice(0, 18)), f = readme.indexOf(MARCA_FIM);
  if (i >= 0 && f > i) return readme.slice(0, i) + nova + readme.slice(f + MARCA_FIM.length);
  const linhas = readme.split('\n');
  const t = linhas.findIndex((l) => /^# /.test(l));
  linhas.splice(t + 1, 0, '', nova);
  return linhas.join('\n').replace(/\n{3,}/g, '\n\n');
}

// ---------- validar ----------
export function validar(p) {
  const erros = [], avisos = [], m = p.manifesto;
  const e = (t) => erros.push(t), a = (t) => avisos.push(t);
  if (!ID.test(p.id)) e(`o nome da pasta "${p.id}" não serve de id (minúsculas, números e hífen, começando por letra ou número)`);
  if (!m) { e(p.erroManifesto); return { erros, avisos }; }
  if (typeof m !== 'object' || Array.isArray(m)) { e('plugin.json precisa ser um objeto'); return { erros, avisos }; }

  // manifesto
  const texto = (k, max) => { const v = m[k]; if (typeof v !== 'string' || !v.trim()) { e(`plugin.json: falta "${k}"`); return ''; } if (max && v.length > max) e(`plugin.json: "${k}" passa de ${max} caracteres (${v.length})`); return v; };
  if (m.id !== p.id) e(`plugin.json: "id" (${JSON.stringify(m.id)}) precisa ser igual ao nome da pasta (${p.id}); sem isso a loja ignora o plugin`);
  texto('name', 40);
  const desc = texto('description', 300);
  if (desc && !/[.!?)]$/.test(desc.trim())) a('plugin.json: termine a "description" com ponto');
  if (texto('version') && !SEMVER.test(m.version)) e(`plugin.json: "version" precisa ser X.Y.Z (está ${m.version})`);
  texto('author', 80);
  if (!m.license) e(`plugin.json: falta "license" (uma destas: ${LICENCAS.join(', ')})`);
  else if (!LICENCAS.includes(m.license)) e(`plugin.json: licença "${m.license}" não aceita; use uma destas: ${LICENCAS.join(', ')}`);
  else if (m.license === 'NOASSERTION') a('licença ainda não definida pelo autor (NOASSERTION): ninguém pode reaproveitar o código até ele escolher');
  if (!m.category) e(`plugin.json: falta "category" (${Object.keys(CATEGORIAS).join(', ')})`);
  else if (!CATEGORIAS[m.category]) e(`plugin.json: categoria "${m.category}" não existe; use ${Object.keys(CATEGORIAS).join(', ')}`);
  if (m.keywords !== undefined && !(Array.isArray(m.keywords) && m.keywords.every((k) => typeof k === 'string' && k.trim()) && m.keywords.length <= 12)) e('plugin.json: "keywords" é uma lista de até 12 palavras');
  if (m.contributors !== undefined && !(Array.isArray(m.contributors) && m.contributors.every((k) => typeof k === 'string' && k.trim()))) e('plugin.json: "contributors" é uma lista de nomes');
  if (m.minBlueScreen !== undefined && !(typeof m.minBlueScreen === 'string' && SEMVER.test(m.minBlueScreen))) e('plugin.json: "minBlueScreen" precisa ser X.Y.Z');
  if (m.order !== undefined && typeof m.order !== 'number') e('plugin.json: "order" é um número');
  if (m.requires !== undefined && !(Array.isArray(m.requires) && m.requires.every((r) => typeof r === 'string' && ID.test(r)))) e('plugin.json: "requires" é uma lista de ids de plugin');
  for (const k of Object.keys(m)) if (!CAMPOS.has(k)) a(`plugin.json: campo "${k}" desconhecido (erro de digitação?)`);
  if (Array.isArray(m.settings)) {
    const vistas = new Set();
    m.settings.forEach((s, i) => {
      if (!s || typeof s.key !== 'string' || !s.key) return e(`plugin.json: settings[${i}] sem "key"`);
      if (vistas.has(s.key)) e(`plugin.json: a configuração "${s.key}" aparece duas vezes`); vistas.add(s.key);
      if (!s.label) e(`plugin.json: a configuração "${s.key}" não tem "label"`);
      if (s.type && !TIPOS_CONFIG.has(s.type)) a(`plugin.json: a configuração "${s.key}" tem tipo "${s.type}" desconhecido`);
    });
  } else if (m.settings !== undefined) e('plugin.json: "settings" é uma lista');

  // arquivos
  const tem = (f) => p.arquivos.includes(f);
  const icone = typeof m.icon === 'string' ? m.icon : ['icon.svg', 'icon.png'].find(tem);
  if (!icone) a('sem ícone: a loja desenha as iniciais (ponha um icon.svg quadrado)');
  else if (!tem(icone)) e(`plugin.json: o ícone "${icone}" não existe na pasta`);
  else {
    const t = fs.statSync(path.join(p.dir, icone)).size;
    if (t > 64 * 1024) e(`o ícone ${icone} passa de 64 KB (${Math.round(t / 1024)} KB): a loja não mostra`);
    if (!/\.(svg|png|jpe?g|webp)$/i.test(icone)) e(`o ícone ${icone} precisa ser SVG, PNG, JPG ou WebP`);
  }
  if (typeof m.server === 'string' && !tem(m.server)) e(`plugin.json: o servidor "${m.server}" não existe na pasta`);
  if (!tem('ui.js') && !m.server && !p.arquivos.some((f) => /^server\.(exe|js|mjs|cjs|py|ps1)$/.test(f)) && !tem('automator.json') && !tem('style.css')) e('o plugin não tem nada para carregar (ui.js, style.css, servidor ou automator.json)');
  let total = 0;
  for (const f of p.arquivos) {
    const caminho = path.join(p.dir, f), t = fs.statSync(caminho).size; total += t;
    if (PROIBIDOS.some((r) => r.test(f))) e(`${f}: este arquivo não vai para o repositório`);
    if (t > MAX_ARQUIVO) e(`${f}: passa de 64 MB, o limite da loja`);
    if (t < 2 << 20 && /\.(m?js|cjs|json|md|py|ps1|css|html|txt|ya?ml|toml|ts)$/i.test(f)) {
      const c = fs.readFileSync(caminho, 'utf8');
      for (const [r, nome] of SEGREDOS) if (r.test(c)) e(`${f}: parece ter um segredo (${nome}); tire do código e use plugin.secrets ou o cofre`);
    }
  }
  if (total > AVISO_PACOTE) a(`o pacote tem ${(total / 1048576).toFixed(1)} MB: a loja baixa tudo junto, prefira menos de 5 MB`);

  // sintaxe: ui.js roda dentro de function (bs, plugin) { ... }; os módulos passam pelo node --check
  for (const f of p.arquivos.filter((f) => /\.(js|mjs|cjs)$/.test(f) && !f.includes('/vendor/'))) {
    const caminho = path.join(p.dir, f);
    if (f === 'ui.js') {
      try { new vm.Script(`(function (bs, plugin) {\n${fs.readFileSync(caminho, 'utf8')}\n})`, { filename: f }); }
      catch (x) { e(`${f}: erro de sintaxe: ${x.message}`); }
    } else {
      const r = spawnSync(process.execPath, ['--check', caminho], { encoding: 'utf8' });
      if (r.status !== 0) e(`${f}: erro de sintaxe: ${(r.stderr || '').trim().split('\n').filter((l) => /Error/.test(l))[0] || 'veja node --check'}`);
    }
  }

  // nós do Automator
  if (p.erroNos) e(p.erroNos);
  else if (p.nos) {
    const tipos = new Set();
    p.nos.forEach((n, i) => {
      const nome = n && n.type ? `nó "${n.type}"` : `nó ${i + 1}`;
      for (const k of ['type', 'name', 'category', 'desc']) if (!n || typeof n[k] !== 'string' || !n[k].trim()) e(`automator.json: ${nome} sem "${k}"`);
      if (n && n.type) { if (tipos.has(n.type)) e(`automator.json: o tipo "${n.type}" aparece duas vezes`); tipos.add(n.type); }
      if (n && !n.run) e(`automator.json: ${nome} sem "run" (o programa que roda o nó)`);
      for (const c of (n && n.fields) || []) if (c.choicesFrom && !String(c.choicesFrom).startsWith(p.id + '/')) e(`automator.json: ${nome}: "choicesFrom" precisa apontar para uma rota deste plugin (${p.id}/...)`);
    });
    if (p.nos.some((n) => n.fields && n.fields.some((c) => c.choicesFrom)) && !m.minBlueScreen) a('automator.json usa "choicesFrom": declare "minBlueScreen": "2.1.33" (versão que trouxe as listas vindas de plugin)');
  }

  // README
  const r = p.readme;
  if (r === null) e('falta o README.md');
  else {
    const titulo = (r.match(/^# (.+)$/m) || [])[1];
    if (!titulo) e('README.md: falta o título (# Nome do plugin)');
    else if (m.name && titulo.trim() !== m.name.trim()) e(`README.md: o título "# ${titulo.trim()}" precisa ser o "name" do plugin.json ("${m.name}")`);
    if (!r.includes(MARCA_FIM)) e('README.md: falta a ficha (rode node ferramentas/plugins.mjs gerar)');
    else if (erros.length === 0 && comFicha(r, p) !== r) e('README.md: a ficha está desatualizada (rode node ferramentas/plugins.mjs gerar)');
    const secoes = [...r.matchAll(/^## (.+)$/gm)].map((x) => x[1].trim());
    const temSecao = (s) => secoes.some((x) => x.toLowerCase().startsWith(s.toLowerCase()));
    for (const s of SECOES) if (!temSecao(s)) e(`README.md: falta a seção "## ${s}"`);
    if (Array.isArray(m.settings) && m.settings.length && !temSecao('Configurações')) e('README.md: o plugin tem configurações; explique cada uma em "## Configurações"');
    if (p.nos && p.nos.length && !temSecao('Nós do Automator')) e('README.md: o plugin acrescenta nós; descreva em "## Nós do Automator"');
    const hist = r.split(/^## Histórico de versões.*$/m)[1];
    if (hist !== undefined && m.version && !new RegExp('^### ' + m.version.replace(/\./g, '\\.') + '\\b', 'm').test(hist)) e(`README.md: "## Histórico de versões" não tem a versão atual ("### ${m.version}")`);
    if (m.author && !(r.split(/^## Autor e licença.*$/m)[1] || '').includes(m.author)) e(`README.md: "## Autor e licença" precisa citar o autor (${m.author})`);
    if (/\]\((?!https?:|#|mailto:)([^)]+)\)/.test(r)) for (const [, alvo] of r.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) if (!tem(alvo.replace(/^\.\//, '').split('#')[0])) e(`README.md: o link "${alvo}" aponta para um arquivo que não existe na pasta`);
  }
  return { erros, avisos };
}

// ---------- tabela do README da raiz ----------
const TABELA_INICIO = '<!-- plugins:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->';
const TABELA_FIM = '<!-- plugins:fim -->';
export function tabela(lista) {
  const linhas = lista.map((p) => {
    const m = p.manifesto;
    return `| [${esc(m.name)}](plugins/${p.id}) | \`${p.id}\` | ${esc(CATEGORIAS[m.category] || m.category)} | ${esc(m.version)} | ${esc(m.author)} | ${esc(m.license === 'NOASSERTION' ? 'a definir' : m.license)} | ${esc(m.description)} |`;
  });
  return [TABELA_INICIO, '| Plugin | Pasta (id) | Categoria | Versão | Autor | Licença | O que faz |', '|---|---|---|---|---|---|---|', ...linhas, TABELA_FIM].join('\n');
}

// ---------- comandos ----------
const cor = process.stdout.isTTY && !process.env.NO_COLOR ? (c, t) => `\x1b[${c}m${t}\x1b[0m` : (c, t) => t;
const escolhidos = (args) => { const l = args.filter((x) => !x.startsWith('--')); const todos = ids(); for (const x of l) if (!todos.includes(x)) { console.error(`plugin desconhecido: ${x}`); process.exit(2); } return l.length ? l : todos; };

function cmdValidar(args) {
  let falhas = 0, nAvisos = 0;
  for (const id of escolhidos(args)) {
    const { erros, avisos } = validar(carregar(id));
    nAvisos += avisos.length;
    if (erros.length) falhas++;
    console.log(`${erros.length ? cor(31, '✗') : cor(32, '✓')} ${id}`);
    for (const x of erros) console.log('    ' + cor(31, 'erro: ') + x);
    for (const x of avisos) console.log('    ' + cor(33, 'aviso: ') + x);
  }
  console.log(falhas ? cor(31, `\n${falhas} plugin(s) fora do padrão.`) : cor(32, `\nTodos os plugins no padrão${nAvisos ? ` (${nAvisos} aviso(s))` : ''}.`));
  return falhas ? 1 : 0;
}

function cmdTestes(args) {
  let falhas = 0, rodados = 0;
  for (const id of escolhidos(args)) {
    const dir = path.join(PLUGINS, id, 'tests');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((f) => /\.test\.m?js$/.test(f)).sort()) {
      rodados++;
      const r = spawnSync(process.execPath, [path.join(dir, f)], { cwd: path.join(PLUGINS, id), encoding: 'utf8', timeout: 300000 });
      const ok = r.status === 0;
      if (!ok) falhas++;
      console.log(`${ok ? cor(32, '✓') : cor(31, '✗')} ${id}/tests/${f}${ok ? '' : '\n' + (r.stdout + r.stderr).trim().replace(/^/gm, '    ')}`);
    }
  }
  console.log(falhas ? cor(31, `\n${falhas} de ${rodados} arquivo(s) de teste falharam.`) : `\n${rodados} arquivo(s) de teste passaram.`);
  return falhas ? 1 : 0;
}

function cmdGerar(args) {
  const conferir = args.includes('--conferir');
  const lista = ids().map(carregar).filter((p) => p.manifesto && validar({ ...p, readme: null }).erros.filter((x) => !x.startsWith('falta o README')).length === 0);
  const mudou = [];
  for (const p of lista) {
    if (p.readme === null || !/^# /m.test(p.readme)) continue;
    const novo = comFicha(p.readme, p);
    if (novo !== p.readme) { mudou.push(`plugins/${p.id}/README.md`); if (!conferir) fs.writeFileSync(path.join(p.dir, 'README.md'), novo); }
  }
  const arqRaiz = path.join(RAIZ, 'README.md');
  const raiz = lerTexto(arqRaiz), i = raiz.indexOf(TABELA_INICIO.slice(0, 20)), f = raiz.indexOf(TABELA_FIM);
  if (i < 0 || f < i) { console.error('README.md da raiz: faltam as marcas da tabela de plugins'); return 1; }
  const novaRaiz = raiz.slice(0, i) + tabela(lista) + raiz.slice(f + TABELA_FIM.length);
  if (novaRaiz !== raiz) { mudou.push('README.md'); if (!conferir) fs.writeFileSync(arqRaiz, novaRaiz); }
  if (conferir && mudou.length) { console.log(cor(31, 'Arquivos gerados desatualizados (rode node ferramentas/plugins.mjs gerar e commite):\n') + mudou.map((x) => '  ' + x).join('\n')); return 1; }
  console.log(mudou.length ? `Atualizados:\n${mudou.map((x) => '  ' + x).join('\n')}` : 'Fichas e tabela em dia.');
  return 0;
}

const git = (...a) => spawnSync('git', ['-C', RAIZ, ...a], { encoding: 'utf8' });
export function compararVersao(a, b) {
  const k = (v) => String(v).split('-')[0].split('.').map(Number);
  const [x, y] = [k(a), k(b)];
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  return 0;
}
function cmdVersoes(args) {
  const i = args.indexOf('--base'), base = i >= 0 ? args[i + 1] : 'origin/main';
  const mb = git('merge-base', base, 'HEAD');
  if (mb.status !== 0) { console.error(`não achei a base "${base}" no git: ${mb.stderr.trim()}`); return 2; }
  const ref = mb.stdout.trim();
  const mudados = git('diff', '--name-only', ref, '--', 'plugins/').stdout.split('\n').filter(Boolean);
  const porPlugin = new Map();
  for (const f of mudados) { const [, id, ...resto] = f.split('/'); if (!porPlugin.has(id)) porPlugin.set(id, []); porPlugin.get(id).push(resto.join('/')); }
  let falhas = 0;
  for (const [id, arqs] of porPlugin) {
    if (!fs.existsSync(path.join(PLUGINS, id, 'plugin.json'))) { console.log(`- ${id}: removido`); continue; }
    const antes = git('show', `${ref}:plugins/${id}/plugin.json`);
    if (antes.status !== 0) { console.log(`${cor(32, '✓')} ${id}: plugin novo`); continue; }
    const vAntes = (() => { try { return JSON.parse(antes.stdout.replace(/^﻿/, '')).version; } catch { return '0.0.0'; } })();
    const vAgora = carregar(id).manifesto?.version || '0.0.0';
    let codigo = arqs.filter((f) => !SO_DOCUMENTACAO(f));
    if (codigo.includes('plugin.json')) {
      let mAntes = {}; try { mAntes = JSON.parse(antes.stdout.replace(/^﻿/, '')); } catch {}
      const mAgora = carregar(id).manifesto || {};
      const chaves = new Set([...Object.keys(mAntes), ...Object.keys(mAgora)]);
      const soMeta = [...chaves].every((k) => SO_METADADOS.has(k) || JSON.stringify(mAntes[k]) === JSON.stringify(mAgora[k]));
      if (soMeta) codigo = codigo.filter((f) => f !== 'plugin.json');
    }
    if (!codigo.length) { console.log(`${cor(32, '✓')} ${id}: só documentação, testes ou metadados (a versão pode ficar)`); continue; }
    if (compararVersao(vAgora, vAntes) > 0) console.log(`${cor(32, '✓')} ${id}: ${vAntes} → ${vAgora}`);
    else { falhas++; console.log(`${cor(31, '✗')} ${id}: mudou ${codigo.slice(0, 5).join(', ')}${codigo.length > 5 ? '…' : ''} sem subir a versão (está ${vAgora}). Sem versão maior, a IDE de ninguém avisa da atualização.`); }
  }
  if (!porPlugin.size) console.log('Nenhum plugin mudou.');
  return falhas ? 1 : 0;
}

function cmdNovo(args) {
  const id = args.find((x) => !x.startsWith('--'));
  const opt = (k, padrao) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : padrao; };
  if (!id || !ID.test(id)) { console.error('uso: node ferramentas/plugins.mjs novo <id> --nome "Nome" --autor "Seu nome" [--categoria produtividade] [--servidor]\n  o id usa minúsculas, números e hífen'); return 2; }
  const destino = path.join(PLUGINS, id);
  if (fs.existsSync(destino)) { console.error(`plugins/${id} já existe`); return 2; }
  const nome = opt('nome', id), autor = opt('autor', ''), categoria = opt('categoria', 'outros');
  if (!autor) { console.error('informe o autor: --autor "Seu nome"'); return 2; }
  if (!CATEGORIAS[categoria]) { console.error(`categoria desconhecida; use ${Object.keys(CATEGORIAS).join(', ')}`); return 2; }
  const servidor = args.includes('--servidor');
  const trocar = (t) => t.replaceAll('{{id}}', id).replaceAll('{{nome}}', nome).replaceAll('{{autor}}', autor).replaceAll('{{categoria}}', categoria).replaceAll('{{ano}}', String(new Date().getFullYear()));
  for (const f of arquivosDe(MODELO)) {
    if (!servidor && f === 'server.mjs') continue;
    const alvo = path.join(destino, f);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    let t = trocar(lerTexto(path.join(MODELO, f)));
    if (f === 'plugin.json') { const m = JSON.parse(t); if (!servidor) delete m.server; t = JSON.stringify(m, null, 2) + '\n'; }
    fs.writeFileSync(alvo, t);
  }
  const p = carregar(id);
  fs.writeFileSync(path.join(destino, 'README.md'), comFicha(p.readme, p));
  cmdGerar([]);
  console.log(`\nCriado em plugins/${id}. Próximos passos:\n  1. teste na IDE: BLUESCREEN_PLUGIN_REPO=${RAIZ} (a loja lê daqui) ou copie a pasta para ~/.bluescreen/plugins/${id}\n  2. escreva o README (Como usar, Autor e licença, Histórico de versões)\n  3. node ferramentas/plugins.mjs tudo, e abra o pull request`);
  return 0;
}

const COMANDOS = {
  validar: cmdValidar, testes: cmdTestes, gerar: cmdGerar, versoes: cmdVersoes, novo: cmdNovo,
  tudo: (a) => { const v = cmdValidar(a); console.log(''); const t = cmdTestes(a); console.log(''); const g = cmdGerar(['--conferir']); return v || t || g; },
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (!COMANDOS[cmd]) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(3, 10).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(cmd ? 2 : 0); }
  process.exitCode = COMANDOS[cmd](args);
}
