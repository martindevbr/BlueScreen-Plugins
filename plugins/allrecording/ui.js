// AllRecording: painel na barra da esquerda (as gravações) + tela fixa (gravar, ouvir, transcrever).
// Grava com o MediaRecorder da página, sem servidor próprio. A tela, a janela e o som do computador vêm da captura
// nativa da IDE (/api/capture: seletor próprio, sem a janela "Escolha o que compartilhar"); numa IDE sem ela (versão
// antiga, ou aberta de outro aparelho) o getDisplayMedia do navegador faz o papel. O microfone é o getUserMedia. Os pedaços
// vão para a pasta de dados a cada poucos segundos: se a IDE fechar no meio, a reunião não se perde.
// A gravação não depende da tela montada: trocar de painel não para nada.
const { $, esc, toast } = bs;

const ICON = '<svg class="i" viewBox="0 0 24 24"><rect x="2.5" y="5" width="13.5" height="11" rx="2.5"/><path d="M16 9.2l4.6-2.5v8.6L16 12.8M6 19.5h6.5"/><circle cx="9.25" cy="10.5" r="1.6" fill="currentColor" stroke="none"/></svg>';
const IC = {
  tela: '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20h6M12 16.5V20"/></svg>',
  mic: '<svg class="i" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  micOff: '<svg class="i" viewBox="0 0 24 24"><path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5.5 11a6.5 6.5 0 0 0 10.4 5.2M18.5 11a6.4 6.4 0 0 1-.6 2.6M12 17.5V21M4 4l16 16"/></svg>',
  som: '<svg class="i" viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  onda: '<svg class="i" viewBox="0 0 24 24"><path d="M4 12h1.5M7.5 8v8M11 5v14M14.5 9v6M18 7v10M20.5 12H20"/></svg>',
  pausa: '<svg class="i" viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>',
  play: '<svg class="i" viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg>',
  parar: '<svg class="i" viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg>',
  marca: '<svg class="i" viewBox="0 0 24 24"><path d="M7 4h10v16l-5-3.5L7 20z"/></svg>',
  mao: '<svg class="i" viewBox="0 0 24 24"><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11.5V5a1.5 1.5 0 0 1 3 0v6.5M14 11.5V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L3.4 14.6a1.6 1.6 0 0 1 2.4-2.1L8 14.5"/></svg>',
  copiar: '<svg class="i" viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></svg>',
  texto: '<svg class="i" viewBox="0 0 24 24"><path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z"/><path d="M14 3.5V8h4M9 12h6M9 15.5h6"/></svg>',
  ia: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3.5l1.6 4.9 4.9 1.6-4.9 1.6L12 16.5l-1.6-4.9L5.5 10l4.9-1.6zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>',
  pasta: '<svg class="i" viewBox="0 0 24 24"><path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/></svg>',
  baixar: '<svg class="i" viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/></svg>',
  lixo: '<svg class="i" viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/></svg>',
  mais: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  ok: '<svg class="i" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  atualizar: '<svg class="i" viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/></svg>',
  janela: '<svg class="i" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9h17"/></svg>',
  busca: '<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
  x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  volta: '<svg class="i" viewBox="0 0 24 24"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/><text x="12" y="15" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif">10</text></svg>',
  frente: '<svg class="i" viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/><text x="12" y="15" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif">10</text></svg>',
  disco: '<svg class="i" viewBox="0 0 24 24"><ellipse cx="12" cy="6.5" rx="7" ry="2.5"/><path d="M5 6.5v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-11M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/></svg>',
};
// tipos de marcador: viram etiqueta colorida na gravação e entram na ata
const TIPOS = { decisao: { nome: 'Decisão', cor: '#3fb950' }, tarefa: { nome: 'Tarefa', cor: '#4c8dff' }, duvida: { nome: 'Dúvida', cor: '#d99a2b' }, importante: { nome: 'Importante', cor: '#e5484d' } };
const rotuloMarca = (x) => [x.tipo && TIPOS[x.tipo] ? TIPOS[x.tipo].nome : '', x.texto || ''].filter(Boolean).join(': ');
// preferências desta tela (o microfone escolhido, a contagem): ficam neste PC
const pref = { get: (k, d) => { try { const v = JSON.parse(localStorage.getItem('allrecording.' + k)); return v ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('allrecording.' + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } } };
const QUALIDADE = { leve: { fps: 15, bps: 800e3 }, normal: { fps: 24, bps: 1.5e6 }, alta: { fps: 30, bps: 3e6 } };
const PASTA = 'gravacoes';

// estado da gravação (vive fora da tela) e da interface
const G = { fase: 'livre', modo: 'tela', comMic: true, comSom: true, titulo: '', id: '', meta: null, rec: null, streams: [], ctx: null, ganhoMic: null,
  medidores: {}, inicio: 0, pausadoEm: 0, pausado: 0, parte: 0, fila: Promise.resolve(), erroGravar: '', micMudo: false, socks: [], bytes: 0, conta: 0, cancelou: false };
const U = { cfg: {}, lista: [], sel: null, perguntar: false, escolher: false, midia: null, aba: 'ata', textos: {}, trabalho: {}, info: null, ffmpeg: null,
  busca: '', achar: '', mics: [], micId: pref.get('mic', ''), contagem: pref.get('contagem', true), teste: null, tipo: '', vel: 1 };
const R = {}; // elementos montados
const timers = [];

plugin.settings.get().then((c) => { U.cfg = c || {}; }).catch(() => {});
plugin.settings.onChange((c) => { U.cfg = c || {}; });

// ---------- ajudantes ----------
const doisDig = (n) => String(Math.floor(n)).padStart(2, '0');
const relogio = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600); return (h ? h + ':' : '') + doisDig((s % 3600) / 60) + ':' + doisDig(s % 60); };
const tamanho = (b) => !b ? '' : b < 1 << 20 ? Math.max(1, Math.round(b / 1024)) + ' KB' : b < 1 << 30 ? (b / (1 << 20)).toFixed(b < 10 << 20 ? 1 : 0).replace('.', ',') + ' MB' : (b / (1 << 30)).toFixed(1).replace('.', ',') + ' GB';
const dataHora = (ms) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const tituloPadrao = () => 'Reunião de ' + new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit' }) + ', ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const novoId = () => { const d = new Date(); return `${d.getFullYear()}${doisDig(d.getMonth() + 1)}${doisDig(d.getDate())}-${doisDig(d.getHours())}${doisDig(d.getMinutes())}${doisDig(d.getSeconds())}`; };
const decorrido = () => !G.inicio ? 0 : ((G.pausadoEm || Date.now()) - G.inicio - G.pausado) / 1000;
const ps = (s) => "'" + String(s).replace(/'/g, "''") + "'"; // texto para o PowerShell
const fecha = (el) => { el.hidden = true; };

async function pastaDados() {
  if (!U.info) U.info = await plugin.info();
  return U.info.filesDir.replace(/\//g, '\\');
}
const dirDe = async (id) => (await pastaDados()) + '\\' + PASTA + '\\' + id;
const salvarMeta = (m) => plugin.files.write(`${PASTA}/${m.id}/meta.json`, m);

async function temFfmpeg() {
  if (U.ffmpeg === null) { try { U.ffmpeg = (await plugin.exec('ffmpeg', ['-version'], { timeout: 8000 })).ok; } catch { U.ffmpeg = false; } }
  return U.ffmpeg;
}

// ---------- lista ----------
async function carregarLista() {
  let ents = [];
  try { ents = await plugin.files.list(PASTA); } catch { /* ainda sem pasta */ }
  const metas = await Promise.all(ents.filter((e) => e.dir).map(async (e) => {
    try { const m = await plugin.files.read(`${PASTA}/${e.name}/meta.json`, 'json'); const arqs = await plugin.files.list(`${PASTA}/${e.name}`); m.arqs = Object.fromEntries(arqs.map((a) => [a.name, a.size])); return m; } catch { return null; }
  }));
  U.lista = metas.filter(Boolean).sort((a, b) => b.inicio - a.inicio);
  // sobrou de uma gravação que a IDE fechou no meio: dá para montar o arquivo com os pedaços que chegaram
  for (const m of U.lista) if (m.status === 'gravando' && m.id !== G.id) m.status = 'interrompida';
  pintarLado(); pintar();
}

// ---------- captura nativa da IDE ----------
// N.ok: a IDE tem /api/capture (null = ainda não perguntou). N.fontes: telas e janelas com miniatura.
const N = { ok: null, fontes: null, aba: 'telas', sel: '', carregando: false };
async function temNativo() {
  if (N.ok === null) { try { N.ok = !!(await bs.api('capture/sources', { thumbs: '0' }, { quiet: true }))?.supported; } catch { N.ok = false; } }
  return N.ok;
}
const fonte = (id) => N.fontes && [...N.fontes.screens, ...N.fontes.windows].find((x) => x.id === id);
async function carregarFontes() {
  N.carregando = true; pintar();
  try {
    N.fontes = await bs.api('capture/sources', {}, { quiet: true });
    if (!fonte(N.sel)) N.sel = (N.fontes.screens.find((x) => x.primary) || N.fontes.screens[0])?.id || '';
  } catch (e) { U.escolher = false; G.erroGravar = 'Não deu para listar as telas: ' + e.message; }
  N.carregando = false; pintar();
}
// o WebSocket da captura: resolve quando chega o formato ({audio: {rate}} ou {video: {w, h}})
function abrirCaptura(params) {
  return new Promise((ok, falha) => {
    const ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/api/capture/ws?' + new URLSearchParams(params));
    ws.binaryType = 'arraybuffer'; G.socks.push(ws);
    const t = setTimeout(() => falha(new Error('a IDE não respondeu')), 8000);
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      const m = JSON.parse(e.data);
      if (m.error) { clearTimeout(t); falha(new Error(m.error)); }
      else if (m.audio || m.video) { clearTimeout(t); ws.onmessage = null; ok({ ws, info: m.audio || m.video }); }
    };
    ws.onerror = () => { clearTimeout(t); falha(new Error('a captura da IDE não abriu')); };
  });
}
// toca o PCM que chega (float, 2 canais) dentro do AudioContext; segura no máximo 0,4 s de atraso
const WORKLET = `class P extends AudioWorkletProcessor {
  constructor() { super(); this.q = []; this.off = 0; this.len = 0;
    this.port.onmessage = (e) => { const a = new Float32Array(e.data); this.q.push(a); this.len += a.length;
      while (this.len > sampleRate * 0.8 && this.q.length > 1) { const x = this.q.shift(); this.len -= x.length - this.off; this.off = 0; } }; }
  process(_, outs) { const L = outs[0][0], R = outs[0][1] || L;
    for (let i = 0; i < L.length; i++) {
      if (!this.q.length) { L[i] = R[i] = 0; continue; }
      const a = this.q[0]; L[i] = a[this.off]; R[i] = a[this.off + 1]; this.off += 2; this.len -= 2;
      if (this.off >= a.length) { this.q.shift(); this.off = 0; } }
    return true; } }
registerProcessor('bs-loopback', P);`;
async function somNativo(ctx, ws) {
  await ctx.audioWorklet.addModule('data:text/javascript;charset=utf-8,' + encodeURIComponent(WORKLET));
  const no = new AudioWorkletNode(ctx, 'bs-loopback', { numberOfInputs: 0, outputChannelCount: [2] });
  ws.onmessage = (e) => { if (typeof e.data !== 'string') no.port.postMessage(e.data, [e.data]); };
  ws.onclose = () => { if (G.rec && G.rec.state !== 'inactive' && G.fase !== 'fechando') toast('O som do computador parou de chegar.'); };
  return no;
}
// os quadros JPEG viram uma faixa de vídeo de tamanho fixo (a janela pode mudar de tamanho: entra com tarja)
function videoNativo(ws, info, fps) {
  const W = info.w, H = info.h;
  let faixa, escrever;
  const desenhar = (c, bmp) => {
    const k = Math.min(W / bmp.width, H / bmp.height), w = bmp.width * k, h = bmp.height * k;
    if (w < W || h < H) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }
    c.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
  };
  if (window.MediaStreamTrackGenerator && window.VideoFrame && window.OffscreenCanvas) {
    // não depende da página estar visível (o canvas comum para de gerar quadros com a IDE atrás da reunião)
    const ger = new MediaStreamTrackGenerator({ kind: 'video' }), w = ger.writable.getWriter();
    const oc = new OffscreenCanvas(W, H), c = oc.getContext('2d');
    faixa = ger;
    escrever = (bmp) => { desenhar(c, bmp); w.write(new VideoFrame(oc, { timestamp: Math.round(performance.now() * 1000) })).catch(() => {}); };
  } else {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    faixa = cv.captureStream(fps).getVideoTracks()[0];
    escrever = (bmp) => desenhar(c, bmp);
  }
  let ocupado = false;
  ws.onmessage = async (e) => {
    if (typeof e.data === 'string') {
      if (JSON.parse(e.data).gone && G.rec && G.rec.state !== 'inactive') { toast('A janela gravada foi fechada: gravação salva.'); parar(); }
      return;
    }
    if (ocupado) return; // atrasou: pula o quadro
    ocupado = true;
    try { const bmp = await createImageBitmap(new Blob([e.data], { type: 'image/jpeg' })); escrever(bmp); bmp.close(); } catch { /* quadro ruim */ }
    ocupado = false;
  };
  ws.onclose = () => { if (G.rec && G.rec.state !== 'inactive' && G.fase !== 'fechando') { toast('A imagem parou de chegar: gravação salva.'); parar(); } };
  return faixa;
}

