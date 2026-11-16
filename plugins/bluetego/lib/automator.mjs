// Bluetego no Automator: o mesmo que a tela faz (primeiro olhar, máquinas, transformações), só que sem grafo
// desenhado. Monta o grafo em memória, devolve um resumo pronto para os próximos nós e, se pedido, grava como
// investigação (o arquivo é o mesmo da tela, então ela abre o resultado como se tivesse rodado lá).
// Nada aqui faz rede: quem consulta as fontes é a função "transformar" que o servidor passa.
import { chave } from './entidades.mjs';

// a parte registrável: www.loja.exemplo.com.br -> exemplo.com.br (igual à tela: o escopo de uma investigação de domínio)
const SUFIXO_DUPLO = /^(com|net|org|gov|edu|co|ac|art|blog|eco|ind|inf|adv|eng|med|nom|tv)\.[a-z]{2}$/;
export const baseDominio = (d) => { const l = String(d).toLowerCase().split('.'); return l.slice(l.length >= 3 && SUFIXO_DUPLO.test(l.slice(-2).join('.')) ? -3 : -2).join('.'); };
const agora = () => new Date().toISOString();

export function novoGrafo(semente) {
  const g = { nos: new Map(), lig: new Map(), historico: [] };
  no(g, semente);
  return g;
}
function no(g, e) {
  let n = g.nos.get(e.id);
  if (!n) { n = { id: e.id, tipo: e.tipo, valor: e.valor, rotulo: e.rotulo || '', props: { ...(e.props || {}) }, notas: '', cor: '', fixo: false, alerta: !!e.alerta, feitas: [], criado: agora() }; g.nos.set(n.id, n); return [n, true]; }
  for (const [k, v] of Object.entries(e.props || {})) if (v !== '' && v != null) n.props[k] = v;
  if (!n.rotulo && e.rotulo) n.rotulo = e.rotulo;
  if (e.alerta) n.alerta = true;
  return [n, false];
}
function ligar(g, de, para, rotulo, t) {
  if (de === para) return;
  const id = de + '>' + para, l = g.lig.get(id);
  if (l) { if (rotulo && !l.rotulo.split(' · ').includes(rotulo)) l.rotulo = (l.rotulo ? l.rotulo + ' · ' : '') + rotulo; return; }
  g.lig.set(id, { id, de, para, rotulo: rotulo || '', t: t || '' });
}
// junta o resultado de uma transformação ao grafo (como aplicar() da tela); devolve os ids novos
export function aplicar(g, origem, tId, r) {
  const novos = [];
  Object.assign(origem.props, r.props || {});
  if (!origem.feitas.includes(tId)) origem.feitas.push(tId);
  if (r.alerta) origem.alerta = true;
  for (const e of r.entidades || []) {
    let pai = origem;
    if (e.de) { const [p, novo] = no(g, { id: e.de.id || chave(e.de.tipo, e.de.valor), tipo: e.de.tipo, valor: e.de.valor }); pai = p; if (novo) novos.push(p.id); ligar(g, origem.id, pai.id, '', tId); }
    const [n, novo] = no(g, { ...e, id: e.id || chave(e.tipo, e.valor) });
    if (novo) novos.push(n.id);
    ligar(g, pai.id, n.id, e.ligacao, tId);
  }
  return novos;
}

