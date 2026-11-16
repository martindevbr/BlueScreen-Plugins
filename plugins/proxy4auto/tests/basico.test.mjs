// Testes do Proxy4Auto: node tests/basico.test.mjs
// A lógica sozinha e depois os nós contra o proxy embutido de verdade, em portas livres e com um hosts de mentira.
// Nada toca no hosts, no DNS nem num proxy que esteja rodando neste PC.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SCRIPTS, psTexto } from '../lib/admin.mjs';
import { semBlocoDoProxy, lerAlvo, acharRota, sugerirNome, normalizarDestino, paraLocal, paraOriginal, conferirDisfarce, trafego, portaValida, lerApontamentos, portaHttpDe, nomesNoHosts, baseDominio } from '../lib/proxy.mjs';

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
caso('portaValida: padrão, número e recusa o que não é porta', () => {
  assert.equal(portaValida(''), 7170);
  assert.equal(portaValida('7171'), 7171);
  assert.throws(() => portaValida('80'), /1024 a 65535/);
  assert.throws(() => portaValida('abc'), /inválida/);
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
caso('hosts: lê os nomes do bloco do proxy e tira só ele', () => {
  const h = '127.0.0.1 meu-site\r\n# >>> proxy4auto (gerado automaticamente, nao edite este bloco)\r\n127.0.0.1\tlocalhost-api\r\n127.0.0.1\tsite\r\n# <<< proxy4auto\r\n10.0.0.1 nas\r\n';
  assert.deepEqual(nomesNoHosts(h), ['localhost-api', 'site']);
  assert.equal(semBlocoDoProxy(h), '127.0.0.1 meu-site\r\n10.0.0.1 nas\r\n');
  assert.equal(semBlocoDoProxy('sem bloco\r\n'), 'sem bloco\r\n');
  assert.deepEqual(nomesNoHosts('sem bloco'), []);
  // o bloco do localhost-proxy avulso (outro programa) não é nosso: fica
  const outro = '# >>> localhost-proxy (gerado automaticamente, nao edite este bloco)\r\n127.0.0.1\tx\r\n# <<< localhost-proxy\r\n';
  assert.equal(semBlocoDoProxy(outro), outro);
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
  assert.deepEqual(t.por_rota[0], { rota: 'a:80', total: 3, erros: 1, ms_maximo: 900 });
  assert.equal(t.mais_lentas[0].caminho, '/2');
});

caso('lerApontamentos: as rotas saem do texto com o proxy desligado', () => {
  const r = lerApontamentos('# x\r\nlocalhost-api https://api.x.com/\r\nsite:2111 loja.com\r\ntcp 5433 1.2.3.4:5432\r\nlixo\r\n', 8080);
  assert.deepEqual(r.map((x) => `${x.id} ${x.local} ${x.destino}`), ['localhost-api:8080 http://localhost-api:8080 https://api.x.com', 'site:2111 http://site:2111 http://loja.com', 'tcp:5433 127.0.0.1:5433 1.2.3.4:5432']);
  assert.equal(portaHttpDe('a=1\r\nporta_http=8080\r\n'), 8080);
});
caso('sem executável: a pasta do plugin só tem módulo, texto e ícone', () => {
  const todos = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? todos(path.join(d, e.name)) : [path.join(d, e.name)]));
  const fora = todos(RAIZ).filter((f) => !/\.(mjs|json|md|svg)$/i.test(f));
  assert.deepEqual(fora, [], 'arquivo que não é módulo, texto nem ícone');
  for (const f of ['nos.mjs', 'server.mjs', 'lib/motor.mjs', 'lib/admin.mjs']) {
    const t = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    assert.ok(!/['"][^'"\s]*\.(bat|cmd|ps1)['"]/i.test(t) && !/cmd\.exe/i.test(t), f + ' chama arquivo de lote ou de script');
  }
});

