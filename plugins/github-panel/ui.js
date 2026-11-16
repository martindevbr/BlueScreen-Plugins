// GitHub do projeto: tudo pelo gh, que já tem o login do usuário (sem token guardado aqui).
const { esc, toast } = bs;
if (bs.S.remote) return;

const ICON = '<svg class="i" viewBox="0 0 24 24"><circle cx="7" cy="6" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M7 8v8M17 16v-5a3 3 0 0 0-3-3h-3m2-2-2 2 2 2"/></svg>';
const TABS = { prs: 'PRs', mine: 'Meus', issues: 'Issues', runs: 'Actions' };
const G = { tab: 'prs', repo: null, data: {}, err: null, loading: false, key: null };

async function gh(args, timeout = 30000) {
  if (!bs.S.project) throw new Error('Abra um projeto');
  const r = await plugin.exec('gh', args, { cwd: bs.S.project.path, timeout });
  if (!r.ok) {
    const e = (r.err || r.out || '').trim();
    if (/not a git repository|no git remotes|none of the git remotes/i.test(e)) throw new Error('Este projeto não tem um repositório do GitHub como remoto.');
    if (/auth login|not logged/i.test(e)) throw new Error('O gh está sem login. Rode "gh auth login" no terminal.');
    throw new Error(e.split(/\r?\n/).slice(-3).join(' ') || `gh saiu com o código ${r.code}`);
  }
  return r.out;
}
const ghJson = async (args) => JSON.parse(await gh(args) || 'null');

// statusCheckRollup mistura CheckRun (status/conclusion) e StatusContext (state)
function checks(roll) {
  const c = { ok: 0, fail: 0, wait: 0 };
  for (const x of roll || []) {
    const v = String(x.conclusion || x.state || '').toUpperCase(), st = String(x.status || '').toUpperCase();
    if (st && st !== 'COMPLETED') c.wait++;
    else if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(v)) c.ok++;
    else if (['PENDING', 'EXPECTED', ''].includes(v)) c.wait++;
    else c.fail++;
  }
  return c;
}
function checksHtml(roll) {
  const c = checks(roll); if (!c.ok && !c.fail && !c.wait) return '';
  const cls = c.fail ? 'gh-bad' : c.wait ? 'gh-wait' : 'gh-good';
  const sym = c.fail ? '✕' : c.wait ? '●' : '✓';
  return `<span class="gh-chk ${cls}" title="${c.ok} ok · ${c.fail} falhando · ${c.wait} rodando">${sym} ${c.ok}/${c.ok + c.fail + c.wait}</span>`;
}
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'agora'; if (m < 60) return m + ' min'; if (m < 1440) return Math.round(m / 60) + ' h';
  const d = Math.round(m / 1440); return d < 45 ? d + ' d' : new Date(iso).toLocaleDateString('pt-BR');
}
const REVIEW = { APPROVED: ['aprovado', 'gh-good'], CHANGES_REQUESTED: ['pediu mudanças', 'gh-bad'], REVIEW_REQUIRED: ['falta revisão', 'gh-wait'] };
const RUN = { success: ['✓', 'gh-good'], failure: ['✕', 'gh-bad'], cancelled: ['⊘', 'gh-mute'], skipped: ['⊘', 'gh-mute'], action_required: ['!', 'gh-wait'] };

const LOAD = {
  prs: () => ghJson(['pr', 'list', '--limit', '40', '--json', 'number,title,author,headRefName,isDraft,reviewDecision,statusCheckRollup,updatedAt']),
  mine: () => ghJson(['pr', 'list', '--author', '@me', '--state', 'all', '--limit', '30', '--json', 'number,title,author,headRefName,isDraft,reviewDecision,statusCheckRollup,updatedAt,state']),
  issues: () => ghJson(['issue', 'list', '--limit', '40', '--json', 'number,title,author,labels,updatedAt,comments']),
  runs: () => ghJson(['run', 'list', '--limit', '25', '--json', 'databaseId,displayTitle,status,conclusion,workflowName,headBranch,createdAt,event']),
};

