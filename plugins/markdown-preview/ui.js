const isMd = p => /\.(md|markdown)$/i.test(p || '');
const isRel = u => !/^([a-z][\w+.-]*:|\/\/|#|\/)/i.test(u);
const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';

// Junta "docs/" com "../img/a.png" do jeito que o navegador faria, para pedir o arquivo ao núcleo.
function joinRel(base, rel) {
  const parts = (base + rel).split('/'), out = [];
  for (const s of parts) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); }
  return out.join('/');
}

function mdInline(s, base) {
  const codes = [];
  s = bs.esc(s).replace(/`([^`]+)`/g, (_, c) => (codes.push(c), '\u0000' + (codes.length - 1) + '\u0000'));
  const safe = u => /^\s*javascript:/i.test(u) ? '#' : u;
  const img = u => {
    if (!isRel(u) || !bs.S.project) return safe(u);
    const file = joinRel(base, u.replace(/&amp;/g, '&'));
    return `/api/raw?project=${encodeURIComponent(bs.S.project.path)}&file=${encodeURIComponent(file)}`;
  };
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, a, u) => `<img alt="${a}" src="${img(u)}">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, t, u) => isRel(u) ? `<a href="#" data-rel="${u}">${t}</a>` : `<a href="${safe(u)}" target="_blank">${t}</a>`)
    .replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>')
    .replace(/(^|[^*\w])[*_]([^*_]+)[*_](?=[^*\w]|$)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

function mdRender(src, base = '') {
  const L = src.replace(/\r/g, '').split('\n'), out = [];
  const inl = s => mdInline(s, base);
  let i = 0;
  const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  while (i < L.length) {
    const l = L[i];
    let m;
    if (/^\s*```/.test(l)) {
      const buf = []; i++;
      while (i < L.length && !/^\s*```/.test(L[i])) buf.push(L[i++]);
      i++; out.push(`<pre><code>${bs.esc(buf.join('\n'))}</code></pre>`);
    } else if ((m = l.match(/^(#{1,6})\s+(.*?)#*\s*$/))) {
      out.push(`<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`); i++;
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      out.push('<hr>'); i++;
    } else if (/^\s*>/.test(l)) {
      const buf = [];
      while (i < L.length && /^\s*>/.test(L[i])) buf.push(L[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${mdRender(buf.join('\n'), base)}</blockquote>`);
    } else if (l.includes('|') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(L[i + 1] || '')) {
      const head = cells(l); i += 2;
      let h = '<table><thead><tr>' + head.map(c => `<th>${inl(c)}</th>`).join('') + '</tr></thead><tbody>';
      while (i < L.length && L[i].includes('|')) h += '<tr>' + cells(L[i++]).map(c => `<td>${inl(c)}</td>`).join('') + '</tr>';
      out.push(h + '</tbody></table>');
    } else if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      const ol = /^\s*\d/.test(l), items = [];
      while (i < L.length && /^\s*([-*+]|\d+[.)])\s+/.test(L[i])) {
        let t = L[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        const chk = t.match(/^\[([ xX])\]\s+/);
        if (chk) t = `<input type="checkbox" disabled${chk[1] !== ' ' ? ' checked' : ''}> ` + inl(t.slice(chk[0].length));
        else t = inl(t);
        items.push(`<li>${t}</li>`);
      }
      out.push(`<${ol ? 'ol' : 'ul'}>${items.join('')}</${ol ? 'ol' : 'ul'}>`);
    } else if (!l.trim()) {
      i++;
    } else {
      const buf = [];
      while (i < L.length && L[i].trim() && !/^(#{1,6}\s|\s*```|\s*>|\s*([-*+]|\d+[.)])\s)/.test(L[i])) buf.push(inl(L[i++]));
      out.push(`<p>${buf.join('<br>')}</p>`);
    }
  }
  return out.join('\n');
}

const mode = new Map();
let bar = null, view = null;

function sync() {
  const path = bs.S.active?.path || '';
  const host = bs.editor?.getDomNode?.()?.parentElement;
  if (!host || !isMd(path) || bs.S.active?.mode === 'view') { if (bar) bar.hidden = true; if (view) view.hidden = true; return; }
  if (!bar || bar.parentElement !== host) {
    bar?.remove(); view?.remove();
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    view = document.createElement('div');
    view.className = 'md-view';
    view.onclick = e => {
      const a = e.target.closest('a[data-rel]'); if (!a) return;
      e.preventDefault();
      const [file, hash] = a.dataset.rel.replace(/&amp;/g, '&').split('#');
      if (file) bs.openFile(joinRel(dirOf(bs.S.active?.path || ''), file), 'editor');
      else if (hash) view.querySelector(`[id="${CSS.escape(hash)}"]`)?.scrollIntoView();
    };
    bar = document.createElement('div');
    bar.className = 'md-bar';
    bar.innerHTML = '<button class="md-btn" data-m="view">Visualizar</button><button class="md-btn" data-m="edit">Editar</button>';
    bar.onclick = e => {
      const b = e.target.closest('.md-btn'); if (!b) return;
      mode.set(bs.S.active?.path, b.dataset.m); sync();
      if (b.dataset.m === 'edit') bs.editor.focus();
    };
    host.append(view, bar);
  }
  const m = mode.get(path) || 'view';
  bar.hidden = false;
  bar.querySelectorAll('.md-btn').forEach(b => b.classList.toggle('md-on', b.dataset.m === m));
  view.hidden = m !== 'view';
  if (m === 'view') {
    try {
      const top = view.scrollTop;
      view.innerHTML = `<div class="md-body">${mdRender(bs.editor.getValue(), dirOf(path))}</div>`;
      view.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => { h.id = h.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-'); });
      view.scrollTop = top;
    } catch (e) { bs.toast('Erro ao mostrar o Markdown: ' + e.message); }
  }
}

for (const ev of ['tab:open', 'tab:activate', 'tab:close', 'editor:ready', 'refresh', 'files:changed']) bs.hooks.on(ev, () => setTimeout(sync, 0));
bs.keys.add('Ctrl+Alt+M', () => {
  const p = bs.S.active?.path;
  if (!isMd(p)) return false;
  mode.set(p, (mode.get(p) || 'view') === 'view' ? 'edit' : 'view'); sync();
});
bs.mdVisual = { sync, render: mdRender };
plugin.onUnload(() => { bar?.remove(); view?.remove(); delete bs.mdVisual; });
setTimeout(sync, 0);
