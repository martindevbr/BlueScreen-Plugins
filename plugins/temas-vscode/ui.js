const { $, esc, toast, store } = bs;
const ICON = '<svg class="i" viewBox="0 0 24 24"><path d="M17 3l4 3v12l-4 3-10-9 10-9z"/><path d="M7 12 3 9v6l4-3"/></svg>';
const T = { list: null, loading: false, q: store.get('tvs.q', ''), applied: store.get('tvs.applied', ''), error: '' };

const home = () => (BS.plugins.dirs[1] || '').replace(/[\\/]\.bluescreen[\\/]plugins[\\/]?$/, '');
const join = (...p) => p.filter(Boolean).join('\\').replace(/[\\/]+/g, '\\');

function jsonc(s) {
  let out = '', str = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (str) { out += c; if (c === '\\') { out += n; i++; } else if (c === '"') str = false; continue; }
    if (c === '"') { str = true; out += c; continue; }
    if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

async function read(root, rel) { const f = await bs.api('file', { project: root, file: rel }); return f.content || ''; }
async function dirs(root, rel = '') {
  try { return (await bs.api('tree', { project: root, dir: rel, compact: 0 })).filter(x => x.dir).map(x => x.name); } catch { return []; }
}

async function sources() {
  const h = home(); if (!h) return [];
  const local = join(h, 'AppData', 'Local', 'Programs');
  const out = [['VS Code', join(h, '.vscode', 'extensions')], ['VS Code Insiders', join(h, '.vscode-insiders', 'extensions')], ['Cursor', join(h, '.cursor', 'extensions')], ['Antigravity', join(h, '.antigravity', 'extensions')], ['Windsurf', join(h, '.windsurf', 'extensions')]];
  for (const [label, app] of [['VS Code', 'Microsoft VS Code'], ['Cursor', 'cursor'], ['Antigravity', 'Antigravity']]) {
    const base = join(local, app);
    out.push([label + ' (embutido)', join(base, 'resources', 'app', 'extensions')]);
    for (const d of await dirs(base)) if (/^[0-9a-f]{8,}$/i.test(d)) out.push([label + ' (embutido)', join(base, d, 'resources', 'app', 'extensions')]);
  }
  return out;
}

async function scan() {
  T.loading = true; T.error = ''; render();
  const found = new Map();
  try {
    for (const [source, root] of await sources()) {
      const exts = (await dirs(root)).filter(d => !d.startsWith('.')).sort().reverse();
      await Promise.all(exts.map(async (ext) => {
        let pkg;
        try { pkg = jsonc(await read(root, ext + '/package.json')); } catch { return; }
        const themes = (pkg.contributes && pkg.contributes.themes) || [];
        if (!themes.length) return;
        let nls = null;
        if (themes.some(t => /^%.+%$/.test(t.label || ''))) { try { nls = jsonc(await read(root, ext + '/package.nls.json')); } catch {} }
        for (const t of themes) {
          if (!/\.json$/i.test(t.path || '')) continue;
          let label = t.label || t.id || t.path;
          const m = /^%(.+)%$/.exec(label); if (m && nls) label = typeof nls[m[1]] === 'string' ? nls[m[1]] : nls[m[1]]?.message || label;
          const key = (pkg.publisher || '') + '|' + label;
          if (found.has(key)) continue;
          found.set(key, { key, label, ext: pkg.displayName && !/^%/.test(pkg.displayName) ? pkg.displayName : pkg.name, source, root, file: ext + '/' + t.path.replace(/^\.\//, ''), mode: /light/i.test(t.uiTheme || '') || t.uiTheme === 'vs' ? 'light' : 'dark' });
        }
      }));
    }
  } catch (e) { T.error = e.message; }
  T.list = [...found.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  T.loading = false; render();
}

async function load(root, file, depth = 0) {
  const j = jsonc(await read(root, file));
  if (!j.include || depth > 4) return j;
  const dir = file.split('/').slice(0, -1);
  for (const seg of j.include.split('/')) { if (seg === '..') dir.pop(); else if (seg && seg !== '.') dir.push(seg); }
  let base = {};
  try { base = await load(root, dir.join('/'), depth + 1); } catch {}
  return { ...base, ...j, colors: { ...(base.colors || {}), ...(j.colors || {}) }, tokenColors: [...(Array.isArray(base.tokenColors) ? base.tokenColors : []), ...(Array.isArray(j.tokenColors) ? j.tokenColors : [])] };
}

function rgba(c) {
  if (typeof c !== 'string') return null;
  let h = c.trim().replace('#', '');
  if (!/^[0-9a-f]+$/i.test(h) || ![3, 4, 6, 8].includes(h.length)) return null;
  if (h.length <= 4) h = h.split('').map(x => x + x).join('');
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
}
const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
function solid(c, under) {
  const a = rgba(c); if (!a) return null;
  if (a[3] >= 1) return hex(a[0], a[1], a[2]);
  const u = rgba(under) || [0, 0, 0, 1];
  return hex(a[0] * a[3] + u[0] * (1 - a[3]), a[1] * a[3] + u[1] * (1 - a[3]), a[2] * a[3] + u[2] * (1 - a[3]));
}
function mix(a, b, t) { const x = rgba(a), y = rgba(b); return x && y ? hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t) : a; }

function tokenColor(rules, scopes) {
  for (const want of scopes) {
    let best = null, bestLen = -1;
    for (const r of rules) {
      const fg = r.settings && r.settings.foreground; if (!fg) continue;
      const list = (Array.isArray(r.scope) ? r.scope : String(r.scope || '').split(',')).map(s => s.trim().split(/\s+/).pop()).filter(Boolean);
      for (const s of list) if ((want === s || want.startsWith(s + '.')) && s.length >= bestLen) { best = fg; bestLen = s.length; }
    }
    if (best) return best;
  }
  return null;
}

function convert(j, meta) {
  const c = j.colors || {};
  const mode = /light/i.test(j.type || '') || (!j.type && meta.mode === 'light') ? 'light' : 'dark';
  const bg = solid(c['editor.background'], mode === 'light' ? '#FFFFFF' : '#1E1E1E') || (mode === 'light' ? '#FFFFFF' : '#1E1E1E');
  const fg = solid(c['editor.foreground'] || c.foreground, bg) || (mode === 'light' ? '#1F1F1F' : '#D4D4D4');
  const pick = (keys, under = bg) => { for (const k of keys) { const v = solid(c[k], under); if (v) return v; } return null; };
  const panel = pick(['sideBar.background', 'panel.background', 'editorGroupHeader.tabsBackground']) || bg;
  const ui = {
    canvas: pick(['titleBar.activeBackground', 'activityBar.background', 'sideBar.background']) || mix(bg, '#000000', .12),
    'canvas-fg': pick(['titleBar.activeForeground', 'activityBar.foreground', 'sideBar.foreground']) || fg,
    bg, panel,
    'panel-2': pick(['editorWidget.background', 'dropdown.background', 'input.background', 'sideBarSectionHeader.background'], panel) || mix(panel, fg, .04),
    hover: pick(['list.hoverBackground', 'toolbar.hoverBackground'], panel) || mix(panel, fg, .07),
    sel: pick(['list.activeSelectionBackground', 'list.inactiveSelectionBackground', 'editor.selectionBackground'], panel) || mix(panel, fg, .14),
    line: pick(['panel.border', 'sideBar.border', 'editorGroup.border', 'contrastBorder'], panel) || mix(panel, fg, .1),
    'line-2': pick(['input.border', 'dropdown.border', 'editorWidget.border', 'focusBorder'], panel) || mix(panel, fg, .16),
    fg,
    'fg-2': pick(['sideBar.foreground', 'foreground', 'tab.inactiveForeground']) || mix(fg, bg, .2),
    muted: pick(['descriptionForeground', 'editorLineNumber.foreground', 'tab.inactiveForeground']) || mix(fg, bg, .45),
    accent: pick(['activityBarBadge.background', 'button.background', 'focusBorder', 'textLink.foreground']),
    'accent-2': pick(['textLink.foreground', 'textLink.activeForeground', 'button.hoverBackground']),
    add: pick(['gitDecoration.addedResourceForeground', 'editorGutter.addedBackground', 'terminal.ansiGreen']),
    mod: pick(['gitDecoration.modifiedResourceForeground', 'editorGutter.modifiedBackground', 'terminal.ansiBlue']),
    del: pick(['gitDecoration.deletedResourceForeground', 'errorForeground', 'editorError.foreground', 'terminal.ansiRed']),
    warn: pick(['editorWarning.foreground', 'list.warningForeground', 'terminal.ansiYellow']),
  };
  const rules = Array.isArray(j.tokenColors) ? j.tokenColors : [];
  const tk = (...s) => tokenColor(rules, s);
  const syntax = {
    comment: tk('comment', 'comment.line', 'comment.block'),
    keyword: tk('storage.modifier', 'keyword', 'storage'),
    string: tk('string.quoted', 'string'),
    number: tk('constant.numeric', 'constant'),
    type: tk('entity.name.type.class', 'entity.name.type', 'support.class', 'support.type', 'storage.type'),
    function: tk('variable.other', 'variable', 'meta.definition.variable'),
    annotation: tk('storage.type.annotation', 'meta.annotation', 'punctuation.definition.annotation', 'entity.name.function.decorator', 'meta.decorator'),
    tag: tk('entity.name.tag'),
    attr: tk('entity.other.attribute-name'),
    delimiter: tk('punctuation', 'meta.brace', 'keyword.operator'),
    plain: fg,
  };
  const clean = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, solid(v, bg)]).filter(([, v]) => v));
  if (ui.accent && !ui['accent-2']) ui['accent-2'] = mix(ui.accent, mode === 'light' ? '#000000' : '#FFFFFF', .15);
  if (ui.accent && !ui['on-accent']) { const a = rgba(ui.accent); ui['on-accent'] = a && (a[0] * .3 + a[1] * .59 + a[2] * .11) > 150 ? '#000000' : '#FFFFFF'; }
  if (!syntax.annotation) syntax.annotation = syntax.keyword;
  const ids = (meta.label || 'tema').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { id: 'vsc-' + ids, name: meta.label, mode, ui: clean(ui), syntax: clean(syntax) };
}

function useAsCurrent(t) {
  const cur = BS.appearance.current();
  const base = BS.appearance.presets().find(p => p.id === (t.mode === 'light' ? 'bluescreen-claro' : 'bluescreen')) || {};
  Object.assign(cur, { mode: t.mode, name: t.name, from: t.id, ui: { ...base.ui, ...t.ui }, syntax: { ...base.syntax, ...t.syntax } });
  window.codeFont(cur.fonts.codeSize);
  return cur;
}

async function applyTheme(item) {
  if (!BS.appearance || !BS.appearance.current || !BS.appearance.current()) return toast('A Aparência ainda não carregou', 'err');
  try {
    const j = item.json || await load(item.root, item.file);
    const t = BS.appearance.add ? BS.appearance.add(convert(j, item)) : useAsCurrent(convert(j, item));
    T.applied = item.key; store.set('tvs.applied', item.key);
    toast(BS.appearance.add ? `Tema "${t.name}" aplicado e salvo nas predefinições` : `Tema "${t.name}" aplicado (para guardar, salve como predefinição na Aparência)`, 'ok');
    render();
  } catch (e) { toast('Não deu para ler o tema: ' + e.message, 'err'); }
}

function importFile() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,.jsonc';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { const j = jsonc(String(r.result)); applyTheme({ key: 'file|' + f.name, label: j.name || f.name.replace(/\.(json|jsonc)$/i, '').replace(/[-_.]theme$/i, ''), json: j, mode: /light/i.test(j.type || '') ? 'light' : 'dark' }); } catch (e) { toast('JSON inválido: ' + e.message, 'err'); } };
    r.readAsText(f);
  };
  inp.click();
}

