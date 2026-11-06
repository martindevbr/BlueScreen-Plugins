# Dashboard (BlueScreen)

Quadros e tarefas em colunas, no jeito do Jira. Abre com Ctrl+Alt+B ou pelo botão de colunas na barra lateral.

Nada de quadro, coluna ou campo fica no código: tudo vem de `config.json` na pasta de dados do plugin (`~/.bluescreen/plugin-data/dashboard/`), editável pelo botão **Configurar** (nos campos ou como JSON) ou pela rota `config`.

## Configuração

| Chave | O que é |
|---|---|
| `titulo`, `subtitulo` | Cabeçalho da tela |
| `arquivo` | JSON das tarefas. Vazio: `tarefas.json` na pasta de dados |
| `numeracao` | Rótulo e ajuda do número, prefixo e dígitos do número automático (`DEM-001`) |
| `diasParado` | Dias sem andamento para o selo "parado" (0 desliga) |
| `diasConcluido` | Dias que as tarefas fechadas ficam à vista (0 mostra todas) |
| `quadros` | `{ id, nome, descricao, protegido }`. Protegido não pode ser excluído |
| `colunas` | `{ id, nome, ajuda, status: [], fechado }`. O primeiro status é o que o arrastar aplica; coluna `fechado` grava a data de encerramento |
| `campos` | `{ id, rotulo, ajuda, tipo, opcoes, padrao, criacao, cartao, busca, ordena, quadros }` |

Campos: `tipo` é `linha`, `texto`, `data`, `numero` ou `opcoes`. `cartao` é vazio, `titulo`, `texto`, `linha` (some quando a tarefa fecha) ou `selo`. `ordena` (só opções) ordena a coluna pela ordem das opções e colore a borda das três primeiras. `quadros` vazio: o campo vale em todos. Número, quadro e status são fixos.

Sem `config.json`, o plugin cria um com um quadro "Geral", quatro colunas e campos básicos (e aproveita o `quadros.json` da versão 1, se existir).

## Dados

O arquivo de tarefas é `{ versao, items: [] }`. Grava com arquivo temporário + rename, backup do dia em `backups/` (30 mantidos) e revisão pelo mtime: a tela confere a cada 4 s e recarrega quando outro programa grava. Remover um campo da configuração não apaga o valor gravado nas tarefas.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `server.mjs` | rotas `dashboard/*` (SDK do BlueScreen) |
| `ui.js`, `style.css` | tela nativa na IDE e o editor da configuração |
| `AGENTES.md` | guia das rotas, servido em `/api/dashboard/ajuda` |
