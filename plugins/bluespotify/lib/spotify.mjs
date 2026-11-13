// Cliente da Spotify Web API: login (Authorization Code com PKCE, sem client secret), renovação do token e as
// chamadas, com os erros traduzidos para códigos que a tela e os nós entendem.
import crypto from 'node:crypto';

// Trocar só para testar contra um servidor falso (veja o README, "Para desenvolver").
export const BASE_API = (process.env.BLUESPOTIFY_API_BASE || 'https://api.spotify.com/v1').replace(/\/+$/, '');
export const BASE_CONTAS = (process.env.BLUESPOTIFY_ACCOUNTS_BASE || 'https://accounts.spotify.com').replace(/\/+$/, '');

// O mínimo para biblioteca, player e playlists. "streaming" + e-mail/perfil são exigência do Web Playback SDK.
export const ESCOPOS = [
  'streaming', 'user-read-email', 'user-read-private',
  'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing',
  'user-read-recently-played', 'user-library-read', 'user-library-modify', 'user-follow-read',
  'playlist-read-private', 'playlist-read-collaborative', 'playlist-modify-public', 'playlist-modify-private',
];

const MENSAGENS = {
  'sem-client-id': 'Falta o Client ID do seu app no Spotify. Abra o BlueSpotify e siga a configuração.',
  deslogado: 'Você não está conectado ao Spotify. Abra o BlueSpotify e clique em Conectar.',
  offline: 'Sem conexão com o Spotify. Confira a internet e tente de novo.',
  premium: 'O Spotify só deixa controlar a reprodução em contas Premium.',
  'sem-dispositivo': 'Nenhum dispositivo do Spotify ativo. Abra o Spotify no PC ou no celular, ou escolha um dispositivo no BlueSpotify.',
  limite: 'O Spotify pediu uma pausa por excesso de pedidos.',
  proibido: 'O Spotify recusou o pedido. Em apps no modo de desenvolvimento, a conta precisa estar na lista de usuários do app.',
  'nao-achado': 'O Spotify não achou esse item.',
};

export class Falha extends Error {
  constructor(codigo, msg, extra) { super(msg || MENSAGENS[codigo] || codigo); this.codigo = codigo; Object.assign(this, extra || {}); }
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const ESPERA_MAX_S = 5; // 429 com espera curta: aguarda e repete uma vez; mais que isso, devolve o erro com o tempo

export class Spotify {
  // guardar: { ler(): Promise<string|null>, gravar(valor|null): Promise } para o refresh token (segredos do BlueScreen)
  constructor({ guardar, clientId }) {
    this.guardar = guardar;
    this.clientId = clientId; // função: o valor atual das configurações
    this.acesso = null; // { token, ate }
    this.renovando = null;
    this.pausaAte = 0; // limite de pedidos: até quando não chamar
    this.pendentes = new Map(); // state -> { verificador, redirect, criado }
    this.aoMudar = () => {};
  }

  // ---------- login ----------
  async id() {
    const id = String((await this.clientId()) || '').trim();
    if (!id) throw new Falha('sem-client-id');
    return id;
  }

  async iniciarLogin(redirect) {
    const id = await this.id();
    const verificador = b64url(crypto.randomBytes(64));
    const desafio = b64url(crypto.createHash('sha256').update(verificador).digest());
    const state = b64url(crypto.randomBytes(24));
    for (const [k, v] of this.pendentes) if (Date.now() - v.criado > 10 * 60000) this.pendentes.delete(k);
    this.pendentes.set(state, { verificador, redirect, criado: Date.now() });
    const q = new URLSearchParams({
      client_id: id, response_type: 'code', redirect_uri: redirect, state, scope: ESCOPOS.join(' '),
      code_challenge_method: 'S256', code_challenge: desafio,
    });
    return `${BASE_CONTAS}/authorize?${q}`;
  }

  async concluirLogin(state, code) {
    const p = this.pendentes.get(String(state || ''));
    if (!p) throw new Falha('login', 'Este retorno de login não é desta tentativa (ou já venceu). Volte ao BlueSpotify e clique em Conectar de novo.');
    this.pendentes.delete(state);
    const id = await this.id();
    await this.pedirToken({ grant_type: 'authorization_code', code, redirect_uri: p.redirect, client_id: id, code_verifier: p.verificador });
    this.aoMudar();
  }

