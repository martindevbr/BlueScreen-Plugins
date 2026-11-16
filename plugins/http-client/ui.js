// A barra da esquerda tem atalhos de teclado próprios (busca na árvore etc.) que engoliam o que se digitava nos campos.
function guardKeys(wrap) {
  for (const ev of ['keydown', 'keypress', 'keyup']) wrap.addEventListener(ev, e => {
    if (e.target.matches('input, textarea') && !(e.ctrlKey && e.altKey)) e.stopPropagation();
  });
}

const HP_ICON = '<svg class="i" viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>';
const HP_PLUS = '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
const HP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const HP_NOBODY = ['GET', 'HEAD'];
let hp = null, hpTimer = 0;
const hpRes = new Map();
const hpNew = () => ({ id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: 'Nova requisição', method: 'GET', url: '', headers: '', body: '', token: '' });

async function hpLoad() {
  if (hp) return hp;
  let d = null;
  try { d = await plugin.data.get('http', null); } catch (e) { bs.toast('Não deu para ler as requisições: ' + e.message); }
  hp = d?.reqs?.length ? d : { reqs: [hpNew()], vars: '', history: [] };
  hp.history ||= []; hp.vars ||= '';
  if (!hp.reqs.some(r => r.id === hp.cur)) hp.cur = hp.reqs[0].id;
  return hp;
}
const hpFlush = () => { clearTimeout(hpTimer); hpTimer = 0; return plugin.data.set('http', hp).catch(e => bs.toast('Não deu para salvar: ' + e.message)); };
const hpSave = () => { clearTimeout(hpTimer); hpTimer = setTimeout(hpFlush, 400); };
plugin.onUnload(() => { if (hpTimer) hpFlush(); });