// roda um roteiro (máquina ou primeiro olhar) a partir da semente. transformar(tId, no, poda) -> resultado de rodar().
// Mesmas regras da tela: "tipos", "max", escopo do domínio, cada transformação uma vez por entidade, até 600 novas.
export async function roteiro(g, semente, passos, { escopo = false, transformar, nomes = {}, paralelo = 4, tetoNovas = 600, avisar = () => {} } = {}) {
  const daMaquina = new Set([semente.id]), feitas = new Set();
  const erros = [], avisos = [];
  let novas = 0, foraDoEscopo = 0, parouNoTeto = false;
  for (const p of passos) {
    const de = nomes[p.t] && nomes[p.t].de;
    if (!de) { avisos.push(`Passo pulado: a transformação ${p.t} não existe mais.`); continue; }
    let alvos = [...daMaquina].map((id) => g.nos.get(id)).filter((n) => n && de.includes(n.tipo) && (!p.tipos || p.tipos.includes(n.tipo)) && !feitas.has(p.t + '|' + n.id));
    if (escopo && semente.tipo === 'dominio') { const b = baseDominio(semente.valor), antes = alvos.length; alvos = alvos.filter((n) => n.tipo !== 'dominio' || baseDominio(n.valor) === b); foraDoEscopo += antes - alvos.length; }
    if (p.max) alvos = alvos.slice(0, p.max);
    if (!alvos.length) continue;
    alvos.forEach((n) => feitas.add(p.t + '|' + n.id));
    avisar(`${nomes[p.t].nome} em ${alvos.length === 1 ? alvos[0].valor : alvos.length + ' entidades'}`);
    const poda = p.lim != null || p.so ? { lim: p.lim, so: p.so } : null;
    const fila = [...alvos];
    const trabalhar = async () => {
      while (fila.length) {
        const n = fila.shift();
        try {
          const r = await transformar(p.t, n, poda);
          const ids = aplicar(g, n, p.t, r).concat((r.entidades || []).map((e) => e.id));
          if (r.aviso) avisos.push(`${nomes[p.t].nome} em ${n.valor}: ${r.aviso}`);
          for (const id of ids) if (!daMaquina.has(id)) { daMaquina.add(id); novas++; }
        } catch (e) { erros.push(`${nomes[p.t].nome} em ${n.valor}: ${e.message || e}`); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(paralelo, alvos.length) }, trabalhar));
    if (novas > tetoNovas) { parouNoTeto = true; avisos.push(`Parou: mais de ${tetoNovas} entidades novas.`); break; }
  }
  return { novas, erros, avisos, foraDoEscopo, parouNoTeto };
}

// o que sai do nó: a semente, as entidades por tipo, os alertas em destaque e as ligações em texto
export function resumir(g, semente, tipos = {}, extra = {}) {
  const nomeTipo = (t) => (tipos[t] && tipos[t].nome) || t;
  const ent = [...g.nos.values()].filter((n) => n.id !== semente.id);
  const plano = (n) => ({ tipo: n.tipo, tipo_nome: nomeTipo(n.tipo), valor: n.valor, ...(n.rotulo ? { rotulo: n.rotulo } : {}), ...(n.alerta ? { alerta: true } : {}), ...(Object.keys(n.props).length ? { props: n.props } : {}) });
  const porTipo = {};
  for (const n of ent) (porTipo[n.tipo] ||= []).push(n.valor);
  const s = g.nos.get(semente.id) || semente;
  const alertas = [...g.nos.values()].filter((n) => n.alerta).map(plano);
  const rot = (id) => { const n = g.nos.get(id); return n ? n.rotulo || n.valor : id; };
  return {
    semente: { tipo: s.tipo, tipo_nome: nomeTipo(s.tipo), valor: s.valor, ...(s.alerta ? { alerta: true } : {}), props: s.props || {} },
    total: ent.length,
    contagem: Object.fromEntries(Object.entries(porTipo).map(([t, l]) => [t, l.length])),
    por_tipo: porTipo,
    tem_alerta: alertas.length > 0,
    alertas,
    entidades: ent.map(plano),
    ligacoes: [...g.lig.values()].map((l) => ({ de: rot(l.de), para: rot(l.para), ...(l.rotulo ? { como: l.rotulo } : {}) })),
    ...extra,
  };
}

// a investigação no formato da tela (investigacoes/<id>.json); sem x/y a tela distribui as entidades ao abrir
export function comoInvestigacao(g, nome) {
  const id = Math.random().toString(36).slice(2, 10);
  return { versao: 1, id, nome: String(nome || '').trim() || 'Automator ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }), criada: agora(), alterada: agora(), nos: [...g.nos.values()], ligacoes: [...g.lig.values()], historico: g.historico.slice(0, 300) };
}

// a lista de alertas de qualquer saída do Bluetego (Investigar, Rodar transformação) ou de uma lista de entidades
export function alertasDe(x) {
  if (!x || typeof x !== 'object') return [];
  if (Array.isArray(x)) return x.filter((e) => e && e.alerta);
  if (Array.isArray(x.alertas)) return x.alertas;
  return [...(x.semente && x.semente.alerta ? [x.semente] : []), ...(Array.isArray(x.entidades) ? x.entidades.filter((e) => e && e.alerta) : [])];
}
