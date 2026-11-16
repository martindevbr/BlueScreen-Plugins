// Proxy4Auto: a parte que não depende de rede nem de processo (testável sozinha).
// O proxy vem embutido no plugin (lib/motor.mjs): põe um serviço da internet atrás de um nome local que resolve para
// 127.0.0.1 e apaga os rastros do destino (links, cookies, cabeçalhos da Vercel e da Cloudflare).
// Os nós montam um projeto (Novo proxy, Rota...), o Ligar o proxy sobe o motor e segura o fluxo; os outros nós
// falam com o motor pela porta de controle (127.0.0.1:7170 por padrão).
import fs from 'node:fs';
import path from 'node:path';

export const PORTA_PADRAO = 7170;

// ---------- configurações do plugin ----------
// os valores salvos (<pasta de dados>/settings.json) por cima dos padrões do plugin.json
export function configuracoes(pastaDados, pastaPlugin) {
  const ler = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; } };
  const padroes = Object.fromEntries(((ler(path.join(pastaPlugin, 'plugin.json')) || {}).settings || []).map((s) => [s.key, s.default]));
  const salvas = (pastaDados && ler(path.join(pastaDados, 'settings.json'))) || {};
  const c = { ...padroes, ...salvas };
  const porta = portaValida(c.porta);
  return {
    porta, painel: `http://127.0.0.1:${porta}`,
    dados: pastaDados || '',
    // as rotas e os ajustes do proxy ficam aqui, em texto: config.txt, apontamentos.txt e proxy.log
    pastaProxy: pastaDados ? path.join(pastaDados, 'proxy') : '',
  };
}
export function portaValida(v) {
  const s = String(v ?? '').trim();
  if (!s) return PORTA_PADRAO;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error(`Porta de controle inválida: "${v}". Use um número de 1024 a 65535 (o padrão é ${PORTA_PADRAO}).`);
  return n;
}

