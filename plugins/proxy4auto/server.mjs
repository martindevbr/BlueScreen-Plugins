// Proxy4Auto: servidor só das listas dos campos do Automator ("choicesFrom": "proxy4auto/rotas"). Não tem tela:
// os nós rodam pelo nos.mjs. Com o proxy ligado a lista vem dele; desligado, das rotas do último fluxo que o ligou.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { configuracoes, descreverRota, lerApontamentos, portaHttpDe } from './lib/proxy.mjs';

const require = createRequire(import.meta.url);
const { Plugin } = require(path.join(process.env.BLUESCREEN_SDK, 'bluescreen.js'));
const p = new Plugin();
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DADOS = process.env.BLUESCREEN_PLUGIN_DATA || '';

p.route('proxy4auto/rotas', async (req) => {
  if (req.remote) return Plugin.reply(403, { error: 'O Proxy4Auto só responde no próprio PC.' });
  const tipo = (req.query && req.query.tipo) || 'todas';
  const serve = (x) => (tipo === 'todas' ? x.tipo === 'http' || x.tipo === 'tcp' : x.tipo === tipo);
  let cfg;
  try { cfg = configuracoes(DADOS, AQUI); } catch (e) { return Plugin.reply(400, { error: e.message }); }
  let rotas = null;
  try {
    const est = await (await fetch(cfg.painel + '/api/estado', { signal: AbortSignal.timeout(2500) })).json();
    if (est.motor === 'proxy4auto') rotas = est.rotas || [];
  } catch {}
  // proxy desligado: as rotas do último fluxo que o ligou ficaram em texto na pasta de dados
  if (!rotas) {
    const ler = (f) => { try { return fs.readFileSync(path.join(cfg.pastaProxy, f), 'utf8'); } catch { return ''; } };
    rotas = lerApontamentos(ler('apontamentos.txt'), portaHttpDe(ler('config.txt')));
  }
  return { choices: rotas.filter(serve).map((x) => ({ value: x.id, label: descreverRota(x) })) };
});

p.run();
