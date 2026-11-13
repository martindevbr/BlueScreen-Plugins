// Programa dos nós do Automator (categoria Teams). O Automator roda "node nos.mjs" na pasta do plugin e manda pela
// entrada padrão { node, params, input, data, secrets }.
//
// Este programa não tem token nem URL de webhook: quem tem é o servidor do plugin. Ele lê <data>/ponte.json (porta
// local e chave que o servidor sorteia a cada início), pede a operação e escreve o resultado na saída padrão.
// Um {{cred:nome}} ou {{vault:nome}} num campo chega por variável de ambiente (secrets diz qual) e é repassado só
// para o servidor, pelo 127.0.0.1.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const falha = (msg) => { process.stderr.write(msg + '\n'); process.exit(1); };
const lerEntrada = () => new Promise((r) => { let s = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (d) => { s += d; }); process.stdin.on('end', () => r(s)); });

// troca as referências de segredo pelo valor que veio na variável de ambiente
function comSegredos(valor, segredos) {
  if (typeof valor === 'string') { let t = valor; for (const [ref, variavel] of Object.entries(segredos)) if (t.includes(ref)) t = t.split(ref).join(process.env[variavel] ?? ''); return t; }
  if (Array.isArray(valor)) return valor.map((v) => comSegredos(v, segredos));
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, comSegredos(v, segredos)]));
  return valor;
}

function pedir(ponte, corpo) {
  return new Promise((ok, erro) => {
    const dados = Buffer.from(JSON.stringify(corpo));
    // http.request não tem prazo: o nó "Esperar resposta" fica com o pedido aberto até a resposta chegar
    const rq = http.request({ host: '127.0.0.1', port: ponte.porta, path: '/', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': dados.length, 'x-bmt-chave': ponte.chave } }, (rs) => {
      const partes = [];
      rs.on('data', (c) => partes.push(c));
      rs.on('end', () => { try { ok(JSON.parse(Buffer.concat(partes).toString('utf8'))); } catch { erro(new Error('resposta inválida do plugin')); } });
    });
    rq.on('error', erro);
    rq.end(dados);
  });
}

const entrada = JSON.parse((await lerEntrada()) || '{}');
let ponte;
try { ponte = JSON.parse(fs.readFileSync(path.join(entrada.data || '', 'ponte.json'), 'utf8')); } catch { falha('O servidor do plugin BlueMSTeamsAutomator não está rodando. Confira na aba Plugins se ele está ligado e se o Node.js está instalado.'); }
let r;
try { r = await pedir(ponte, { node: entrada.node, params: comSegredos(entrada.params || {}, entrada.secrets || {}), input: entrada.input }); } catch (e) {
  falha(e.code === 'ECONNREFUSED' ? 'O servidor do plugin BlueMSTeamsAutomator parou. Desligue e ligue o plugin na aba Plugins.' : 'Não deu para falar com o plugin: ' + e.message);
}
if (!r.ok) falha(r.error || 'o Teams não respondeu');
process.stdout.write(JSON.stringify(r.port ? { port: r.port, value: r.value } : r.value ?? null));
