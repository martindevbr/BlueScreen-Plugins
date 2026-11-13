// O que o BlueSpotify sabe fazer com a Web API: biblioteca, busca e player, em objetos pequenos e já prontos para a
// tela, e as ações dos nós do Automator. Os endereços seguem a API depois das mudanças de fevereiro de 2026
// (/playlists/{id}/items, /me/library, busca com no máximo 10 por tipo, sem top-tracks e sem "product" em /me).
import { Falha } from './spotify.mjs';

const PAGINA = 50;
const BUSCA_MAX = 10;

// ---------- formatos ----------
const imagem = (lista, alvo) => {
  const l = (lista || []).filter((i) => i && i.url);
  if (!l.length) return '';
  const comTamanho = l.filter((i) => i.width).sort((a, b) => a.width - b.width);
  return (comTamanho.find((i) => i.width >= alvo) || comTamanho[comTamanho.length - 1] || l[0]).url;
};
const link = (o) => (o && o.external_urls && o.external_urls.spotify) || (o && o.id && o.type ? `https://open.spotify.com/${o.type}/${o.id}` : '');
const fArtista = (a) => (a ? { id: a.id || idDe(a.uri), uri: a.uri, nome: a.name || '', capa: imagem(a.images, 160), tipo: 'artista', link: link(a) } : null);
const fAlbum = (a) => (a ? {
  id: a.id || idDe(a.uri), uri: a.uri, nome: a.name || '', artistas: (a.artists || []).map((x) => ({ id: x.id, nome: x.name })),
  capa: imagem(a.images, 160), capaP: imagem(a.images, 48), ano: String(a.release_date || '').slice(0, 4), total: a.total_tracks || 0, tipo: 'album', link: link(a),
} : null);
export const fFaixa = (t, album) => {
  if (!t || !t.uri) return null;
  const al = t.album || album || t.show || null;
  return {
    id: t.id || idDe(t.uri), uri: t.uri, nome: t.name || '', ms: t.duration_ms || 0,
    artistas: (t.artists || (t.show ? [{ id: t.show.id, name: t.show.name }] : [])).map((x) => ({ id: x.id || idDe(x.uri), nome: x.name })),
    album: al ? { id: al.id || idDe(al.uri), nome: al.name || '' } : null,
    capa: imagem(al && al.images, 48), capaG: imagem(al && al.images, 160),
    explicita: !!t.explicit, local: !!t.is_local, tocavel: t.is_playable !== false && !t.is_local, tipo: t.type === 'episode' ? 'episodio' : 'faixa', link: link(t),
  };
};
const fPlaylist = (p, eu) => (p ? {
  id: p.id, uri: p.uri, nome: p.name || '', dono: (p.owner && (p.owner.display_name || p.owner.id)) || '',
  minha: !!(p.collaborative || (eu && p.owner && p.owner.id === eu.id)),
  capa: imagem(p.images, 160), capaP: imagem(p.images, 48), total: ((p.items || p.tracks || {}).total) || 0,
  descricao: textoPuro(p.description), tipo: 'playlist', link: link(p),
} : null);
const fDispositivo = (d) => (d ? { id: d.id, nome: d.name || 'Dispositivo', tipo: d.type || '', ativo: !!d.is_active, volume: d.volume_percent, temVolume: d.supports_volume !== false, restrito: !!d.is_restricted } : null);
function idDe(uri) { return String(uri || '').split(':').pop() || ''; }
function textoPuro(s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").trim();
}
const duracao = (ms) => Math.round((ms || 0) / 1000);

// Link (open.spotify.com/...) ou URI (spotify:tipo:id) → { tipo, id, uri }
export function lerLink(texto) {
  const t = String(texto || '').trim();
  let m = /^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]+)$/.exec(t);
  if (!m) m = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/i.exec(t);
  return m ? { tipo: m[1].toLowerCase(), id: m[2], uri: `spotify:${m[1].toLowerCase()}:${m[2]}` } : null;
}

export class Acoes {
  // garantirLocal: () => Promise<id|''> abre o player do BlueScreen e espera ficar pronto (o servidor preenche)
  constructor(sp) { this.sp = sp; this.eu = null; this.garantirLocal = null; }

