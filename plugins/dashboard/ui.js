const { $, esc, toast } = bs;
const ICON = '<svg class="i" viewBox="0 0 24 24"><rect x="3.5" y="4" width="4.5" height="16" rx="1"/><rect x="9.75" y="4" width="4.5" height="11" rx="1"/><rect x="16" y="4" width="4.5" height="7" rx="1"/></svg>';
const TIPOS = [['linha', 'Linha'], ['texto', 'Texto longo'], ['data', 'Data'], ['numero', 'Número'], ['opcoes', 'Opções']];
const NO_CARTAO = [['', 'Não aparece'], ['titulo', 'Título'], ['texto', 'Texto'], ['linha', 'Linha "Rótulo: valor"'], ['selo', 'Selo no topo']];
const D = { open: false, cfg: null, items: [], rev: '', arquivo: '', arquivoConfig: '', quadro: '', busca: '', todos: false, desativados: false, aberta: null, ajuda: false, formQuadro: null, edit: null, json: false, timer: 0, arrastando: '' };

const hojeIso = () => new Date().toLocaleDateString('sv-SE');
const dias = (data) => (data ? Math.floor((Date.parse(hojeIso()) - Date.parse(data)) / 86400000) : null);
const br = (data) => (data ? data.split('-').reverse().join('/') : '');
const opcoes = (lista, atual) => lista.map((v) => `<option${v === atual ? ' selected' : ''}>${esc(v)}</option>`).join('');
const opcoesPar = (pares, atual) => pares.map(([v, r]) => `<option value="${esc(v)}"${v === (atual ?? '') ? ' selected' : ''}>${esc(r)}</option>`).join('');
const colunas = () => D.cfg.colunas;
const statusTodos = () => colunas().flatMap((c) => c.status);
const fechados = () => colunas().filter((c) => c.fechado).flatMap((c) => c.status);
const colunaDe = (status) => colunas().find((c) => c.status.includes(status)) || colunas()[0];
const quadroAtual = () => D.cfg.quadros.find((q) => q.id === D.quadro) || D.cfg.quadros[0];
const camposDo = (aba) => D.cfg.campos.filter((c) => !c.quadros?.length || c.quadros.includes(aba));
const ordenador = () => D.cfg.campos.find((c) => c.ordena && c.tipo === 'opcoes');

async function chamar(rota, corpo) {
  const opt = corpo === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) };
  const j = await bs.api('dashboard/' + rota, {}, opt);
  if (!j || !j.ok) throw new Error((j && j.erro) || 'Falhou: ' + rota);
  return j;
}

function wrap() {
  let el = $('#dbScreen');
  if (el) return el;
  $('#app').insertAdjacentHTML('beforeend', '<div id="dbScreen" class="island" hidden><div class="db-main"></div><aside class="db-gaveta" hidden></aside></div>');
  return $('#dbScreen');
}

async function carregar() {
  const raiz = $('#dbScreen .db-main');
  if (!D.cfg) raiz.innerHTML = '<div class="db-espera"><h3>Carregando o Dashboard…</h3></div>';
  let ultimoErro = '';
  for (let i = 0; i < 20; i++) {
    try {
      const j = await chamar('dados');
      Object.assign(D, { cfg: j.config, items: j.items, rev: j.rev, arquivo: j.arquivo, arquivoConfig: j.arquivoConfig });
      if (!D.cfg.quadros.some((q) => q.id === D.quadro)) D.quadro = D.cfg.quadros[0].id;
      render();
      return;
    } catch (err) { ultimoErro = err.message; await new Promise((r) => setTimeout(r, 500)); }
  }
  raiz.innerHTML = `<div class="db-espera"><h3>O Dashboard não respondeu</h3><p class="db-erro">${esc(ultimoErro)}</p><button type="button" class="chip primary db-tentar">Tentar de novo</button></div>`;
  raiz.querySelector('.db-tentar').onclick = carregar;
}

async function vigiar() {
  if (!D.open || D.arrastando || D.edit) return;
  try {
    const { rev } = await chamar('rev');
    if (rev !== D.rev && !$('#dbScreen .db-gaveta form.sujo')) await carregar();
  } catch {}
}

function visiveis() {
  const termo = D.busca.trim().toLowerCase();
  const busca = ['numero', ...D.cfg.campos.filter((c) => c.busca).map((c) => c.id)];
  return D.items.filter((i) => i.aba === D.quadro && Boolean(i.desativado) === D.desativados).filter((i) => {
    if (!termo) return true;
    return busca.some((k) => String(i[k] || '').toLowerCase().includes(termo));
  });
}

function peso(i) {
  const c = ordenador();
  if (!c) return 9;
  const n = c.opcoes.indexOf(i[c.id]);
  return n < 0 ? 9 : n;
}