function rowPr(p) {
  const rv = REVIEW[p.reviewDecision];
  const state = p.state && p.state !== 'OPEN' ? `<span class="gh-tag gh-mute">${p.state === 'MERGED' ? 'merged' : 'fechado'}</span>` : '';
  return `<div class="gh-row" data-kind="pr" data-n="${p.number}" data-branch="${esc(p.headRefName)}">
    <div class="gh-l1"><span class="gh-num">#${p.number}</span><span class="gh-title">${esc(p.title)}</span></div>
    <div class="gh-l2">${p.isDraft ? '<span class="gh-tag gh-mute">rascunho</span>' : ''}${state}${rv ? `<span class="gh-tag ${rv[1]}">${rv[0]}</span>` : ''}${checksHtml(p.statusCheckRollup)}
      <span class="gh-meta">${esc(p.author?.login || '')} · ${esc(p.headRefName)} · ${esc(ago(p.updatedAt))}</span></div>
    <div class="gh-acts"><button class="chip" data-a="web">Abrir</button><button class="chip" data-a="checkout" title="gh pr checkout ${p.number}">Checkout</button><button class="chip" data-a="diff">Diff</button></div>
  </div>`;
}
function rowIssue(i) {
  const labels = (i.labels || []).map(l => `<span class="gh-tag" style="--gh-c:#${esc(l.color || '888')}">${esc(l.name)}</span>`).join('');
  return `<div class="gh-row" data-kind="issue" data-n="${i.number}">
    <div class="gh-l1"><span class="gh-num">#${i.number}</span><span class="gh-title">${esc(i.title)}</span></div>
    <div class="gh-l2">${labels}<span class="gh-meta">${esc(i.author?.login || '')} · ${(i.comments || []).length} coment. · ${esc(ago(i.updatedAt))}</span></div>
    <div class="gh-acts"><button class="chip" data-a="web">Abrir</button></div>
  </div>`;
}
function rowRun(r) {
  const s = r.status !== 'completed' ? ['●', 'gh-wait'] : RUN[r.conclusion] || ['?', 'gh-mute'];
  return `<div class="gh-row" data-kind="run" data-n="${r.databaseId}">
    <div class="gh-l1"><span class="gh-chk ${s[1]}">${s[0]}</span><span class="gh-title">${esc(r.displayTitle)}</span></div>
    <div class="gh-l2"><span class="gh-meta">${esc(r.workflowName)} · ${esc(r.headBranch)} · ${esc(r.event || '')} · ${esc(ago(r.createdAt))}</span></div>
    <div class="gh-acts"><button class="chip" data-a="web">Abrir</button>${r.conclusion === 'failure' ? '<button class="chip" data-a="log">Log do erro</button><button class="chip" data-a="rerun">Rodar de novo</button>' : ''}</div>
  </div>`;
}

async function load(force) {
  const key = bs.S.project?.path;
  if (key !== G.key) { G.key = key; G.data = {}; G.repo = null; G.err = null; }
  if (!force && G.data[G.tab]) return draw();
  G.loading = true; draw();
  try {
    G.repo ||= await ghJson(['repo', 'view', '--json', 'nameWithOwner,url,defaultBranchRef']);
    G.data[G.tab] = await LOAD[G.tab](); G.err = null;
  } catch (e) { G.err = e.message; }
  G.loading = false; draw();
}

function draw() {
  const el = bs.$('#toolBody .gh-wrap'); if (!el) return;
  el.querySelector('.gh-repo').textContent = G.repo ? G.repo.nameWithOwner : bs.S.project ? bs.S.project.name : 'sem projeto';
  el.querySelectorAll('.gh-tab').forEach(b => b.classList.toggle('on', b.dataset.t === G.tab));
  const list = el.querySelector('.gh-list'), q = el.querySelector('.gh-q').value.toLowerCase();
  if (G.loading) { list.innerHTML = '<div class="empty"><span class="spin"></span> Buscando…</div>'; return; }
  if (G.err) { list.innerHTML = `<div class="errbox">${esc(G.err)}</div>`; return; }
  const rows = (G.data[G.tab] || []).filter(x => !q || JSON.stringify([x.title, x.displayTitle, x.number, x.headRefName, x.author?.login]).toLowerCase().includes(q));
  const fn = G.tab === 'issues' ? rowIssue : G.tab === 'runs' ? rowRun : rowPr;
  list.innerHTML = rows.length ? rows.map(fn).join('') : '<div class="empty">Nada por aqui.</div>';
}