  async perfil(forcar) {
    if (this.eu && !forcar) return this.eu;
    const u = await this.sp.get('/me');
    this.eu = { id: u.id, nome: u.display_name || u.id, foto: imagem(u.images, 64), link: link({ ...u, type: 'user' }) };
    return this.eu;
  }

  // ---------- biblioteca ----------
  async lista(tipo, { id, offset = 0, depois } = {}) {
    offset = Math.max(0, Number(offset) || 0);
    if (tipo === 'playlists') {
      const [eu, r] = await Promise.all([this.perfil(), this.sp.get('/me/playlists', { limit: PAGINA, offset })]);
      return { itens: r.items.filter(Boolean).map((p) => fPlaylist(p, eu)), total: r.total, offset };
    }
    if (tipo === 'curtidas') {
      const r = await this.sp.get('/me/tracks', { limit: PAGINA, offset, market: 'from_token' });
      return { itens: r.items.map((i) => fFaixa(i.track)), total: r.total, offset, cab: offset ? undefined : { tipo: 'curtidas', nome: 'Curtidas', total: r.total } };
    }
    if (tipo === 'albuns') {
      const r = await this.sp.get('/me/albums', { limit: PAGINA, offset });
      return { itens: r.items.map((i) => fAlbum(i.album)).filter(Boolean), total: r.total, offset };
    }
    if (tipo === 'artistas') {
      const r = (await this.sp.get('/me/following', { type: 'artist', limit: PAGINA, after: depois })).artists;
      return { itens: r.items.map(fArtista).filter(Boolean), total: r.total, depois: (r.cursors && r.cursors.after) || null };
    }
    if (tipo === 'recentes') {
      const r = await this.sp.get('/me/player/recently-played', { limit: PAGINA });
      const vistos = new Set(), itens = [];
      for (const i of r.items) { const f = fFaixa(i.track); if (f && !vistos.has(f.uri)) { vistos.add(f.uri); itens.push(f); } }
      return { itens, total: itens.length, offset: 0, cab: { tipo: 'recentes', nome: 'Tocadas recentemente', total: itens.length } };
    }
    if (tipo === 'playlist') {
      const eu = await this.perfil();
      const meta = offset ? null : this.sp.get('/playlists/' + encodeURIComponent(id), { fields: 'id,uri,name,description,images,collaborative,owner(id,display_name),external_urls,items(total),tracks(total)' });
      let r = null, bloqueada = false;
      try { r = await this.sp.get(`/playlists/${encodeURIComponent(id)}/items`, { limit: PAGINA, offset, market: 'from_token' }); }
      catch (e) { if (e.codigo !== 'proibido') throw e; bloqueada = true; } // playlist de outra pessoa: a API só entrega os dados gerais
      const cab = meta ? fPlaylist(await meta, eu) : undefined;
      if (bloqueada) return { itens: [], total: 0, offset, cab, bloqueada: true };
      return { itens: r.items.map((i) => fFaixa(i.item || i.track)), total: r.total, offset, cab: cab ? { ...cab, total: r.total } : undefined };
    }
    if (tipo === 'album') {
      if (!offset) {
        const a = await this.sp.get('/albums/' + encodeURIComponent(id), { market: 'from_token' });
        return { itens: a.tracks.items.map((t) => fFaixa(t, a)), total: a.tracks.total, offset, cab: fAlbum(a) };
      }
      const r = await this.sp.get(`/albums/${encodeURIComponent(id)}/tracks`, { limit: PAGINA, offset, market: 'from_token' });
      return { itens: r.items.map((t) => fFaixa(t)), total: r.total, offset };
    }
    if (tipo === 'artista') {
      // a API não entrega mais as faixas mais tocadas do artista: mostramos os álbuns e o botão que toca o artista
      const [a, r] = await Promise.all([
        offset ? null : this.sp.get('/artists/' + encodeURIComponent(id)),
        this.sp.get(`/artists/${encodeURIComponent(id)}/albums`, { limit: BUSCA_MAX, offset, include_groups: 'album,single', market: 'from_token' }),
      ]);
      return { itens: r.items.map(fAlbum).filter(Boolean), total: r.total, offset, cab: a ? fArtista(a) : undefined };
    }
    throw new Falha('spotify', 'Lista desconhecida: ' + tipo);
  }

