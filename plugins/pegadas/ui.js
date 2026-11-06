const { $, esc, toast } = bs;
const ICON = '<svg class="i" viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>';
const PERIODOS = [['1', 'Hoje e ontem'], ['7', '7 dias'], ['30', '30 dias']];
const TIPOS = [['arquivo', 'Arquivos'], ['comando', 'Comandos'], ['outro', 'Outras ferramentas']];
const ORDEM_GRUPOS = ['extensao', 'projeto', 'skill', 'memoria', 'config', 'temporario', 'outros'];
const VISTAS = [['tempo', 'Linha do tempo'], ['sessoes', 'Sessões e consumo']];
const ORIGENS = { transcript: 'versão guardada no transcript', cadeia: 'reconstruída pela edição anterior', disco: 'conteúdo atual do disco', revertido: 'reconstruída desfazendo a troca', criado: 'arquivo novo' };
const A = {
  open: false, vista: 'tempo', dias: '1', tipos: ['arquivo', 'comando'], consultas: false, sensiveis: false,
  grupo: '', alvo: '', semAlvo: false, chamado: '', sessao: '', busca: '', dados: null, sessoesDados: null, arquivo: null,
  rev: -1, aberto: null, timer: 0, carregando: false, marcas: true, ultimoSeq: 0, decos: new WeakMap(), acaoEditor: null,
};

