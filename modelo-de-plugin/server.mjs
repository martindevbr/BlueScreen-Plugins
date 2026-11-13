// Servidor do {{nome}} (Node.js 18+, sem dependências). Apague se o plugin não precisar de servidor (e tire o
// campo "server" do plugin.json). O BlueScreen inicia este processo quando o plugin liga e encerra quando desliga.
import http from 'node:http';
import crypto from 'node:crypto';

const TOKEN = process.env.BLUESCREEN_TOKEN || '';
const igual = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

const rotas = {
  async ola() { return { mensagem: 'Olá do servidor do {{nome}}' }; },
};

const servidor = http.createServer(async (rq, rs) => {
  const enviar = (status, corpo) => { rs.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); rs.end(JSON.stringify(corpo)); };
  // só o BlueScreen chega aqui: ele manda o token que recebeu ao iniciar o processo
  if (!TOKEN || !igual(rq.headers['x-bluescreen-token'], TOKEN)) return enviar(403, { error: 'acesso negado' });
  const nome = new URL(rq.url, 'http://127.0.0.1').pathname.replace(/^\/api\//, '').replace(/^{{id}}\//, '');
  const rota = Object.hasOwn(rotas, nome) ? rotas[nome] : null;
  if (!rota) return enviar(404, { error: 'rota desconhecida' });
  try { enviar(200, await rota()); } catch (e) { enviar(500, { error: e.message }); }
});
servidor.listen(0, '127.0.0.1', () => {
  process.stdout.write('BLUESCREEN-READY ' + JSON.stringify({ port: servidor.address().port, routes: Object.keys(rotas).map((r) => '{{id}}/' + r) }) + '\n');
});