function cartao(i) {
  const fechado = fechados().includes(i.status);
  const parado = !fechado && D.cfg.diasParado > 0 && dias(i.dataAtualizacao || i.dataAbertura) > D.cfg.diasParado;
  const campos = camposDo(i.aba).filter((c) => c.cartao && i[c.id]);
  const de = (tipo) => campos.filter((c) => c.cartao === tipo);
  const p = peso(i);
  return `<article class="db-cartao${i.desativado ? ' desativado' : ''}" draggable="true" data-id="${esc(i.id)}"${p < 9 ? ` data-peso="${Math.min(p, 3)}"` : ''}>
    <header><span class="db-num">${esc(i.numero)}</span><span class="db-selos">${de('selo').map((c) => `<span class="db-crit" title="${esc(c.rotulo)}">${esc(i[c.id])}</span>`).join('')}</span></header>
    ${de('titulo').map((c) => `<strong class="db-assunto">${esc(i[c.id])}</strong>`).join('')}
    ${de('texto').map((c) => `<p class="db-desc">${esc(i[c.id])}</p>`).join('')}
    ${fechado ? '' : de('linha').map((c) => `<p class="db-prox"><span>${esc(c.rotulo)}:</span> ${esc(i[c.id])}</p>`).join('')}
    <footer><span>${esc(i.status)}</span>${parado ? `<span class="db-parado" title="Sem andamento há mais de ${D.cfg.diasParado} dias">parado há ${dias(i.dataAtualizacao || i.dataAbertura)} d</span>` : `<span>${br(i.dataAtualizacao || i.dataAbertura)}</span>`}</footer>
  </article>`;
}

function colunasHtml() {
  const lista = visiveis();
  const limite = D.cfg.diasConcluido;
  return colunas().map((c) => {
    let itens = lista.filter((i) => colunaDe(i.status).id === c.id);
    let escondidos = 0;
    if (c.fechado && limite > 0 && !D.todos && !D.busca) {
      const recentes = itens.filter((i) => (dias(i.dataEncerramento || i.dataAtualizacao) ?? 0) <= limite);
      escondidos = itens.length - recentes.length;
      itens = recentes;
    }
    itens.sort((a, b) => peso(a) - peso(b) || String(b.dataAtualizacao || b.dataAbertura).localeCompare(String(a.dataAtualizacao || a.dataAbertura)));
    return `<section class="db-coluna" data-coluna="${esc(c.id)}">
      <header title="${esc(c.ajuda)}"><h3>${esc(c.nome)}</h3><span class="db-qtd">${itens.length}</span></header>
      ${c.ajuda ? `<p class="db-col-ajuda">${esc(c.ajuda)}</p>` : ''}
      <div class="db-lista">${itens.map(cartao).join('') || '<p class="db-vazio">Nada aqui</p>'}</div>
      ${escondidos ? `<button type="button" class="db-mais">+ ${escondidos} fechada(s) há mais de ${limite} dias</button>` : ''}
    </section>`;
  }).join('');
}

function ajudaHtml() {
  const c = D.cfg;
  const ord = ordenador();
  return `<section class="db-ajuda">
    <header><h2>Como o Dashboard funciona</h2><button type="button" class="chip db-fechar-ajuda">Fechar</button></header>
    <div class="db-ajuda-grade">
      <div><h4>Quadros</h4><p>Cada quadro é uma frente de trabalho. <b>+ Quadro</b> cria um; <b>Configurar</b> renomeia, reordena, protege contra exclusão e remove.</p></div>
      <div><h4>Tarefas</h4><p>Cada cartão é uma tarefa. Sem ${esc(c.numeracao.rotulo.toLowerCase())}, ela ganha ${esc(c.numeracao.prefixo)}-${'0'.repeat(c.numeracao.digitos - 1)}1 em diante. Clique para abrir; <b>+ Tarefa</b> cria no quadro aberto.</p></div>
      <div><h4>Colunas</h4><ul>${c.colunas.map((x) => `<li><b>${esc(x.nome)}</b>${x.ajuda ? ': ' + esc(x.ajuda) : ''} <span class="db-mute">(${esc(x.status.join(', '))})</span></li>`).join('')}</ul></div>
      <div><h4>Mover</h4><p>Arraste o cartão para outra coluna: o status vira o primeiro da coluna e a troca entra no histórico. Para um status específico, abra a tarefa e escolha.</p></div>
      <div><h4>Campos</h4><p>Os campos do formulário e do cartão vêm da configuração: tipo, opções, valor padrão, se aparece na criação, no cartão, na busca e em quais quadros.${ord ? ` <b>${esc(ord.rotulo)}</b> ordena a coluna e colore a borda do cartão.` : ''}</p></div>
      <div><h4>Andamento e histórico</h4><p>Escreva em <b>Andamento</b> o que foi feito. Cada envio vira uma linha datada no histórico.${c.diasParado ? ` Sem andamento há mais de ${c.diasParado} dias, o cartão ganha o selo <b>parado</b>.` : ''}</p></div>
      <div><h4>Onde ficam os dados</h4><p>Tarefas em <span class="db-mono">${esc(D.arquivo)}</span>, com backup diário na pasta <span class="db-mono">backups</span>. Configuração em <span class="db-mono">${esc(D.arquivoConfig)}</span>. Quem gravar no arquivo aparece aqui em poucos segundos.</p></div>
      <div><h4>Agentes</h4><p>As rotas estão em <span class="db-mono">GET /api/dashboard/ajuda</span>.</p></div>
    </div>
  </section>`;
}

