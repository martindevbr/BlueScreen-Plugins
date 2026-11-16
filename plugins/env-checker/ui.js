// Conferir .env: lê os .env* da raiz do projeto, compara com o .env.example e confere se o git protege os segredos.
// Os valores ficam mascarados na tela; só um clique no olho mostra um de cada vez.
const { esc, toast } = bs;
if (bs.S.remote) return;

const ICON = '<svg class="i" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/></svg>';
const EXAMPLES = ['.env.example', '.env.sample', '.env.template', '.env.dist', 'example.env'];
const SECRET_KEY = /(secret|token|passw|pwd|api[_-]?key|private|credential|auth|dsn|webhook|signing|salt)/i;
const SECRET_VAL = [/^sk-[\w-]{20,}/, /^gh[pousr]_\w{30,}/, /^github_pat_/, /^AKIA[0-9A-Z]{16}$/, /^xox[abposr]-/, /^AIza[\w-]{30,}/, /-----BEGIN [A-Z ]*PRIVATE KEY/, /^eyJ[\w-]+\.[\w-]+\./, /:\/\/[^:\s/]+:[^@\s]+@/];
const E = { files: null, sel: null, err: null, shown: new Set(), git: {} };

function parse(text) {
  const vars = [], dup = new Set(), seen = new Set();
  text.replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][\w.-]*)\s*=\s*(.*)$/); if (!m) return;
    let v = m[2].trim();
    if (/^(['"`]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    if (seen.has(m[1])) dup.add(m[1]); seen.add(m[1]);
    vars.push({ key: m[1], value: v, line: i + 1 });
  });
  return { vars, dup };
}
const looksSecret = (k, v) => !!v && (SECRET_KEY.test(k) || SECRET_VAL.some(r => r.test(v)));
const mask = (v) => !v ? '<i class="ev-empty">vazio</i>' : '•'.repeat(Math.min(12, Math.max(4, v.length)));

async function git(args) {
  const r = await plugin.exec('git', args, { cwd: bs.S.project.path, timeout: 10000 }).catch(() => null);
  return r ? r.code : -1;
}

async function load() {
  E.err = null; E.files = null; draw();
  if (!bs.S.project) { E.files = []; draw(); return; }
  try {
    const r = await plugin.exec('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      "Get-ChildItem -LiteralPath $env:EV_DIR -Force -File | Where-Object { $_.Name -like '.env*' -or $_.Name -like '*.env' } | ForEach-Object { $_.Name }"],
      { env: { EV_DIR: bs.S.project.path }, timeout: 10000 });
    const names = r.out.split(/\r?\n/).map(s => s.trim()).filter(Boolean).sort((a, b) => (a === '.env' ? -1 : b === '.env' ? 1 : a.localeCompare(b)));
    const files = [];
    for (const name of names) {
      const content = (await bs.api('file', { project: bs.S.project.path, file: name }).catch(() => ({ content: '' }))).content || '';
      files.push({ name, example: EXAMPLES.includes(name.toLowerCase()), ...parse(content) });
    }
    E.files = files;
    E.sel = files.find(f => f.name === E.sel)?.name || files.find(f => !f.example)?.name || files[0]?.name || null;
    // git: ignorado? já foi commitado? (ls-files sai 0 quando o arquivo está no índice)
    E.git = {};
    if (await git(['rev-parse', '--is-inside-work-tree']) === 0) {
      for (const f of files.filter(f => !f.example)) E.git[f.name] = { ignored: await git(['check-ignore', '-q', f.name]) === 0, tracked: await git(['ls-files', '--error-unmatch', f.name]) === 0 };
    } else E.git = null;
  } catch (e) { E.err = e.message; }
  draw();
}

function findings(f) {
  const out = [], ex = E.files.find(x => x.example);
  if (!f.example && E.git) {
    const g = E.git[f.name] || {};
    if (g.tracked) out.push(['bad', `${f.name} está commitado no git. Tire do repositório (git rm --cached ${f.name}) e troque os segredos que estavam nele.`]);
    else if (!g.ignored) out.push(['warn', `${f.name} não está no .gitignore: um "git add ." leva os segredos junto.`, 'ignore']);
    else out.push(['ok', `${f.name} está no .gitignore.`]);
  }
  if (f.dup.size) out.push(['warn', `Chave repetida: ${[...f.dup].join(', ')} (vale a última).`]);
  if (!f.example && ex) {
    const have = new Set(f.vars.map(v => v.key)), want = new Set(ex.vars.map(v => v.key));
    const miss = [...want].filter(k => !have.has(k)), extra = [...have].filter(k => !want.has(k));
    if (miss.length) out.push(['warn', `Faltam em ${f.name} (estão no ${ex.name}): ${miss.join(', ')}`]);
    if (extra.length) out.push(['info', `Não estão no ${ex.name}: ${extra.join(', ')}`, 'example']);
  }
  if (!f.example && !ex && f.vars.length) out.push(['info', 'Sem .env.example: quem clonar o projeto não sabe quais variáveis preencher.', 'example']);
  if (f.example) {
    const leaked = f.vars.filter(v => v.value && SECRET_VAL.some(r => r.test(v.value)));
    if (leaked.length) out.push(['bad', `${f.name} parece ter segredos de verdade (${leaked.map(v => v.key).join(', ')}). Ele costuma ir para o git.`]);
  }
  return out;
}