  async busca(q, tipos = ['track', 'album', 'artist', 'playlist'], limite = BUSCA_MAX) {
    q = String(q || '').trim();
    if (!q) return { faixas: [], albuns: [], artistas: [], playlists: [] };
    const r = await this.sp.get('/search', { q, type: tipos.join(','), limit: Math.min(BUSCA_MAX, Math.max(1, limite)), market: 'from_token' });
    const eu = tipos.includes('playlist') ? await this.perfil() : null;
    const l = (k, f) => ((r[k] && r[k].items) || []).filter(Boolean).map(f).filter(Boolean);
    return { faixas: l('tracks', (t) => fFaixa(t)), albuns: l('albums', fAlbum), artistas: l('artists', fArtista), playlists: l('playlists', (p) => fPlaylist(p, eu)) };
  }

  async curtidasContem(uris) {
    const out = {};
    for (let i = 0; i < uris.length; i += 40) {
      const lote = uris.slice(i, i + 40);
      const r = await this.sp.get('/me/library/contains', { uris: lote.join(',') });
      lote.forEach((u, k) => { out[u] = !!r[k]; });
    }
    return out;
  }
  async curtir(uris, on) {
    for (let i = 0; i < uris.length; i += 40) await this.sp.chamar(on ? 'PUT' : 'DELETE', '/me/library', { query: { uris: uris.slice(i, i + 40).join(',') } });
  }
  async playlistAdicionar(id, uris) {
    for (let i = 0; i < uris.length; i += 100) await this.sp.post(`/playlists/${encodeURIComponent(id)}/items`, null, { uris: uris.slice(i, i + 100) });
  }

  // ---------- player ----------
  async player() {
    const s = await this.sp.get('/me/player', { additional_types: 'track,episode' });
    if (!s || !s.device) return { ativo: false };
    return {
      ativo: true, tocando: !!s.is_playing, faixa: fFaixa(s.item), posMs: s.progress_ms || 0, em: Date.now(),
      aleatorio: !!s.shuffle_state, repetir: s.repeat_state || 'off', contexto: (s.context && s.context.uri) || '', dispositivo: fDispositivo(s.device),
    };
  }
  async dispositivos() { return ((await this.sp.get('/me/player/devices')).devices || []).map(fDispositivo).filter((d) => d.id); }
  async fila() {
    const r = await this.sp.get('/me/player/queue');
    return { atual: fFaixa(r && r.currently_playing), fila: ((r && r.queue) || []).map((t) => fFaixa(t)).filter(Boolean) };
  }

  // Sem dispositivo ativo: escolhe um dos que estão abertos (o pedido pelo nome, senão o BlueScreen, senão o primeiro).
  async acharDispositivo(nome) {
    const lista = await this.dispositivos();
    const livres = lista.filter((d) => !d.restrito);
    const n = String(nome || '').trim().toLowerCase();
    if (n) {
      const d = livres.find((x) => x.nome.toLowerCase() === n) || livres.find((x) => x.nome.toLowerCase().includes(n)) || livres.find((x) => x.id === nome);
      if (d) return d;
      if (n === 'bluescreen') { const l = await this.local(); if (l) return l; }
      throw new Falha('sem-dispositivo', `Não achei o dispositivo "${nome}". Abertos agora: ${livres.map((x) => x.nome).join(', ') || 'nenhum'}.`);
    }
    return livres.find((d) => d.ativo) || livres.find((d) => d.nome === 'BlueScreen') || livres[0] || (await this.local());
  }
  // nenhum aparelho com o Spotify aberto: o player em segundo plano do BlueScreen, sem perguntar nada
  async local() {
    const id = this.garantirLocal ? await this.garantirLocal().catch(() => '') : '';
    return id ? { id, nome: 'BlueScreen', tipo: 'Computer', ativo: false, volume: 80, temVolume: true, restrito: false } : null;
  }

