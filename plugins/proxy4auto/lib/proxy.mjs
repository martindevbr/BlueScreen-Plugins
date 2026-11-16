// Proxy4Auto: a parte que não depende de rede nem de processo (testável sozinha).
// O localhost-proxy (github.com/martindevbr/proxy-server) põe um serviço da internet atrás de um nome local que
// resolve para 127.0.0.1 e apaga os rastros do destino (links, cookies, cabeçalhos da Vercel e da Cloudflare).
// Os nós falam com o painel dele (http://127.0.0.1:7070 por padrão) e, para ligar e desligar, com a pasta dele.
import fs from 'node:fs';
import path from 'node:path';

export const PAINEL_PADRAO = 'http://127.0.0.1:7070';

// ---------- configurações do plugin ----------
// os valores salvos (<pasta de dados>/settings.json) por cima dos padrões do plugin.json
export function configuracoes(pastaDados, pastaPlugin) {
  const ler = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
  const padroes = Object.fromEntries(((ler(path.join(pastaPlugin, 'plugin.json')) || {}).settings || []).map((s) => [s.key, s.default]));
  const salvas = (pastaDados && ler(path.join(pastaDados, 'settings.json'))) || {};
  const c = { ...padroes, ...salvas };
  return { painel: painelValido(c.painel), pasta: String(c.pasta || '').trim() };
}
// o painel do proxy só responde no próprio PC: endereço de outra máquina nem é tentado
export function painelValido(v) {
  let u;
  try { u = new URL(String(v || '').trim() || PAINEL_PADRAO); } catch { throw new Error(`Endereço do painel inválido: "${v}". Use algo como ${PAINEL_PADRAO}.`); }
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw new Error(`O painel do proxy só responde neste PC: use http://127.0.0.1:<porta> (está "${v}").`);
  return `http://127.0.0.1:${u.port || 80}`;
}

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
// destino no formato que o proxy entende (o mesmo normalizarDestino do proxy.js)
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

// ---------- tráfego ----------
// linhas de requisição do log do painel ("nome GET /x 200 34ms") viram objetos; filtro por rota, erro e janela
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
    itens: lista,
  };
}