function draw() {
  const el = bs.$('#toolBody .ev-wrap'); if (!el) return;
  const body = el.querySelector('.ev-body');
  if (E.err) { body.innerHTML = `<div class="errbox">${esc(E.err)}</div>`; return; }
  if (!E.files) { body.innerHTML = '<div class="empty"><span class="spin"></span></div>'; return; }
  if (!bs.S.project) { body.innerHTML = '<div class="empty">Abra um projeto.</div>'; return; }
  if (!E.files.length) { body.innerHTML = '<div class="empty">Nenhum .env na raiz do projeto.</div>'; return; }
  const f = E.files.find(x => x.name === E.sel) || E.files[0];
  const tabs = E.files.map(x => `<button class="ev-f${x === f ? ' on' : ''}" data-f="${esc(x.name)}">${esc(x.name)}<em>${x.vars.length}</em></button>`).join('');
  const notes = findings(f).map(([lvl, msg, fix]) => `<div class="ev-n ev-${lvl}"><span>${esc(msg)}</span>${fix === 'ignore' ? '<button class="chip" data-fix="ignore">Pôr no .gitignore</button>' : fix === 'example' ? '<button class="chip" data-fix="example">Gerar .env.example</button>' : ''}</div>`).join('');
  const rows = f.vars.map(v => {
    const sec = looksSecret(v.key, v.value), id = f.name + '\n' + v.key, show = E.shown.has(id) || f.example && !sec;
    return `<div class="ev-v" data-line="${v.line}"><span class="ev-k">${esc(v.key)}${sec ? '<i class="ev-lock" title="parece segredo">●</i>' : ''}</span>
      <span class="ev-val">${show ? (v.value ? esc(v.value) : '<i class="ev-empty">vazio</i>') : mask(v.value)}</span>
      ${v.value && !(f.example && !sec) ? `<button class="icon-btn ev-eye" data-id="${esc(id)}" title="${show ? 'Esconder' : 'Mostrar'}">${show ? '◉' : '◎'}</button>` : ''}</div>`;
  }).join('');
  body.innerHTML = `<div class="ev-files">${tabs}</div>${notes}<div class="ev-vars">${rows || '<div class="empty">Sem variáveis.</div>'}</div>
    <div class="ev-row"><button class="chip ev-open">Abrir ${esc(f.name)}</button></div>`;
}

async function fix(kind, btn) {
  const project = bs.S.project.path;
  btn.disabled = true;
  try {
    if (kind === 'ignore') {
      let cur = null; try { cur = (await bs.api('file', { project, file: '.gitignore' })).content; } catch {}
      const add = '\n# segredos locais\n.env\n.env.*\n!' + EXAMPLES.join('\n!') + '\n';
      if (cur == null) await bs.api('file/new', { project }, { method: 'POST', body: JSON.stringify({ path: '.gitignore', content: add.trimStart() }) });
      else await bs.api('file', { project, file: '.gitignore' }, { method: 'PUT', body: cur.replace(/\s*$/, '\n') + add });
      toast('.gitignore atualizado', 'ok');
    } else {
      const f = E.files.find(x => x.name === E.sel); const ex = E.files.find(x => x.example);
      const target = ex?.name || '.env.example';
      const text = (await bs.api('file', { project, file: f.name })).content.replace(/\r/g, '').split('\n')
        .map(l => l.replace(/^(\s*(?:export\s+)?[A-Za-z_][\w.-]*\s*=).*$/, '$1')).join('\n');
      if (ex) {
        if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = `Sobrescrever ${target}?`; btn.disabled = false; return; }
        await bs.api('file', { project, file: target }, { method: 'PUT', body: text });
      } else await bs.api('file/new', { project }, { method: 'POST', body: JSON.stringify({ path: target, content: text }) });
      toast(`${target} gerado só com os nomes, sem os valores`, 'ok');
    }
  } catch (e) { toast(e.message); }
  load();
}

function panel(el) {
  el.innerHTML = `<div class="ev-wrap"><div class="ev-top"><b>Variáveis de ambiente</b><span class="ev-sp"></span><button class="icon-btn ev-ref" title="Ler de novo">${bs.I.refresh}</button></div><div class="ev-body"></div></div>`;
  const w = el.querySelector('.ev-wrap');
  w.querySelector('.ev-ref').onclick = load;
  w.onclick = (e) => {
    const t = e.target;
    const f = t.closest('[data-f]'); if (f) { E.sel = f.dataset.f; draw(); return; }
    const eye = t.closest('.ev-eye'); if (eye) { const id = eye.dataset.id; E.shown.has(id) ? E.shown.delete(id) : E.shown.add(id); draw(); return; }
    const fx = t.closest('[data-fix]'); if (fx) return fix(fx.dataset.fix, fx);
    if (t.closest('.ev-open')) return bs.openFile(E.sel, 'editor');
    const v = t.closest('.ev-v'); if (v && t.closest('.ev-k')) bs.openFile(E.sel, 'editor', +v.dataset.line);
  };
  load();
}

bs.tools.register({ id: 'conferir-env', title: 'Env Checker', icon: ICON, order: 66, render() { panel(bs.$('#toolBody')); } });
bs.hooks.on('project:select', () => { E.shown.clear(); if (bs.$('#toolBody .ev-wrap')) load(); });
bs.hooks.on('tab:save', (t) => { if (/(^|\/)\.env|\.env$|\.gitignore$/.test(t?.path || '') && bs.$('#toolBody .ev-wrap')) load(); });
