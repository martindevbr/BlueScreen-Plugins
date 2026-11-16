// Navegador de SQLite: .db/.sqlite abrem numa aba com as tabelas, os dados e um campo de SQL.
// Quem lê o banco é o node:sqlite do Node.js (22.5+), rodado por `node -` com o script pela entrada padrão; nada de
// biblioteca na página. Só leitura, a menos que a aba libere "Permitir alterar".
const FV = bs.fileViewer; if (!FV) return;
const { esc, toast } = bs;
if (bs.S.remote) return;

const EXT = ['sqlite', 'sqlite3', 'db', 'db3', 's3db', 'sl3'];
const PAGE = 200;
const RUNNER = String.raw`
const { DatabaseSync } = require('node:sqlite');
const out = (o) => process.stdout.write(JSON.stringify(o, (k, v) => typeof v === 'bigint' ? (Number.isSafeInteger(Number(v)) ? Number(v) : v.toString())
  : v instanceof Uint8Array ? { blob: v.length, head: Buffer.from(v.subarray(0, 16)).toString('hex') } : v));
try {
  const db = new DatabaseSync(process.env.SQ_DB, { readOnly: process.env.SQ_RW !== '1' });
  const max = +process.env.SQ_MAX || 500, res = [];
  for (const sql of JSON.parse(process.env.SQ_SQL)) {
    const st = db.prepare(sql);
    const cols = st.columns ? st.columns().map(c => c.name) : null;
    if (cols && cols.length) {
      st.setReadBigInts?.(true);
      const rows = []; let more = false;
      for (const r of st.iterate()) { if (rows.length >= max) { more = true; break; } rows.push(cols.map(c => r[c])); }
      res.push({ cols, rows, more });
    } else {
      const r = st.run();
      res.push({ changes: Number(r.changes), lastId: r.lastInsertRowid });
    }
  }
  db.close();
  out({ ok: true, res });
} catch (e) { out({ ok: false, error: e.message }); }
`;

const prevHex = FV.kinds.hex;
FV.kinds.hex = prevHex.filter(e => !EXT.includes(e));
FV.kinds.sqlite = EXT;
FV.labels.sqlite = 'SQLite';

