// Testes da lógica pura do BlueMSTeamsAutomator (sem rede, sem conta): node tests/logica.test.mjs
import assert from 'node:assert/strict';
import { emails, lerLink, linkChat, linkChamada, paraApp, ehLinkTeams } from '../lib/links.mjs';
import { montarCartao, cartaoTexto, envelope, modelosParaTela, pares } from '../lib/cartoes.mjs';
import { filtrarNovas } from '../lib/novas.mjs';

let ok = 0;
const caso = (nome, fn) => { try { fn(); ok++; } catch (e) { console.error('✗ ' + nome + '\n  ' + e.message); process.exitCode = 1; } };

// ---------- links ----------
caso('emails: separa, limpa e tira repetidos', () => {
  assert.deepEqual(emails('ana@empresa.com, <joao@empresa.com>; ANA@empresa.com  lixo'), ['ana@empresa.com', 'joao@empresa.com']);
  assert.deepEqual(emails(['x@y.com', 'sem-arroba']), ['x@y.com']);
  assert.deepEqual(emails(''), []);
});
caso('lerLink: canal', () => {
  const l = lerLink('https://teams.microsoft.com/l/channel/19%3Aabc%40thread.tacv2/Incidentes?groupId=1f0c&tenantId=t');
  assert.deepEqual(l, { tipo: 'canal', teamId: '1f0c', channelId: '19:abc@thread.tacv2', nome: 'Incidentes' });
});
caso('lerLink: mensagem de canal responde na raiz', () => {
  const l = lerLink('https://teams.microsoft.com/l/message/19%3Aabc%40thread.tacv2/1700000000002?groupId=1f0c&parentMessageId=1700000000001');
  assert.equal(l.tipo, 'mensagem'); assert.equal(l.teamId, '1f0c'); assert.equal(l.raizId, '1700000000001');
});
caso('lerLink: chat e msteams:', () => {
  assert.deepEqual(lerLink('msteams:/l/chat/19:xyz@unq.gbl.spaces/conversations'), { tipo: 'chat', chatId: '19:xyz@unq.gbl.spaces' });
  assert.equal(lerLink('https://exemplo.com/qualquer'), null);
  assert.equal(lerLink('não é link'), null);
});
caso('links diretos', () => {
  assert.equal(linkChat('ana@empresa.com', { mensagem: 'oi' }), 'https://teams.microsoft.com/l/chat/0/0?users=ana%40empresa.com&message=oi');
  assert.match(linkChamada(['a@b.com', 'c@d.com'], true), /users=a%40b\.com%2Cc%40d\.com&withVideo=true$/);
  assert.equal(paraApp('https://teams.microsoft.com/l/chat/0/0'), 'msteams:/l/chat/0/0');
  assert.throws(() => linkChat(''), /e-mail/);
  assert.ok(ehLinkTeams('https://teams.microsoft.com/l/meetup-join/abc'));
  assert.ok(!ehLinkTeams('https://teams.microsoft.com/'));
});

// ---------- cartões ----------
caso('cartão de incidente: obrigatórios e links', () => {
  assert.throws(() => montarCartao('incidente', {}), /Preencha: Título/);
  assert.throws(() => montarCartao('incidente', { titulo: 'x', link: 'ftp://a' }), /https/);
  const c = montarCartao('incidente', { titulo: 'API fora', severidade: 'sev1', servico: 'pagamentos', link: 'https://status' }, [{ id: 'ana@empresa.com', nome: 'Ana' }]);
  assert.equal(c.type, 'AdaptiveCard'); assert.equal(c.version, '1.4');
  assert.ok(JSON.stringify(c).includes('API fora'));
  assert.equal(c.msteams.entities[0].mentioned.id, 'ana@empresa.com');
  assert.ok((c.actions || []).some((a) => a.type === 'Action.OpenUrl' && a.url === 'https://status'));
});
caso('todos os modelos montam com o mínimo', () => {
  for (const m of modelosParaTela()) {
    const d = {};
    for (const c of m.campos) if (c.obrigatorio) d[c.nome] = c.tipo === 'link' ? 'https://x' : 'valor';
    const cartao = montarCartao(m.id, d);
    assert.equal(cartao.type, 'AdaptiveCard', m.id);
    assert.ok(Buffer.byteLength(JSON.stringify(envelope(cartao))) < 28000, m.id);
  }
});
caso('cartão de texto e envelope do webhook', () => {
  assert.throws(() => cartaoTexto('', ''), /Escreva/);
  const e = envelope(cartaoTexto('Título', 'corpo'));
  assert.equal(e.type, 'message');
  assert.equal(e.attachments[0].contentType, 'application/vnd.microsoft.card.adaptive');
  assert.equal(e.attachments[0].content.body.length, 2);
});
caso('pares de nome e valor', () => {
  assert.deepEqual(pares('Ambiente = prod\nVersão | 2.1'), [['Ambiente', 'prod'], ['Versão', '2.1']]);
  assert.deepEqual(pares([{ name: 'a', value: '1' }, ['b', '2'], { name: '' }]), [['a', '1'], ['b', '2']]);
});

// ---------- mensagens novas ----------
const m = (id, seg, de = 'u-ana', texto = 'oi') => ({ id, deId: de, texto, assunto: '', quando: new Date(1_000_000 + seg * 1000).toISOString() });
caso('novas: só depois do cursor, em ordem, sem as minhas', () => {
  const antes = { desde: 1_000_000 + 10_000, vistos: [] };
  const r = filtrarNovas([m('c', 30), m('a', 5), m('b', 20, 'u-eu'), m('d', 25)], antes, { me: 'u-eu' });
  assert.deepEqual(r.novas.map((x) => x.id), ['d', 'c']);
  assert.equal(r.cursor.desde, 1_000_000 + 30_000);
  assert.deepEqual(r.cursor.vistos, ['c']);
});
caso('novas: a mesma mensagem não volta e o filtro ignora acento', () => {
  const r1 = filtrarNovas([m('a', 5, 'u-ana', 'Deploy LIBERADO'), m('b', 5, 'u-joao', 'nada')], { desde: 1_000_000, vistos: [] }, { filtro: 'liberado' });
  assert.deepEqual(r1.novas.map((x) => x.id), ['a']);
  const r2 = filtrarNovas([m('a', 5), m('b', 5)], r1.cursor, {});
  assert.deepEqual(r2.novas, []);
  const r3 = filtrarNovas([m('a', 5), m('b', 5), m('c', 5)], r1.cursor, {});
  assert.deepEqual(r3.novas.map((x) => x.id), ['c']);
  const r4 = filtrarNovas([m('x', 9, 'u-joao', 'Atenção')], r3.cursor, { quem: ['u-ana'], filtro: 'atencao' });
  assert.deepEqual(r4.novas, []);
  assert.equal(r4.cursor.desde, 1_000_000 + 9000);
});

console.log(process.exitCode ? 'falhou' : `${ok} testes passaram`);
