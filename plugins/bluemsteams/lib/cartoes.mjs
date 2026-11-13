// Cartões adaptáveis (Adaptive Cards) do Teams montados a partir de campos simples, sem JSON na mão.
// Cada modelo declara os campos que a tela desenha e a função que vira esses campos no JSON do cartão.
// Versão 1.4 do esquema: é a que o Teams aceita no computador e no celular. Por webhook só botões que abrem link
// (Action.OpenUrl) funcionam; botão que devolve resposta ao fluxo (Action.Submit) o Teams ignora nesse caminho.

const txt = (v) => String(v ?? '').trim();
const num = (v) => (Number.isFinite(Number(v)) && txt(v) !== '' ? Number(v) : null);
const erro = (msg) => Object.assign(new Error(msg), { status: 400 });
const ehLink = (v) => /^https?:\/\/\S+$/i.test(txt(v));

export const SEVERIDADES = [
  { value: 'sev1', label: 'SEV1 · Crítico', sigla: 'SEV1', estilo: 'attention' },
  { value: 'sev2', label: 'SEV2 · Alto', sigla: 'SEV2', estilo: 'warning' },
  { value: 'sev3', label: 'SEV3 · Médio', sigla: 'SEV3', estilo: 'accent' },
  { value: 'sev4', label: 'SEV4 · Baixo', sigla: 'SEV4', estilo: 'emphasis' },
];
const ESTADOS = ['Aberto', 'Investigando', 'Mitigado', 'Resolvido'];
const RESULTADOS = [
  { value: 'ok', label: 'Sucesso', estilo: 'good', sinal: '✅' },
  { value: 'falha', label: 'Falhou', estilo: 'attention', sinal: '❌' },
  { value: 'andamento', label: 'Em andamento', estilo: 'accent', sinal: '🚀' },
  { value: 'rollback', label: 'Rollback', estilo: 'warning', sinal: '↩️' },
];
const CORES = [
  { value: 'accent', label: 'Azul' }, { value: 'good', label: 'Verde' }, { value: 'warning', label: 'Amarelo' },
  { value: 'attention', label: 'Vermelho' }, { value: 'emphasis', label: 'Cinza' },
];

// ---------- peças ----------
const bloco = (text, extra = {}) => ({ type: 'TextBlock', text: txt(text), wrap: true, ...extra });
const faixa = (estilo, itens) => ({ type: 'Container', style: estilo, bleed: true, items: itens });
const fatos = (pares) => { const f = pares.filter(([, v]) => txt(v) !== '').map(([k, v]) => ({ title: txt(k), value: txt(v) })); return f.length ? [{ type: 'FactSet', facts: f }] : []; };
const botoes = (lista) => lista.filter(([r, u]) => txt(r) && ehLink(u)).slice(0, 6).map(([r, u]) => ({ type: 'Action.OpenUrl', title: txt(r), url: txt(u) }));
function titulo(estilo, selo, texto, sub) {
  const cols = [];
  if (selo) cols.push({ type: 'Column', width: 'auto', verticalContentAlignment: 'Center', items: [bloco(selo, { weight: 'Bolder', size: 'Medium', wrap: false })] });
  cols.push({ type: 'Column', width: 'stretch', items: [bloco(texto, { weight: 'Bolder', size: 'Large' }), ...(txt(sub) ? [bloco(sub, { isSubtle: true, spacing: 'None', size: 'Small' })] : [])] });
  return faixa(estilo, [{ type: 'ColumnSet', columns: cols }]);
}

// linhas "nome = valor" (ou [{ name, value }], como o Automator manda) viram pares
export function pares(valor, sep = /\s*[=|]\s*/) {
  if (Array.isArray(valor)) return valor.map((r) => (Array.isArray(r) ? [r[0], r[1]] : [r?.name ?? r?.nome ?? r?.label ?? r?.rotulo, r?.value ?? r?.valor ?? r?.url ?? r?.link])).filter(([k]) => txt(k));
  return txt(valor).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.split(sep); return [m[0], m.slice(1).join(' = ')]; });
}
// botões: "Rótulo | https://link" (o link pode ter "=", por isso o separador aqui é só a barra)
const paresBotoes = (valor) => pares(valor, /\s*\|\s*/);