const absOf = (t) => t.project.replace(/[\\/]$/, '') + '\\' + t.path.replace(/\//g, '\\');
const qi = (n) => '"' + String(n).replace(/"/g, '""') + '"';

async function run(t, sqls, rw) {
  const r = await plugin.exec('node', ['-'], {
    stdin: RUNNER, timeout: 60000,
    env: { SQ_DB: absOf(t), SQ_SQL: JSON.stringify(sqls), SQ_RW: rw ? '1' : '0', SQ_MAX: String(PAGE), NODE_NO_WARNINGS: '1' },
  });
  let j; try { j = JSON.parse(r.out); } catch {
    const e = (r.err || r.out || '').trim();
    throw new Error(/node:sqlite|ERR_UNKNOWN_BUILTIN_MODULE/.test(e) ? 'Precisa do Node.js 22.5 ou mais novo (baixe pela janela SDKs).' : e.split(/\r?\n/).slice(-3).join(' ') || 'o Node.js não respondeu');
  }
  if (!j.ok) throw new Error(j.error);
  return j.res;
}

function cell(v) {
  if (v === null) return '<i class="sq-null">NULL</i>';
  if (v && typeof v === 'object' && 'blob' in v) return `<i class="sq-blob" title="${esc(v.head)}">blob ${FV.size(v.blob)}</i>`;
  const s = String(v);
  return s.length > 160 ? `<span title="${esc(s.slice(0, 2000))}">${esc(s.slice(0, 160))}…</span>` : esc(s);
}
function grid(r) {
  if (!r.cols) return `<div class="sq-msg">${r.changes} linha${r.changes === 1 ? '' : 's'} alterada${r.changes === 1 ? '' : 's'}${r.lastId ? ' · último id ' + esc(String(r.lastId)) : ''}</div>`;
  if (!r.rows.length) return '<div class="sq-msg">Nenhuma linha.</div>';
  return `<table class="sq-grid"><thead><tr>${r.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${r.rows.map((row, i) => `<tr data-r="${i}">${row.map((v, k) => `<td data-c="${k}">${cell(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
const csv = (r) => [r.cols, ...r.rows].map(row => row.map(v => v === null ? '' : typeof v === 'object' ? `blob(${v.blob})` : /[",\n;]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v)).join(',')).join('\r\n');

async function loadTables(t) {
  const q = t.sq, list = t.el.querySelector('.sq-tables');
  list.innerHTML = '<div class="empty"><span class="spin"></span></div>';
  try {
    const [m] = await run(t, ["SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name"]);
    q.tables = m.rows.map(([name, type, sql]) => ({ name, type, sql }));
    const counts = q.tables.length <= 300 ? await run(t, q.tables.map(x => `SELECT count(*) FROM ${qi(x.name)}`)).catch(() => []) : [];
    counts.forEach((c, i) => { q.tables[i].count = c.rows?.[0]?.[0]; });
    list.innerHTML = q.tables.length ? q.tables.map((x, i) => `<button class="sq-t${x.name === q.cur ? ' on' : ''}" data-i="${i}" title="${esc(x.sql || '')}">
      <span class="sq-tn">${esc(x.name)}</span><span class="sq-tc">${x.type === 'view' ? 'view' : x.count != null ? Number(x.count).toLocaleString('pt-BR') : ''}</span></button>`).join('')
      : '<div class="sq-msg">Banco vazio.</div>';
    if (!q.cur && q.tables[0]) browse(t, q.tables[0].name, 0);
  } catch (e) { list.innerHTML = `<div class="errbox">${esc(e.message)}</div>`; }
}

async function browse(t, name, off) {
  const q = t.sq; q.cur = name; q.off = off;
  t.el.querySelectorAll('.sq-t').forEach(b => b.classList.toggle('on', q.tables[+b.dataset.i]?.name === name));
  const tb = q.tables.find(x => x.name === name);
  t.el.querySelector('.sq-sql').value = `SELECT * FROM ${qi(name)} LIMIT ${PAGE} OFFSET ${off}`;
  await exec(t, { page: true, total: tb?.count, schema: tb?.sql });
}

async function exec(t, o = {}) {
  const q = t.sq, sql = t.el.querySelector('.sq-sql').value.trim(), out = t.el.querySelector('.sq-out');
  if (!sql) return;
  if (sql.length > 30000) { toast('SQL grande demais (máx. 30 mil caracteres)'); return; }
  if (!o.page) q.cur = null;
  out.innerHTML = '<div class="empty"><span class="spin"></span> Rodando…</div>';
  const t0 = performance.now();
  try {
    const res = await run(t, [sql], q.rw);
    const r = q.last = res[res.length - 1], ms = Math.round(performance.now() - t0);
    let nav = '';
    if (o.page && r.cols) {
      const end = q.off + r.rows.length, total = o.total != null ? Number(o.total) : null;
      nav = `<div class="sq-nav"><button class="chip" data-pg="-1" ${q.off ? '' : 'disabled'}>‹ Anterior</button>
        <span>${(q.off + 1).toLocaleString('pt-BR')}–${end.toLocaleString('pt-BR')}${total != null ? ' de ' + total.toLocaleString('pt-BR') : ''}</span>
        <button class="chip" data-pg="1" ${r.more || (total != null && end < total) ? '' : 'disabled'}>Próxima ›</button></div>`;
    }
    out.innerHTML = `<div class="sq-meta">${ms} ms${r.more && !o.page ? ` · só as primeiras ${PAGE} linhas` : ''}${r.cols ? '<button class="chip sq-csv">Copiar CSV</button>' : ''}</div>${nav}${grid(r)}${o.schema ? `<details class="sq-schema"><summary>Estrutura</summary><pre>${esc(o.schema)}</pre></details>` : ''}`;
    if (!r.cols) loadTables(t);
  } catch (e) { out.innerHTML = `<div class="errbox">${esc(e.message)}${/readonly/i.test(e.message) ? '<br>Marque "Permitir alterar" para gravar no banco.' : ''}</div>`; }
}

FV.custom.sqlite = {
  build(t, el) {
    t.sq = { tables: [], cur: null, off: 0, rw: false, last: null };
    el.innerHTML = FV.bar(t, `<label class="sq-rw" title="Sem isso o banco abre só para leitura"><input type="checkbox" class="sq-rwc"> Permitir alterar</label><button class="icon-btn sq-ref" title="Recarregar">${bs.I.refresh}</button>`)
      + `<div class="sq-main"><nav class="sq-tables"></nav><section class="sq-right">
          <div class="sq-q"><textarea class="sq-sql" spellcheck="false" placeholder="SELECT * FROM tabela WHERE …   (Ctrl+Enter roda)"></textarea><button class="chip primary sq-run">Rodar</button></div>
          <div class="sq-out"></div></section></div>`;
    el.querySelector('[data-a="reveal"]').onclick = () => FV.act(t, 'reveal');
    const sql = el.querySelector('.sq-sql');
    for (const ev of ['keydown', 'keyup', 'keypress']) sql.addEventListener(ev, e => e.stopPropagation());
    sql.addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); exec(t); } });
    el.querySelector('.sq-run').onclick = () => exec(t);
    el.querySelector('.sq-ref').onclick = () => loadTables(t);
    el.querySelector('.sq-rwc').onchange = (e) => { t.sq.rw = e.target.checked; if (t.sq.rw) toast('Alterações vão direto para o arquivo. Faça uma cópia antes se for importante.'); };
    el.querySelector('.sq-tables').onclick = (e) => { const b = e.target.closest('.sq-t'); if (b) browse(t, t.sq.tables[+b.dataset.i].name, 0); };
    el.querySelector('.sq-out').onclick = async (e) => {
      const pg = e.target.closest('[data-pg]'); if (pg && t.sq.cur) return browse(t, t.sq.cur, Math.max(0, t.sq.off + +pg.dataset.pg * PAGE));
      if (e.target.closest('.sq-csv') && t.sq.last?.cols) { await navigator.clipboard.writeText(csv(t.sq.last)); toast('CSV copiado', 'ok'); return; }
      const td = e.target.closest('td[data-c]'); const r = t.sq.last;
      if (td && r?.rows) { const v = r.rows[+td.parentElement.dataset.r][+td.dataset.c]; if (v !== null && typeof v !== 'object') { await navigator.clipboard.writeText(String(v)); toast('Valor copiado', 'ok'); } }
    };
    loadTables(t);
  },
  reload(t) { if (t.el && t.sq) { loadTables(t); if (t.sq.cur) browse(t, t.sq.cur, t.sq.off); } },
};

plugin.onUnload(() => {
  FV.kinds.hex = [...new Set([...FV.kinds.hex, ...prevHex.filter(e => EXT.includes(e))])];
  delete FV.kinds.sqlite; delete FV.custom.sqlite;
  bs.S.tabs.filter(x => x.kind === 'sqlite').forEach(x => { x.kind = 'hex'; x.el?.remove(); x.el = null; });
});