  async pedirToken(campos) {
    let r;
    try {
      r = await fetch(`${BASE_CONTAS}/api/token`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(campos), signal: AbortSignal.timeout(20000),
      });
    } catch { throw new Falha('offline'); }
    let j = null;
    try { j = await r.json(); } catch {}
    if (!r.ok || !j || !j.access_token) {
      const motivo = (j && (j.error_description || j.error)) || `resposta ${r.status}`;
      // refresh token recusado: a sessão acabou (revogada no Spotify, ou o Client ID mudou)
      if (campos.grant_type === 'refresh_token' && r.status >= 400 && r.status < 500 && r.status !== 429) {
        await this.esquecer();
        throw new Falha('deslogado', 'A conexão com o Spotify venceu. Conecte de novo.');
      }
      if (r.status === 429 || r.status >= 500) throw new Falha('offline', 'O Spotify não respondeu ao login agora. Tente de novo em instantes.');
      throw new Falha('login', `O Spotify recusou o login: ${motivo}. Confira o Client ID e o endereço de retorno no painel do Spotify.`);
    }
    this.acesso = { token: j.access_token, ate: Date.now() + Math.max(30, Number(j.expires_in) || 3600) * 1000 };
    // no PKCE o Spotify pode devolver um refresh token novo a cada renovação: vale sempre o último
    if (j.refresh_token) await this.guardar.gravar(j.refresh_token);
    return this.acesso;
  }

  async esquecer() {
    this.acesso = null;
    await this.guardar.gravar(null).catch(() => {});
    this.aoMudar();
  }

  async logado() { return !!(this.acesso || (await this.guardar.ler().catch(() => null))); }

  // Token de acesso válido (renova 1 minuto antes de vencer; pedidos simultâneos esperam a mesma renovação).
  async token(forcar) {
    if (!forcar && this.acesso && this.acesso.ate - Date.now() > 60000) return this.acesso.token;
    if (!this.renovando) {
      this.renovando = (async () => {
        const refresh = await this.guardar.ler();
        if (!refresh) throw new Falha('deslogado');
        return (await this.pedirToken({ grant_type: 'refresh_token', refresh_token: refresh, client_id: await this.id() })).token;
      })().finally(() => { this.renovando = null; });
    }
    return this.renovando;
  }

  // ---------- chamadas ----------
  // caminho: '/me/player' (relativo à base) ou a URL inteira que o Spotify devolveu em "next".
  async chamar(metodo, caminho, { query, corpo, tentativa = 0 } = {}) {
    if (Date.now() < this.pausaAte) throw new Falha('limite', null, { esperar: Math.ceil((this.pausaAte - Date.now()) / 1000) });
    const u = new URL(/^https?:\/\//.test(caminho) ? caminho : BASE_API + caminho);
    if (u.origin !== new URL(BASE_API).origin) throw new Falha('proibido', 'Endereço fora da API do Spotify.');
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
    const token = await this.token();
    let r;
    try {
      r = await fetch(u, {
        method: metodo,
        headers: { authorization: 'Bearer ' + token, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch { throw new Falha('offline'); }

    if (r.status === 401 && tentativa === 0) { // token vencido antes da hora: renova e repete uma vez
      await this.token(true);
      return this.chamar(metodo, caminho, { query, corpo, tentativa: 1 });
    }
    if (r.status === 429) {
      const s = Math.max(1, Math.ceil(Number(r.headers.get('retry-after')) || 1));
      if (s <= ESPERA_MAX_S && tentativa < 2) { await dormir(s * 1000); return this.chamar(metodo, caminho, { query, corpo, tentativa: 2 }); }
      this.pausaAte = Date.now() + s * 1000;
      throw new Falha('limite', `O Spotify pediu uma pausa de ${s} s por excesso de pedidos.`, { esperar: s });
    }
    const texto = await r.text().catch(() => '');
    let j = null;
    if (texto) { try { j = JSON.parse(texto); } catch {} }
    if (r.ok) return j;

    const erro = (j && j.error) || {};
    const motivo = String(erro.reason || '');
    const msg = String(erro.message || '');
    if (r.status === 401) { await this.esquecer(); throw new Falha('deslogado', 'A conexão com o Spotify venceu. Conecte de novo.'); }
    if (r.status === 403 && (motivo === 'PREMIUM_REQUIRED' || /premium/i.test(msg))) throw new Falha('premium');
    if (r.status === 404 && (motivo === 'NO_ACTIVE_DEVICE' || /no active device|device not found/i.test(msg))) throw new Falha('sem-dispositivo');
    if (r.status === 403) throw new Falha('proibido', msg ? `${MENSAGENS.proibido} (${msg})` : null);
    if (r.status === 404) throw new Falha('nao-achado', msg && !/not found|invalid/i.test(msg) ? msg : null);
    if (r.status >= 500) throw new Falha('offline', `O Spotify está com problema agora (${r.status}). Tente de novo em instantes.`);
    throw new Falha('spotify', msg ? `O Spotify respondeu: ${msg}` : `O Spotify respondeu ${r.status}.`, { status: r.status });
  }

  get(caminho, query) { return this.chamar('GET', caminho, { query }); }
  put(caminho, query, corpo) { return this.chamar('PUT', caminho, { query, corpo }); }
  post(caminho, query, corpo) { return this.chamar('POST', caminho, { query, corpo }); }
  apagar(caminho, query, corpo) { return this.chamar('DELETE', caminho, { query, corpo }); }
}
