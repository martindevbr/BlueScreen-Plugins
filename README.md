# BlueScreen-Plugins
Biblioteca de plugins da BlueScreen

## Plugins

| Plugin | Pasta (id) | O que faz |
|---|---|---|
| Claude Code | `claude-code` | Claude Code dentro do BlueScreen: conversas em abas, histórico, permissões na tela e processos abertos (Alt+C) |
| Pegadas | `pegadas` | Tudo o que o Claude mudou, com diff, desfazer, filtro por chamado e consumo de tokens (Ctrl+Alt+A) |
| Dashboard | `dashboard` | Quadros e tarefas em colunas; quadros, colunas, status e campos configuráveis na tela (Ctrl+Alt+B) |
| Gavetas | `gavetas` | Gavetas com nome e cor na barra lateral para agrupar os painéis |
| Temas do VS Code | `temas-vscode` | Usa os temas instalados no VS Code, Cursor e Antigravity como aparência do BlueScreen |
| QAutils | `qautils` | Cenários de QA (Gherkin/Cucumber): painel por pasta e por chamado, quadro de execução, evidências, relatórios e casos de teste (Alt+9). Vinha junto com o BlueScreen até a 2.1 |
| IAMaker | `iamaker` | Cria e altera plugins conversando com uma IA (Claude Code, Gemini CLI ou Codex CLI), sem compilar (Alt+0). Vinha junto com o BlueScreen até a 2.1 |

## Arquitetura

```
plugins/
  claude-code/
  pegadas/
  dashboard/
  gavetas/
  temas-vscode/
  qautils/
  iamaker/
```

Cada pasta é um plugin, com o nome igual ao `id` do `plugin.json`.

## Instalação

Copiar a pasta do plugin para `~/.bluescreen/plugins/<id>` e reabrir o BlueScreen (ou ligar o plugin na aba Plugins). Os que têm `server.mjs` precisam do Node instalado.
