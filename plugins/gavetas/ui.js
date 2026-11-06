const { $, esc, toast } = bs;
const CORES = ['#E8A33D', '#E5534B', '#D96BA8', '#9A6DD7', '#4C8DF6', '#2BB3C0', '#3FB950', '#8B949E'];
const G = { grupos: [] };
const original = { renderStrip: window.renderStrip, btnState: window.btnState, showMenu: window.showMenu };

const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pasta = (cor, aberta) => `<svg class="i pz-ico" viewBox="0 0 24 24" style="--pz:${esc(cor)}">${aberta
  ? '<path d="M3 7.5V6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h8A1.5 1.5 0 0 1 20 8.5V10"/><path d="M2.6 11.6A1.3 1.3 0 0 1 3.9 10h16.8a1.3 1.3 0 0 1 1.27 1.6l-1.5 6.2A1.5 1.5 0 0 1 19 19H4.5A1.5 1.5 0 0 1 3 17.6z"/>'
  : '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>'}</svg>`;
const grupoDe = (toolId) => G.grupos.find((g) => g.tools.includes(toolId));

function salvar() {
  G.grupos = G.grupos.filter((g) => g.tools.length);
  plugin.data.set('grupos', G.grupos).catch((e) => toast('Não deu para salvar as gavetas: ' + e.message, 'err'));
  window.renderStrip();
}

function colocar(toolId, g) {
  const atual = grupoDe(toolId);
  if (atual) atual.tools = atual.tools.filter((t) => t !== toolId);
  if (g) g.tools.push(toolId);
  salvar();
}

function nova(toolId) {
  const g = { id: novoId(), nome: 'Nova gaveta', cor: CORES[G.grupos.length % CORES.length], aberta: true, tools: [] };
  G.grupos.push(g);
  colocar(toolId, g);
  editar(g);
}

function marcarAtiva() {
  const semPainel = $('#app').classList.contains('no-tool');
  document.querySelectorAll('#strip .pz-btn').forEach((b) => {
    const g = G.grupos.find((x) => x.id === b.dataset.pz);
    const caixa = b.nextElementSibling;
    const ativo = (!semPainel && g.tools.includes(bs.S.tool)) || !!(caixa && caixa.querySelector('[data-tool].on'));
    b.classList.toggle('on', !!g && !g.aberta && ativo);
  });
}

function decorar() {
  const strip = $('#strip');
  if (!strip || strip.classList.contains('arrange')) return;
  for (const g of G.grupos) {
    const membros = [...strip.querySelectorAll('[data-tool]')].filter((b) => g.tools.includes(b.dataset.tool));
    if (!membros.length) continue;
    const titulo = g.tools.map((id) => (BS.tools.get(id) || {}).title).filter(Boolean).join(', ');
    membros[0].insertAdjacentHTML('beforebegin', `<button class="icon-btn pz-btn" data-pz="${g.id}" style="--pz:${esc(g.cor)}" aria-label="${esc(g.nome)}" title="${esc(titulo)}">${pasta(g.cor, g.aberta)}<span class="lbl">${esc(g.nome)}</span><span class="k pz-n">${membros.length}</span></button><div class="pz-grupo${g.aberta ? '' : ' fechada'}" data-pz="${g.id}" style="--pz:${esc(g.cor)}"></div>`);
    const caixa = membros[0].previousElementSibling;
    caixa.append(...membros);
  }
  strip.querySelectorAll('.pz-btn').forEach((b) => {
    const g = G.grupos.find((x) => x.id === b.dataset.pz);
    b.onclick = () => { g.aberta = !g.aberta; salvar(); };
    b.oncontextmenu = (e) => menuPasta(e, g);
  });
  marcarAtiva();
}

function menuPasta(e, g) {
  const todos = BS.tools.list();
  original.showMenu(e, [
    { label: 'Renomear e mudar a cor…', icon: bs.I.edit, action: () => editar(g) },
    { label: 'Cor', sub: CORES.map((c) => ({ label: c, icon: pasta(c), action: () => { g.cor = c; salvar(); } })) },
    { label: 'Painéis nesta gaveta', sub: todos.map((t) => ({ label: (g.tools.includes(t.id) ? '✓ ' : '    ') + t.title, icon: t.icon, action: () => colocar(t.id, g.tools.includes(t.id) ? null : g) })) },
    '-',
    { label: g.aberta ? 'Recolher' : 'Expandir', action: () => { g.aberta = !g.aberta; salvar(); } },
    { label: 'Desfazer a gaveta', icon: bs.I.x, sub: [{ label: 'Sim, os painéis voltam soltos para a barra', action: () => { G.grupos = G.grupos.filter((x) => x !== g); salvar(); } }] },
  ], g.nome);
}

