// Portas abertas: quem está ouvindo em cada porta TCP deste PC (Get-NetTCPConnection + Get-Process), com encerrar por PID.
const { esc, toast } = bs;
if (bs.S.remote) return;

const ICON = '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15v-3M10 15V9M13 15v-4M17 9h.01"/></svg>';
const SYSTEM = /^(system|idle|svchost|services|wininit|lsass|spoolsv|smss|csrss|winlogon|registry|memcompression|searchindexer|msmpeng|nissrv|mdnsresponder|jhi_service)$/i;
const P = { rows: null, err: null, sys: false, q: '', timer: 0 };

const QUERY = `[Console]::OutputEncoding=[Text.Encoding]::UTF8
$p = @{}; Get-Process | ForEach-Object { $p[$_.Id] = $_ }
$r = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  $x = $p[[int]$_.OwningProcess]
  [pscustomobject]@{ port = $_.LocalPort; addr = $_.LocalAddress; pid = $_.OwningProcess; name = $(if ($x) { $x.ProcessName } else { '' }); path = $(if ($x) { $x.Path } else { '' }); title = $(if ($x) { $x.MainWindowTitle } else { '' }) } }
ConvertTo-Json -Compress -InputObject @($r)`;

async function load() {
  try {
    const r = await plugin.exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', QUERY], { timeout: 20000 });
    if (!r.ok) throw new Error(r.err || 'falha no PowerShell');
    const seen = new Map();
    for (const x of JSON.parse(r.out.trim() || '[]')) {
      const k = x.port + ':' + x.pid, cur = seen.get(k);
      if (cur) cur.addrs.add(x.addr); else seen.set(k, { ...x, addrs: new Set([x.addr]) });
    }
    P.rows = [...seen.values()].sort((a, b) => a.port - b.port); P.err = null;
  } catch (e) { P.err = e.message; }
  draw();
}

// quem ouve em 0.0.0.0/:: também responde no 127.0.0.1; só quem ouve apenas no ::1 precisa do endereço IPv6
const local = (x) => x.addrs.has('::1') && !x.addrs.has('127.0.0.1') && !x.addrs.has('0.0.0.0') && !x.addrs.has('::') ? `http://[::1]:${x.port}` : `http://127.0.0.1:${x.port}`;
const isSys = (x) => !x.path || SYSTEM.test(x.name) || x.pid <= 4;
const scope = (x) => [...x.addrs].some(a => a === '0.0.0.0' || a === '::') ? 'rede' : 'local';

function draw() {
  const el = bs.$('#toolBody .po-wrap'); if (!el) return;
  const list = el.querySelector('.po-list');
  if (P.err) { list.innerHTML = `<div class="errbox">${esc(P.err)}</div>`; return; }
  if (!P.rows) { list.innerHTML = '<div class="empty"><span class="spin"></span></div>'; return; }
  const q = P.q.toLowerCase();
  const mine = P.rows.filter(x => P.sys || !isSys(x));
  const rows = mine.filter(x => !q || String(x.port).includes(q) || x.name.toLowerCase().includes(q) || String(x.pid) === q);
  const hidden = P.rows.length - mine.length;
  el.querySelector('.po-count').textContent = `${rows.length} porta${rows.length === 1 ? '' : 's'}${hidden ? ` · ${hidden} do sistema escondidas` : ''}`;
  list.innerHTML = rows.length ? rows.map(x => `<div class="po-row" data-pid="${x.pid}">
      <span class="po-port">${x.port}</span>
      <span class="po-who" title="${esc(x.path || '')}"><b>${esc(x.name || '?')}</b> <i>PID ${x.pid}</i>${x.title ? `<small>${esc(x.title)}</small>` : ''}</span>
      <span class="po-scope po-${scope(x)}" title="${esc([...x.addrs].join(', '))}">${scope(x)}</span>
      <span class="po-acts"><button class="chip" data-a="open" data-url="${local(x)}">Abrir</button>${isSys(x) ? '' : '<button class="chip" data-a="kill">Encerrar</button>'}</span>
    </div>`).join('') : '<div class="empty">Nada ouvindo.</div>';
}

async function kill(pid, btn) {
  if (!btn.dataset.sure) {
    btn.dataset.sure = '1'; btn.textContent = 'Confirmar?'; btn.classList.add('danger');
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.sure; btn.textContent = 'Encerrar'; btn.classList.remove('danger'); } }, 4000);
    return;
  }
  btn.disabled = true; clearInterval(P.timer);
  const r = await plugin.exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Stop-Process -Id ${+pid} -Force -ErrorAction Stop`], { timeout: 15000 }).catch(e => ({ ok: false, err: e.message }));
  if (r.ok) toast(`Processo ${pid} encerrado`, 'ok'); else toast('Não deu para encerrar: ' + (r.err || '').trim().split(/\r?\n/)[0]);
  load(); poll();
}

// o draw() troca a lista inteira; com o mouse em cima de um "Confirmar?", espera o clique em vez de redesenhar
function poll() {
  clearInterval(P.timer);
  P.timer = setInterval(() => {
    if (!bs.$('#toolBody .po-wrap')) { clearInterval(P.timer); P.timer = 0; return; }
    if (document.visibilityState === 'visible' && !bs.$('#toolBody .po-list [data-sure]')) load();
  }, 5000);
}

function panel(el) {
  el.innerHTML = `<div class="po-wrap">
    <div class="po-row1"><input class="po-q" placeholder="Porta, programa ou PID" spellcheck="false" value="${esc(P.q)}"><button class="icon-btn po-ref" title="Atualizar">${bs.I.refresh}</button></div>
    <div class="po-row1"><span class="po-count"></span><span class="po-sp"></span><label class="po-chk"><input type="checkbox" class="po-sys" ${P.sys ? 'checked' : ''}> sistema</label></div>
    <div class="po-list"></div></div>`;
  const w = el.querySelector('.po-wrap');
  for (const ev of ['keydown', 'keypress', 'keyup']) w.addEventListener(ev, e => { if (e.target.matches('input') && !(e.ctrlKey && e.altKey)) e.stopPropagation(); });
  w.querySelector('.po-q').oninput = (e) => { P.q = e.target.value; draw(); };
  w.querySelector('.po-sys').onchange = (e) => { P.sys = e.target.checked; draw(); };
  w.querySelector('.po-ref').onclick = load;
  w.querySelector('.po-list').onclick = (e) => {
    const b = e.target.closest('[data-a]'), row = e.target.closest('.po-row'); if (!b || !row) return;
    if (b.dataset.a === 'open') plugin.exec('explorer.exe', [b.dataset.url], { timeout: 10000 }).catch(() => {});
    else kill(row.dataset.pid, b);
  };
  draw(); load(); poll();
}

bs.tools.register({ id: 'portas-abertas', title: 'Open Ports', icon: ICON, order: 65, render() { panel(bs.$('#toolBody')); } });
bs.actions.add([{ label: 'Open Ports: quem está usando cada porta', icon: ICON, run: () => { const b = bs.$('#strip [data-tool="portas-abertas"]'); if (b && !b.classList.contains('on')) b.click(); } }]);
plugin.onUnload(() => clearInterval(P.timer));
