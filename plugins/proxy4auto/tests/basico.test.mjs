// Testes do Proxy4Auto: node tests/basico.test.mjs
// A lógica sozinha e depois os nós como o Automator os roda (Novo proxy → Rota → Ligar o proxy segurando o fluxo),
// contra o proxy embutido de verdade, em portas livres e com um hosts de mentira.
// Nada toca no hosts, no DNS nem num proxy que esteja rodando neste PC.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SCRIPTS, psTexto } from '../lib/admin.mjs';
import { semBlocoDoProxy, lerAlvo, acharRota, sugerirNome, normalizarDestino, paraLocal, paraOriginal, conferirDisfarce, trafego, portaValida, lerApontamentos, portaHttpDe, nomesNoHosts, baseDominio, ehProjeto, novoProjeto, comRota, comRotas, textoDasRotas, textoDosAjustes } from '../lib/proxy.mjs';

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
caso('projeto: os nós de montagem só devolvem o projeto com mais uma parte', () => {
  const p0 = novoProjeto({ porta_http: '8080', nomes: 'hosts', reescrever_links: 'nao' });
  assert.deepEqual([p0.porta_http, p0.nomes, p0.reescrever_links, p0.rede, p0.rotas.length], [8080, 'hosts', false, false, 0]);
  assert.equal(novoProjeto().porta_http, 80); assert.equal(novoProjeto().reescrever_links, true);
  assert.throws(() => novoProjeto({ porta_http: 'abc' }), /Porta HTTP inválida/);
  const p1 = comRota(p0, { tipo: 'http', destino: 'https://api.cliente.com.br' });
  assert.equal(p0.rotas.length, 0, 'o projeto que entrou não muda'); assert.ok(ehProjeto(p1) && !ehProjeto({ rotas: [] }) && !ehProjeto('x'));
  assert.deepEqual(p1.rotas[0], { tipo: 'http', nome: 'localhost-api-cliente', porta: 8080, destino: 'https://api.cliente.com.br', id: 'localhost-api-cliente:8080', local: 'http://localhost-api-cliente:8080' });
  assert.equal(comRota(p1, { tipo: 'http', destino: 'https://api.cliente.com.br/' }), p1, 'a mesma rota de novo não duplica');
  assert.throws(() => comRota(p1, { tipo: 'http', nome: 'localhost-api-cliente', destino: 'https://outro.com' }), /outro destino/);
  assert.throws(() => comRota(p1, { tipo: 'tcp', destino: '203.0.113.10', porta: 5433 }), /host:porta/);
  assert.throws(() => comRota(p1, { tipo: 'tcp', destino: '203.0.113.10:5432' }), /porta local/);
  const p2 = comRotas(p1, 'site https://loja.com\n# comentário\ntcp 5433 1.2.3.4:5432\nhttps://x.dev/\nfixo:9000 10.0.0.1:3000');
  assert.deepEqual(p2.rotas.map((r) => r.id), ['localhost-api-cliente:8080', 'site:8080', 'tcp:5433', 'localhost-x:8080', 'fixo:9000']);
  assert.throws(() => comRotas(p2, 'ok https://a.com\ntcp 9000 1.2.3.4:1'), /Linha 2.*já é usada por uma rota HTTP/);
  assert.throws(() => comRotas(p2, ''), /uma por linha/);
  assert.match(textoDasRotas(p2), /\r\nlocalhost-api-cliente https:\/\/api\.cliente\.com\.br\r\nsite https:\/\/loja\.com\r\ntcp 5433 1\.2\.3\.4:5432\r\nlocalhost-x https:\/\/x\.dev\r\nfixo:9000 http:\/\/10\.0\.0\.1:3000\r\n$/);
  assert.match(textoDosAjustes(p2), /porta_http=8080\r\ndns=desativado[\s\S]*hosts=ativo\r\nreescrever_links=nao\r\nrede=nao/);
  // o que o texto diz é o que o servidor das listas lê com o proxy desligado
  assert.deepEqual(lerApontamentos(textoDasRotas(p2), 8080).map((r) => r.id), p2.rotas.map((r) => r.id));
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
caso('os nós do automator.json são os do programa, e não há nó de desligar', async () => {
  const a = JSON.parse(fs.readFileSync(path.join(RAIZ, 'automator.json'), 'utf8')).nodes;
  const fonte = fs.readFileSync(path.join(RAIZ, 'nos.mjs'), 'utf8');
  for (const n of a) assert.ok(new RegExp(`\\n  async ${n.type}\\(`).test(fonte), 'nó sem programa: ' + n.type);
  assert.deepEqual(a.slice(0, 3).map((n) => n.type), ['novo', 'rota', 'ligar'], 'a montagem vem primeiro na paleta');
  assert.ok(!a.some((n) => /deslig/i.test(n.type + n.name)), 'o proxy desliga quando o fluxo para');
  assert.equal(a.find((n) => n.type === 'ligar').run.hold, true, 'o Ligar segura o fluxo sem o teto de tempo');
});

// ---------- os nós, contra o motor de verdade ----------
// O proxy embutido sobe numa pasta de dados temporária, em portas livres, com um hosts de mentira
// (PROXY4AUTO_HOSTS) e um destino falso. Nada toca no hosts, no DNS nem nas portas 80 e 7170 deste PC.
function escutar(fn) { return new Promise((ok) => { const s = http.createServer(fn).listen(0, '127.0.0.1', () => ok(s)); }); }
const portaLivre = async () => { const s = await escutar(() => {}); const p = s.address().port; await new Promise((r) => s.close(r)); return p; };
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy4auto-teste-'));
const HOSTS = path.join(DADOS, 'hosts-falso');
const ENV = { ...process.env, PROXY4AUTO_HOSTS: HOSTS };
// roda um nó como o Automator roda; `segura` devolve o processo sem esperar (o Ligar o proxy fica em execução)
function no(node, params = {}, input = null, segura = false) {
  const c = spawn(process.execPath, [path.join(RAIZ, 'nos.mjs')], { cwd: RAIZ, env: ENV });
  let out = '', err = '';
  c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d));
  const fim = new Promise((ok) => c.on('close', (code) => { let v = null; try { v = JSON.parse(out); } catch {} ok({ code, v, err: err.trim() }); }));
  c.stdin.end(JSON.stringify({ node, params, input, data: DADOS }));
  return segura ? { processo: c, fim } : fim;
}
const noAr = async () => (await no('status', {})).v.port === 'true';
async function ate(cond, segundos, oQue) { for (let i = 0; i < segundos * 5; i++) { if (await cond()) return; await dormir(200); } assert.fail(oQue); }
// o fluxo: Novo proxy → Rota → Rota → ... (cada nó recebe a saída do anterior)
async function montar(novo, ...rotas) {
  let r = await no('novo', novo);
  assert.equal(r.code, 0, r.err);
  for (const rota of rotas) { r = await no('rota', rota, r.v); assert.equal(r.code, 0, r.err); }
  return r.v;
}

