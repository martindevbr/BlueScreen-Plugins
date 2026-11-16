// Hex com inspetor: toma o lugar do hexadecimal do visualizador de arquivos (o embutido lê 64 KB por vez e só mostra).
// O arquivo é lido em pedaços de 64 KB por /api/raw (Range), conforme a rolagem; só as linhas visíveis existem na página,
// então um arquivo de vários GB abre na hora. Só leitura.
const FV = bs.fileViewer; if (!FV) return;
const { esc, toast } = bs;
const KIND = 'hexi', CH = 65536, RH = 18, MAXPX = 8e6, MAX_CHUNKS = 160;

// o núcleo abre binários com o tipo 'hex' por BS.fileViewer.open: desviar aqui basta, e desligar o plugin devolve o embutido
const origOpen = FV.open;
FV.open = (path, kind, line) => origOpen(path, kind === 'hex' ? KIND : kind, line);
FV.labels[KIND] = 'binário';

const SIGS = [
  [0, 'MZ', 'Executável Windows (PE/DOS)'], [0, '\x7fELF', 'Executável ELF'], [0, 'PK\x03\x04', 'ZIP (também jar, apk, docx, pak de alguns jogos)'],
  [0, '\x89PNG', 'Imagem PNG'], [0, '\xff\xd8\xff', 'Imagem JPEG'], [0, 'GIF8', 'Imagem GIF'], [0, 'BM', 'Imagem BMP'], [0, 'DDS ', 'Textura DDS'],
  [0, '\xabKTX', 'Textura KTX'], [0, 'glTF', 'Modelo glTF binário (.glb)'], [0, 'Kaydara FBX Binary', 'Modelo FBX binário'],
  [0, 'UnityFS', 'Unity AssetBundle (UnityFS)'], [0, 'UnityWeb', 'Unity AssetBundle (UnityWeb)'], [0, 'UnityRaw', 'Unity AssetBundle (UnityRaw)'],
  [0, 'GVAS', 'Save do Unreal Engine (GVAS)'], [0, 'CR2W', 'Recurso CR2W (REDengine)'], [0, 'BKHD', 'Soundbank do Wwise (.bnk)'], [0, 'AKPK', 'Pacote do Wwise (.pck)'],
  [0, 'FSB5', 'Banco de sons FMOD (FSB5)'], [0, 'RIFF', 'Contêiner RIFF (WAV, AVI, WEBP...)'], [0, 'OggS', 'Áudio Ogg'], [0, 'fLaC', 'Áudio FLAC'], [0, 'ID3', 'Áudio MP3 (ID3)'],
  [0, 'SQLite format 3', 'Banco SQLite'], [0, '\x1f\x8b', 'Compactado gzip'], [0, '(\xb5/\xfd', 'Compactado Zstandard'], [0, '\x04"M\x18', 'Compactado LZ4 (frame)'],
  [0, '7z\xbc\xaf\x27\x1c', 'Compactado 7-Zip'], [0, 'Rar!', 'Compactado RAR'], [0, '\xca\xfe\xba\xbe', 'Classe Java ou Mach-O universal'],
  [0, '%PDF', 'Documento PDF'], [0, '\0asm', 'WebAssembly'], [0, 'dex\n', 'Android DEX'], [0, '\xd0\xcf\x11\xe0', 'Documento OLE (doc, xls, msi)'],
  [0, 'MSCF', 'Gabinete CAB'], [0, '\x78\x9c', 'Compactado zlib'], [0, '\x78\xda', 'Compactado zlib (máximo)'], [0, 'BND4', 'Arquivo BND4 (FromSoftware)'], [0, 'BHD5', 'Cabeçalho BHD5 (FromSoftware)'],
];

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const hexOff = (n) => n.toString(16).toUpperCase().padStart(8, '0');

