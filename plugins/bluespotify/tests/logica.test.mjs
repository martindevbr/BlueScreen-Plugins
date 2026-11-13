// Testes da lógica do BlueSpotify sem rede e sem conta: node tests/logica.test.mjs
// A Web API é trocada por um fetch falso; o que se confere é o login PKCE, a tradução dos erros e as ações.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Spotify, Falha } from '../lib/spotify.mjs';
import { Acoes, lerLink, fFaixa } from '../lib/acoes.mjs';

let ok = 0;
const caso = async (nome, fn) => { try { await fn(); ok++; } catch (e) { console.error('✗ ' + nome + '\n  ' + (e.stack || e.message)); process.exitCode = 1; } };
const resposta = (status, corpo, cab = {}) => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: cab });
function cliente(rotas) {
  let refresh = 'r0';
  const sp = new Spotify({ clientId: async () => 'abc', guardar: { ler: async () => refresh, gravar: async (v) => { refresh = v; } } });
  globalThis.fetch = async (url, opt = {}) => {
    const u = new URL(url);
    if (u.pathname === '/api/token') return resposta(200, { access_token: 'tk', expires_in: 3600, refresh_token: 'r1' });
    const k = `${opt.method || 'GET'} ${u.pathname}`;
    const f = rotas[k];
    if (!f) return resposta(404, { error: { status: 404, message: 'Service not found: ' + k } });
    return f(u, opt);
  };
  return sp;
}

await caso('lerLink: link, link internacional e URI', () => {
  assert.deepEqual(lerLink('https://open.spotify.com/intl-pt/track/7tFiyTwD0nx5a1eklYtX2J?si=abc'), { tipo: 'track', id: '7tFiyTwD0nx5a1eklYtX2J', uri: 'spotify:track:7tFiyTwD0nx5a1eklYtX2J' });
  assert.equal(lerLink('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M').tipo, 'playlist');
  assert.equal(lerLink('Bohemian Rhapsody'), null);
});
await caso('fFaixa: formato da tela, episódio e faixa local', () => {
  const f = fFaixa({ uri: 'spotify:track:x', id: 'x', name: 'N', duration_ms: 1000, artists: [{ id: 'a', name: 'A' }], album: { id: 'b', name: 'B', images: [{ url: 'u', width: 64 }] } });
  assert.equal(f.tipo, 'faixa'); assert.equal(f.capa, 'u'); assert.equal(f.tocavel, true);
  assert.equal(fFaixa({ uri: 'spotify:local:x', is_local: true, name: 'L' }).tocavel, false);
  assert.equal(fFaixa(null), null);
});
await caso('login PKCE: desafio S256 do verificador, state único', async () => {
  const sp = cliente({});
  const url = new URL(await sp.iniciarLogin('http://127.0.0.1:8974/callback'));
  const st = url.searchParams.get('state');
  const p = sp.pendentes.get(st);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), crypto.createHash('sha256').update(p.verificador).digest('base64url'));
  await assert.rejects(sp.concluirLogin('outro', 'c'), (e) => e.codigo === 'login');
  await sp.concluirLogin(st, 'c');
  assert.equal(await sp.token(), 'tk');
});
await caso('erros traduzidos: Premium, sem dispositivo, limite e 401', async () => {
  let n401 = 0;
  const sp = cliente({
    'PUT /v1/me/player/play': () => resposta(403, { error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } }),
    'PUT /v1/me/player/pause': () => resposta(404, { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } }),
    'GET /v1/search': () => resposta(429, undefined, { 'retry-after': '30' }),
    'GET /v1/me': () => (n401++ ? resposta(200, { id: 'eu' }) : resposta(401, { error: { status: 401, message: 'expired' } })),
  });
  await assert.rejects(sp.put('/me/player/play', null, {}), (e) => e instanceof Falha && e.codigo === 'premium');
  await assert.rejects(sp.put('/me/player/pause'), (e) => e.codigo === 'sem-dispositivo');
  await assert.rejects(sp.get('/search', { q: 'x' }), (e) => e.codigo === 'limite' && e.esperar === 30);
  await assert.rejects(sp.get('/me'), (e) => e.codigo === 'limite'); // ainda na pausa pedida
  sp.pausaAte = 0;
  assert.deepEqual(await sp.get('/me'), { id: 'eu' }); // 401 renova o token e repete
});
await caso('tocar sem dispositivo ativo escolhe um aberto e repete', async () => {
  const pedidos = [];
  const sp = cliente({
    'PUT /v1/me/player/play': (u) => { pedidos.push(u.searchParams.get('device_id')); return u.searchParams.get('device_id') ? resposta(204) : resposta(404, { error: { status: 404, message: 'No active device found', reason: 'NO_ACTIVE_DEVICE' } }); },
    'GET /v1/me/player/devices': () => resposta(200, { devices: [{ id: 'tv', name: 'TV', is_restricted: true }, { id: 'pc', name: 'PC', is_active: false }] }),
  });
  await new Acoes(sp).comando({ acao: 'tocar', uris: ['spotify:track:x'] });
  assert.deepEqual(pedidos, [null, 'pc']);
});
await caso('nó Tocar: playlist pelo nome entre as suas, e dispositivo inexistente', async () => {
  let corpo = null;
  const sp = cliente({
    'GET /v1/me': () => resposta(200, { id: 'eu', display_name: 'Eu' }),
    'GET /v1/me/playlists': () => resposta(200, { total: 2, items: [{ id: 'p1', uri: 'spotify:playlist:p1', name: 'Foco total', owner: { id: 'eu' } }, { id: 'p2', uri: 'spotify:playlist:p2', name: 'Foco', owner: { id: 'eu' } }] }),
    'PUT /v1/me/player/play': (u, opt) => { corpo = JSON.parse(opt.body); return resposta(204); },
    'GET /v1/me/player/devices': () => resposta(200, { devices: [{ id: 'pc', name: 'PC-MARTIN' }] }),
  });
  const a = new Acoes(sp);
  const r = await a.no('tocar', { o_que: 'foco', tipo: 'playlist' });
  assert.equal(r.nome, 'Foco'); // o nome igual ganha do "contém"
  assert.equal(corpo.context_uri, 'spotify:playlist:p2');
  await assert.rejects(a.no('tocar', { o_que: 'foco', tipo: 'playlist', dispositivo: 'geladeira' }), /Geladeira|geladeira/);
});
await caso('playlist de outra pessoa não aceita faixa', async () => {
  const sp = cliente({
    'GET /v1/me': () => resposta(200, { id: 'eu' }),
    'GET /v1/me/playlists': () => resposta(200, { total: 1, items: [{ id: 'p9', name: 'Top 50', owner: { id: 'spotify' } }] }),
  });
  await assert.rejects(new Acoes(sp).no('playlist', { playlist: 'Top 50', faixa: 'spotify:track:abc' }), (e) => e.codigo === 'proibido');
});

console.log(process.exitCode ? 'falhou' : `${ok} testes passaram`);
