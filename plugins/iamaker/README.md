# IAMaker

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Martin Hartfelder |
| **Versão** | 0.3.0 |
| **Licença** | MIT |
| **Categoria** | Inteligência artificial |
| **Precisa de** | nada além do BlueScreen |
| **Código** | [plugins/iamaker](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/iamaker) |
<!-- ficha:fim -->

Cria e altera plugins do BlueScreen conversando com uma IA de linha de comando (Claude Code, Gemini CLI ou Codex CLI), sem compilar nem recarregar nada. É para quem quer um painel, um atalho ou um ajuste na IDE sem escrever o plugin à mão. Fica numa janela do balão flutuante (`Alt+0`), que você pode mover, redimensionar, minimizar no balão ou encaixar numa região da tela (arraste o topo da janela até um dos alvos).

## Como usar

| | |
|---|---|
| **Balão flutuante** | `Alt+0` ou o balão no canto da tela abre a janela do IAMaker |
| **Aba Plugins** | o ✦ (**Editar com o IAMaker**) no cartão de um plugin abre a conversa dele |
| **Buscar em tudo** | "IAMaker" abre a janela |

1. Abra o IAMaker: `Alt+0`, o balão no canto da tela, ou "IAMaker" no Buscar em tudo.
2. Escolha a IA no topo: **Claude Code**, **Gemini CLI** ou **Codex CLI**.
3. Em **Novo plugin…**, descreva o que você quer. O nome é opcional: em branco, a IA escolhe um nome curto e o IAMaker renomeia a pasta para combinar. Para mudar um plugin que já existe, escolha ele na lista ou clique no ✦ (**Editar com o IAMaker**) no cartão dele, na aba Plugins.
4. A IA avisa onde o componente vai aparecer: balão flutuante, barra de status, barra da esquerda, painel de baixo, resumo do projeto... Esse lugar mostra um carregamento enquanto ela trabalha.
5. Quando ela termina, o IAMaker confere o plugin e carrega ele na IDE aberta, **sem recarregar a página**: o que você tinha aberto continua como estava. O componente aparece no lugar com um contorno de destaque rápido, e uma janela nova no balão já abre.

Peça mudanças na mesma conversa ("deixe o texto verde", "acrescente um atalho"). Cada plugin tem a sua conversa, guardada na pasta de dados do IAMaker. O **＋** no topo começa uma conversa nova e o plugin continua como está.

## O que precisa estar instalado

O programa da IA, no PATH e com o login feito uma vez no terminal:

| IA | Instalar | Login |
|---|---|---|
| Claude Code | `npm install -g @anthropic-ai/claude-code` | `claude` |
| Gemini CLI | `npm install -g @google/gemini-cli` | `gemini` |
| Codex CLI | `npm install -g @openai/codex` | `codex login` |

Sem o programa, o painel mostra o comando e um botão que roda a instalação no terminal da IDE.

## Configurações

Na engrenagem do painel, ou na do cartão na aba Plugins:

| Configuração | O que muda |
|---|---|
| **IA** | qual programa atende os pedidos: Claude Code (`claude`, o padrão), Gemini CLI (`gemini`) ou Codex CLI (`codex`). Ele precisa estar instalado e com o login feito. Também dá para trocar no próprio painel |
| **Esforço** | **Rápido** (o padrão: pensa menos e termina antes), **Equilibrado** ou **Caprichado** (pensa mais, demora mais). Também dá para trocar no topo do IAMaker a qualquer momento. No Claude Code vira `--effort`; no Codex CLI, `model_reasoning_effort`. O Gemini CLI não tem esse ajuste: no Rápido, ele usa o `gemini-2.5-flash` (se você não escolheu outro modelo) |
| **Claude Code: modelo** | opcional, ex.: `opus`, `sonnet`. Em branco, fica o padrão do Claude Code. Vai como `--model` |
| **Gemini CLI: modelo** | opcional, ex.: `gemini-2.5-pro`. Em branco, fica o padrão do Gemini CLI. Vai como `--model` |
| **Codex CLI: modelo** | opcional, ex.: `gpt-5-codex`. Em branco, fica o padrão do Codex CLI. Vai como `-m` |
| **Claude Code: argumentos** | um por linha. O pedido vai sempre pela entrada padrão, e o IAMaker acrescenta `--model`, `--effort` e `--resume`. O padrão é `-p --output-format stream-json --verbose --permission-mode acceptEdits --allowedTools Read,Write,Edit,Glob,Grep --tools Read,Write,Edit,Glob,Grep --strict-mcp-config --disable-slash-commands --setting-sources project,local`. Os últimos (`--tools`, `--strict-mcp-config`, `--disable-slash-commands`, `--setting-sources`) deixam o início mais rápido: só as ferramentas de arquivo, sem servidores MCP, skills e ganchos das suas configurações de usuário |
| **Gemini CLI: argumentos** | um por linha. O pedido vai sempre pela entrada padrão, e o IAMaker acrescenta `--model`. O padrão é `--output-format stream-json --approval-mode auto_edit -p "Siga as instrucoes recebidas pela entrada padrao."`. Se a sua versão do Gemini CLI for antiga e não aceitar `--output-format stream-json` ou `--approval-mode`, troque `--approval-mode auto_edit` por `--yolo` e tire o `--output-format` |
| **Codex CLI: argumentos** | um por linha. O pedido vai sempre pela entrada padrão (o IAMaker acrescenta o `-` no fim), e o IAMaker também acrescenta o modelo. O padrão é `exec --json --full-auto --skip-git-repo-check` |
| **Carregar o plugin sozinho quando a IA terminar** | ligado por padrão: o plugin entra na IDE aberta, sem recarregar a página. Desligado, aparece o botão **Aplicar** |
| **Pedir a correção sozinho quando o plugin tiver erro** | ligado por padrão: o IAMaker pede a correção para a IA, até 2 tentativas seguidas |