// ----- leitura em pedaços -----
async function fetchRange(t, off, len) {
  const r = await fetch(FV.url(t, `&offset=${off}&len=${len}`));
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  const size = +r.headers.get('x-file-size'); if (size >= 0) t.hx.size = size;
  return new Uint8Array(await r.arrayBuffer());
}
function chunk(t, i) {
  const h = t.hx, c = h.cache.get(i);
  if (c) { h.cache.delete(i); h.cache.set(i, c); return c; }
  if (!h.pending.has(i)) {
    h.pending.set(i, fetchRange(t, i * CH, CH).then(b => {
      h.cache.set(i, b); h.pending.delete(i);
      while (h.cache.size > MAX_CHUNKS) h.cache.delete(h.cache.keys().next().value);
      schedule(t);
    }).catch(e => { h.pending.delete(i); h.error = e.message; schedule(t); }));
  }
  return null;
}
const byteAt = (t, o) => { const c = chunk(t, Math.floor(o / CH)); return c ? c[o % CH] : undefined; };
function bytes(t, o, n) {
  n = Math.max(0, Math.min(n, t.hx.size - o));
  const out = new Uint8Array(n);
  for (let k = 0; k < n; k++) { const b = byteAt(t, o + k); if (b === undefined) return null; out[k] = b; }
  return out;
}

// ----- rolagem virtual (acima de MAXPX a barra é proporcional, não 1:1) -----
const geo = (t) => {
  const h = t.hx, view = h.view, rows = Math.ceil(h.size / 16) || 1;
  const vis = Math.max(1, Math.floor(view.clientHeight / RH));
  return { rows, vis, total: Math.min(rows * RH, MAXPX), max: Math.max(0, rows - vis) };
};
function topRow(t) {
  const g = geo(t), v = t.hx.view, span = Math.max(1, g.total - v.clientHeight);
  return g.total < MAXPX ? Math.min(g.max, Math.floor(v.scrollTop / RH)) : Math.round(Math.min(1, v.scrollTop / span) * g.max);
}
function scrollToRow(t, row) {
  const g = geo(t), v = t.hx.view, span = Math.max(1, g.total - v.clientHeight);
  v.scrollTop = g.total < MAXPX ? row * RH : (g.max ? row / g.max : 0) * span;
}
function reveal(t, o) {
  const g = geo(t), row = Math.floor(o / 16), top = topRow(t);
  if (row < top) scrollToRow(t, row); else if (row >= top + g.vis) scrollToRow(t, row - g.vis + 1);
}

function schedule(t) { if (t.hx.raf) return; t.hx.raf = requestAnimationFrame(() => { t.hx.raf = 0; draw(t); }); }

function draw(t) {
  const h = t.hx; if (!h.view?.isConnected) return;
  const g = geo(t), top = topRow(t);
  h.spacer.style.height = g.total + 'px';
  h.rowsEl.style.transform = `translateY(${h.view.scrollTop}px)`;
  const [a, b] = h.selEnd == null ? [h.sel, h.sel] : [Math.min(h.sel, h.selEnd), Math.max(h.sel, h.selEnd)];
  let html = '';
  for (let r = top; r < Math.min(g.rows, top + g.vis + 1); r++) {
    const o0 = r * 16; let hx = '', as = '';
    for (let k = 0; k < 16; k++) {
      const o = o0 + k;
      if (o >= h.size) { hx += '<b class="e">  </b>'; continue; }
      const v = byteAt(t, o), cls = (o >= a && o <= b ? 's' : '') + (v === 0 ? ' z' : '');
      hx += `<b data-o="${o}" class="${cls}">${v === undefined ? '··' : hex2(v)}</b>`;
      as += `<b data-o="${o}" class="${cls}">${v === undefined ? ' ' : v >= 32 && v < 127 ? esc(String.fromCharCode(v)) : '·'}</b>`;
    }
    html += `<div class="hx-r"><span class="hx-o">${hexOff(o0)}</span><span class="hx-h">${hx}</span><span class="hx-a">${as}</span></div>`;
  }
  h.rowsEl.innerHTML = html;
  inspect(t);
  const meta = t.el.querySelector('[data-meta]'); if (meta) meta.textContent = FV.size(h.size) + (h.magic ? ' · ' + h.magic : '');
  if (h.error) { toast('Hex: ' + h.error); h.error = null; }
}

