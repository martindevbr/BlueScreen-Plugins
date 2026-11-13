# BlueScreen-Plugins

Os plugins da loja do [BlueScreen](https://github.com/martindevbr/BlueScreen-IDE). Cada pasta de `plugins/` é um plugin; a loja da IDE (painel **Plugins**, `Alt+7`) lê este repositório direto do branch `main`, então o que entra aqui chega a todo mundo.

## Plugins

<!-- plugins:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| Plugin | Pasta (id) | Categoria | Versão | Autor | Licença | O que faz |
|---|---|---|---|---|---|---|
| [BlueMSTeamsAutomator](plugins/bluemsteams) | `bluemsteams` | Integrações | 1.0.0 | Martin Hartfelder | MIT | Microsoft Teams no BlueScreen: avisa incidentes, manda cartões, lê e responde mensagens, muda a presença e cria reuniões, por webhook dos Workflows, pela conta Microsoft ou por links. 19 nós no Automator. |
| [BlueSpotify](plugins/bluespotify) | `bluespotify` | Música e mídia | 1.1.1 | Martin Hartfelder | MIT | O Spotify dentro do BlueScreen, leve: suas playlists, curtidas, álbuns e artistas, busca, fila e um player que toca aqui mesmo, sem precisar do aplicativo do Spotify (Premium), ou controla o Spotify do PC ou do celular. Mini player na barra de baixo e nós no Automator. Ctrl+Alt+M. |
| [Claude Code](plugins/claude-code) | `claude-code` | Inteligência artificial | 1.1.0 | Luiz Faria | a definir | Claude Code dentro do BlueScreen: conversas em abas, histórico das sessões, permissões na tela, processos que ele abriu e respostas com as cores do tema. |
| [Dashboard](plugins/dashboard) | `dashboard` | Produtividade | 2.0.0 | Luiz Faria | a definir | Quadros e tarefas em colunas, no jeito do Jira. Quadros, colunas, status e campos dos cartões são configuráveis na própria tela (Configurar). Ctrl+Alt+B. Agentes: GET /api/dashboard/ajuda. |
| [Gavetas](plugins/gavetas) | `gavetas` | Produtividade | 2.0.0 | Luiz Faria | a definir | Gavetas com nome e cor na barra lateral para agrupar os painéis (Claude Code, Dashboard, Pegadas...). Botão direito num ícone da barra › Colocar na gaveta. |
| [IAMaker](plugins/iamaker) | `iamaker` | Inteligência artificial | 0.3.0 | Martin Hartfelder | MIT | Cria e altera plugins do BlueScreen conversando com uma IA (Claude Code, Gemini CLI ou Codex CLI), sem compilar: o plugin aparece na IDE aberta, e erros de código são corrigidos sozinhos (Alt+0). |
| [Pegadas](plugins/pegadas) | `pegadas` | Inteligência artificial | 2.0.0 | Luiz Faria | a definir | Tudo o que o Claude mudou, agrupado pelo pedido: arquivos com diff, comandos, skills e memória. Desfaz edição ou pedido inteiro, filtra por chamado, destaca ações sensíveis e mostra o consumo de tokens (Ctrl+Alt+A). |
| [QAutils](plugins/qautils) | `qautils` | Qualidade e testes | 2.2.0 | Martin Hartfelder | MIT | Cenários de QA (Gherkin/Cucumber): painel por pasta e chamado, quadro de execução, autocompletar de passos, evidências, relatórios, casos de teste em CSV e relatório de bug (Alt+9). |
| [Temas do VS Code](plugins/temas-vscode) | `temas-vscode` | Aparência | 1.1.0 | Luiz Faria | a definir | Usa no BlueScreen os temas instalados no VS Code, Cursor e Antigravity (ou um .json de tema): cores da interface e da sintaxe viram uma predefinição da Aparência. |
<!-- plugins:fim -->

## Instalar

Pela IDE: painel **Plugins** (`Alt+7`) › **Loja de plugins** › **Instalar**. O plugin liga na hora, e a IDE avisa quando sair versão nova.

À mão: copie a pasta do plugin para `~/.bluescreen/plugins/<id>` e ligue na aba Plugins. Os que têm servidor (`server.mjs`) precisam do Node.js 18 ou mais novo.

## Colaborar

Plugins novos, correções e ideias são bem-vindos. O caminho completo está em [CONTRIBUTING.md](CONTRIBUTING.md). Em resumo:

```
node ferramentas/plugins.mjs novo meu-plugin --nome "Meu Plugin" --autor "Seu Nome" --categoria produtividade
node ferramentas/plugins.mjs tudo
```

Depois, um pull request para o `main`. O CI confere o padrão (manifesto, README, ícone, nós do Automator, sintaxe, segredos vazados, testes e versão), e o plugin entra na loja quando o PR é aceito.

- Achou um problema num plugin? [Abra uma issue](https://github.com/martindevbr/BlueScreen-Plugins/issues/new/choose).
- Tem a ideia, mas não vai escrever o código? Use o modelo **Ideia de plugin** nas issues.

## Como o repositório é organizado

```
plugins/<id>/          um plugin: plugin.json, README.md, ícone e o código (ui.js, style.css, server.mjs, automator.json)
modelo-de-plugin/      o ponto de partida do comando "novo"
ferramentas/           plugins.mjs: validar, testar, gerar fichas e tabela, conferir versões, criar plugin
.github/               CI, modelos de issue e de pull request
```

## Licença

Cada plugin tem a sua licença, no campo `license` do `plugin.json` e na ficha do README dele. Plugins novos nascem MIT. `NOASSERTION` quer dizer que o autor ainda não escolheu: até lá, o código não pode ser reaproveitado. O resto do repositório (ferramentas, modelo, CI) é MIT: veja [LICENSE](LICENSE).
