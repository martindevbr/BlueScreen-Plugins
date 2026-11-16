// Programa dos nós do Proxy4Auto no Automator.
// Entrada (stdin): { node, params, input, data }. Saída (stdout): o resultado, em JSON; com duas saídas,
// { port: "true" | "false", value }. Falha: código diferente de zero e o motivo na saída de erro.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configuracoes, lerAlvo, acharRota, descreverRota, sugerirNome, normalizarDestino, paraLocal, paraOriginal, conferirDisfarce, trafego } from './lib/proxy.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
class Falha extends Error {}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const sim = (v) => v === true || /^(sim|true|1|on)$/i.test(String(v ?? ''));

// ---------- painel do proxy ----------
async function api(cfg, metodo, caminho, corpo) {
  let r;
  try {
    r = await fetch(cfg.painel + caminho, {
      method: metodo, headers: corpo ? { 'content-type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Falha(`O proxy não está no ar (o painel em ${cfg.painel} não respondeu). Use o nó Ligar o proxy antes, ou confira o endereço do painel nas configurações do Proxy4Auto.`);
  }
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok) throw new Falha((j && j.erro) || `O painel do proxy respondeu ${r.status}.`);
  return j;
}
const estado = (cfg) => api(cfg, 'GET', '/api/estado');
async function noAr(cfg) { try { return await estado(cfg); } catch { return null; } }

// a rota escolhida no campo (ou a que chega do nó anterior: texto, { id }, { rota: { id } }, { local })
function alvoDe(valor, entrada) {
  const v = valor != null && String(valor).trim() !== '' ? valor : entrada;
  if (v && typeof v === 'object') return v.id || (v.rota && v.rota.id) || v.local || v.url || '';
  return v ?? '';
}
function rotaDe(est, texto) {
  const alvo = lerAlvo(texto);
  if (!alvo) throw new Falha('Escolha a rota: o nome local (localhost-api), nome:porta, a URL local ou "tcp 5433".');
  const r = acharRota(est.rotas, alvo, est.config.porta_http);
  if (!r) {
    const nomes = est.rotas.filter((x) => x.tipo !== 'invalida').map(descreverRota);
    throw new Falha(`Nenhuma rota "${String(texto).trim()}" no proxy.${nomes.length ? ' As que existem: ' + nomes.join('; ') + '.' : ' O proxy não tem rotas ainda.'}`);
  }
  return r;
}
const enxuta = (r) => ({ id: r.id, tipo: r.tipo, ...(r.nome ? { nome: r.nome } : {}), porta: r.porta, local: r.local, destino: r.destino, ...(r.stats ? { requisicoes: r.stats.total, erros: r.stats.erros, ultimo_status: r.stats.status, ultimo_ms: r.stats.ms } : {}) });

// ---------- processo do proxy ----------
const rodar = (prog, args, opt = {}) => new Promise((ok) => execFile(prog, args, { windowsHide: true, timeout: 20000, ...opt }, (e, out, err) => ok({ ok: !e, out: String(out || ''), err: String(err || e?.message || '') })));
// PID de quem escuta na porta (netstat) e a linha de comando dele: só mexemos se for o proxy.js
async function processoNaPorta(porta) {
  const n = await rodar('netstat', ['-ano', '-p', 'TCP']);
  const linha = n.out.split(/\r?\n/).find((l) => new RegExp(`^\\s*TCP\\s+\\S+:${porta}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, 'i').test(l));
  if (!linha) return null;
  const pid = Number(linha.trim().split(/\s+/).pop());
  // a linha de comando dele e a de quem o abriu (o iniciar.bat roda "node proxy.js" sem o caminho)
  // De um processo de administrador o Windows não mostra a linha de comando: fica só o nome (node)
  const p = await rodar('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).ProcessName; '---'; $p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; $p.CommandLine; '---'; if ($p) { (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)").CommandLine }`]);
  const [nome, comando, pai] = p.out.split(/\r?\n?---\r?\n/);
  return { pid, nome: (nome || '').trim().toLowerCase(), comando: (comando || '').trim(), pai: (pai || '').trim() };
}
// a pasta do proxy: a das configurações; sem ela, a do proxy que está rodando
async function pastaDoProxy(cfg, obrigatoria) {
  let pasta = cfg.pasta;
  if (!pasta) {
    const p = await processoNaPorta(new URL(cfg.painel).port);
    const m = p && `${p.comando}\n${p.pai}`.match(/([A-Za-z]:\\[^"\r\n]*?)\\(?:proxy\.js|iniciar\.bat)\b/i);
    if (m) pasta = m[1];
  }
  if (!pasta || !fs.existsSync(path.join(pasta, 'proxy.js'))) {
    if (!obrigatoria) return '';
    throw new Falha(pasta ? `Não achei o proxy.js em ${pasta}.` : 'Diga onde está o proxy: Plugins › engrenagem do Proxy4Auto › Pasta do proxy (a que tem o proxy.js).');
  }
  return pasta;
}

// ---------- requisição pelo proxy ----------
// conecta em 127.0.0.1:<porta da rota> com o Host do nome local: é exatamente o caminho que um app faria
function pedirLocal(rota, { metodo = 'GET', caminho = '/', cabecalhos = {}, corpo, tempo = 30000, limite = 2_000_000 }) {
  return new Promise((ok, falhou) => {
    const t0 = Date.now();
    const req = http.request({ host: '127.0.0.1', port: rota.porta, method: metodo, path: caminho, setHost: false, headers: { host: rota.porta === 80 ? rota.nome : `${rota.nome}:${rota.porta}`, 'user-agent': 'Proxy4Auto (BlueScreen)', 'accept-encoding': 'identity', ...cabecalhos } }, (res) => {
      const partes = []; let n = 0, cortado = false;
      res.on('data', (c) => { if (n < limite) { partes.push(c); n += c.length; } else cortado = true; });
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, corpo: Buffer.concat(partes).toString('utf8'), ms: Date.now() - t0, cortado }));
      res.on('error', falhou);
    });
    req.setTimeout(tempo, () => req.destroy(new Error(`o proxy não respondeu em ${Math.round(tempo / 1000)} s`)));
    req.on('error', (e) => falhou(new Falha(e.code === 'ECONNREFUSED' ? `Nada escutando em 127.0.0.1:${rota.porta}: o proxy está no ar, mas a porta da rota não abriu (veja o log do proxy; porta 80 ocupada é o comum).` : `Requisição pelo proxy falhou: ${e.message}`)));
    if (corpo != null && corpo !== '') req.write(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
    req.end();
  });
}
const cabecalhosDe = (v) => {
  if (!v) return {};
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return Object.fromEntries(v.split(/\r?\n/).map((l) => l.split(/:(.*)/s)).filter((p) => p[1]).map(([k, x]) => [k.trim(), x.trim()])); } }
  if (Array.isArray(v)) return Object.fromEntries(v.filter((x) => x && x.name).map((x) => [x.name, String(x.value ?? '')]));
  return typeof v === 'object' ? v : {};
};

// ---------- nós ----------
const NOS = {
  async status(p, _e, cfg) {
    const est = await noAr(cfg);
    if (!est) return { port: 'false', value: { no_ar: false, painel: cfg.painel, motivo: 'o painel do proxy não respondeu' } };
    const portas = est.servicos.http.filter((s) => !s.ativo).map((s) => s.porta);
    const v = {
      no_ar: true, painel: cfg.painel, porta_http: est.config.porta_http,
      dns: est.servicos.dns, hosts: est.servicos.hosts, reescrever_links: est.config.reescrever_links,
      rotas_http: est.rotas.filter((r) => r.tipo === 'http').length, rotas_tcp: est.rotas.filter((r) => r.tipo === 'tcp').length,
      linhas_invalidas: est.rotas.filter((r) => r.tipo === 'invalida').map((r) => ({ linha: r.linha + 1, texto: r.texto, erro: r.erro })),
      portas_sem_escutar: portas,
    };
    // "inteiro": no ar, sem porta fechada e sem linha que o proxy recusou
    const inteiro = !portas.length && !v.linhas_invalidas.length && v.dns !== 'falhou';
    v.problemas = [...portas.map((x) => `a porta ${x} não abriu (ocupada?)`), ...v.linhas_invalidas.map((l) => `linha ${l.linha} do apontamentos.txt: ${l.erro}`), ...(v.dns === 'falhou' ? ['o DNS local não subiu (porta 53 ocupada?)'] : [])];
    return { port: p.exigir === 'inteiro' && !inteiro ? 'false' : 'true', value: v };
  },

  async ligar(p, _e, cfg) {
    const antes = await noAr(cfg);
    if (antes) return { ligado: true, ja_estava: true, painel: cfg.painel };
    const pasta = await pastaDoProxy(cfg, true);
    if (p.modo === 'admin') {
      // o iniciar.bat pede elevação (o Windows mostra a pergunta) e grava o hosts
      spawn('cmd.exe', ['/c', 'start', '""', '/min', path.join(pasta, 'iniciar.bat')], { cwd: pasta, detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } else {
      spawn(process.execPath, ['proxy.js'], { cwd: pasta, detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
    const segundos = Math.max(5, Math.min(120, Number(p.esperar_s) || 30)), ate = Date.now() + segundos * 1000;
    while (Date.now() < ate) {
      await esperar(700);
      const est = await noAr(cfg);
      if (est) {
        const avisos = [];
        if (p.modo !== 'admin' && est.config.hosts && /falh|erro|negad|perm/i.test(JSON.stringify(est.servicos.hosts))) avisos.push('Sem administrador o hosts não foi atualizado: os nomes locais só resolvem com o DNS do proxy (ou ligue em modo administrador).');
        const fechadas = est.servicos.http.filter((s) => !s.ativo).map((s) => s.porta);
        if (fechadas.length) avisos.push(`Portas que não abriram: ${fechadas.join(', ')} (outro programa usando?).`);
        return { ligado: true, ja_estava: false, painel: cfg.painel, pasta, modo: p.modo === 'admin' ? 'administrador' : 'normal', rotas: est.rotas.filter((r) => r.tipo !== 'invalida').length, avisos };
      }
    }
    throw new Falha(p.modo === 'admin' ? 'O proxy não subiu. A pergunta do Windows (administrador) foi aceita?' : `O proxy não respondeu em ${segundos} s. Rode "node proxy.js" em ${pasta} para ver o erro.`);
  },

  async desligar(p, _e, cfg) {
    const porta = new URL(cfg.painel).port;
    const proc = await processoNaPorta(porta);
    if (!proc) return { desligado: true, ja_estava: true };
    const antes = await noAr(cfg);
    // é o proxy: a linha de comando diz proxy.js, ou (processo de administrador, sem linha visível) é um node e o
    // painel dele responde como o do localhost-proxy
    const ehProxy = /proxy\.js/i.test(proc.comando) || (!proc.comando && proc.nome === 'node' && !!(antes && antes.rotas && antes.servicos));
    if (!ehProxy) throw new Falha(`Quem escuta na porta ${porta} não é o proxy.js (PID ${proc.pid}${proc.comando ? ': ' + proc.comando.slice(0, 120) : proc.nome ? ', ' + proc.nome : ''}). Não mexi.`);
    const pasta = await pastaDoProxy(cfg, false);
    const k = await rodar('taskkill', ['/PID', String(proc.pid), '/T', '/F']);
    if (!k.ok) throw new Falha(/acesso negado|access is denied/i.test(k.err + k.out) ? 'O proxy roda como administrador e o BlueScreen não: feche a janela dele (Ctrl+C), que ele também limpa o hosts.' : `Não consegui encerrar o proxy (PID ${proc.pid}): ${k.err || k.out}`);
    const v = { desligado: true, ja_estava: false, pid: proc.pid };
    // encerrado à força, o proxy não tira o bloco dele do hosts: os nomes locais apontariam para 127.0.0.1 sem ninguém
    if (p.hosts === 'limpar' && pasta) {
      spawn('cmd.exe', ['/c', 'start', '""', '/min', path.join(pasta, 'limpar-hosts.bat')], { cwd: pasta, detached: true, stdio: 'ignore', windowsHide: true }).unref();
      v.hosts = 'limpeza pedida (o Windows pergunta pelo administrador)';
    } else if (!antes || antes.config.hosts) v.aviso = 'Se o proxy tinha gravado o hosts, os nomes locais continuam apontando para 127.0.0.1. Use "Limpar o hosts" neste nó ou o limpar-hosts.bat.';
    return v;
  },

  async rotas(p, _e, cfg) {
    const est = await estado(cfg);
    const f = p.filtro || 'todas';
    return est.rotas.filter((r) => f === 'todas' ? r.tipo !== 'invalida' : f === 'erros' ? r.stats && r.stats.erros > 0 : f === 'invalidas' ? r.tipo === 'invalida' : r.tipo === f)
      .map((r) => r.tipo === 'invalida' ? { tipo: 'invalida', linha: r.linha + 1, texto: r.texto, erro: r.erro } : enxuta(r));
  },

  async apontar(p, entrada, cfg) {
    const est = await estado(cfg);
    const tipo = p.tipo === 'tcp' ? 'tcp' : 'http';
    const destinoBruto = String(p.destino || (typeof entrada === 'string' ? entrada : entrada && (entrada.destino || entrada.url)) || '').trim();
    let corpo, alvo;
    if (tipo === 'tcp') {
      if (!/^.+:\d{1,5}$/.test(destinoBruto)) throw new Falha('No TCP o destino é host:porta (ex.: 203.0.113.10:5432).');
      const porta = Number(p.porta);
      if (!(porta >= 1 && porta <= 65535)) throw new Falha('No TCP informe a porta local (ex.: 5433): o banco fica em 127.0.0.1:<porta>.');
      corpo = { tipo: 'tcp', porta, destino: destinoBruto }; alvo = { tipo: 'tcp', porta };
    } else {
      const u = normalizarDestino(destinoBruto);
      const destino = u.pathname === '/' && !u.search ? u.origin : u.href;
      const porta = p.porta ? Number(p.porta) : est.config.porta_http;
      if (!(porta >= 1 && porta <= 65535)) throw new Falha('Porta local inválida (1 a 65535).');
      // sem nome: um que diga de onde vem (api.cliente.com -> localhost-api-cliente) e que não exista ainda
      const nome = String(p.nome || '').trim().toLowerCase() || sugerirNome(destino, est.rotas.filter((r) => r.tipo === 'http' && r.porta === porta).map((r) => r.nome));
      if (!/^[a-z0-9._-]+$/.test(nome)) throw new Falha(`Nome local inválido: "${nome}". Use letras, números, ponto e hífen.`);
      corpo = { tipo: 'http', nome, destino, ...(porta !== est.config.porta_http ? { porta } : {}) }; alvo = { tipo: 'http', nome, porta };
    }
    const existe = acharRota(est.rotas, alvo, est.config.porta_http);
    const mesmoDestino = (r) => r && r.destino.replace(/\/$/, '') === (tipo === 'tcp' ? corpo.destino : new URL(corpo.destino).origin);
    if (existe && mesmoDestino(existe)) return { criada: false, mudou: false, rota: enxuta(existe), local: existe.local, aviso: 'Já estava assim.' };
    if (existe && p.se_existir !== 'trocar') throw new Falha(`${descreverRota(existe)} já existe com outro destino. Escolha "Trocar o destino" em Se já existir, ou outro nome.`);
    const depois = await api(cfg, 'POST', '/api/rotas', existe ? { ...corpo, original: { linha: existe.linha, texto: existe.texto } } : corpo);
    const nova = acharRota(depois.rotas, alvo, depois.config.porta_http);
    if (!nova) { const inv = depois.rotas.find((r) => r.tipo === 'invalida'); throw new Falha('O proxy não aceitou a rota' + (inv ? `: ${inv.erro}` : '.')); }
    const v = { criada: !existe, mudou: true, rota: enxuta(nova), local: nova.local, ...(existe ? { destino_anterior: existe.destino } : {}) };
    const outra = depois.rotas.find((r) => r.tipo === tipo && r.id !== nova.id && mesmoDestino(r));
    if (outra) v.aviso = `${descreverRota(outra)} já apontava para o mesmo destino.`;
    if (sim(p.testar)) {
      await esperar(400); // o proxy recarrega e abre a porta nova
      v.teste = await api(cfg, 'GET', '/api/testar?id=' + encodeURIComponent(nova.id));
    }
    return v;
  },

  async remover(p, entrada, cfg) {
    const est = await estado(cfg);
    const texto = alvoDe(p.rota, entrada);
    let r;
    try { r = rotaDe(est, texto); } catch (e) { if (p.se_nao_existir === 'ignorar') return { removida: false, motivo: e.message }; throw e; }
    await api(cfg, 'DELETE', '/api/rotas', { linha: r.linha, texto: r.texto });
    return { removida: true, rota: enxuta(r) };
  },

  async testar(p, entrada, cfg) {
    const est = await estado(cfg);
    const texto = alvoDe(p.rota, entrada);
    const lista = String(texto || '').trim() ? [rotaDe(est, texto)] : est.rotas.filter((r) => r.tipo === 'http' || r.tipo === 'tcp');
    if (!lista.length) throw new Falha('O proxy não tem rotas para testar.');
    const res = await Promise.all(lista.map(async (r) => ({ ...enxuta(r), ...(await api(cfg, 'GET', '/api/testar?id=' + encodeURIComponent(r.id))) })));
    const falharam = res.filter((x) => !x.ok);
    const v = { todas_ok: !falharam.length, testadas: res.length, falharam: falharam.length, resultados: res.map((x) => ({ id: x.id, local: x.local, destino: x.destino, ok: x.ok, status: x.status ?? null, ms: x.ms, ...(x.erro ? { erro: x.erro } : {}) })) };
    return { port: v.todas_ok ? 'true' : 'false', value: v };
  },

  async pedir(p, entrada, cfg) {
    const est = await estado(cfg);
    let texto = String(alvoDe(p.rota, entrada) || '').trim(), caminho = String(p.caminho || '').trim();
    // a URL do site original também serve: vira a local
    if (/^https?:\/\//i.test(texto)) {
      const conv = paraLocal(texto, est.rotas);
      if (conv) { const u = new URL(texto); if (!caminho) caminho = u.pathname + u.search; texto = conv.rota.id; }
      else { const u = new URL(texto); if (!caminho && (u.pathname !== '/' || u.search)) caminho = u.pathname + u.search; }
    }
    const r = rotaDe(est, texto);
    if (r.tipo !== 'http') throw new Falha('Requisição só em rota HTTP. Para TCP, use o Testar destinos.');
    if (!caminho.startsWith('/')) caminho = '/' + caminho;
    const metodo = String(p.metodo || 'GET').toUpperCase();
    const cab = cabecalhosDe(p.cabecalhos);
    let corpo = p.corpo;
    if (corpo && typeof corpo === 'object') { corpo = JSON.stringify(corpo); cab['content-type'] ||= 'application/json'; }
    else if (typeof corpo === 'string' && /^\s*[[{]/.test(corpo) && !Object.keys(cab).some((k) => k.toLowerCase() === 'content-type')) cab['content-type'] = 'application/json';
    const x = await pedirLocal(r, { metodo, caminho, cabecalhos: cab, corpo: ['GET', 'HEAD'].includes(metodo) ? undefined : corpo, tempo: Math.max(1, Math.min(300, Number(p.tempo_s) || 30)) * 1000 });
    let json; if (/json/i.test(String(x.headers['content-type'] || ''))) { try { json = JSON.parse(x.corpo); } catch {} }
    const v = { ok: x.status < 400, status: x.status, ms: x.ms, url: r.local.replace(/\/$/, '') + caminho, rota: r.id, headers: x.headers, corpo: json !== undefined ? json : x.corpo, ...(x.cortado ? { aviso: 'Resposta maior que 2 MB: veio só o começo.' } : {}) };
    if (p.falhar_status === 'sim' && x.status >= 400) throw new Falha(`${metodo} ${v.url} respondeu ${x.status}.`);
    return v;
  },

  async disfarce(p, entrada, cfg) {
    const est = await estado(cfg);
    const r = rotaDe(est, alvoDe(p.rota, entrada));
    if (r.tipo !== 'http') throw new Falha('O disfarce é das rotas HTTP (o TCP repassa os bytes como vêm).');
    const caminhos = String(p.caminhos || '/').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20).map((s) => (s.startsWith('/') ? s : '/' + s));
    const paginas = [];
    for (const c of caminhos) {
      const x = await pedirLocal(r, { caminho: c, cabecalhos: { accept: 'text/html,application/json,*/*;q=0.8' } });
      const d = conferirDisfarce(x, r.destino);
      paginas.push({ caminho: c, status: x.status, limpo: d.limpo, vazamentos: d.vazamentos, avisos: d.avisos });
    }
    const vaz = paginas.flatMap((pg) => pg.vazamentos.map((v) => ({ caminho: pg.caminho, ...v })));
    const v = {
      limpo: !vaz.length, rota: r.id, local: r.local, paginas: paginas.length, vazamentos: vaz,
      avisos: paginas.flatMap((pg) => pg.avisos.map((a) => ({ caminho: pg.caminho, ...a }))),
      reescrever_links: est.config.reescrever_links,
      ...(!est.config.reescrever_links && vaz.length ? { dica: 'A reescrita de links está desligada: ligue com o nó Ajustar o proxy (Reescrever links = sim).' } : {}),
    };
    return { port: v.limpo ? 'true' : 'false', value: v };
  },

  async converter(p, entrada, cfg) {
    const est = await estado(cfg);
    const url = String(p.url || (typeof entrada === 'string' ? entrada : entrada && (entrada.url || entrada.local)) || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Falha('Informe uma URL completa, com http:// ou https://.');
    const local = paraOriginal(url, est.rotas, est.config.porta_http);
    if (local && p.direcao !== 'para_local') return { de: url, para: local.url, sentido: 'local → original', rota: local.rota.id };
    const orig = paraLocal(url, est.rotas);
    if (orig) return { de: url, para: orig.url, sentido: 'original → local', rota: orig.rota.id };
    if (p.direcao === 'para_original') throw new Falha(`${url} não é de nenhuma rota do proxy.`);
    if (p.criar !== 'sim') throw new Falha(`Nenhuma rota leva para ${new URL(url).origin}. Marque "Criar a rota se faltar" ou use o nó Apontar um nome.`);
    const criada = await NOS.apontar({ destino: new URL(url).origin, tipo: 'http' }, null, cfg);
    const u = new URL(url);
    return { de: url, para: criada.local.replace(/\/$/, '') + u.pathname + u.search + u.hash, sentido: 'original → local', rota: criada.rota.id, rota_criada: true };
  },

  async ajustar(p, _e, cfg) {
    const chave = String(p.ajuste || '');
    const bool = ['dns', 'hosts', 'reescrever_links', 'log_detalhado'].includes(chave);
    if (!bool && !['porta_http', 'porta_dns', 'dns_upstream'].includes(chave)) throw new Falha('Escolha o que ajustar.');
    const valor = bool ? sim(p.ligado) : String(p.valor ?? '').trim();
    const antes = (await estado(cfg)).config;
    const depois = await api(cfg, 'POST', '/api/config', { chave, valor });
    return { ajuste: chave, antes: antes[chave], depois: depois.config[chave], config: depois.config };
  },

  async trafego(p, entrada, cfg) {
    const est = await estado(cfg);
    const texto = String(alvoDe(p.rota, entrada) || '').trim();
    const rota = texto ? rotaDe(est, texto).id : null;
    return trafego(est.log, { rota, soErros: p.so_erros === 'sim', minutos: Number(p.minutos) || 0, quantas: Number(p.quantas) || 50 });
  },
};

// ---------- entrada ----------
let texto = '';
process.stdin.setEncoding('utf8');
for await (const c of process.stdin) texto += c;
try {
  const pedido = JSON.parse(texto || '{}');
  const fn = Object.hasOwn(NOS, pedido.node) ? NOS[pedido.node] : null;
  if (!fn) throw new Falha('Nó desconhecido: ' + pedido.node);
  const cfg = configuracoes(pedido.data, AQUI);
  if (process.env.PROXY4AUTO_PAINEL) cfg.painel = process.env.PROXY4AUTO_PAINEL; // testes
  const v = await fn(pedido.params || {}, pedido.input ?? null, cfg);
  process.stdout.write(JSON.stringify(v ?? null));
} catch (e) {
  // Falha e os erros de validação (Error) são para a pessoa; o resto é defeito do plugin e vai com a pilha
  process.stderr.write((e instanceof Falha || e.constructor === Error ? e.message : 'Erro no Proxy4Auto: ' + (e.stack || e.message)) + '\n');
  process.exit(1);
}