// ----- inspetor -----
function inspect(t) {
  const h = t.hx, box = h.side.querySelector('.hx-ins'); if (!box) return;
  const o = h.sel, b = bytes(t, o, 8), le = h.le;
  const sel = h.selEnd == null ? 1 : Math.abs(h.selEnd - h.sel) + 1;
  let rows = [['Offset', `0x${o.toString(16).toUpperCase()} · ${o.toLocaleString('pt-BR')}`], ['Seleção', `${sel.toLocaleString('pt-BR')} byte${sel > 1 ? 's' : ''}`]];
  if (b && b.length) {
    const dv = new DataView(b.buffer), n = b.length, f = (w, fn) => n >= w ? fn() : '—';
    rows.push(
      ['bits', b[0].toString(2).padStart(8, '0')],
      ['u8 / i8', `${b[0]} / ${dv.getInt8(0)}`],
      ['u16', f(2, () => dv.getUint16(0, le))], ['i16', f(2, () => dv.getInt16(0, le))],
      ['u32', f(4, () => dv.getUint32(0, le))], ['i32', f(4, () => dv.getInt32(0, le))],
      ['u64', f(8, () => dv.getBigUint64(0, le).toString())], ['i64', f(8, () => dv.getBigInt64(0, le).toString())],
      ['f16', f(2, () => half(dv.getUint16(0, le)))],
      ['f32', f(4, () => num(dv.getFloat32(0, le)))], ['f64', f(8, () => num(dv.getFloat64(0, le)))],
    );
    const s = bytes(t, o, 64);
    if (s) {
      let a = ''; for (const c of s) { if (c === 0) break; a += c >= 32 && c < 127 ? String.fromCharCode(c) : '·'; }
      let u = ''; for (let k = 0; k + 1 < s.length; k += 2) { const c = s[k] | s[k + 1] << 8; if (!c) break; u += String.fromCharCode(c); }
      rows.push(['ASCII', a || '—'], ['UTF-16LE', u || '—']);
    }
  }
  box.innerHTML = rows.map(([k, v]) => `<div class="hx-k">${k}</div><div class="hx-v" title="clique para copiar">${esc(String(v))}</div>`).join('');
}
const num = (x) => Number.isFinite(x) && Math.abs(x) > 1e-6 && Math.abs(x) < 1e15 ? +x.toPrecision(9) : x;
function half(u) {
  const s = u >> 15 ? -1 : 1, e = u >> 10 & 31, m = u & 1023;
  if (!e) return s * m * 2 ** -24; if (e === 31) return m ? NaN : s * Infinity;
  return num(s * (1 + m / 1024) * 2 ** (e - 15));
}

async function detect(t) {
  try {
    const b = await fetchRange(t, 0, 64), s = String.fromCharCode(...b);
    const hit = SIGS.find(([at, sig]) => s.startsWith(sig, at));
    let m = hit ? hit[2] : '';
    if (hit && hit[1] === 'RIFF') m = ({ WAVE: 'Áudio WAV', AVI: 'Vídeo AVI', WEBP: 'Imagem WEBP' })[s.slice(8, 12).trim()] || m;
    t.hx.magic = m; schedule(t);
  } catch {}
}

