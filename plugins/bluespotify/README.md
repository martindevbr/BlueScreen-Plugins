# BlueSpotify

O Spotify dentro do BlueScreen, mais leve que o aplicativo: a sua biblioteca (playlists, Curtidas, álbuns, artistas, tocadas recentemente), busca, fila, dispositivos, volume e um player compacto no rodapé. Toca dentro da IDE, sem precisar do aplicativo do Spotify instalado (conta Premium), ou controla o Spotify aberto no PC, no celular ou numa caixa de som. Traz também 11 nós para o Automator, na categoria **Spotify**.

Precisa do Node.js 18 ou mais novo (o servidor do plugin é um `server.mjs`).

## Onde fica

| | |
|---|---|
| **Painel BlueSpotify** (barra da esquerda) | Curtidas, Tocadas recentemente, Álbuns, Artistas e as suas playlists, com filtro. Botão direito numa playlist: tocar, abrir no Spotify, copiar o link |
| **Aba BlueSpotify** (`Ctrl+Alt+M`) | a tela grande: listas, busca, página de álbum e de artista, fila e o player completo (aleatório, repetir, posição, dispositivo, volume) |
| **Rodapé** | o que está tocando. Clique no ícone para tocar ou pausar; no nome, abre o **player compacto** (capa, controles, posição, dispositivo e volume) sem sair do que você está fazendo |
| **Teclas** | `Ctrl+Alt+P` toca ou pausa, `Ctrl+Alt+.` próxima, `Ctrl+Alt+,` anterior. Na aba: `Espaço` toca ou pausa, `/` busca, setas e `Enter` escolhem a faixa, `Alt+←` volta |
| **Buscar em tudo** | "BlueSpotify: …" para abrir, tocar, pular, curtir, buscar, ver a fila, trocar de dispositivo e abrir o player compacto |

## Primeira vez: três passos

O Spotify não deixa mais um app servir a todo mundo: cada pessoa cria o seu, de graça, no painel de desenvolvedores. A aba BlueSpotify mostra estes passos com os botões de copiar:

1. **Crie o app** em [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) (**Create app**). Nome e descrição ficam a seu gosto.
2. **Cadastre o endereço de retorno** em *Redirect URIs*: `http://127.0.0.1:8974/callback` (exatamente assim). Em *Which API/SDKs are you planning to use?*, marque **Web API** e **Web Playback SDK** e salve.
3. **Cole o Client ID** na aba BlueSpotify e clique em **Salvar e conectar**. O BlueSpotify confere com o Spotify se o Client ID existe antes de abrir o navegador; o login acontece no site do Spotify e o plugin nunca vê a sua senha.

Regras do Spotify para apps novos (modo de desenvolvimento, desde fevereiro de 2026): a conta que cria o app precisa ser **Premium**, e o app vale para ela e para até 5 contas convidadas em *User Management*. A porta 8974 pode ser trocada nas configurações do plugin (Aba Plugins › engrenagem); troque também no painel do Spotify.

## Tocar: aqui ou em outro aparelho

- **Aqui no BlueScreen, sem o aplicativo do Spotify.** Com Premium, o plugin usa o Web Playback SDK do Spotify e a IDE aparece como um dispositivo do Spotify Connect chamado **BlueScreen**. O SDK exige o DRM Widevine, que o WebView2 normalmente não tem: nesse caso o servidor do plugin abre o **Microsoft Edge** (que vem com o Windows; sem ele, o Google Chrome) **escondido**, com um perfil só dele em `<pasta de dados>/tocador`, e é ele que toca. Não aparece janela nem mexe no Edge que você usa; ele fecha junto com o plugin. Se algo der errado, **Dispositivos** mostra o motivo e o botão *Tocar neste PC de novo*. Desligue em *Tocar aqui no BlueScreen* se preferir só controlar.
- **Em outro aparelho (Spotify Connect).** O player controla o Spotify aberto no PC, no celular, na TV ou na caixa de som. **Dispositivos** (no player ou no player compacto) lista os aparelhos e leva a música para o escolhido. Se nada estiver tocando em lugar nenhum, o primeiro play escolhe um aparelho aberto sozinho.
- **Conta Free.** O Spotify não deixa apps tocarem nem controlarem a reprodução sem Premium. A faixa no topo avisa, e os botões de tocar passam a abrir a faixa no aplicativo do Spotify.

## Nós do Automator (categoria Spotify)

