// Programa dos nós do Bluetego no Automator.
// Entrada (stdin): { node, params, input, data }. Saída (stdout): o resultado do nó, em JSON.
//
// "Tem alerta?" roda aqui mesmo (só olha o que chegou). Os outros pedem ao servidor do plugin (server.mjs, que o
// BlueScreen mantém rodando): a porta e a chave estão em <pasta de dados>/ponte.json. As chaves do Cofre ficam lá.
import fs from 'node:fs';
import path from 'node:path';
import { alertasDe } from './lib/automator.mjs';

const falhar = (msg) => { process.stderr.write(String(msg) + '\n'); process.exit(1); };

let texto = '';
process.stdin.setEncoding('utf8');
for await (const pedaco of process.stdin) texto += pedaco;

let pedido;
try { pedido = JSON.parse(texto); } catch { falhar('Entrada inválida: o nó espera um JSON do Automator.'); }
const params = pedido.params || {};

if (pedido.node === 'alertas') {
  let dado = params.dados != null && params.dados !== '' ? params.dados : pedido.input;
  if (typeof dado === 'string') { try { dado = JSON.parse(dado); } catch { dado = null; } }
  const alertas = alertasDe(dado);
  process.stdout.write(JSON.stringify({ port: alertas.length ? 'true' : 'false', value: { tem_alerta: alertas.length > 0, quantos: alertas.length, alertas, ...(dado && dado.semente ? { semente: dado.semente.valor } : {}) } }));
  process.exit(0);
}

let ponte;
try { ponte = JSON.parse(fs.readFileSync(path.join(String(pedido.data || ''), 'ponte.json'), 'utf8')); }
catch { falhar('O Bluetego não está rodando. Ligue o plugin na aba Plugins (ele precisa do Node.js 18+) e tente de novo.'); }

let resposta;
try {
  resposta = await fetch(`http://127.0.0.1:${ponte.porta}/ponte`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bluetego-chave': ponte.chave },
    body: JSON.stringify({ no: pedido.node, params, entrada: pedido.input ?? null }),
    // uma máquina grande demora: o tempo de verdade é o "timeout" do nó no automator.json
    signal: AbortSignal.timeout(60 * 60 * 1000),
  });
} catch { falhar('O servidor do Bluetego não respondeu. Desligue e ligue o plugin na aba Plugins.'); }

let corpo = null;
try { corpo = await resposta.json(); } catch {}
if (!resposta.ok || !corpo || corpo.ok !== true) {
  const erro = (corpo && corpo.erro) || `O Bluetego respondeu ${resposta.status}.`;
  falhar(corpo && corpo.cofre ? `${erro} Libere a chave "${corpo.cofre}" no Cofre do BlueScreen para o Bluetego.` : erro);
}
process.stdout.write(JSON.stringify(corpo.valor ?? null));