// ----- ir para, buscar, copiar -----
function parseOff(s) {
  s = s.trim().replace(/_/g, ''); if (!s) return null;
  let m;
  if ((m = s.match(/^0x([0-9a-f]+)$/i)) || (m = s.match(/^([0-9a-f]+)h$/i)) || (/[a-f]/i.test(s) && (m = s.match(/^([0-9a-f]+)$/i)))) return parseInt(m[1], 16);
  return /^\d+$/.test(s) ? parseInt(s, 10) : null;
}
function select(t, o, extend) {
  const h = t.hx; o = Math.max(0, Math.min(h.size - 1, o));
  if (extend) h.selEnd = o; else { h.sel = o; h.selEnd = null; }
  reveal(t, extend ? o : h.sel); schedule(t);
}
function pattern(t) {
  const q = t.el.querySelector('.hx-find').value, mode = t.el.querySelector('.hx-mode').value;
  if (!q) return null;
  if (mode === 'hex') {
    const clean = q.replace(/[\s,]/g, '');
    if (!/^([0-9a-f]{2})+$/i.test(clean)) { toast('Hex: use pares, ex.: 4D 5A 90 00'); return null; }
    return Uint8Array.from(clean.match(/../g).map(x => parseInt(x, 16)));
  }
  return mode === 'utf16' ? Uint8Array.from([...q].flatMap(c => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8])) : new TextEncoder().encode(q);
}
function indexOf(hay, pat, from = 0) {
  for (let i = hay.indexOf(pat[0], from); i >= 0 && i <= hay.length - pat.length; i = hay.indexOf(pat[0], i + 1)) {
    let k = 1; while (k < pat.length && hay[i + k] === pat[k]) k++;
    if (k === pat.length) return i;
  }
  return -1;
}
async function find(t) {
  const h = t.hx, pat = pattern(t); if (!pat) return;
  if (h.searching) { h.searching.stop = true; return; }
  const btn = t.el.querySelector('.hx-go'), job = h.searching = { stop: false }, STEP = 4 << 20;
  btn.textContent = 'Parar';
  const scan = async (from, to) => {
    for (let o = from; o < to && !job.stop; o += STEP - pat.length + 1) {
      btn.title = `procurando… ${Math.round(o / h.size * 100)}%`;
      const b = await fetchRange(t, o, Math.min(STEP, to + pat.length - 1 - o)), i = indexOf(b, pat);
      if (i >= 0) return o + i;
    }
    return -1;
  };
  try {
    const start = (h.selEnd ?? h.sel) + 1;
    let at = await scan(start, h.size);
    if (at < 0 && !job.stop && start > 0) at = await scan(0, start);
    if (job.stop) toast('Busca parada');
    else if (at < 0) toast('Não achei no arquivo');
    else { select(t, at); select(t, at + pat.length - 1, true); }
  } catch (e) { toast('Hex: ' + e.message); }
  h.searching = null; btn.textContent = 'Buscar'; btn.title = '';
}
async function copySel(t) {
  const h = t.hx, a = h.selEnd == null ? h.sel : Math.min(h.sel, h.selEnd), n = h.selEnd == null ? 1 : Math.abs(h.selEnd - h.sel) + 1;
  if (n > 1 << 20) { toast('Seleção grande demais para copiar (máx. 1 MB)'); return; }
  try { const b = await fetchRange(t, a, n); await navigator.clipboard.writeText([...b].map(hex2).join(' ')); toast(`${n} bytes copiados em hex`, 'ok'); }
  catch (e) { toast(e.message); }
}