const hora = (ts) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
const dataHora = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const dia = (ts) => {
  const d = new Date(ts);
  if (d.toDateString() === new Date().toDateString()) return 'Hoje';
  if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
};
const curto = (t, n) => (t && t.length > n ? t.slice(0, n) + '…' : t || '');
const tokens = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : String(n || 0));
const duracao = (ms) => {
  if (!ms) return '0 s';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + ' s';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${s % 60 ? ' ' + (s % 60) + ' s' : ''}`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
};
const atras = (ts) => {
  const m = Math.round((Date.now() - Date.parse(ts)) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  if (m < 1440) return `há ${Math.round(m / 60)} h`;
  return `há ${Math.round(m / 1440)} d`;
};
const entradaTotal = (u) => (u ? u.entrada + u.cacheLido + u.cacheCriado : 0);

async function chamar(rota, query, corpo) {
  const q = new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v !== '' && v != null)).toString();
  const opt = corpo === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) };
  const j = await bs.api('pegadas/' + rota + (q ? '?' + q : ''), {}, opt);
  if (!j || !j.ok) throw new Error((j && j.erro) || 'Falhou: ' + rota);
  return j;
}

function wrap() {
  let el = $('#caScreen');
  if (el) return el;
  $('#app').insertAdjacentHTML('beforeend', '<div id="caScreen" class="island" hidden><div class="ca-main"></div><aside class="ca-gaveta" hidden></aside></div>');
  return $('#caScreen');
}

function consulta() {
  return {
    dias: A.dias, tipos: A.tipos.join(','), consultas: A.consultas ? '1' : '', sensiveis: A.sensiveis ? '1' : '',
    grupo: A.grupo, alvo: A.alvo, semAlvo: A.semAlvo ? '1' : '', chamado: A.chamado, sessao: A.sessao, q: A.busca.trim(),
  };
}

async function carregar() {
  if (A.carregando) return;
  A.carregando = true;
  const raiz = $('#caScreen .ca-main');
  if (!A.dados) raiz.innerHTML = '<div class="ca-espera"><h3>Lendo os transcripts do Claude…</h3></div>';
  let ultimoErro = '';
  try {
    for (let i = 0; i < 20; i++) {
      try {
        if (A.vista === 'arquivo' && A.arquivo) A.arquivo = await chamar('arquivo', { caminho: A.arquivo.caminho });
        else if (A.vista === 'sessoes') A.sessoesDados = await chamar('sessoes', { dias: A.dias });
        A.dados = await chamar('eventos', consulta());
        A.rev = A.dados.rev;
        render();
        return;
      } catch (err) { ultimoErro = err.message; await new Promise((r) => setTimeout(r, 500)); }
    }
    raiz.innerHTML = `<div class="ca-espera"><h3>A Pegadas não respondeu</h3><p class="ca-erro">${esc(ultimoErro)}</p><button type="button" class="chip primary ca-tentar">Tentar de novo</button></div>`;
    raiz.querySelector('.ca-tentar').onclick = carregar;
  } finally { A.carregando = false; }
}

function alvoChip(a) {
  return `<span class="ca-alvo" data-grupo="${esc(a.grupo)}" title="${esc(a.raiz || '')}">${esc(a.nome)}${a.api ? ' (API)' : ''}${a.dados ? ' (dados)' : ''}</span>`;
}

const riscoChips = (riscos) => (riscos || []).map((r) => `<span class="ca-risco">${esc(r)}</span>`).join('');

function agrupar(itens) {
  const linhas = [];
  for (const ev of itens) {
    const ultima = linhas[linhas.length - 1];
    if (ev.tipo === 'arquivo' && ultima && ultima.tipo === 'arquivo' && ultima.chave === ev.chave) {
      ultima.ids.push(ev.id);
      ultima.mais += ev.mais;
      ultima.menos += ev.menos;
      ultima.erro ||= ev.erro;
      ultima.riscos = [...new Set([...ultima.riscos, ...ev.riscos])];
      if (ev.acao === 'criou') ultima.acao = 'criou';
      ultima.inicio = ev.ts;
    } else linhas.push({ ...ev, ids: [ev.id], inicio: ev.ts });
  }
  return linhas;
}

function linhaEvento(ev) {
  let corpo;
  const vezes = ev.ids.length > 1 ? `<span class="ca-vezes" title="${ev.ids.length} edições seguidas, somadas">×${ev.ids.length}</span>` : '';
  if (ev.tipo === 'arquivo') {
    corpo = `<span class="ca-acao ca-${esc(ev.acao)}">${esc(ev.acao)}</span><span class="ca-arq" title="${esc(ev.caminho)}">${esc(ev.rel)}${vezes}</span><span class="ca-conta"><b class="ca-mais">+${ev.mais}</b> <b class="ca-menos">−${ev.menos}</b></span>`;
  } else {
    const rotulo = ev.ferramenta === 'PowerShell' ? 'PowerShell' : ev.tipo === 'comando' ? 'Bash' : 'ferramenta';
    corpo = `<span class="ca-acao">${esc(rotulo)}</span><span class="ca-cmd" title="${esc(ev.comando || '')}">${esc(ev.titulo || ev.comando || '')}</span>${ev.duracaoMs >= 10000 ? `<span class="ca-dur" title="Tempo até a resposta">${duracao(ev.duracaoMs)}</span>` : ''}${ev.repetido ? `<span class="ca-rep" title="Mesmo comando repetido no pedido">${ev.repetido}ª vez</span>` : ''}`;
  }
  return `<li class="ca-ev${ev.erro ? ' erro' : ''}${ev.riscos.length ? ' sensivel' : ''}${ev.ids.includes(A.aberto) ? ' on' : ''}" data-ids="${esc(ev.ids.join(','))}" data-tipo="${esc(ev.tipo)}" data-pedido="${esc(ev.pedido || '')}" data-caminho="${esc(ev.caminho || '')}">
    <time>${hora(ev.ts)}</time>${corpo}<span class="ca-alvos">${riscoChips(ev.riscos)}${ev.alvos.map(alvoChip).join('')}</span>${ev.erro ? '<span class="ca-falhou">falhou</span>' : ''}
  </li>`;
}

function metricasPedido(pd) {
  if (!pd) return '';
  const partes = [];
  if (pd.fim && pd.ts) partes.push(`<span title="Do pedido até a última ação">${duracao(Date.parse(pd.fim) - Date.parse(pd.ts))}</span>`);
  if (pd.uso?.saida) partes.push(`<span title="Tokens: ${pd.uso.saida.toLocaleString('pt-BR')} gerados, ${entradaTotal(pd.uso).toLocaleString('pt-BR')} lidos (com cache)">${tokens(pd.uso.saida)} saída · ${tokens(entradaTotal(pd.uso))} entrada</span>`);
  if (pd.modelos?.length) partes.push(`<span>${esc(pd.modelos.map((m) => m.replace(/^claude-/, '')).join(', '))}</span>`);
  if (pd.falhas) partes.push(`<span class="ca-ruim">${pd.falhas} falha(s)</span>`);
  if (pd.repetidos) partes.push(`<span class="ca-ruim" title="Comandos rodados 3 vezes ou mais">${pd.repetidos} repetido(s)</span>`);
  if (pd.sensiveis) partes.push(`<span class="ca-ruim">${pd.sensiveis} sensível(is)</span>`);
  return partes.join('');
}

function linhaDoTempo() {
  const { eventos, pedidos, sessoes } = A.dados;
  if (!eventos.length) return '<p class="ca-vazio">Nenhuma ação do Claude com esses filtros.</p>';
  const blocos = [];
  for (const ev of eventos) {
    const k = (ev.pedido || ev.sessao) + '|' + ev.agente;
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.chave === k && ultimo.dia === dia(ev.ts)) ultimo.itens.push(ev);
    else blocos.push({ chave: k, dia: dia(ev.ts), pedidoId: ev.pedido, pedido: pedidos[ev.pedido], sessao: sessoes[ev.sessao], agente: ev.agente, itens: [ev] });
  }
  let html = '';
  let diaAtual = '';
  for (const b of blocos) {
    if (b.dia !== diaAtual) { diaAtual = b.dia; html += `<h2 class="ca-dia">${esc(b.dia)}</h2>`; }
    const arquivos = b.itens.filter((x) => x.tipo === 'arquivo').length;
    const chamados = b.pedido?.chamados || b.itens[0].chamados || [];
    const manuais = b.pedido?.manuais || { pedido: [], sessao: [] };
    const origem = (c) => (manuais.pedido.includes(c) ? 'pedido' : manuais.sessao.includes(c) ? 'sessao' : '');
    html += `<section class="ca-bloco">
      <header>
        <div class="ca-pedido">${b.agente ? '<span class="ca-sub">subagente</span>' : ''}${chamados.map((c) => chipChamado(c, origem(c), b)).join('')}${esc(curto(b.pedido?.texto || '(sem o pedido nesta janela)', 220))}</div>
        <div class="ca-meta"><span title="${esc(b.sessao?.cwd || '')}">${esc(b.sessao?.titulo || 'sessão ' + String(b.itens[0].sessao).slice(0, 8))}</span><span>${b.itens.length} ação(ões)${arquivos ? `, ${arquivos} em arquivo` : ''}</span>${metricasPedido(b.pedido)}</div>
        <div class="ca-bloco-acoes">
          ${arquivos ? `<button type="button" class="ca-link ca-ver-pedido" data-pedido="${esc(b.pedidoId)}">mudanças do pedido</button><button type="button" class="ca-link ca-desfazer-pedido" data-pedido="${esc(b.pedidoId)}">desfazer pedido</button>` : ''}
          <button type="button" class="ca-link ca-resumo-pedido" data-pedido="${esc(b.pedidoId)}">copiar resumo</button>
          <button type="button" class="ca-link ca-so-sessao" data-sessao="${esc(b.itens[0].sessao)}">só esta sessão</button>
          ${b.pedidoId ? `<button type="button" class="ca-link ca-rotular" data-alvo="pedido" data-id="${esc(b.pedidoId)}" title="Dar um chamado ou um nome a este pedido">+ chamado no pedido</button>` : ''}
          <button type="button" class="ca-link ca-rotular" data-alvo="sessao" data-id="${esc(b.itens[0].sessao)}" title="Dar um chamado ou um nome a todos os pedidos desta sessão">+ chamado na sessão</button>
        </div>
      </header>
      <ol>${agrupar(b.itens).map(linhaEvento).join('')}</ol>
    </section>`;
  }
  if (A.dados.cortados) html += `<p class="ca-vazio">+ ${A.dados.cortados} ações mais antigas. Diminua o período ou filtre.</p>`;
  return html;
}

function chipChamado(c, manual, b) {
  if (manual) {
    const id = manual === 'pedido' ? b.pedidoId : b.itens[0].sessao;
    return `<span class="ca-chamado manual" title="Marcado à mão ${manual === 'pedido' ? 'neste pedido' : 'na sessão'}"><button type="button" class="ca-chamado-nome" data-chamado="${esc(c)}">${esc(c)}</button><button type="button" class="ca-chamado-tirar" data-alvo="${manual}" data-id="${esc(id)}" data-nome="${esc(c)}" title="Tirar">×</button></span>`;
  }
  const herdado = b.pedido?.herdado;
  return `<button type="button" class="ca-chamado${herdado ? ' herdado' : ''}" data-chamado="${esc(c)}" title="${herdado ? 'Deduzido: citado no pedido anterior desta sessão' : 'Citado neste pedido'}">${esc(c)}</button>`;
}

async function rotular(alvo, id, nome, remover) {
  try {
    const j = await chamar('rotulo', {}, { alvo, id, nome, remover });
    toast(remover ? `${j.rotulo} tirado` : `Marcado como ${j.rotulo}`, 'ok');
    await carregar();
  } catch (err) { toast('Erro: ' + err.message, 'err'); }
}

function vistaSessoes() {
  const lista = A.sessoesDados?.sessoes || [];
  if (!lista.length) return '<p class="ca-vazio">Nenhuma sessão no período.</p>';
  const soma = lista.reduce((t, s) => ({ saida: t.saida + s.uso.saida, entrada: t.entrada + entradaTotal(s.uso), mud: t.mud + s.mudancas, cmd: t.cmd + s.comandos, falhas: t.falhas + s.falhas }), { saida: 0, entrada: 0, mud: 0, cmd: 0, falhas: 0 });
  return `<div class="ca-totais">
      <div><b>${lista.length}</b><span>sessões</span></div><div><b>${tokens(soma.saida)}</b><span>tokens gerados</span></div>
      <div><b>${tokens(soma.entrada)}</b><span>tokens lidos (com cache)</span></div><div><b>${soma.mud}</b><span>mudanças em arquivo</span></div>
      <div><b>${soma.cmd}</b><span>comandos e ferramentas</span></div><div><b>${soma.falhas}</b><span>falhas</span></div>
    </div>
    <table class="ca-tabela"><thead><tr><th>Sessão</th><th>Quando</th><th>Duração</th><th>Pedidos</th><th>Mudanças</th><th>Comandos</th><th>Falhas</th><th>Tokens gerados</th><th>Tokens lidos</th><th>Modelo</th></tr></thead>
    <tbody>${lista.map((s) => `<tr data-sessao="${esc(s.id)}" title="${esc(s.cwd)}">
      <td>${esc(curto(s.titulo || s.id.slice(0, 8), 60))}</td><td>${dataHora(s.inicio)}</td><td>${duracao(Date.parse(s.fim) - Date.parse(s.inicio))}</td>
      <td>${s.pedidos}</td><td>${s.mudancas}</td><td>${s.comandos}</td><td class="${s.falhas ? 'ca-ruim' : ''}">${s.falhas}</td>
      <td>${tokens(s.uso.saida)}</td><td>${tokens(entradaTotal(s.uso))}</td><td>${esc(s.modelos.map((m) => m.replace(/^claude-/, '')).join(', '))}</td>
    </tr>`).join('')}</tbody></table>
    <p class="ca-mute">Contado a partir dos transcripts, sem duplicar a mesma resposta. Duração vai do primeiro ao último registro da sessão, com as pausas.</p>`;
}

function vistaArquivo() {
  const f = A.arquivo;
  if (!f) return '';
  return `<div class="ca-arq-topo">
      <div><h2 class="ca-mono">${esc(f.caminho)}</h2>${alvoChip(f.alvo)} ${f.existe ? '' : '<span class="ca-risco">não existe mais no disco</span>'}${f.mudouDepois ? '<span class="ca-risco">mudou depois da última edição do Claude</span>' : ''}</div>
      <div class="ca-acoes">${f.existe ? '<button type="button" class="chip primary ca-abrir-este">Abrir no editor</button>' : ''}<button type="button" class="chip ca-voltar">Voltar para a linha do tempo</button></div>
    </div>
    ${f.versoes.length ? `<ol class="ca-versoes">${f.versoes.map((v, i) => `<li>
      <details${i === 0 ? ' open' : ''}><summary><time>${dataHora(v.ts)}</time><span class="ca-acao ca-${esc(v.acao)}">${esc(v.acao)}</span><span class="ca-mais">+${v.mais}</span> <span class="ca-menos">−${v.menos}</span><span class="ca-ver-pedido-t">${esc(curto(v.pedido, 140))}</span></summary>
        <div class="ca-diff">${diffHtml(v.patch || [])}</div>
        <div class="ca-acoes">
          <button type="button" class="chip ca-restaurar" data-modo="antes" data-id="${esc(v.id)}"${v.temAntes ? '' : ' disabled title="A versão de antes não está no transcript nem dá para reconstruir"'}>Voltar para antes desta edição</button>
          <button type="button" class="chip ca-restaurar" data-modo="depois" data-id="${esc(v.id)}"${v.temDepois ? '' : ' disabled title="A versão de depois não está no transcript nem dá para reconstruir"'}>Voltar para logo depois dela</button>
          <span class="ca-mute">${esc(ORIGENS[v.origem] || '')}</span>
        </div>
      </details></li>`).join('')}</ol>` : '<p class="ca-vazio">O Claude não mexeu neste arquivo no período carregado.</p>'}`;
}

function lateral() {
  const { alvos, grupos, tipos, semAlvo, chamados } = A.dados;
  const porGrupo = ORDEM_GRUPOS.map((g) => [g, alvos.filter((a) => a.grupo === g)]).filter(([, l]) => l.length);
  const item = (rotulo, sel, attrs, mud, cmd) => `<button type="button" class="ca-filtro${sel ? ' on' : ''}" ${attrs}><span>${esc(rotulo)}</span><span class="ca-qtd" title="${mud} mudança(s) em arquivo, ${cmd} comando(s)">${mud ? mud : ''}${mud && cmd ? ' · ' : ''}${cmd ? cmd + ' cmd' : ''}</span></button>`;
  const nada = !A.grupo && !A.semAlvo && !A.chamado;
  return `<aside class="ca-lado">
    <button type="button" class="ca-filtro${nada ? ' on' : ''}" data-grupo=""><span>Tudo</span><span class="ca-qtd">${tipos.arquivo + tipos.comando + tipos.outro}</span></button>
    ${chamados.length ? `<h3>Chamados</h3>${chamados.map((c) => item(c.numero, A.chamado === c.numero, `data-chamado="${esc(c.numero)}"`, c.mudancas, c.acoes - c.mudancas)).join('')}` : ''}
    ${porGrupo.map(([g, lista]) => `<h3>${esc(grupos[g] || g)}</h3>${lista.map((a) => item(a.nome, A.grupo === g && A.alvo === a.id, `data-grupo="${esc(g)}" data-alvo="${esc(a.id)}" title="${esc(a.raiz || '')}"`, a.mudancas, a.comandos)).join('')}`).join('')}
    ${semAlvo ? `<h3>Sem alvo</h3>${item('Comandos soltos', A.semAlvo, 'data-sem="1" title="Comandos que não citam arquivo de extensão, projeto ou skill"', 0, semAlvo)}` : ''}
  </aside>`;
}

function faixaChamado() {
  if (!A.chamado) return '';
  const temDash = Boolean(window.BS?.dashboard?.chamar);
  return `<div class="ca-faixa"><b>${esc(A.chamado)}</b><span>${A.dados.total} ação(ões) do Claude neste chamado</span>
    <button type="button" class="chip ca-resumo-chamado">Resumo do que foi feito</button>
    ${temDash ? '<button type="button" class="chip ca-dash-abrir">Abrir no Dashboard</button>' : ''}</div>`;
}

function render() {
  const raiz = $('#caScreen .ca-main');
  const { tipos } = A.dados;
  const scroll = raiz.querySelector('.ca-lista')?.scrollTop || 0;
  const filtrado = A.grupo || A.semAlvo || A.busca || A.chamado || A.sessao || A.sensiveis;
  const conteudo = A.vista === 'arquivo' ? vistaArquivo() : A.vista === 'sessoes' ? vistaSessoes() : faixaChamado() + linhaDoTempo();
  raiz.innerHTML = `
    <header class="ca-topo">
      <h1>Pegadas</h1>
      <nav class="ca-vistas">${VISTAS.map(([v, r]) => `<button type="button" class="ca-vista${A.vista === v ? ' on' : ''}" data-vista="${v}">${r}</button>`).join('')}${A.vista === 'arquivo' ? '<button type="button" class="ca-vista on">Histórico do arquivo</button>' : ''}</nav>
      <span class="ca-sub-t"></span>
      <div class="ca-seg">${PERIODOS.map(([v, r]) => `<button type="button" class="chip${A.dias === v ? ' primary' : ''}" data-dias="${v}">${r}</button>`).join('')}</div>
    </header>
    ${A.vista === 'tempo' ? `<div class="ca-barra">
      <label class="ca-ctl ca-grow"><span>Procurar</span><input name="busca" value="${esc(A.busca)}" placeholder="arquivo, comando, saída" spellcheck="false"></label>
      ${TIPOS.map(([v, r]) => `<label class="ca-check"><input type="checkbox" data-tipo="${v}"${A.tipos.includes(v) ? ' checked' : ''}> ${r} <span class="ca-qtd">${tipos[v]}</span></label>`).join('')}
      <label class="ca-check" title="Comandos que só leem: cat, grep, ls, git log, curl sem POST..."><input type="checkbox" name="consultas"${A.consultas ? ' checked' : ''}> consultas <span class="ca-qtd">${A.dados.consultas}</span></label>
      <label class="ca-check ca-check-risco" title="Apagar, git push, gravar em servidor externo, cofre, configuração, credencial, fora de projeto"><input type="checkbox" name="sensiveis"${A.sensiveis ? ' checked' : ''}> só sensíveis <span class="ca-qtd">${A.dados.sensiveis}</span></label>
      ${filtrado ? '<button type="button" class="chip ca-limpar">Limpar filtro</button>' : ''}
    </div>` : ''}
    <div class="ca-corpo${A.vista === 'tempo' ? '' : ' cheio'}">${A.vista === 'tempo' ? lateral() : ''}<div class="ca-lista">${conteudo}</div></div>`;
  raiz.querySelector('.ca-lista').scrollTop = A.vista === 'tempo' ? scroll : 0;
  ligar(raiz);
}

function ligar(raiz) {
  const sel = (s) => raiz.querySelectorAll(s);
  sel('[data-vista]').forEach((b) => { b.onclick = () => { A.vista = b.dataset.vista; fechar(); carregar(); }; });
  sel('[data-dias]').forEach((b) => { b.onclick = () => { A.dias = b.dataset.dias; guardar(); carregar(); }; });
  sel('input[data-tipo]').forEach((c) => { c.onchange = () => { A.tipos = [...sel('input[data-tipo]:checked')].map((x) => x.dataset.tipo); guardar(); carregar(); }; });
  const marcar = (nome, campo) => { const c = raiz.querySelector(`input[name="${nome}"]`); if (c) c.onchange = (e) => { A[campo] = e.target.checked; guardar(); carregar(); }; };
  marcar('consultas', 'consultas');
  marcar('sensiveis', 'sensiveis');
  const busca = raiz.querySelector('input[name="busca"]');
  if (busca) {
    let espera = 0;
    busca.oninput = () => { clearTimeout(espera); espera = setTimeout(() => { A.busca = busca.value; carregar().then(() => { const b = $('#caScreen input[name="busca"]'); if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); } }); }, 300); };
  }
  sel('.ca-lado .ca-filtro').forEach((b) => {
    b.onclick = () => { Object.assign(A, { semAlvo: b.dataset.sem === '1', grupo: b.dataset.grupo || '', alvo: b.dataset.alvo || '', chamado: b.dataset.chamado || '', sessao: '' }); carregar(); };
  });
  raiz.querySelector('.ca-limpar')?.addEventListener('click', () => { Object.assign(A, { grupo: '', alvo: '', semAlvo: false, busca: '', chamado: '', sessao: '', sensiveis: false }); carregar(); });
  sel('.ca-rotular').forEach((b) => {
    b.onclick = () => {
      const nome = prompt(b.dataset.alvo === 'sessao' ? 'Chamado ou nome para todos os pedidos desta sessão' : 'Chamado ou nome para este pedido', A.chamado || '');
      if (nome && nome.trim()) rotular(b.dataset.alvo, b.dataset.id, nome);
    };
  });
  sel('.ca-chamado-tirar').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); rotular(b.dataset.alvo, b.dataset.id, b.dataset.nome, true); }; });
  sel('.ca-chamado:not(.manual), .ca-chamado-nome').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); Object.assign(A, { chamado: b.dataset.chamado, grupo: '', alvo: '', semAlvo: false, sessao: '' }); carregar(); }; });
  sel('.ca-so-sessao').forEach((b) => { b.onclick = () => { Object.assign(A, { sessao: b.dataset.sessao, busca: '' }); carregar(); }; });
  sel('.ca-ver-pedido').forEach((b) => { b.onclick = () => abrirPedido(b.dataset.pedido); });
  sel('.ca-desfazer-pedido').forEach((b) => { b.onclick = () => previaRestaurar('pedido', b.dataset.pedido); });
  sel('.ca-resumo-pedido').forEach((b) => { b.onclick = () => abrirResumo({ pedido: b.dataset.pedido }, 'Resumo do pedido'); });
  raiz.querySelector('.ca-resumo-chamado')?.addEventListener('click', () => abrirResumo({ chamado: A.chamado, dias: 30 }, A.chamado));
  raiz.querySelector('.ca-dash-abrir')?.addEventListener('click', () => abrirNoDashboard(A.chamado));
  sel('.ca-ev').forEach((li) => {
    li.onclick = () => {
      const ids = li.dataset.ids.split(',');
      if (ids.length > 1) abrirPedido(li.dataset.pedido, li.dataset.caminho);
      else abrir(ids[0]);
    };
  });
  sel('.ca-tabela tr[data-sessao]').forEach((tr) => { tr.onclick = () => { Object.assign(A, { vista: 'tempo', sessao: tr.dataset.sessao, grupo: '', alvo: '', chamado: '' }); carregar(); }; });
  raiz.querySelector('.ca-voltar')?.addEventListener('click', () => { A.vista = 'tempo'; carregar(); });
  raiz.querySelector('.ca-abrir-este')?.addEventListener('click', () => abrirArquivo(A.arquivo.caminho, A.arquivo.alvo));
  sel('.ca-restaurar').forEach((b) => { b.onclick = () => previaRestaurar(b.dataset.modo, b.dataset.id); });
}

function diffHtml(linhas) {
  return linhas.map((l) => {
    const c = l.startsWith('@@') ? 'h' : l[0] === '+' ? 'a' : l[0] === '-' ? 'd' : 'c';
    return `<div class="ca-dl ${c}">${esc((c === 'h' ? l : l.slice(1)).replace(/\r$/, '')) || ' '}</div>`;
  }).join('');
}

function gaveta(html) {
  const g = $('#caScreen .ca-gaveta');
  g.hidden = false;
  g.innerHTML = `<div class="ca-detalhe">${html}</div>`;
  g.scrollTop = 0;
  g.querySelectorAll('.ca-fechar').forEach((b) => { b.onclick = fechar; });
  g.querySelectorAll('.ca-copiar').forEach((b) => { b.onclick = () => { bs.copyText(b.dataset.texto); toast('Copiado', 'ok'); }; });
  return g;
}

function marcarAberto(id) {
  A.aberto = id;
  $('#caScreen').querySelectorAll('.ca-ev').forEach((li) => li.classList.toggle('on', li.dataset.ids.split(',').includes(id)));
}

async function abrir(id) {
  marcarAberto(id);
  gaveta('<p class="ca-mute">Carregando…</p>');
  let j;
  try { j = await chamar('evento', { id }); } catch (err) { gaveta(`<p class="ca-erro">${esc(err.message)}</p>`); return; }
  const ev = j.evento;
  let corpo;
  if (ev.tipo === 'arquivo') {
    corpo = `<div class="ca-caminho ca-mono">${esc(ev.caminho)}</div>
      <div class="ca-acoes"><button type="button" class="chip primary ca-abrir-arq">Abrir no editor</button><button type="button" class="chip ca-historico">Histórico do arquivo</button><button type="button" class="chip ca-desfazer-edicao">Voltar para antes desta edição</button><button type="button" class="chip ca-copiar" data-texto="${esc(ev.caminho)}">Copiar caminho</button></div>
      <h3>${esc(ev.acao)} <span class="ca-mais">+${ev.mais}</span> <span class="ca-menos">−${ev.menos}</span></h3>
      <div class="ca-diff">${diffHtml(ev.patch || [])}</div>
      ${ev.cortadas ? `<p class="ca-mute">+ ${ev.cortadas} linhas não mostradas.</p>` : ''}`;
  } else {
    corpo = `${ev.titulo ? `<p class="ca-titulo-cmd">${esc(ev.titulo)}</p>` : ''}
      <h3>${esc(ev.ferramenta)}${ev.interrompido ? ' (interrompido)' : ''}${ev.erro ? ' <span class="ca-falhou">falhou</span>' : ''} <span class="ca-mute">${duracao(ev.duracaoMs)}${ev.repetido ? ` · ${ev.repetido}ª vez neste pedido` : ''}</span></h3>
      <pre class="ca-pre">${esc(ev.comando)}</pre>
      <div class="ca-acoes"><button type="button" class="chip ca-copiar" data-texto="${esc(ev.comando)}">Copiar comando</button></div>
      <h3>Saída</h3><pre class="ca-pre ca-saida">${esc(ev.saida || '(sem saída)')}</pre>`;
  }
  const g = gaveta(`<header><h2>${esc(new Date(ev.ts).toLocaleString('pt-BR'))}</h2><button type="button" class="chip ca-fechar">Fechar</button></header>
    ${ev.alvos.length || ev.riscos.length ? `<div class="ca-alvos">${riscoChips(ev.riscos)}${ev.alvos.map(alvoChip).join('')}</div>` : ''}
    ${j.pedido ? `<blockquote class="ca-quote"><span>Pedido</span>${esc(j.pedido.texto)}</blockquote>` : ''}
    ${corpo}
    <p class="ca-mute ca-mono">sessão ${esc(ev.sessao)}${ev.agente ? ' · subagente ' + esc(ev.agente) : ''}${j.sessao?.cwd ? ' · ' + esc(j.sessao.cwd) : ''}</p>`);
  g.querySelector('.ca-abrir-arq')?.addEventListener('click', () => abrirArquivo(ev.caminho, ev.alvos[0]));
  g.querySelector('.ca-historico')?.addEventListener('click', () => abrirHistorico(ev.caminho));
  g.querySelector('.ca-desfazer-edicao')?.addEventListener('click', () => previaRestaurar('antes', ev.id));
}

async function abrirPedido(pedidoId, foco) {
  gaveta('<p class="ca-mute">Juntando as mudanças do pedido…</p>');
  let j;
  try { j = await chamar('pedido', { id: pedidoId }); } catch (err) { gaveta(`<p class="ca-erro">${esc(err.message)}</p>`); return; }
  const arquivos = foco ? [...j.arquivos].sort((a, b) => (b.caminho === foco) - (a.caminho === foco)) : j.arquivos;
  const g = gaveta(`<header><h2>Mudanças do pedido</h2><button type="button" class="chip ca-fechar">Fechar</button></header>
    ${j.pedido ? `<blockquote class="ca-quote"><span>Pedido · ${esc(dataHora(j.pedido.ts))}</span>${esc(j.pedido.texto)}</blockquote><div class="ca-meta">${metricasPedido(j.pedido)}</div>` : ''}
    <div class="ca-acoes">${arquivos.length ? '<button type="button" class="chip ca-desfazer-tudo">Desfazer o pedido inteiro</button>' : ''}<button type="button" class="chip ca-resumo-este">Copiar resumo</button></div>
    ${arquivos.map((a) => `<details class="ca-arq-pedido"${!foco || a.caminho === foco ? ' open' : ''}>
      <summary><span class="ca-acao ca-${a.criado ? 'criou' : 'editou'}">${a.criado ? 'criou' : 'editou'}</span><span class="ca-mono" title="${esc(a.caminho)}">${esc(a.rel)}</span>${a.edicoes.length > 1 ? `<span class="ca-vezes">${a.edicoes.length} edições</span>` : ''}${a.diff ? `<span class="ca-mais">+${a.diff.mais}</span> <span class="ca-menos">−${a.diff.menos}</span>` : ''}${alvoChip(a.alvo)}</summary>
      ${a.mudouDepois ? '<p class="ca-aviso">O arquivo mudou depois deste pedido (por você ou por outro pedido).</p>' : ''}
      ${!a.existe ? '<p class="ca-aviso">O arquivo não existe mais no disco.</p>' : ''}
      ${a.diff ? `<div class="ca-diff">${diffHtml(a.diff.linhas)}</div>${a.diff.cortadas ? `<p class="ca-mute">+ ${a.diff.cortadas} linhas não mostradas.</p>` : ''}` : '<p class="ca-mute">Não deu para montar o antes e depois deste arquivo: o transcript não guardou o conteúdo e a reconstrução não fechou. As edições aparecem uma a uma na linha do tempo.</p>'}
      <div class="ca-acoes"><button type="button" class="chip ca-hist" data-caminho="${esc(a.caminho)}">Histórico do arquivo</button></div>
    </details>`).join('')}
    ${j.comandos.length ? `<h3>Comandos e ferramentas (${j.comandos.length})</h3><ol class="ca-cmds">${j.comandos.map((c) => `<li class="${c.erro ? 'erro' : ''}" data-id="${esc(c.id)}"><time>${hora(c.ts)}</time><span>${esc(c.titulo || c.comando)}</span>${riscoChips(c.riscos)}${c.erro ? '<span class="ca-falhou">falhou</span>' : ''}</li>`).join('')}</ol>` : ''}`);
  g.querySelector('.ca-desfazer-tudo')?.addEventListener('click', () => previaRestaurar('pedido', pedidoId));
  g.querySelector('.ca-resumo-este').onclick = () => abrirResumo({ pedido: pedidoId }, 'Resumo do pedido');
  g.querySelectorAll('.ca-hist').forEach((b) => { b.onclick = () => abrirHistorico(b.dataset.caminho); });
  g.querySelectorAll('.ca-cmds li').forEach((li) => { li.onclick = () => abrir(li.dataset.id); });
}

function abasSujas(caminho) {
  const alvo = caminho.toLowerCase();
  return bs.S.tabs.filter((t) => t.dirty && !t.virtual && `${t.project}/${t.path}`.replace(/\\/g, '/').toLowerCase() === alvo);
}

async function previaRestaurar(modo, id) {
  gaveta('<p class="ca-mute">Montando a prévia…</p>');
  let j;
  try { j = await chamar('restaurar-previa', {}, { modo, id }); } catch (err) { gaveta(`<p class="ca-erro">${esc(err.message)}</p>`); return; }
  const titulo = modo === 'pedido' ? 'Desfazer o pedido' : modo === 'antes' ? 'Voltar para antes da edição' : 'Voltar para logo depois da edição';
  const itens = j.itens;
  const g = gaveta(`<header><h2>${titulo}</h2><button type="button" class="chip ca-fechar">Cancelar</button></header>
    <p class="ca-mute">Diff do conteúdo atual no disco para o que vai ficar. Antes de gravar, uma cópia do conteúdo atual vai para a pasta de backups do plugin.</p>
    <form class="ca-restaurar-form">
      ${itens.map((it, i) => {
        const sujas = abasSujas(it.caminho).length;
        const marcado = it.possivel && !it.igual;
        return `<details class="ca-arq-pedido" open>
          <summary><input type="checkbox" name="so" value="${esc(it.caminho)}"${marcado ? ' checked' : ''}${it.possivel && !it.igual ? '' : ' disabled'}><span class="ca-mono" title="${esc(it.caminho)}">${esc(it.rel)}</span>${it.apagar ? '<span class="ca-risco">vai apagar (o Claude criou)</span>' : ''}${it.diff && !it.igual ? `<span class="ca-mais">+${it.diff.mais}</span> <span class="ca-menos">−${it.diff.menos}</span>` : ''}</summary>
          ${!it.possivel ? `<p class="ca-aviso">Não dá: ${esc(it.motivo)}.</p>` : it.igual ? '<p class="ca-mute">Já está assim. Nada a fazer.</p>' : ''}
          ${sujas ? '<p class="ca-aviso">Este arquivo está aberto com alterações não salvas. Salve ou descarte antes, senão a IDE vai mostrar conflito.</p>' : ''}
          ${it.possivel && !it.igual && it.diff ? `<div class="ca-diff">${diffHtml(it.diff.linhas)}</div>` : ''}
          <input type="hidden" name="h${i}" value="${esc(it.hashAtual)}">
        </details>`;
      }).join('')}
      <div class="ca-acoes"><button type="submit" class="chip primary">Restaurar selecionados</button><button type="button" class="chip ca-fechar">Cancelar</button></div>
    </form>`);
  g.querySelectorAll('.ca-fechar').forEach((b) => { b.onclick = fechar; });
  g.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const so = [...g.querySelectorAll('input[name="so"]:checked')].map((c) => c.value);
    if (!so.length) { toast('Marque ao menos um arquivo', 'err'); return; }
    if (!confirm(`Gravar ${so.length} arquivo(s)? O conteúdo atual vai para o backup do plugin.`)) return;
    const hashes = Object.fromEntries(itens.map((it) => [it.caminho, it.hashAtual]));
    try {
      const r = await chamar('restaurar', {}, { modo, id, so, hashes });
      gaveta(`<header><h2>Restaurado</h2><button type="button" class="chip ca-fechar">Fechar</button></header>
        <ul class="ca-feito">${r.itens.map((x) => `<li>${x.apagou ? 'apagado' : 'restaurado'}: <span class="ca-mono">${esc(x.rel)}</span></li>`).join('')}</ul>
        <p class="ca-mute">Backup do que estava antes:</p><div class="ca-caminho ca-mono">${esc(r.backup)}</div>
        <div class="ca-acoes"><button type="button" class="chip ca-copiar" data-texto="${esc(r.backup)}">Copiar pasta do backup</button></div>`);
      toast(`${r.itens.length} arquivo(s) restaurado(s)`, 'ok');
      bs.refreshProject?.();
    } catch (err) { toast('Erro: ' + err.message, 'err'); }
  };
}

async function abrirResumo(query, titulo) {
  gaveta('<p class="ca-mute">Montando o resumo…</p>');
  let j;
  try { j = await chamar('resumo', query); } catch (err) { gaveta(`<p class="ca-erro">${esc(err.message)}</p>`); return; }
  const temDash = Boolean(window.BS?.dashboard?.chamar) && query.chamado;
  const g = gaveta(`<header><h2>${esc(titulo)}</h2><button type="button" class="chip ca-fechar">Fechar</button></header>
    <pre class="ca-pre">${esc(j.texto)}</pre>
    <div class="ca-acoes"><button type="button" class="chip primary ca-copiar" data-texto="${esc(j.texto)}">Copiar</button>
    ${temDash ? '<button type="button" class="chip ca-dash-registrar">Registrar como andamento no Dashboard</button><button type="button" class="chip ca-dash-ir">Abrir no Dashboard</button>' : ''}</div>`);
  g.querySelector('.ca-dash-ir')?.addEventListener('click', () => abrirNoDashboard(query.chamado));
  g.querySelector('.ca-dash-registrar')?.addEventListener('click', () => registrarNoDashboard(query.chamado, j.texto));
}

async function itemDoDashboard(numero) {
  const j = await BS.dashboard.chamar('dados');
  return j.items.find((i) => String(i.numero).toUpperCase() === numero.toUpperCase());
}

async function abrirNoDashboard(numero) {
  try {
    if (BS.dashboard.abrirNumero) { close(); if (!(await BS.dashboard.abrirNumero(numero))) toast(`${numero} não está no Dashboard`, 'err'); return; }
    const item = await itemDoDashboard(numero);
    if (!item) { toast(`${numero} não está no Dashboard`, 'err'); return; }
    close();
    BS.dashboard.open(item.aba);
  } catch (err) { toast('Erro: ' + err.message, 'err'); }
}

async function registrarNoDashboard(numero, texto) {
  try {
    const item = await itemDoDashboard(numero);
    if (!item) { toast(`${numero} não está no Dashboard`, 'err'); return; }
    if (!confirm(`Acrescentar este resumo ao histórico de ${numero} no Dashboard?`)) return;
    await BS.dashboard.chamar('item', { id: item.id, andamento: texto });
    toast(`Andamento registrado em ${numero}`, 'ok');
  } catch (err) { toast('Erro: ' + err.message, 'err'); }
}

async function abrirArquivo(caminho, alvo) {
  const raiz = alvo?.raiz;
  const rel = raiz && caminho.toLowerCase().startsWith(raiz.toLowerCase() + '/') ? caminho.slice(raiz.length + 1) : null;
  close();
  try {
    if (rel) await bs.openOutside(raiz, rel);
    else await bs.openOutside(caminho.replace(/\/[^/]*$/, ''), caminho.replace(/^.*\//, ''));
  } catch (err) { toast('Não abriu: ' + err.message, 'err'); }
}

async function abrirHistorico(caminho) {
  fechar();
  if (!A.open) { A.open = true; wrap().hidden = false; mark(); }
  A.vista = 'arquivo';
  A.arquivo = { caminho };
  await carregar();
}

function fechar() {
  A.aberto = null;
  const g = $('#caScreen .ca-gaveta');
  if (!g) return;
  g.hidden = true;
  g.innerHTML = '';
  $('#caScreen').querySelectorAll('.ca-ev.on').forEach((li) => li.classList.remove('on'));
}

function guardar() {
  plugin.data.set('escolha', { dias: A.dias, tipos: A.tipos, consultas: A.consultas, marcas: A.marcas }).catch(() => {});
}

function mark() {
  const b = $('#strip [data-tool="pegadas"]');
  if (b) b.classList.toggle('on', A.open);
  $('#app').classList.toggle('ca-open', A.open);
}

async function open(filtro) {
  A.open = true;
  wrap().hidden = false;
  mark();
  fechar();
  if (filtro) {
    Object.assign(A, { grupo: '', alvo: '', semAlvo: false, chamado: '', sessao: '', vista: 'tempo' }, filtro);
    if (filtro.chamado && A.dias === '1') A.dias = '30';
  }
  await carregar();
}

function close() {
  if (!A.open) return;
  A.open = false;
  wrap().hidden = true;
  fechar();
  mark();
}

function toggle() { if (A.open) close(); else open(); }

function onStripClick(e) {
  const b = e.target.closest('#strip [data-tool], #strip #btnRefresh');
  if (!b || b.dataset.tool === 'pegadas' || !A.open) return;
  if (b.dataset.tool === bs.S.tool && !$('#app').classList.contains('no-tool')) { e.stopPropagation(); e.preventDefault(); }
  close();
}

function onEscape() {
  if (A.aberto || !$('#caScreen .ca-gaveta')?.hidden) { fechar(); return; }
  close();
}

const caminhoDaAba = (tab) => (tab && !tab.virtual && tab.project && tab.path ? `${tab.project}/${tab.path}`.replace(/\\/g, '/') : '');

async function marcarEditor(tab = bs.S.active) {
  const monaco = bs.monaco;
  if (!tab?.model || !monaco) return;
  const antigas = A.decos.get(tab.model) || [];
  const caminho = caminhoDaAba(tab);
  if (!A.marcas || !caminho || tab.mode !== 'editor') { A.decos.set(tab.model, tab.model.deltaDecorations(antigas, [])); return; }
  let marcas = [];
  try { marcas = (await chamar('marcas', { caminho })).marcas; } catch { return; }
  const model = tab.model;
  if (model.isDisposed?.()) return;
  const total = model.getLineCount();
  const usadas = new Map();
  for (const m of marcas) {
    for (const l of m.linhas) {
      if (!l.texto.trim()) continue;
      let alvo = 0;
      for (let d = 0; d <= 30 && !alvo; d++) {
        for (const n of d ? [l.n - d, l.n + d] : [l.n]) {
          if (n >= 1 && n <= total && !usadas.has(n) && model.getLineContent(n) === l.texto.replace(/\r$/, '')) { alvo = n; break; }
        }
      }
      if (alvo) usadas.set(alvo, m);
    }
  }
  const decos = [...usadas.entries()].map(([n, m]) => ({
    range: new monaco.Range(n, 1, n, 1),
    options: {
      isWholeLine: true, linesDecorationsClassName: 'ca-gut', className: 'ca-linha-claude',
      hoverMessage: { value: `**Claude** ${atras(m.ts)} · ${m.acao}\n\n${(m.pedido || '').replace(/[*_`[\]<>]/g, ' ')}` },
    },
  }));
  A.decos.set(model, model.deltaDecorations(antigas, decos));
}