function formQuadroHtml() {
  const q = D.formQuadro;
  return `<form class="db-form-quadro">
    <label class="db-ctl"><span>Nome</span><input name="nome" value="${esc(q.nome || '')}" placeholder="ex.: Ferramentas, Estudos, Melhorias"></label>
    <label class="db-ctl db-grow"><span>Para que serve</span><input name="descricao" value="${esc(q.descricao || '')}" placeholder="O que entra neste quadro"></label>
    <button type="submit" class="chip primary">${q.id ? 'Salvar' : 'Criar quadro'}</button>
    ${q.id && !q.protegido ? '<button type="button" class="chip db-excluir-quadro">Excluir quadro</button>' : ''}
    <button type="button" class="chip db-cancelar-quadro">Cancelar</button>
  </form>`;
}

function render() {
  const raiz = $('#dbScreen .db-main');
  if (D.edit) { renderConfig(raiz); return; }
  const q = quadroAtual();
  const abertos = (id) => D.items.filter((i) => i.aba === id && !i.desativado && !fechados().includes(i.status)).length;
  raiz.innerHTML = `
    <header class="db-topo">
      <h1>${esc(D.cfg.titulo)}</h1><span class="db-sub">${esc(D.cfg.subtitulo)}</span>
      <button type="button" class="chip db-btn-ajuda">${D.ajuda ? 'Fechar ajuda' : 'Como funciona'}</button>
      <button type="button" class="chip db-btn-config">Configurar</button>
    </header>
    <nav class="db-quadros" role="tablist">
      ${D.cfg.quadros.map((x) => `<button type="button" class="db-quadro${x.id === D.quadro ? ' on' : ''}" data-quadro="${esc(x.id)}" title="${esc(x.descricao || '')}">${esc(x.nome)}<span class="db-qtd">${abertos(x.id)}</span></button>`).join('')}
      <button type="button" class="db-quadro db-novo-quadro" title="Criar um quadro novo">+ Quadro</button>
    </nav>
    ${D.ajuda ? ajudaHtml() : ''}
    ${D.formQuadro ? formQuadroHtml() : `<p class="db-desc-quadro">${esc(q?.descricao || 'Sem descrição.')} <button type="button" class="db-link db-editar-quadro">editar</button></p>`}
    <div class="db-barra">
      <label class="db-ctl db-grow"><span>Procurar</span><input name="busca" value="${esc(D.busca)}" placeholder="${esc(D.cfg.numeracao.rotulo.toLowerCase())} ou texto" spellcheck="false"></label>
      <label class="db-check"><input type="checkbox" name="todos"${D.todos ? ' checked' : ''}> mostrar todas as fechadas</label>
      <label class="db-check"><input type="checkbox" name="desativados"${D.desativados ? ' checked' : ''}> ver desativadas</label>
      <button type="button" class="chip primary db-nova">+ Tarefa</button>
    </div>
    <div class="db-colunas" style="--db-ncol:${colunas().length}">${colunasHtml()}</div>`;
  ligar(raiz);
}

function ligar(raiz) {
  raiz.querySelector('.db-btn-ajuda').onclick = () => { D.ajuda = !D.ajuda; render(); };
  raiz.querySelector('.db-btn-config').onclick = abrirConfig;
  raiz.querySelector('.db-fechar-ajuda')?.addEventListener('click', () => { D.ajuda = false; render(); });
  raiz.querySelectorAll('.db-quadro[data-quadro]').forEach((b) => { b.onclick = () => { D.quadro = b.dataset.quadro; D.formQuadro = null; guardarEscolha(); render(); }; });
  raiz.querySelector('.db-novo-quadro').onclick = () => { D.formQuadro = {}; render(); raiz.querySelector('.db-form-quadro input[name="nome"]').focus(); };
  raiz.querySelector('.db-editar-quadro')?.addEventListener('click', () => { D.formQuadro = { ...quadroAtual() }; render(); });
  const fq = raiz.querySelector('.db-form-quadro');
  if (fq) {
    fq.onsubmit = (e) => { e.preventDefault(); salvarQuadro(new FormData(fq)); };
    fq.querySelector('.db-cancelar-quadro').onclick = () => { D.formQuadro = null; render(); };
    fq.querySelector('.db-excluir-quadro')?.addEventListener('click', excluirQuadro);
  }
  const busca = raiz.querySelector('input[name="busca"]');
  busca.oninput = () => { D.busca = busca.value; raiz.querySelector('.db-colunas').innerHTML = colunasHtml(); ligarColunas(raiz); };
  raiz.querySelector('input[name="todos"]').onchange = (e) => { D.todos = e.target.checked; render(); };
  raiz.querySelector('input[name="desativados"]').onchange = (e) => { D.desativados = e.target.checked; render(); };
  raiz.querySelector('.db-nova').onclick = () => abrirTarefa(null);
  ligarColunas(raiz);
}

