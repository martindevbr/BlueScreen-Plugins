# Claude Code

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Luiz Faria |
| **Versão** | 1.1.0 |
| **Licença** | a definir pelo autor |
| **Categoria** | Inteligência artificial |
| **Precisa de** | Node.js 18+ |
| **Código** | [plugins/claude-code](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/claude-code) |
<!-- ficha:fim -->

O Claude Code dentro do BlueScreen, numa tela própria: várias conversas em abas, cada uma numa pasta, o histórico das sessões que você já teve, os pedidos de permissão como cartões com botões, a lista dos processos que o Claude abriu (com botão para matar) e respostas em Markdown com as cores do tema. É para quem já usa o Claude Code no terminal e quer conversar com ele sem sair da IDE, mandando trechos do editor e abrindo os arquivos que ele cita com um clique.

O plugin não traz o Claude: ele roda o `claude.exe` que você já tem instalado, e a conta, o login e a cobrança são os do Claude Code.

## Como usar

| | |
|---|---|
| **Tela do Claude** (`Alt+C` ou o ícone na barra da esquerda) | abas de conversa no topo, histórico à esquerda, a conversa no centro e os processos à direita. `Esc` ou **×** volta ao código |
| **Rodapé** | o item **Claude** mostra o estado geral (trabalhando, aguardando você) e abre a tela com um clique |
| **Editor** | `Ctrl+Alt+C` manda a seleção (caminho, linhas e o código) para a caixa de mensagem da conversa ativa. Sem seleção, manda só o caminho do arquivo |
| **Menu do arquivo** (botão direito num arquivo) | **Perguntar ao Claude sobre este arquivo** põe o caminho na caixa de mensagem |
| **Buscar em tudo** | "Claude Code: abrir", "nova conversa neste projeto", "nova conversa em outra pasta", "perguntar sobre a seleção" e "interromper" |

### Conversar

1. Abra a tela e clique em **Nova conversa** (ou `Ctrl+T`). Escolha a pasta: o projeto aberto, uma das recentes do histórico, uma das pastas da sua pasta de repositórios, ou cole um caminho (`C:\...`) no filtro.
2. Escreva na caixa de baixo. `Enter` envia, `Shift+Enter` quebra a linha e `Ctrl+V` cola imagens da área de transferência (aparecem como miniaturas antes de enviar).
3. A resposta chega aos poucos. Cada ferramenta que o Claude usa vira um cartão recolhível com o tempo que levou: comando (`$` ou `PS>`), edição em forma de diferença, arquivo escrito, lista de tarefas, subagente com o trabalho dele dentro. O pensamento fica num bloco **pensamento** fechado.
4. Ao terminar, a linha final mostra **concluído**, a duração e o custo do turno.

A barra embaixo da caixa mostra a pasta da conversa e escolhe, para a aba ativa:

| Opção | Valores |
|---|---|
| **Modelo** | padrão, opus, sonnet, haiku, fable |
| **Permissões** | perguntar, aceitar edições, planejar, liberar tudo |
| **Esforço** | padrão, baixo, médio, alto, muito alto, máximo |

Modelo e permissões mudam na hora, mesmo com o Claude rodando. O esforço só vale quando o processo reinicia: se a conversa estiver parada esperando, o plugin encerra o processo e ele volta com o esforço novo na próxima mensagem. A última escolha de cada uma vira o padrão das conversas novas. À direita, a barra mostra o tamanho do contexto em tokens e o custo acumulado da aba.

### Permissões e perguntas

Quando o Claude pede para usar uma ferramenta, aparece um cartão **Permitir …?** com o que ele quer fazer:

- **Permitir** libera só esta vez.
- **Permitir sempre nesta sessão** aparece quando o Claude Code sugere uma regra; passe o mouse para ver qual.
- **Negar** recusa, com um motivo opcional que vai para o Claude.

Perguntas do Claude (`AskUserQuestion`) viram opções clicáveis com um campo **Outra resposta…**, e os botões **Responder** e **Ignorar**. Um plano no modo planejar vem com **Aprovar plano** ou **Continuar planejando** (com um campo para dizer o que ajustar).

Se você estiver em outra aba ou fora da tela, um aviso diz quando uma conversa termina ou fica esperando você, e a aba ganha um destaque.

### Atalhos na tela do Claude

| Tecla | O que faz |
|---|---|
| `Ctrl+T` | nova conversa |
| `Ctrl+W` | fecha a aba ativa (pergunta antes se ela estiver trabalhando) |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | próxima / anterior |
| `Ctrl+1` a `Ctrl+9` | vai direto para a aba |
| `Esc` | interrompe o Claude se ele estiver trabalhando; senão, volta ao código |

Nas abas: clique duplo renomeia, clique do meio fecha. O botão **Parar** ao lado de **Enviar** também interrompe.

### Histórico

