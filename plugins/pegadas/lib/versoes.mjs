import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function lerLinha({ arquivo, pos, len }) {
  const fd = fs.openSync(arquivo, 'r');
  try {
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, pos);
    return JSON.parse(buf.toString('utf8'));
  } finally { fs.closeSync(fd); }
}

function bruto(ev) {
  if (!ev.fonte) return null;
  let linha;
  try { linha = lerLinha(ev.fonte); } catch { return null; }
  const r = linha.toolUseResult || {};
  const original = typeof r.originalFile === 'string' ? r.originalFile : null;
  if (ev.ferramenta === 'Write') return { tipo: 'write', criado: r.type === 'create', original, conteudo: typeof r.content === 'string' ? r.content : null };
  if (ev.ferramenta === 'Edit') return { tipo: 'edit', original, velho: String(r.oldString ?? ''), novo: String(r.newString ?? ''), todos: Boolean(r.replaceAll) };
  return { tipo: 'outro', original };
}

function contar(texto, trecho) {
  if (!trecho) return 0;
  let n = 0;
  for (let i = texto.indexOf(trecho); i >= 0; i = texto.indexOf(trecho, i + trecho.length)) n++;
  return n;
}

function aplicar(antes, b) {
  if (b.tipo === 'write') return b.conteudo;
  if (b.tipo !== 'edit' || antes == null) return null;
  if (b.todos) return contar(antes, b.velho) ? antes.split(b.velho).join(b.novo) : null;
  const i = antes.indexOf(b.velho);
  return i < 0 ? null : antes.slice(0, i) + b.novo + antes.slice(i + b.velho.length);
}

function desaplicar(depois, b) {
  if (b.tipo === 'write') return b.criado ? '' : b.original;
  if (b.tipo !== 'edit' || depois == null || !b.novo) return null;
  if (b.todos) return contar(depois, b.novo) ? depois.split(b.novo).join(b.velho) : null;
  if (contar(depois, b.novo) !== 1) return null;
  const i = depois.indexOf(b.novo);
  return depois.slice(0, i) + b.velho + depois.slice(i + b.novo.length);
}

export function lerDisco(caminho) {
  try { return fs.readFileSync(caminho, 'utf8'); } catch { return null; }
}

export const hash = (texto) => (texto == null ? 'ausente' : crypto.createHash('sha1').update(texto).digest('hex'));

export function versoes(eventos, disco) {
  const lista = eventos.map((ev) => ({ ev, b: bruto(ev), antes: null, depois: null, origem: '' }));
  let conhecido = null;
  for (const v of lista) {
    if (!v.b) { conhecido = null; continue; }
    if (v.b.tipo === 'write' && v.b.criado) { v.antes = ''; v.origem = 'criado'; }
    else if (v.b.original != null) { v.antes = v.b.original; v.origem = 'transcript'; }
    else if (conhecido != null) { v.antes = conhecido; v.origem = 'cadeia'; }
    v.depois = aplicar(v.antes, v.b);
    if (v.b.tipo === 'write') v.depois = v.b.conteudo;
    conhecido = v.depois;
  }
  let atual = disco;
  for (let i = lista.length - 1; i >= 0; i--) {
    const v = lista[i];
    if (!v.b) { atual = null; continue; }
    if (v.depois == null && atual != null) { v.depois = atual; v.origem ||= 'disco'; }
    if (v.antes == null && v.depois != null) {
      v.antes = desaplicar(v.depois, v.b);
      if (v.antes != null) v.origem ||= 'revertido';
    }
    atual = v.antes;
  }
  return lista;
}

export function backup(pastaDados, itens) {
  const d = new Date();
  const carimbo = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  const pasta = path.join(pastaDados, 'backups', carimbo);
  fs.mkdirSync(pasta, { recursive: true });
  const manifesto = [];
  itens.forEach((it, i) => {
    const nome = `${String(i + 1).padStart(2, '0')}-${path.basename(it.caminho)}`;
    if (it.atual != null) fs.writeFileSync(path.join(pasta, nome), it.atual, 'utf8');
    manifesto.push({ caminho: it.caminho, copia: it.atual != null ? nome : null, existia: it.atual != null });
  });
  fs.writeFileSync(path.join(pasta, 'manifesto.json'), JSON.stringify(manifesto, null, 2), 'utf8');
  return pasta;
}

export function gravar(caminho, conteudo) {
  if (conteudo == null) { fs.rmSync(caminho, { force: true }); return; }
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho + '.atividade-tmp', conteudo, 'utf8');
  fs.renameSync(caminho + '.atividade-tmp', caminho);
}