function ligarColunas(raiz) {
  raiz.querySelectorAll('.db-cartao').forEach((c) => {
    c.onclick = () => abrirTarefa(c.dataset.id);
    c.ondragstart = (e) => { D.arrastando = c.dataset.id; e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('arrastando'); };
    c.ondragend = () => { D.arrastando = ''; c.classList.remove('arrastando'); };
  });
  raiz.querySelectorAll('.db-coluna').forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add('alvo'); };
    col.ondragleave = () => col.classList.remove('alvo');
    col.ondrop = (e) => { e.preventDefault(); col.classList.remove('alvo'); mover(e.dataTransfer.getData('text/plain'), col.dataset.coluna); };
  });
  raiz.querySelector('.db-mais')?.addEventListener('click', () => { D.todos = true; render(); });
}

async function salvar(pedido, mensagem) {
  const j = await chamar('item', pedido);
  const i = D.items.findIndex((x) => x.id === j.item.id);
  if (i >= 0) D.items[i] = j.item; else D.items.push(j.item);
  D.rev = j.rev;
  toast(mensagem || `${j.item.numero} ${j.criado ? 'criada' : 'salva'}`, 'ok');
  return j.item;
}

async function mover(id, colunaId) {
  const item = D.items.find((x) => x.id === id);
  const col = colunas().find((c) => c.id === colunaId);
  if (!item || !col || col.status.includes(item.status)) return;
  try {
    await salvar({ id, campos: { status: col.status[0] } }, `${item.numero}: ${col.status[0]}`);
    render();
  } catch (err) { toast('Erro: ' + err.message, 'err'); }
}

async function salvarQuadro(fd) {
  try {
    const corpo = { id: D.formQuadro.id, nome: fd.get('nome') ?? D.formQuadro.nome, descricao: fd.get('descricao') };
    const { quadro } = await chamar('quadro', corpo);
    D.formQuadro = null;
    D.quadro = quadro.id;
    guardarEscolha();
    await carregar();
    toast(`Quadro ${quadro.nome} salvo`, 'ok');
  } catch (err) { toast('Erro: ' + err.message, 'err'); }
}

async function excluirQuadro() {
  const q = D.formQuadro;
  if (!confirm(`Excluir o quadro "${q.nome}"? Só dá se ele estiver vazio.`)) return;
  try {
    await chamar('quadro-excluir', { id: q.id });
    D.formQuadro = null;
    D.quadro = '';
    await carregar();
    guardarEscolha();
    toast('Quadro excluído', 'ok');
  } catch (err) { toast('Erro: ' + err.message, 'err'); }
}

function campoHtml(c, item) {
  const v = item[c.id] ?? '';
  let ctl;
  if (c.tipo === 'texto') ctl = `<textarea name="${esc(c.id)}" rows="${c.cartao === 'texto' ? 4 : 2}">${esc(v)}</textarea>`;
  else if (c.tipo === 'opcoes') ctl = `<select name="${esc(c.id)}"><option value=""${v ? '' : ' selected'}>—</option>${opcoes(c.opcoes.includes(v) || !v ? c.opcoes : [v, ...c.opcoes], v)}</select>`;
  else if (c.tipo === 'data') ctl = `<input type="date" name="${esc(c.id)}" value="${esc(v)}">`;
  else if (c.tipo === 'numero') ctl = `<input type="number" name="${esc(c.id)}" value="${esc(v)}">`;
  else ctl = `<input name="${esc(c.id)}" value="${esc(v)}" spellcheck="false">`;
  return `<label class="db-campo"><span>${esc(c.rotulo)}</span>${ctl}${c.ajuda ? `<small>${esc(c.ajuda)}</small>` : ''}</label>`;
}

