const RW_ICON = '<svg class="i" viewBox="0 0 24 24"><path d="M4 6h10M4 10h6M4 14h4"/><circle cx="15" cy="15" r="4"/><path d="M18 18l3 3"/></svg>';
const RW_ATTRS = ['text', 'html', 'href', 'src', 'content', 'title', 'alt', 'value', 'datetime', 'data-src'];
const RW_URLATTR = /^(href|src|action|poster|data-src|data-href)$/i;
const RW_MAXPAGES = 500;
const RW_PAGEVAR = /\{(pagina|offset:\d+)\}/;
// {pagina} vira 1, 2, 3...; {offset:20} vira 0, 20, 40... (APIs que paginam por deslocamento)
const rwPageSub = (s, p) => String(s).replace(/\{(pagina|offset:(\d+))\}/g, (m, k, n) => n ? (p - 1) * n : p);

// A barra da esquerda tem atalhos próprios que engoliam o que se digitava nos campos.
function rwGuardKeys(wrap) {
  for (const ev of ['keydown', 'keypress', 'keyup']) wrap.addEventListener(ev, e => {
    if (e.target.matches('input, textarea') && !(e.ctrlKey && e.altKey)) e.stopPropagation();
  });
}

let rw = null, rwTimer = 0, rwPage = null, rwRun = null;
const rwRes = new Map();
const rwId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const rwNew = (o = {}) => ({ id: rwId(), name: 'Nova receita', urls: '', item: '', fields: [{ name: 'titulo', sel: 'h1', attr: 'text', all: false }],
  next: '', pages: 1, delay: 1000, out: '', browser: false, scrolls: 0, method: 'GET', headers: '', body: '', ...o });
const rwCur = () => rw.recipes.find(r => r.id === rw.cur);
const rwF = (name, sel, attr = 'text', all = false) => ({ name, sel, attr, all });
// Um exemplo de cada jeito de raspar, para aprender mexendo (botão Exemplos).
const RW_EXAMPLES = () => [
  rwNew({ name: 'Exemplo: livros (HTML com paginação)', urls: 'https://books.toscrape.com/', item: 'article.product_pod',
    fields: [rwF('titulo', 'h3 a', 'title'), rwF('preco', '.price_color'), rwF('estoque', '.availability'), rwF('link', 'h3 a', 'href'), rwF('capa', 'img', 'src')],
    next: 'li.next a', pages: 3, delay: 500 }),
  rwNew({ name: 'Exemplo: frases com rolagem infinita (navegador)', urls: 'https://quotes.toscrape.com/scroll', browser: true, scrolls: 2, item: '.quote',
    fields: [rwF('frase', '.text'), rwF('autor', '.author'), rwF('tags', '.tag', 'text', true)] }),
  // A API do MangaDex manda User-Agent de navegador falso para uma verificação anti-robô e pede um que diga quem é.
  rwNew({ name: 'Exemplo: MangaDex, os mais seguidos (API)',
    urls: 'https://api.mangadex.org/manga?limit=20&offset={offset:20}&order%5BfollowedCount%5D=desc&contentRating%5B%5D=safe',
    headers: 'User-Agent: web-scraper (BlueScreen plugin)', item: 'data', pages: 3, delay: 1000,
    fields: [rwF('titulo', 'attributes.title.*'), rwF('ano', 'attributes.year'), rwF('status', 'attributes.status'),
      rwF('ultimo_capitulo', 'attributes.lastChapter'), rwF('tags', 'attributes.tags.*.attributes.name.en'), rwF('id', 'id')] }),
];

async function rwLoad() {
  if (rw) return rw;
  let d = null;
  try { d = await plugin.data.get('raspador', null); } catch (e) { bs.toast('Não deu para ler as receitas: ' + e.message); }
  rw = d?.recipes?.length ? d : { recipes: [rwNew()] };
  rw.recipes = rw.recipes.map(r => rwNew(r));
  if (!rw.recipes.some(r => r.id === rw.cur)) rw.cur = rw.recipes[0].id;
  return rw;
}
const rwFlush = () => { clearTimeout(rwTimer); rwTimer = 0; return plugin.data.set('raspador', rw).catch(e => bs.toast('Não deu para salvar: ' + e.message)); };
const rwSave = () => { clearTimeout(rwTimer); rwTimer = setTimeout(rwFlush, 400); };
plugin.onUnload(() => { if (rwTimer) rwFlush(); if (rwRun) rwRun.stop = true; rwBClose(); });

