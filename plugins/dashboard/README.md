# Dashboard

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Luiz Faria |
| **Versão** | 2.0.0 |
| **Licença** | a definir pelo autor |
| **Categoria** | Produtividade |
| **Precisa de** | Node.js 18+ |
| **Código** | [plugins/dashboard](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/dashboard) |
<!-- ficha:fim -->

Quadros e tarefas em colunas, no jeito do Jira, dentro do BlueScreen. Serve para quem quer acompanhar o próprio trabalho (ou o que um agente de IA anda fazendo) sem sair da IDE. Nada de quadro, coluna ou campo fica no código: tudo vem de um `config.json` na pasta de dados do plugin (`~/.bluescreen/plugin-data/dashboard/`), editável pelo botão **Configurar** (nos campos ou como JSON) ou pela rota `config`. Agentes podem ler e gravar tarefas pelas rotas do plugin (veja [AGENTES.md](AGENTES.md)).

Precisa do Node.js 18 ou mais novo (o servidor do plugin é um `server.mjs`).

## Como usar

| | |
|---|---|
| **Barra lateral** | o botão de colunas abre a tela do Dashboard |
| **Atalho** | `Ctrl+Alt+B` abre o Dashboard. `Esc` fecha a tarefa ou a edição aberta e, em seguida, a tela |
| **Buscar em tudo** | "Dashboard: abrir", "Dashboard: nova tarefa" e "Dashboard: configurar" |

Uso mais comum:

1. Escolha o quadro nas abas do topo (o número ao lado é o de tarefas abertas). **+ Quadro** cria outro, e **editar** muda o nome e a descrição do quadro atual.
2. **+ Tarefa** abre o formulário da tarefa nova. O número é gerado sozinho (`DEM-001`, conforme a numeração configurada).
3. Arraste o cartão entre as colunas para mudar o status. Na tarefa aberta, o campo de andamento ("O que foi feito ou descoberto agora") vira uma linha datada no histórico.
4. **Procurar** filtra pelo número ou pelo texto. **mostrar todas as fechadas** e **ver desativadas** mostram o que fica escondido por padrão.
5. Na tarefa aberta: **Salvar**, **Desativar** (ou **Reativar**), **Excluir** e, se o plugin Pegadas estiver instalado, **Pegadas**, que mostra o que o Claude fez com aquele número de tarefa.

O botão **Como funciona** mostra a ajuda dentro da própria tela.

### Configuração

O botão **Configurar** edita o `config.json` nos campos (com **+ Quadro**, **+ Coluna** e **+ Campo**) ou como JSON (**Editar como JSON**). As chaves:

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

## Para agentes

As rotas `dashboard/*` (em `http://127.0.0.1:4747/api/dashboard/`) leem e gravam quadros, tarefas e a configuração. O guia completo está em [AGENTES.md](AGENTES.md), servido também em `GET /api/dashboard/ajuda`. As escritas só aceitam chamada deste computador.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `server.mjs` | rotas `dashboard/*` (SDK do BlueScreen) |
| `ui.js`, `style.css` | tela nativa na IDE e o editor da configuração |
| `AGENTES.md` | guia das rotas, servido em `/api/dashboard/ajuda` |

## Autor e licença

Feito por Luiz Faria.

A licença ainda não foi definida pelo autor (`NOASSERTION` no `plugin.json`): até ele escolher uma, o código não pode ser reaproveitado fora do BlueScreen.

## Histórico de versões

### 2.0.0

- Versão publicada na loja (a primeira registrada neste repositório).
- Quadros, colunas, status e campos dos cartões configuráveis na própria tela (**Configurar**), guardados em `config.json`. Na primeira abertura, aproveita o `quadros.json` da versão 1, se existir.