caso('nós: monta, liga, usa e para o fluxo', async () => {
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
  fs.writeFileSync(path.join(DADOS, 'settings.json'), JSON.stringify({ porta: pc }));
  const hostsLimpo = () => fs.readFileSync(HOSTS, 'utf8').trim() === '127.0.0.1 meu-site';
  let ligado = null;
  try {
    // desligado: os nós de uso avisam; os de montagem funcionam (não mexem no PC)
    assert.equal(await noAr(), false);
    let r = await no('rotas', {});
    assert.equal(r.code, 1); assert.match(r.err, /nenhum fluxo está com ele ligado/);
    r = await no('rota', { tipo: 'http', destino });
    assert.equal(r.code, 1); assert.match(r.err, /depois de um Novo proxy/);
    r = await no('ligar', {}, await montar({ porta_http: ph }));
    assert.equal(r.code, 1); assert.match(r.err, /chegou sem rotas/);
    r = await no('rota', { tipo: 'http', destino: 'ftp://x.com' }, await montar({ porta_http: ph }));
    assert.match(r.err, /só repassa http e https/);

    // porta de uma rota ocupada por outro programa: o Ligar para com erro e não deixa proxy para trás
    r = await no('ligar', {}, await montar({ porta_http: ph }, { tipo: 'http', destino, nome: 'preso', porta: String(ocupada.address().port) }));
    assert.equal(r.code, 1); assert.match(r.err, new RegExp(`não ficou de pé: a porta ${ocupada.address().port} não abriu`));
    if (process.platform === 'win32') assert.match(r.err, /está com node/, 'no Windows diz qual programa ocupa a porta');
    assert.equal(await noAr(), false);

    // o fluxo de verdade: Novo proxy → Rota → Rota (várias) → Ligar o proxy, que fica segurando
    const projeto = await montar({ porta_http: ph, nomes: 'hosts' }, { tipo: 'http', destino: destino + '/', nome: 'localhost-api' }, { tipo: 'lista', lista: [`http://127.0.0.1:${morta}`] });
    assert.deepEqual(projeto.rotas.map((x) => x.nome), ['localhost-api', 'localhost-servico']);
    ligado = no('ligar', {}, projeto, true);
    await ate(noAr, 20, 'o proxy não subiu');
    assert.equal(ligado.processo.exitCode, null, 'o nó Ligar o proxy continua em execução: é ele que segura o fluxo');
    assert.match(fs.readFileSync(HOSTS, 'utf8'), /proxy4auto[\s\S]*127\.0\.0\.1\tlocalhost-api\r\n127\.0\.0\.1\tlocalhost-servico/, 'com "Gravar no hosts", os nomes vão para o hosts');

    r = await no('status', { exigir: 'inteiro' });
    assert.equal(r.v.port, 'true', JSON.stringify(r.v)); assert.equal(r.v.value.rotas_http, 2); assert.equal(r.v.value.hosts, 'ok');
    r = await no('ligar', {}, projeto);
    assert.equal(r.code, 1); assert.match(r.err, /Já há um proxy ligado por outro fluxo/);

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
    r = await no('esperar', { rota: 'localhost-servico', tempo_s: 2, intervalo_s: 1 });
    assert.equal(r.v.port, 'false'); assert.ok(r.v.value.tentativas >= 2, JSON.stringify(r.v));
    r = await no('esperar', { rota: 'localhost-api', tempo_s: 5 });
    assert.equal(r.v.port, 'true'); assert.equal(r.v.value.tentativas, 1);
    r = await no('testar', {});
    assert.equal(r.v.port, 'false'); assert.equal(r.v.value.falharam, 1); assert.equal(r.v.value.testadas, 2);
    r = await no('converter', { url: destino + '/a?b=1' });
    assert.equal(r.v.para, `http://localhost-api:${ph}/a?b=1`);
    r = await no('converter', { url: 'https://nao.mapeado.com/x' });
    assert.match(r.err, /Acrescente um nó Rota/);
    r = await no('rotas', { filtro: 'http' });
    assert.deepEqual(r.v.map((x) => x.nome), ['localhost-api', 'localhost-servico']); assert.ok(r.v[0].requisicoes > 3);
    r = await no('trafego', {});
    assert.ok(r.v.total > 3 && r.v.por_rota[0].rota === `localhost-api:${ph}` && r.v.mais_lentas.length, JSON.stringify(r.v).slice(0, 300));
    r = await no('admin', { acao: 'dns_proxy' });
    assert.equal(r.code, 1); assert.match(r.err, /DNS local do proxy está desligado/, 'sem o DNS local, nem pede a permissão');
    r = await no('admin', { acao: 'programa', programa: '' });
    assert.match(r.err, /Informe o programa/);

    // parar o fluxo: o BlueScreen encerra o nó, e o proxy sai sozinho tirando os nomes do hosts
    ligado.processo.kill();
    await ligado.fim; ligado = null;
    await ate(async () => !(await noAr()) && hostsLimpo(), 10, 'o proxy continuou ligado (ou os nomes ficaram no hosts) depois do fluxo parar');
    assert.deepEqual(fs.readdirSync(path.join(DADOS, 'proxy')).sort(), ['apontamentos.txt', 'config.txt', 'proxy.log'], 'a pasta de dados do proxy só tem texto');

    // outro fluxo, outro proxy: sem a reescrita, o destino aparece; e o que ligou antes não deixou rota para trás
    ligado = no('ligar', {}, await montar({ porta_http: ph, reescrever_links: 'nao' }, { tipo: 'http', destino, nome: 'cru' }), true);
    await ate(noAr, 20, 'o segundo proxy não subiu');
    r = await no('rotas', {});
    assert.deepEqual(r.v.map((x) => x.nome), ['cru'], 'o proxy é o que o fluxo montou, nada mais');
    assert.ok(hostsLimpo(), 'sem "Gravar no hosts", o hosts não é tocado');
    r = await no('disfarce', { rota: 'cru', caminhos: ['/'] });
    assert.equal(r.v.port, 'false'); assert.ok(r.v.value.vazamentos.length >= 2 && /Novo proxy/.test(r.v.value.dica), 'sem a reescrita, o destino aparece');
    ligado.processo.kill();
    await ligado.fim; ligado = null;
    await ate(async () => !(await noAr()), 10, 'o segundo proxy continuou ligado');

    // com tempo marcado: fica ligado esse tempo, desliga sozinho e o fluxo segue com o resumo
    const t0 = Date.now();
    r = await no('ligar', { minutos: 0.05 }, await montar({ porta_http: ph }, { tipo: 'http', destino, nome: 'breve' }));
    assert.equal(r.code, 0, r.err); assert.ok(Date.now() - t0 >= 3000 && r.v.ligado_por_s >= 3, JSON.stringify(r.v));
    assert.deepEqual(r.v.rotas, [{ id: `breve:${ph}`, local: `http://breve:${ph}`, destino }]); assert.equal(r.v.requisicoes, 0);
    assert.equal(await noAr(), false);
  } finally {
    if (ligado) { ligado.processo.kill(); await ligado.fim; await dormir(2500); }
    site.close(); ocupada.close();
    fs.rmSync(DADOS, { recursive: true, force: true });
  }
});

for (const [nome, fn] of casos) {
  try { await fn(); ok++; } catch (e) { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; }
}
console.log(`testes do Proxy4Auto: ${ok} de ${casos.length} passaram`);
