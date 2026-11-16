// Testes dos nós do Automator (sem rede: as transformações respondem por uma função falsa): node tests/automator.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { novoGrafo, roteiro, resumir, comoInvestigacao, alertasDe, baseDominio } from '../lib/automator.mjs';
import { chave, TIPOS } from '../lib/entidades.mjs';
import { MAQUINAS } from '../lib/maquinas.mjs';
import { TRANSFORMACOES } from '../lib/transformacoes.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
let ok = 0;
const casos = [];
const caso = (nome, fn) => casos.push([nome, fn]);
const ent = (tipo, valor, extra = {}) => ({ tipo, valor, id: chave(tipo, valor), ...extra });
const NOMES = { 'dns-ip': { nome: 'IPs', de: ['dominio'] }, internetdb: { nome: 'Portas', de: ['ip'] }, subdominios: { nome: 'Subdomínios', de: ['dominio'] } };

caso('roteiro: encadeia, respeita max, escopo e liga as entidades', async () => {
  const semente = ent('dominio', 'exemplo.com.br');
  const g = novoGrafo(semente);
  const chamadas = [];
  const transformar = async (t, n) => {
    chamadas.push(t + ' ' + n.valor);
    if (t === 'subdominios') return { entidades: [ent('dominio', 'www.exemplo.com.br'), ent('dominio', 'cdn.terceiro.com')] };
    if (t === 'dns-ip') return { entidades: [ent('ip', n.valor === 'exemplo.com.br' ? '203.0.113.10' : '203.0.113.11', { ligacao: 'resolve para' })] };
    if (t === 'internetdb') return { entidades: [ent('porta', n.valor + ':3389', { alerta: true })], props: { Portas: '3389' }, alerta: true };
    throw new Error('inesperado ' + t);
  };
  const r = await roteiro(g, g.nos.get(semente.id), [{ t: 'subdominios', max: 1 }, { t: 'dns-ip', max: 5 }, { t: 'internetdb', max: 1 }], { escopo: true, transformar, nomes: NOMES });
  assert.deepEqual(r.erros, []);
  assert.equal(r.foraDoEscopo, 1, 'cdn.terceiro.com fica fora do escopo');
  assert.ok(!chamadas.includes('dns-ip cdn.terceiro.com'));
  assert.equal(chamadas.filter((c) => c.startsWith('internetdb')).length, 1, 'max: 1');
  const s = resumir(g, semente, TIPOS, { roteiro: 'teste' });
  assert.equal(s.semente.valor, 'exemplo.com.br');
  assert.equal(s.contagem.ip, 2);
  assert.equal(s.tem_alerta, true);
  assert.ok(s.alertas.some((a) => a.tipo === 'porta'));
  assert.ok(s.ligacoes.some((l) => l.de === 'exemplo.com.br' && l.para === '203.0.113.10' && l.como === 'resolve para'));
  assert.equal(s.roteiro, 'teste');
});

caso('roteiro: uma transformação que falha não derruba as outras', async () => {
  const semente = ent('dominio', 'exemplo.com');
  const g = novoGrafo(semente);
  const r = await roteiro(g, g.nos.get(semente.id), [{ t: 'subdominios' }, { t: 'dns-ip' }, { t: 'nao-existe' }], {
    nomes: NOMES,
    transformar: async (t) => { if (t === 'subdominios') throw new Error('crt.sh fora do ar'); return { entidades: [ent('ip', '198.51.100.1')], aviso: 'só um IP' }; },
  });
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0], /crt\.sh fora do ar/);
  assert.ok(r.avisos.some((a) => /nao-existe/.test(a)));
  assert.ok(r.avisos.some((a) => /só um IP/.test(a)));
  assert.equal(r.novas, 1);
});

caso('investigação gravada abre na tela: nós e ligações no formato dela', () => {
  const semente = ent('ip', '8.8.8.8');
  const g = novoGrafo(semente);
  const inv = comoInvestigacao(g, '');
  assert.equal(inv.versao, 1);
  assert.match(inv.id, /^[a-z0-9]{4,}$/);
  assert.match(inv.nome, /^Automator /);
  assert.deepEqual(Object.keys(inv.nos[0]).sort(), ['alerta', 'cor', 'criado', 'feitas', 'fixo', 'id', 'notas', 'props', 'rotulo', 'tipo', 'valor']);
});

caso('alertasDe: saída de Investigar, lista solta e lixo', () => {
  assert.equal(alertasDe({ alertas: [{ valor: 'x' }] }).length, 1);
  assert.equal(alertasDe({ semente: { valor: 'a', alerta: true }, entidades: [{ valor: 'b', alerta: true }, { valor: 'c' }] }).length, 2);
  assert.equal(alertasDe([{ alerta: true }, {}]).length, 1);
  assert.deepEqual(alertasDe('texto'), []);
  assert.deepEqual(alertasDe(null), []);
});

caso('baseDominio igual ao da tela', () => {
  assert.equal(baseDominio('www.loja.exemplo.com.br'), 'exemplo.com.br');
  assert.equal(baseDominio('api.exemplo.com'), 'exemplo.com');
});

caso('máquinas e roteiros só usam transformações que existem', () => {
  const ids = new Set(TRANSFORMACOES.map((t) => t.id));
  for (const m of MAQUINAS) for (const p of m.passos) assert.ok(ids.has(p.t), `${m.id}: ${p.t}`);
});

caso('automator.json: campos válidos e programa existente', () => {
  const j = JSON.parse(fs.readFileSync(path.join(aqui, '..', 'automator.json'), 'utf8'));
  const tipos = new Set();
  for (const n of j.nodes) {
    assert.ok(!tipos.has(n.type), 'tipo repetido ' + n.type); tipos.add(n.type);
    assert.ok(n.name && n.category && n.desc && n.expects && n.returns, n.type);
    for (const f of n.fields) assert.ok(Object.hasOwn(n.params, f.name), `${n.type}.${f.name} sem valor em params`);
    assert.ok(fs.existsSync(path.join(aqui, '..', n.run.args[0])));
  }
  assert.deepEqual([...tipos].sort(), ['alertas', 'extrair', 'identificar', 'investigar', 'transformar']);
});

caso('no.mjs: Tem alerta? sai pela porta certa sem precisar do servidor', () => {
  const rodar = (input) => JSON.parse(spawnSync(process.execPath, [path.join(aqui, '..', 'no.mjs')], { input: JSON.stringify({ node: 'alertas', params: { dados: '' }, input, data: '' }), encoding: 'utf8' }).stdout);
  const sim = rodar({ semente: { valor: 'exemplo.com' }, alertas: [{ tipo: 'cve', valor: 'CVE-2024-3400', alerta: true }] });
  assert.equal(sim.port, 'true'); assert.equal(sim.value.quantos, 1); assert.equal(sim.value.semente, 'exemplo.com');
  const nao = rodar({ alertas: [] });
  assert.equal(nao.port, 'false'); assert.equal(nao.value.tem_alerta, false);
});

caso('no.mjs: sem o servidor rodando, um erro que explica o que fazer', () => {
  const r = spawnSync(process.execPath, [path.join(aqui, '..', 'no.mjs')], { input: JSON.stringify({ node: 'investigar', params: {}, input: 'exemplo.com', data: path.join(aqui, 'nao-existe') }), encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /não está rodando/);
});

for (const [nome, fn] of casos) {
  try { await fn(); ok++; } catch (e) { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }
}
console.log(`${ok}/${casos.length} testes do Automator passaram`);
