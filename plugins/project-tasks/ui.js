const ICON = '<svg class="i" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/></svg>';
const TASK = /^(\s*[-*+]\s+\[)([ xX])(\]\s+)(.*)$/;
let file = 'TAREFAS.md', redraw = null;

plugin.settings.get().then(c => { file = (c.file || '').trim() || file; redraw?.(); }).catch(() => {});
plugin.settings.onChange(c => { file = (c.file || '').trim() || 'TAREFAS.md'; redraw?.(); });

// A barra da esquerda tem atalhos de teclado próprios (busca na árvore etc.) que engoliam o que se digitava nos campos.
function guardKeys(wrap) {
  for (const ev of ['keydown', 'keypress', 'keyup']) wrap.addEventListener(ev, e => {
    if (e.target.matches('input, textarea') && !(e.ctrlKey && e.altKey)) e.stopPropagation();
  });
}

function inline(s) {
  const codes = [];
  s = bs.esc(s).replace(/`([^`]+)`/g, (_, c) => (codes.push(c), '\u0000' + (codes.length - 1) + '\u0000'));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, t, u) => /^\s*javascript:/i.test(u) ? t : `<a href="${u}" target="_blank">${t}</a>`)
    .replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>')
    .replace(/(^|[^*\w])[*_]([^*_]+)[*_](?=[^*\w]|$)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

async function read() {
  try { return (await bs.api('file', { project: bs.S.project.path, file })).content || ''; }
  catch { return null; }
}
async function write(text, exists) {
  const project = bs.S.project.path;
  if (exists) await bs.api('file', { project, file }, { method: 'PUT', body: text });
  else await bs.api('file/new', { project }, { method: 'POST', body: JSON.stringify({ path: file, content: text }) });
}

function panel(el) {
  el.innerHTML = `<div class="tk-wrap">
    <div class="tk-proj"></div>
    <div class="tk-row"><input class="tk-in" placeholder="Nova tarefa e Enter"><button class="chip primary tk-add">Adicionar</button></div>
    <div class="tk-list"></div>
    <div class="tk-row"><button class="chip tk-open"></button><span class="tk-sp"></span><button class="chip tk-clean">Limpar feitas</button></div>
  </div>`;
  guardKeys(el.querySelector('.tk-wrap'));
  const list = el.querySelector('.tk-list'), inp = el.querySelector('.tk-in'), proj = el.querySelector('.tk-proj'), openBtn = el.querySelector('.tk-open');
  let lines = [], exists = false;

  async function load() {
    openBtn.textContent = 'Abrir ' + file;
    if (!bs.S.project) { proj.textContent = 'Nenhum projeto aberto'; list.innerHTML = '<div class="empty">Abra um projeto para ver as tarefas.</div>'; return; }
    const t = await read();
    exists = t !== null;
    lines = (t ?? '# Tarefas\n').replace(/\r/g, '').split('\n');
    draw();
  }
  function draw() {
    const items = lines.map((l, i) => [l.match(TASK), i]).filter(([m]) => m);
    const open = items.filter(([m]) => m[2] === ' ').length;
    proj.textContent = `${bs.S.project.name} · ${open} pendente${open === 1 ? '' : 's'}`;
    list.innerHTML = items.length ? items.map(([m, i]) => `<div class="tk-item${m[2] !== ' ' ? ' tk-done' : ''}" data-i="${i}">
      <input type="checkbox" class="tk-chk"${m[2] !== ' ' ? ' checked' : ''}><span class="tk-name">${inline(m[4])}</span>
      <button class="icon-btn tk-del" title="Apagar">${bs.I.x}</button></div>`).join('')
      : '<div class="empty">Nenhuma tarefa ainda.</div>';
  }
  async function save() {
    try { await write(lines.join('\n'), exists); exists = true; draw(); if (bs.S.active?.path === file) setTimeout(() => bs.mdVisual?.sync(), 0); }
    catch (e) { bs.toast('Não deu para salvar as tarefas: ' + e.message); }
  }
  async function add() {
    const t = inp.value.trim(); if (!t || !bs.S.project) return;
    let last = -1; lines.forEach((l, i) => { if (TASK.test(l)) last = i; });
    if (last < 0) { while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); lines.push('', `- [ ] ${t}`, ''); }
    else lines.splice(last + 1, 0, `- [ ] ${t}`);
    inp.value = ''; await save();
  }
  inp.onkeydown = e => { if (e.key === 'Enter') add(); };
  el.querySelector('.tk-add').onclick = add;
  list.onclick = e => {
    const row = e.target.closest('.tk-item'); if (!row) return;
    const i = +row.dataset.i, m = lines[i].match(TASK);
    if (e.target.closest('.tk-del')) lines.splice(i, 1);
    else if (e.target.matches('.tk-chk')) lines[i] = m[1] + (m[2] === ' ' ? 'x' : ' ') + m[3] + m[4];
    else return;
    save();
  };
  el.querySelector('.tk-clean').onclick = () => { lines = lines.filter(l => { const m = l.match(TASK); return !m || m[2] === ' '; }); save(); };
  openBtn.onclick = async () => {
    if (!bs.S.project) return;
    if (!exists) await save();
    bs.openFile(file, 'editor');
  };
  redraw = () => list.isConnected && load();
  load();
}

bs.tools.register({ id: 'tv-tarefas', title: 'Project Tasks', icon: ICON, order: 61, render() { panel(bs.$('#toolBody')); } });
bs.hooks.on('project:select', () => redraw?.());
bs.hooks.on('tab:save', () => { if (bs.S.active?.path === file) redraw?.(); });
bs.keys.add('Ctrl+Alt+T', () => { const b = bs.$('#strip [data-tool="tv-tarefas"]'); if (b && !b.classList.contains('on')) b.click(); });
plugin.onUnload(() => { redraw = null; });