function abrirTarefa(id) {
  const g = $('#dbScreen .db-gaveta');
  const novo = { aba: D.quadro, status: colunas()[0].status[0] };
  for (const c of D.cfg.campos) novo[c.id] = c.padrao ?? '';
  const item = id ? D.items.find((x) => x.id === id) : novo;
  if (!item) return;
  D.aberta = id;
  const campos = camposDo(item.aba).filter((c) => id || c.criacao);
  const st = statusTodos();
  const n = D.cfg.numeracao;
  g.innerHTML = `<form class="db-tarefa">
    <header><h2>${id ? esc(item.numero) : 'Nova tarefa'}</h2><button type="button" class="chip db-fechar">Fechar</button></header>
    <label class="db-campo"><span>Quadro</span><select name="aba">${D.cfg.quadros.map((q) => `<option value="${esc(q.id)}"${q.id === item.aba ? ' selected' : ''}>${esc(q.nome)}</option>`).join('')}</select><small>Mudar aqui move a tarefa de quadro.</small></label>
    <label class="db-campo"><span>${esc(n.rotulo)}</span><input name="numero" value="${esc(item.numero || '')}" spellcheck="false"${id ? ' disabled' : ''}>${n.ajuda ? `<small>${esc(n.ajuda)}</small>` : ''}</label>
    <label class="db-campo"><span>Status</span><select name="status">${opcoes(st.includes(item.status) || !item.status ? st : [item.status, ...st], item.status)}</select><small>Decide a coluna. Arrastar o cartão também troca o status.</small></label>
    ${campos.map((c) => campoHtml(c, item)).join('')}
    ${id ? `<label class="db-campo"><span>Andamento</span><textarea name="andamento" rows="3" placeholder="O que foi feito ou descoberto agora"></textarea><small>Vira uma linha datada no histórico.</small></label>` : ''}
    <div class="db-acoes"><button type="submit" class="chip primary">${id ? 'Salvar' : 'Criar tarefa'}</button>${id ? `<button type="button" class="chip db-desativar">${item.desativado ? 'Reativar' : 'Desativar'}</button><button type="button" class="chip db-excluir">Excluir</button>${window.BS.pegadas ? '<button type="button" class="chip db-atividade" title="O que o Claude fez nesta tarefa">Pegadas</button>' : ''}` : ''}</div>
    ${id && item.historico?.length ? `<section class="db-historico"><h3>Histórico</h3><ol>${[...item.historico].reverse().map((h) => `<li><time>${br(h.data)}</time><p>${esc(h.texto)}</p></li>`).join('')}</ol></section>` : ''}
  </form>`;
  g.hidden = false;
  const f = g.querySelector('form');
  f.oninput = () => f.classList.add('sujo');
  f.querySelector('.db-fechar').onclick = fecharTarefa;
  f.querySelector('.db-excluir')?.addEventListener('click', () => excluirTarefa(item));
  f.querySelector('.db-desativar')?.addEventListener('click', () => alternarAtivo(item));
  f.querySelector('.db-atividade')?.addEventListener('click', () => { close(); BS.pegadas.open({ chamado: String(item.numero).toUpperCase() }); });
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const camposEnviados = {};
    for (const [k, v] of fd.entries()) if (k !== 'andamento') camposEnviados[k] = v;
    try {
      const salvo = await salvar({ id: id || undefined, campos: camposEnviados, andamento: fd.get('andamento') || '' });
      if (salvo.aba !== D.quadro) { D.quadro = salvo.aba; guardarEscolha(); }
      render();
      abrirTarefa(salvo.id);
    } catch (err) { toast('Erro: ' + err.message, 'err'); }
  };
  (f.querySelector(id ? 'textarea[name="andamento"]' : '[name]:not([name="aba"]):not([disabled])') || f.querySelector('input')).focus();
}

function fecharTarefa() {
  D.aberta = null;
  const g = $('#dbScreen .db-gaveta');
  g.hidden = true;
  g.innerHTML = '';
}

async function excluirTarefa(item) {
  if (!confirm(`Excluir ${item.numero} de vez? O backup do dia guarda a versão anterior.`)) return;
  try {
    const j = await chamar('item-excluir', { id: item.id });
    D.items = D.items.filter((x) => x.id !== item.id);
    D.rev = j.rev;
    fecharTarefa();
    render();
    toast(`${item.numero} excluída`, 'ok');
  } catch (err) { toast('Erro: ' + err.message, 'err'); }
}

async function alternarAtivo(item) {
  try {
    await salvar({ id: item.id, campos: { desativado: !item.desativado } }, `${item.numero} ${item.desativado ? 'reativada' : 'desativada'}`);
    fecharTarefa();
    render();
  } catch (err) { toast('Erro: ' + err.message, 'err'); }
}

function abrirConfig() {
  fecharTarefa();
  D.edit = structuredClone(D.cfg);
  for (const k of ['quadros', 'colunas', 'campos']) D.edit[k].forEach((x) => { x._salvo = true; });
  D.json = false;
  D.ajuda = false;
  D.formQuadro = null;
  render();
}

