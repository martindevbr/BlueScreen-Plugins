const { $, esc, toast, store } = bs;
const ICON = '<svg class="i" viewBox="0 0 24 24"><path d="M5 7l5 5-5 5"/><path d="M12 18h7"/></svg>';
const CORES = ['vermelho', 'verde', 'amarelo', 'azul', 'roxo', 'laranja', 'ciano', 'rosa', 'cinza'];
const ESTADOS = { parada: 'parada', ociosa: 'pronta', ocupada: 'trabalhando', aguardando: 'aguardando você', erro: 'erro' };
const LINGUAGENS = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', sh: 'shell', bash: 'shell', zsh: 'shell', ps: 'powershell', ps1: 'powershell', pwsh: 'powershell', yml: 'yaml', md: 'markdown', cs: 'csharp', 'c#': 'csharp', 'c++': 'cpp', rs: 'rust', kt: 'kotlin', rb: 'ruby', bat: 'bat', cmd: 'bat', htm: 'html', jsonc: 'json', sql: 'sql', xml: 'xml', html: 'html', css: 'css', scss: 'scss', java: 'java', json: 'json', go: 'go', php: 'php', yaml: 'yaml', dockerfile: 'dockerfile', ini: 'ini', properties: 'ini', groovy: 'java', gradle: 'java', vue: 'html' };

const C = {
  abas: new Map(),
  ordem: store.get('claude.ordem', []),
  ativa: store.get('claude.ativa', null),
  views: new Map(),
  procs: [],
  historico: [],
  anexos: [],
  prefs: { cores: true },
  aberto: false,
  conectado: false,
  semHist: store.get('claude.semHist', false),
  semProcs: store.get('claude.semProcs', false),
  auxAbertos: new Set(),
};

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

async function api(rota, params = {}, corpo) {
  const opt = corpo === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) };
  return bs.api('claude/' + rota, params, opt);
}

const fmtDuracao = (ms) => {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1).replace('.', ',')} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min ${Math.floor(s % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}min`;
};
const fmtCusto = (v) => `US$ ${v.toFixed(v < 1 ? 3 : 2).replace('.', ',')}`;
const fmtMem = (b) => (b ? `${Math.round(b / 1048576)} MB` : '');
const fmtTokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace('.', ',')} mil` : String(n));
const fmtQuando = (ms) => {
  const d = Date.now() - ms;
  if (d < 60000) return 'agora';
  if (d < 3600000) return `há ${Math.floor(d / 60000)} min`;
  if (d < 86400000) return `há ${Math.floor(d / 3600000)} h`;
  if (d < 7 * 86400000) return `há ${Math.floor(d / 86400000)} d`;
  return new Date(ms).toLocaleDateString('pt-BR');
};
const nomePasta = (p) => (p || '').split(/[\\/]/).filter(Boolean).pop() || p;
const ocupada = (a) => a && (a.estado === 'ocupada' || a.estado === 'aguardando');

const RE_ARQUIVO = /^(?:[a-zA-Z]:[\\/]|\.{1,2}[\\/]|[\\/])?(?:[\w.@~$ -]+[\\/])*[\w.@~$-]+\.[A-Za-z0-9]{1,10}(?::(\d+)(?::\d+)?)?$/;

function linkArquivo(texto, rotulo) {
  const t = String(texto).trim();
  if (!RE_ARQUIVO.test(t) || /^\d+(\.\d+)+$/.test(t) || /^https?:/i.test(t)) return null;
  return `<span class="cl-arq" data-arq="${esc(t)}" title="Abrir no editor">${rotulo ?? esc(t)}</span>`;
}

function htmlPermitido(s) {
  return s
    .replace(/&lt;span class=&quot;(tag )?([a-z]+)&quot;&gt;/g, (m, tag, cor) => (CORES.includes(cor) ? `<span class="${tag ? 'cl-tag ' : ''}cl-c-${cor}">` : m))
    .replace(/&lt;span style=&quot;\s*color:\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})\s*;?\s*&quot;&gt;/g, '<span style="color:$1">')
    .replace(/&lt;\/span&gt;/g, '</span>')
    .replace(/&lt;(\/?)(mark|kbd|u|sub|sup|b|i|s|small)&gt;/g, '<$1$2>')
    .replace(/&lt;br\s*\/?&gt;/g, '<br>');
}

