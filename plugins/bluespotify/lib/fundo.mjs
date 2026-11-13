// Player em segundo plano: toca sem o aplicativo do Spotify instalado.
// O WebView2 do BlueScreen não tem o DRM (Widevine) que o Web Playback SDK exige. O Microsoft Edge, que vem com o
// Windows, tem. Então o servidor abre o Edge (ou o Chrome) sem janela visível, com um perfil só dele, numa página servida
// aqui em 127.0.0.1; ela carrega o SDK e vira o dispositivo "BlueScreen" do Spotify Connect. A tela e os nós mandam
// nele pela Web API, igual a qualquer outro dispositivo.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Edge primeiro (sempre presente no Windows 10 e 11), depois o Chrome. BLUESPOTIFY_NAVEGADOR troca o caminho.
export function acharNavegador(env = process.env) {
  if (env.BLUESPOTIFY_NAVEGADOR) return fs.existsSync(env.BLUESPOTIFY_NAVEGADOR) ? env.BLUESPOTIFY_NAVEGADOR : '';
  const bases = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean);
  const finais = ['Microsoft/Edge/Application/msedge.exe', 'Google/Chrome/Application/chrome.exe'];
  for (const f of finais) for (const b of bases) { const c = path.join(b, f); if (fs.existsSync(c)) return c; }
  return '';
}

// Janela de aplicativo sem barra, com perfil próprio (não mexe no Edge da pessoa) e sem as travas de autoplay e de
// economia de energia para página em segundo plano (o áudio pararia). Ela nasce fora da tela; esconderJanela tira de
// vez (o Edge não respeita o "abrir escondido" do Windows).
export function argumentosNavegador(url, perfil) {
  return [
    '--user-data-dir=' + perfil, '--app=' + url, '--window-size=320,200', '--window-position=-32000,-32000',
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ];
}

// Esconde as janelas cujo título começa com `titulo` (o da página do player, sorteado a cada início), olhando de novo
// por `segundos`: a janela aparece um instante depois de o processo nascer. Usa ShowWindow do Windows por um PowerShell
// sem console; janela escondida não aparece na tela, no Alt+Tab nem na barra de tarefas, e o som continua.
export function esconderJanela(titulo, segundos = 40) {
  if (process.platform !== 'win32' || !/^[a-z0-9-]+$/.test(titulo)) return;
  const script = [
    "$t = '" + titulo + "'",
    "Add-Type -TypeDefinition @'",
    'using System; using System.Text; using System.Runtime.InteropServices;',
    'public static class BspJanela {',
    '  public delegate bool P(IntPtr h, IntPtr l);',
    '  [DllImport("user32.dll")] static extern bool EnumWindows(P f, IntPtr l);',
    '  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);',
    '  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);',
    '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
    '  public static void Esconder(string t) {',
    '    EnumWindows((h, l) => { if (IsWindowVisible(h)) { var s = new StringBuilder(512); GetWindowText(h, s, 512); if (s.ToString().StartsWith(t)) ShowWindow(h, 0); } return true; }, IntPtr.Zero);',
    '  }',
    '}',
    "'@",
    '$fim = (Get-Date).AddSeconds(' + Math.max(1, Math.round(segundos)) + ')',
    'while ((Get-Date) -lt $fim) { [BspJanela]::Esconder($t); Start-Sleep -Milliseconds 120 }',
  ].join(String.fromCharCode(10));
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { stdio: 'ignore', windowsHide: true });
  ps.on('error', () => {});
  return ps;
}

// A página conversa só com a mesma origem e com a chave que veio no endereço. Ela fecha a janela sozinha quando o
// servidor some (plugin desligado ou BlueScreen fechado) ou manda fechar.
export const paginaTocador = (sdk, titulo = 'BlueSpotify') => `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${titulo}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#191b21;color:#e1e4ea;font:14px/1.5 system-ui,sans-serif">
<div style="max-width:360px;padding:20px;text-align:center"><b style="color:#1db954">BlueSpotify</b>
<p id="msg" style="margin:6px 0 0;color:#b4b9c4">Player em segundo plano. O BlueScreen fecha esta janela sozinho.</p></div>
<script>
(() => {
  const chave = new URLSearchParams(location.search).get('k') || '';
  const q = (rota) => '/tocador/' + rota + '?k=' + encodeURIComponent(chave);
  const TENTATIVAS = 3;
  let player = null, falhas = 0, fechando = false, estado = { fase: 'carregando', id: '', msg: '' };
  const tentativa = Number(sessionStorage.getItem('bsp-tentativa') || 0);
  const mostrar = (t) => { document.getElementById('msg').textContent = t; };
  function fechar() {
    if (fechando) return; fechando = true;
    try { if (player) player.disconnect(); } catch {}
    setTimeout(() => window.close(), 300);
  }
  async function avisar(mudou) {
    if (mudou) estado = { ...estado, ...mudou };
    try {
      const r = await fetch(q('estado'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(estado) });
      if (r.status === 403) return fechar(); // outra instância do servidor: esta página ficou órfã
      const j = await r.json(); falhas = 0;
      if (j.fechar) fechar();
    } catch { if (++falhas >= 3) fechar(); }
  }
  setInterval(avisar, 5000);
  // erro de DRM no primeiro uso pode ser o Widevine ainda baixando: recarrega algumas vezes antes de desistir
  function falhou(fase, msg) {
    if (fase === 'erro' && tentativa < TENTATIVAS) { sessionStorage.setItem('bsp-tentativa', String(tentativa + 1)); mostrar('Preparando o player…'); setTimeout(() => location.reload(), 8000); return; }
    mostrar(msg); avisar({ fase, id: '', msg });
  }
  window.onSpotifyWebPlaybackSDKReady = () => {
    player = new window.Spotify.Player({ name: 'BlueScreen', volume: 0.8,
      getOAuthToken: (cb) => { fetch(q('token')).then((r) => r.json()).then((j) => cb(j.token || '')).catch(() => cb('')); } });
    player.addListener('ready', ({ device_id }) => { sessionStorage.removeItem('bsp-tentativa'); mostrar('Pronto. Tocando como "BlueScreen".'); avisar({ fase: 'pronto', id: device_id, msg: '' }); });
    player.addListener('not_ready', () => avisar({ fase: 'carregando', id: '' }));
    player.addListener('initialization_error', ({ message }) => falhou('erro', 'O navegador não conseguiu iniciar o player do Spotify (' + message + ').'));
    player.addListener('authentication_error', () => falhou('auth', 'O Spotify recusou a conexão do player. Saia da conta e conecte de novo.'));
    player.addListener('account_error', () => falhou('sem-premium', 'O Spotify só deixa tocar fora do aplicativo em contas Premium.'));
    player.connect();
  };
  const s = document.createElement('script'); s.src = ${JSON.stringify(sdk)};
  s.onerror = () => falhou('rede', 'Não deu para carregar o player do Spotify (sem internet?).');
  document.head.appendChild(s);
  avisar();
})();
</script></body></html>`;
