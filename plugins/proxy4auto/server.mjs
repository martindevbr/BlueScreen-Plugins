// Proxy4Auto: servidor só das listas dos campos do Automator ("choicesFrom": "proxy4auto/rotas"). Não tem tela:
// os nós rodam pelo nos.mjs. Pede as rotas ao painel do proxy na hora em que o campo abre.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { configuracoes, descreverRota } from './lib/proxy.mjs';

const require = createRequire(import.meta.url);
const { Plugin } = require(path.join(process.env.BLUESCREEN_SDK, 'bluescreen.js'));
const p = new Plugin();
const AQUI = path.dirname(fileURLToPath(import.meta.url));

p.route('proxy4auto/rotas', async (req) => {
  if (req.remote) return Plugin.reply(403, { error: 'O Proxy4Auto só responde no próprio PC.' });
  const tipo = (req.query && req.query.tipo) || 'todas';
  let painel;
  try { painel = configuracoes(process.env.BLUESCREEN_PLUGIN_DATA || '', AQUI).painel; } catch (e) { return Plugin.reply(400, { error: e.message }); }
  try {
    const r = await fetch(painel + '/api/estado', { signal: AbortSignal.timeout(4000) });
    const est = await r.json();
    const rotas = (est.rotas || []).filter((x) => (tipo === 'todas' ? x.tipo === 'http' || x.tipo === 'tcp' : x.tipo === tipo));
    return { choices: rotas.map((x) => ({ value: x.id, label: descreverRota(x) })) };
  } catch {
    // proxy desligado: a lista fica vazia e o campo continua aceitando o nome digitado
    return { choices: [] };
  }
});

p.run();
