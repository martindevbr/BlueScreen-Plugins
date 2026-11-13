// Links diretos do Teams (deep links): montar os que abrem chat, chamada e agendamento, e ler os que a pessoa copia
// do Teams ("Obter link para o canal", "Copiar link" de uma mensagem) para tirar deles os ids que o Graph pede.
// Não precisa de login: é só endereço.

const BASE = 'https://teams.microsoft.com';

export function emails(valor) {
  const lista = Array.isArray(valor) ? valor : String(valor ?? '').split(/[\s,;]+/);
  const vistos = new Set();
  return lista.map((x) => String(x).trim().replace(/^<|>$/g, '')).filter((x) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x)).filter((x) => !vistos.has(x.toLowerCase()) && vistos.add(x.toLowerCase()));
}

function montar(caminho, campos) {
  const q = Object.entries(campos).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return BASE + caminho + (q ? '?' + q : '');
}

// O mesmo link pelo protocolo msteams:, que abre direto no aplicativo, sem passar pelo navegador.
export const paraApp = (url) => String(url).replace(/^https:\/\/[^/]+/i, 'msteams:');

export function linkChat(pessoas, { mensagem, topico } = {}) {
  const lista = emails(pessoas);
  if (!lista.length) throw Object.assign(new Error('Informe o e-mail de pelo menos uma pessoa.'), { status: 400 });
  return montar('/l/chat/0/0', { users: lista.join(','), topicName: lista.length > 1 ? topico : '', message: mensagem });
}

export function linkChamada(pessoas, video = false) {
  const lista = emails(pessoas);
  if (!lista.length) throw Object.assign(new Error('Informe o e-mail de pelo menos uma pessoa.'), { status: 400 });
  return montar('/l/call/0/0', { users: lista.join(','), withVideo: video ? 'true' : '' });
}

export function linkAgendar({ assunto, convidados, inicio, fim, conteudo } = {}) {
  return montar('/l/meeting/new', { subject: assunto, attendees: emails(convidados).join(','), startTime: inicio, endTime: fim, content: conteudo });
}

const decod = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

// Lê um link copiado do Teams. Devolve null se o texto não é um link que dê para usar.
//   canal     { tipo: 'canal', teamId, channelId, nome }
//   mensagem  { tipo: 'mensagem', teamId?, channelId? | chatId?, messageId, raizId }
//   chat      { tipo: 'chat', chatId }
//   reunião   { tipo: 'reuniao', url }
export function lerLink(texto) {
  const t = String(texto ?? '').trim();
  let u;
  try { u = new URL(t.replace(/^msteams:\/?(?=\/?l\/)/i, BASE + '/').replace(/([^:])\/\/l\//, '$1/l/')); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const partes = u.pathname.split('/').filter(Boolean).map(decod);
  const i = partes.indexOf('l');
  if (i < 0) return null;
  const [tipo, a, b] = partes.slice(i + 1);
  const q = u.searchParams;
  if (tipo === 'channel' && a) {
    const teamId = q.get('groupId') || '';
    if (!teamId) return null;
    return { tipo: 'canal', teamId, channelId: a, nome: b || '' };
  }
  if (tipo === 'message' && a && b) {
    const raiz = q.get('parentMessageId') || b;
    if (/@thread\.(tacv2|skype)$/i.test(a) || q.get('groupId')) {
      if (!q.get('groupId')) return null;
      return { tipo: 'mensagem', teamId: q.get('groupId'), channelId: a, messageId: b, raizId: raiz, nome: q.get('channelName') || '' };
    }
    return { tipo: 'mensagem', chatId: a, messageId: b, raizId: raiz };
  }
  if (tipo === 'chat' && a && a.startsWith('19:')) return { tipo: 'chat', chatId: a };
  if (tipo === 'meetup-join') return { tipo: 'reuniao', url: t };
  return null;
}

export const ehLinkTeams = (texto) => /^(https?:\/\/[^/\s]+|msteams:\/?)\/l\/(channel|message|chat|meetup-join|call|meeting|team|entity)\//i.test(String(texto ?? '').trim());