function render() {
  if (bs.S.tool !== 'temas-vscode') return;
  const body = $('#toolBody');
  $('#toolSub').textContent = T.list ? String(T.list.length) : '';
  $('#toolActions').innerHTML = `<button class="icon-btn" id="tvsFile" title="Importar arquivo de tema (.json)">${bs.I.open}</button><button class="icon-btn" id="tvsScan" title="Procurar de novo">${bs.I.refresh}</button>`;
  $('#tvsFile').onclick = importFile;
  $('#tvsScan').onclick = scan;
  if (!T.list && !T.loading) { scan(); return; }
  if (T.loading) { body.innerHTML = '<div class="empty">Procurando temas do VS Code, Cursor e Antigravity…</div>'; return; }
  const q = T.q.trim().toLowerCase();
  const list = T.list.filter(t => !q || (t.label + ' ' + t.ext + ' ' + t.source).toLowerCase().includes(q));
  body.innerHTML = `<div class="tvs-top"><input id="tvsQ" placeholder="Filtrar ${T.list.length} temas" value="${esc(T.q)}" spellcheck="false"></div>
    ${T.error ? `<div class="tvs-err">${esc(T.error)}</div>` : ''}
    <div id="tvsRows">${list.map(t => `<div class="row tvs-row ${t.key === T.applied ? 'sel' : ''}" data-k="${esc(t.key)}" title="${esc(t.ext + ' · ' + t.source)}"><span class="tvs-mode ${t.mode}"></span><span class="name">${esc(t.label)}</span><span class="meta">${esc(t.source.replace(' (embutido)', ''))}</span></div>`).join('') || '<div class="empty">Nenhum tema encontrado. Instale temas no VS Code ou importe um .json.</div>'}</div>`;
  const qi = $('#tvsQ');
  qi.oninput = () => { T.q = qi.value; store.set('tvs.q', T.q); const pos = qi.selectionStart; render(); const n = $('#tvsQ'); n.focus(); n.setSelectionRange(pos, pos); };
  body.querySelectorAll('.tvs-row').forEach(el => el.onclick = () => applyTheme(T.list.find(x => x.key === el.dataset.k)));
}

bs.tools.register({ id: 'temas-vscode', title: 'Temas do VS Code', icon: ICON, order: 900, bottom: true, render });
bs.actions.add([
  { label: 'Temas do VS Code: escolher', k: '', run: () => bs.openTool('temas-vscode'), icon: ICON },
  { label: 'Temas do VS Code: importar arquivo .json', k: '', run: importFile, icon: ICON },
]);
