// Testes do Proxy4Auto: node tests/basico.test.mjs
// Sem o proxy de verdade: um painel falso (as mesmas rotas /api/... do localhost-proxy) e um "proxy" falso que
// responde na porta da rota. Nada toca no hosts, no DNS nem num proxy que esteja rodando neste PC.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SCRIPTS, psTexto } from '../lib/admin.mjs';
import { semBlocoDoProxy, lerAlvo, acharRota, sugerirNome, normalizarDestino, paraLocal, paraOriginal, conferirDisfarce, trafego, painelValido, baseDominio } from '../lib/proxy.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0;
const casos = [];
const caso = (nome, fn) => casos.push([nome, fn]);

// ---------- lógica ----------
caso('lerAlvo: nome, nome:porta, URL local, tcp', () => {
  assert.deepEqual(lerAlvo('localhost-api'), { tipo: 'http', nome: 'localhost-api', porta: null });
  assert.deepEqual(lerAlvo('Localhost-API:6544'), { tipo: 'http', nome: 'localhost-api', porta: 6544 });
  assert.equal(lerAlvo('http://localhost-api:6544/x?y=1').porta, 6544);
  assert.equal(lerAlvo('http://localhost-api/x').porta, 80);
  assert.deepEqual(lerAlvo('tcp 5433'), { tipo: 'tcp', porta: 5433 });
  assert.deepEqual(lerAlvo('tcp:5433'), { tipo: 'tcp', porta: 5433 });
  assert.equal(lerAlvo(''), null);
  assert.equal(lerAlvo('nome com espaço'), null);
});
const ROTAS = [
  { tipo: 'http', id: 'localhost-api:80', nome: 'localhost-api', porta: 80, local: 'http://localhost-api', destino: 'https://api.exemplo.com' },
  { tipo: 'http', id: 'localhost-api:6544', nome: 'localhost-api', porta: 6544, local: 'http://localhost-api:6544', destino: 'https://staging.exemplo.com' },
  { tipo: 'http', id: 'site:2111', nome: 'site', porta: 2111, local: 'http://site:2111', destino: 'https://www.loja.com.br' },
  { tipo: 'tcp', id: 'tcp:5433', porta: 5433, local: '127.0.0.1:5433', destino: '203.0.113.10:5432' },
];
caso('acharRota: porta padrão, porta única e TCP', () => {
  assert.equal(acharRota(ROTAS, lerAlvo('localhost-api'), 80).id, 'localhost-api:80');
  assert.equal(acharRota(ROTAS, lerAlvo('localhost-api:6544'), 80).id, 'localhost-api:6544');
  assert.equal(acharRota(ROTAS, lerAlvo('site'), 80).id, 'site:2111', 'só existe numa porta: é essa');
  assert.equal(acharRota(ROTAS, lerAlvo('tcp 5433'), 80).id, 'tcp:5433');
  assert.equal(acharRota(ROTAS, lerAlvo('nada'), 80), null);
});
caso('sugerirNome: tirado do destino e sem repetir', () => {
  assert.equal(sugerirNome('https://api.meucliente.com.br'), 'localhost-api-meucliente');
  assert.equal(sugerirNome('https://www.loja.com.br/'), 'localhost-loja');
  assert.equal(sugerirNome('brdid.com.br'), 'localhost-brdid');
  assert.equal(sugerirNome('http://203.0.113.10:8080'), 'localhost-servico');
  assert.equal(sugerirNome('https://loja.com', ['localhost-loja']), 'localhost-loja-2');
});
caso('normalizarDestino: http implícito e recusa o que o proxy não repassa', () => {
  assert.equal(normalizarDestino('203.0.113.10:8080').href, 'http://203.0.113.10:8080/');
  assert.throws(() => normalizarDestino('ftp://x.com'), /TCP/);
  assert.throws(() => normalizarDestino(''), /destino/);
  assert.throws(() => normalizarDestino('a b'), /espaços/);
});
caso('paraLocal e paraOriginal: caminho e busca vão junto; www é o mesmo site', () => {
  assert.equal(paraLocal('https://api.exemplo.com/v1/x?a=1#h', ROTAS).url, 'http://localhost-api/v1/x?a=1#h');
  assert.equal(paraLocal('https://loja.com.br/p', ROTAS).url, 'http://site:2111/p');
  assert.equal(paraLocal('http://api.exemplo.com/x', ROTAS), null, 'http não é https: outro destino');
  assert.equal(paraOriginal('http://localhost-api:6544/a', ROTAS, 80).url, 'https://staging.exemplo.com/a');
  assert.equal(paraOriginal('http://localhost-api/a', ROTAS, 80).url, 'https://api.exemplo.com/a');
  assert.equal(paraOriginal('https://google.com/', ROTAS, 80), null);
});
caso('painelValido: só este PC', () => {
  assert.equal(painelValido(''), 'http://127.0.0.1:7070');
  assert.equal(painelValido('http://localhost:7071'), 'http://127.0.0.1:7071');
  assert.throws(() => painelValido('http://192.168.0.10:7070'), /neste PC/);
});
caso('baseDominio: sufixo duplo e IP', () => {
  assert.equal(baseDominio('a.b.exemplo.com.br'), 'exemplo.com.br');
  assert.equal(baseDominio('127.0.0.1'), '127.0.0.1');
});
caso('conferirDisfarce: o que o proxy limpa e o que vaza', () => {
  const limpo = conferirDisfarce({ status: 200, headers: { server: 'mockflare', 'x-localhost-id': 'gru1', 'set-cookie': ['sid=1'] }, corpo: '<a href="http://localhost-site/x">x</a> <script src="https://cdnjs.cloudflare.com/a.js"></script>' }, 'https://www.exemplo.com');
  assert.equal(limpo.limpo, true);
  assert.ok(limpo.avisos.some((a) => /Cloudflare no corpo/.test(a.o_que)), 'cdnjs é aviso, não vazamento');
  const sujo = conferirDisfarce({ status: 200, headers: { server: 'cloudflare', 'x-vercel-id': 'gru1', location: 'https://exemplo.com/login', 'set-cookie': 'a=1; Domain=.exemplo.com; Secure' }, corpo: '{"u":"https:\\/\\/www.exemplo.com\\/x"} <img src="https://app.vercel.app/i.png">' }, 'https://www.exemplo.com');
  assert.equal(sujo.limpo, false);
  const o = sujo.vazamentos.map((v) => v.o_que).join(' | ');
  for (const t of ['Cloudflare', 'Vercel', 'domínio do destino', 'cookie preso', 'link para o destino']) assert.ok(o.includes(t), t + ' em: ' + o);
  const citado = conferirDisfarce({ status: 200, headers: {}, corpo: 'Copyright exemplo.com 2026' }, 'https://exemplo.com');
  assert.equal(citado.limpo, true);
  assert.ok(citado.avisos.some((a) => /nome do site/.test(a.o_que)));
});
caso('semBlocoDoProxy: tira só o bloco do proxy do hosts', () => {
  const h = '127.0.0.1 meu-site\r\n# >>> localhost-proxy (gerado automaticamente, nao edite este bloco)\r\n127.0.0.1\tlocalhost-api\r\n# <<< localhost-proxy\r\n10.0.0.1 nas\r\n';
  assert.equal(semBlocoDoProxy(h), '127.0.0.1 meu-site\r\n10.0.0.1 nas\r\n');
  assert.equal(semBlocoDoProxy('sem bloco\r\n'), 'sem bloco\r\n');
});
caso('sem .bat: o plugin não chama arquivo de lote', () => {
  const t = fs.readFileSync(path.join(RAIZ, 'nos.mjs'), 'utf8');
  assert.ok(!/['"][^'"]*\.(bat|cmd)['"]/i.test(t) && !/cmd\.exe/i.test(t), 'nos.mjs chama .bat ou cmd.exe');
});
caso('admin: scripts com caminhos escapados e sem .bat/.ps1', () => {
  assert.equal(psTexto("C:\\it's"), "'C:\\it''s'");
  const s = SCRIPTS.programa('C:\\saida.json', '', 'C:\\Program Files\\x.exe', ['com espaço', 'a'], 'C:\\P');
  assert.ok(s.includes("'\"com espaço\"'") && s.includes("-WorkingDirectory 'C:\\P'"), s);
  for (const k of ['dns_proxy', 'dns_restaurar']) { const x = SCRIPTS[k]('C:\\s.json', 'C:\\bk.json'); assert.ok(/Set-DnsClientServerAddress/.test(x) && /bk\.json/.test(x)); assert.ok(!/\.(bat|ps1)\b/i.test(x)); }
  assert.ok(SCRIPTS.dns_proxy('s', 'C:\\bk.json').includes("-not (Test-Path 'C:\\bk.json')"), 'não sobrescreve o DNS guardado');
});
caso('trafego: janela, rota, erros e tempos', () => {
  const agora = Date.parse('2026-11-16T12:00:00Z');
  const log = [
    { tipo: 'info', t: agora - 1000, texto: 'x' },
    { tipo: 'req', t: agora - 3 * 3600e3, rota: 'a:80', metodo: 'GET', caminho: '/velho', status: 200, ms: 5 },
    { tipo: 'req', t: agora - 60e3, rota: 'a:80', metodo: 'GET', caminho: '/1', status: 200, ms: 10 },
    { tipo: 'req', t: agora - 50e3, rota: 'a:80', metodo: 'POST', caminho: '/2', status: 502, ms: 900 },
    { tipo: 'req', t: agora - 40e3, rota: 'b:80', metodo: 'GET', caminho: '/3', status: 0, ms: 30 },
    { tipo: 'req', t: agora - 30e3, rota: 'a:80', metodo: 'GET', caminho: '/4', status: 404, ms: 20 },
  ];
  const t = trafego(log, { minutos: 60, agora });
  assert.equal(t.total, 4); assert.equal(t.erros, 2); assert.equal(t.nao_encontrados, 1); assert.equal(t.ms_maximo, 900);
  assert.equal(t.itens[0].caminho, '/4', 'a mais nova primeiro');
  assert.equal(trafego(log, { rota: 'a:80', soErros: true, minutos: 60, agora }).itens.map((x) => x.caminho).join(), '/4,/2');
  assert.equal(trafego(log, { agora }).total, 5);
});