O painel da esquerda (botão de histórico no topo liga e desliga) lista as sessões salvas pelo Claude Code em `%USERPROFILE%\.claude\projects`, agrupadas por pasta, com a pasta do projeto aberto primeiro (etiqueta **projeto**). Mostra até 10 por pasta, ou 50 quando você filtra pela caixa **Buscar conversas…**. Clique numa sessão para retomá-la numa aba nova: a conversa antiga aparece inteira e a próxima mensagem continua dela (`--resume`). As abas abertas também voltam quando você reabre o BlueScreen.

### Processos

O painel da direita (botão **⚙** no topo) tem um cartão por conversa com o estado, o PID, há quanto tempo o processo está vivo, memória, tokens e custo, e mais:

- **Ferramentas**: as 8 mais recentes, rodando ou terminadas, com o tempo de cada uma.
- **Comandos em execução**: o que o Claude abriu (um `npm run dev`, um servidor, um build), com o botão **matar**, que encerra o processo e os filhos dele.
- **Servidores MCP e auxiliares**: os processos que já estavam de pé quando a sessão começou, numa seção recolhida.
- **Interromper** e **Encerrar processo**. Encerrar mata o `claude.exe`, mas a conversa continua na aba e retoma na próxima mensagem.

### Respostas com as cores do tema

Com a chave **cores** ligada (no topo da tela), o plugin acrescenta ao Claude uma instrução de sistema dizendo que ele pode usar `<span class="verde">`, etiquetas, `<mark>`, `<kbd>` e `<details>` nas respostas do chat (e nunca em arquivos, código ou commits). As cores são tiradas do tema atual da Aparência, com contraste suficiente sobre o fundo, e se ajustam quando você troca de tema. A mudança vale nas conversas novas e nas retomadas.

Caminhos de arquivo em código inline (como `src/App.java:42`) viram links: dentro do projeto aberto, abrem no editor na linha certa; dentro da pasta da conversa, abrem por fora do projeto. Blocos de código ganham cores de sintaxe pelo Monaco e um botão **copiar**.

## O que precisa estar instalado

- **Claude Code** (a CLI `claude.exe`), já com login feito. O servidor procura, nesta ordem: a variável de ambiente `CLAUDE_EXE`, `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe` (instalação pelo npm), `%USERPROFILE%\.local\bin\claude.exe` (instalador nativo) e o que `where claude.exe` encontrar no `PATH`. Se não achar, a conversa mostra "Não consegui iniciar o Claude".
- **Node.js 18 ou mais novo**, para o `server.mjs` do plugin.
- **Windows PowerShell**, usado para listar os processos (`Get-CimInstance Win32_Process`) e `taskkill` para encerrá-los.

A lista de pastas da **Nova conversa** vem da variável `CLAUDE_REPOS` ou, sem ela, da primeira que existir na sua pasta de usuário entre `Repositorys`, `Repositories`, `source\repos`, `repos`, `Projetos`, `Projects`, `git`, `dev` e `workspace`.

## Como funciona

- Cada aba é um processo `claude -p` em modo `stream-json`, com as permissões respondidas pela tela (`--permission-prompt-tool stdio`). O processo só nasce na primeira mensagem e fecha sozinho depois de 30 minutos parado.
- As abas abertas ficam em `%USERPROFILE%\.bluescreen\claude-abas.json`, e a chave **cores** em `%USERPROFILE%\.bluescreen\claude.json`. As conversas em si são as do próprio Claude Code, em `%USERPROFILE%\.claude\projects`.
- O servidor só aceita pedidos com o token do BlueScreen e recusa os que chegam pela rede: o Claude só pode ser usado no próprio PC.
- Quando o BlueScreen fecha, o plugin encerra todos os processos do Claude que abriu.

## Limites conhecidos

- Só funciona no Windows (caminhos, `claude.exe`, PowerShell e `taskkill`).
- Resultados de ferramentas maiores que 20 mil caracteres são cortados na tela, e imagens dentro deles aparecem como `[imagem]`. O Claude recebe tudo; o corte é só no que o painel guarda e mostra.
- O histórico olha as 150 sessões mais recentes.
- Trocar o esforço com o Claude trabalhando só vale depois que o processo reiniciar.
- **Liberar tudo** deixa o Claude rodar qualquer ferramenta sem perguntar, como `--dangerously-skip-permissions` no terminal.
- Um link de arquivo fora do projeto aberto e fora da pasta da conversa não abre (aparece um aviso).

## Autor e licença

Feito por Luiz Faria.

A licença ainda não foi definida pelo autor (`NOASSERTION` no `plugin.json`): até ele escolher uma, o código não pode ser reaproveitado fora do BlueScreen.

## Histórico de versões

### 1.1.0

- Versão publicada na loja (a primeira registrada neste repositório).
- Conversas em abas com histórico das sessões do Claude Code, permissões, perguntas e planos respondidos na tela.
- Painel de processos com as ferramentas em andamento e os comandos que o Claude abriu, com botão para encerrar.
- Respostas com as cores do tema e links que abrem os arquivos citados no editor.