  // Roda um comando do player; se o Spotify disser que não há dispositivo ativo, escolhe um aberto e repete.
  async comDispositivo(fn, dispositivo) {
    try { return await fn(dispositivo || undefined); }
    catch (e) {
      if (e.codigo !== 'sem-dispositivo' || dispositivo) throw e;
      const d = await this.acharDispositivo();
      if (!d) throw e;
      return fn(d.id);
    }
  }

  // c: { acao, ... }. Devolve nada: quem chama lê o estado depois.
  async comando(c) {
    const sp = this.sp, disp = c.dispositivo || undefined;
    switch (c.acao) {
      case 'tocar': {
        const corpo = {};
        if (c.contexto) corpo.context_uri = c.contexto;
        else if (c.uris && c.uris.length) corpo.uris = c.uris.slice(0, 100);
        if (Number.isInteger(c.indice) && (c.contexto ? !/^spotify:artist:/.test(c.contexto) : corpo.uris)) corpo.offset = { position: c.indice };
        else if (c.deUri && c.contexto) corpo.offset = { uri: c.deUri };
        if (c.posMs > 0) corpo.position_ms = Math.round(c.posMs);
        await this.comDispositivo((d) => sp.put('/me/player/play', { device_id: d }, corpo), disp);
        if (typeof c.aleatorio === 'boolean') await sp.put('/me/player/shuffle', { state: c.aleatorio }).catch(() => {});
        return;
      }
      case 'retomar': return this.comDispositivo((d) => sp.put('/me/player/play', { device_id: d }), disp);
      case 'pausar': return sp.put('/me/player/pause', { device_id: disp });
      case 'proxima': return sp.post('/me/player/next', { device_id: disp });
      case 'anterior': return sp.post('/me/player/previous', { device_id: disp });
      case 'posicao': return sp.put('/me/player/seek', { position_ms: Math.max(0, Math.round(c.ms || 0)), device_id: disp });
      case 'volume': return sp.put('/me/player/volume', { volume_percent: Math.max(0, Math.min(100, Math.round(c.valor))), device_id: disp });
      case 'aleatorio': return sp.put('/me/player/shuffle', { state: !!c.on, device_id: disp });
      case 'repetir': return sp.put('/me/player/repeat', { state: ['off', 'context', 'track'].includes(c.modo) ? c.modo : 'off', device_id: disp });
      case 'transferir': return sp.put('/me/player', null, { device_ids: [c.dispositivo], play: c.tocar !== false });
      case 'fila': return this.comDispositivo((d) => sp.post('/me/player/queue', { uri: c.uri, device_id: d }), disp);
      default: throw new Falha('spotify', 'Comando desconhecido: ' + c.acao);
    }
  }

  // ---------- nós do Automator ----------
  // Acha o que tocar a partir de um nome ou link. tipo: auto | faixa | album | playlist | artista
  async achar(texto, tipo = 'auto') {
    const t = String(texto || '').trim();
    if (!t) throw new Falha('spotify', 'Diga o nome ou cole o link do que procurar.');
    const lk = lerLink(t);
    if (lk) {
      if (lk.tipo === 'track') { const f = fFaixa(await this.sp.get('/tracks/' + lk.id, { market: 'from_token' })); return { ...f, tipo: 'faixa' }; }
      if (lk.tipo === 'album') return fAlbum(await this.sp.get('/albums/' + lk.id, { market: 'from_token' }));
      if (lk.tipo === 'artist') return fArtista(await this.sp.get('/artists/' + lk.id));
      if (lk.tipo === 'playlist') return fPlaylist(await this.sp.get('/playlists/' + lk.id, { fields: 'id,uri,name,description,images,collaborative,owner(id,display_name),external_urls,items(total)' }), await this.perfil());
      return { uri: lk.uri, nome: t, tipo: lk.tipo, id: lk.id };
    }
    if (tipo === 'playlist') { const minha = await this.minhaPlaylist(t, false); if (minha) return minha; }
    const api = { auto: 'track', faixa: 'track', album: 'album', playlist: 'playlist', artista: 'artist' }[tipo] || 'track';
    const r = await this.busca(t, [api], 5);
    const achado = (r.faixas[0] || r.albuns[0] || r.playlists[0] || r.artistas[0]);
    if (!achado) throw new Falha('nao-achado', `O Spotify não achou "${t}".`);
    return achado;
  }