// menções: { nome, id } onde id é o e-mail (UPN) ou o id da pessoa no Entra
function comMencoes(cartao, mencoes) {
  const lista = (mencoes || []).filter((m) => txt(m?.id));
  cartao.msteams = { width: 'Full' };
  if (!lista.length) return cartao;
  cartao.body.push(bloco(lista.map((m) => `<at>${txt(m.nome) || m.id}</at>`).join(' '), { spacing: 'Medium' }));
  cartao.msteams.entities = lista.map((m) => ({ type: 'mention', text: `<at>${txt(m.nome) || m.id}</at>`, mentioned: { id: txt(m.id), name: txt(m.nome) || m.id } }));
  return cartao;
}
const casca = (body, actions) => ({ type: 'AdaptiveCard', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', version: '1.4', body, ...(actions.length ? { actions } : {}) });

// ---------- modelos ----------
export const MODELOS = [
  {
    id: 'incidente', nome: 'Alerta de incidente',
    campos: [
      { nome: 'titulo', rotulo: 'Título', obrigatorio: true, exemplo: 'API de pagamentos fora do ar' },
      { nome: 'severidade', rotulo: 'Severidade', tipo: 'select', opcoes: SEVERIDADES.map(({ value, label }) => ({ value, label })), padrao: 'sev2' },
      { nome: 'estado', rotulo: 'Estado', tipo: 'select', opcoes: ESTADOS, padrao: 'Aberto' },
      { nome: 'servico', rotulo: 'Serviço afetado', exemplo: 'checkout-api' },
      { nome: 'resumo', rotulo: 'O que está acontecendo', tipo: 'area' },
      { nome: 'responsavel', rotulo: 'Responsável' },
      { nome: 'link', rotulo: 'Link do incidente', tipo: 'link' },
      { nome: 'warroom', rotulo: 'Link da war room', tipo: 'link' },
    ],
    montar(d) {
      const sev = SEVERIDADES.find((s) => s.value === txt(d.severidade).toLowerCase()) || SEVERIDADES[1];
      const estado = txt(d.estado) || 'Aberto';
      const resolvido = /resolvid/i.test(estado);
      const body = [titulo(resolvido ? 'good' : sev.estilo, sev.sigla, txt(d.titulo) || 'Incidente', resolvido ? 'Resolvido' : `Incidente · ${estado}`)];
      if (txt(d.resumo)) body.push(bloco(d.resumo));
      body.push(...fatos([['Serviço', d.servico], ['Estado', estado], ['Responsável', d.responsavel], ['Quando', d.quando || agora()]]));
      return casca(body, botoes([['Abrir incidente', d.link], ['Entrar na war room', d.warroom]]));
    },
    resumo: (d) => `${(SEVERIDADES.find((s) => s.value === txt(d.severidade).toLowerCase()) || SEVERIDADES[1]).sigla} ${txt(d.titulo)}`,
  },
  {
    id: 'testes', nome: 'Resultado de testes',
    campos: [
      { nome: 'titulo', rotulo: 'Suíte ou execução', obrigatorio: true, exemplo: 'Regressão do checkout' },
      { nome: 'passou', rotulo: 'Passaram', tipo: 'numero' },
      { nome: 'falhou', rotulo: 'Falharam', tipo: 'numero' },
      { nome: 'ignorados', rotulo: 'Ignorados', tipo: 'numero' },
      { nome: 'ambiente', rotulo: 'Ambiente', exemplo: 'homologação' },
      { nome: 'duracao', rotulo: 'Duração', exemplo: '4 min 12 s' },
      { nome: 'detalhes', rotulo: 'Falhas (uma por linha)', tipo: 'area' },
      { nome: 'link', rotulo: 'Link do relatório', tipo: 'link' },
    ],
    montar(d) {
      const p = num(d.passou) ?? 0, f = num(d.falhou) ?? 0, i = num(d.ignorados) ?? 0, total = p + f + i;
      const ok = f === 0;
      const body = [titulo(ok ? 'good' : 'attention', ok ? '✅' : '❌', txt(d.titulo) || 'Testes', ok ? 'Todos os testes passaram' : `${f} ${f === 1 ? 'teste falhou' : 'testes falharam'}`)];
      body.push({ type: 'ColumnSet', columns: [['Passaram', p, 'Good'], ['Falharam', f, f ? 'Attention' : 'Default'], ['Ignorados', i, 'Default'], ['Total', total, 'Default']].map(([r, v, cor]) => ({ type: 'Column', width: 'stretch', items: [bloco(String(v), { size: 'ExtraLarge', weight: 'Bolder', color: cor, horizontalAlignment: 'Center', wrap: false }), bloco(r, { isSubtle: true, spacing: 'None', size: 'Small', horizontalAlignment: 'Center', wrap: false })] })) });
      body.push(...fatos([['Ambiente', d.ambiente], ['Duração', d.duracao]]));
      const falhas = txt(d.detalhes).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (falhas.length) body.push(bloco(falhas.slice(0, 10).map((l) => '- ' + l).join('\n') + (falhas.length > 10 ? `\n- … e mais ${falhas.length - 10}` : ''), { spacing: 'Medium' }));
      return casca(body, botoes([['Abrir relatório', d.link]]));
    },
    resumo: (d) => `${txt(d.titulo)}: ${num(d.passou) ?? 0} ok, ${num(d.falhou) ?? 0} falha(s)`,
  },
  {
    id: 'deploy', nome: 'Deploy',
    campos: [
      { nome: 'app', rotulo: 'Aplicação', obrigatorio: true, exemplo: 'checkout-api' },
      { nome: 'versao', rotulo: 'Versão', exemplo: '2.14.0' },
      { nome: 'ambiente', rotulo: 'Ambiente', exemplo: 'produção' },
      { nome: 'resultado', rotulo: 'Resultado', tipo: 'select', opcoes: RESULTADOS.map(({ value, label }) => ({ value, label })), padrao: 'ok' },
      { nome: 'autor', rotulo: 'Quem publicou' },
      { nome: 'notas', rotulo: 'O que mudou', tipo: 'area' },
      { nome: 'link', rotulo: 'Link do pipeline', tipo: 'link' },
    ],
    montar(d) {
      const r = RESULTADOS.find((x) => x.value === txt(d.resultado).toLowerCase()) || RESULTADOS[0];
      const nome = [txt(d.app) || 'Deploy', txt(d.versao)].filter(Boolean).join(' ');
      const body = [titulo(r.estilo, r.sinal, nome, `Deploy${txt(d.ambiente) ? ' em ' + txt(d.ambiente) : ''} · ${r.label}`)];
      body.push(...fatos([['Ambiente', d.ambiente], ['Versão', d.versao], ['Por', d.autor], ['Quando', d.quando || agora()]]));
      if (txt(d.notas)) body.push(bloco(d.notas, { spacing: 'Medium' }));
      return casca(body, botoes([['Ver pipeline', d.link]]));
    },
    resumo: (d) => `Deploy ${txt(d.app)} ${txt(d.versao)} · ${(RESULTADOS.find((x) => x.value === txt(d.resultado).toLowerCase()) || RESULTADOS[0]).label}`,
  },
  {
    id: 'aprovacao', nome: 'Pedido de aprovação',
    campos: [
      { nome: 'pergunta', rotulo: 'Pergunta', obrigatorio: true, exemplo: 'Posso publicar a versão 2.14.0 em produção?' },
      { nome: 'detalhes', rotulo: 'Detalhes', tipo: 'area' },
      { nome: 'sim', rotulo: 'Botão de aprovar', padrao: 'Aprovar' },
      { nome: 'linkSim', rotulo: 'Link de aprovar', tipo: 'link', ajuda: 'O botão só abre este link. Um fluxo do Automator com o gatilho Endpoint HTTP dá um link que registra a resposta.' },
      { nome: 'nao', rotulo: 'Botão de recusar', padrao: 'Recusar' },
      { nome: 'linkNao', rotulo: 'Link de recusar', tipo: 'link' },
      { nome: 'instrucao', rotulo: 'Como responder sem os botões', exemplo: 'Responda nesta conversa com "aprovado" ou "recusado".' },
    ],
    montar(d) {
      const body = [titulo('accent', '🗳️', txt(d.pergunta) || 'Aprovação', 'Pedido de aprovação')];
      if (txt(d.detalhes)) body.push(bloco(d.detalhes));
      if (txt(d.instrucao)) body.push(bloco(d.instrucao, { isSubtle: true, size: 'Small' }));
      return casca(body, botoes([[txt(d.sim) || 'Aprovar', d.linkSim], [txt(d.nao) || 'Recusar', d.linkNao]]));
    },
    resumo: (d) => `Aprovação: ${txt(d.pergunta)}`,
  },
  {
    id: 'livre', nome: 'Personalizado',
    campos: [
      { nome: 'titulo', rotulo: 'Título', obrigatorio: true },
      { nome: 'cor', rotulo: 'Cor da faixa', tipo: 'select', opcoes: CORES, padrao: 'accent' },
      { nome: 'texto', rotulo: 'Texto', tipo: 'area' },
      { nome: 'fatos', rotulo: 'Campos', tipo: 'pares', colunas: ['Nome', 'Valor'], adicionar: 'Campo' },
      { nome: 'botoes', rotulo: 'Botões', tipo: 'pares', colunas: ['Rótulo', 'Link (https://…)'], adicionar: 'Botão' },
    ],
    montar(d) {
      const cor = CORES.some((c) => c.value === txt(d.cor)) ? txt(d.cor) : 'accent';
      const body = [titulo(cor, '', txt(d.titulo) || 'Aviso', d.subtitulo)];
      if (txt(d.texto)) body.push(bloco(d.texto));
      body.push(...fatos(pares(d.fatos)));
      return casca(body, botoes(paresBotoes(d.botoes)));
    },
    resumo: (d) => txt(d.titulo),
  },
];

function agora() {
  return new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function modelo(id) { return MODELOS.find((m) => m.id === id) || null; }

// O cartão pronto de um modelo. Erro com a lista do que falta, em vez de mandar um cartão vazio.
export function montarCartao(id, dados = {}, mencoes = []) {
  const m = modelo(id);
  if (!m) throw erro(`Modelo de cartão desconhecido: ${id}`);
  const faltam = m.campos.filter((c) => c.obrigatorio && !txt(dados[c.nome])).map((c) => c.rotulo);
  if (faltam.length) throw erro(`Preencha: ${faltam.join(', ')}`);
  const errados = m.campos.filter((c) => c.tipo === 'link' && txt(dados[c.nome]) && !ehLink(dados[c.nome])).map((c) => c.rotulo);
  if (errados.length) throw erro(`O link precisa começar com https://: ${errados.join(', ')}`);
  return comMencoes(m.montar(dados), mencoes);
}

// Texto simples vira um cartão de um bloco só: o webhook dos Workflows publica o que vem em "attachments".
export function cartaoTexto(tituloTexto, texto, mencoes = []) {
  const body = [];
  if (txt(tituloTexto)) body.push(bloco(tituloTexto, { weight: 'Bolder', size: 'Medium' }));
  if (txt(texto)) body.push(bloco(texto));
  if (!body.length) throw erro('Escreva a mensagem.');
  return comMencoes(casca(body, []), mencoes);
}

// O corpo que o gatilho "Quando uma solicitação de webhook do Teams é recebida" espera.
export function envelope(cartao) {
  return { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: cartao }] };
}

// O que a tela precisa para desenhar o formulário de cada modelo (sem as funções).
export function modelosParaTela() {
  return MODELOS.map(({ id, nome, campos }) => ({ id, nome, campos }));
}
