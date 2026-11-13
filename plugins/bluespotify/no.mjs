// Programa dos nós do BlueSpotify no Automator.
// Entrada (stdin): { node, params, input, data, secrets }. Saída (stdout): o resultado do nó, em JSON.
//
// O programa do nó NÃO recebe o token do Spotify. Ele lê em <pasta de dados>/ponte.json a porta e a chave do
// servidor do plugin (server.mjs, que o BlueScreen mantém rodando) e pede a ação a ele. Quem guarda o token,
// renova e fala com o Spotify é só o servidor.
import fs from 'node:fs';
import path from 'node:path';

const falhar = (msg) => { process.stderr.write(String(msg) + '\n'); process.exit(1); };

let texto = '';
process.stdin.setEncoding('utf8');
for await (const pedaco of process.stdin) texto += pedaco;

let pedido;
try { pedido = JSON.parse(texto); } catch { falhar('Entrada inválida: o nó espera um JSON do Automator.'); }

let ponte;
try { ponte = JSON.parse(fs.readFileSync(path.join(String(pedido.data || ''), 'ponte.json'), 'utf8')); }
catch { falhar('O BlueSpotify não está rodando. Ligue o plugin na aba Plugins (ele precisa do Node.js) e tente de novo.'); }

let resposta;
try {
  resposta = await fetch(`http://127.0.0.1:${ponte.porta}/ponte`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bluespotify-chave': ponte.chave },
    body: JSON.stringify({ no: pedido.node, params: pedido.params || {}, entrada: pedido.input ?? null }),
    signal: AbortSignal.timeout(60000),
  });
} catch { falhar('O servidor do BlueSpotify não respondeu. Desligue e ligue o plugin na aba Plugins.'); }

let corpo = null;
try { corpo = await resposta.json(); } catch {}
if (!resposta.ok || !corpo || corpo.ok !== true) falhar((corpo && corpo.erro) || `O BlueSpotify respondeu ${resposta.status}.`);
process.stdout.write(JSON.stringify(corpo.valor ?? null));
