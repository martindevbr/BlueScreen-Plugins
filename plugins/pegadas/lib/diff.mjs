const MAX_D = 2000;
const CONTEXTO = 3;

function myers(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n) return b.map((t) => ['+', t]);
  if (!m) return a.map((t) => ['-', t]);
  const max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let fim = -1;
  for (let d = 0; d <= Math.min(max, MAX_D) && fim < 0; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { fim = d; break; }
    }
  }
  if (fim < 0) return [...a.map((t) => ['-', t]), ...b.map((t) => ['+', t])];
  const ops = [];
  let x = n;
  let y = m;
  for (let d = fim; d >= 0; d--) {
    const vv = trace[d];
    const base = -d - 1;
    const pega = (k) => vv[k - base];
    const k = x - y;
    const pk = k === -d || (k !== d && pega(k - 1) < pega(k + 1)) ? k + 1 : k - 1;
    const px = d === 0 ? 0 : pega(pk);
    const py = px - pk;
    while (x > px && y > py) { ops.push([' ', a[x - 1]]); x--; y--; }
    if (d > 0) {
      if (x === px) { ops.push(['+', b[y - 1]]); y--; } else { ops.push(['-', a[x - 1]]); x--; }
    }
  }
  return ops.reverse();
}

export function diffOps(antes, depois) {
  const a = String(antes ?? '').split('\n');
  const b = String(depois ?? '').split('\n');
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return [
    ...a.slice(0, p).map((t) => [' ', t]),
    ...myers(a.slice(p, a.length - s), b.slice(p, b.length - s)),
    ...a.slice(a.length - s).map((t) => [' ', t]),
  ];
}

export function diffUnificado(antes, depois, maxLinhas = 3000) {
  const ops = diffOps(antes, depois);
  const linhas = [];
  let mais = 0;
  let menos = 0;
  const mudancas = [];
  ops.forEach(([t], i) => { if (t !== ' ') mudancas.push(i); });
  for (const [t] of ops) { if (t === '+') mais++; else if (t === '-') menos++; }
  let i = 0;
  while (i < mudancas.length) {
    let ini = Math.max(0, mudancas[i] - CONTEXTO);
    let fimH = mudancas[i];
    while (i + 1 < mudancas.length && mudancas[i + 1] - fimH <= CONTEXTO * 2) fimH = mudancas[++i];
    fimH = Math.min(ops.length - 1, fimH + CONTEXTO);
    let la = 1;
    let lb = 1;
    for (let j = 0; j < ini; j++) { if (ops[j][0] !== '+') la++; if (ops[j][0] !== '-') lb++; }
    const bloco = ops.slice(ini, fimH + 1);
    const na = bloco.filter(([t]) => t !== '+').length;
    const nb = bloco.filter(([t]) => t !== '-').length;
    linhas.push(`@@ -${la},${na} +${lb},${nb} @@`);
    for (const [t, texto] of bloco) linhas.push(t + texto);
    i++;
  }
  const cortadas = Math.max(0, linhas.length - maxLinhas);
  return { linhas: linhas.slice(0, maxLinhas), mais, menos, cortadas, igual: !mudancas.length };
}