function limparMarcas() {
  for (const t of bs.S.tabs) {
    const antigas = t.model && A.decos.get(t.model);
    if (antigas) A.decos.set(t.model, t.model.deltaDecorations(antigas, []));
  }
}

let status = null;

function atualizarStatus(hoje) {
  if (!status) return;
  status.hidden = false;
  status.innerHTML = `${ICON.replace('class="i"', 'class="i ca-st-i"')} Claude: ${hoje.mudancas} mudança(s) hoje${hoje.sensiveis ? ` <b class="ca-st-risco">· ${hoje.sensiveis} sensível(is)</b>` : ''}`;
  status.title = `${hoje.mudancas} mudança(s) em arquivo e ${hoje.comandos} comando(s) que mexem em algo hoje. Clique para abrir a Pegadas.`;
}

function avisar(ev) {
  let box = $('#caAvisos');
  if (!box) { document.body.insertAdjacentHTML('beforeend', '<div id="caAvisos"></div>'); box = $('#caAvisos'); }
  const alvo = ev.alvos[0];
  const el = document.createElement('div');
  el.className = 'ca-aviso-card' + (ev.riscos.length ? ' risco' : '');
  el.innerHTML = `<div class="ca-av-t">${ev.riscos.length ? 'Ação sensível do Claude' : `Claude mexeu em ${esc(alvo?.nome || 'algo')}`}</div>
    <div class="ca-av-d">${esc(ev.tipo === 'arquivo' ? `${ev.acao} ${ev.rel}` : ev.titulo || curto(ev.comando, 90))}${ev.riscos.length ? ' · ' + esc(ev.riscos.join(', ')) : ''}</div>
    <div class="ca-av-b"><button type="button" class="chip ca-av-ver">Ver</button>${ev.tipo === 'arquivo' ? '<button type="button" class="chip ca-av-desfazer">Desfazer</button>' : ''}<button type="button" class="chip ca-av-x">Fechar</button></div>`;
  const sumir = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  el.querySelector('.ca-av-ver').onclick = async () => { sumir(); await open(); abrir(ev.id); };
  el.querySelector('.ca-av-desfazer')?.addEventListener('click', async () => { sumir(); await open(); previaRestaurar('antes', ev.id); });
  el.querySelector('.ca-av-x').onclick = sumir;
  box.prepend(el);
  while (box.children.length > 3) box.lastElementChild.remove();
  setTimeout(sumir, 15000);
}