const ctlTexto = (k, v, attrs = '') => `<input data-k="${k}" value="${esc(v ?? '')}" spellcheck="false"${attrs}>`;
const ctlCheck = (k, v, rotulo) => `<label class="db-check"><input type="checkbox" data-k="${k}"${v ? ' checked' : ''}> ${esc(rotulo)}</label>`;
const ctlLista = (k, v, ph) => `<input data-k="${k}" data-lista value="${esc((v || []).join(', '))}" placeholder="${esc(ph)}" spellcheck="false">`;
const rotulado = (rotulo, ctl, cls = '') => `<label class="db-ctl${cls}"><span>${esc(rotulo)}</span>${ctl}</label>`;

function botoesLinha(sec, i, total) {
  return `<span class="db-cfg-mov">
    <button type="button" class="chip" data-acao="subir" data-sec="${sec}" data-i="${i}" title="Subir"${i === 0 ? ' disabled' : ''}>↑</button>
    <button type="button" class="chip" data-acao="descer" data-sec="${sec}" data-i="${i}" title="Descer"${i === total - 1 ? ' disabled' : ''}>↓</button>
    <button type="button" class="chip" data-acao="remover" data-sec="${sec}" data-i="${i}" title="Remover">Remover</button>
  </span>`;
}

function cfgQuadros(e) {
  return e.quadros.map((q, i) => `<div class="db-cfg-linha">
    ${rotulado('Nome', ctlTexto(`quadros.${i}.nome`, q.nome))}
    ${rotulado('Id', ctlTexto(`quadros.${i}.id`, q.id, q._salvo ? ' disabled' : ' placeholder="vem do nome"'))}
    ${rotulado('Para que serve', ctlTexto(`quadros.${i}.descricao`, q.descricao), ' db-grow')}
    ${ctlCheck(`quadros.${i}.protegido`, q.protegido, 'protegido')}
    ${botoesLinha('quadros', i, e.quadros.length)}
  </div>`).join('');
}

function cfgColunas(e) {
  return e.colunas.map((c, i) => `<div class="db-cfg-linha">
    ${rotulado('Nome', ctlTexto(`colunas.${i}.nome`, c.nome))}
    ${rotulado('Status (o 1º é o do arrastar)', ctlLista(`colunas.${i}.status`, c.status, 'separados por vírgula'), ' db-grow')}
    ${rotulado('Ajuda', ctlTexto(`colunas.${i}.ajuda`, c.ajuda), ' db-grow')}
    ${ctlCheck(`colunas.${i}.fechado`, c.fechado, 'fecha a tarefa')}
    ${botoesLinha('colunas', i, e.colunas.length)}
  </div>`).join('');
}

function cfgCampos(e) {
  return e.campos.map((c, i) => `<div class="db-cfg-linha db-cfg-campo">
    ${rotulado('Rótulo', ctlTexto(`campos.${i}.rotulo`, c.rotulo))}
    ${rotulado('Id', ctlTexto(`campos.${i}.id`, c.id, c._salvo ? ' disabled' : ' placeholder="vem do rótulo"'))}
    ${rotulado('Tipo', `<select data-k="campos.${i}.tipo" data-redesenha>${opcoesPar(TIPOS, c.tipo)}</select>`)}
    ${c.tipo === 'opcoes' ? rotulado('Opções (em ordem)', ctlLista(`campos.${i}.opcoes`, c.opcoes, 'separadas por vírgula'), ' db-grow') : ''}
    ${rotulado('Padrão', ctlTexto(`campos.${i}.padrao`, c.padrao))}
    ${rotulado('No cartão', `<select data-k="campos.${i}.cartao">${opcoesPar(NO_CARTAO, c.cartao)}</select>`)}
    ${rotulado('Ajuda', ctlTexto(`campos.${i}.ajuda`, c.ajuda), ' db-grow')}
    <span class="db-cfg-checks">
      ${ctlCheck(`campos.${i}.criacao`, c.criacao, 'na criação')}
      ${ctlCheck(`campos.${i}.busca`, c.busca, 'na busca')}
      ${c.tipo === 'opcoes' ? ctlCheck(`campos.${i}.ordena`, c.ordena, 'ordena e colore') : ''}
    </span>
    <span class="db-cfg-checks" title="Nenhum marcado: aparece em todos os quadros">
      <span class="db-mute">Quadros:</span>
      ${e.quadros.map((q) => `<label class="db-check"><input type="checkbox" data-quadro-de="${i}" value="${esc(q.id)}"${c.quadros?.includes(q.id) ? ' checked' : ''}> ${esc(q.nome)}</label>`).join('')}
    </span>
    ${botoesLinha('campos', i, e.campos.length)}
  </div>`).join('');
}