## Onde ficam os plugins

- **Novos:** em `~/.bluescreen/plugins/<id>`. São plugins comuns (`plugin.json` + `ui.js` + `style.css`), que você pode abrir, copiar e distribuir pelo servidor de plugins.
- **Os que vêm com o BlueScreen:** nunca são alterados nem sobrepostos. Na primeira mudança, o IAMaker cria uma **versão sua**: um plugin à parte, com id próprio (`<id>-meu`, "Nome (minha versão)"), em `~/.bluescreen/plugins/<id>-meu`. Ela é uma cópia do original, com as configurações e os dados dele, e o `plugin.json` guarda de onde veio (`"basedOn": { "id", "version" }`). A IA só mexe nessa versão.
  - O original continua instalado, sem mudança nenhuma, e fica desligado enquanto a sua versão existir, para os dois não registrarem os mesmos painéis e atalhos. Se outro plugin ligado depende do original, o IAMaker avisa.
  - Pedir outra mudança no original (pela lista ou pelo ✦ no cartão dele) continua na sua versão, com a mesma conversa.
  - Para voltar ao original, remova a sua versão na aba Plugins (ela vai para a Lixeira): na próxima vez que o IAMaker abrir, ele liga o original de novo.
  - Plugins copiados por versões antigas do IAMaker, com o mesmo id do original, continuam como estão e são editados direto, como os seus.
- **Com servidor compilado** (`server.exe`): a IA só mexe na interface (`ui.js`, `style.css`, `plugin.json`), nunca na parte compilada.

## Segurança

- A IA roda com o diretório de trabalho na pasta do plugin.
  - **Claude Code:** só pode ler, procurar e editar arquivos (`--allowedTools Read,Write,Edit,Glob,Grep`), sem rodar comandos.
  - **Codex CLI:** roda com `--full-auto`, numa sandbox que só grava na pasta.
  - **Gemini CLI:** roda com `--approval-mode auto_edit`. Os comandos que pedem aprovação são recusados, porque não há ninguém para aprovar.
- Antes de carregar o plugin, o IAMaker confere se o `plugin.json` é válido e se o `id` é o nome da pasta, e procura erros de sintaxe no `ui.js` sem rodar o código. Com erro, ele não carrega: pede a correção para a IA, até 2 vezes seguidas.
- Erro que o plugin lança logo depois de carregar (num `setTimeout`, num evento) também conta, nos primeiros 3 segundos.

## Como funciona

- As instruções que a IA recebe estão em [`GUIA.md`](GUIA.md): regras, a API `bs`/`plugin`, modelos de painel e a linha `IAMAKER-LUGAR`.
- O Claude Code continua a mesma sessão entre os pedidos (`--resume`). Para o Gemini e o Codex, o IAMaker manda as instruções e o resumo da conversa a cada pedido.
- A saída de cada IA (JSON por linha) vira a conversa na tela: respostas, arquivos lidos e escritos, erros.
- O núcleo não aceita `{{secret:..}}` nem `{{vault:..}}` na entrada de um processo. Por isso, no texto enviado à IA, esses marcadores aparecem como `⟪secret:..⟫`, e o guia explica como escrevê-los.
- Se você recarregar a página com a IA rodando, o IAMaker volta a acompanhar o mesmo processo.
- Cada mudança carrega o plugin de novo com `BS.plugins.reload`, que desfaz o que a versão anterior registrou (veja [PLUGINS.md](https://github.com/martindevbr/BlueScreen-IDE/blob/main/docs/PLUGINS.md#recarregar-sem-recarregar-a-página)). Por isso o guia pede à IA que registre tudo no topo do `ui.js` e use `plugin.onUnload` para `setInterval` e afins.

## Autor e licença

Feito por Martin Hartfelder. Licença MIT (veja o campo `license` do `plugin.json`).

Até a versão 2.1, o IAMaker vinha junto com o BlueScreen. Agora ele é instalado pela loja de plugins.

## Histórico de versões

### 0.3.0

- Passou a ser instalado pela loja (até o BlueScreen 2.1 vinha junto com a IDE).
- Cria e altera plugins conversando com Claude Code, Gemini CLI ou Codex CLI, e carrega o resultado na IDE aberta sem recarregar a página.
- Confere o plugin antes de carregar e, com erro, pede a correção para a IA sozinho, até 2 vezes seguidas.
- **Esforço** ajustável (Rápido, Equilibrado, Caprichado), também no topo do painel.