  // Playlist do usuário pelo nome (igual, depois "contém") ou pelo link.
  async minhaPlaylist(texto, obrigatoria = true) {
    const t = String(texto || '').trim(), lk = lerLink(t), n = t.toLowerCase();
    let parcial = null;
    for (let offset = 0; offset < 1000; offset += PAGINA) {
      const pg = await this.lista('playlists', { offset });
      for (const p of pg.itens) {
        if (lk ? p.id === lk.id : p.nome.toLowerCase() === n) return p;
        if (!lk && !parcial && p.nome.toLowerCase().includes(n)) parcial = p;
      }
      if (offset + PAGINA >= pg.total) break;
    }
    if (parcial) return parcial;
    if (obrigatoria) throw new Falha('nao-achado', `Não achei a playlist "${t}" entre as suas.`);
    return null;
  }

  async tocandoAgora() {
    const s = await this.player();
    const f = s.faixa;
    if (!s.ativo || !f) return { tocando: false, faixa: '', artista: '', album: '', link: '', uri: '', capa: '', posicao_s: 0, duracao_s: 0, dispositivo: s.dispositivo ? s.dispositivo.nome : '', volume: s.dispositivo ? s.dispositivo.volume ?? null : null, aleatorio: !!s.aleatorio, repetir: s.repetir || 'off' };
    return {
      tocando: s.tocando, faixa: f.nome, artista: f.artistas.map((a) => a.nome).join(', '), album: f.album ? f.album.nome : '', link: f.link, uri: f.uri, capa: f.capaG,
      posicao_s: duracao(s.posMs), duracao_s: duracao(f.ms), dispositivo: s.dispositivo.nome, volume: s.dispositivo.volume ?? null, aleatorio: s.aleatorio, repetir: s.repetir,
    };
  }

  resumo(o) { return { tipo: o.tipo, nome: o.nome, artista: (o.artistas || []).map((a) => a.nome).join(', ') || o.dono || '', link: o.link || '', uri: o.uri }; }