function renderConfig(raiz) {
  const e = D.edit;
  const n = e.numeracao;
  const json = JSON.stringify(limpo(e), null, 2);
  raiz.innerHTML = `
    <header class="db-topo">
      <h1>Configurar</h1><span class="db-sub">${esc(D.arquivoConfig)}</span>
      <button type="button" class="chip db-cfg-json">${D.json ? 'Editar nos campos' : 'Editar como JSON'}</button>
      <button type="button" class="chip db-cfg-cancelar">Cancelar</button>
      <button type="button" class="chip primary db-cfg-salvar">Salvar</button>
    </header>
    <div class="db-cfg">
      ${D.json ? `<textarea class="db-cfg-texto" spellcheck="false">${esc(json)}</textarea>` : `
      <section><h2>Geral</h2><div class="db-cfg-linha">
        ${rotulado('Título', ctlTexto('titulo', e.titulo))}
        ${rotulado('Subtítulo', ctlTexto('subtitulo', e.subtitulo), ' db-grow')}
        ${rotulado('Arquivo das tarefas', ctlTexto('arquivo', e.arquivo, ' placeholder="vazio: tarefas.json na pasta do plugin"'), ' db-grow')}
      </div><div class="db-cfg-linha">
        ${rotulado('Rótulo do número', ctlTexto('numeracao.rotulo', n.rotulo))}
        ${rotulado('Ajuda do número', ctlTexto('numeracao.ajuda', n.ajuda), ' db-grow')}
        ${rotulado('Prefixo automático', ctlTexto('numeracao.prefixo', n.prefixo))}
        ${rotulado('Dígitos', ctlTexto('numeracao.digitos', n.digitos, ' type="number" min="1" max="8"'))}
        ${rotulado('Selo "parado" após (dias, 0 = nunca)', ctlTexto('diasParado', e.diasParado, ' type="number" min="0"'))}
        ${rotulado('Esconder fechadas após (dias, 0 = nunca)', ctlTexto('diasConcluido', e.diasConcluido, ' type="number" min="0"'))}
      </div></section>
      <section><h2>Quadros</h2>${cfgQuadros(e)}<button type="button" class="chip" data-acao="adicionar" data-sec="quadros">+ Quadro</button></section>
      <section><h2>Colunas</h2><p class="db-mute">Cada coluna junta um ou mais status. Coluna que fecha a tarefa grava a data de encerramento.</p>${cfgColunas(e)}<button type="button" class="chip" data-acao="adicionar" data-sec="colunas">+ Coluna</button></section>
      <section><h2>Campos da tarefa</h2><p class="db-mute">${esc(n.rotulo)}, Quadro e Status são fixos. Remover um campo daqui não apaga o valor já gravado nas tarefas.</p>${cfgCampos(e)}<button type="button" class="chip" data-acao="adicionar" data-sec="campos">+ Campo</button></section>`}
    </div>`;
  ligarConfig(raiz);
}

function limpo(e) {
  return JSON.parse(JSON.stringify(e, (k, v) => (k === '_salvo' ? undefined : v)));
}

function definir(obj, caminho, valor) {
  const partes = caminho.split('.');
  const ultimo = partes.pop();
  const alvo = partes.reduce((o, p) => o[p], obj);
  alvo[ultimo] = valor;
}

function ligarConfig(raiz) {
  raiz.querySelector('.db-cfg-cancelar').onclick = () => { D.edit = null; render(); };
  raiz.querySelector('.db-cfg-salvar').onclick = salvarConfig;
  raiz.querySelector('.db-cfg-json').onclick = () => {
    if (D.json && !lerJson(raiz)) return;
    D.json = !D.json;
    render();
  };
  raiz.querySelectorAll('[data-k]').forEach((el) => {
    const evento = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evento, () => {
      const v = el.type === 'checkbox' ? el.checked : el.hasAttribute('data-lista') ? el.value.split(',').map((x) => x.trim()).filter(Boolean) : el.value;
      definir(D.edit, el.dataset.k, v);
      if (el.hasAttribute('data-redesenha')) render();
    });
  });
  raiz.querySelectorAll('[data-quadro-de]').forEach((el) => {
    el.onchange = () => {
      const c = D.edit.campos[Number(el.dataset.quadroDe)];
      const marcados = [...raiz.querySelectorAll(`[data-quadro-de="${el.dataset.quadroDe}"]:checked`)].map((x) => x.value);
      if (marcados.length) c.quadros = marcados; else delete c.quadros;
    };
  });
  raiz.querySelectorAll('[data-acao]').forEach((b) => {
    b.onclick = () => {
      const lista = D.edit[b.dataset.sec];
      const i = Number(b.dataset.i);
      if (b.dataset.acao === 'adicionar') lista.push(novoDe(b.dataset.sec));
      else if (b.dataset.acao === 'remover') lista.splice(i, 1);
      else {
        const j = b.dataset.acao === 'subir' ? i - 1 : i + 1;
        [lista[i], lista[j]] = [lista[j], lista[i]];
      }
      render();
    };
  });
}