async function act(row, a, btn) {
  const n = row.dataset.n, kind = row.dataset.kind;
  try {
    if (a === 'web') { await gh([kind === 'run' ? 'run' : kind, 'view', n, '--web']); return; }
    if (a === 'checkout') {
      if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = 'Confirmar?'; toast(`Clique de novo para trocar para o branch ${row.dataset.branch}`); return; }
      btn.disabled = true; btn.textContent = '…';
      await gh(['pr', 'checkout', n], 120000);
      toast(`No branch do PR #${n}`, 'ok'); statusPr();
      return;
    }
    if (a === 'diff') return detail(row, () => gh(['pr', 'diff', n, '--color', 'never']), 'gh-diff');
    if (a === 'log') return detail(row, () => gh(['run', 'view', n, '--log-failed'], 60000), 'gh-log');
    if (a === 'rerun') { btn.disabled = true; await gh(['run', 'rerun', n, '--failed']); toast('Rodando de novo os jobs que falharam', 'ok'); setTimeout(() => load(true), 3000); }
  } catch (e) { toast(e.message); if (btn) btn.disabled = false; }
}
async function detail(row, get, cls) {
  const open = row.querySelector('.gh-detail');
  if (open) { open.remove(); return; }
  row.insertAdjacentHTML('beforeend', `<pre class="gh-detail ${cls}">Carregando…</pre>`);
  const pre = row.querySelector('.gh-detail');
  try {
    const out = await get();
    pre.innerHTML = cls === 'gh-diff' ? esc(out.slice(0, 300000)).replace(/^(\+(?!\+\+).*)$/gm, '<i class="gh-add">$1</i>').replace(/^(-(?!--).*)$/gm, '<i class="gh-del">$1</i>').replace(/^(@@.*)$/gm, '<i class="gh-hunk">$1</i>')
      : esc(out.split(/\r?\n/).slice(-400).join('\n'));
  } catch (e) { pre.textContent = e.message; }
}

function panel(el) {
  el.innerHTML = `<div class="gh-wrap">
    <div class="gh-top"><span class="gh-repo"></span><span class="gh-sp"></span><button class="icon-btn gh-ref" title="Atualizar">${bs.I.refresh}</button></div>
    <div class="gh-tabs">${Object.entries(TABS).map(([k, v]) => `<button class="gh-tab" data-t="${k}">${v}</button>`).join('')}</div>
    <input class="gh-q" placeholder="Filtrar" spellcheck="false">
    <div class="gh-list"></div>
  </div>`;
  const w = el.querySelector('.gh-wrap');
  for (const ev of ['keydown', 'keypress', 'keyup']) w.addEventListener(ev, e => { if (e.target.matches('input') && !(e.ctrlKey && e.altKey)) e.stopPropagation(); });
  w.querySelector('.gh-ref').onclick = () => load(true);
  w.querySelector('.gh-q').oninput = draw;
  w.querySelector('.gh-tabs').onclick = e => { const b = e.target.closest('.gh-tab'); if (b) { G.tab = b.dataset.t; load(); } };
  w.querySelector('.gh-list').onclick = e => { const b = e.target.closest('[data-a]'), row = e.target.closest('.gh-row'); if (b && row) act(row, b.dataset.a, b); };
  load();
}

// o PR do branch atual na barra de status
const st = bs.status.add({ id: 'stGhPr', title: 'PR do branch atual', onclick: () => gh(['pr', 'view', '--web']).catch(e => toast(e.message)) });
let stTimer = 0;
async function statusPr() {
  if (!bs.S.project) { st.hidden = true; return; }
  try {
    const p = await ghJson(['pr', 'view', '--json', 'number,state,statusCheckRollup,reviewDecision']);
    const c = checks(p.statusCheckRollup);
    st.textContent = `PR #${p.number} ${c.fail ? '✕' : c.wait ? '●' : c.ok ? '✓' : ''}`.trim();
    st.title = `PR #${p.number} (${p.state.toLowerCase()}) · checks: ${c.ok} ok, ${c.fail} falhando, ${c.wait} rodando · clique para abrir`;
    st.hidden = false;
  } catch { st.hidden = true; }
}
bs.hooks.on('project:select', () => { clearTimeout(stTimer); stTimer = setTimeout(statusPr, 1500); G.key = null; if (bs.$('#toolBody .gh-wrap')) load(); });
const poll = setInterval(() => { if (document.visibilityState === 'visible') statusPr(); }, 5 * 60000);
plugin.onUnload(() => { clearInterval(poll); clearTimeout(stTimer); });
setTimeout(statusPr, 3000);

bs.tools.register({ id: 'gh-projeto', title: 'GitHub', icon: ICON, order: 63, render() { panel(bs.$('#toolBody')); } });
bs.actions.add([
  { label: 'GitHub: abrir o repositório no navegador', icon: ICON, run: () => gh(['repo', 'view', '--web']).catch(e => toast(e.message)) },
  { label: 'GitHub: criar PR do branch atual (no navegador)', icon: ICON, run: () => gh(['pr', 'create', '--web']).catch(e => toast(e.message)) },
]);