// ---------- microfone: lista, escolha e teste de nível (só enquanto a pessoa testa) ----------
async function carregarMics() {
  try {
    const d = await navigator.mediaDevices.enumerateDevices();
    U.mics = d.filter((x) => x.kind === 'audioinput' && x.deviceId !== 'communications').map((x) => ({ id: x.deviceId === 'default' ? '' : x.deviceId, nome: x.label || 'Microfone' }));
  } catch { U.mics = []; }
  if (U.micId && !U.mics.some((m) => m.id === U.micId)) U.micId = '';
}
const micPedido = () => ({ audio: { ...(U.micId ? { deviceId: { exact: U.micId } } : {}), echoCancellation: true, noiseSuppression: true } });
async function testarMic() {
  if (U.teste) return pararTeste();
  try {
    const st = await navigator.mediaDevices.getUserMedia(micPedido());
    const ctx = new AudioContext(), an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(st).connect(an);
    U.teste = { st, ctx, an, buf: new Uint8Array(512), nivel: 0, fim: setTimeout(pararTeste, 15000) };
    await carregarMics(); // com a permissão dada, os nomes dos microfones aparecem
    pintar();
    const passo = () => {
      const t = U.teste; if (!t) return;
      t.an.getByteTimeDomainData(t.buf);
      let q = 0; for (const v of t.buf) { const x = (v - 128) / 128; q += x * x; }
      t.nivel = Math.max(Math.min(1, Math.sqrt(q / t.buf.length) * 3.2), t.nivel * 0.86);
      R.pagina?.querySelector('[data-nivel="teste"]')?.style.setProperty('--n', t.nivel.toFixed(3));
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  } catch (e) { toast('Não deu para abrir o microfone: ' + (e.name === 'NotAllowedError' ? 'acesso negado' : e.message)); }
}
function pararTeste() {
  const t = U.teste; if (!t) return;
  U.teste = null; clearTimeout(t.fim);
  t.st.getTracks().forEach((x) => x.stop()); t.ctx.close().catch(() => {});
  pintar();
}

// ---------- gravar ----------
function pedirGravar() {
  if (G.fase !== 'livre') return;
  if (G.modo === 'audio' && !G.comMic && !G.comSom) return toast('Escolha ao menos o microfone ou o som do computador.');
  U.perguntar = true; pintar();
}

// "Sim, todos concordaram": com a captura nativa, gravar a tela passa antes pelo seletor do AllRecording
async function confirmou() {
  U.perguntar = false; G.erroGravar = '';
  if (G.modo === 'tela' && await temNativo()) { U.escolher = true; return carregarFontes(); }
  iniciar();
}

async function iniciar() {
  pararTeste();
  U.perguntar = false; U.escolher = false; G.erroGravar = ''; G.fase = 'abrindo'; G.cancelou = false; pintar();
  const q = QUALIDADE[U.cfg.qualidade] || QUALIDADE.leve;
  try {
    let tela = null, mic = null, somN = null, vidN = null;
    const nativo = (G.modo === 'tela' || G.comSom) && await temNativo();
    if (nativo) {
      // o som do computador vem direto do Windows: nada de janela de compartilhar nem de caixinha de áudio
      if (G.comSom) { try { somN = await abrirCaptura({ src: 'audio' }); } catch (e) { toast('Sem o som do computador (' + e.message + '): gravando sem ele.'); } }
      if (G.modo === 'tela') vidN = await abrirCaptura({ src: N.sel, fps: q.fps, max: 1920 });
    } else if (G.modo === 'tela' || G.comSom) {
      // o Chrome só captura o som do computador junto com uma tela, uma janela ou uma aba
      tela = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: q.fps }, audio: G.comSom ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false, systemAudio: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'include' });
      G.streams.push(tela);
    }
    if (G.comMic) {
      try { mic = await navigator.mediaDevices.getUserMedia(micPedido()); G.streams.push(mic); }
      catch (e) { toast('Sem microfone (' + (e.name === 'NotAllowedError' ? 'acesso negado' : e.message) + '): gravando sem ele.'); }
    }
    if (G.comSom && tela && !tela.getAudioTracks().length) toast('O som do computador não veio: na janela de compartilhar, marque "Compartilhar áudio do sistema".');

    // mistura o microfone e o som do computador numa faixa só, com um medidor para cada
    // (na taxa do som do computador, que assim não precisa ser convertido)
    const ctx = G.ctx = new AudioContext(somN ? { sampleRate: somN.info.rate } : undefined);
    const destino = ctx.createMediaStreamDestination();
    const ligarNo = (src, nome) => {
      const ganho = ctx.createGain(), an = ctx.createAnalyser(); an.fftSize = 512;
      src.connect(ganho); ganho.connect(an); ganho.connect(destino);
      G.medidores[nome] = { an, buf: new Uint8Array(an.fftSize), nivel: 0 };
      return ganho;
    };
    const ligar = (stream, nome) => !stream || !stream.getAudioTracks().length ? null : ligarNo(ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())), nome);
    if (somN) ligarNo(await somNativo(ctx, somN.ws), 'som'); else ligar(tela, 'som');
    G.ganhoMic = ligar(mic, 'mic');
    const faixas = [...destino.stream.getAudioTracks()];
    const video = vidN ? videoNativo(vidN.ws, vidN.info, q.fps) : G.modo === 'tela' && tela ? tela.getVideoTracks()[0] : null;
    if (vidN) G.streams.push(new MediaStream([video]));
    if (video) faixas.unshift(video); else if (tela) tela.getVideoTracks().forEach((t) => t.stop()); // só áudio: a imagem não é gravada
    if (!Object.keys(G.medidores).length && !video) throw new Error('Nenhum som para gravar: libere o microfone ou compartilhe o áudio do sistema.');

    const tipos = video ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['audio/webm;codecs=opus', 'audio/webm'];
    const mime = tipos.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const rec = G.rec = new MediaRecorder(new MediaStream(faixas), { mimeType: mime, videoBitsPerSecond: q.bps, audioBitsPerSecond: 96e3 });

    G.id = novoId(); G.parte = 0; G.pausado = 0; G.pausadoEm = 0; G.micMudo = false;
    G.meta = { id: G.id, titulo: (G.titulo || '').trim() || tituloPadrao(), inicio: Date.now(), duracao: 0, modo: video ? 'tela' : 'audio', mime: mime || rec.mimeType,
      fontes: { mic: !!G.medidores.mic, som: !!G.medidores.som }, marcas: [], status: 'gravando', permissao: { confirmada: true, em: new Date().toISOString() } };
    await salvarMeta(G.meta);

    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      const n = ++G.parte, dados = e.data; G.bytes += dados.size;
      G.fila = G.fila.then(() => plugin.files.write(`${PASTA}/${G.meta.id}/partes/${String(n).padStart(6, '0')}.webm`, dados)).catch((err) => toast('Não deu para salvar um pedaço da gravação: ' + err.message));
    };
    rec.onstop = () => finalizar();
    // quem para o compartilhamento pela barra do Chrome também encerra a gravação
    (video || tela?.getAudioTracks()[0])?.addEventListener('ended', () => { if (G.rec && G.rec.state !== 'inactive') parar(); });

    // contagem de 3 s (dá para desligar): a pessoa se ajeita antes de valer
    if (U.contagem) {
      G.fase = 'contagem';
      for (G.conta = 3; G.conta > 0 && !G.cancelou; G.conta--) { pintar(); await new Promise((r) => setTimeout(r, 1000)); }
      if (G.cancelou) { soltar(); G.fase = 'livre'; G.rec = null; await plugin.files.remove(`${PASTA}/${G.meta.id}`).catch(() => {}); G.meta = null; G.id = ''; pintar(); return; }
    }
    rec.start(4000);
    G.inicio = Date.now(); G.fase = 'gravando'; G.bytes = 0;
    U.sel = null; U.midia = null;
    medir(); estado(); pintar(); pintarLado();
  } catch (e) {
    soltar();
    G.fase = 'livre';
    G.erroGravar = e.name === 'NotAllowedError' ? 'Gravação cancelada: o compartilhamento não foi autorizado.' : e.message;
    pintar();
  }
}