// ---------- os nós, contra o motor de verdade ----------
// O proxy embutido sobe numa pasta de dados temporária, em portas livres, com um hosts de mentira
// (PROXY4AUTO_HOSTS) e um destino falso. Nada toca no hosts, no DNS nem nas portas 80 e 7170 deste PC.
function escutar(fn) { return new Promise((ok) => { const s = http.createServer(fn).listen(0, '127.0.0.1', () => ok(s)); }); }
const portaLivre = async () => { const s = await escutar(() => {}); const p = s.address().port; await new Promise((r) => s.close(r)); return p; };
const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy4auto-teste-'));
const HOSTS = path.join(DADOS, 'hosts-falso');
const ENV = { ...process.env, PROXY4AUTO_HOSTS: HOSTS };
function no(node, params = {}, input = null) {
  return new Promise((ok) => {
    const c = spawn(process.execPath, [path.join(RAIZ, 'nos.mjs')], { cwd: RAIZ, env: ENV });
    let out = '', err = '';
    c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d));
    c.on('close', (code) => { let v = null; try { v = JSON.parse(out); } catch {} ok({ code, v, err: err.trim() }); });
    c.stdin.end(JSON.stringify({ node, params, input, data: DADOS }));
  });
}
const ajustes = (o) => fs.writeFileSync(path.join(DADOS, 'settings.json'), JSON.stringify(o));