  async no(nome, p, entrada) {
    const txt = (v) => (v === null || v === undefined ? '' : typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').trim();
    const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
    switch (nome) {
      case 'tocar': {
        const disp = txt(p.dispositivo) ? (await this.acharDispositivo(txt(p.dispositivo))).id : undefined;
        const aleatorio = p.aleatorio === 'sim' ? true : p.aleatorio === 'nao' ? false : undefined;
        if (p.tipo === 'curtidas') {
          const pg = await this.lista('curtidas', {});
          if (!pg.itens.length) throw new Falha('nao-achado', 'Você ainda não curtiu nenhuma faixa.');
          await this.comando({ acao: 'tocar', uris: pg.itens.filter((f) => f && f.tocavel).map((f) => f.uri), dispositivo: disp, aleatorio });
          return { tipo: 'curtidas', nome: 'Curtidas', artista: '', link: '', uri: '' };
        }
        const alvo = await this.achar(txt(p.o_que) || txt(entrada), p.tipo || 'auto');
        await this.comando(alvo.tipo === 'faixa' || alvo.tipo === 'episodio' || alvo.tipo === 'track'
          ? { acao: 'tocar', uris: [alvo.uri], dispositivo: disp, aleatorio }
          : { acao: 'tocar', contexto: alvo.uri, dispositivo: disp, aleatorio });
        return this.resumo(alvo);
      }
      case 'pausar': {
        let acao = p.acao || 'alternar';
        if (acao === 'alternar') acao = (await this.player()).tocando ? 'pausar' : 'retomar';
        await this.comando({ acao });
        return { tocando: acao === 'retomar' };
      }
      case 'pular':
        await this.comando({ acao: p.direcao === 'anterior' ? 'anterior' : 'proxima' });
        await esperar(700); // o Spotify leva um instante para trocar de faixa
        return this.tocandoAgora();
      case 'volume': {
        const n = Number(p.valor);
        if (!Number.isFinite(n)) throw new Falha('spotify', 'Informe o volume em número, de 0 a 100.');
        let alvo = n;
        if (p.modo === 'aumentar' || p.modo === 'diminuir') {
          const s = await this.player();
          if (!s.ativo) throw new Falha('sem-dispositivo');
          alvo = (s.dispositivo.volume ?? 50) + (p.modo === 'aumentar' ? n : -n);
        }
        alvo = Math.max(0, Math.min(100, Math.round(alvo)));
        try { await this.comando({ acao: 'volume', valor: alvo }); }
        catch (e) { if (e.codigo === 'proibido') throw new Falha('proibido', 'Este dispositivo não deixa mudar o volume de fora (acontece em celulares).'); throw e; }
        return { volume: alvo };
      }
      case 'tocando': return this.tocandoAgora();
      case 'buscar': {
        const api = { faixa: 'track', album: 'album', artista: 'artist', playlist: 'playlist' }[p.tipo] || 'track';
        const r = await this.busca(txt(p.termo) || txt(entrada), [api], Number(p.quantos) || 5);
        return [...r.faixas, ...r.albuns, ...r.artistas, ...r.playlists].map((o) => this.resumo(o));
      }
      case 'fila': {
        const alvo = await this.achar(txt(p.o_que) || txt(entrada), 'faixa');
        if (alvo.tipo !== 'faixa' && alvo.tipo !== 'episodio') throw new Falha('spotify', 'Só dá para pôr faixas na fila (o link é de ' + alvo.tipo + ').');
        await this.comando({ acao: 'fila', uri: alvo.uri });
        return this.resumo(alvo);
      }
      case 'curtir': {
        const s = await this.player();
        if (!s.faixa) throw new Falha('nao-achado', 'Não há faixa tocando para curtir.');
        const on = p.acao !== 'tirar';
        await this.curtir([s.faixa.uri], on);
        return { ...this.resumo(s.faixa), curtida: on };
      }
      case 'playlist': {
        const pl = await this.minhaPlaylist(txt(p.playlist));
        if (!pl.minha) throw new Falha('proibido', `A playlist "${pl.nome}" não é sua: o Spotify só deixa adicionar nas suas.`);
        let faixa;
        if (txt(p.faixa) || txt(entrada)) faixa = await this.achar(txt(p.faixa) || txt(entrada), 'faixa');
        else { faixa = (await this.player()).faixa; if (!faixa) throw new Falha('nao-achado', 'Não há faixa tocando: informe o nome ou o link da faixa.'); }
        if (faixa.tipo !== 'faixa') throw new Falha('spotify', 'Só dá para adicionar faixas (o link é de ' + faixa.tipo + ').');
        if (p.repetida !== 'sim') {
          for (let offset = 0; offset < pl.total && offset < 5000; offset += PAGINA) {
            const pg = await this.lista('playlist', { id: pl.id, offset: offset || 0 });
            if (pg.itens.some((f) => f && f.uri === faixa.uri)) return { ...this.resumo(faixa), playlist: pl.nome, adicionada: false };
            if (!pg.itens.length) break;
          }
        }
        await this.playlistAdicionar(pl.id, [faixa.uri]);
        return { ...this.resumo(faixa), playlist: pl.nome, adicionada: true };
      }
      case 'dispositivo': {
        const pedido = txt(p.nome) || txt(entrada);
        if (!pedido) throw new Falha('spotify', 'Informe o nome do dispositivo.');
        const d = await this.acharDispositivo(pedido);
        await this.comando({ acao: 'transferir', dispositivo: d.id, tocar: p.tocar !== 'nao' });
        return { dispositivo: d.nome, tipo: d.tipo, volume: d.volume ?? null };
      }
      case 'dispositivos':
        return (await this.dispositivos()).map((d) => ({ dispositivo: d.nome, tipo: d.tipo, ativo: d.ativo, volume: d.volume ?? null }));
      default: throw new Falha('spotify', 'Nó desconhecido: ' + nome);
    }
  }
}