async function vigiar() {
  try {
    const j = await chamar('novas', { apos: A.ultimoSeq });
    const primeira = !A.ultimoSeq;
    A.ultimoSeq = j.rev;
    atualizarStatus(j.hoje);
    if (primeira || !j.novas.length) return;
    const importantes = j.novas.filter((ev) => ev.riscos.length || ev.alvos.some((a) => a.grupo === 'extensao'));
    importantes.slice(-3).forEach(avisar);
    const ativa = caminhoDaAba(bs.S.active).toLowerCase();
    if (ativa && j.novas.some((ev) => ev.chave === ativa)) marcarEditor();
    if (A.open && !A.carregando && !$('#caScreen .ca-restaurar-form')) await carregar();
  } catch {}
}

function ligarEditor() {
  const editor = bs.editor;
  if (!editor || A.acaoEditor) return;
  A.acaoEditor = editor.addAction({
    id: 'pegadas.historico', label: 'Pegadas: histórico deste arquivo', contextMenuGroupId: 'navigation', contextMenuOrder: 9,
    run: () => { const c = caminhoDaAba(bs.S.active); if (c) abrirHistorico(c); },
  });
}

async function alternarMarcas() {
  A.marcas = !A.marcas;
  guardar();
  if (A.marcas) marcarEditor(); else limparMarcas();
  toast(A.marcas ? 'Marcas do Claude ligadas no editor' : 'Marcas do Claude desligadas', 'ok');
}