| Nó | O que faz |
|---|---|
| Tocar | Toca uma faixa, álbum, playlist (as suas primeiro), artista ou as Curtidas, pelo nome ou pelo link; escolhe o dispositivo numa lista |
| Pausar ou retomar | Pausa, retoma ou alterna |
| Próxima ou anterior | Pula e devolve a faixa nova |
| Volume | Define, aumenta ou diminui |
| O que está tocando | Faixa, artista, álbum, capa, posição, dispositivo |
| Buscar | Faixas, álbuns, artistas ou playlists (até 10, limite do Spotify) |
| Adicionar à fila | Pelo nome ou pelo link |
| Curtir a faixa atual | Põe ou tira das Curtidas |
| Adicionar faixa a uma playlist | Numa playlist sua (escolhida numa lista), sem repetir |
| Trocar de dispositivo | Leva a reprodução para o PC, o celular, a caixa de som |
| Listar dispositivos | Os aparelhos com o Spotify aberto |

Exemplo: **Agenda** (dias úteis, 9h) → **Tocar** ("Foco para programar", aleatório) → **Volume** (30). O programa dos nós (`no.mjs`) não recebe token: ele pede a ação ao servidor do plugin por uma porta local com uma chave sorteada a cada início (`ponte.json` na pasta de dados).

## Segurança e dados

- O token de renovação fica em `plugin.secrets` (cifrado pelo DPAPI do Windows, só o seu usuário neste PC abre). O token de acesso fica só na memória do servidor do plugin e só vai para a página quando o Web Playback SDK pede (é exigência do SDK).
- O player em segundo plano é uma página servida pelo próprio servidor em `127.0.0.1`, com uma chave sorteada a cada início; sem a chave, a página e o token não saem. Ela não manda o endereço para o Spotify (`Referrer-Policy: no-referrer`) e fecha sozinha quando o servidor para de responder.
- As rotas do plugin recusam pedidos que chegam pela rede local.
- **Sair da conta** (menu da conta, na aba) apaga o token; o Client ID fica nas configurações.

## Limites conhecidos

- A Web API não entrega mais as faixas de playlists de outras pessoas (só as suas e as colaborativas): essas playlists tocam inteiras ou abrem no aplicativo.
- O Spotify tirou as "mais tocadas" do artista da API: a página do artista mostra os álbuns e o botão que toca o artista.
- A busca devolve no máximo 10 itens por tipo.
- Tocar neste PC precisa do Microsoft Edge ou do Google Chrome instalado (o Edge vem com o Windows 10 e 11). Sem nenhum dos dois, o BlueSpotify só controla outro aparelho.

## Origem

A abordagem segue a do [Spotifast](https://github.com/crmne/spotifast) (cliente leve de Spotify em Rust, licença MIT): app próprio de cada pessoa com o Client ID colado no programa, login Authorization Code com PKCE e retorno num endereço `http://127.0.0.1:<porta>`, ignorar pedidos que não são o retorno (favicon), e conferir se o Client ID existe antes de abrir o navegador (um pedido de token com um código inválido responde `invalid_client` para um ID que o Spotify não conhece). Nenhum código do Spotifast foi copiado: ele é Rust com player próprio (librespot), e o BlueSpotify é JavaScript e usa a Web API, o Web Playback SDK e o Spotify Connect.

## Arquitetura

**Decisão:** `ui.js` + `server.mjs`
**Analisado em:** 2026-11-13, versão 1.1.0

| Critério | Resultado | Evidência |
|---|---|---|
| Servidor | sim | o retorno do login precisa de uma porta local; o token de renovação fica fora da página; os nós do Automator falam com o servidor; o player em segundo plano (Edge) é aberto e servido por ele |
| N1 a N6 | não | só HTTP e JSON; nada de CPU pesada nem biblioteca nativa |

## Para desenvolver

```
node tests/logica.test.mjs
```

Para testar sem conta, aponte o plugin para um servidor falso com as variáveis de ambiente da IDE: `BLUESPOTIFY_API_BASE` (no lugar de `https://api.spotify.com/v1`), `BLUESPOTIFY_ACCOUNTS_BASE` (no lugar de `https://accounts.spotify.com`), `BLUESPOTIFY_SDK_URL` (o script do Web Playback SDK), `BLUESPOTIFY_NAVEGADOR` (o executável do navegador do player em segundo plano) e `BLUESPOTIFY_NAO_ABRIR=1` (não abre o navegador; a URL do login vai para o `bluescreen.log`). Nesse modo a tela aceita Client ID em qualquer formato.