function novoDe(sec) {
  if (sec === 'quadros') return { nome: '', descricao: '', protegido: false };
  if (sec === 'colunas') return { nome: '', ajuda: '', status: [], fechado: false };
  return { rotulo: '', tipo: 'linha', ajuda: '', criacao: true, cartao: '', busca: false };
}

function lerJson(raiz) {
  try {
    const salvos = (k) => new Set(D.edit[k].filter((x) => x._salvo).map((x) => x.id));
    const marcas = { quadros: salvos('quadros'), colunas: salvos('colunas'), campos: salvos('campos') };
    const e = JSON.parse(raiz.querySelector('.db-cfg-texto').value);
    for (const k of ['quadros', 'colunas', 'campos']) {
      if (!Array.isArray(e[k])) throw new Error(`"${k}" precisa ser uma lista`);
      e[k].forEach((x) => { if (marcas[k].has(x.id)) x._salvo = true; });
    }
    e.numeracao ??= {};
    D.edit = e;
    return true;
  } catch (err) { toast('JSON inválido: ' + err.message, 'err'); return false; }
}

async function salvarConfig() {
  const raiz = $('#dbScreen .db-main');
  if (D.json && !lerJson(raiz)) return;
  try {
    const { config } = await chamar('config', { config: limpo(D.edit) });
    D.edit = null;
    D.cfg = config;
    await carregar();
    toast('Configuração salva', 'ok');
  } catch (err) { toast('Erro: ' + err.message, 'err'); }
}

function guardarEscolha() {
  plugin.data.set('escolha', { quadro: D.quadro }).catch(() => {});
}

function mark() {
  const b = $('#strip [data-tool="dashboard"]');
  if (b) b.classList.toggle('on', D.open);
  $('#app').classList.toggle('db-open', D.open);
}

async function open(quadro) {
  D.open = true;
  wrap().hidden = false;
  mark();
  if (!quadro && !D.cfg) {
    try { quadro = (await plugin.data.get('escolha', null))?.quadro; } catch {}
  }
  if (quadro) D.quadro = quadro;
  await carregar();
}

function close() {
  if (!D.open) return;
  D.open = false;
  D.edit = null;
  wrap().hidden = true;
  fecharTarefa();
  mark();
}

function toggle() { if (D.open) close(); else open(); }

function onStripClick(e) {
  const b = e.target.closest('#strip [data-tool], #strip #btnRefresh');
  if (!b || b.dataset.tool === 'dashboard' || !D.open) return;
  if (b.dataset.tool === bs.S.tool && !$('#app').classList.contains('no-tool')) { e.stopPropagation(); e.preventDefault(); }
  close();
}

function onEscape() {
  if (D.aberta !== null || !$('#dbScreen .db-gaveta')?.hidden) { fecharTarefa(); return; }
  if (D.edit) { D.edit = null; render(); return; }
  close();
}

document.addEventListener('click', onStripClick, true);
D.timer = setInterval(vigiar, 4000);

bs.tools.register({ id: 'dashboard', title: 'Dashboard: quadros e tarefas', icon: ICON, key: 'Ctrl+Alt+B', order: 63, render() {}, toggle });
bs.hooks.on('tab:activate', close);
bs.hooks.on('escape', onEscape);
bs.hooks.on('project:select', close);
bs.actions.add([
  { label: 'Dashboard: abrir', k: 'Ctrl+Alt+B', run: () => open(), icon: ICON },
  { label: 'Dashboard: nova tarefa', k: '', run: async () => { await open(); abrirTarefa(null); }, icon: ICON },
  { label: 'Dashboard: configurar', k: '', run: async () => { await open(); abrirConfig(); }, icon: ICON },
]);

plugin.onUnload(() => {
  document.removeEventListener('click', onStripClick, true);
  clearInterval(D.timer);
  $('#app').classList.remove('db-open');
  const el = $('#dbScreen');
  if (el) el.remove();
  for (const k of ['open', 'close', 'chamar', 'abrirNumero']) delete BS.dashboard[k];
});

async function abrirNumero(numero) {
  await open();
  const item = D.items.find((i) => String(i.numero).toUpperCase() === String(numero).toUpperCase());
  if (!item) return false;
  if (item.aba !== D.quadro) { D.quadro = item.aba; guardarEscolha(); render(); }
  abrirTarefa(item.id);
  return true;
}

Object.assign(BS.dashboard, { open, close, chamar, abrirNumero });