const rwSleep = ms => new Promise(ok => setTimeout(ok, ms));
const rwSettings = () => plugin.settings.get().catch(() => ({}));
const rwHeader = (h, name) => {
  if (!h) return '';
  if (Array.isArray(h)) { const x = h.find(p => String(p[0]).toLowerCase() === name); return x ? x[1] : ''; }
  const k = Object.keys(h).find(k => k.toLowerCase() === name);
  return k ? h[k] : '';
};
const rwHeaderLines = s => {
  const h = {};
  for (const l of String(s || '').split('\n')) { const i = l.indexOf(':', 1); if (i > 0) h[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  return h;
};
const rwTryJson = s => { try { return JSON.parse(s); } catch { return undefined; } };

// ---------- busca direta (como o curl) ----------
// Busca como bytes para respeitar o charset da página (muito site brasileiro ainda é ISO-8859-1).
async function rwFetch(url, r = {}) {
  const set = await rwSettings();
  const method = r.method || 'GET';
  const opt = {
    method, as: 'base64', timeout: (+set.timeout || 20) * 1000,
    headers: { 'User-Agent': set.userAgent || 'Mozilla/5.0', Accept: 'text/html,application/xhtml+xml,application/json,*/*;q=0.8', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8', ...rwHeaderLines(r.headers) },
  };
  if (r.body && !/^(GET|HEAD)$/i.test(method)) opt.body = r.body;
  const res = await plugin.fetch(url, opt);
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  let text = res.body || '';
  const ct = rwHeader(res.headers, 'content-type');
  if (res.bodyBase64 != null) {
    const bytes = Uint8Array.from(atob(res.bodyBase64), c => c.charCodeAt(0));
    const cs = /charset=["']?([\w-]+)/i.exec(ct)?.[1]
      || /<meta[^>]+charset=["']?([\w-]+)/i.exec(new TextDecoder('latin1').decode(bytes.slice(0, 4096)))?.[1] || 'utf-8';
    try { text = new TextDecoder(cs).decode(bytes); } catch { text = new TextDecoder().decode(bytes); }
  }
  if (/json/i.test(ct) || /^\s*[[{]/.test(text)) {
    const json = rwTryJson(text);
    if (json !== undefined) return { json, url, base: url, size: text.length };
  }
  return rwParse(text, url);
}
function rwParse(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let base = url;
  const b = doc.querySelector('base[href]')?.getAttribute('href');
  if (b) try { base = new URL(b, url).href; } catch {}
  return { doc, html, base, url, size: html.length };
}

// ---------- navegador sem janela (Chrome ou Edge pelo DevTools Protocol) ----------
let rwB = null, rwBIdle = 0;
async function rwFindBrowser() {
  const set = await rwSettings();
  if (set.browser?.trim()) return set.browser.trim();
  if (/Windows/i.test(navigator.userAgent)) {
    const ps = '@("$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe","${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe",'
      + '"$env:LOCALAPPDATA\\Google\\Chrome\\Application\\chrome.exe","${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe",'
      + '"$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1';
    const r = await plugin.exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 15000 }).catch(() => null);
    if (r?.out?.trim()) return r.out.trim();
  } else {
    for (const p of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']) {
      const r = await plugin.exec('test', ['-x', p]).catch(() => null);
      if (r?.ok) return p;
    }
    for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      const r = await plugin.exec('which', [n]).catch(() => null);
      if (r?.ok && r.out.trim()) return r.out.trim();
    }
  }
  throw new Error('Não achei o Chrome nem o Edge. Indique o caminho nas configurações do plugin.');
}

function rwCdp(url) {
  return new Promise((ok, fail) => {
    const ws = new WebSocket(url), wait = new Map(), subs = new Set();
    let n = 0;
    const c = {
      send(method, params = {}, sessionId) {
        const id = ++n;
        ws.send(JSON.stringify({ id, method, params, sessionId }));
        return new Promise((ok2, fail2) => wait.set(id, { ok: ok2, fail: fail2 }));
      },
      on(f) { subs.add(f); return () => subs.delete(f); },
      close() { try { ws.close(); } catch {} },
    };
    ws.onopen = () => ok(c);
    ws.onerror = () => fail(new Error('Não deu para conectar no navegador'));
    ws.onclose = () => { for (const w of wait.values()) w.fail(new Error('A conexão com o navegador caiu')); wait.clear(); if (rwB?.cdp === c) rwB = null; };
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && wait.has(m.id)) { const w = wait.get(m.id); wait.delete(m.id); m.error ? w.fail(new Error(m.error.message)) : w.ok(m.result); }
      else if (m.method) for (const f of subs) f(m);
    };
  });
}

async function rwLaunch(onStatus) {
  const exe = await rwFindBrowser();
  // Processos de uma sessão anterior da IDE seguram a pasta do perfil: sem isso o navegador novo fecharia na hora.
  for (const p of await plugin.procs.list().catch(() => [])) { try { await plugin.procs.attach(p.id ?? p, {}).kill(); } catch {} }
  const prof = (await plugin.info()).dataDir.replace(/[\\/]+$/, '') + '/navegador';
  onStatus('Abrindo o navegador');
  let got, lost, buf = '';
  const wsUrl = new Promise((a, b) => { got = a; lost = b; });
  const proc = await plugin.spawn(exe, ['--headless=new', '--remote-debugging-port=0', '--remote-allow-origins=' + location.origin, '--user-data-dir=' + prof,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--mute-audio', '--window-size=1366,900', 'about:blank'], {
    label: 'Web Scraper: navegador',
    onData(t) { buf += t; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) got(m[1]); },
    onExit(code) { lost(new Error(`O navegador fechou (código ${code}). ${buf.slice(-300)}`)); if (rwB?.proc === proc) rwB = null; },
  });
  const t = setTimeout(() => lost(new Error('O navegador não respondeu em 20 s')), 20000);
  try { return { proc, cdp: await rwCdp(await wsUrl) }; }
  catch (e) { proc.kill().catch(() => {}); throw e; }
  finally { clearTimeout(t); }
}
function rwBClose() {
  clearTimeout(rwBIdle);
  const b = rwB; rwB = null;
  if (!b) return;
  b.cdp.send('Browser.close').catch(() => {}).finally(() => b.cdp.close());
  setTimeout(() => b.proc.kill().catch(() => {}), 2000);
}

const rwIsData = q => q.type === 'XHR' || q.type === 'Fetch' || /json|graphql/i.test(q.mime || '');

// Abre a URL numa aba sem janela, espera a rede acalmar (e o item aparecer), rola se pedido e devolve o HTML já montado
// e todas as requisições que a página fez, com a resposta das de dados.
async function rwBrowse(url, r, onStatus) {
  clearTimeout(rwBIdle);
  rwB ||= await rwLaunch(onStatus);
  const { cdp } = rwB, set = await rwSettings();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  const reqs = new Map(), extra = new Map();
  let inflight = 0, last = Date.now(), loaded = false;
  const off = cdp.on(m => {
    if (m.sessionId !== sessionId) return;
    const p = m.params;
    if (m.method === 'Network.requestWillBeSent') {
      const q = reqs.get(p.requestId);
      if (q) { q.url = p.request.url; q.method = p.request.method; }
      else { reqs.set(p.requestId, { id: p.requestId, url: p.request.url, method: p.request.method, headers: p.request.headers, postData: p.request.postData, type: p.type, status: 0, mime: '', size: 0 }); inflight++; }
      last = Date.now();
    } else if (m.method === 'Network.requestWillBeSentExtraInfo') extra.set(p.requestId, p.headers);
    else if (m.method === 'Network.responseReceived') {
      const q = reqs.get(p.requestId); if (q) { q.status = p.response.status; q.mime = p.response.mimeType; q.type = p.type || q.type; }
    } else if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') {
      const q = reqs.get(p.requestId);
      if (q && !q.done) { q.done = true; q.size = p.encodedDataLength || 0; q.failed = p.errorText; inflight--; }
      last = Date.now();
    } else if (m.method === 'Page.loadEventFired') loaded = true;
  });
  const quiet = () => Date.now() - last > (inflight <= 0 ? 700 : 1500);
  const evalJs = async expr => (await S('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value;
  try {
    await S('Network.enable', { maxPostDataSize: 65536 });
    await S('Page.enable');
    if (set.userAgent) await S('Network.setUserAgentOverride', { userAgent: set.userAgent });
    onStatus('Carregando ' + url);
    const nav = await S('Page.navigate', { url });
    if (nav.errorText) throw new Error(`${nav.errorText} em ${url}`);
    const deadline = Date.now() + (+set.timeout || 20) * 1000;
    const item = r.item.trim();
    const hasItem = () => evalJs(`(()=>{try{return !!document.querySelector(${JSON.stringify(item)})}catch(e){return true}})()`);
    while (Date.now() < deadline && !(loaded && quiet() && (!item || await hasItem()))) await rwSleep(200);
    for (let i = 0; i < (+r.scrolls || 0); i++) {
      onStatus(`Rolando a página (${i + 1}/${r.scrolls})`);
      await evalJs('window.scrollTo(0, document.scrollingElement.scrollHeight)');
      last = Date.now();
      const end = Date.now() + 8000;
      await rwSleep(300);
      while (Date.now() < end && !quiet()) await rwSleep(200);
    }
    const d = JSON.parse(await evalJs('JSON.stringify({ ct: document.contentType, url: location.href, html: document.documentElement.outerHTML, text: document.body ? document.body.innerText : "" })'));
    const list = [...reqs.values()].map(q => ({ ...q, headers: { ...q.headers, ...(extra.get(q.id) || {}) } }));
    for (const q of list.filter(q => rwIsData(q) && q.done && !q.failed).slice(0, 80)) {
      try { const b = await S('Network.getResponseBody', { requestId: q.id }); q.body = b.base64Encoded ? '' : b.body.slice(0, 2e6); } catch {}
    }
    const json = /json/i.test(d.ct) ? rwTryJson(d.text) : undefined;
    const page = json !== undefined ? { json, url: d.url, base: d.url, size: d.text.length } : rwParse(d.html, d.url);
    page.requests = list;
    return page;
  } finally {
    off();
    cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    rwBIdle = setTimeout(rwBClose, 120000);
  }
}

const rwGet = (url, r, onStatus = () => {}) => r.browser ? rwBrowse(url, r, onStatus) : rwFetch(url, r);

// ---------- extração ----------
function rwValue(el, attr, base) {
  if (!el) return '';
  if (!attr || attr === 'text') return (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (attr === 'html') return (el.innerHTML || '').trim();
  const v = el.getAttribute?.(attr);
  if (v == null) return '';
  if (RW_URLATTR.test(attr)) try { return new URL(v.trim(), base).href; } catch {}
  return v.trim();
}
// Caminho JSON: data.items, preco.valor, fotos.0.url (ou fotos[0].url). * passa por todos os itens de uma lista
// ou valores de um objeto (tags.*.nome, titulo.*). Vazio = o próprio valor.
function rwPath(o, p) {
  if (!p.trim()) return o;
  const keys = p.trim().replace(/\[(\d+)\]/g, '.$1').split('.');
  const go = (v, i) => {
    if (i === keys.length) return v;
    if (v == null) return undefined;
    if (keys[i] !== '*') return go(v[keys[i]], i + 1);
    const all = Array.isArray(v) ? v : typeof v === 'object' ? Object.values(v) : [];
    return all.map(x => go(x, i + 1)).filter(x => x !== undefined).flat();
  };
  return go(o, 0);
}
const rwJsonVal = v => v == null ? '' : Array.isArray(v) ? v.map(x => x && typeof x === 'object' ? JSON.stringify(x) : x).join(' | ')
  : typeof v === 'object' ? JSON.stringify(v) : String(v);
const rwItems = (page, r) => {
  if (page.json !== undefined) { const v = r.item.trim() ? rwPath(page.json, r.item) : page.json; return Array.isArray(v) ? v : v == null ? [] : [v]; }
  return r.item.trim() ? [...page.doc.querySelectorAll(r.item)] : [page.doc.documentElement];
};
// Sem item, a página inteira vira uma linha. Campo sem seletor pega o próprio item.
function rwExtract(page, r) {
  const isJson = page.json !== undefined;
  return rwItems(page, r).map(s => {
    const row = {};
    for (const f of r.fields) {
      if (!f.name.trim()) continue;
      const sel = f.sel.trim();
      if (isJson) row[f.name] = rwJsonVal(rwPath(s, sel));
      else if (f.all) row[f.name] = (sel ? [...s.querySelectorAll(sel)] : [s]).map(e => rwValue(e, f.attr, page.base)).filter(Boolean).join(' | ');
      else row[f.name] = rwValue(sel ? s.querySelector(sel) : s, f.attr, page.base);
    }
    return row;
  });
}
function rwNext(page, sel) {
  if (!sel.trim()) return '';
  if (page.json !== undefined) { const v = rwPath(page.json, sel); try { return typeof v === 'string' && v ? new URL(v, page.url).href : ''; } catch { return ''; } }
  return rwValue(page.doc.querySelector(sel), 'href', page.base);
}
const rwUrls = r => r.urls.split('\n').map(s => s.trim()).filter(s => /^https?:\/\//i.test(s));

// Acha a maior lista de objetos do JSON e sugere as colunas (valores simples e um nível de objeto dentro).
function rwGuessJson(json) {
  let best = { path: '', n: -1, arr: null };
  const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
  const walk = (o, path, d) => {
    if (d > 7 || !o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      if (o.length > best.n && o.some(isObj)) best = { path, n: o.length, arr: o };
      o.slice(0, 2).forEach((x, i) => walk(x, path ? path + '.' + i : String(i), d + 1));
      return;
    }
    for (const k of Object.keys(o)) walk(o[k], path ? path + '.' + k : k, d + 1);
  };
  walk(json, '', 0);
  const sample = (best.arr || [json]).filter(isObj).slice(0, 5), keys = [];
  const add = k => { if (!keys.includes(k) && keys.length < 15) keys.push(k); };
  const simple = v => v == null || typeof v !== 'object' || (Array.isArray(v) && v.every(x => x == null || typeof x !== 'object'));
  for (const it of sample) for (const [k, v] of Object.entries(it)) if (simple(v)) add(k);
  for (const it of sample) for (const [k, v] of Object.entries(it)) if (isObj(v)) for (const [k2, v2] of Object.entries(v)) if (simple(v2)) add(k + '.' + k2);
  return { item: best.arr ? best.path : '', fields: keys.map(k => ({ name: k.replace(/\./g, '_'), sel: k, attr: 'text', all: false })) };
}

function rwCsv(rows) {
  const cols = [...new Set(rows.flatMap(Object.keys))];
  const q = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.map(q).join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\n') + '\n';
}
function rwCurl(q) {
  const s = v => "'" + String(v).replace(/'/g, "'\\''") + "'";
  let c = `curl -X ${q.method} ${s(q.url)}`;
  for (const [k, v] of Object.entries(q.headers || {})) if (!k.startsWith(':')) c += ` \\\n  -H ${s(k + ': ' + v)}`;
  if (q.postData) c += ` \\\n  --data-raw ${s(q.postData)}`;
  return c;
}

async function rwScrape(r, onProgress) {
  const urls = rwUrls(r);
  if (!urls.length) throw new Error('Coloque ao menos uma URL começando com http:// ou https://');
  const run = rwRun = { stop: false }, rows = [], seen = new Set(), errors = [];
  const max = Math.min(RW_MAXPAGES, Math.max(1, +r.pages || 1)), wait = Math.max(0, +r.delay || 0);
  let n = 0;
  const one = async (u, req) => {
    if (n) await rwSleep(wait);
    if (run.stop) return null;
    n++;
    onProgress(`Página ${n}: ${u}`);
    const page = await rwGet(u, req, onProgress);
    const got = rwExtract(page, req);
    for (const g of got) g._pagina = u;
    rows.push(...got);
    return { page, got };
  };
  try {
    for (const start of urls) {
      try {
        if (RW_PAGEVAR.test(start + r.body)) {
          // {pagina} na URL ou no corpo: 1, 2, 3... até vir uma página sem linhas
          for (let p = 1; p <= max && !run.stop; p++) {
            const x = await one(rwPageSub(start, p), { ...r, body: rwPageSub(r.body, p) });
            if (!x || !x.got.length) break;
          }
          continue;
        }
        let u = start, k = 0;
        while (u && k < max && !seen.has(u) && !run.stop) {
          seen.add(u); k++;
          const x = await one(u, r);
          u = x ? rwNext(x.page, r.next) : '';
        }
      } catch (e) { errors.push(e.message); }
    }
  } finally { if (rwRun === run) rwRun = null; }
  if (n === 1) for (const g of rows) delete g._pagina;
  return { rows, pages: n, errors, stopped: run.stop };
}

// ---------- seletor visual ----------
const rwStable = c => /^[a-zA-Z_-][\w-]*$/.test(c) && !/\d{3,}|^(css|sc|jsx|svelte|emotion)-|^(active|hover|selected|focus|open|show)$/i.test(c);
function rwSimpleSel(e) {
  const cls = [...e.classList].filter(rwStable).slice(0, 2);
  return e.tagName.toLowerCase() + cls.map(c => '.' + CSS.escape(c)).join('');
}
function rwRepeatSel(e) {
  const s = rwSimpleSel(e);
  if (s.includes('.') || !e.parentElement || /^(html|body)$/i.test(e.parentElement.tagName)) return s;
  return rwSimpleSel(e.parentElement) + ' > ' + s;
}
// Sobe a partir do clique: a lista repetida mais baixa dá a quantidade; o item é o ancestral mais alto que repete
// a mesma quantidade (clicar no título de um card escolhe o card, não o título).
function rwItemSelector(el) {
  const doc = el.ownerDocument;
  let want = 0, pick = null;
  for (let e = el; e && e.parentElement && !/^(body|html)$/i.test(e.tagName); e = e.parentElement) {
    const s = rwRepeatSel(e);
    let n = 0; try { n = doc.querySelectorAll(s).length; } catch { continue; }
    if (!want && n >= 2) { want = n; pick = s; }
    else if (want && n === want) pick = s;
  }
  return pick || rwRepeatSel(el);
}
function rwFieldSelector(item, el) {
  if (item === el) return '';
  const chain = [];
  for (let e = el; e && e !== item; e = e.parentElement) chain.unshift(e);
  for (let i = chain.length - 1; i >= 0; i--) {
    const s = chain.slice(i).map(rwSimpleSel).join(' ');
    try { if (item.querySelector(s) === el) return s; } catch {}
  }
  const t = el.tagName.toLowerCase(), same = [...el.parentElement.children].filter(x => x.tagName === el.tagName);
  return chain.slice(0, -1).map(rwSimpleSel).concat(t + (same.length > 1 ? `:nth-of-type(${same.indexOf(el) + 1})` : '')).join(' > ');
}
const rwFieldAttr = el => el.tagName === 'IMG' ? 'src' : el.tagName === 'A' ? 'href' : 'text';
function rwFieldName(el, r) {
  const tag = el.tagName.toLowerCase(), known = { a: 'link', img: 'imagem', h1: 'titulo', h2: 'titulo', h3: 'titulo', h4: 'titulo', time: 'data', p: 'texto' };
  const base = (known[tag] || [...el.classList].find(rwStable) || tag).replace(/[^\w]+/g, '_');
  let n = base, i = 2;
  while (r.fields.some(f => f.name === n)) n = base + i++;
  return n;
}

let rwPick = null;
function rwShowPicker(page) {
  const box = rwPage.querySelector('.rw-pickbox');
  if (page.json !== undefined) { box.innerHTML = '<div class="rw-msg">Esta fonte é JSON: use os caminhos (ex.: <code>data.items</code>) no item e nos campos.</div>'; return; }
  box.innerHTML = `<div class="rw-row"><button class="chip" data-pick="item">Escolher o item</button><button class="chip" data-pick="field">Escolher um campo</button>
    <span class="rw-hint">Clique no botão e depois na página. Os itens achados ficam em azul.</span></div><iframe class="rw-frame" sandbox="allow-same-origin"></iframe>`;
  const fr = box.querySelector('iframe');
  const html = page.html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<head([^>]*)>/i, `<head$1><base href="${bs.esc(page.base)}">`);
  fr.onload = () => {
    const d = fr.contentDocument; if (!d?.documentElement) return;
    const st = d.createElement('style');
    st.textContent = '.rw-hov{outline:2px dashed #f0883e!important;cursor:crosshair!important}.rw-itm{outline:2px solid #1f6feb!important;outline-offset:-2px}';
    (d.head || d.documentElement).appendChild(st);
    d.addEventListener('mouseover', e => { if (rwPick) e.target.classList?.add('rw-hov'); });
    d.addEventListener('mouseout', e => e.target.classList?.remove('rw-hov'));
    d.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (rwPick) rwPicked(e.target, d); }, true);
    rwMarkItems(d);
  };
  fr.srcdoc = /<head/i.test(html) ? html : `<base href="${bs.esc(page.base)}">` + html;
}
function rwMarkItems(d) {
  d.querySelectorAll('.rw-itm').forEach(x => x.classList.remove('rw-itm'));
  const s = rwCur().item.trim(); if (!s) return 0;
  try { const l = d.querySelectorAll(s); l.forEach(x => x.classList.add('rw-itm')); return l.length; } catch { return 0; }
}
function rwPicked(el, d) {
  const r = rwCur();
  el.classList.remove('rw-hov');
  if (rwPick === 'item') {
    r.item = rwItemSelector(el);
    rwPage.querySelector('.rw-item').value = r.item;
    rwStatus(`Item: ${r.item} · ${rwMarkItems(d)} na página. Agora escolha os campos.`);
    rwPick = 'field';
  } else {
    const item = r.item.trim() ? el.closest(r.item) : d.documentElement;
    if (!item) return rwStatus('Clique dentro de um item (os de borda azul), ou escolha o item primeiro.');
    r.fields.push({ name: rwFieldName(el, r), sel: rwFieldSelector(item, el), attr: rwFieldAttr(el), all: false });
    rwDrawFields();
    rwStatus('Campo acrescentado. Clique em outro ou em Testar.');
  }
  rwSave();
  rwPage.querySelectorAll('[data-pick]').forEach(b => b.classList.toggle('on', b.dataset.pick === rwPick));
}

// ---------- tela ----------
function rwTable(rows, limit = 200) {
  if (!rows.length) return '<div class="rw-msg">Nenhuma linha. Confira o item.</div>';
  const cols = [...new Set(rows.flatMap(Object.keys))];
  const cell = v => { const s = String(v ?? ''); return /^https?:\/\//.test(s) ? `<a href="#" data-open="${bs.esc(s)}">${bs.esc(s)}</a>` : bs.esc(s); };
  return `<table class="rw-grid"><thead><tr><th>#</th>${cols.map(c => `<th>${bs.esc(c)}</th>`).join('')}</tr></thead><tbody>${
    rows.slice(0, limit).map((r, i) => `<tr><td class="rw-n">${i + 1}</td>${cols.map(c => `<td title="${bs.esc(String(r[c] ?? ''))}">${cell(r[c])}</td>`).join('')}</tr>`).join('')
  }</tbody></table>${rows.length > limit ? `<div class="rw-msg">Mostrando ${limit} de ${rows.length} linhas; a exportação leva todas.</div>` : ''}`;
}
function rwFieldRow(f, i) {
  return `<div class="rw-field" data-i="${i}">
    <input class="rw-in rw-fname" data-k="name" value="${bs.esc(f.name)}" placeholder="coluna" spellcheck="false">
    <input class="rw-in rw-fsel" data-k="sel" value="${bs.esc(f.sel)}" placeholder="seletor CSS ou caminho JSON (vazio = o próprio item)" spellcheck="false">
    <input class="rw-in rw-fattr" data-k="attr" value="${bs.esc(f.attr)}" list="rw-attrs" placeholder="text" spellcheck="false" title="Só para HTML">
    <label class="rw-chk" title="Junta todos os que casarem, separados por |"><input type="checkbox" data-k="all" ${f.all ? 'checked' : ''}>todos</label>
    <span class="rw-count" data-count="${i}"></span>
    <button class="chip rw-del" data-del="${i}" title="Tirar o campo">×</button>
  </div>`;
}
const rwDrawFields = () => { const el = rwPage?.querySelector('.rw-fields'); if (el) el.innerHTML = rwCur().fields.map(rwFieldRow).join(''); };

function rwDraw() {
  const el = rwPage; if (!el || !rw) return;
  const r = rwCur(), res = rwRes.get(r.id);
  el.innerHTML = `<div class="rw-wrap">
    <div class="rw-row"><input class="rw-in rw-name" value="${bs.esc(r.name)}" spellcheck="false" title="Nome da receita">
      <button class="chip" data-act="dup">Duplicar</button><button class="chip" data-act="del">Apagar receita</button></div>
    <label class="rw-lbl">URLs <span>uma por linha. <code>{pagina}</code> vira 1, 2, 3... e <code>{offset:20}</code> vira 0, 20, 40..., até vir uma página vazia</span></label>
    <textarea class="rw-in rw-ta rw-urls" spellcheck="false" placeholder="https://exemplo.com/produtos?page={pagina}">${bs.esc(r.urls)}</textarea>
    <div class="rw-row rw-mode">
      <label class="rw-chk"><input type="checkbox" class="rw-browser" ${r.browser ? 'checked' : ''}>Abrir num navegador de verdade</label>
      <span class="rw-hint">roda o JavaScript da página (lojas, SPAs) e mostra as requisições que ela faz</span>
      <span class="rw-sp"></span>
      <label class="rw-lbl2 rw-onb" ${r.browser ? '' : 'hidden'}>Rolar até o fim <input class="rw-in rw-scrolls" type="number" min="0" max="50" value="${+r.scrolls || 0}"> vezes</label>
    </div>
    <label class="rw-lbl">Item <span>o que vira cada linha: seletor CSS (ex.: <code>.produto</code>, <code>table tr</code>) ou, em JSON, o caminho da lista (ex.: <code>data.items</code>). Vazio = uma linha só</span></label>
    <input class="rw-in rw-item" value="${bs.esc(r.item)}" spellcheck="false" placeholder="article.card">
    <label class="rw-lbl">Campos <span>dentro de cada item. Atributo (HTML): text, html, href, src ou qualquer outro; links viram endereço completo</span></label>
    <div class="rw-fields">${r.fields.map(rwFieldRow).join('')}</div>
    <datalist id="rw-attrs">${RW_ATTRS.map(a => `<option value="${a}">`).join('')}</datalist>
    <div class="rw-row"><button class="chip" data-act="add">+ Campo</button><button class="chip" data-act="picker">Escolher clicando na página</button></div>
    <div class="rw-pickbox"></div>
    <details class="rw-more" ${r.next || +r.pages > 1 ? 'open' : ''}><summary>Paginação e ritmo</summary>
      <div class="rw-row"><label class="rw-lbl2">Próxima página</label><input class="rw-in rw-next" value="${bs.esc(r.next)}" spellcheck="false" placeholder="a[rel=next]  ou, em JSON, o caminho da URL seguinte (ex.: links.next)"></div>
      <div class="rw-row"><label class="rw-lbl2">Máx. de páginas por URL</label><input class="rw-in rw-pages" type="number" min="1" max="${RW_MAXPAGES}" value="${+r.pages || 1}">
        <label class="rw-lbl2">Espera entre páginas (ms)</label><input class="rw-in rw-delay" type="number" min="0" step="250" value="${+r.delay || 0}"></div>
    </details>
    <details class="rw-more" ${r.headers || r.body || r.method !== 'GET' ? 'open' : ''}><summary>Pedido: método, headers e corpo (sem o navegador)</summary>
      <div class="rw-row"><select class="rw-in rw-method">${['GET', 'POST', 'PUT', 'PATCH'].map(m => `<option ${m === r.method ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <span class="rw-hint">Preenchido sozinho por <b>Usar esta API</b>. <code>{pagina}</code> também vale no corpo.</span></div>
      <textarea class="rw-in rw-ta rw-headers" spellcheck="false" placeholder="Authorization: Bearer ...">${bs.esc(r.headers)}</textarea>
      <textarea class="rw-in rw-ta rw-body" spellcheck="false" placeholder='{"page": {pagina}}'>${bs.esc(r.body)}</textarea>
    </details>
    <div class="rw-row">
      <button class="chip primary" data-act="test" title="Busca só a primeira URL e mostra o que cada campo pega">Testar na 1ª página</button>
      <button class="chip primary" data-act="run">Raspar tudo</button>
      <button class="chip" data-act="stop" ${rwRun ? '' : 'disabled'}>Parar</button>
      <span class="rw-status"></span>
    </div>
    <details class="rw-more rw-reqs" ${rwFirst?.requests ? 'open' : ''}><summary>Requisições da página <span class="rw-reqn"></span></summary><div class="rw-reqbox"></div></details>
    <details class="rw-more"><summary>Testar um seletor</summary>
      <div class="rw-row"><input class="rw-in rw-probe" spellcheck="false" placeholder="seletor CSS ou caminho JSON na 1ª página"><button class="chip" data-act="probe">Testar</button></div>
      <pre class="rw-pre rw-probeout"></pre>
    </details>
    <div class="rw-row rw-exp">
      <button class="chip" data-act="csv" ${res?.rows?.length ? '' : 'disabled'}>Copiar CSV</button>
      <button class="chip" data-act="json" ${res?.rows?.length ? '' : 'disabled'}>Copiar JSON</button>
      <input class="rw-in rw-out" value="${bs.esc(r.out)}" spellcheck="false" placeholder="raspagem/${bs.esc(rwSlug(r.name))}.csv" title="Caminho no projeto aberto; .json salva em JSON">
      <button class="chip" data-act="save" ${res?.rows?.length ? '' : 'disabled'}>Salvar no projeto</button>
    </div>
    <div class="rw-res">${res ? rwResHtml(res) : ''}</div>
  </div>`;
  rwGuardKeys(el.querySelector('.rw-wrap'));
  rwPick = null;
  rwDrawReqs();
}
const rwSlug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'raspagem';
const rwResHtml = res => `<div class="rw-meta">${res.rows.length} linha${res.rows.length === 1 ? '' : 's'} · ${res.pages} página${res.pages === 1 ? '' : 's'}${res.stopped ? ' · parado' : ''}${res.test ? ' · teste' : ''}</div>`
  + (res.errors?.length ? `<div class="rw-err">${res.errors.map(bs.esc).join('<br>')}</div>` : '') + rwTable(res.rows);
const rwStatus = t => { const s = rwPage?.querySelector('.rw-status'); if (s) { s.textContent = t; s.title = t; } };
const rwSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

// ---------- requisições capturadas ----------
let rwReqSel = null, rwReqFilter = { text: '', data: true };
function rwDrawReqs() {
  const box = rwPage?.querySelector('.rw-reqbox'); if (!box) return;
  const all = rwFirst?.requests;
  if (!all) { box.innerHTML = '<div class="rw-msg">Marque <b>Abrir num navegador de verdade</b> e clique em <b>Testar na 1ª página</b>: aparece tudo o que a página pediu, e as APIs com os dados viram fonte com um clique.</div>'; rwPage.querySelector('.rw-reqn').textContent = ''; return; }
  const t = rwReqFilter.text.toLowerCase();
  const list = all.filter(q => (!rwReqFilter.data || rwIsData(q)) && (!t || q.url.toLowerCase().includes(t) || (q.body || '').toLowerCase().includes(t)));
  rwPage.querySelector('.rw-reqn').textContent = `(${list.length} de ${all.length})`;
  box.innerHTML = `<div class="rw-row"><input class="rw-in rw-reqq" value="${bs.esc(rwReqFilter.text)}" spellcheck="false" placeholder="filtrar pela URL ou por um texto da resposta (ex.: um preço que aparece na página)">
      <label class="rw-chk"><input type="checkbox" class="rw-reqdata" ${rwReqFilter.data ? 'checked' : ''}>só dados (XHR, fetch, JSON)</label></div>
    <div class="rw-reqlist">${list.map(q => `<button class="rw-req ${q === rwReqSel ? 'on' : ''}" data-req="${all.indexOf(q)}">
      <span class="rw-rm">${bs.esc(q.method)}</span><span class="rw-rs ${q.failed || q.status >= 400 ? 'bad' : ''}">${q.failed ? 'erro' : q.status || '...'}</span>
      <span class="rw-rt">${bs.esc(q.type || '')}</span><span class="rw-ru">${bs.esc(q.url)}</span><span class="rw-rz">${rwSize(q.size || 0)}</span></button>`).join('') || '<div class="rw-msg">Nada com esse filtro.</div>'}</div>
    <div class="rw-reqdet"></div>`;
  if (rwReqSel && list.includes(rwReqSel)) rwDrawReq(rwReqSel);
}
function rwDrawReq(q) {
  rwReqSel = q;
  const det = rwPage.querySelector('.rw-reqdet'); if (!det) return;
  const json = rwTryJson(q.body || '');
  const body = json !== undefined ? JSON.stringify(json, null, 2) : (q.body || '');
  det.innerHTML = `<div class="rw-row"><b class="rw-ru">${bs.esc(q.method)} ${bs.esc(q.url)}</b></div>
    <div class="rw-row">
      <button class="chip primary" data-act="useapi" ${json !== undefined || !q.body ? '' : 'title="A resposta não é JSON: a receita usa o HTML dela"'}>Usar esta API</button>
      <button class="chip" data-act="curl">Copiar como curl</button>
      <button class="chip" data-act="copybody" ${q.body ? '' : 'disabled'}>Copiar resposta</button>
      <span class="rw-hint">${bs.esc(q.mime || '')} · ${rwSize(q.size || 0)}${json !== undefined ? ' · ' + bs.esc(rwGuessJson(json).item || '(raiz)') + ' parece a lista' : ''}</span>
    </div>
    <details class="rw-more"><summary>Headers do pedido</summary><pre class="rw-pre">${bs.esc(Object.entries(q.headers || {}).map(([k, v]) => k + ': ' + v).join('\n'))}</pre></details>
    ${q.postData ? `<details class="rw-more" open><summary>Corpo do pedido</summary><pre class="rw-pre">${bs.esc(q.postData)}</pre></details>` : ''}
    <pre class="rw-pre rw-resp">${body ? bs.esc(body.slice(0, 40000)) + (body.length > 40000 ? '\n…' : '') : '(sem resposta guardada: só as de dados são guardadas)'}</pre>`;
  rwPage.querySelectorAll('.rw-req').forEach(b => b.classList.toggle('on', +b.dataset.req === rwFirst.requests.indexOf(q)));
}
// Vira uma receita nova que chama a API direto (sem navegador), com os mesmos headers, e já testa.
function rwUseApi(src, q) {
  const skip = /^(:|content-length$|accept-encoding$|host$|connection$|sec-fetch-|sec-ch-|upgrade-insecure|priority$|referer$)/i;
  const json = rwTryJson(q.body || '');
  const g = json !== undefined ? rwGuessJson(json) : { item: '', fields: [{ name: 'titulo', sel: 'title', attr: 'text', all: false }] };
  let host = q.url; try { host = new URL(q.url).hostname; } catch {}
  const r = rwNew({
    name: 'API de ' + host, urls: q.url, method: /^(GET|POST|PUT|PATCH)$/.test(q.method) ? q.method : 'GET', body: q.postData || '',
    headers: Object.entries(q.headers || {}).filter(([k]) => !skip.test(k)).map(([k, v]) => k + ': ' + v).join('\n'),
    item: g.item, fields: g.fields.length ? g.fields : [{ name: 'valor', sel: '', attr: 'text', all: false }], delay: src.delay, out: '',
  });
  rw.recipes.push(r); rw.cur = r.id; rwFirst = null; rwReqSel = null;
  rwSave(); rwPanel(); rwDraw();
  rwClick(null, 'test');
  bs.toast('Receita nova a partir da API. Ajuste as colunas e use {pagina} na URL para paginar.');
}

// ---------- ações ----------
// Ações que apagam pedem um segundo clique no mesmo botão (a IDE não usa confirm()).
function rwSure(btn, ask) {
  if (!btn || btn.dataset.sure) return true;
  const old = btn.textContent;
  btn.dataset.sure = '1'; btn.textContent = ask; btn.classList.add('danger');
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.sure; btn.textContent = old; btn.classList.remove('danger'); } }, 4000);
  return false;
}

let rwFirst = null; // a 1ª página, guardada para os testes de seletor e o seletor visual não buscarem de novo
async function rwFirstPage(r, fresh) {
  const u = rwUrls(r)[0];
  if (!u) throw new Error('Coloque ao menos uma URL começando com http:// ou https://');
  const url = rwPageSub(u, 1), key = url + '|' + r.browser + '|' + r.method + '|' + r.body + '|' + r.headers;
  if (fresh || rwFirst?.key !== key) {
    rwStatus('Buscando ' + url);
    rwFirst = await rwGet(url, { ...r, body: rwPageSub(r.body, 1) }, rwStatus);
    rwFirst.key = key; rwReqSel = null;
    rwDrawReqs();
  }
  return rwFirst;
}
function rwCounts(page, r) {
  const items = rwItems(page, r), first = items[0], isJson = page.json !== undefined;
  rwPage.querySelectorAll('[data-count]').forEach(s => {
    const f = r.fields[+s.dataset.count], sel = f?.sel.trim();
    if (!f) return;
    if (isJson) {
      const v = first === undefined ? undefined : rwPath(first, sel);
      s.textContent = v === undefined || v === null ? 'nada' : rwJsonVal(v).slice(0, 30) || '(vazio)';
      s.className = 'rw-count' + (v == null ? ' bad' : '');
      return;
    }
    let n = 0; try { n = !first ? 0 : sel ? first.querySelectorAll(sel).length : 1; } catch { s.textContent = 'seletor inválido'; s.className = 'rw-count bad'; return; }
    s.textContent = n ? n + ' no 1º item' : 'nada';
    s.className = 'rw-count' + (n ? '' : ' bad');
  });
  return items.length;
}

async function rwAct(act, r, btn) {
  const res = rwRes.get(r.id);
  if (act === 'add') { r.fields.push({ name: 'campo' + (r.fields.length + 1), sel: '', attr: 'text', all: false }); rwSave(); rwDrawFields(); return; }
  if (act === 'dup') { const c = { ...structuredClone(r), id: rwId(), name: r.name + ' (cópia)' }; rw.recipes.push(c); rw.cur = c.id; rwSave(); rwDraw(); rwPanel(); return; }
  if (act === 'del') {
    if (!rwSure(btn, 'Clique de novo para apagar')) return;
    rw.recipes = rw.recipes.filter(x => x !== r); if (!rw.recipes.length) rw.recipes.push(rwNew());
    rw.cur = rw.recipes[0].id; rwRes.delete(r.id); rwSave(); rwDraw(); rwPanel(); return;
  }
  if (act === 'stop') { if (rwRun) rwRun.stop = true; return; }
  if (act === 'csv' || act === 'json') {
    await navigator.clipboard.writeText(act === 'csv' ? rwCsv(res.rows) : JSON.stringify(res.rows, null, 2));
    bs.toast(act.toUpperCase() + ' copiado'); return;
  }
  if (act === 'save') return rwSaveFile(r, res.rows, btn);
  if (act === 'curl') { await navigator.clipboard.writeText(rwCurl(rwReqSel)); bs.toast('curl copiado'); return; }
  if (act === 'copybody') { await navigator.clipboard.writeText(rwReqSel.body || ''); bs.toast('Resposta copiada'); return; }
  if (act === 'useapi') return rwUseApi(r, rwReqSel);
  if (act === 'picker') { const page = await rwFirstPage(r); rwStatus(''); rwShowPicker(page); return; }
  if (act === 'probe') {
    const sel = rwPage.querySelector('.rw-probe').value.trim(), out = rwPage.querySelector('.rw-probeout');
    if (!sel) return;
    const page = await rwFirstPage(r); rwStatus('');
    if (page.json !== undefined) { const v = rwPath(page.json, sel); out.textContent = v === undefined ? 'Nada nesse caminho.' : JSON.stringify(v, null, 2).slice(0, 20000); return; }
    let els; try { els = [...page.doc.querySelectorAll(sel)]; } catch { out.textContent = 'Seletor inválido.'; return; }
    out.textContent = `${els.length} elemento${els.length === 1 ? '' : 's'}\n\n` + els.slice(0, 5).map(e => e.outerHTML.replace(/\s+/g, ' ').slice(0, 400)).join('\n\n');
    return;
  }
  if (act === 'test') {
    const page = await rwFirstPage(r, true);
    const nItems = rwCounts(page, r);
    const rows = rwExtract(page, r);
    const nx = rwNext(page, r.next);
    rwRes.set(r.id, { rows, pages: 1, test: true, errors: [] });
    const nData = page.requests?.filter(rwIsData).length;
    rwStatus(`${rwSize(page.size)}${page.json !== undefined ? ' de JSON' : ''} · ${nItems} ite${nItems === 1 ? 'm' : 'ns'}`
      + (r.next.trim() ? (nx ? ' · próxima: ' + nx : ' · próxima página não achada') : '')
      + (page.requests ? ` · ${page.requests.length} requisições (${nData} de dados)` : '')
      + (!r.browser && page.doc?.body && page.doc.body.textContent.trim().length < 200 ? ' · página quase vazia: tente Abrir num navegador de verdade' : ''));
    rwPage.querySelector('.rw-res').innerHTML = rwResHtml(rwRes.get(r.id));
    rwPage.querySelectorAll('.rw-exp .chip').forEach(b => b.disabled = !rows.length);
    if (page.requests) rwPage.querySelector('.rw-reqs').open = true;
    const fr = rwPage.querySelector('.rw-frame');
    if (fr) rwShowPicker(page);
    return;
  }
  if (act === 'run') {
    if (rwRun) return bs.toast('Já tem uma raspagem rodando');
    rwPage.querySelector('[data-act=stop]').disabled = false;
    const out = await rwScrape(r, rwStatus);
    rwRes.set(r.id, out);
    if (rwCur() === r) { rwDraw(); rwStatus(out.errors.length ? `${out.errors.length} erro(s)` : 'Pronto'); }
    bs.toast(`Web Scraper: ${out.rows.length} linhas de ${out.pages} página(s)`);
  }
}

async function rwSaveFile(r, rows, btn) {
  if (!bs.S.project) return bs.toast('Abra um projeto para salvar nele');
  const project = bs.S.project.path;
  const path = (rwPage.querySelector('.rw-out').value.trim() || `raspagem/${rwSlug(r.name)}.csv`).replace(/\\/g, '/').replace(/^\/+/, '');
  const text = /\.json$/i.test(path) ? JSON.stringify(rows, null, 2) + '\n' : rwCsv(rows);
  let exists = false;
  try { await bs.api('file', { project, file: path }); exists = true; } catch {}
  if (exists) {
    if (!rwSure(btn, 'Já existe: clique para substituir')) return;
    await bs.api('file', { project, file: path }, { method: 'PUT', body: text });
  } else await bs.api('file/new', { project }, { method: 'POST', body: JSON.stringify({ path, content: text }) });
  bs.toast('Salvo em ' + path);
  bs.openFile?.(project.replace(/[\\/]+$/, '') + '/' + path);
}

function rwBind(el) {
  const up = fn => { const r = rwCur(); fn(r); rwSave(); };
  const on = (cls, fn) => el.addEventListener('input', e => { if (e.target.classList.contains(cls)) fn(e.target); });
  on('rw-name', t => { up(r => r.name = t.value); rwPanel(); });
  on('rw-urls', t => up(r => r.urls = t.value));
  on('rw-item', t => { up(r => r.item = t.value); const d = rwPage.querySelector('.rw-frame')?.contentDocument; if (d) rwMarkItems(d); });
  on('rw-next', t => up(r => r.next = t.value));
  on('rw-pages', t => up(r => r.pages = +t.value || 1));
  on('rw-delay', t => up(r => r.delay = +t.value || 0));
  on('rw-out', t => up(r => r.out = t.value));
  on('rw-scrolls', t => up(r => r.scrolls = +t.value || 0));
  on('rw-headers', t => up(r => r.headers = t.value));
  on('rw-body', t => up(r => r.body = t.value));
  on('rw-method', t => up(r => r.method = t.value));
  on('rw-browser', t => { up(r => r.browser = t.checked); rwPage.querySelector('.rw-onb').hidden = !t.checked; });
  on('rw-reqq', t => { rwReqFilter.text = t.value; const pos = t.selectionStart; rwDrawReqs(); const n = rwPage.querySelector('.rw-reqq'); n.focus(); n.setSelectionRange(pos, pos); });
  on('rw-reqdata', t => { rwReqFilter.data = t.checked; rwDrawReqs(); });
  el.addEventListener('input', e => {
    const t = e.target;
    if (!t.dataset.k) return;
    const i = +t.closest('[data-i]').dataset.i;
    up(r => r.fields[i][t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value);
  });
  el.addEventListener('change', e => { if (e.target.classList.contains('rw-method')) up(r => r.method = e.target.value); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('rw-probe')) rwClick(null, 'probe'); });
  el.addEventListener('click', e => {
    const a = e.target.closest('a[data-open]');
    if (a) { e.preventDefault(); window.open(a.dataset.open, '_blank'); return; }
    const d = e.target.closest('[data-del]');
    if (d) { rwCur().fields.splice(+d.dataset.del, 1); rwSave(); rwDrawFields(); return; }
    const q = e.target.closest('[data-req]');
    if (q) { rwDrawReq(rwFirst.requests[+q.dataset.req]); return; }
    const p = e.target.closest('[data-pick]');
    if (p) { rwPick = rwPick === p.dataset.pick ? null : p.dataset.pick; rwPage.querySelectorAll('[data-pick]').forEach(b => b.classList.toggle('on', b.dataset.pick === rwPick)); return; }
    const b = e.target.closest('[data-act]');
    if (b) rwClick(b, b.dataset.act);
  });
}
async function rwClick(btn, act) {
  const r = rwCur();
  try { await rwAct(act, r, btn); }
  catch (err) { rwStatus(''); bs.toast('Web Scraper: ' + err.message); }
}

function rwPanel() {
  const body = bs.$('#toolBody');
  if (!body || !body.querySelector('.rw-list') || !rw) return;
  body.querySelector('.rw-list').innerHTML = rw.recipes.map(r =>
    `<button class="rw-ritem ${r.id === rw.cur ? 'on' : ''}" data-id="${r.id}">${RW_ICON}<span>${bs.esc(r.name)}</span></button>`).join('');
}

bs.tools.register({
  id: 'web-scraper', title: 'Web Scraper', icon: RW_ICON, order: 63, page: 'web-scraper',
  async render() {
    const body = bs.$('#toolBody');
    body.innerHTML = `<div class="rw-side"><div class="rw-row"><b class="rw-sp">Receitas</b><button class="chip" data-examples title="Acrescenta receitas prontas para testar">Exemplos</button><button class="chip" data-new>+ Nova</button></div><div class="rw-list"></div></div>`;
    await rwLoad(); rwPanel();
    body.querySelector('.rw-side').addEventListener('click', e => {
      if (e.target.closest('[data-new]')) { const r = rwNew(); rw.recipes.push(r); rw.cur = r.id; rwSave(); }
      else if (e.target.closest('[data-examples]')) {
        const add = RW_EXAMPLES().filter(x => !rw.recipes.some(r => r.name === x.name));
        if (!add.length) return bs.toast('Os exemplos já estão na lista');
        rw.recipes.push(...add); rw.cur = add[0].id; rwSave();
      }
      else { const b = e.target.closest('[data-id]'); if (!b) return; rw.cur = b.dataset.id; }
      rwFirst = null; rwReqSel = null; rwPanel(); rwDraw(); bs.pages.open('web-scraper');
    });
  },
});
bs.pages.register({
  id: 'web-scraper', title: 'Web Scraper', icon: RW_ICON, pinned: true,
  render(el) { rwPage = el; el.classList.add('rw-page'); rwBind(el); rwLoad().then(rwDraw); },
  show() { rwDraw(); }, hide() {},
});
bs.actions.add([{ label: 'Web Scraper: abrir', icon: RW_ICON, run: () => bs.pages.open('web-scraper') }]);