function pausar() {
  if (!G.rec) return;
  if (G.rec.state === 'recording') { G.rec.pause(); G.pausadoEm = Date.now(); G.fase = 'pausado'; }
  else if (G.rec.state === 'paused') { G.pausado += Date.now() - G.pausadoEm; G.pausadoEm = 0; G.rec.resume(); G.fase = 'gravando'; }
  estado(); pintar();
}

function mudarMic() {
  if (!G.ganhoMic) return;
  G.micMudo = !G.micMudo;
  G.ganhoMic.gain.value = G.micMudo ? 0 : 1;
  pintar();
}

function marcar(texto, tipo) {
  if (!G.meta || !['gravando', 'pausado'].includes(G.fase)) return false;
  const x = { t: Math.round(decorrido()), texto: (texto || '').trim() };
  if (tipo && TIPOS[tipo]) x.tipo = tipo;
  G.meta.marcas.push(x);
  salvarMeta(G.meta).catch(() => {});
  toast((x.tipo ? TIPOS[x.tipo].nome : 'Momento') + ' marcado em ' + relogio(x.t), 'ok');
  pintar();
}
function tirarMarca(i) {
  if (!G.meta) return;
  G.meta.marcas.splice(i, 1); salvarMeta(G.meta).catch(() => {}); pintar();
}
// marcador depois de gravado (no player): entra no meta da gravação
async function marcarGravada(m, t, tipo) {
  const x = { t: Math.round(t), texto: '' }; if (tipo) x.tipo = tipo;
  m.marcas = [...(m.marcas || []), x].sort((a, b) => a.t - b.t);
  const { arqs, ...meta } = m; await salvarMeta(meta);
  toast('Marcado em ' + relogio(x.t), 'ok'); pintar();
}
async function tirarMarcaGravada(m, i) {
  m.marcas.splice(i, 1); const { arqs, ...meta } = m; await salvarMeta(meta); pintar();
}

function parar() {
  if (!G.rec || G.rec.state === 'inactive') return;
  if (G.pausadoEm) { G.pausado += Date.now() - G.pausadoEm; G.pausadoEm = 0; }
  G.meta.duracao = Math.round(decorrido());
  G.fase = 'fechando'; pintar();
  G.rec.stop(); // o onstop chama finalizar() depois do último pedaço
}

function soltar() {
  G.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
  G.socks.forEach((w) => { w.onclose = null; w.onmessage = null; try { w.close(); } catch { /* já fechou */ } });
  G.streams = []; G.socks = []; G.medidores = {}; G.ganhoMic = null;
  if (G.ctx) { G.ctx.close().catch(() => {}); G.ctx = null; }
}

async function finalizar() {
  soltar();
  const m = G.meta;
  await G.fila;
  try { await juntar(m); } catch (e) { toast('A gravação ficou em pedaços: ' + e.message); }
  G.rec = null; G.meta = null; G.id = ''; G.inicio = 0; G.fase = 'livre'; G.titulo = '';
  estado();
  await carregarLista();
  abrir(m.id);
  toast('Gravação salva', 'ok');
}

// junta os pedaços num arquivo só; com o ffmpeg, regrava o cabeçalho para o player saber a duração e pular no tempo
async function juntar(m) {
  const dir = await dirDe(m.id);
  const ff = await temFfmpeg();
  const script = `$ErrorActionPreference='Stop'; $d=${ps(dir)}; $o=[IO.File]::Create("$d\\bruto.webm");
    Get-ChildItem -LiteralPath "$d\\partes" -Filter *.webm | Sort-Object Name | ForEach-Object { $b=[IO.File]::ReadAllBytes($_.FullName); $o.Write($b,0,$b.Length) }; $o.Close()`;
  const r = await plugin.exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 600000 });
  if (!r.ok) throw new Error((r.err || r.out || 'PowerShell falhou').trim().split('\n').pop());
  let ok = false;
  if (ff) {
    const f = await plugin.exec('ffmpeg', ['-y', '-v', 'error', '-i', dir + '\\bruto.webm', '-c', 'copy', dir + '\\gravacao.webm'], { timeout: 600000 });
    ok = f.ok;
  }
  const mv = ok ? `Remove-Item -LiteralPath ${ps(dir + '\\bruto.webm')}` : `Move-Item -Force -LiteralPath ${ps(dir + '\\bruto.webm')} -Destination ${ps(dir + '\\gravacao.webm')}`;
  await plugin.exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', mv], { timeout: 60000 });
  await plugin.files.remove(`${PASTA}/${m.id}/partes`);
  m.status = 'pronta'; m.cabecalho = ok;
  const { arqs, ...meta } = m;
  await salvarMeta(meta);
}

async function recuperar(m) {
  U.trabalho[m.id] = 'Montando o arquivo com os pedaços salvos…'; pintar();
  try {
    // sem a duração anotada: cada pedaço tem ~4 s
    if (!m.duracao) { try { m.duracao = (await plugin.files.list(`${PASTA}/${m.id}/partes`)).length * 4; } catch {} }
    await juntar(m);
    toast('Gravação recuperada', 'ok');
  } catch (e) { toast('Não deu para recuperar: ' + e.message); }
  delete U.trabalho[m.id];
  await carregarLista(); abrir(m.id);
}

// medidores de nível: só desenham com a tela à vista
function medir() {
  let ultimo = 0;
  const passo = (agora) => {
    if (G.fase === 'livre') return;
    // ~20 quadros por segundo bastam para um medidor (e no modo leve, ~8)
    if (agora - ultimo < (document.documentElement.classList.contains('lite') ? 120 : 50)) return requestAnimationFrame(passo);
    ultimo = agora;
    for (const [nome, md] of Object.entries(G.medidores)) {
      md.an.getByteTimeDomainData(md.buf);
      let s = 0; for (const v of md.buf) { const x = (v - 128) / 128; s += x * x; }
      const n = Math.min(1, Math.sqrt(s / md.buf.length) * 3.2);
      md.nivel = Math.max(n, md.nivel * 0.86);
      const el = R.pagina?.querySelector(`[data-nivel="${nome}"]`);
      if (el) el.style.setProperty('--n', (nome === 'mic' && G.micMudo ? 0 : md.nivel).toFixed(3));
    }
    const t = R.pagina?.querySelector('.gr-tempo');
    if (t) t.textContent = relogio(decorrido());
    const b = R.pagina?.querySelector('.gr-bytes');
    if (b) b.textContent = tamanho(G.bytes) || '0 KB';
    requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

// item na barra de baixo enquanto grava: clica e volta para a tela
let itemStatus = null;
function estado() {
  if (!itemStatus) return;
  const ativo = G.fase !== 'livre';
  itemStatus.hidden = !ativo;
  itemStatus.classList.toggle('gr-st-pausa', G.fase === 'pausado');
  if (ativo) itemStatus.innerHTML = `<span class="gr-st-ponto"></span>${G.fase === 'pausado' ? 'Pausado' : 'Gravando'} <b>${relogio(decorrido())}</b>`;
}
timers.push(setInterval(() => { if (G.fase === 'gravando') estado(); }, 1000));

// ---------- ouvir ----------
async function abrir(id) {
  U.sel = id; U.aba = 'ata';
  if (U.midia) { URL.revokeObjectURL(U.midia.url); U.midia = null; }
  pintarLado();
  bs.pages.open('allrecording');
  pintar();
  const m = U.lista.find((x) => x.id === id);
  if (!m || m.status !== 'pronta') return;
  try {
    const b = await plugin.files.read(`${PASTA}/${id}/gravacao.webm`, 'blob');
    if (U.sel !== id) return;
    U.midia = { id, url: URL.createObjectURL(new Blob([b], { type: m.modo === 'tela' ? 'video/webm' : 'audio/webm' })) };
  } catch (e) { U.midia = { id, erro: e.message }; }
  for (const nome of ['ata.md', 'transcricao.md']) {
    if (m.arqs?.[nome]) { try { U.textos[id + '/' + nome] = await plugin.files.read(`${PASTA}/${id}/${nome}`); } catch {} }
  }
  pintar();
}

function irPara(seg) {
  const v = R.pagina?.querySelector('.gr-player');
  if (!v) return;
  v.currentTime = seg; v.play().catch(() => {});
}

async function renomear(m, nome) {
  nome = (nome || '').trim();
  if (!nome || nome === m.titulo) return;
  m.titulo = nome; const { arqs, ...meta } = m;
  await salvarMeta(meta); pintarLado();
}

function apagar(m) {
  dialog('grDel', `<div class="dlg-hd"><span class="dlg-ic del">${IC.lixo}</span><div><h3>Apagar "${esc(m.titulo)}"?</h3><p>Some o vídeo, a transcrição e a ata desta reunião. Não dá para desfazer.</p></div></div>
    <div class="actions"><button class="chip" data-close>Cancelar</button><button class="chip primary danger" id="grDelOk">Apagar</button></div>`, (el) => {
    el.querySelector('#grDelOk').onclick = async () => {
      fecha(el);
      await plugin.files.remove(`${PASTA}/${m.id}`);
      if (U.sel === m.id) { U.sel = null; if (U.midia) URL.revokeObjectURL(U.midia.url || ''); U.midia = null; }
      carregarLista();
    };
  });
}

async function abrirPasta(m) {
  try { await plugin.exec('explorer.exe', [await dirDe(m.id)]); } catch {}
}

async function exportar(m) {
  // salva uma cópia em Downloads, com o nome da reunião
  const nome = m.titulo.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || m.id;
  const script = `$dl=(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path; $n=Join-Path $dl ${ps(nome + '.webm')}; Copy-Item -LiteralPath ${ps((await dirDe(m.id)) + '\\gravacao.webm')} -Destination $n -Force; $n`;
  const r = await plugin.exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 300000 });
  toast(r.ok ? 'Copiado para ' + r.out.trim() : 'Não deu para copiar: ' + (r.err || '').trim(), r.ok ? 'ok' : undefined);
}

