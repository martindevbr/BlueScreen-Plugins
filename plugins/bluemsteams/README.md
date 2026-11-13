# BlueMSTeamsAutomator

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Martin Hartfelder |
| **Versão** | 1.0.0 |
| **Licença** | MIT |
| **Categoria** | Integrações |
| **Precisa de** | BlueScreen 2.1.33 ou mais novo · Node.js 18+ · plugin `automator` |
| **Automator** | 19 nós (categoria Teams) |
| **Código** | [plugins/bluemsteams](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/bluemsteams) |
<!-- ficha:fim -->

O Microsoft Teams ligado ao BlueScreen e ao Automator: avisar incidente num canal, mandar cartões prontos (incidente, testes, deploy, aprovação), conversar em chat, responder em thread, mencionar pessoas, ler mensagens, reagir a mensagens novas, criar reunião de war room, mudar a presença e mandar arquivos. Traz 19 nós para o Automator, na categoria **Teams**.

Precisa do Node.js 18 ou mais novo (o servidor do plugin é um `server.mjs`) e do plugin Automator ligado.

## Como usar

Abra o painel **Teams** na barra da esquerda e ligue a forma que você tiver (veja [As três formas de ligar](#as-três-formas-de-ligar)): links diretos funcionam sem nada, o webhook dos Workflows envia sem login, e a conta Microsoft libera ler, responder, presença, reuniões e arquivos. Depois, escreva pela aba **Teams**, pelo **Buscar em tudo** ou monte fluxos com os [nós do Automator](#nós-do-automator-categoria-teams).

### Onde fica

| | |
|---|---|
| **Painel Teams** (barra da esquerda) | as três conexões (links diretos, webhooks, conta Microsoft) e os destinos salvos. Botão direito num destino: escrever, testar, trocar a URL, renomear, remover |
| **Aba Teams** | escrever texto ou cartão (com a prévia do cartão como o Teams mostra), o que este PC enviou e as mensagens do destino, meu status, reuniões de hoje e abrir chat, chamada ou reunião no Teams |
| **Buscar em tudo** | "Teams: …" para escrever, alerta de incidente, resultado de testes, deploy, mandar a seleção do editor, presença e war room |
| **Árvore de arquivos** | botão direito num arquivo › **Enviar para o Teams…** |

### As três formas de ligar

O plugin funciona com a que você tiver.

#### 1. Links diretos (sem nada)

Abre o Teams neste PC num chat, numa chamada, numa chamada de vídeo ou no agendamento de uma reunião, já com as pessoas e a mensagem. Não envia nada sozinho.

#### 2. Webhook dos Workflows (sem login e sem TI)

Envia texto e cartões para um canal ou chat, em nome do fluxo.

1. No Teams, clique em **⋯** ao lado do canal › **Workflows**.
2. Escolha **Enviar alertas de webhook para um canal** (ou para um chat) e conclua.
3. Copie a URL que aparece no fim e cole em **Webhooks › +** no painel Teams, com um apelido.

A URL funciona como a senha do canal: fica cifrada no seu PC (`plugin.secrets`) e não vai para os fluxos, que usam só o apelido. URLs dos conectores antigos do Office 365 (`webhook.office.com`) são recusadas, porque a Microsoft aposentou esses conectores. Por webhook não dá para ler mensagens nem mandar arquivo, e os botões dos cartões só abrem links.

#### 3. Conta Microsoft (Microsoft Graph)

Envia em seu nome, lê canais e chats, responde em thread, muda a presença, cria reunião e manda arquivos. Precisa de um app registrado no Microsoft Entra (você ou o TI), uma vez só. A janela **Conta Microsoft** do painel mostra os passos com botões de copiar:

1. **Registre o app:** [entra.microsoft.com](https://entra.microsoft.com) › *Registros de aplicativo* › *Novo registro*. Em *URI de redirecionamento*, escolha **Cliente público/nativo (celular e desktop)** e cole `http://localhost`.
2. Em **Autenticação**, ligue **Permitir fluxos de cliente público**. Em **Permissões de API › Microsoft Graph › Permissões delegadas**, adicione as da tabela abaixo.
3. Na **Visão geral** do app, copie o *ID do aplicativo (cliente)* e o *ID do diretório (locatário)*, cole na janela e clique em **Salvar e entrar**.

O login é por **código de dispositivo**: o plugin mostra um código, abre a página da Microsoft e você digita. Se a empresa bloquear esse tipo de login (Acesso Condicional), use **Entrar pelo navegador** na mesma janela: login com PKCE e retorno em `http://localhost:<porta livre>`.

| Permissão delegada | Para quê | Administrador aprova? |
|---|---|---|
| `User.Read` | saber quem é você | não |
| `User.ReadBasic.All` | achar pessoas pelo e-mail (menções e chats) | não |
| `Team.ReadBasic.All`, `Channel.ReadBasic.All` | listar os seus times e canais | não |
| `ChannelMessage.Send` | enviar e responder em canais | não |
| `Chat.Read`, `ChatMessage.Send`, `Chat.Create` | listar e ler chats, enviar, abrir um chat com alguém | não |
| `Presence.Read`, `Presence.ReadWrite` | ler e mudar a presença e a mensagem de status | não |
| `OnlineMeetings.ReadWrite`, `Calendars.ReadWrite` | criar reunião e ler a agenda | não |
| `Files.ReadWrite.All` | mandar arquivos para canais e chats | não |
| `ChannelMessage.Read.All` | **ler** mensagens de canal | **sim**: só entra no login se você ligar *Ler mensagens de canal* nas configurações do plugin |

Muitas empresas exigem que o administrador aprove qualquer app, mesmo com permissões que não pedem isso: aí o login responde com a mensagem traduzida (AADSTS65001/90094) e o plugin diz o que pedir ao TI. Se faltar uma permissão depois do login, a tela mostra qual e para quê.

Os tokens ficam em `plugin.secrets` (cifrados pelo DPAPI do Windows) e são renovados sozinhos. As rotas do plugin só respondem no próprio PC.

## Configurações

Aba Plugins › engrenagem do BlueMSTeamsAutomator:

| Configuração | O que muda |
|---|---|
| **Client ID do app** | o *ID do aplicativo (cliente)* do registro no Microsoft Entra. Vazio por padrão. Só serve para a conta Microsoft: links diretos e webhooks funcionam sem ele. A janela **Conta Microsoft** do painel também salva este campo |
| **Tenant** | o *ID do diretório (locatário)* ou o domínio da empresa (`empresa.com.br`). O padrão, `organizations`, serve para app multilocatário |
| **Ler mensagens de canal (o administrador precisa aprovar)** | desligado por padrão. Ligado, acrescenta a permissão `ChannelMessage.Read.All` ao login. Sem ela, o plugin envia em canais e lê chats, mas não lê canais. Depois de mudar, entre de novo |
| **Abrir links do Teams** | onde abrem os links de chat, chamada, reunião e canal: **No aplicativo do Teams** (padrão, pelo protocolo `msteams:`) ou **No navegador** |
| **Endereço do Graph (avançado)** | vazio usa `https://graph.microsoft.com/v1.0`. Mude só em nuvem nacional (GCC High, China) ou em teste |
| **Endereço do login (avançado)** | vazio usa `https://login.microsoftonline.com` |

## Nós do Automator (categoria Teams)

Os campos de destino são **listas**: os destinos salvos no painel e, com a conta conectada, os canais de todos os seus times (*Time › Canal*) e os seus chats. **Outro…** aceita o link copiado do Teams, e-mails das pessoas ou `{{input.to}}`. Os erros vêm em português, com o que fazer.

| Nó | O que faz | Precisa de |
|---|---|---|
| Enviar mensagem (webhook) | Texto com título e menções | webhook |
| Enviar cartão | Alerta de incidente, resultado de testes, deploy, pedido de aprovação ou um cartão seu | webhook ou conta |
| Enviar no chat | Mensagem para uma pessoa ou grupo (pelo e-mail ou um chat da lista), com importância | conta |
| Enviar no canal | Conversa nova num canal, com assunto e importância | conta |
| Responder na conversa | Resposta dentro da thread de uma mensagem | conta |
| Mencionar pessoa | `@menção` de uma ou mais pessoas | webhook ou conta |
| Ler mensagens | As últimas de um canal ou chat, com filtros | conta |
| Mensagens novas | O que chegou desde a última vez; sai por **sim** com as mensagens e por **não** sem nada | conta |
| Esperar resposta | Espera "aprovado" ou "recusado" numa conversa (aprovação antes de um deploy) | conta |
| Enviar arquivo | Um arquivo do PC para um canal (aba Arquivos) ou chat (OneDrive, compartilhado com a conversa), até 250 MB | conta |
| Listar times / Listar canais / Listar chats | As listas, com o destino pronto (`to`) para os outros nós | conta |
| Mudar minha presença | Ocupado, Não incomodar, Ausente… por um tempo | conta |
| Mensagem de status | "Em incidente, respondo depois", com prazo | conta |
| Ler minha presença | Como você está agora | conta |
| Criar reunião | Link de reunião agora, daqui a pouco ou num horário; com convidados, entra na agenda | conta |
| Minhas próximas reuniões | Hoje ou nas próximas horas, com o link | conta |
| Abrir no Teams | Chat, chamada, vídeo, agendamento, canal ou link | nada |

### Reagir a mensagens novas

O Automator não tem gatilho de plugin, então o "gatilho" é uma consulta: **Agenda** (a cada 5 minutos, por exemplo) → **Mensagens novas** (canal ou chat, com filtro de texto e de pessoa) → na saída **sim**, o que fazer com `{{input.mensagens}}` ou `{{input.ultima.texto}}`. O nó lembra até onde já leu em cada canal ou chat (`cursores.json` na pasta de dados); na primeira vez só marca o ponto de partida, para não despejar o histórico. As mensagens que você mesmo mandou ficam de fora, a menos que escolha contar.

### Exemplos

- **Incidente:** Ping ou Testar site → na saída **não**, **Criar reunião** (war room) → **Enviar cartão** (Alerta de incidente, com `{{nodes.<reunião>.out.link}}` no link da war room) → **Mudar minha presença** (Não incomodar, 1 h).
- **Aprovação de deploy:** **Enviar no canal** ("Posso subir a 2.14?") → **Esperar resposta** (de quem pode aprovar, até 10 min) → **sim**: rodar o deploy e **Enviar cartão** (Deploy).
- **Relatório:** Agenda (sexta, 17h) → Gravar Excel → **Enviar arquivo** no canal da equipe.

O programa dos nós (`nos.mjs`) não recebe token nem URL de webhook: ele pede a operação ao servidor do plugin por uma porta local com uma chave sorteada a cada início (`ponte.json` na pasta de dados). Um 429 do Teams curto (até 30 s) é esperado e repetido dentro do nó; mais longo, o nó falha com o tempo que falta.

## Limites conhecidos

- Ler mensagens de **canal** exige `ChannelMessage.Read.All`, que só o administrador aprova. Chats não.
- Por webhook o cartão não devolve resposta (os botões só abrem links) e não há id da mensagem para responder em thread.
- Arquivo no chat é compartilhado com quem está na conversa por convite do OneDrive; se a política da empresa não deixar, o arquivo aparece só para quem já tem acesso.
- O envio de arquivo é de uma vez (até 250 MB), sem retomar no meio.

## Arquitetura

**Decisão:** `ui.js` + `server.mjs`
**Analisado em:** 2026-11-13, versão 1.0.0

| Critério | Resultado | Evidência |
|---|---|---|
| Servidor | sim | renovação do token e URLs de webhook fora da página; login com porta local; rotas para os seletores do Automator; nós falam com o servidor |
| N1 a N6 | não | só HTTP e JSON |

## Para desenvolver

```
node tests/logica.test.mjs
```

Testa os links do Teams, os cartões e o cursor das mensagens novas. Para testar o resto sem conta, aponte o plugin para um servidor falso com variáveis de ambiente da IDE: `BLUEMSTEAMS_GRAPH` (no lugar de `https://graph.microsoft.com/v1.0`), `BLUEMSTEAMS_LOGIN` (no lugar de `https://login.microsoftonline.com`) e `BLUEMSTEAMS_NAO_ABRIR=1` (não abre o navegador nem o Teams; a rota `bluemsteams/teste` devolve o último endereço que abriria). Webhooks `http://` só são aceitos para `localhost`/`127.0.0.1`.

## Autor e licença

Feito por Martin Hartfelder. Distribuído sob a licença MIT.

## Histórico de versões

### 1.0.0

- Primeira versão na loja: painel e aba Teams, com três formas de ligar (links diretos, webhook dos Workflows e conta Microsoft pelo Microsoft Graph).
- Cartões prontos (incidente, testes, deploy, aprovação), chats, canais, respostas em thread, menções, leitura de mensagens, presença, reuniões e envio de arquivos.
- 19 nós para o Automator, na categoria **Teams**, incluindo **Mensagens novas** para reagir ao que chega.