// ----- a aba -----
FV.custom[KIND] = {
  build(t, el) {
    el.innerHTML = FV.bar(t, `<input class="hx-in hx-goto" placeholder="Ir para 0x… ou decimal" spellcheck="false">
        <select class="hx-in hx-mode"><option value="text">texto</option><option value="hex">hex</option><option value="utf16">UTF-16</option></select>
        <input class="hx-in hx-find" placeholder="Buscar" spellcheck="false"><button class="chip hx-go">Buscar</button>
        <button class="chip hx-copy" title="Copiar a seleção em hexadecimal">Copiar hex</button>`)
      + `<div class="hx-main"><div class="hx-view" tabindex="0"><div class="hx-rows"></div><div class="hx-spacer"></div></div>
        <aside class="hx-side"><div class="hx-endian"><button class="chip" data-le="1">Little-endian</button><button class="chip" data-le="0">Big-endian</button></div><div class="hx-ins"></div>
        <div class="hx-help">Clique num byte; Shift+clique ou Shift+setas seleciona. Clique num valor para copiar.</div></aside></div>`;
    const h = t.hx = { size: 0, cache: new Map(), pending: new Map(), sel: 0, selEnd: null, le: true, magic: '', view: el.querySelector('.hx-view'), rowsEl: el.querySelector('.hx-rows'), spacer: el.querySelector('.hx-spacer'), side: el.querySelector('.hx-side') };
    el.querySelector('[data-a="reveal"]').onclick = () => FV.act(t, 'reveal');
    h.view.onscroll = () => schedule(t);
    h.view.onmousedown = (e) => { const b = e.target.closest('[data-o]'); if (!b) return; e.preventDefault(); h.view.focus(); select(t, +b.dataset.o, e.shiftKey); h.drag = true; };
    h.view.onmousemove = (e) => { if (!h.drag || !(e.buttons & 1)) { h.drag = false; return; } const b = e.target.closest('[data-o]'); if (b && +b.dataset.o !== h.selEnd && +b.dataset.o !== h.sel) select(t, +b.dataset.o, true); };
    h.view.onmouseup = () => { h.drag = false; };
    h.view.onkeydown = (e) => {
      const g = geo(t), cur = h.selEnd ?? h.sel;
      const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -16, ArrowDown: 16, PageUp: -16 * g.vis, PageDown: 16 * g.vis }[e.key];
      if (mv != null) select(t, cur + mv, e.shiftKey);
      else if (e.key === 'Home') select(t, e.ctrlKey ? 0 : cur - cur % 16, e.shiftKey);
      else if (e.key === 'End') select(t, e.ctrlKey ? h.size - 1 : cur - cur % 16 + 15, e.shiftKey);
      else if (e.key === 'c' && e.ctrlKey) copySel(t);
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    const guard = (inp) => { for (const ev of ['keydown', 'keyup', 'keypress']) inp.addEventListener(ev, (e) => e.stopPropagation()); };
    el.querySelectorAll('.hx-in').forEach(guard);
    el.querySelector('.hx-goto').onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      const o = parseOff(e.target.value);
      if (o == null || o >= h.size) { toast(o == null ? 'Offset inválido' : 'Offset depois do fim do arquivo'); return; }
      select(t, o); h.view.focus();
    };
    el.querySelector('.hx-find').onkeydown = (e) => { if (e.key === 'Enter') find(t); };
    el.querySelector('.hx-go').onclick = () => find(t);
    el.querySelector('.hx-copy').onclick = () => copySel(t);
    h.side.onclick = (e) => {
      const le = e.target.closest('[data-le]'); if (le) { h.le = le.dataset.le === '1'; endian(); inspect(t); return; }
      const v = e.target.closest('.hx-v'); if (v) navigator.clipboard.writeText(v.textContent).then(() => toast('Copiado', 'ok')).catch(() => {});
    };
    const endian = () => h.side.querySelectorAll('[data-le]').forEach(b => b.classList.toggle('primary', (b.dataset.le === '1') === h.le));
    endian();
    h.ro = new ResizeObserver(() => schedule(t)); h.ro.observe(h.view);
    fetchRange(t, 0, 0).then(() => schedule(t)).catch(e => { h.rowsEl.textContent = 'Não deu para ler o arquivo: ' + e.message; });
    detect(t);
  },
  show(t) { schedule(t); },
  reload(t) { const h = t.hx; if (!h) return; h.cache.clear(); fetchRange(t, 0, 0).then(() => { h.sel = Math.min(h.sel, Math.max(0, h.size - 1)); schedule(t); }).catch(() => {}); detect(t); },
  close(t) { t.hx?.ro?.disconnect(); if (t.hx?.searching) t.hx.searching.stop = true; },
};

plugin.onUnload(() => {
  FV.open = origOpen;
  delete FV.custom[KIND]; delete FV.labels[KIND];
  bs.S.tabs.filter(x => x.kind === KIND).forEach(x => { x.hx?.ro?.disconnect(); x.kind = 'hex'; x.el?.remove(); x.el = null; });
});