function inline(texto) {
  const codigos = [];
  let s = esc(texto).replace(/`([^`\n]+)`/g, (_, c) => {
    codigos.push(c);
    return `\u0000${codigos.length - 1}\u0000`;
  });
  s = htmlPermitido(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => {
    const c = codigos[i];
    const bruto = c.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    return linkArquivo(bruto, `<code>${c}</code>`) || `<code>${c}</code>`;
  });
}

function tabela(linhas) {
  const celulas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const cab = celulas(linhas[0]);
  const corpo = linhas.slice(2).map(celulas);
  return `<div class="cl-tabela"><table><thead><tr>${cab.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${corpo
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

function lista(linhas) {
  const raiz = { filhos: [], ordenada: /^\s*\d+[.)]/.test(linhas[0]) };
  const pilha = [{ recuo: -1, no: raiz }];
  for (const l of linhas) {
    const m = l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (!m) {
      const ultimo = pilha[pilha.length - 1].no.filhos.at(-1);
      if (ultimo) ultimo.texto += ' ' + l.trim();
      continue;
    }
    const recuo = m[1].length;
    while (pilha.length > 1 && recuo <= pilha[pilha.length - 1].recuo) pilha.pop();
    const pai = pilha[pilha.length - 1].no;
    const item = { texto: m[3], sub: { filhos: [], ordenada: false } };
    pai.filhos.push(item);
    if (pai.filhos.length === 1) pai.ordenada = /\d/.test(m[2]);
    pilha.push({ recuo, no: item.sub });
  }
  const render = (no) => {
    if (!no.filhos.length) return '';
    const tag = no.ordenada ? 'ol' : 'ul';
    return `<${tag}>${no.filhos
      .map((f) => {
        const caixa = f.texto.match(/^\[([ xX])\]\s+(.*)$/);
        const corpo = caixa ? `<span class="cl-caixa ${caixa[1] === ' ' ? '' : 'marcada'}"></span>${inline(caixa[2])}` : inline(f.texto);
        return `<li>${corpo}${render(f.sub)}</li>`;
      })
      .join('')}</${tag}>`;
  };
  return render(raiz);
}

function markdown(fonte) {
  const linhas = String(fonte ?? '').replace(/\r\n/g, '\n').split('\n');
  const saida = [];
  let i = 0;
  const inicioBloco = /^\s*(`{3,}|~{3,}|#{1,6}\s|>|([-*+]|\d+[.)])\s+|<\/?details>|<summary>)/;
  while (i < linhas.length) {
    const l = linhas[i];
    const cerca = l.match(/^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/);
    if (cerca) {
      const corpo = [];
      i++;
      while (i < linhas.length && !linhas[i].trim().startsWith(cerca[1])) corpo.push(linhas[i++]);
      i++;
      const ling = (cerca[2] || '').toLowerCase();
      saida.push(`<div class="cl-codigo"><div class="cl-codigo-cab"><span>${esc(ling || 'texto')}</span><button class="cl-copiar" title="Copiar">copiar</button></div><pre><code data-ling="${esc(LINGUAGENS[ling] || ling)}">${esc(corpo.join('\n'))}</code></pre></div>`);
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    const det = l.trim().match(/^<details>(?:\s*<summary>(.*?)<\/summary>)?\s*$/);
    if (det) {
      let nivel = 1;
      const corpo = [];
      let resumo = det[1] || '';
      i++;
      while (i < linhas.length) {
        const t = linhas[i].trim();
        if (/^<details>/.test(t)) nivel++;
        if (/^<\/details>/.test(t) && --nivel === 0) break;
        const s = t.match(/^<summary>(.*?)<\/summary>$/);
        if (s && !resumo && nivel === 1) resumo = s[1];
        else corpo.push(linhas[i]);
        i++;
      }
      i++;
      saida.push(`<details class="cl-det"><summary>${inline(resumo || 'detalhes')}</summary>${markdown(corpo.join('\n'))}</details>`);
      continue;
    }
    const titulo = l.match(/^(#{1,6})\s+(.*)$/);
    if (titulo) {
      saida.push(`<h${titulo[1].length}>${inline(titulo[2])}</h${titulo[1].length}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      saida.push('<hr>');
      i++;
      continue;
    }
    if (l.includes('|') && i + 1 < linhas.length && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1])) {
      const bloco = [];
      while (i < linhas.length && linhas[i].includes('|')) bloco.push(linhas[i++]);
      saida.push(tabela(bloco));
      continue;
    }
    if (/^\s*>/.test(l)) {
      const bloco = [];
      while (i < linhas.length && /^\s*>/.test(linhas[i])) bloco.push(linhas[i++].replace(/^\s*>\s?/, ''));
      saida.push(`<blockquote>${markdown(bloco.join('\n'))}</blockquote>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      const bloco = [];
      while (i < linhas.length && linhas[i].trim() && (/^\s*([-*+]|\d+[.)])\s+/.test(linhas[i]) || /^\s{2,}\S/.test(linhas[i]))) bloco.push(linhas[i++]);
      saida.push(lista(bloco));
      continue;
    }
    const par = [];
    while (i < linhas.length && linhas[i].trim() && !inicioBloco.test(linhas[i]) && !(linhas[i].includes('|') && i + 1 < linhas.length && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1]))) par.push(linhas[i++]);
    if (!par.length) par.push(linhas[i++]);
    saida.push(`<p>${par.map(inline).join('<br>')}</p>`);
  }
  return saida.join('');
}

const ANSI_CORES = ['preto', 'vermelho', 'verde', 'amarelo', 'azul', 'roxo', 'ciano', 'branco'];

function ansi(texto) {
  const s = String(texto ?? '');
  if (!s.includes('\u001b[')) return esc(s);
  let saida = '';
  let aberto = false;
  let estilo = { cor: null, negrito: false };
  const partes = s.split(/\u001b\[([\d;]*)m/);
  for (let i = 0; i < partes.length; i++) {
    if (i % 2 === 0) {
      if (!partes[i]) continue;
      saida += esc(partes[i]);
      continue;
    }
    for (const c of (partes[i] || '0').split(';').map(Number)) {
      if (c === 0) estilo = { cor: null, negrito: false };
      else if (c === 1) estilo.negrito = true;
      else if (c === 22) estilo.negrito = false;
      else if (c === 39) estilo.cor = null;
      else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) estilo.cor = ANSI_CORES[c % 10];
    }
    if (aberto) saida += '</span>';
    const cls = [estilo.cor && `cl-a-${estilo.cor}`, estilo.negrito && 'cl-a-negrito'].filter(Boolean).join(' ');
    aberto = !!cls;
    if (cls) saida += `<span class="${cls}">`;
  }
  return aberto ? saida + '</span>' : saida;
}

function colorir(raiz) {
  const m = bs.monaco;
  if (!m?.editor?.colorize) return;
  raiz.querySelectorAll('.cl-codigo code[data-ling]:not([data-ok])').forEach((c) => {
    c.dataset.ok = '1';
    const ling = c.dataset.ling;
    if (!ling || !m.languages.getLanguages().some((l) => l.id === ling)) return;
    m.editor
      .colorize(c.textContent, ling, { tabSize: 4 })
      .then((html) => {
        c.innerHTML = html;
        c.classList.add('cl-colorido');
      })
      .catch(() => {});
  });
}

function textoDe(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => (c.type === 'text' ? c.text : c.type === 'image' ? '[imagem]' : c.type === 'tool_reference' ? `[${c.tool_name || 'ferramenta'}]` : ''))
    .filter(Boolean)
    .join('\n');
}

function resumoEntrada(e = {}) {
  const v = e.command || e.file_path || e.notebook_path || e.path || e.pattern || e.url || e.query || e.description || e.prompt || e.skill || e.subject || '';
  return String(v).replace(/\s+/g, ' ').slice(0, 200);
}

function corpoEntrada(nome, e = {}) {
  const rotuloArq = (p, extra = '') => `<div class="cl-rotulo">${linkArquivo(p) || esc(p)}${extra}</div>`;
  if ((nome === 'Bash' || nome === 'PowerShell') && e.command) return `<pre>${esc((nome === 'PowerShell' ? 'PS> ' : '$ ') + e.command)}</pre>`;
  if (nome === 'Edit' && e.old_string !== undefined) {
    const menos = esc(e.old_string).split('\n').map((l) => `<span class="cl-menos">- ${l}</span>`).join('');
    const mais = esc(e.new_string).split('\n').map((l) => `<span class="cl-mais">+ ${l}</span>`).join('');
    return `${rotuloArq(e.file_path, e.replace_all ? ' (todas as ocorrências)' : '')}<pre class="cl-diff">${menos}${mais}</pre>`;
  }
  if (nome === 'Write' && e.content !== undefined) return `${rotuloArq(e.file_path)}<pre>${esc(e.content.length > 6000 ? e.content.slice(0, 6000) + '\n…' : e.content)}</pre>`;
  if (nome === 'TodoWrite' && Array.isArray(e.todos)) {
    return `<ul class="cl-todos">${e.todos.map((t) => `<li class="${esc(t.status)}">${t.status === 'completed' ? '☑' : t.status === 'in_progress' ? '▶' : '☐'} ${esc(t.content)}</li>`).join('')}</ul>`;
  }
  if ((nome === 'Agent' || nome === 'Task') && e.prompt) return `<div class="cl-rotulo">${esc(e.subagent_type || 'agente')}</div><div class="cl-md">${markdown(e.prompt)}</div>`;
  if ((nome === 'Read' || nome === 'NotebookEdit') && (e.file_path || e.notebook_path)) return rotuloArq(e.file_path || e.notebook_path, e.offset ? ` (a partir da linha ${e.offset})` : '');
  return `<pre>${esc(JSON.stringify(e, null, 2))}</pre>`;
}

function montarTela() {
  if ($('#clScreen')) return;
  $('#app').insertAdjacentHTML(
    'beforeend',
    `<div id="clScreen" class="island" hidden>
      <div class="cl-topo">
        <button class="cl-ic" id="clBtHist" title="Histórico">${bs.I?.hist || '☰'}</button>
        <nav class="cl-abas" id="clAbas"></nav>
        <button class="cl-ic cl-mais-aba" id="clBtNova" title="Nova conversa (Ctrl+T)">+</button>
        <div class="cl-espaco"></div>
        <label class="cl-chave" title="O Claude pode usar as cores do tema nas respostas (vale a partir da próxima mensagem)"><input type="checkbox" id="clCores"> cores</label>
        <button class="cl-ic" id="clBtProcs" title="Processos">⚙</button>
        <button class="cl-ic" id="clBtFechar" title="Voltar ao código (Esc)">×</button>
      </div>
      <div class="cl-corpo">
        <aside class="cl-hist" id="clHist">
          <input type="search" id="clBusca" placeholder="Buscar conversas…" autocomplete="off" spellcheck="false">
          <div class="cl-hist-lista" id="clHistLista"></div>
        </aside>
        <main class="cl-centro">
          <div class="cl-vazio" id="clVazio">
            <h2>Claude</h2>
            <p>Abra uma conversa nova no projeto atual ou retome uma do histórico.</p>
            <button class="chip primary" id="clBtNovaVazio">Nova conversa</button>
            <div class="cl-atalhos"><span><kbd>Ctrl</kbd>+<kbd>T</kbd> nova</span><span><kbd>Ctrl</kbd>+<kbd>W</kbd> fechar</span><span><kbd>Ctrl</kbd>+<kbd>Tab</kbd> próxima</span><span><kbd>Esc</kbd> interromper / voltar</span></div>
          </div>
          <div class="cl-conversas" id="clConversas"></div>
          <footer class="cl-compositor" id="clCompositor" hidden>
            <div class="cl-anexos" id="clAnexos"></div>
            <div class="cl-caixa">
              <textarea id="clEntrada" rows="1" placeholder="Mensagem para o Claude… (Enter envia, Shift+Enter quebra linha, Ctrl+V cola imagem)" spellcheck="false"></textarea>
              <button class="chip cl-parar" id="clBtParar" title="Interromper (Esc)" hidden>Parar</button>
              <button class="chip primary" id="clBtEnviar">Enviar</button>
            </div>
            <div class="cl-barra">
              <span class="cl-pasta" id="clPasta"></span>
              <label>Modelo <select id="clModelo"><option value="">padrão</option><option value="opus">opus</option><option value="sonnet">sonnet</option><option value="haiku">haiku</option><option value="fable">fable</option></select></label>
              <label>Permissões <select id="clModo"><option value="default">perguntar</option><option value="acceptEdits">aceitar edições</option><option value="plan">planejar</option><option value="bypassPermissions">liberar tudo</option></select></label>
              <label>Esforço <select id="clEsforco"><option value="">padrão</option><option value="low">baixo</option><option value="medium">médio</option><option value="high">alto</option><option value="xhigh">muito alto</option><option value="max">máximo</option></select></label>
              <div class="cl-espaco"></div>
              <span id="clContexto"></span>
              <span id="clCusto"></span>
            </div>
          </footer>
        </main>
        <aside class="cl-procs" id="clProcs"></aside>
      </div>
      <div class="cl-escolha" id="clEscolha" hidden>
        <div class="cl-escolha-card">
          <h3>Nova conversa</h3>
          <input type="text" id="clEscolhaFiltro" placeholder="Filtrar ou colar um caminho (C:\\...)" autocomplete="off" spellcheck="false">
          <div class="cl-escolha-lista" id="clEscolhaLista"></div>
          <div class="cl-escolha-acoes"><button class="chip" id="clEscolhaCancelar">Cancelar</button><button class="chip primary" id="clEscolhaOk">Abrir</button></div>
        </div>
      </div>
    </div>`,
  );
  ligarTela();
  aplicarLayout();
  aplicarPaleta();
}

function rgb(cor) {
  const m = String(cor || '').trim().match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split('').map((x) => x + x).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const r = String(cor || '').match(/rgba?\(([^)]+)\)/);
  return r ? r[1].split(',').slice(0, 3).map(Number) : null;
}

function luminancia(c) {
  const [r, g, b] = c.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function matiz([r, g, b]) {
  const [x, y, z] = [r / 255, g / 255, b / 255];
  const max = Math.max(x, y, z);
  const min = Math.min(x, y, z);
  const d = max - min;
  const l = (max + min) / 2;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d === 0) return { h: 0, s: 0, l };
  const h = max === x ? ((y - z) / d) % 6 : max === y ? (z - x) / d + 2 : (x - y) / d + 4;
  return { h: (h * 60 + 360) % 360, s: sat, l };
}

const FAIXAS = {
  vermelho: [[345, 360], [0, 15]],
  laranja: [[15, 40]],
  amarelo: [[38, 65]],
  verde: [[75, 165]],
  ciano: [[165, 200]],
  azul: [[200, 245]],
  roxo: [[245, 295]],
  rosa: [[295, 345]],
};

function aplicarPaleta() {
  const alvos = [$('#clScreen'), $('#stClaude')].filter(Boolean);
  const cs = getComputedStyle(document.documentElement);
  const v = (k) => cs.getPropertyValue('--' + k).trim();
  const fundo = rgb(v('bg')) || [25, 27, 33];
  const claro = luminancia(fundo) > 0.4;
  const tema = BS.appearance?.current?.() || {};
  const todas = [...Object.values(tema.syntax || {}), ...Object.values(tema.ui || {})];
  const legivel = (c, minimo = 3) => {
    const x = rgb(c);
    return x && contraste(x, fundo) >= minimo;
  };
  const doMatiz = (nome) => (c) => {
    const x = rgb(c);
    if (!x) return false;
    const { h, s, l } = matiz(x);
    return s >= 0.3 && l >= 0.25 && l <= 0.78 && FAIXAS[nome].some(([a, b]) => h >= a && h < b);
  };
  const preferidas = {
    verde: [v('add'), v('ico-test'), v('j-int')],
    vermelho: [v('del'), v('j-exc')],
    amarelo: [v('warn'), v('ico-res')],
    azul: [v('mod'), v('accent-2'), v('accent'), v('ico-src')],
    roxo: [v('j-enum'), v('accent')],
    ciano: [v('ico-web')],
    laranja: [],
    rosa: [],
  };
  const reserva = {
    verde: claro ? '#2E8540' : '#5FB865',
    vermelho: claro ? '#CF3B4A' : '#F0606E',
    amarelo: claro ? '#A86A10' : '#E3A63A',
    azul: claro ? '#2E63D4' : '#6CA2FF',
    roxo: claro ? '#7E4FD3' : '#B794F6',
    ciano: claro ? '#1D8AAE' : '#47B2D4',
    laranja: claro ? '#B85C1E' : '#E8915A',
    rosa: claro ? '#C23B7E' : '#F07AB0',
  };
  const definir = (nome, cor) => alvos.forEach((a) => a.style.setProperty('--cl-' + nome, cor));
  for (const nome of Object.keys(FAIXAS)) {
    const ok = (c) => doMatiz(nome)(c) && legivel(c);
    definir(nome, preferidas[nome].find(ok) || todas.find(ok) || reserva[nome]);
  }
  definir('cinza', [v('muted'), v('fg-2')].find((c) => legivel(c)) || (claro ? '#6E7681' : '#8A93A3'));
  definir('link', [v('accent-2'), v('accent'), v('mod')].find((c) => legivel(c, 4.5)) || (claro ? '#2E63D4' : '#6CA2FF'));
}

let temaTimer = 0;
new MutationObserver(() => {
  clearTimeout(temaTimer);
  temaTimer = setTimeout(aplicarPaleta, 150);
}).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] });

function aplicarLayout() {
  const t = $('#clScreen');
  if (!t) return;
  t.classList.toggle('sem-hist', C.semHist);
  t.classList.toggle('sem-procs', C.semProcs);
  $('#clBtHist').classList.toggle('on', !C.semHist);
  $('#clBtProcs').classList.toggle('on', !C.semProcs);
}

function novaView(id) {
  const raiz = el('div', 'cl-conversa');
  raiz.hidden = true;
  const trilho = el('div', 'cl-trilho');
  raiz.append(trilho);
  $('#clConversas').append(raiz);
  const v = { id, raiz, trilho, carregado: false, carregando: false, ultimoSeq: 0, vivos: new Map(), cards: new Map(), perms: new Map(), grudado: true, alerta: false, fila: null };
  raiz.addEventListener('scroll', () => {
    v.grudado = raiz.scrollHeight - raiz.scrollTop - raiz.clientHeight < 80;
  });
  C.views.set(id, v);
  return v;
}

function rolar(v, forcar) {
  if (forcar || v.grudado) requestAnimationFrame(() => (v.raiz.scrollTop = v.raiz.scrollHeight));
}

const destino = (v, pai) => (pai && v.cards.has(pai) ? v.cards.get(pai).filhos : v.trilho);

function cardFerramenta(v, b, pai, historico) {
  const agente = b.name === 'Agent' || b.name === 'Task';
  const d = el('details', `cl-ferr rodando${agente ? ' agente' : ''}`);
  d.innerHTML = `<summary><span class="cl-estado"></span><span class="cl-ferr-nome">${esc(b.name)}</span><span class="cl-ferr-resumo">${esc(resumoEntrada(b.input))}</span><span class="cl-ferr-tempo"></span></summary><div class="cl-ferr-corpo"></div>`;
  const corpo = d.querySelector('.cl-ferr-corpo');
  corpo.insertAdjacentHTML('beforeend', corpoEntrada(b.name, b.input));
  const filhos = el('div', 'cl-filhos');
  if (agente) d.open = !historico;
  const info = { el: d, corpo, filhos, inicio: historico || v.reproduzindo ? null : Date.now(), nome: b.name };
  v.cards.set(b.id, info);
  const alvo = destino(v, pai);
  alvo.append(d);
  if (agente) alvo.append(filhos);
  if (historico) d.classList.replace('rodando', 'ok');
}

function resultadoFerramenta(v, b) {
  const info = v.cards.get(b.tool_use_id);
  if (!info) return;
  const texto = textoDe(b.content);
  info.el.classList.remove('rodando');
  info.el.classList.add(b.is_error ? 'falha' : 'ok');
  if (info.inicio) info.el.querySelector('.cl-ferr-tempo').textContent = fmtDuracao(Date.now() - info.inicio);
  info.inicio = null;
  if (texto) info.corpo.insertAdjacentHTML('beforeend', `<div class="cl-rotulo">${b.is_error ? 'erro' : 'resultado'}</div><pre class="${b.is_error ? 'cl-erro' : ''}">${ansi(texto)}</pre>`);
  if (b.is_error && !texto.startsWith('The user doesn')) info.el.open = true;
  if (info.nome === 'Agent' || info.nome === 'Task') info.el.open = false;
}

function blocoTexto(alvo, texto, vivo) {
  const d = el('div', `cl-md${vivo ? ' cl-vivo' : ''}`);
  d.innerHTML = markdown(texto);
  alvo.append(d);
  if (!vivo) colorir(d);
  return d;
}

function aplicar(v, m) {
  if (m.seq) {
    if (m.seq <= v.ultimoSeq) return;
    v.ultimoSeq = m.seq;
  }
  const pai = m.parent_tool_use_id || null;
  switch (m.type) {
    case 'stream_event':
      return aplicarStream(v, m, pai);
    case 'user': {
      const c = m.message?.content;
      if (Array.isArray(c) && c.some((b) => b.type === 'tool_result')) {
        for (const b of c) if (b.type === 'tool_result') resultadoFerramenta(v, b);
        return;
      }
      if (pai) return;
      const texto = textoDe(c);
      if (!texto) return;
      if (/^\[Request interrupted by user/.test(texto)) {
        v.trilho.append(el('div', 'cl-divisor', 'interrompido por você'));
        return rolar(v);
      }
      const d = el('div', `cl-usuario${m.historico ? ' historico' : ''}`);
      d.textContent = texto;
      v.trilho.append(d);
      return rolar(v, !m.historico);
    }
    case 'assistant': {
      const idMsg = m.message?.id;
      const alvo = destino(v, pai);
      for (const b of m.message?.content || []) {
        if (b.type === 'text' && b.text?.trim()) {
          const vivo = v.vivos.get(idMsg)?.find((x) => !x.final);
          if (vivo) {
            vivo.final = true;
            vivo.el.classList.remove('cl-vivo');
            vivo.el.innerHTML = markdown(b.text);
            colorir(vivo.el);
          } else blocoTexto(alvo, b.text);
        } else if (b.type === 'thinking' && b.thinking?.trim()) {
          alvo.append(el('details', 'cl-pensamento', `<summary>pensamento</summary><div>${esc(b.thinking)}</div>`));
        } else if (b.type === 'tool_use') cardFerramenta(v, b, pai, m.historico);
      }
      return rolar(v);
    }
    case 'result': {
      for (const l of v.vivos.values()) for (const x of l) if (!x.final) x.el.classList.remove('cl-vivo');
      v.vivos.clear();
      const partes = [];
      if (m.duration_ms) partes.push(fmtDuracao(m.duration_ms));
      if (m.total_cost_usd) partes.push(fmtCusto(m.total_cost_usd));
      const erro = m.is_error || (m.subtype && m.subtype !== 'success');
      const rotulo = m.subtype === 'error_during_execution' ? 'interrompido' : erro ? `erro: ${m.subtype}` : 'concluído';
      v.trilho.append(el('div', `cl-fim${erro ? ' erro' : ''}`, esc([rotulo, ...partes].join(' · '))));
      if (m.result && m.is_error) v.trilho.append(el('div', 'cl-aviso', esc(m.result)));
      for (const info of v.cards.values()) {
        if (info.el.classList.contains('rodando')) {
          info.el.classList.replace('rodando', 'parada');
          info.inicio = null;
        }
      }
      return rolar(v);
    }
    case 'system':
      if (m.subtype === 'compact_boundary') v.trilho.append(el('div', 'cl-divisor', 'contexto compactado'));
      return;
    case '__perm':
      return cardPermissao(v, m.id, m.req);
    case 'painel':
      v.trilho.append(el('div', 'cl-aviso', esc(m.texto)));
      return rolar(v, true);
  }
}

function aplicarStream(v, m, pai) {
  const e = m.event;
  const idMsg = m.api_message_id || v.msgAtual;
  if (e.type === 'message_start') {
    v.msgAtual = e.message?.id;
    return;
  }
  if (e.type === 'content_block_start' && e.content_block?.type === 'text') {
    const d = blocoTexto(destino(v, pai), '', true);
    if (!v.vivos.has(idMsg)) v.vivos.set(idMsg, []);
    v.vivos.get(idMsg).push({ indice: e.index, el: d, texto: '', final: false });
    return rolar(v);
  }
  if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
    const x = v.vivos.get(idMsg)?.find((y) => y.indice === e.index && !y.final);
    if (!x) return;
    x.texto += e.delta.text;
    if (x.agendado) return;
    x.agendado = true;
    requestAnimationFrame(() => {
      x.agendado = false;
      if (!x.final) x.el.innerHTML = markdown(x.texto);
      rolar(v);
    });
  }
}

function cardPermissao(v, id, req) {
  if (v.perms.has(id)) return;
  const d = el('div', 'cl-perm');
  const nome = req.tool_name;
  const entrada = req.input || {};
  const responder = async (dados) => {
    d.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      await api('permissao', { aba: v.id }, { id, ...dados });
    } catch (e) {
      toast(e.message, 'err');
      d.querySelectorAll('button').forEach((b) => (b.disabled = false));
    }
  };
  const acoes = el('div', 'cl-perm-acoes');
  const campo = (ph) => {
    const i = el('input');
    i.type = 'text';
    i.placeholder = ph;
    i.spellcheck = false;
    return i;
  };
  const botao = (cls, txt, fn) => {
    const b = el('button', `chip ${cls}`, txt);
    b.onclick = fn;
    return b;
  };

  if (nome === 'AskUserQuestion' && Array.isArray(entrada.questions)) {
    d.insertAdjacentHTML('beforeend', `<h4>O Claude tem ${entrada.questions.length > 1 ? 'perguntas' : 'uma pergunta'}</h4>`);
    const respostas = {};
    for (const q of entrada.questions) {
      const bloco = el('div', 'cl-pergunta');
      bloco.append(el('div', 'cl-pergunta-cab', esc(q.question)));
      const escolhidas = new Set();
      for (const o of q.options || []) {
        const b = el('button', 'cl-opcao', `<b>${esc(o.label)}</b><small>${esc(o.description || '')}</small>`);
        b.onclick = () => {
          if (!q.multiSelect) {
            escolhidas.clear();
            bloco.querySelectorAll('.cl-opcao').forEach((x) => x.classList.remove('sel'));
          }
          if (escolhidas.has(o.label)) {
            escolhidas.delete(o.label);
            b.classList.remove('sel');
          } else {
            escolhidas.add(o.label);
            b.classList.add('sel');
          }
          respostas[q.question] = [...escolhidas].join(', ');
        };
        bloco.append(b);
      }
      const outro = campo('Outra resposta…');
      outro.oninput = () => (respostas[q.question] = outro.value.trim() || [...escolhidas].join(', '));
      bloco.append(outro);
      d.append(bloco);
    }
    acoes.append(
      botao('primary', 'Responder', () => responder({ permitir: true, entrada: { ...entrada, answers: respostas } })),
      botao('', 'Ignorar', () => responder({ permitir: false, motivo: 'O usuário preferiu não responder às perguntas.' })),
    );
  } else if (nome === 'ExitPlanMode') {
    d.insertAdjacentHTML('beforeend', `<h4>Plano pronto para aprovação</h4><div class="cl-md">${markdown(entrada.plan || '')}</div>`);
    const motivo = campo('O que ajustar no plano?');
    acoes.append(botao('primary', 'Aprovar plano', () => responder({ permitir: true })), motivo, botao('', 'Continuar planejando', () => responder({ permitir: false, motivo: motivo.value || 'Continue planejando.' })));
  } else {
    d.insertAdjacentHTML('beforeend', `<h4>Permitir ${esc(req.display_name || nome)}?${req.description ? ` <span class="cl-sutil">${esc(req.description)}</span>` : ''}</h4>`);
    d.insertAdjacentHTML('beforeend', corpoEntrada(nome, entrada));
    if (req.decision_reason) d.insertAdjacentHTML('beforeend', `<div class="cl-sutil">${esc(req.decision_reason)}</div>`);
    acoes.append(botao('primary', 'Permitir', () => responder({ permitir: true })));
    if (req.permission_suggestions?.length) {
      const sempre = botao('', 'Permitir sempre nesta sessão', () => responder({ permitir: true, sempre: true }));
      sempre.title = JSON.stringify(req.permission_suggestions);
      acoes.append(sempre);
    }
    const motivo = campo('Motivo (opcional)');
    const nao = botao('cl-perigo', 'Negar', () => responder({ permitir: false, motivo: motivo.value || undefined }));
    motivo.onkeydown = (ev) => ev.key === 'Enter' && nao.click();
    acoes.append(motivo, nao);
  }
  d.append(acoes);
  v.perms.set(id, d);
  v.trilho.append(d);
  rolar(v, true);
}

function removerPermissao(v, id) {
  v.perms.get(id)?.remove();
  v.perms.delete(id);
}

async function carregar(v) {
  if (v.carregado || v.carregando) return;
  v.carregando = true;
  const aviso = el('div', 'cl-carregando', 'carregando conversa…');
  v.trilho.append(aviso);
  try {
    const { log, pendentes } = await api('log', { aba: v.id });
    aviso.remove();
    v.reproduzindo = true;
    for (const m of log) aplicar(v, m);
    v.reproduzindo = false;
    for (const p of pendentes) cardPermissao(v, p.id, p.req);
    for (const m of v.fila || []) aplicar(v, m);
    v.fila = null;
    v.carregado = true;
    rolar(v, true);
  } catch (e) {
    aviso.textContent = `Falha ao carregar: ${e.message}`;
  } finally {
    v.carregando = false;
  }
}

function limparView(v) {
  v.trilho.innerHTML = '';
  v.cards.clear();
  v.perms.clear();
  v.vivos.clear();
  v.ultimoSeq = 0;
  v.carregado = false;
}

function renderAbas() {
  pintarStatus();
  const nav = $('#clAbas');
  if (!nav) return;
  nav.innerHTML = '';
  for (const id of C.ordem) {
    const a = C.abas.get(id);
    if (!a) continue;
    const v = C.views.get(id);
    const d = el('div', `cl-aba${id === C.ativa ? ' ativa' : ''}${v?.alerta ? ' alerta' : ''}`);
    d.title = `${a.titulo}\n${a.cwd}\n${ESTADOS[a.estado] || a.estado}`;
    d.innerHTML = `<span class="cl-ponto ${a.estado}"></span><span class="cl-aba-nome">${esc(a.titulo)}</span><button class="cl-aba-x" title="Fechar (Ctrl+W)">×</button>`;
    d.onclick = (ev) => (ev.target.classList.contains('cl-aba-x') ? fecharAba(id) : ativar(id));
    d.onauxclick = (ev) => ev.button === 1 && fecharAba(id);
    d.ondblclick = () => renomear(d, a);
    nav.append(d);
  }
  $('#clVazio').hidden = !!C.ativa;
  $('#clCompositor').hidden = !C.ativa;
}

function renomear(d, a) {
  const input = el('input');
  input.type = 'text';
  input.value = a.titulo;
  d.querySelector('.cl-aba-nome').replaceWith(input);
  input.focus();
  input.select();
  let feito = false;
  const fim = async (salvar) => {
    if (feito) return;
    feito = true;
    if (salvar && input.value.trim() && input.value !== a.titulo) await api('config', { aba: a.id }, { titulo: input.value.trim() }).catch((e) => toast(e.message, 'err'));
    renderAbas();
  };
  input.onkeydown = (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') fim(true);
    if (ev.key === 'Escape') fim(false);
  };
  input.onblur = () => fim(true);
}

function ativar(id) {
  C.ativa = id;
  store.set('claude.ativa', id);
  for (const x of C.views.values()) x.raiz.hidden = x.id !== id;
  const v = C.views.get(id) || novaView(id);
  v.raiz.hidden = false;
  v.alerta = false;
  carregar(v);
  renderAbas();
  renderCompositor();
  renderProcs();
  renderHistorico();
  if (C.aberto) $('#clEntrada').focus();
}

function renderCompositor() {
  const a = C.abas.get(C.ativa);
  if (!a || !$('#clScreen')) return;
  $('#clPasta').textContent = a.cwd;
  $('#clPasta').title = a.cwd;
  $('#clModelo').value = a.modelo || '';
  $('#clModo').value = a.modo || 'default';
  $('#clEsforco').value = a.esforco || '';
  $('#clContexto').textContent = a.contexto ? `contexto ${fmtTokens(a.contexto)} tokens` : '';
  $('#clCusto').textContent = a.custo ? fmtCusto(a.custo) : '';
  $('#clBtParar').hidden = !ocupada(a);
}

async function fecharAba(id) {
  const a = C.abas.get(id);
  if (ocupada(a) && !confirm(`"${a.titulo}" ainda está trabalhando. Fechar e encerrar o processo?`)) return;
  await api('fechar', { aba: id }, {}).catch(() => {});
  removerAba(id);
}

function removerAba(id) {
  C.abas.delete(id);
  C.ordem = C.ordem.filter((x) => x !== id);
  store.set('claude.ordem', C.ordem);
  C.views.get(id)?.raiz.remove();
  C.views.delete(id);
  if (C.ativa === id) {
    const prox = C.ordem.at(-1);
    if (prox) ativar(prox);
    else {
      C.ativa = null;
      renderAbas();
    }
  } else renderAbas();
  renderProcs();
  renderHistorico();
}

function receberAba(a) {
  const nova = !C.abas.has(a.id);
  const antes = C.abas.get(a.id);
  C.abas.set(a.id, a);
  if (nova) {
    if (!C.ordem.includes(a.id)) C.ordem.push(a.id);
    store.set('claude.ordem', C.ordem);
    if ($('#clScreen') && !C.views.has(a.id)) novaView(a.id);
  }
  if (antes && antes.estado !== a.estado) {
    const fora = !C.aberto || a.id !== C.ativa;
    if (fora && (a.estado === 'aguardando' || (antes.estado === 'ocupada' && a.estado === 'ociosa'))) {
      const v = C.views.get(a.id);
      if (v) v.alerta = true;
      toast(a.estado === 'aguardando' ? `Claude aguardando você: ${a.titulo}` : `Claude terminou: ${a.titulo}`, a.estado === 'aguardando' ? 'err' : 'ok', 'claude-' + a.id);
    }
  }
  if (nova && !C.ativa && $('#clScreen')) return ativar(a.id);
  renderAbas();
  if (a.id === C.ativa) renderCompositor();
  agendarProcs();
}

let procsAgendado = false;
function agendarProcs() {
  if (procsAgendado) return;
  procsAgendado = true;
  setTimeout(() => {
    procsAgendado = false;
    renderProcs();
  }, 150);
}

function linhaProc(p) {
  const linha = el('div', 'cl-linha');
  linha.title = p.cmd;
  linha.innerHTML = `<span class="cl-n" style="padding-left:${(p.nivel - 1) * 10}px">${esc(p.nome)}</span><span class="cl-c">${esc(p.cmd)}</span><span class="cl-m">${fmtMem(p.mem)}</span>`;
  const matar = el('button', 'cl-matar', 'matar');
  matar.title = `Encerrar PID ${p.pid} e filhos`;
  matar.onclick = async () => {
    if (confirm(`Encerrar ${p.nome} (PID ${p.pid})?`)) await api('matar', {}, { pid: p.pid }).catch((e) => toast(e.message, 'err'));
  };
  linha.append(matar);
  return linha;
}

function renderProcs() {
  const lista = $('#clProcs');
  if (!lista || C.semProcs || !C.aberto) return;
  lista.innerHTML = '<h5 class="cl-titulo-sec">Processos</h5>';
  const abas = C.ordem.map((id) => C.abas.get(id)).filter(Boolean);
  if (!abas.length) return lista.append(el('div', 'cl-sutil cl-pad', 'Nenhuma conversa aberta.'));
  for (const a of abas) {
    const c = el('div', `cl-cartao${a.id === C.ativa ? ' ativa' : ''}`);
    const so = C.procs.filter((p) => p.aba === a.id);
    const raiz = so.find((p) => p.nivel === 0);
    const meta = [ESTADOS[a.estado] || a.estado];
    if (a.pid) meta.push(`PID ${a.pid}`);
    if (a.inicioProc) meta.push(`<span data-desde="${a.inicioProc}">${fmtDuracao(Date.now() - a.inicioProc)}</span>`);
    if (raiz?.mem) meta.push(fmtMem(raiz.mem));
    if (a.contexto) meta.push(`${fmtTokens(a.contexto)} tokens`);
    if (a.custo) meta.push(fmtCusto(a.custo));
    c.innerHTML = `<div class="cl-cartao-cab"><span class="cl-ponto ${a.estado}"></span><span class="cl-cartao-nome">${esc(a.titulo)}</span></div><div class="cl-meta">${meta.map((m) => `<span>${m}</span>`).join('')}</div>`;
    c.querySelector('.cl-cartao-cab').onclick = () => ativar(a.id);

    const ferr = (a.ferramentas || []).slice().sort((x, y) => (x.fim ? 1 : 0) - (y.fim ? 1 : 0) || y.inicio - x.inicio).slice(0, 8);
    if (ferr.length) {
      const s = el('div', 'cl-secao', '<h5>Ferramentas</h5>');
      for (const f of ferr) {
        const estado = !f.fim ? 'rodando' : f.erro ? 'falha' : 'ok';
        const tempo = f.fim ? fmtDuracao(f.fim - f.inicio) : `<span data-desde="${f.inicio}">${fmtDuracao(Date.now() - f.inicio)}</span>`;
        s.insertAdjacentHTML('beforeend', `<div class="cl-linha" title="${esc(f.resumo)}"><span class="cl-ic-est ${estado}"></span><span class="cl-n">${f.pai ? '↳ ' : ''}${esc(f.nome)}</span><span class="cl-c">${esc(f.resumo)}</span><span class="cl-m">${tempo}</span></div>`);
      }
      c.append(s);
    }
    const comandos = so.filter((p) => p.nivel > 0 && !p.auxiliar);
    const auxiliares = so.filter((p) => p.nivel > 0 && p.auxiliar);
    if (comandos.length) {
      const s = el('div', 'cl-secao', '<h5>Comandos em execução</h5>');
      comandos.forEach((p) => s.append(linhaProc(p)));
      c.append(s);
    }
    if (auxiliares.length) {
      const s = el('details', 'cl-secao', `<summary><h5>Servidores MCP e auxiliares (${auxiliares.length})</h5></summary>`);
      s.open = C.auxAbertos.has(a.id);
      s.ontoggle = () => (s.open ? C.auxAbertos.add(a.id) : C.auxAbertos.delete(a.id));
      auxiliares.forEach((p) => s.append(linhaProc(p)));
      c.append(s);
    }
    const acoes = el('div', 'cl-cartao-acoes');
    if (ocupada(a)) {
      const b = el('button', 'chip', 'Interromper');
      b.onclick = () => api('interromper', { aba: a.id }, {});
      acoes.append(b);
    }
    if (a.pid) {
      const b = el('button', 'chip cl-perigo', 'Encerrar processo');
      b.title = 'Mata o processo do Claude. A conversa continua na aba e retoma na próxima mensagem.';
      b.onclick = () => api('encerrar', { aba: a.id }, {});
      acoes.append(b);
    }
    if (acoes.children.length) c.append(acoes);
    lista.append(c);
  }
}

setInterval(() => {
  if (!C.aberto) return;
  document.querySelectorAll('#clScreen [data-desde]').forEach((s) => (s.textContent = fmtDuracao(Date.now() - Number(s.dataset.desde))));
  const v = C.views.get(C.ativa);
  if (v) for (const info of v.cards.values()) if (info.inicio) info.el.querySelector('.cl-ferr-tempo').textContent = fmtDuracao(Date.now() - info.inicio);
}, 1000);

async function carregarHistorico() {
  try {
    C.historico = await api('historico');
    renderHistorico();
  } catch {}
}

function renderHistorico() {
  const alvo = $('#clHistLista');
  if (!alvo || C.semHist) return;
  const filtro = $('#clBusca').value.trim().toLowerCase();
  const abertas = new Set([...C.abas.values()].map((a) => a.sessionId).filter(Boolean));
  const projeto = bs.S.project?.path?.toLowerCase();
  const grupos = new Map();
  for (const h of C.historico) {
    if (filtro && !`${h.titulo} ${h.cwd}`.toLowerCase().includes(filtro)) continue;
    const g = h.cwd;
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(h);
  }
  const ordenados = [...grupos.entries()].sort(([a], [b]) => (b.toLowerCase() === projeto) - (a.toLowerCase() === projeto));
  alvo.innerHTML = '';
  if (!ordenados.length) alvo.append(el('div', 'cl-sutil cl-pad', filtro ? 'Nada encontrado.' : 'Sem conversas anteriores.'));
  for (const [cwd, itens] of ordenados) {
    const bloco = el('div', 'cl-grupo', `<h5 title="${esc(cwd)}">${esc(nomePasta(cwd))}${cwd.toLowerCase() === projeto ? ' <span class="cl-tag cl-c-azul">projeto</span>' : ''}</h5>`);
    for (const h of itens.slice(0, filtro ? 50 : 10)) {
      const b = el('button', `cl-item${abertas.has(h.sessionId) ? ' aberta' : ''}`, `<span class="cl-item-t">${esc(h.titulo)}</span><span class="cl-item-q">${fmtQuando(h.atualizado)} · ${Math.max(1, Math.round(h.tamanho / 1024))} KB</span>`);
      b.title = `${h.titulo}\n${h.cwd}\n${h.sessionId}`;
      b.onclick = () => abrirSessao(h);
      bloco.append(b);
    }
    alvo.append(bloco);
  }
}

async function abrirSessao(h) {
  try {
    const a = await api('nova', {}, { cwd: h.cwd, sessionId: h.sessionId, titulo: h.titulo.slice(0, 40) });
    receberAba(a);
    ativar(a.id);
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function criarConversa(cwd, texto) {
  const a = await api('nova', {}, { cwd, modo: store.get('claude.modo', 'default'), modelo: store.get('claude.modelo', ''), esforco: store.get('claude.esforco', '') });
  receberAba(a);
  ativar(a.id);
  if (texto) inserir(texto);
  return a;
}

async function escolherPasta() {
  const caixa = $('#clEscolha');
  const filtro = $('#clEscolhaFiltro');
  const listaEl = $('#clEscolhaLista');
  let dados = { pastas: [], base: '', home: '' };
  try {
    dados = await api('pastas');
  } catch {}
  const projeto = bs.S.project?.path;
  const recentes = [...new Set(C.historico.map((h) => h.cwd))].filter((p) => p !== projeto).slice(0, 8);
  let selecionada = projeto || null;
  const caminho = (v) => (/^[a-z]:\\|^\\\\/i.test(v) ? v : null);
  const abrir = async (cwd) => {
    if (!cwd) return;
    try {
      caixa.hidden = true;
      await criarConversa(cwd);
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  const desenhar = () => {
    const f = filtro.value.trim().toLowerCase();
    listaEl.innerHTML = '';
    const secao = (titulo, itens) => {
      const vis = itens.filter((p) => p && (!f || p.toLowerCase().includes(f)));
      if (!vis.length) return;
      listaEl.append(el('h5', '', esc(titulo)));
      for (const p of vis) {
        const b = el('button', p === selecionada ? 'sel' : '', esc(p));
        b.onclick = () => {
          selecionada = p;
          desenhar();
        };
        b.ondblclick = () => abrir(p);
        listaEl.append(b);
      }
    };
    secao('Projeto aberto', [projeto]);
    secao('Recentes', recentes);
    secao(dados.base || 'Repositórios', dados.pastas.filter((p) => p !== projeto));
  };
  filtro.value = '';
  filtro.oninput = () => {
    selecionada = null;
    desenhar();
  };
  filtro.onkeydown = (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') caixa.hidden = true;
    if (ev.key === 'Enter') abrir(selecionada || caminho(filtro.value.trim()) || listaEl.querySelector('button')?.textContent);
  };
  $('#clEscolhaOk').onclick = () => abrir(selecionada || caminho(filtro.value.trim()));
  $('#clEscolhaCancelar').onclick = () => (caixa.hidden = true);
  desenhar();
  caixa.hidden = false;
  filtro.focus();
}

async function novaConversa(rapida) {
  abrir();
  if (rapida && bs.S.project?.path) return criarConversa(bs.S.project.path).catch((e) => toast(e.message, 'err'));
  escolherPasta();
}

function inserir(texto) {
  const t = $('#clEntrada');
  if (!t) return;
  t.value = t.value ? `${t.value.replace(/\s+$/, '')}\n\n${texto}` : texto;
  ajustarAltura();
  t.focus();
  t.setSelectionRange(t.value.length, t.value.length);
}

async function enviar() {
  const a = C.abas.get(C.ativa);
  const t = $('#clEntrada');
  const texto = t.value.trim();
  if (!a || (!texto && !C.anexos.length)) return;
  const imagens = C.anexos.map(({ tipo, dados }) => ({ tipo, dados }));
  t.value = '';
  C.anexos = [];
  renderAnexos();
  ajustarAltura();
  const v = C.views.get(a.id);
  if (v) v.grudado = true;
  try {
    await api('enviar', { aba: a.id }, { texto, imagens });
  } catch (e) {
    t.value = texto;
    toast(e.message, 'err');
  }
}

function renderAnexos() {
  const alvo = $('#clAnexos');
  alvo.innerHTML = '';
  C.anexos.forEach((x, i) => {
    const d = el('div', 'cl-anexo', `<img src="data:${x.tipo};base64,${x.dados}" alt="">`);
    const b = el('button', '', '×');
    b.onclick = () => {
      C.anexos.splice(i, 1);
      renderAnexos();
    };
    d.append(b);
    alvo.append(d);
  });
}

function ajustarAltura() {
  const t = $('#clEntrada');
  t.style.height = 'auto';
  t.style.height = `${Math.min(t.scrollHeight + 2, window.innerHeight * 0.4)}px`;
}

function abrirArquivo(alvo) {
  const m = String(alvo).match(/^(.*?)(?::(\d+))?(?::\d+)?$/);
  let p = m[1].replace(/\//g, '\\');
  const linha = m[2] ? Number(m[2]) : undefined;
  const aba = C.abas.get(C.ativa);
  if (!/^[a-z]:\\|^\\\\/i.test(p) && aba) p = `${aba.cwd.replace(/\\$/, '')}\\${p.replace(/^\.\\/, '')}`;
  const proj = bs.S.project?.path;
  const dentro = (raiz) => raiz && p.toLowerCase().startsWith(raiz.toLowerCase().replace(/\\$/, '') + '\\');
  if (dentro(proj)) return bs.openFile(p.slice(proj.replace(/\\$/, '').length + 1).replace(/\\/g, '/'), 'editor', linha);
  if (aba && dentro(aba.cwd)) return bs.openOutside(aba.cwd, p.slice(aba.cwd.replace(/\\$/, '').length + 1).replace(/\\/g, '/'), linha);
  toast(`O arquivo está fora do projeto aberto: ${p}`, 'err');
}

function ligarTela() {
  const tela = $('#clScreen');
  $('#clBtHist').onclick = () => {
    C.semHist = !C.semHist;
    store.set('claude.semHist', C.semHist);
    aplicarLayout();
    renderHistorico();
  };
  $('#clBtProcs').onclick = () => {
    C.semProcs = !C.semProcs;
    store.set('claude.semProcs', C.semProcs);
    aplicarLayout();
    renderProcs();
  };
  $('#clBtFechar').onclick = fechar;
  $('#clBtNova').onclick = () => novaConversa(false);
  $('#clBtNovaVazio').onclick = () => novaConversa(false);
  $('#clBtEnviar').onclick = enviar;
  $('#clBtParar').onclick = () => C.ativa && api('interromper', { aba: C.ativa }, {});
  $('#clBusca').oninput = renderHistorico;
  $('#clCores').checked = C.prefs.cores;
  $('#clCores').onchange = async (ev) => {
    try {
      C.prefs = await api('preferencias', {}, { cores: ev.target.checked });
      toast(C.prefs.cores ? 'Cores ligadas: valem nas próximas conversas e nas que forem retomadas' : 'Cores desligadas', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const t = $('#clEntrada');
  t.addEventListener('input', ajustarAltura);
  t.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      enviar();
    }
  });
  t.addEventListener('paste', (ev) => {
    const imgs = [...(ev.clipboardData?.items || [])].filter((i) => i.type.startsWith('image/'));
    if (!imgs.length) return;
    ev.preventDefault();
    for (const item of imgs) {
      const leitor = new FileReader();
      leitor.onload = () => {
        const [cab, dados] = String(leitor.result).split(',');
        C.anexos.push({ tipo: cab.match(/data:([^;]+)/)[1], dados });
        renderAnexos();
      };
      leitor.readAsDataURL(item.getAsFile());
    }
  });

  const config = (campo, chave) => async (ev) => {
    if (!C.ativa) return;
    store.set(chave, ev.target.value);
    try {
      receberAba(await api('config', { aba: C.ativa }, { [campo]: ev.target.value }));
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  $('#clModelo').onchange = config('modelo', 'claude.modelo');
  $('#clModo').onchange = config('modo', 'claude.modo');
  $('#clEsforco').onchange = config('esforco', 'claude.esforco');

  tela.addEventListener('click', (ev) => {
    const copiar = ev.target.closest('.cl-copiar');
    if (copiar) {
      bs.copyText(copiar.closest('.cl-codigo').querySelector('code').textContent);
      copiar.textContent = 'copiado';
      setTimeout(() => (copiar.textContent = 'copiar'), 1200);
      return;
    }
    const arq = ev.target.closest('.cl-arq');
    if (arq) {
      ev.preventDefault();
      abrirArquivo(arq.dataset.arq);
    }
  });

  tela.addEventListener('keydown', (ev) => {
    const ctrl = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    let tratado = true;
    if (ctrl && !ev.altKey && k === 't') novaConversa(false);
    else if (ctrl && !ev.altKey && k === 'w') C.ativa && fecharAba(C.ativa);
    else if (ctrl && ev.key === 'Tab') {
      if (C.ordem.length) {
        const i = C.ordem.indexOf(C.ativa);
        ativar(C.ordem[(i + (ev.shiftKey ? -1 : 1) + C.ordem.length) % C.ordem.length]);
      }
    } else if (ctrl && !ev.altKey && /^[1-9]$/.test(ev.key) && C.ordem[Number(ev.key) - 1]) ativar(C.ordem[Number(ev.key) - 1]);
    else if (ev.key === 'Escape' && !$('#clEscolha').hidden) $('#clEscolha').hidden = true;
    else if (ev.key === 'Escape' && ocupada(C.abas.get(C.ativa))) api('interromper', { aba: C.ativa }, {});
    else tratado = false;
    if (tratado) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  });

  C.ordem = C.ordem.filter((id) => C.abas.has(id));
  for (const id of C.abas.keys()) if (!C.ordem.includes(id)) C.ordem.push(id);
  for (const id of C.ordem) novaView(id);
  const alvo = C.abas.has(C.ativa) ? C.ativa : C.ordem[0];
  if (alvo) ativar(alvo);
  else renderAbas();
}

function conectar() {
  const fonte = new EventSource('/api/claude/eventos');
  fonte.onopen = () => {
    C.conectado = true;
    pintarStatus();
  };
  fonte.onerror = () => {
    C.conectado = false;
    pintarStatus();
  };
  fonte.onmessage = (ev) => {
    const e = JSON.parse(ev.data);
    switch (e.t) {
      case 'oi': {
        const ids = new Set(e.abas.map((a) => a.id));
        for (const id of [...C.abas.keys()]) if (!ids.has(id)) removerAba(id);
        for (const a of e.abas) C.abas.set(a.id, a);
        C.ordem = C.ordem.filter((id) => ids.has(id));
        for (const a of e.abas) if (!C.ordem.includes(a.id)) C.ordem.push(a.id);
        C.procs = e.procs || [];
        C.prefs = e.prefs || C.prefs;
        if ($('#clCores')) $('#clCores').checked = C.prefs.cores;
        for (const v of C.views.values()) limparView(v);
        if ($('#clScreen')) {
          for (const id of C.ordem) if (!C.views.has(id)) novaView(id);
          const alvo = C.abas.has(C.ativa) ? C.ativa : C.ordem[0];
          if (alvo) ativar(alvo);
          else {
            C.ativa = null;
            renderAbas();
          }
        }
        renderAbas();
        return;
      }
      case 'aba':
        return receberAba(e.aba);
      case 'aba-fechada':
        if (C.abas.has(e.id)) removerAba(e.id);
        return;
      case 'msg': {
        const v = C.views.get(e.aba);
        if (!v) return;
        if (v.carregado) aplicar(v, e.m);
        else if (v.carregando) (v.fila ||= []).push(e.m);
        return;
      }
      case 'perm': {
        const v = C.views.get(e.aba);
        if (v?.carregado) cardPermissao(v, e.id, e.req);
        else if (v?.carregando) (v.fila ||= []).push({ type: '__perm', id: e.id, req: e.req });
        return;
      }
      case 'perm-fim': {
        const v = C.views.get(e.aba);
        if (v) removerPermissao(v, e.id);
        return;
      }
      case 'procs':
        C.procs = e.lista;
        return agendarProcs();
      case 'prefs':
        C.prefs = e.prefs;
        if ($('#clCores')) $('#clCores').checked = C.prefs.cores;
        return;
    }
  };
}

const st = bs.status.add({ id: 'stClaude', title: 'Claude Code (Alt+C)', onclick: () => abrir() });
function pintarStatus() {
  const lista = [...C.abas.values()];
  const aguardando = lista.filter((a) => a.estado === 'aguardando').length;
  const trabalhando = lista.filter((a) => a.estado === 'ocupada').length;
  const estado = !C.conectado ? 'erro' : aguardando ? 'aguardando' : trabalhando ? 'ocupada' : lista.some((a) => a.pid) ? 'ociosa' : 'parada';
  st.hidden = false;
  st.innerHTML = `<span class="cl-ponto ${estado}"></span>Claude${aguardando ? ` · ${aguardando} aguardando` : trabalhando ? ` · ${trabalhando} trabalhando` : ''}`;
}

function marcar() {
  const b = $('#strip [data-tool="claude-code"]');
  if (b) b.classList.toggle('on', C.aberto);
  $('#app').classList.toggle('cl-open', C.aberto);
}

function abrir() {
  montarTela();
  C.aberto = true;
  $('#clScreen').hidden = false;
  marcar();
  renderProcs();
  renderHistorico();
  if (!C.historico.length) carregarHistorico();
  const v = C.views.get(C.ativa);
  if (v) {
    v.alerta = false;
    renderAbas();
    rolar(v, true);
  }
  setTimeout(() => $('#clEscolha')?.hidden !== false && $('#clEntrada')?.focus(), 0);
}

function fechar() {
  if (!C.aberto) return;
  C.aberto = false;
  $('#clScreen').hidden = true;
  marcar();
}

const alternar = () => (C.aberto ? fechar() : abrir());

function selecaoDoEditor() {
  const ed = bs.editor;
  const ativo = bs.S.active;
  if (!ed || !ativo) return null;
  const sel = ed.getSelection();
  const modelo = ed.getModel();
  if (!sel || !modelo) return null;
  const texto = modelo.getValueInRange(sel);
  const ling = ativo.lang || '';
  const caminho = `${bs.S.project.path}\\${ativo.path.replace(/\//g, '\\')}`;
  if (!texto.trim()) return { caminho, texto: '', linhas: '' };
  const linhas = sel.startLineNumber === sel.endLineNumber ? `${sel.startLineNumber}` : `${sel.startLineNumber}-${sel.endLineNumber}`;
  return { caminho, texto, linhas, ling };
}

async function perguntarSelecao() {
  const s = selecaoDoEditor();
  if (!s) return toast('Abra um arquivo no editor primeiro', 'err');
  abrir();
  if (!C.ativa) await criarConversa(bs.S.project.path).catch((e) => toast(e.message, 'err'));
  const ref = s.texto ? `\`${s.caminho}:${s.linhas}\`\n\`\`\`${s.ling}\n${s.texto}\n\`\`\`\n` : `\`${s.caminho}\`\n`;
  inserir(ref);
}

bs.tools.register({ id: 'claude-code', title: 'Claude Code', icon: ICON, key: 'Alt+C', order: 45, render() {}, toggle: alternar });
bs.keys.add('Ctrl+Alt+C', () => perguntarSelecao());
bs.hooks.on('tab:activate', fechar);
bs.hooks.on('escape', fechar);
bs.hooks.on('project:select', () => {
  fechar();
  renderHistorico();
});
document.addEventListener(
  'click',
  (e) => {
    const b = e.target.closest('#strip [data-tool], #strip #btnRefresh');
    if (!b || b.dataset.tool === 'claude-code' || !C.aberto) return;
    if (b.dataset.tool === bs.S.tool && !$('#app').classList.contains('no-tool')) {
      e.stopPropagation();
      e.preventDefault();
    }
    fechar();
  },
  true,
);
bs.hooks.filter('menu:file', (items, ctx) => [
  ...items,
  '-',
  {
    label: 'Perguntar ao Claude sobre este arquivo',
    icon: ICON,
    action: async () => {
      abrir();
      if (!C.ativa) await criarConversa(bs.S.project.path).catch((e) => toast(e.message, 'err'));
      inserir(`\`${bs.absPath(ctx.rel)}\``);
    },
  },
]);
bs.actions.add([
  { label: 'Claude Code: abrir', k: 'Alt+C', run: () => abrir(), icon: ICON },
  { label: 'Claude Code: nova conversa neste projeto', k: '', run: () => novaConversa(true), icon: ICON },
  { label: 'Claude Code: nova conversa em outra pasta', k: '', run: () => novaConversa(false), icon: ICON },
  { label: 'Claude Code: perguntar sobre a seleção', k: 'Ctrl+Alt+C', run: () => perguntarSelecao(), icon: ICON },
  { label: 'Claude Code: interromper', k: '', run: () => C.ativa && api('interromper', { aba: C.ativa }, {}), icon: ICON },
]);

aplicarPaleta();
BS.claudeCode = { abrir, fechar, nova: novaConversa, inserir, perguntarSelecao };
pintarStatus();
conectar();
setInterval(() => C.aberto && carregarHistorico(), 60000);