async function exportarAta(m) {
  const t = U.textos[m.id + '/ata.md']; if (!t) return;
  const nome = (m.titulo.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || m.id) + ' - ata.md';
  const script = `$dl=(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path; $n=Join-Path $dl ${ps(nome)}; Copy-Item -LiteralPath ${ps((await dirDe(m.id)) + '\\ata.md')} -Destination $n -Force; $n`;
  const r = await plugin.exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 60000 });
  toast(r.ok ? 'Ata salva em ' + r.out.trim() : 'Não deu para salvar: ' + (r.err || '').trim(), r.ok ? 'ok' : undefined);
}

async function copiarAviso() {
  const txt = (U.cfg.avisoChat || '').trim() || 'Olá, pessoal! Posso gravar esta reunião?';
  try { await navigator.clipboard.writeText(txt); toast('Aviso copiado: cole no chat da reunião', 'ok'); } catch { toast('Não deu para copiar.'); }
}

// ---------- transcrição ----------
// motor local: faster-whisper num ambiente Python só do plugin (some junto com os dados do plugin)
const PY_TRANSCREVER = `# gerado pelo AllRecording: transcreve um arquivo com o faster-whisper e grava JSON
import sys, json
arq, saida, modelo, idioma = sys.argv[1], sys.argv[2], sys.argv[3], (sys.argv[4] if len(sys.argv) > 4 else '')
from faster_whisper import WhisperModel
def carregar():
    try:
        return WhisperModel(modelo, device='auto', compute_type='default')
    except Exception as e:
        print('AVISO placa de vídeo indisponível, usando o processador:', e, flush=True)
        return WhisperModel(modelo, device='cpu', compute_type='int8')
m = carregar()
try:
    segs, info = m.transcribe(arq, language=idioma or None, vad_filter=True, beam_size=5)
    segs = list(_ for _ in segs if print('PROGRESSO %.3f' % min(1, _.end / max(info.duration, 1)), flush=True) or True)
except RuntimeError as e:
    if 'cublas' not in str(e).lower() and 'cudnn' not in str(e).lower() and 'cuda' not in str(e).lower(): raise
    print('AVISO bibliotecas da placa de vídeo faltando, usando o processador', flush=True)
    m = WhisperModel(modelo, device='cpu', compute_type='int8')
    segs, info = m.transcribe(arq, language=idioma or None, vad_filter=True, beam_size=5)
    segs = list(_ for _ in segs if print('PROGRESSO %.3f' % min(1, _.end / max(info.duration, 1)), flush=True) or True)
out = {'idioma': info.language, 'duracao': info.duration, 'segmentos': [{'i': round(s.start, 2), 'f': round(s.end, 2), 't': s.text.strip()} for s in segs]}
with open(saida, 'w', encoding='utf-8') as f: json.dump(out, f, ensure_ascii=False)
print('PRONTO', len(out['segmentos']), flush=True)
`;

async function pythonDoPlugin() {
  const dir = await pastaDados();
  return { venv: dir + '\\venv', py: dir + '\\venv\\Scripts\\python.exe', script: dir + '\\transcrever.py', modelos: dir + '\\modelos' };
}
async function motorPronto() {
  const p = await pythonDoPlugin();
  try { return (await plugin.exec(p.py, ['-c', 'import faster_whisper'], { timeout: 30000 })).ok; } catch { return false; }
}

// roda um programa longo e devolve { code, out, err }; cada linha da saída passa por aoLer
async function rodar(programa, args, opt = {}, aoLer) {
  let out = '', err = '', resto = '';
  const fim = new Promise((ok) => { opt._fim = ok; });
  const h = await plugin.spawn(programa, args, { cwd: opt.cwd, env: opt.env, label: 'AllRecording · ' + (opt.label || programa), onData: (t, s) => {
    if (s === 'err') err = (err + t).slice(-8000); else out += t;
    if (aoLer) { resto += t; const ls = resto.split(/\r?\n/); resto = ls.pop(); ls.forEach(aoLer); }
  }, onExit: (code) => opt._fim(code) });
  if (opt.stdin != null) { await h.write(opt.stdin); await h.close(); }
  U.proc = h;
  const code = await fim;
  U.proc = null;
  return { code, out, err };
}