function hpVars() {
  const m = {};
  for (const l of hp.vars.split('\n')) { const i = l.indexOf('='); if (i > 0) m[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  return m;
}
// Só troca nomes simples; marcadores de segredo (com ":") passam intactos para o plugin.fetch.
const hpSub = (s, v) => String(s).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (all, k) => k in v ? v[k] : all);
function hpHeaders(r, v) {
  const h = {};
  for (const l of r.headers.split('\n')) { const i = l.indexOf(':'); if (i > 0) h[hpSub(l.slice(0, i).trim(), v)] = hpSub(l.slice(i + 1).trim(), v); }
  if (r.token.trim()) h.Authorization = 'Bearer ' + hpSub(r.token.trim(), v);
  return h;
}
function hpCurl(r) {
  const v = hpVars(), q = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
  let c = `curl -X ${r.method} ${q(hpSub(r.url.trim(), v))}`;
  for (const [k, x] of Object.entries(hpHeaders(r, v))) c += ` \\\n  -H ${q(k + ': ' + x)}`;
  if (r.body && !HP_NOBODY.includes(r.method)) c += ` \\\n  --data-raw ${q(hpSub(r.body, v))}`;
  return c;
}
const hpSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

function hpImport(src) {
  const c = JSON.parse(src), out = [];
  const walk = (items, prefix) => {
    for (const it of items || []) {
      if (it.item) { walk(it.item, prefix + it.name + ' / '); continue; }
      const rq = it.request; if (!rq) continue;
      const url = typeof rq === 'string' ? rq : typeof rq.url === 'string' ? rq.url : rq.url?.raw || '';
      const bearer = rq.auth?.type === 'bearer' ? [].concat(rq.auth.bearer || []).find(b => b.key === 'token')?.value : '';
      out.push({ ...hpNew(), name: prefix + (it.name || url), method: String(rq.method || 'GET').toUpperCase(), url,
        headers: (rq.header || []).filter(h => !h.disabled).map(h => h.key + ': ' + h.value).join('\n'),
        body: rq.body?.raw || '', token: bearer || '' });
    }
  };
  walk(c.item, '');
  const have = hpVars();
  for (const v of c.variable || []) if (v.key && !(v.key in have)) hp.vars += (hp.vars && !hp.vars.endsWith('\n') ? '\n' : '') + v.key + '=' + (v.value ?? '');
  return out;
}

function hpPanel(el) {
  el.innerHTML = '<div class="hp-wrap"><div class="empty">Carregando…</div></div>';
  hpLoad().then(() => { if (el.isConnected) hpDraw(el); });
}

function hpDraw(el) {
  const r = hp.reqs.find(x => x.id === hp.cur) || hp.reqs[0];
  hp.cur = r.id;
  el.innerHTML = `<div class="hp-wrap">
    <div class="hp-row"><select class="hp-in hp-pick">${hp.reqs.map(x => `<option value="${x.id}"${x.id === r.id ? ' selected' : ''}>${bs.esc(x.name)}</option>`).join('')}</select>
      <button class="icon-btn hp-add" title="Nova requisição">${HP_PLUS}</button><button class="icon-btn hp-del" title="Apagar requisição">${bs.I.x}</button></div>
    <input class="hp-in hp-f" data-k="name" value="${bs.esc(r.name)}" placeholder="Nome" spellcheck="false">
    <div class="hp-row"><select class="hp-in hp-method">${HP_METHODS.map(m => `<option${m === r.method ? ' selected' : ''}>${m}</option>`).join('')}</select>
      <input class="hp-in hp-f hp-url" data-k="url" value="${bs.esc(r.url)}" placeholder="{{baseUrl}}/rota" spellcheck="false"></div>
    <div class="hp-lbl">Headers <span>Nome: valor, um por linha</span></div>
    <textarea class="hp-in hp-ta hp-f" data-k="headers" spellcheck="false" placeholder="Content-Type: application/json">${bs.esc(r.headers)}</textarea>
    <div class="hp-lbl">Token Bearer</div>
    <input class="hp-in hp-f" data-k="token" value="${bs.esc(r.token)}" placeholder="opcional, ex.: {{secret:github}}" spellcheck="false">
    <div class="hp-lbl">Body</div>
    <textarea class="hp-in hp-ta hp-f" data-k="body" spellcheck="false" placeholder='{ "nome": "valor" }'>${bs.esc(r.body)}</textarea>
    <div class="hp-row"><button class="chip primary hp-send">Enviar</button><span class="hp-sp"></span><button class="chip hp-curl">Copiar curl</button></div>
    <div class="hp-res">${hpRes.get(r.id) || ''}</div>
    <details class="hp-more"><summary>Variáveis</summary>
      <textarea class="hp-in hp-ta hp-vars" spellcheck="false" placeholder="baseUrl=https://api.exemplo.com">${bs.esc(hp.vars)}</textarea></details>
    <details class="hp-more"><summary>Histórico</summary><div class="hp-hist"></div></details>
    <details class="hp-more"><summary>Segredos</summary>
      <div class="hp-hint">Cifrados neste PC. Use <code>{{secret:nome}}</code> na URL, nos headers, no token ou no body: o núcleo põe o valor na hora de enviar, e ele não volta para a página.</div>
      <div class="hp-seclist"></div>
      <div class="hp-row"><input class="hp-in hp-secname" placeholder="nome" spellcheck="false"><input class="hp-in hp-secval" type="password" placeholder="valor"><button class="chip hp-secadd">Guardar</button></div></details>
    <details class="hp-more"><summary>Importar do Postman (v2.1)</summary>
      <textarea class="hp-in hp-ta hp-imp" spellcheck="false" placeholder="Cole o JSON da coleção"></textarea>
      <button class="chip hp-impgo">Importar</button></details>
  </div>`;
  guardKeys(el.querySelector(".hp-wrap"));
  const wrap = el.querySelector('.hp-wrap'), res = el.querySelector('.hp-res'), sendBtn = el.querySelector('.hp-send');

  function drawHist() {
    el.querySelector('.hp-hist').innerHTML = hp.history.length ? hp.history.map((h, i) => `<button class="hp-hitem" data-i="${i}">
      <span class="hp-st ${h.status >= 200 && h.status < 400 ? 'hp-ok' : 'hp-err'}">${bs.esc(String(h.status))}</span>
      <span class="hp-hm">${bs.esc(h.method)}</span><span class="hp-name">${bs.esc(h.url)}</span><span class="hp-kind">${h.ms} ms</span></button>`).join('')
      : '<div class="hp-hint">Nada enviado ainda.</div>';
  }
  drawHist();

  async function drawSecrets() {
    const box = el.querySelector('.hp-seclist');
    let keys = [];
    try { keys = await plugin.secrets.keys(); } catch (e) { box.innerHTML = `<div class="hp-hint">${bs.esc(e.message)}</div>`; return; }
    box.innerHTML = keys.map(k => `<div class="hp-sec"><code>{{secret:${bs.esc(k)}}}</code><button class="icon-btn hp-secdel" data-k="${bs.esc(k)}" title="Apagar">${bs.I.x}</button></div>`).join('');
  }
  drawSecrets();
  el.querySelector('.hp-secadd').onclick = async () => {
    const n = el.querySelector('.hp-secname'), v = el.querySelector('.hp-secval');
    const name = n.value.trim();
    if (!/^[\w.-]+$/.test(name) || !v.value) { bs.toast('Nome (letras, números, . _ -) e valor'); return; }
    try { await plugin.secrets.set(name, v.value); n.value = v.value = ''; drawSecrets(); bs.toast(`Use {{secret:${name}}}`, 'ok'); }
    catch (e) { bs.toast('Não deu para guardar: ' + e.message); }
  };
  el.querySelector('.hp-seclist').onclick = async e => {
    const b = e.target.closest('.hp-secdel'); if (!b) return;
    if (!b.dataset.sure) { b.dataset.sure = '1'; bs.toast('Clique de novo para apagar'); return; }
    await plugin.secrets.remove(b.dataset.k).catch(err => bs.toast(err.message)); drawSecrets();
  };

  async function send() {
    const v = hpVars(), url = hpSub(r.url.trim(), v);
    if (!url) { bs.toast('Digite a URL.'); return; }
    res.innerHTML = '<div class="empty">Enviando…</div>'; sendBtn.disabled = true;
    const t0 = performance.now();
    let status = 'Erro', html;
    try {
      const opt = { method: r.method, headers: hpHeaders(r, v) };
      if (r.body && !HP_NOBODY.includes(r.method)) opt.body = hpSub(r.body, v);
      const x = await plugin.fetch(url, opt);
      const ms = Math.round(performance.now() - t0), body = String(x.body ?? '');
      let pretty = body;
      try { pretty = JSON.stringify(JSON.parse(body), null, 2); } catch {}
      status = x.status;
      html = `<div class="hp-meta"><span class="hp-st ${x.ok ? 'hp-ok' : 'hp-err'}">${bs.esc(String(x.status))}</span><span>${ms} ms</span><span>${hpSize(new Blob([body]).size)}</span></div><pre class="hp-pre">${bs.esc(pretty)}</pre>`;
      hp.history.unshift({ id: r.id, method: r.method, url, status, ms });
      hp.history.length = Math.min(hp.history.length, 30);
      hpSave();
    } catch (e) {
      html = `<div class="hp-meta"><span class="hp-st hp-err">Erro</span></div><pre class="hp-pre">${bs.esc(e.message)}</pre>`;
    }
    hpRes.set(r.id, html);
    if (res.isConnected) { res.innerHTML = html; sendBtn.disabled = false; drawHist(); }
  }

  wrap.oninput = e => {
    const t = e.target;
    if (t.matches('.hp-f')) {
      r[t.dataset.k] = t.value;
      if (t.dataset.k === 'name') el.querySelector(`.hp-pick option[value="${r.id}"]`).textContent = t.value || 'Sem nome';
    } else if (t.matches('.hp-vars')) hp.vars = t.value;
    else return;
    hpSave();
  };
  wrap.onchange = e => {
    if (e.target.matches('.hp-method')) { r.method = e.target.value; hpSave(); }
    else if (e.target.matches('.hp-pick')) { hp.cur = e.target.value; hpSave(); hpDraw(el); }
  };
  wrap.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.target.matches('.hp-url'))) { e.preventDefault(); send(); }
  });
  sendBtn.onclick = send;
  el.querySelector('.hp-add').onclick = () => { const n = hpNew(); hp.reqs.push(n); hp.cur = n.id; hpSave(); hpDraw(el); };
  el.querySelector('.hp-del').onclick = () => {
    hp.reqs = hp.reqs.filter(x => x !== r);
    if (!hp.reqs.length) hp.reqs.push(hpNew());
    hp.cur = hp.reqs[0].id; hpRes.delete(r.id); hpSave(); hpDraw(el);
  };
  el.querySelector('.hp-curl').onclick = async () => {
    try { await navigator.clipboard.writeText(hpCurl(r)); bs.toast('curl copiado', 'ok'); }
    catch (e) { bs.toast('Não deu para copiar: ' + e.message); }
  };
  el.querySelector('.hp-hist').onclick = e => {
    const b = e.target.closest('.hp-hitem'); if (!b) return;
    const h = hp.history[+b.dataset.i];
    if (hp.reqs.some(x => x.id === h.id)) { hp.cur = h.id; hpDraw(el); }
    else { const n = { ...hpNew(), name: h.method + ' ' + h.url, method: h.method, url: h.url }; hp.reqs.push(n); hp.cur = n.id; hpSave(); hpDraw(el); }
  };
  el.querySelector('.hp-impgo').onclick = () => {
    try {
      const got = hpImport(el.querySelector('.hp-imp').value);
      if (!got.length) { bs.toast('Nenhuma requisição na coleção.'); return; }
      hp.reqs.push(...got); hp.cur = got[0].id; hpSave(); hpDraw(el);
      bs.toast(`${got.length} requisiç${got.length === 1 ? 'ão importada' : 'ões importadas'}`, 'ok');
    } catch (e) { bs.toast('JSON inválido: ' + e.message); }
  };
}
bs.tools.register({ id: 'tv-http', title: 'HTTP Client', icon: HP_ICON, order: 62, render() { hpPanel(bs.$('#toolBody')); } });