// ---------- os nós, contra um painel falso ----------
function escutar(fn) { return new Promise((ok) => { const s = http.createServer(fn).listen(0, '127.0.0.1', () => ok(s)); }); }
const ler = (q) => new Promise((ok) => { let s = ''; q.on('data', (c) => (s += c)).on('end', () => ok(s ? JSON.parse(s) : {})); });
function no(painel, node, params = {}, input = null) {
  return new Promise((ok) => {
    const c = spawn(process.execPath, [path.join(RAIZ, 'nos.mjs')], { cwd: RAIZ, env: { ...process.env, PROXY4AUTO_PAINEL: painel } });
    let out = '', err = '';
    c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d));
    c.on('close', (code) => { let v = null; try { v = JSON.parse(out); } catch {} ok({ code, v, err: err.trim() }); });
    c.stdin.end(JSON.stringify({ node, params, input, data: '' }));
  });
}

caso('nós: apontar, listar, testar, pedir, disfarce, converter, ajustar, remover', async () => {
  // o "proxy": responde na porta da rota já com o disfarce feito
  const proxy = await escutar((q, s) => {
    if (q.url === '/api') { s.writeHead(200, { 'content-type': 'application/json' }); return s.end(JSON.stringify({ host: q.headers.host })); }
    s.writeHead(200, { 'content-type': 'text/html', server: 'mockflare' }); s.end('<a href="http://localhost-api/x">x</a>');
  });
  const pp = proxy.address().port;
  const linhas = ['# comentário'];
  const cfg = { porta_http: pp, porta_dns: 53, dns_upstream: '8.8.8.8', dns: false, hosts: false, reescrever_links: true, log_detalhado: false };
  const estado = () => ({
    config: cfg, servicos: { http: [{ porta: pp, ativo: true }], dns: 'desativado', hosts: 'desativado' },
    rotas: linhas.map((t, i) => ({ t, i })).filter((x) => !x.t.startsWith('#')).map(({ t, i }) => {
      const p = t.split(/\s+/);
      if (p[0] === 'tcp') return { linha: i, texto: t, tipo: 'tcp', id: 'tcp:' + p[1], porta: Number(p[1]), local: '127.0.0.1:' + p[1], destino: p[2], stats: null };
      const [nome, porta = String(pp)] = p[0].split(':');
      return { linha: i, texto: t, tipo: 'http', id: `${nome}:${porta}`, nome, porta: Number(porta), local: 'http://' + nome + (Number(porta) === 80 ? '' : ':' + porta), destino: new URL(p[1]).origin, stats: { total: 3, erros: 1, status: 200, ms: 9, t: Date.now() } };
    }),
    log: [{ tipo: 'req', t: Date.now(), rota: `localhost-api:${pp}`, metodo: 'GET', caminho: '/x', status: 500, ms: 12 }],
  });
  const painel = await escutar(async (q, s) => {
    const u = new URL(q.url, 'http://x'), j = (st, d) => { s.writeHead(st, { 'content-type': 'application/json' }); s.end(JSON.stringify(d)); };
    if (q.method === 'GET' && u.pathname === '/api/estado') return j(200, estado());
    if (q.method === 'GET' && u.pathname === '/api/testar') return j(200, u.searchParams.get('id').startsWith('tcp') ? { ok: false, erro: 'ECONNREFUSED', ms: 3 } : { ok: true, status: 200, ms: 7 });
    const b = await ler(q);
    if (u.pathname === '/api/rotas' && q.method === 'POST') {
      const l = b.tipo === 'tcp' ? `tcp ${b.porta} ${b.destino}` : `${b.porta ? b.nome + ':' + b.porta : b.nome} ${b.destino}`;
      if (b.original) linhas[b.original.linha] = l; else linhas.push(l);
      return j(200, estado());
    }
    if (u.pathname === '/api/rotas' && q.method === 'DELETE') { linhas.splice(b.linha, 1); return j(200, estado()); }
    if (u.pathname === '/api/config') { cfg[b.chave] = b.valor; return j(200, estado()); }
    j(404, { erro: 'não encontrado' });
  });
  const P = `http://127.0.0.1:${painel.address().port}`;
  try {
    let r = await no(P, 'status', { exigir: 'inteiro' });
    assert.equal(r.v.port, 'true'); assert.equal(r.v.value.no_ar, true);

    r = await no(P, 'apontar', { tipo: 'http', destino: 'https://api.exemplo.com/', nome: 'localhost-api', testar: 'sim' });
    assert.equal(r.code, 0, r.err); assert.equal(r.v.criada, true); assert.equal(r.v.teste.ok, true);
    assert.equal(linhas.at(-1), 'localhost-api https://api.exemplo.com', 'porta padrão não vai na linha');
    r = await no(P, 'apontar', { tipo: 'http', destino: 'https://api.exemplo.com', nome: 'localhost-api' });
    assert.equal(r.v.mudou, false, 'o mesmo destino: nada a fazer');
    r = await no(P, 'apontar', { tipo: 'http', destino: 'https://outro.exemplo.com', nome: 'localhost-api' });
    assert.equal(r.code, 1); assert.match(r.err, /já existe com outro destino/);
    r = await no(P, 'apontar', { tipo: 'tcp', destino: '203.0.113.10:5432', porta: '5433', testar: 'nao' });
    assert.equal(r.v.rota.id, 'tcp:5433');
    r = await no(P, 'apontar', { tipo: 'tcp', destino: '203.0.113.10', porta: '5433' });
    assert.match(r.err, /host:porta/);

    r = await no(P, 'rotas', { filtro: 'erros' });
    assert.deepEqual(r.v.map((x) => x.id), [`localhost-api:${pp}`]);

    r = await no(P, 'testar', {});
    assert.equal(r.v.port, 'false'); assert.equal(r.v.value.falharam, 1);
    r = await no(P, 'testar', { rota: 'localhost-api' });
    assert.equal(r.v.port, 'true');

    r = await no(P, 'pedir', { rota: 'https://api.exemplo.com/api' });
    assert.equal(r.code, 0, r.err); assert.equal(r.v.status, 200);
    assert.equal(r.v.corpo.host, `localhost-api:${pp}`, 'chega no proxy com o Host do nome local');

    r = await no(P, 'disfarce', { rota: 'localhost-api', caminhos: ['/'] });
    assert.equal(r.v.port, 'true', JSON.stringify(r.v));

    r = await no(P, 'converter', { url: 'https://api.exemplo.com/a?b=1' });
    assert.equal(r.v.para, `http://localhost-api:${pp}/a?b=1`);
    r = await no(P, 'converter', { url: 'https://nao.mapeado.com/x' });
    assert.match(r.err, /Nenhuma rota/);

    r = await no(P, 'ajustar', { ajuste: 'reescrever_links', ligado: 'nao' });
    assert.equal(r.v.depois, false);

    r = await no(P, 'admin', { acao: 'dns_proxy' });
    assert.equal(r.code, 1); assert.match(r.err, /DNS do proxy não está respondendo/, 'com o DNS do proxy desligado, nem pede a permissão');
    r = await no(P, 'admin', { acao: 'programa', programa: '' });
    assert.match(r.err, /Informe o programa/);

    r = await no(P, 'trafego', { so_erros: 'sim' });
    assert.equal(r.v.erros, 1);

    r = await no(P, 'remover', { rota: 'tcp 5433' });
    assert.equal(r.v.removida, true); assert.ok(!linhas.some((l) => l.startsWith('tcp')));
    r = await no(P, 'remover', { rota: 'nada', se_nao_existir: 'ignorar' });
    assert.equal(r.v.removida, false);
  } finally { proxy.close(); painel.close(); }
});

caso('nós: proxy desligado vira "não" no Proxy no ar? e erro claro nos outros', async () => {
  const P = 'http://127.0.0.1:9'; // ninguém escuta na porta 9
  let r = await no(P, 'status', {});
  assert.equal(r.v.port, 'false');
  r = await no(P, 'rotas', {});
  assert.equal(r.code, 1); assert.match(r.err, /não está no ar/);
});

for (const [nome, fn] of casos) {
  try { await fn(); ok++; } catch (e) { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }
}
console.log(`testes do Proxy4Auto: ${ok} de ${casos.length} passaram`);
