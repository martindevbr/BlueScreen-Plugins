// Testes do AllRecording: node tests/basico.test.mjs (o CI roda todos os tests/*.test.mjs de cada plugin)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(dir, 'ui.js'), 'utf8');

// 1) o ui.js roda com uma IDE de mentira e registra painel, tela, status, atalho e ações
const reg = { tools: [], pages: [], actions: [], keys: [], status: [] };
const vazio = async () => ({});
const plugin = {
  settings: { get: async () => ({}), onChange() {}, open() {} },
  files: { list: async () => [], read: vazio, write: vazio, remove: vazio, exists: async () => false, url: (p) => p },
  info: async () => ({ filesDir: 'C:/dados/files' }), exec: vazio, spawn: vazio, onUnload(fn) { this.sair = fn; },
};
const el = () => ({ addEventListener() {}, replaceChildren() {}, classList: { add() {}, toggle() {} }, querySelector: () => null, set innerHTML(v) { this.html = v; } });
const bs = {
  $: () => el(), esc: (s) => String(s), toast() {}, api: vazio,
  tools: { register: (x) => reg.tools.push(x) }, pages: { register: (x) => reg.pages.push(x), open() {} },
  status: { add: (x) => (reg.status.push(x), el()) }, keys: { add: (k) => reg.keys.push(k) }, actions: { add: (l) => reg.actions.push(...l) },
};
const antes = { document: globalThis.document, window: globalThis.window };
globalThis.document = { createElement: el, activeElement: null };
globalThis.window = { addEventListener() {}, removeEventListener() {} };
new Function('bs', 'plugin', src)(bs, plugin);
assert.equal(reg.tools[0].id, 'allrecording');
assert.equal(reg.tools[0].page, 'allrecording');
assert.equal(reg.pages[0].id, 'allrecording');
assert.ok(reg.pages[0].pinned);
assert.deepEqual(reg.keys, ['Ctrl+Alt+M']);
assert.ok(reg.actions.length >= 3 && reg.actions.every((a) => a.label.startsWith('AllRecording: ')));

// 2) a tela inicial sempre lembra de pedir permissão, e o botão de gravar só pergunta: quem grava é o "Sim"
const pagina = el(); reg.pages[0].render(pagina);
assert.match(pagina.html, /Antes de gravar, peça permissão/);
assert.match(pagina.html, /Copiar aviso para o chat/);
assert.match(src, /if \(q\('\.gr-rec'\)\) return pedirGravar\(\);/);
assert.match(src, /if \(q\('\.gr-sim'\)\) return iniciar\(\);/);
assert.equal((src.match(/(?<!function )\biniciar\(\)/g) || []).length, 1, 'iniciar() só pode ser chamado pela confirmação');

// 3) o script de transcrição embutido é Python válido
const py = /const PY_TRANSCREVER = `([\s\S]*?)`;/.exec(src)[1].replace(/\\\\/g, '\\');
const tmp = path.join(os.tmpdir(), 'allrecording-teste.py');
fs.writeFileSync(tmp, py);
const r = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read())', tmp], { encoding: 'utf8' });
fs.rmSync(tmp, { force: true });
if (r.error) console.log('(sem Python: o script de transcrição não foi conferido)');
else assert.equal(r.status, 0, r.stderr);

plugin.sair(); // para o relógio da barra de baixo
console.log('testes do AllRecording passaram');