caso('nós: o proxy embutido de ponta a ponta', async () => {
  // o "site": entrega o próprio endereço em links, cabeçalhos e cookie, como um site de verdade
  const site = await escutar((q, s) => {
    const eu = 'http://' + q.headers.host;
    if (q.url === '/api') { s.writeHead(200, { 'content-type': 'application/json' }); return s.end(JSON.stringify({ host: q.headers.host, veio: q.headers['x-forwarded-host'] })); }
    if (q.url === '/r') { s.writeHead(302, { location: eu + '/api' }); return s.end(); }
    s.writeHead(200, { 'content-type': 'text/html', server: 'cloudflare', 'x-vercel-id': 'gru1', 'set-cookie': 'sid=1; Path=/' });
    s.end(`<a href="${eu}/x">x</a> <img src="${eu}/i.png">`);
  });
  const destino = `http://127.0.0.1:${site.address().port}`;
  const [pc, ph, morta] = [await portaLivre(), await portaLivre(), await portaLivre()];
  const ocupada = await escutar((_q, s) => s.end('outro programa'));
  fs.writeFileSync(HOSTS, '127.0.0.1 meu-site\r\n');
  fs.mkdirSync(path.join(DADOS, 'proxy'), { recursive: true });
  fs.writeFileSync(path.join(DADOS, 'proxy', 'config.txt'), `porta_http=${ph}\r\ndns=desativado\r\nporta_dns=5399\r\nhosts=ativo\r\nreescrever_links=sim\r\n`);
  fs.writeFileSync(path.join(DADOS, 'servidor.json'), JSON.stringify({ pid: process.pid })); // o "BlueScreen" é este teste
  try {
    ajustes({ porta: pc, ligar_sozinho: false });
    let r = await no('status', {});
    assert.equal(r.v.port, 'false'); assert.match(r.v.value.motivo, /desligado/);
    r = await no('rotas', {});
    assert.equal(r.code, 1); assert.match(r.err, /está desligado/, 'sem "ligar sozinho", avisa em vez de ligar');

    ajustes({ porta: pc, ligar_sozinho: true });
    r = await no('apontar', { tipo: 'http', destino: destino + '/', nome: 'localhost-api', testar: 'sim' });
    assert.equal(r.code, 0, r.err); assert.equal(r.v.criada, true); assert.equal(r.v.teste.ok, true);
    assert.equal(r.v.proxy_ligado_agora, true, 'o nó ligou o proxy sozinho');
    assert.equal(r.v.resolve, false); assert.match(r.v.dica, /Permissão de administrador/);
    assert.match(fs.readFileSync(path.join(DADOS, 'proxy', 'apontamentos.txt'), 'utf8'), /^localhost-api\s+http:\/\/127\.0\.0\.1:\d+\s*$/m, 'porta padrão não vai na linha');
    assert.match(fs.readFileSync(HOSTS, 'utf8'), /proxy4auto[\s\S]*127\.0\.0\.1\tlocalhost-api/, 'com permissão, o proxy grava o hosts');
    r = await no('apontar', { tipo: 'http', destino, nome: 'localhost-api' });
    assert.equal(r.v.mudou, false, 'o mesmo destino: nada a fazer'); assert.ok(!r.v.proxy_ligado_agora);
    r = await no('apontar', { tipo: 'http', destino: 'https://outro.exemplo.com', nome: 'localhost-api' });
    assert.equal(r.code, 1); assert.match(r.err, /já existe com outro destino/);
    r = await no('apontar', { tipo: 'tcp', destino: '203.0.113.10', porta: '5433' });
    assert.match(r.err, /host:porta/);

    r = await no('status', { exigir: 'inteiro' });
    assert.equal(r.v.port, 'true', JSON.stringify(r.v)); assert.equal(r.v.value.administrador, true); assert.equal(r.v.value.fica_ligado, 'até fechar o BlueScreen');
    assert.deepEqual(r.v.value.nomes_sem_resolver, ['localhost-api']);
    r = await no('status', { exigir: 'nomes' });
    assert.equal(r.v.port, 'false', 'o nome não está no hosts de verdade');

    r = await no('pedir', { rota: destino + '/api' });
    assert.equal(r.code, 0, r.err); assert.equal(r.v.status, 200);
    assert.equal(r.v.corpo.veio, `localhost-api:${ph}`, 'chega no proxy com o Host do nome local');
    assert.equal(r.v.corpo.host, `127.0.0.1:${site.address().port}`, 'e no destino com o Host dele');
    r = await no('pedir', { rota: 'localhost-api', caminho: '/r' });
    assert.equal(r.v.status, 302); assert.equal(r.v.headers.location, `http://localhost-api:${ph}/api`, 'o redirecionamento volta com o nome local');
    r = await no('pedir', { rota: 'localhost-api', caminho: '/r', seguir: 'sim' });
    assert.equal(r.v.status, 200); assert.equal(r.v.redirecionamentos.length, 1); assert.equal(r.v.url, `http://localhost-api:${ph}/api`);

    r = await no('disfarce', { rota: 'localhost-api', caminhos: ['/'] });
    assert.equal(r.v.port, 'true', JSON.stringify(r.v));
    r = await no('comparar', { rota: 'localhost-api', caminhos: ['/', '/api'] });
    assert.equal(r.v.port, 'true', JSON.stringify(r.v)); assert.equal(r.v.value.paginas.length, 2);
    r = await no('ajustar', { ajuste: 'reescrever_links', ligado: 'nao' });
    assert.equal(r.v.depois, false); assert.equal(r.v.mudou, true);
    r = await no('disfarce', { rota: 'localhost-api', caminhos: ['/'] });
    assert.equal(r.v.port, 'false'); assert.ok(r.v.value.vazamentos.length >= 2 && r.v.value.dica, 'sem a reescrita, o destino aparece');
    await no('ajustar', { ajuste: 'reescrever_links', ligado: 'sim' });

    // rota para um destino que não responde, e uma porta local que outro programa já usa
    r = await no('apontar', { tipo: 'http', destino: `http://127.0.0.1:${morta}`, testar: 'sim' });
    assert.equal(r.v.rota.nome, 'localhost-servico'); assert.equal(r.v.teste.ok, false);
    r = await no('esperar', { rota: 'localhost-servico', tempo_s: 2, intervalo_s: 1 });
    assert.equal(r.v.port, 'false'); assert.ok(r.v.value.tentativas >= 2, JSON.stringify(r.v));
    r = await no('esperar', { rota: 'localhost-api', tempo_s: 5 });
    assert.equal(r.v.port, 'true'); assert.equal(r.v.value.tentativas, 1);
    r = await no('testar', {});
    assert.equal(r.v.port, 'false'); assert.equal(r.v.value.falharam, 1); assert.equal(r.v.value.testadas, 2);
    r = await no('apontar', { tipo: 'http', destino, nome: 'preso', porta: String(ocupada.address().port), testar: 'nao' });
    assert.match(r.v.porta_fechada, /a porta \d+ não abriu/, JSON.stringify(r.v));
    if (process.platform === 'win32') assert.match(r.v.porta_fechada, /está com node/, 'no Windows diz qual programa ocupa a porta');
    r = await no('status', { exigir: 'inteiro' });
    assert.equal(r.v.port, 'false'); assert.match(r.v.value.problemas.join(), /não abriu/);
    r = await no('remover', { rota: 'preso' });
    assert.equal(r.v.removida, true); assert.equal(r.v.restam, 2);
    r = await no('remover', { rota: 'nada', se_nao_existir: 'ignorar' });
    assert.equal(r.v.removida, false);

    r = await no('converter', { url: destino + '/a?b=1' });
    assert.equal(r.v.para, `http://localhost-api:${ph}/a?b=1`);
    r = await no('converter', { url: 'https://nao.mapeado.com/x' });
    assert.match(r.err, /Nenhuma rota/);
    r = await no('rotas', { filtro: 'http' });
    assert.deepEqual(r.v.map((x) => x.nome), ['localhost-api', 'localhost-servico']); assert.ok(r.v[0].requisicoes > 3);
    r = await no('trafego', {});
    assert.ok(r.v.total > 3 && r.v.por_rota[0].rota === `localhost-api:${ph}` && r.v.mais_lentas.length, JSON.stringify(r.v).slice(0, 300));

    // administrador: o que dá para conferir sem a pergunta do Windows
    r = await no('admin', { acao: 'hosts_gravar' });
    assert.equal(r.v.port, 'true'); assert.equal(r.v.value.resultado, 'já estava certo');
    r = await no('admin', { acao: 'dns_proxy' });
    assert.equal(r.code, 1); assert.match(r.err, /só consulta DNS na porta 53/, 'fora da porta 53, nem pede a permissão');
    r = await no('admin', { acao: 'programa', programa: '' });
    assert.match(r.err, /Informe o programa/);

    r = await no('ligar', {});
    assert.equal(r.v.ja_estava, true); assert.equal(r.v.rotas, 2);
    r = await no('desligar', {});
    assert.equal(r.code, 0, r.err); assert.equal(r.v.desligado, true); assert.equal(r.v.hosts, 'bloco do proxy removido');
    assert.equal(fs.readFileSync(HOSTS, 'utf8').trim(), '127.0.0.1 meu-site', 'o hosts volta ao que era');
    r = await no('desligar', {});
    assert.equal(r.v.ja_estava, true); assert.equal(r.v.hosts, 'nada a limpar');

    // "até fechar o BlueScreen": com o servidor do plugin fora do ar, o proxy sai sozinho
    fs.writeFileSync(path.join(DADOS, 'servidor.json'), JSON.stringify({ pid: process.pid }));
    r = await no('ligar', { fica: 'bluescreen' });
    assert.equal(r.v.ja_estava, false); assert.equal(r.v.fica_ligado, 'até fechar o BlueScreen'); assert.equal(r.v.rotas, 2, 'as rotas ficam guardadas');
    fs.writeFileSync(path.join(DADOS, 'servidor.json'), JSON.stringify({ pid: 999999 }));
    let saiu = false;
    for (let i = 0; i < 50 && !saiu; i++) { await new Promise((ok) => setTimeout(ok, 500)); saiu = (await no('status', {})).v.port === 'false'; }
    assert.ok(saiu, 'o proxy continuou ligado sem o BlueScreen');
    assert.equal(fs.readFileSync(HOSTS, 'utf8').trim(), '127.0.0.1 meu-site');
    assert.deepEqual(fs.readdirSync(path.join(DADOS, 'proxy')).sort(), ['apontamentos.txt', 'config.txt', 'proxy.log'], 'a pasta de dados do proxy só tem texto');
  } finally {
    await no('desligar', { hosts: 'manter' });
    site.close(); ocupada.close();
    fs.rmSync(DADOS, { recursive: true, force: true });
  }
});

for (const [nome, fn] of casos) {
  try { await fn(); ok++; } catch (e) { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }
}
console.log(`testes do Proxy4Auto: ${ok} de ${casos.length} passaram`);