document.addEventListener('click', onStripClick, true);
status = bs.status.add({ id: 'stAtividadeClaude', title: 'Pegadas', onclick: () => open() });
plugin.data.get('escolha', null).then((e) => { if (e) Object.assign(A, e); }).catch(() => {}).finally(() => { vigiar(); marcarEditor(); });
A.timer = setInterval(vigiar, 4000);
ligarEditor();

bs.tools.register({ id: 'pegadas', title: 'Pegadas', icon: ICON, key: 'Ctrl+Alt+A', order: 64, render() {}, toggle });
bs.hooks.on('tab:activate', (tab) => { close(); marcarEditor(tab); });
bs.hooks.on('tab:save', (tab) => marcarEditor(tab));
bs.hooks.on('editor:ready', ligarEditor);
bs.hooks.on('escape', onEscape);
bs.hooks.on('project:select', close);
bs.hooks.filter('menu:file', (itens, ctx) => {
  if (!ctx || ctx.isDir || !bs.S.project) return itens;
  const caminho = bs.absPath(ctx.rel).replace(/\\/g, '/');
  return [...itens, '-', { label: 'Histórico do Claude', icon: ICON, action: () => abrirHistorico(caminho) }];
});
bs.actions.add([
  { label: 'Pegadas: abrir', k: 'Ctrl+Alt+A', run: () => open(), icon: ICON },
  { label: 'Pegadas: extensões do BlueScreen', k: '', run: () => open({ grupo: 'extensao' }), icon: ICON },
  { label: 'Pegadas: ações sensíveis', k: '', run: () => open({ sensiveis: true }), icon: ICON },
  { label: 'Pegadas: sessões e consumo', k: '', run: () => open({ vista: 'sessoes' }), icon: ICON },
  { label: 'Pegadas: histórico do arquivo aberto', k: '', run: () => { const c = caminhoDaAba(bs.S.active); if (c) abrirHistorico(c); else toast('Abra um arquivo primeiro', 'err'); }, icon: ICON },
  { label: 'Pegadas: ligar ou desligar marcas no editor', k: '', run: alternarMarcas, icon: ICON },
]);

plugin.onUnload(() => {
  document.removeEventListener('click', onStripClick, true);
  clearInterval(A.timer);
  limparMarcas();
  A.acaoEditor?.dispose();
  $('#app').classList.remove('ca-open');
  $('#caScreen')?.remove();
  $('#caAvisos')?.remove();
});

BS.pegadas = { open, close, chamar, abrirHistorico };