function editar(g) {
  fecharEdicao();
  const b = $(`#strip .pz-btn[data-pz="${g.id}"]`);
  const topo = b ? b.getBoundingClientRect().top : 80;
  const esq = $('#strip').getBoundingClientRect().left + 54;
  document.body.insertAdjacentHTML('beforeend', `<div id="pzPop" style="top:${Math.max(8, Math.min(topo, innerHeight - 170))}px;left:${esq}px;--pz:${esc(g.cor)}">
    <input class="pz-nome" value="${esc(g.nome)}" spellcheck="false" placeholder="Nome da gaveta">
    <div class="pz-cores">${CORES.map((c) => `<button class="pz-cor${c === g.cor ? ' on' : ''}" data-cor="${c}" style="--pz:${c}" title="${c}"></button>`).join('')}<label class="pz-cor pz-livre${CORES.includes(g.cor) ? '' : ' on'}" title="Outra cor" style="--pz:${esc(g.cor)}"><input type="color" value="${esc(g.cor)}"></label></div>
    <div class="pz-act"><button class="chip primary pz-ok">Salvar</button><button class="chip pz-cancel">Cancelar</button></div>
  </div>`);
  const pop = $('#pzPop'), nome = pop.querySelector('.pz-nome');
  let cor = g.cor;
  const marcar = (c) => {
    cor = c; pop.style.setProperty('--pz', c);
    pop.querySelectorAll('button.pz-cor').forEach((x) => x.classList.toggle('on', x.dataset.cor === c));
    const l = pop.querySelector('.pz-livre'); l.style.setProperty('--pz', c); l.classList.toggle('on', !CORES.includes(c));
  };
  pop.querySelectorAll('button.pz-cor').forEach((x) => x.onclick = () => marcar(x.dataset.cor));
  pop.querySelector('input[type=color]').oninput = (e) => marcar(e.target.value);
  const ok = () => { g.nome = nome.value.trim() || g.nome; g.cor = cor; fecharEdicao(); salvar(); };
  pop.querySelector('.pz-ok').onclick = ok;
  pop.querySelector('.pz-cancel').onclick = fecharEdicao;
  nome.onkeydown = (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') { e.stopPropagation(); fecharEdicao(); } };
  setTimeout(() => document.addEventListener('mousedown', foraDaEdicao, true), 0);
  nome.focus(); nome.select();
}

function foraDaEdicao(e) { if (!e.target.closest('#pzPop')) fecharEdicao(); }

function fecharEdicao() {
  document.removeEventListener('mousedown', foraDaEdicao, true);
  const pop = $('#pzPop');
  if (pop) pop.remove();
}

const vigia = new MutationObserver(() => marcarAtiva());
vigia.observe($('#strip'), { subtree: true, attributes: true, attributeFilter: ['class'] });

window.renderStrip = function () { original.renderStrip(); decorar(); };
window.btnState = function () { original.btnState(); marcarAtiva(); };
window.showMenu = function (e, items, header) {
  const b = e && e.target && e.target.closest && e.target.closest('#strip [data-tool]');
  if (b && Array.isArray(items)) {
    const id = b.dataset.tool, atual = grupoDe(id);
    items = [...items, '-', { label: 'Colocar na gaveta', icon: pasta('currentColor'), sub: [
      ...G.grupos.filter((g) => g !== atual).map((g) => ({ label: g.nome, icon: pasta(g.cor), action: () => colocar(id, g) })),
      ...(G.grupos.length > (atual ? 1 : 0) ? ['-'] : []),
      { label: 'Nova gaveta…', action: () => nova(id) },
    ] }, ...(atual ? [{ label: `Tirar da gaveta ${atual.nome}`, action: () => colocar(id, null) }] : [])];
  }
  return original.showMenu(e, items, header);
};

bs.actions.add([
  { label: 'Gavetas: recolher todas', k: '', run: () => { G.grupos.forEach((g) => g.aberta = false); salvar(); } },
  { label: 'Gavetas: expandir todas', k: '', run: () => { G.grupos.forEach((g) => g.aberta = true); salvar(); } },
]);

plugin.onUnload(() => {
  vigia.disconnect();
  fecharEdicao();
  window.renderStrip = original.renderStrip;
  window.btnState = original.btnState;
  window.showMenu = original.showMenu;
  original.renderStrip();
});

plugin.data.get('grupos', []).then((v) => { G.grupos = v || []; window.renderStrip(); }).catch((e) => toast('Gavetas: ' + e.message, 'err'));