// as rotas lidas direto do apontamentos.txt, para o que funciona com o proxy desligado (a lista dos campos)
export function lerApontamentos(texto, portaHttp = 80) {
  const rotas = [];
  String(texto || '').split(/\r?\n/).forEach((l, linha) => {
    const s = l.trim();
    if (!s || s.startsWith('#')) return;
    const p = s.replace(/\s+#.*$/, '').split(/\s+/).filter((x) => !['->', '=>', '='].includes(x));
    if (p[0].toLowerCase() === 'tcp') {
      const porta = Number(p[1]);
      if (porta && /^.+:\d+$/.test(p[2] || '')) rotas.push({ linha, texto: s, tipo: 'tcp', id: `tcp:${porta}`, porta, local: `127.0.0.1:${porta}`, destino: p[2] });
      return;
    }
    const m = p[0].toLowerCase().match(/^([a-z0-9._-]+?)(?::(\d+))?$/);
    if (!m || !p[1]) return;
    let destino; try { destino = new URL(/^[a-z]+:\/\//i.test(p[1]) ? p[1] : 'http://' + p[1]).origin; } catch { return; }
    const porta = m[2] ? Number(m[2]) : portaHttp;
    rotas.push({ linha, texto: s, tipo: 'http', id: `${m[1]}:${porta}`, nome: m[1], porta, local: 'http://' + m[1] + (porta === 80 ? '' : ':' + porta), destino });
  });
  return rotas;
}
export const portaHttpDe = (textoConfig) => Number((String(textoConfig || '').match(/^\s*porta_http\s*=\s*(\d+)/m) || [])[1]) || 80;

// ---------- rotas ----------
// o que a pessoa escreve para escolher uma rota: "localhost-api", "localhost-api:6544", "http://localhost-api:6544/x",
// "tcp 5433", "tcp:5433", ou o id que a lista do campo grava ("localhost-api:80")
export function lerAlvo(texto) {
  let s = String(texto ?? '').trim();
  if (!s) return null;
  const tcp = s.match(/^tcp\s*[: ]\s*(\d{1,5})$/i);
  if (tcp) return { tipo: 'tcp', porta: Number(tcp[1]) };
  if (/^127\.0\.0\.1:\d{1,5}$/.test(s)) return { tipo: 'tcp', porta: Number(s.split(':')[1]) };
  if (/^[a-z]+:\/\//i.test(s)) {
    let u; try { u = new URL(s); } catch { return null; }
    return { tipo: 'http', nome: u.hostname.toLowerCase(), porta: u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80), url: u };
  }
  s = s.replace(/\/.*$/, '');
  const m = s.toLowerCase().match(/^([a-z0-9._-]+?)(?::(\d{1,5}))?$/);
  if (!m) return null;
  return { tipo: 'http', nome: m[1], porta: m[2] ? Number(m[2]) : null };
}
// acha a rota do alvo; porta vazia vale a porta_http do proxy, e, se o nome só existe numa porta, essa
export function acharRota(rotas, alvo, portaHttp = 80) {
  if (!alvo) return null;
  if (alvo.tipo === 'tcp') return rotas.find((r) => r.tipo === 'tcp' && r.porta === alvo.porta) || null;
  const doNome = rotas.filter((r) => r.tipo === 'http' && r.nome === alvo.nome);
  if (alvo.porta) return doNome.find((r) => r.porta === alvo.porta) || null;
  return doNome.find((r) => r.porta === portaHttp) || (doNome.length === 1 ? doNome[0] : null);
}
export const descreverRota = (r) => r.tipo === 'tcp' ? `tcp ${r.porta} → ${r.destino}` : `${r.local} → ${r.destino}`;

// www.site.com e site.com são o mesmo site para o proxy
const semWww = (h) => String(h || '').toLowerCase().replace(/^www\./, '');
// a parte registrável: api.loja.exemplo.com.br -> exemplo.com.br
const SUFIXO_DUPLO = /^(com|net|org|gov|edu|co|ac|art|blog|eco|ind|inf|adv|eng|med|nom|tv)\.[a-z]{2}$/;
export const baseDominio = (h) => { if (/^[\d.]+$|:/.test(h)) return String(h); const l = semWww(h).split('.'); return l.slice(l.length >= 3 && SUFIXO_DUPLO.test(l.slice(-2).join('.')) ? -3 : -2).join('.'); };

// nome local sugerido para um destino: https://api.meucliente.com.br -> localhost-api-meucliente
export function sugerirNome(destino, usados = []) {
  let host;
  try { host = new URL(/^[a-z]+:\/\//i.test(destino) ? destino : 'http://' + destino).hostname; } catch { host = ''; }
  let nome;
  if (!host || /^[\d.]+$/.test(host) || host.includes(':')) nome = 'localhost-servico';
  else {
    const base = baseDominio(host), resto = semWww(host).slice(0, -base.length).replace(/\.$/, '');
    nome = 'localhost-' + [...resto.split('.').filter(Boolean), base.split('.')[0]].join('-');
  }
  nome = nome.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/-+/g, '-').replace(/-$/, '').slice(0, 60);
  let final = nome, i = 2;
  while (usados.includes(final)) final = `${nome}-${i++}`;
  return final;
}
// destino no formato que o proxy entende (o mesmo normalizarDestino do motor)
export function normalizarDestino(d) {
  let s = String(d || '').trim();
  if (!s) throw new Error('Informe o destino (ex.: https://api.exemplo.com).');
  if (/\s/.test(s)) throw new Error('O destino não pode ter espaços.');
  if (!/^[a-z]+:\/\//i.test(s)) s = 'http://' + s;
  const u = new URL(s);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`O proxy só repassa http e https (está ${u.protocol.replace(':', '')}). Para banco, Redis e afins use o tipo TCP.`);
  return u;
}

// endereço do site original -> endereço local (ou o contrário), pelas rotas HTTP
export function paraLocal(url, rotas) {
  const u = new URL(url);
  const r = rotas.find((x) => x.tipo === 'http' && (() => { try { const d = new URL(x.destino); return semWww(d.hostname) === semWww(u.hostname) && d.protocol === u.protocol && (d.port || '') === (u.port || ''); } catch { return false; } })());
  if (!r) return null;
  return { rota: r, url: r.local.replace(/\/$/, '') + u.pathname + u.search + u.hash };
}
export function paraOriginal(url, rotas, portaHttp = 80) {
  const alvo = lerAlvo(url);
  const r = alvo && alvo.tipo === 'http' ? acharRota(rotas, { ...alvo, porta: alvo.url && alvo.url.port ? alvo.porta : portaHttp }, portaHttp) || acharRota(rotas, { ...alvo, porta: null }, portaHttp) : null;
  if (!r) return null;
  return { rota: r, url: r.destino.replace(/\/$/, '') + alvo.url.pathname + alvo.url.search + alvo.url.hash };
}

// ---------- o projeto do proxy (o que os nós montam) ----------
// Novo proxy começa um projeto, cada nó Rota devolve um projeto com mais uma rota e o Ligar o proxy sobe o que
// chegar. O projeto é um objeto comum que anda pelas ligações do fluxo; nenhum nó de montagem mexe no PC.
const simNao = (v, padrao) => (v == null || v === '' ? padrao : v === true || /^(sim|true|1|on)$/i.test(String(v)));
const portaDe = (v, oQue) => { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${oQue} inválida: "${v}" (use de 1 a 65535).`); return n; };
export const ehProjeto = (v) => !!v && typeof v === 'object' && v.proxy4auto === 'projeto' && Array.isArray(v.rotas);
export function novoProjeto(p = {}) {
  return {
    proxy4auto: 'projeto',
    porta_http: p.porta_http == null || p.porta_http === '' ? 80 : portaDe(p.porta_http, 'Porta HTTP'),
    nomes: p.nomes === 'hosts' ? 'hosts' : 'nenhum',
    reescrever_links: simNao(p.reescrever_links, true),
    rede: simNao(p.rede, false),
    dns: simNao(p.dns, false),
    log_detalhado: simNao(p.log_detalhado, false),
    rotas: [],
  };
}
const idDe = (r) => (r.tipo === 'tcp' ? `tcp:${r.porta}` : `${r.nome}:${r.porta}`);
const localDe = (r) => (r.tipo === 'tcp' ? `127.0.0.1:${r.porta}` : 'http://' + r.nome + (r.porta === 80 ? '' : ':' + r.porta));
// o projeto com mais uma rota (não muda o que recebeu). A mesma rota de novo não duplica; o mesmo nome com outro
// destino é erro, porque num fluxo isso é quase sempre engano
export function comRota(proj, r) {
  let nova;
  if (r.tipo === 'tcp') {
    const destino = String(r.destino || '').trim();
    if (!/^[^\s:]+:\d{1,5}$/.test(destino.replace(/^\[.*\]/, 'x'))) throw new Error('No TCP o destino é host:porta (ex.: 203.0.113.10:5432).');
    if (r.porta == null || r.porta === '') throw new Error('No TCP informe a porta local (ex.: 5433): o serviço fica em 127.0.0.1:<porta>.');
    nova = { tipo: 'tcp', porta: portaDe(r.porta, 'Porta local'), destino };
  } else {
    const u = normalizarDestino(r.destino);
    const destino = u.pathname === '/' && !u.search ? u.origin : u.href;
    const porta = r.porta == null || r.porta === '' ? proj.porta_http : portaDe(r.porta, 'Porta local');
    const nome = String(r.nome || '').trim().toLowerCase() || sugerirNome(destino, proj.rotas.filter((x) => x.tipo === 'http' && x.porta === porta && x.destino !== destino).map((x) => x.nome));
    if (!/^[a-z0-9._-]+$/.test(nome)) throw new Error(`Nome local inválido: "${nome}". Use letras, números, ponto e hífen.`);
    nova = { tipo: 'http', nome, porta, destino };
  }
  nova.id = idDe(nova); nova.local = localDe(nova);
  const igual = proj.rotas.find((x) => x.id === nova.id);
  if (igual) {
    if (igual.destino === nova.destino) return proj;
    throw new Error(`${descreverRota(igual)} já está neste proxy com outro destino. Use outro nome${nova.tipo === 'tcp' ? ' (outra porta)' : ''}.`);
  }
  if (proj.rotas.some((x) => x.porta === nova.porta && x.tipo !== nova.tipo)) throw new Error(`A porta ${nova.porta} já é usada por uma rota ${nova.tipo === 'tcp' ? 'HTTP' : 'TCP'} deste proxy.`);
  return { ...proj, rotas: [...proj.rotas, nova] };
}
// várias de uma vez, uma por linha: "nome destino", "nome:porta destino", "tcp porta destino:porta" ou só o destino
export function comRotas(proj, texto) {
  let n = 0;
  for (const bruta of (Array.isArray(texto) ? texto : String(texto || '').split(/\r?\n/))) {
    const s = String(bruta).trim();
    if (!s || s.startsWith('#')) continue;
    n++;
    const p = s.split(/\s+/).filter((x) => !['->', '=>', '='].includes(x));
    try {
      if (p[0].toLowerCase() === 'tcp') proj = comRota(proj, { tipo: 'tcp', porta: p[1], destino: p[2] });
      else if (p.length === 1) proj = comRota(proj, { tipo: 'http', destino: p[0] });
      else { const m = p[0].match(/^(.+?)(?::(\d+))?$/); proj = comRota(proj, { tipo: 'http', nome: m[1], porta: m[2], destino: p[1] }); }
    } catch (e) { throw new Error(`Linha ${n} ("${s}"): ${e.message}`); }
  }
  if (!n) throw new Error('Escreva as rotas, uma por linha: "nome destino" ou só o destino.');
  return proj;
}
// os dois arquivos de texto que o motor lê, escritos a partir do projeto
export function textoDasRotas(proj) {
  return ['# Rotas do proxy: escritas pelo nó Ligar o proxy a partir do fluxo. Mude no fluxo, não aqui.',
    ...proj.rotas.map((r) => (r.tipo === 'tcp' ? `tcp ${r.porta} ${r.destino}` : `${r.porta === proj.porta_http ? r.nome : r.nome + ':' + r.porta} ${r.destino}`)), ''].join('\r\n');
}
export function textoDosAjustes(proj) {
  const sn = (v) => (v ? 'sim' : 'nao'), at = (v) => (v ? 'ativo' : 'desativado');
  return ['# Ajustes do proxy: escritos pelo nó Ligar o proxy a partir do fluxo. Mude no fluxo, não aqui.',
    `porta_http=${proj.porta_http}`, `dns=${at(proj.dns)}`, 'porta_dns=53', 'dns_upstream=8.8.8.8', `hosts=${at(proj.nomes === 'hosts')}`,
    `reescrever_links=${sn(proj.reescrever_links)}`, `rede=${sn(proj.rede)}`, `log_detalhado=${sn(proj.log_detalhado)}`, ''].join('\r\n');
}

// ---------- o disfarce ----------
// O que entrega o destino numa resposta que passou pelo proxy. Vazamento: o domínio do destino num cabeçalho ou num
// link do corpo, cabeçalhos da Vercel ou da Cloudflare, cookie preso ao domínio de lá. Aviso: o que o próprio proxy
// deixa de propósito (cdnjs.cloudflare.com e cookies __cf_bm no corpo) ou o nome do site citado em texto.
export function conferirDisfarce({ status, headers = {}, corpo = '' }, destino) {
  const vaz = [], avisos = [];
  const host = semWww(new URL(destino).hostname), base = baseDominio(host);
  const reHost = new RegExp(`(?:^|[^a-z0-9.-])(?:[a-z0-9-]+\\.)*${base.replace(/\./g, '\\.')}(?![a-z0-9-])`, 'i');
  const trecho = (t, i) => String(t).slice(Math.max(0, i - 40), i + 60).replace(/\s+/g, ' ').trim();
  for (const [k0, v0] of Object.entries(headers)) {
    const k = k0.toLowerCase(), vals = Array.isArray(v0) ? v0 : [v0];
    for (const v of vals.map(String)) {
      if (/^x-vercel-|^x-now-/.test(k) || /vercel/i.test(v)) vaz.push({ onde: 'cabeçalho', nome: k0, o_que: 'Vercel', trecho: v.slice(0, 120) });
      else if (/^cf-/.test(k) || (k === 'server' && /cloudflare/i.test(v)) || ((k === 'nel' || k === 'report-to') && /cloudflare/i.test(v))) vaz.push({ onde: 'cabeçalho', nome: k0, o_que: 'Cloudflare', trecho: v.slice(0, 120) });
      else if (k === 'set-cookie' && /;\s*domain=/i.test(v) && baseDominio(v.match(/;\s*domain=([^;]+)/i)[1].trim().replace(/^\./, '')) === base) vaz.push({ onde: 'cabeçalho', nome: k0, o_que: 'cookie preso ao domínio do destino', trecho: v.slice(0, 120) });
      else if (reHost.test(v)) vaz.push({ onde: 'cabeçalho', nome: k0, o_que: 'domínio do destino', trecho: v.slice(0, 120) });
    }
  }
  const texto = String(corpo || '');
  if (texto) {
    const reLink = new RegExp(`(?:https?:)?(?:\\\\?/){2}(?:[a-z0-9-]+\\.)*${base.replace(/\./g, '\\.')}(?![a-z0-9-])|https?%3A%2F%2F(?:[a-z0-9-]+\\.)*${base.replace(/\./g, '\\.')}`, 'gi');
    const links = [...texto.matchAll(reLink)];
    if (links.length) vaz.push({ onde: 'corpo', o_que: `link para o destino (${links.length}×)`, trecho: trecho(texto, links[0].index) });
    const vercel = texto.match(/(?:[a-z0-9-]+\.)*vercel(?:-[a-z]+)?\.(?:app|com|live|sh)\b|\/_vercel\//i);
    if (vercel) vaz.push({ onde: 'corpo', o_que: 'Vercel', trecho: trecho(texto, vercel.index) });
    if (!links.length) {
      const citado = texto.match(new RegExp(`\\b${host.replace(/\./g, '\\.')}\\b`, 'i'));
      if (citado) avisos.push({ onde: 'corpo', o_que: 'o nome do site aparece no texto (não é link, o proxy não troca)', trecho: trecho(texto, citado.index) });
    }
    const cf = texto.match(/cdnjs\.cloudflare\.com|challenges\.cloudflare\.com|__cf_bm|cf_clearance/i);
    if (cf) avisos.push({ onde: 'corpo', o_que: 'Cloudflare no corpo (o proxy deixa de propósito para não quebrar CDN e Turnstile)', trecho: trecho(texto, cf.index) });
  }
  if (status >= 500) avisos.push({ onde: 'status', o_que: `o destino respondeu ${status}`, trecho: '' });
  return { limpo: vaz.length === 0, vazamentos: vaz, avisos };
}

// ---------- hosts ----------
// o bloco que o proxy grava no hosts do Windows (as mesmas marcas do motor), tirado como ele mesmo tira
const MARCA_INI = '# >>> proxy4auto (gerado automaticamente, nao edite este bloco)';
const MARCA_FIM = '# <<< proxy4auto';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const nomesNoHosts = (texto) => { const m = String(texto).match(new RegExp(`${esc(MARCA_INI)}([\\s\\S]*?)${esc(MARCA_FIM)}`)); return m ? m[1].split(/\r?\n/).map((l) => l.trim().split(/\s+/)[1]).filter(Boolean) : []; };
export function semBlocoDoProxy(texto) {
  return String(texto).replace(new RegExp(`\\r?\\n?${esc(MARCA_INI)}[\\s\\S]*?${esc(MARCA_FIM)}\\r?\\n?`), '\r\n');
}

// ---------- tráfego ----------
// linhas de requisição do log do proxy ("nome GET /x 200 34ms") viram objetos; filtro por rota, erro e janela
export function trafego(log, { rota = null, soErros = false, minutos = 0, quantas = 50, agora = Date.now() } = {}) {
  const desde = minutos > 0 ? agora - minutos * 60000 : 0;
  const itens = (log || []).filter((r) => r && r.tipo === 'req' && r.t >= desde && (!rota || r.rota === rota) && (!soErros || !r.status || r.status >= 400))
    .map((r) => ({ quando: new Date(r.t).toISOString(), rota: r.rota, metodo: r.metodo, caminho: r.caminho, status: r.status || 0, ms: r.ms, falhou: !r.status }));
  const lista = itens.slice(-Math.max(1, quantas)).reverse();
  const ms = itens.map((x) => x.ms).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    total: itens.length,
    erros: itens.filter((x) => !x.status || x.status >= 500).length,
    nao_encontrados: itens.filter((x) => x.status >= 400 && x.status < 500).length,
    ms_mediano: ms.length ? ms[Math.floor(ms.length / 2)] : null,
    ms_maximo: ms.length ? ms[ms.length - 1] : null,
    por_rota: Object.values(itens.reduce((a, x) => { const g = (a[x.rota] ||= { rota: x.rota, total: 0, erros: 0, ms_maximo: 0 }); g.total++; if (!x.status || x.status >= 500) g.erros++; if (x.ms > g.ms_maximo) g.ms_maximo = x.ms; return a; }, {})).sort((a, b) => b.total - a.total),
    mais_lentas: [...itens].filter((x) => Number.isFinite(x.ms)).sort((a, b) => b.ms - a.ms).slice(0, 5).map((x) => ({ rota: x.rota, metodo: x.metodo, caminho: x.caminho, status: x.status, ms: x.ms })),
    itens: lista,
  };
}