async function instalarMotor(id) {
  const p = await pythonDoPlugin();
  const passo = (t) => { U.trabalho[id] = t; pintar(); };
  passo('Criando o ambiente do Python…');
  let r = await rodar('python', ['-m', 'venv', p.venv], { label: 'criar ambiente' }).catch((e) => ({ code: 1, err: e.message }));
  if (r.code) throw new Error(/não encontrado|not found|ENOENT/i.test(r.err) ? 'O Python não foi achado. Instale o Python 3.9 ou mais novo (python.org) e tente de novo.' : 'Não deu para criar o ambiente: ' + r.err.trim().split('\n').pop());
  passo('Baixando o faster-whisper (uma vez só, ~150 MB)…');
  r = await rodar(p.py, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', 'faster-whisper', 'av<16'], { label: 'instalar faster-whisper' });
  if (r.code) throw new Error('O pip não instalou o faster-whisper: ' + r.err.trim().split('\n').slice(-2).join(' '));
}

async function agenteCLI(acesso) {
  const qual = U.cfg.agente === 'codex' ? 'codex' : 'claude';
  let a = null;
  try { a = (await bs.api('agents/clis', {}, { quiet: true })).find((x) => x.id === qual || x.kind === qual); } catch { /* Automator desligado: usa o padrão */ }
  const programa = (a?.program || '').trim() || qual;
  const m = ((U.cfg.modeloIA || '').trim() || a?.model || '').trim();
  const nome = qual === 'codex' ? 'Codex' : 'Claude Code';
  const instalar = qual === 'codex' ? 'npm install -g @openai/codex' : 'npm install -g @anthropic-ai/claude-code';
  let args;
  if (qual === 'codex') args = ['exec', '--skip-git-repo-check', ...(acesso === 'escrever' ? ['--full-auto'] : ['--sandbox', 'read-only']), ...(m ? ['-m', m] : []), ...(a?.effort ? ['-c', `model_reasoning_effort="${a.effort}"`] : []), '-'];
  else args = ['-p', '--output-format', 'text', ...(acesso === 'escrever' ? ['--permission-mode', 'acceptEdits', '--allowedTools', 'Bash', 'Read', 'Write', 'Edit'] : ['--permission-mode', 'plan', '--tools', 'Read']), '--strict-mcp-config', '--disable-slash-commands', ...(m ? ['--model', m] : []), ...(a?.effort ? ['--effort', a.effort] : [])];
  return { programa, args, nome, instalar };
}

function textoComTempo(segs) { return segs.map((s) => `[${relogio(s.i)}] ${s.t}`).join('\n'); }

function promptAta(m, segs) {
  const marcas = (m.marcas || []).map((x) => `- ${relogio(x.t)}${rotuloMarca(x) ? ': ' + rotuloMarca(x) : ''}`).join('\n') || '(nenhum)';
  return `Você recebe a transcrição automática de uma reunião. Escreva a ata em português do Brasil, em Markdown, só com o que foi dito.

Reunião: ${m.titulo}
Data: ${new Date(m.inicio).toLocaleString('pt-BR')}
Duração: ${relogio(m.duracao)}
Momentos que quem gravou marcou:
${marcas}

Regras:
- Não invente nomes, números, prazos nem decisões. Se não der para saber quem falou, não atribua.
- A transcrição automática erra palavras: corrija só quando o sentido for óbvio pelo contexto.
- Cite o tempo [mm:ss] ao lado de cada decisão e tarefa, para quem quiser ouvir o trecho.
- Responda só com o Markdown da ata, sem comentários antes ou depois.

Formato:
# ${m.titulo}
## Resumo (3 a 6 frases)
## Decisões
## Tarefas (o quê, quem e prazo, quando foram ditos)
## Pontos em aberto
## Momentos marcados (o que se falava em cada marcador)

Transcrição:
${textoComTempo(segs)}
`;
}

function promptAgenteFazTudo(m, p) {
  return `Na pasta atual há a gravação de uma reunião: gravacao.webm (${m.modo === 'tela' ? 'vídeo com áudio' : 'só áudio'}, ${relogio(m.duracao)}).

Tarefa, nesta ordem:
1. Transcreva o áudio NESTE PC, com uma ferramenta local de reconhecimento de fala (faster-whisper, openai-whisper ou whisper.cpp). Não envie o áudio para serviço nenhum na internet.
   Se não houver nenhuma, pode criar um ambiente Python em ${p.venv} e instalar o faster-whisper nele; os modelos ficam em ${p.modelos} (variável HF_HOME). Idioma: ${(U.cfg.idioma || '').trim() || 'detectar'}. Modelo: ${U.cfg.modeloWhisper || 'small'}.
2. Grave transcricao.json nesta pasta: {"idioma": "..", "duracao": segundos, "segmentos": [{"i": início, "f": fim, "t": "texto"}]}.
3. Grave ata.md nesta pasta, em português do Brasil, só com o que foi dito (sem inventar nomes, números, prazos ou decisões), citando [mm:ss]: título "# ${m.titulo}", depois Resumo, Decisões, Tarefas, Pontos em aberto e Momentos marcados (${(m.marcas || []).map((x) => relogio(x.t) + (rotuloMarca(x) ? ' ' + rotuloMarca(x) : '')).join('; ') || 'nenhum'}).
Não mexa em nenhum outro arquivo fora desta pasta e de ${p.venv}.`;
}

async function transcrever(m) {
  if (U.trabalho[m.id]) return;
  const base = `${PASTA}/${m.id}`;
  const passo = (t) => { U.trabalho[m.id] = t; pintar(); };
  try {
    const p = await pythonDoPlugin();
    const dir = await dirDe(m.id);
    if (U.cfg.quemTranscreve === 'agente') {
      const a = await agenteCLI('escrever');
      passo(`${a.nome} está transcrevendo e escrevendo a ata. Pode levar alguns minutos…`);
      const r = await rodar(a.programa, a.args, { cwd: dir, stdin: promptAgenteFazTudo(m, p), label: a.nome, env: { HF_HOME: p.modelos } }).catch((e) => { throw erroAgente(a, e.message); });
      if (r.code) throw erroAgente(a, r.err || r.out);
    } else {
      // 1) áudio -> texto, no PC
      if (!(await motorPronto())) await instalarMotor(m.id);
      await plugin.files.write('transcrever.py', PY_TRANSCREVER);
      passo('Carregando o modelo de transcrição (a primeira vez baixa o modelo)…');
      const r = await rodar(p.py, [p.script, dir + '\\gravacao.webm', dir + '\\transcricao.json', U.cfg.modeloWhisper || 'small', (U.cfg.idioma || '').trim()],
        { env: { HF_HOME: p.modelos, HF_HUB_DISABLE_SYMLINKS_WARNING: '1', PYTHONIOENCODING: 'utf-8' }, label: 'transcrever' },
        (l) => { const x = /^PROGRESSO ([\d.]+)/.exec(l); if (x) passo(`Transcrevendo no seu PC… ${Math.round(+x[1] * 100)}%`); });
      if (r.code) throw new Error('A transcrição falhou: ' + r.err.trim().split('\n').slice(-2).join(' '));
      const tr = await plugin.files.read(`${base}/transcricao.json`, 'json');
      await plugin.files.write(`${base}/transcricao.md`, `# ${m.titulo}: transcrição\n\n` + tr.segmentos.map((s) => `**${relogio(s.i)}** ${s.t}`).join('\n\n') + '\n');
      if (!tr.segmentos.length) throw new Error('Não se ouviu fala nenhuma na gravação.');
      // 2) texto -> ata, com o agente (só lê o texto que recebe)
      const a = await agenteCLI('ler');
      passo(`${a.nome} está escrevendo a ata…`);
      const q = await rodar(a.programa, a.args, { stdin: promptAta(m, tr.segmentos), label: a.nome }).catch((e) => { throw erroAgente(a, e.message); });
      if (q.code || !q.out.trim()) throw erroAgente(a, q.err || q.out);
      await plugin.files.write(`${base}/ata.md`, q.out.trim().replace(/^```(?:markdown|md)?\n([\s\S]*)\n```$/, '$1') + '\n');
    }
    // o modo "agente faz tudo" deixa só o JSON: monta a versão legível
    if (!(await plugin.files.exists(`${base}/transcricao.md`)) && (await plugin.files.exists(`${base}/transcricao.json`))) {
      const tr = await plugin.files.read(`${base}/transcricao.json`, 'json');
      await plugin.files.write(`${base}/transcricao.md`, `# ${m.titulo}: transcrição\n\n` + (tr.segmentos || []).map((s) => `**${relogio(s.i)}** ${s.t}`).join('\n\n') + '\n');
    }
    toast('Ata pronta', 'ok');
  } catch (e) {
    dialog('grErr', `<div class="dlg-hd"><span class="dlg-ic del">${IC.texto}</span><div><h3>Não deu para transcrever</h3><p>${esc(m.titulo)}</p></div></div>
      <div class="gr-erro-txt">${esc(e.message)}</div><div class="actions"><button class="chip" data-close>Fechar</button><button class="chip" id="grErrCfg">Configurações</button></div>`,
    (el) => { el.querySelector('#grErrCfg').onclick = () => { fecha(el); plugin.settings.open(); }; });
  }
  delete U.trabalho[m.id];
  const id = m.id; await carregarLista(); if (U.sel === id) abrir(id);
}

function erroAgente(a, txt) {
  const t = String(txt || '').trim().split(/\r?\n/).slice(-4).join('\n') || 'terminou sem resposta';
  if (/não encontrado|not found|ENOENT/i.test(t)) return new Error(`O ${a.nome} não está instalado (ou não está no PATH). Instale com \`${a.instalar}\` e faça o login rodando \`${a.programa}\` uma vez no terminal.`);
  return new Error(`${a.nome}: ${t}${/login|auth|api key|credential|unauthori/i.test(t) ? `\n\nFaça o login rodando \`${a.programa}\` no terminal.` : ''}`);
}

function pararTrabalho() { U.proc?.kill(); }

// markdown simples da ata (títulos, listas, negrito, código), sem HTML de fora
function md(txt) {
  const inl = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (_, t) => `<button class="gr-tlink" data-ir="${t}">${t}</button>`);
  let html = '', lista = false;
  for (const l of String(txt || '').replace(/\r/g, '').split('\n')) {
    const h = /^(#{1,4})\s+(.*)$/.exec(l), li = /^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(l);
    if (!li && lista) { html += '</ul>'; lista = false; }
    if (h) html += `<h${h[1].length + 1}>${inl(h[2])}</h${h[1].length + 1}>`;
    else if (li) { if (!lista) { html += '<ul>'; lista = true; } html += `<li>${inl(li[1])}</li>`; }
    else if (l.trim()) html += `<p>${inl(l)}</p>`;
  }
  return html + (lista ? '</ul>' : '');
}
const seg = (t) => t.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);

// ---------- interface ----------
const diaDe = (ms) => { const d = new Date(ms), h = new Date(); h.setHours(0, 0, 0, 0); const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  const n = Math.round((h - dd) / 864e5); return n === 0 ? 'Hoje' : n === 1 ? 'Ontem' : n < 7 ? d.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase()) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: d.getFullYear() === h.getFullYear() ? undefined : 'numeric' }); };
const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function pintarLado() {
  if (!R.lado) return;
  const gravando = G.fase !== 'livre';
  const q = U.busca.trim().toLowerCase();
  const lista = U.lista.filter((m) => m.id !== G.id && (!q || m.titulo.toLowerCase().includes(q)));
  let dia = '', itens = '';
  for (const m of lista) {
    const d = diaDe(m.inicio); if (d !== dia) { dia = d; itens += `<div class="gr-dia">${esc(d)}</div>`; }
    itens += `<div class="gr-li${U.sel === m.id ? ' ativo' : ''}" data-id="${esc(m.id)}" title="${esc(m.titulo)}">
      <span class="gr-li-ic ${m.modo === 'tela' ? 'tela' : 'som'}">${m.modo === 'tela' ? IC.tela : IC.onda}</span>
      <div class="gr-li-tx"><b>${esc(m.titulo)}</b><small>${hora(m.inicio)}${m.duracao ? ' · ' + relogio(m.duracao) : ''}${m.status === 'interrompida' ? ' · <span class="gr-ambar">interrompida</span>' : ''}</small></div>
      ${m.arqs?.['ata.md'] ? `<span class="gr-li-tag" title="Tem ata">${IC.texto}</span>` : (m.marcas || []).length ? `<span class="gr-li-n" title="Marcadores">${m.marcas.length}</span>` : ''}
    </div>`;
  }
  const foco = document.activeElement?.classList.contains('gr-busca-in');
  R.lado.innerHTML = `<div class="gr-lado">
    <button class="chip primary gr-nova"${gravando ? ' disabled' : ''}><span class="gr-ir-ponto"></span>Nova gravação</button>
    ${gravando ? `<div class="gr-li ativo gr-li-rec" data-id=""><span class="gr-li-ic rec">${IC.onda}</span><div class="gr-li-tx"><b>${esc(G.meta?.titulo || 'Gravando')}</b><small>${G.fase === 'pausado' ? 'Pausado' : G.fase === 'contagem' ? 'Começando…' : 'Gravando agora'}</small></div></div>` : ''}
    ${U.lista.length > 4 ? `<label class="gr-busca">${IC.busca}<input class="gr-busca-in" placeholder="Buscar gravação" value="${esc(U.busca)}" spellcheck="false"></label>` : ''}
    <div class="gr-lista">${itens || (gravando ? '' : `<div class="empty">${q ? 'Nada com esse nome.' : 'Nenhuma gravação ainda.'}</div>`)}</div>
  </div>`;
  if (foco) { const i = R.lado.querySelector('.gr-busca-in'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

function onLado(e) {
  if (e.target.closest('.gr-nova')) { U.sel = null; pintarLado(); bs.pages.open('allrecording'); return pintar(); }
  const li = e.target.closest('.gr-li'); if (!li) return;
  if (!li.dataset.id) { U.sel = null; bs.pages.open('allrecording'); pintarLado(); return pintar(); }
  abrir(li.dataset.id);
}

function telaPreparar() {
  const audio = G.modo === 'audio', t = U.teste;
  const recentes = U.lista.filter((m) => m.status === 'pronta').slice(0, 3);
  const micSel = U.mics.length > 1 ? `<select class="gr-mic-sel" aria-label="Qual microfone">${U.mics.map((m) => `<option value="${esc(m.id)}"${m.id === U.micId ? ' selected' : ''}>${esc(m.nome)}</option>`).join('')}</select>` : '';
  return `<div class="gr-centro gr-prep">
    <div class="gr-hero">
      <span class="gr-hero-ic">${ICON}</span>
      <input class="gr-titulo" placeholder="${esc(tituloPadrao())}" value="${esc(G.titulo)}" spellcheck="false" aria-label="Nome da reunião">
    </div>
    <div class="gr-card">
      <div class="gr-modos" role="radiogroup">
        <button class="gr-modo${!audio ? ' on' : ''}" data-modo="tela" role="radio" aria-checked="${!audio}">${IC.tela}<b>Tela e som</b><small>Slides, rostos e a conversa</small></button>
        <button class="gr-modo${audio ? ' on' : ''}" data-modo="audio" role="radio" aria-checked="${audio}">${IC.onda}<b>Só o som</b><small>Arquivo leve, ótimo para a ata</small></button>
      </div>
      <div class="gr-linhas">
        <div class="gr-linha">
          <span class="gr-linha-ic">${IC.mic}</span>
          <div class="gr-linha-tx"><b>Meu microfone</b>${micSel || '<small>O microfone padrão do Windows</small>'}</div>
          ${G.comMic ? `<button class="gr-teste${t ? ' on' : ''}" title="${t ? 'Parar o teste' : 'Ver se o microfone está pegando'}">${t ? `<span class="gr-nivel mini" data-nivel="teste"><i></i></span>Parar` : 'Testar'}</button>` : ''}
          <button class="sw2 gr-sw${G.comMic ? ' on' : ''}" data-fonte="comMic" role="switch" aria-checked="${G.comMic}" title="Gravar o microfone"><span class="kn"></span></button>
        </div>
        <div class="gr-linha">
          <span class="gr-linha-ic">${IC.som}</span>
          <div class="gr-linha-tx"><b>Som do computador</b><small>As outras pessoas da reunião</small></div>
          <button class="sw2 gr-sw${G.comSom ? ' on' : ''}" data-fonte="comSom" role="switch" aria-checked="${G.comSom}" title="Gravar o som do computador"><span class="kn"></span></button>
        </div>
        <div class="gr-linha">
          <span class="gr-linha-ic">${IC.atualizar}</span>
          <div class="gr-linha-tx"><b>Contagem de 3 segundos</b><small>Antes de começar a valer</small></div>
          <button class="sw2 gr-sw${U.contagem ? ' on' : ''}" data-opc="contagem" role="switch" aria-checked="${U.contagem}"><span class="kn"></span></button>
        </div>
      </div>
    </div>
    <div class="gr-aviso">
      <span class="gr-aviso-ic">${IC.mao}</span>
      <div><b>Antes de gravar, peça permissão</b><p>Avise todo mundo e espere o "pode gravar". Gravar sem aviso pode ir contra a LGPD.</p></div>
      <button class="chip gr-copiar">${IC.copiar}Copiar aviso para o chat</button>
    </div>
    ${U.perguntar ? `<div class="gr-confirma">
        <p>${IC.mao}<span>Todos na reunião sabem que ela vai ser gravada e concordaram?</span></p>
        <div><button class="chip gr-ainda">Ainda não</button><button class="chip primary gr-sim">${IC.ok}Sim, todos concordaram</button></div>
      </div>`
      : `<button class="gr-rec" title="Gravar (Enter no nome)"><span></span></button><div class="gr-dica">${dica()}</div>`}
    ${G.erroGravar ? `<div class="gr-erro">${esc(G.erroGravar)}</div>` : ''}
    ${recentes.length ? `<div class="gr-recentes"><div class="gr-sub">Recentes</div>${recentes.map((m) => `<button class="gr-rc" data-abrir="${esc(m.id)}"><span class="gr-li-ic ${m.modo === 'tela' ? 'tela' : 'som'}">${m.modo === 'tela' ? IC.tela : IC.onda}</span><span class="gr-rc-tx"><b>${esc(m.titulo)}</b><small>${dataHora(m.inicio)} · ${relogio(m.duracao)}${m.arqs?.['ata.md'] ? ' · com ata' : ''}</small></span></button>`).join('')}</div>` : ''}
  </div>`;
}

function dica() {
  if (G.modo === 'tela') return N.ok === false ? 'O navegador vai perguntar qual tela ou janela compartilhar' + (G.comSom ? ' (marque "Compartilhar áudio do sistema")' : '') + '.' : 'Depois de confirmar, você escolhe a tela ou a janela.';
  if (!G.comSom) return 'Grava só o seu microfone.';
  return N.ok === false ? 'O navegador vai pedir uma tela só para liberar o som do computador (marque "Compartilhar áudio do sistema").' : G.comMic ? 'Grava o seu microfone e o som do computador.' : 'Grava o som do computador.';
}

function telaEscolher() {
  const f = N.fontes, telas = N.aba === 'telas', lista = !f ? [] : telas ? f.screens : f.windows;
  const cartao = (s) => `<button class="gr-esc${s.id === N.sel ? ' on' : ''}" data-src="${esc(s.id)}" title="${esc(s.name)}">
      <span class="gr-esc-img">${s.thumb ? `<img src="${s.thumb}" alt="">` : `<span>${s.minimized ? 'Minimizada: restaure antes de gravar' : IC.janela}</span>`}</span>
      <span class="gr-esc-nome">${esc(s.name)}</span>
      <small>${telas ? (s.primary ? 'Principal · ' : '') + s.w + ' × ' + s.h : esc(s.app || '')}</small>
    </button>`;
  return `<div class="gr-centro gr-escolher">
    <div class="gr-esc-cab">
      <b>O que gravar?</b>
      <div class="seg" role="tablist"><button class="${telas ? 'on' : ''}" data-esc="telas" role="tab" aria-selected="${telas}">Telas</button><button class="${telas ? '' : 'on'}" data-esc="janelas" role="tab" aria-selected="${!telas}">Janelas</button></div>
      <button class="icon-btn gr-esc-atualizar" title="Atualizar"${N.carregando ? ' disabled' : ''}>${IC.atualizar}</button>
    </div>
    <div class="gr-esc-grade${N.carregando ? ' carregando' : ''}">${!f ? '<div class="gr-carrega"><span class="gr-gira"></span></div>'
      : lista.length ? lista.map(cartao).join('') : '<div class="gr-esc-vazio">Nenhuma janela aberta.</div>'}</div>
    <div class="gr-esc-pe">
      <span class="gr-esc-som">${G.comSom ? IC.som + 'Com o som do computador' : ''}</span>
      <button class="chip gr-esc-voltar">Voltar</button>
      <button class="chip primary gr-ir"${fonte(N.sel) ? '' : ' disabled'}><span class="gr-ir-ponto"></span>Gravar</button>
    </div>
  </div>`;
}

function telaGravando() {
  const m = G.meta || {}, pausado = G.fase === 'pausado', fechando = ['fechando', 'abrindo', 'contagem'].includes(G.fase);
  if (G.fase === 'contagem') return `<div class="gr-centro gr-vivo-tela"><div class="gr-conta">${G.conta}</div><div class="gr-nome">${esc(m.titulo || '')}</div><button class="chip gr-cancelar-conta">Cancelar</button></div>`;
  const marcas = (m.marcas || []).map((x, i) => ({ ...x, i })).reverse();
  return `<div class="gr-centro gr-vivo-tela">
    <div class="gr-vivo${pausado ? ' pausado' : ''}"><span class="gr-ponto"></span>${fechando ? (G.fase === 'abrindo' ? 'Abrindo…' : 'Salvando…') : pausado ? 'Pausado' : 'Gravando'}</div>
    <div class="gr-tempo">${relogio(decorrido())}</div>
    <div class="gr-nome">${esc(m.titulo || '')}</div>
    <div class="gr-info"><span title="Gravado até agora">${IC.disco}<b class="gr-bytes">${tamanho(G.bytes) || '0 KB'}</b></span>${m.modo === 'tela' ? `<span>${IC.tela}Tela</span>` : `<span>${IC.onda}Só o som</span>`}</div>
    <div class="gr-niveis">
      ${G.medidores.mic ? `<div class="gr-nivel${G.micMudo ? ' mudo' : ''}" data-nivel="mic" title="Microfone">${G.micMudo ? IC.micOff : IC.mic}<i></i></div>` : ''}
      ${G.medidores.som ? `<div class="gr-nivel" data-nivel="som" title="Som do computador">${IC.som}<i></i></div>` : ''}
    </div>
    <div class="gr-ctrl">
      ${G.medidores.mic ? `<button class="gr-bt gr-mudo${G.micMudo ? ' on' : ''}" title="${G.micMudo ? 'Ligar o microfone' : 'Silenciar o microfone'}"${fechando ? ' disabled' : ''}>${G.micMudo ? IC.micOff : IC.mic}</button>` : ''}
      <button class="gr-bt gr-pausar" title="${pausado ? 'Continuar' : 'Pausar'}"${fechando ? ' disabled' : ''}>${pausado ? IC.play : IC.pausa}</button>
      <button class="gr-bt gr-parar" title="Parar e salvar"${fechando ? ' disabled' : ''}>${IC.parar}</button>
      <button class="gr-bt gr-marcar" title="Marcar este momento (Ctrl+Alt+M)"${fechando ? ' disabled' : ''}>${IC.marca}</button>
    </div>
    <div class="gr-card gr-marcador">
      <div class="gr-tipos">${Object.entries(TIPOS).map(([k, v]) => `<button class="gr-tipo${U.tipo === k ? ' on' : ''}" data-tipo="${k}" style="--c:${v.cor}"${fechando ? ' disabled' : ''}><i></i>${v.nome}</button>`).join('')}</div>
      <div class="gr-nota"><input class="gr-nota-in" placeholder="${U.tipo ? TIPOS[U.tipo].nome + ': escreva e Enter (ou só Enter)' : 'Nota opcional e Enter para marcar o momento'}" spellcheck="false"${fechando ? ' disabled' : ''}></div>
      ${marcas.length ? `<div class="gr-marcas">${marcas.map((x) => `<div class="gr-marca"${x.tipo ? ` style="--c:${TIPOS[x.tipo].cor}"` : ''}><i class="gr-cor"></i><b>${relogio(x.t)}</b><span>${esc(rotuloMarca(x) || 'Momento marcado')}</span><button class="gr-tirar" data-tirar="${x.i}" title="Tirar este marcador">${IC.x}</button></div>`).join('')}</div>` : ''}
    </div>
  </div>`;
}

function telaGravacao(m) {
  const trab = U.trabalho[m.id];
  if (m.status === 'interrompida') return `<div class="gr-centro"><div class="gr-aviso ambar"><span class="gr-aviso-ic">${IC.onda}</span><div><b>Esta gravação foi interrompida</b><p>A IDE fechou no meio. Os pedaços que chegaram ao disco podem virar o arquivo.</p></div></div>
    ${trab ? `<div class="gr-trab"><span class="gr-gira"></span>${esc(trab)}</div>` : `<div class="gr-acoes"><button class="chip primary gr-recuperar">Montar o arquivo</button><button class="chip gr-apagar">${IC.lixo}Apagar</button></div>`}</div>`;
  const ata = U.textos[m.id + '/ata.md'], trans = U.textos[m.id + '/transcricao.md'];
  const midia = U.midia && U.midia.id === m.id ? U.midia : null;
  const tel = m.modo === 'tela', dur = Math.max(1, m.duracao || 1);
  const aba = U.aba === 'trans' || !ata ? 'trans' : 'ata';
  const marcas = (m.marcas || []).map((x, i) => ({ ...x, i }));
  return `<div class="gr-ver">
    <div class="gr-cab">
      <input class="gr-titulo gr-ren" value="${esc(m.titulo)}" spellcheck="false" aria-label="Nome da reunião">
      <div class="gr-meta"><span>${dataHora(m.inicio)}</span><span>${relogio(m.duracao)}</span><span>${tamanho(m.arqs?.['gravacao.webm'])}</span>${m.fontes ? `<span>${[m.fontes.mic && 'microfone', m.fontes.som && 'som do computador'].filter(Boolean).join(' e ')}</span>` : ''}</div>
    </div>
    <div class="gr-player-box">
      <div class="gr-midia${tel ? '' : ' audio'}">${midia?.url ? (tel ? `<video class="gr-player" controls preload="metadata" src="${midia.url}"></video>` : `<div class="gr-onda">${IC.onda}</div><audio class="gr-player" controls preload="metadata" src="${midia.url}"></audio>`) : midia?.erro ? `<div class="gr-erro">${esc(midia.erro)}</div>` : '<div class="gr-carrega"><span class="gr-gira"></span></div>'}</div>
      <div class="gr-linha-tempo" title="Clique para ir a esse ponto">
        <i class="gr-lt-pos" style="left:0"></i>
        ${marcas.map((x) => `<button class="gr-lt-m" data-t="${x.t}" style="left:${Math.min(100, x.t * 100 / dur).toFixed(2)}%${x.tipo ? ';--c:' + TIPOS[x.tipo].cor : ''}" title="${esc(relogio(x.t) + (rotuloMarca(x) ? ' · ' + rotuloMarca(x) : ''))}"></button>`).join('')}
      </div>
      <div class="gr-pctrl">
        <button class="icon-btn gr-pulo" data-pulo="-10" title="Voltar 10 s (J)">${IC.volta}</button>
        <button class="icon-btn gr-pulo" data-pulo="10" title="Avançar 10 s (L)">${IC.frente}</button>
        <span class="seg gr-vel" title="Velocidade">${[1, 1.25, 1.5, 2].map((v) => `<button data-vel="${v}" class="${U.vel === v ? 'on' : ''}">${String(v).replace('.', ',')}×</button>`).join('')}</span>
        <span class="gr-esp"></span>
        <span class="gr-marcar-aqui">${Object.entries(TIPOS).map(([k, v]) => `<button class="gr-tipo mini" data-aqui="${k}" style="--c:${v.cor}" title="Marcar ${v.nome.toLowerCase()} no ponto atual"><i></i>${v.nome}</button>`).join('')}<button class="chip gr-aqui" data-aqui="" title="Marcar o ponto atual">${IC.marca}Marcar aqui</button></span>
      </div>
    </div>
    ${marcas.length ? `<div class="gr-chips">${marcas.map((x) => `<span class="gr-chipm"${x.tipo ? ` style="--c:${TIPOS[x.tipo].cor}"` : ''}><button class="gr-chip-ir" data-t="${x.t}"><i class="gr-cor"></i><b>${relogio(x.t)}</b>${esc(rotuloMarca(x))}</button><button class="gr-tirar" data-tirarg="${x.i}" title="Tirar este marcador">${IC.x}</button></span>`).join('')}</div>` : ''}
    <div class="gr-acoes">
      ${trab ? `<div class="gr-trab"><span class="gr-gira"></span>${esc(trab)}<button class="chip gr-cancelar">Parar</button></div>`
        : `<button class="chip primary gr-transcrever">${IC.ia}${ata ? 'Transcrever de novo' : 'Transcrever e fazer a ata'}</button>`}
      <span class="gr-esp"></span>
      <button class="icon-btn gr-exportar" title="Copiar o vídeo/áudio para Downloads">${IC.baixar}</button>
      <button class="icon-btn gr-pasta" title="Abrir a pasta">${IC.pasta}</button>
      <button class="icon-btn gr-apagar" title="Apagar">${IC.lixo}</button>
    </div>
    ${ata || trans ? `<div class="gr-docs">
      <div class="gr-abas"><span class="seg">${ata ? `<button class="${aba === 'ata' ? 'on' : ''}" data-aba="ata">Ata</button>` : ''}${trans ? `<button class="${aba === 'trans' ? 'on' : ''}" data-aba="trans">Transcrição</button>` : ''}</span>
        ${aba === 'trans' ? `<label class="gr-busca gr-achar">${IC.busca}<input class="gr-achar-in" placeholder="Achar na transcrição" value="${esc(U.achar)}" spellcheck="false"></label>` : '<span class="gr-esp"></span>'}
        ${aba === 'ata' ? `<button class="icon-btn gr-ata-dl" title="Salvar a ata (.md) em Downloads">${IC.baixar}</button>` : ''}
        <button class="icon-btn gr-copiar-doc" title="Copiar o texto">${IC.copiar}</button></div>
      <div class="gr-doc">${aba === 'trans' ? docTrans(trans) : md(ata)}</div>
    </div>` : !trab ? `<div class="gr-vazio">${IC.texto}<span>Transcreva para ter o texto da reunião e uma ata com resumo, decisões e tarefas, escrita pelo ${U.cfg.agente === 'codex' ? 'Codex' : 'Claude Code'}.</span></div>` : ''}
  </div>`;
}
// transcrição com busca: só as falas que têm o termo, com ele destacado
function docTrans(txt) {
  const q = U.achar.trim().toLowerCase();
  if (!q) return md(txt);
  const linhas = String(txt || '').replace(/\r/g, '').split('\n').filter((l) => /^\*\*\d/.test(l) && l.toLowerCase().includes(q));
  if (!linhas.length) return `<p class="gr-nada">Nada com “${esc(U.achar.trim())}” na transcrição.</p>`;
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return `<p class="gr-nada">${linhas.length} ${linhas.length === 1 ? 'trecho' : 'trechos'}</p>` + linhas.map((l) => `<p>${md(l).replace(/^<p>|<\/p>$/g, '').replace(/(^|>)([^<]+)(?=<|$)/g, (a, p, t) => p + t.replace(re, '<mark>$1</mark>'))}</p>`).join('');
}

function pintar() {
  const el = R.pagina; if (!el) return;
  const foco = document.activeElement && el.contains(document.activeElement) ? document.activeElement.className : '';
  const m = U.sel && U.lista.find((x) => x.id === U.sel);
  // não refaz o player no meio da reprodução: só o que muda em volta
  const player = el.querySelector('.gr-player');
  const manter = player && m && U.midia?.url && player.src === U.midia.url ? player : null;
  el.innerHTML = G.fase !== 'livre' ? telaGravando() : m ? telaGravacao(m) : U.escolher ? telaEscolher() : telaPreparar();
  if (manter) el.querySelector('.gr-player')?.replaceWith(manter);
  ligarPlayer();
  if (foco) { const f = el.querySelector('.' + foco.split(' ')[0]); if (f) { f.focus(); if (f.setSelectionRange && f.value) f.setSelectionRange(f.value.length, f.value.length); } }
}
// a linha do tempo acompanha o player (timeupdate: umas 4 vezes por segundo, sem laço próprio)
function ligarPlayer() {
  const v = R.pagina?.querySelector('.gr-player'); if (!v) return;
  v.playbackRate = U.vel;
  const pos = R.pagina.querySelector('.gr-lt-pos'), m = U.lista.find((x) => x.id === U.sel);
  const dur = () => (isFinite(v.duration) && v.duration) || m?.duracao || 1;
  const mover = () => { if (pos) pos.style.left = Math.min(100, v.currentTime * 100 / dur()).toFixed(2) + '%'; };
  v.ontimeupdate = mover; mover();
}
const playerAgora = () => R.pagina?.querySelector('.gr-player')?.currentTime || 0;

function onPagina(e) {
  const q = (s) => e.target.closest(s);
  const m = U.sel && U.lista.find((x) => x.id === U.sel);
  if (q('.gr-copiar')) return copiarAviso();
  if (q('[data-abrir]')) return abrir(q('[data-abrir]').dataset.abrir);
  if (q('.gr-teste')) return testarMic();
  if (q('[data-opc="contagem"]')) { U.contagem = !U.contagem; pref.set('contagem', U.contagem); return pintar(); }
  if (q('.gr-sw[data-fonte]')) { const k = q('.gr-sw[data-fonte]').dataset.fonte; G[k] = !G[k]; if (k === 'comMic' && !G.comMic) pararTeste(); return pintar(); }
  if (q('.gr-cancelar-conta')) { G.cancelou = true; return; }
  if (q('[data-tipo]')) { const k = q('[data-tipo]').dataset.tipo; U.tipo = U.tipo === k ? '' : k; pintar(); return R.pagina.querySelector('.gr-nota-in')?.focus(); }
  if (q('[data-tirar]')) return tirarMarca(+q('[data-tirar]').dataset.tirar);
  if (q('.gr-lt-m')) return irPara(+q('.gr-lt-m').dataset.t);
  if (q('.gr-linha-tempo')) { const b = q('.gr-linha-tempo').getBoundingClientRect(), v = R.pagina.querySelector('.gr-player'); if (v) { const d = (isFinite(v.duration) && v.duration) || (U.lista.find((x) => x.id === U.sel)?.duracao) || 0; irPara(Math.max(0, (e.clientX - b.left) / b.width) * d); } return; }
  if (q('[data-pulo]')) { const v = R.pagina.querySelector('.gr-player'); if (v) v.currentTime = Math.max(0, v.currentTime + +q('[data-pulo]').dataset.pulo); return; }
  if (q('[data-vel]')) { U.vel = +q('[data-vel]').dataset.vel; const v = R.pagina.querySelector('.gr-player'); if (v) v.playbackRate = U.vel; R.pagina.querySelectorAll('[data-vel]').forEach((b) => b.classList.toggle('on', +b.dataset.vel === U.vel)); return; }
  if (q('.gr-chip-ir')) return irPara(+q('.gr-chip-ir').dataset.t);
  if (q('.gr-modo')) { G.modo = q('.gr-modo').dataset.modo; U.perguntar = false; return pintar(); }
  if (q('.gr-fonte')) return setTimeout(pintar); // a dica embaixo do botão depende das fontes
  if (q('.gr-rec')) return pedirGravar();
  if (q('.gr-sim')) return confirmou();
  if (q('.gr-esc')) { N.sel = q('.gr-esc').dataset.src; return pintar(); }
  if (q('[data-esc]')) { N.aba = q('[data-esc]').dataset.esc; return pintar(); }
  if (q('.gr-esc-atualizar')) return carregarFontes();
  if (q('.gr-esc-voltar')) { U.escolher = false; return pintar(); }
  if (q('.gr-ir')) return fonte(N.sel) && iniciar();
  if (q('.gr-ainda')) { U.perguntar = false; pintar(); return toast('Tudo bem: é só voltar aqui quando todos concordarem.'); }
  if (q('.gr-pausar')) return pausar();
  if (q('.gr-parar')) return parar();
  if (q('.gr-mudo')) return mudarMic();
  if (q('.gr-marcar')) { const i = R.pagina.querySelector('.gr-nota-in'), tp = U.tipo, tx = i?.value; U.tipo = ''; if (i) i.value = ''; marcar(tx, tp); return; }
  if (q('.gr-tlink')) return irPara(seg(q('.gr-tlink').dataset.ir));
  if (!m) return;
  if (q('[data-aqui]')) return marcarGravada(m, playerAgora(), q('[data-aqui]').dataset.aqui);
  if (q('[data-tirarg]')) return tirarMarcaGravada(m, +q('[data-tirarg]').dataset.tirarg);
  if (q('.gr-ata-dl')) return exportarAta(m);
  if (q('.gr-transcrever')) return transcrever(m);
  if (q('.gr-cancelar')) return pararTrabalho();
  if (q('.gr-recuperar')) return recuperar(m);
  if (q('.gr-apagar')) return apagar(m);
  if (q('.gr-pasta')) return abrirPasta(m);
  if (q('.gr-exportar')) return exportar(m);
  if (q('[data-aba]')) { U.aba = q('[data-aba]').dataset.aba; U.achar = ''; return pintar(); }
  if (q('.gr-copiar-doc')) {
    const t = U.textos[m.id + '/' + (U.aba === 'trans' || !U.textos[m.id + '/ata.md'] ? 'transcricao.md' : 'ata.md')] || '';
    navigator.clipboard.writeText(t).then(() => toast('Texto copiado', 'ok'), () => toast('Não deu para copiar.'));
  }
}

function montar(el) {
  R.pagina = el; el.classList.add('gr-pagina');
  el.addEventListener('click', onPagina);
  // dois cliques num cartão do seletor já começam a gravar
  el.addEventListener('dblclick', (e) => { const c = e.target.closest('.gr-esc'); if (c && U.escolher) { N.sel = c.dataset.src; iniciar(); } });
  el.addEventListener('change', (e) => {
    if (e.target.matches('.gr-mic-sel')) { U.micId = e.target.value; pref.set('mic', U.micId); if (U.teste) { pararTeste(); testarMic(); } return; }
    if (e.target.matches('.gr-ren')) { const m = U.lista.find((x) => x.id === U.sel); if (m) renomear(m, e.target.value); }
  });
  let tAchar = 0;
  el.addEventListener('input', (e) => {
    if (e.target.matches('.gr-titulo:not(.gr-ren)')) G.titulo = e.target.value;
    if (e.target.matches('.gr-achar-in')) { U.achar = e.target.value; clearTimeout(tAchar); tAchar = setTimeout(() => { const d = R.pagina.querySelector('.gr-doc'), m = U.lista.find((x) => x.id === U.sel); if (d && m) d.innerHTML = docTrans(U.textos[m.id + '/transcricao.md']); }, 150); }
  });
  // no player: espaço pausa, J e L pulam 10 s (fora dos campos de texto)
  el.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select') || e.ctrlKey || e.altKey || e.metaKey) return;
    const v = el.querySelector('.gr-player'); if (!v || G.fase !== 'livre') return;
    const k = e.key.toLowerCase();
    if (k === 'j' || k === 'l') { v.currentTime = Math.max(0, v.currentTime + (k === 'l' ? 10 : -10)); e.preventDefault(); }
    else if (k === ' ' && e.target === document.body || k === 'k') { v.paused ? v.play().catch(() => {}) : v.pause(); e.preventDefault(); }
  });
  // os atalhos da IDE não podem engolir o que se digita
  for (const ev of ['keydown', 'keypress', 'keyup']) el.addEventListener(ev, (e) => { if (e.target.matches('input, textarea') && !(e.ctrlKey && e.altKey)) e.stopPropagation(); });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.matches('.gr-nota-in')) { const tp = U.tipo, tx = e.target.value; U.tipo = ''; e.target.value = ''; marcar(tx, tp); }
    else if (e.target.matches('.gr-ren')) e.target.blur();
    else if (e.target.matches('.gr-titulo')) pedirGravar();
  });
  pintar();
}

R.lado = document.createElement('div');
R.lado.addEventListener('click', onLado);
R.lado.addEventListener('input', (e) => { if (e.target.matches('.gr-busca-in')) { U.busca = e.target.value; pintarLado(); } });
for (const ev of ['keydown', 'keypress', 'keyup']) R.lado.addEventListener(ev, (e) => { if (e.target.matches('input')) e.stopPropagation(); });

bs.tools.register({ id: 'allrecording', title: 'AllRecording', icon: ICON, order: 76, page: 'allrecording', render() { pintarLado(); bs.$('#toolBody').replaceChildren(R.lado); } });
temNativo().then(() => pintar());
bs.pages.register({ id: 'allrecording', title: 'AllRecording', icon: ICON, pinned: true, render: montar, show() { carregarLista(); carregarMics().then(() => { if (G.fase === 'livre' && !U.sel) pintar(); }); }, hide() { pararTeste(); } });

itemStatus = bs.status.add({ id: 'allrecording', title: 'AllRecording: voltar para a gravação', onclick: () => { U.sel = null; bs.pages.open('allrecording'); pintar(); pintarLado(); } });
if (itemStatus) { itemStatus.classList.add('gr-st'); itemStatus.hidden = true; }

bs.keys.add('Ctrl+Alt+M', () => (G.fase === 'gravando' || G.fase === 'pausado' ? marcar('') : false));
bs.actions.add([
  { label: 'AllRecording: nova gravação de reunião', icon: ICON, run: () => { U.sel = null; bs.pages.open('allrecording'); pintar(); } },
  { label: 'AllRecording: marcar este momento', k: 'Ctrl+Alt+M', icon: ICON, run: () => marcar('') },
  { label: 'AllRecording: parar e salvar', icon: ICON, run: parar },
  { label: 'AllRecording: copiar aviso de gravação para o chat', icon: ICON, run: copiarAviso },
]);

// fechar a IDE gravando perderia só os últimos segundos, mas avisa assim mesmo
const antesDeSair = (e) => { if (G.fase !== 'livre') { e.preventDefault(); e.returnValue = ''; } };
window.addEventListener('beforeunload', antesDeSair);
plugin.onUnload(() => {
  timers.forEach(clearInterval);
  window.removeEventListener('beforeunload', antesDeSair);
  if (G.rec && G.rec.state !== 'inactive') G.rec.stop();
  if (U.midia?.url) URL.revokeObjectURL(U.midia.url);
  pararTeste();
});

carregarLista();
