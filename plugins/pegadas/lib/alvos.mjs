import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const HOME = os.homedir();
const HOME_POSIX = HOME.replace(/\\/g, '/');
const PROGRAMA = (process.env.LOCALAPPDATA || '').replace(/\\/g, '/') + '/Programs/BlueScreen';
const PASTAS_PROJETOS = ['Repositorys', 'Repositories', 'source/repos', 'repos', 'Projetos', 'Projects', 'git', 'dev', 'workspace'];
const MARCADORES = ['.git', '.svn', 'package.json', 'pom.xml', 'Cargo.toml'];

export const GRUPOS = {
  extensao: 'Extensões do BlueScreen', projeto: 'Projetos', skill: 'Skills do Claude', memoria: 'Memória do Claude',
  config: 'Configuração', temporario: 'Arquivos temporários', outros: 'Outros lugares',
};

const cacheProjeto = new Map();
let nomesExtensao = null;

export function limparCaches() {
  cacheProjeto.clear();
  nomesExtensao = null;
}

export function normalizar(caminho) {
  let c = String(caminho || '').trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/');
  if (c.startsWith('~/')) c = HOME_POSIX + c.slice(1);
  c = c.replace(/^\/([a-zA-Z])\//, (_, d) => d.toUpperCase() + ':/');
  c = c.replace(/^([a-zA-Z]:\/Users\/)[^/]*~\d+(?=\/|$)/i, HOME_POSIX);
  return c ? path.posix.normalize(c).replace(/\/$/, '') : c;
}

export const chave = (caminho) => normalizar(caminho).toLowerCase();

export function extensoes() {
  if (nomesExtensao) return nomesExtensao;
  nomesExtensao = new Map();
  for (const pasta of [PROGRAMA + '/plugins', HOME_POSIX + '/.bluescreen/plugins']) {
    let ids = [];
    try { ids = fs.readdirSync(pasta); } catch {}
    for (const id of ids) {
      try { nomesExtensao.set(id, JSON.parse(fs.readFileSync(path.join(pasta, id, 'plugin.json'), 'utf8')).name || id); } catch {}
    }
  }
  setTimeout(() => { nomesExtensao = null; }, 60000);
  return nomesExtensao;
}

const nomeExtensao = (id) => extensoes().get(id) || id;

function projetoEm(base, partes) {
  const k = base + '|' + partes.slice(0, 2).join('/');
  if (cacheProjeto.has(k)) return cacheProjeto.get(k);
  const [a, b] = partes;
  const temMarcador = (dir) => MARCADORES.some((m) => fs.existsSync(path.join(dir, m)));
  let nome = a;
  try {
    if (b && !temMarcador(path.join(base, a)) && fs.statSync(path.join(base, a, b)).isDirectory()) nome = a + '/' + b;
  } catch {}
  const r = { nome, raiz: base + '/' + nome };
  cacheProjeto.set(k, r);
  return r;
}

export function alvoDe(caminho) {
  const c = normalizar(caminho);
  const sob = (prefixo) => (c.toLowerCase().startsWith(prefixo.toLowerCase() + '/') ? c.slice(prefixo.length + 1) : null);
  for (const base of [HOME_POSIX + '/.bluescreen/plugins', PROGRAMA + '/plugins']) {
    const resto = sob(base);
    if (resto) {
      const id = resto.split('/')[0];
      return { grupo: 'extensao', id, nome: nomeExtensao(id), raiz: base + '/' + id };
    }
  }
  let resto = sob(HOME_POSIX + '/.bluescreen/plugin-data');
  if (resto) {
    const id = resto.split('/')[0];
    return { grupo: 'extensao', id, nome: nomeExtensao(id), raiz: HOME_POSIX + '/.bluescreen/plugin-data/' + id, dados: true };
  }
  if (sob(HOME_POSIX + '/.bluescreen')) return { grupo: 'config', id: 'bluescreen', nome: 'BlueScreen', raiz: HOME_POSIX + '/.bluescreen' };
  const memoria = /^(.*\/\.claude\/projects\/[^/]+\/memory)\//i.exec(c);
  if (memoria) return { grupo: 'memoria', id: 'memoria', nome: 'Memória', raiz: memoria[1] };
  resto = sob(HOME_POSIX + '/.claude/skills');
  if (resto) {
    const id = resto.split('/')[0];
    return { grupo: 'skill', id, nome: id, raiz: HOME_POSIX + '/.claude/skills/' + id };
  }
  if (sob(HOME_POSIX + '/.claude')) return { grupo: 'config', id: 'claude', nome: 'Claude Code', raiz: HOME_POSIX + '/.claude' };
  for (const pasta of PASTAS_PROJETOS) {
    resto = sob(HOME_POSIX + '/' + pasta);
    if (resto) {
      const { nome, raiz } = projetoEm(HOME_POSIX + '/' + pasta, resto.split('/'));
      return { grupo: 'projeto', id: nome, nome, raiz };
    }
  }
  if (/\/AppData\/Local\/Temp\//i.test(c)) return { grupo: 'temporario', id: 'temp', nome: 'Temp / scratchpad', raiz: path.posix.dirname(c) };
  if (sob(PROGRAMA)) return { grupo: 'config', id: 'bluescreen-programa', nome: 'BlueScreen (programa)', raiz: PROGRAMA };
  resto = sob(HOME_POSIX + '/Documents');
  if (resto && resto.includes('/')) {
    const { nome, raiz } = projetoEm(HOME_POSIX + '/Documents', resto.split('/'));
    return { grupo: 'projeto', id: 'Documents/' + nome, nome: 'Documents/' + nome, raiz };
  }
  resto = sob(HOME_POSIX);
  if (resto && resto.includes('/') && !/^(AppData|Downloads|Desktop|Documents|OneDrive[^/]*)\//i.test(resto)) {
    const id = resto.split('/')[0];
    return { grupo: id.startsWith('.') ? 'config' : 'projeto', id, nome: id, raiz: HOME_POSIX + '/' + id };
  }
  return { grupo: 'outros', id: path.posix.dirname(c), nome: path.posix.dirname(c), raiz: path.posix.dirname(c) };
}

export function alvosDoComando(texto) {
  const alvos = new Map();
  const add = (a) => { if (!alvos.has(a.grupo + '|' + a.id)) alvos.set(a.grupo + '|' + a.id, a); };
  for (const m of String(texto).matchAll(/(?:127\.0\.0\.1|localhost):47\d\d\/api\/([a-z0-9-]+)\//gi)) {
    const id = m[1].toLowerCase();
    if (!extensoes().has(id)) continue;
    add({ grupo: 'extensao', id, nome: nomeExtensao(id), raiz: normalizar(path.join(HOME, '.bluescreen', 'plugins', id)), api: true });
  }
  const caminhos = /(?:[a-zA-Z]:[\\/]|\/[a-zA-Z]\/|~\/|\$HOME\/|\$env:USERPROFILE\\)[^\s"'`|;&<>()]+/g;
  for (const m of String(texto).matchAll(caminhos)) {
    if (/[*?^$[\]{}\\]/.test(m[0].replace(/^[a-zA-Z]:\\|\$env:USERPROFILE\\/, '').replace(/\\(?=[\p{L}\p{N}_.-])/gu, '/'))) continue;
    const bruto = m[0].replace(/[,.:]+$/, '').replace(/^\$HOME\//, '~/').replace(/^\$env:USERPROFILE\\/, '~/');
    const a = alvoDe(bruto);
    if (a.grupo !== 'outros' && a.grupo !== 'temporario') add(a);
  }
  return [...alvos.values()];
}

const VERBOS_LEITURA = new Set([
  'cat', 'head', 'tail', 'ls', 'dir', 'grep', 'rg', 'find', 'wc', 'du', 'df', 'echo', 'printf', 'awk', 'sort', 'uniq', 'cut', 'tr',
  'jq', 'diff', 'stat', 'file', 'which', 'where', 'pwd', 'date', 'sleep', 'test', 'true', 'cd', 'type', 'basename', 'dirname',
  'realpath', 'readlink', 'seq', '[', '[[', 'exit', 'nl', 'column', 'less', 'more', 'tree', 'iconv', 'base64',
  'xxd', 'od', 'md5sum', 'sha256sum', 'tasklist', 'netstat', 'whoami', 'hostname', 'env', 'printenv',
  'get-childitem', 'gci', 'get-content', 'gc', 'get-item', 'get-itemproperty', 'select-string', 'test-path', 'get-process',
  'measure-object', 'select-object', 'where-object', 'foreach-object', 'sort-object', 'format-table', 'format-list',
  'write-output', 'write-host', 'get-command', 'get-date', 'resolve-path', 'split-path', 'join-path', 'get-filehash',
  'get-nettcpconnection', 'get-ciminstance', 'convertfrom-json', 'convertto-json', 'out-string', 'group-object',
]);
const GIT_LEITURA = /^git\s+(-C\s+\S+\s+)?(status|log|diff|show|branch|rev-parse|remote|ls-files|blame|describe|shortlog|config\s+--get)\b/;
const semAspas = (c) => c.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''");

export function soLeitura(comando) {
  const c = String(comando).trim();
  const limpo = semAspas(c);
  if (!c || /(^|[^0-9&>])>(?!&|\s*\/dev\/null|\s*\$null|\s*NUL\b)/.test(limpo.replace(/2>\s*(&1|\/dev\/null|\$null)/g, ''))) return false;
  if (/\b(Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Move-Item|Copy-Item|Rename-Item|Stop-Process|Start-Process)\b/i.test(limpo)) return false;
  const partes = limpo.split(/\r?\n|\|\||&&|[|;]|\$\(|`/).map((s) => s.trim()).filter(Boolean);
  return partes.every((s) => {
    if (/^(for|while|until|case|esac|done|fi|break|continue|function)\b/.test(s)) return true;
    const sem = s.replace(/^(do|then|else|elif|if|!)\s+/, '').replace(/^(\$\w+\s*=\s*|[A-Za-z_]\w*=\S*\s*|export\s+|local\s+)+/, '').replace(/^[({]+\s*/, '');
    if (!sem) return true;
    const verbo = sem.split(/\s+/)[0].toLowerCase();
    if (verbo === 'sed') return !/\s-i\b/.test(sem);
    if (verbo === 'git') return GIT_LEITURA.test(sem);
    if (verbo === 'curl') return !/\s(-X\s*(POST|PUT|DELETE|PATCH)|-d\b|--data|-F\b|--form|-T\b|-o\b|--output|-O\b)/i.test(sem);
    if (['invoke-restmethod', 'invoke-webrequest', 'irm', 'iwr'].includes(verbo)) return !/-Method\s+(Post|Put|Delete|Patch)|-OutFile/i.test(sem);
    return VERBOS_LEITURA.has(verbo) || /^[)}\]]+$/.test(sem) || sem.startsWith('#');
  });
}

const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i;

const externas = (texto) => [...texto.matchAll(/https?:\/\/[^\s"'`)]+/g)].some((m) => !LOCAL.test(m[0]));

function escreveFora(c) {
  const trechos = c.split(/\r?\n|;|&&|\|\|/);
  const curl = trechos.some((t) => /\bcurl\b/.test(t) && externas(t)
    && !/\s-X\s*(GET|HEAD|OPTIONS|REPORT|PROPFIND)\b/i.test(t)
    && /\s(-X\s*(POST|PUT|DELETE|PATCH)|-d\b|--data|-F\b|--form|-T\b)/i.test(t));
  const ps = trechos.some((t) => /-Method\s+(Post|Put|Delete|Patch)/i.test(t) && externas(t));
  const fetchs = [...c.matchAll(/fetch\(\s*(['"`])(https?:\/\/[^'"`]+)\1\s*,\s*\{([^}]{0,400})/g)]
    .some((m) => !LOCAL.test(m[2]) && /method\s*:\s*['"`](POST|PUT|DELETE|PATCH)/i.test(m[3]));
  return curl || ps || fetchs;
}

export function riscosDe(ev) {
  const r = new Set();
  if (ev.tipo === 'arquivo') {
    const c = ev.caminho.toLowerCase();
    const nome = c.split('/').pop();
    if (/\/\.claude\/settings(\.local)?\.json$|\/\.bluescreen\/(settings|plugins|vault)\.json$/.test(c)) r.add('configuração');
    if (/(token|secret|senha|password|credenc|creds|^\.env|vault)/.test(nome) || /\.(pem|key|pfx|p12)$/.test(nome)) r.add('credencial');
    if (ev.alvos[0]?.grupo === 'outros') r.add('fora de projeto');
    if (ev.acao === 'reescreveu') r.add('reescreveu o arquivo');
  } else if (ev.tipo === 'comando') {
    const c = String(ev.comando || '');
    const limpo = semAspas(c);
    if (/\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b|Remove-Item\b[^\n|;]*-Recurse|\brmdir\s+\/s/i.test(limpo)) r.add('apaga pasta');
    else if (/(^|[\s;&|(])(rm|del|unlink)\s|Remove-Item\b/i.test(limpo)) r.add('apaga arquivo');
    if (/\bgit\s+push\b/.test(limpo)) r.add('git push');
    if (/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--\s|branch\s+-D|push\b[^\n;]*(--force|-f\b))/.test(limpo)) r.add('git destrutivo');
    if (escreveFora(c)) r.add('grava em servidor externo');
    if (/\/api\/vault\b/i.test(c)) r.add('cofre');
    if (/\b(taskkill|Stop-Process|kill\s+-9|pkill)\b/i.test(limpo)) r.add('encerra processo');
    if (/\b(setx|reg\s+(add|delete)|Set-ItemProperty|schtasks\s+\/create)\b/i.test(limpo)) r.add('sistema');
    if (/\bnpm\s+publish\b/.test(limpo)) r.add('publica pacote');
    if (/\/\.claude\/settings(\.local)?\.json|\.bluescreen[\\/](settings|vault)\.json/i.test(c) && !ev.consulta) r.add('configuração');
  } else {
    const f = String(ev.ferramenta || '');
    if (/^Artifact$/.test(f) && !/"action"\s*:\s*"(read|list|open|quickstart)"/.test(ev.comando || '')) r.add('publicação');
    else if (/(delete|remove|publish|send|create|update|write|post|batch|set)/i.test(f.split('__').pop())) r.add('ferramenta que grava');
  }
  return [...r];
}

export const PADRAO_CHAMADO = '\\b[A-Z][A-Z0-9]{1,9}-\\d+\\b';
let CHAMADO = new RegExp(PADRAO_CHAMADO, 'g');

export function definirPadraoChamado(padrao) {
  try { CHAMADO = padrao ? new RegExp(padrao, 'gi') : new RegExp(PADRAO_CHAMADO, 'g'); } catch { CHAMADO = new RegExp(PADRAO_CHAMADO, 'g'); }
}

export function chamadosDe(texto) {
  return [...new Set([...String(texto || '').matchAll(CHAMADO)].map((m) => m[0].toUpperCase()))];
}
