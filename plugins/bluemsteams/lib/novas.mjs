// Lógica pura do nó "Mensagens novas": o que conta como novo desde a última consulta e o novo ponto de partida.
// Sem rede e sem disco, para dar para testar (tests/novas.test.mjs).

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// lista: mensagens já normalizadas ({ id, deId, texto, assunto, quando }), em qualquer ordem.
// antes: { desde (ms), vistos: [ids] }, o cursor gravado na consulta anterior.
// filtro: texto que precisa aparecer; quem: ids de quem vale (null: todos); me: o seu id, para ignorar o que você mandou.
// Devolve { novas (da mais antiga para a mais nova), cursor }.
export function filtrarNovas(lista, antes, { filtro = '', quem = null, me = '' } = {}) {
  const f = semAcento(filtro).trim();
  const vistos = new Set(antes.vistos || []);
  const ordem = lista.slice().sort((a, b) => (Date.parse(a.quando) || 0) - (Date.parse(b.quando) || 0));
  const depois = ordem.filter((m) => (Date.parse(m.quando) || 0) >= antes.desde && !vistos.has(m.id));
  const novas = depois.filter((m) => (!me || m.deId !== me) && (!quem || quem.includes(m.deId)) && (!f || semAcento(`${m.texto} ${m.assunto || ''}`).includes(f)));
  const ultima = ordem.reduce((t, m) => Math.max(t, Date.parse(m.quando) || 0), antes.desde);
  // as mensagens do mesmo milissegundo da última ficam anotadas, para não voltarem na próxima consulta
  const noMesmo = ordem.filter((m) => (Date.parse(m.quando) || 0) === ultima).map((m) => m.id);
  return { novas, cursor: { desde: ultima, vistos: ultima === antes.desde ? [...new Set([...(antes.vistos || []), ...noMesmo])] : noMesmo } };
}
