# Pegadas (BlueScreen)

Mostra tudo o que o Claude mudou, em qualquer sessão (terminal, app desktop ou o plugin Claude da IDE), e permite desfazer. Abre com Ctrl+Alt+A ou pelo ícone de pulso na barra lateral.

## De onde vem

Dos transcripts do Claude Code em `~/.claude/projects/**/*.jsonl`, inclusive os de subagentes. O plugin só lê esses arquivos: não precisa de hook, não muda a configuração do Claude e pega também o que foi feito antes de ele ser instalado (até o limite de dias das configurações, 30 por padrão). A primeira leitura percorre os arquivos inteiros; depois lê só o que foi acrescentado, a cada 2 s no máximo. A tela confere a cada 4 s.

## O que entra

- **Arquivos**: Edit, Write e NotebookEdit, com o diff e a contagem de linhas.
- **Comandos**: Bash e PowerShell, com a descrição, o comando inteiro, a saída (cortada em 6 mil caracteres) e a duração. Comandos só de consulta ficam escondidos por padrão (filtro "consultas").
- **Outras ferramentas**: MCP, Artifact, Agent e o resto que pode mudar algo. Leituras (Read, Grep, Glob, buscas, snapshots do navegador) ficam de fora.

Cada ação fica sob o pedido que a gerou, e os pedidos sob o dia. Edições seguidas no mesmo arquivo aparecem juntas (×N).

## Telas

- **Linha do tempo**: pedidos com duração, tokens, modelos, falhas, comandos repetidos e ações sensíveis. Cada pedido abre o diff consolidado por arquivo ("mudanças do pedido"), pode ser desfeito inteiro e gera um resumo em texto.
- **Sessões e consumo**: tokens de entrada, saída e cache por sessão (sem repetir a mesma mensagem), modelos e falhas.
- **Histórico do arquivo**: todas as versões que o Claude produziu de um arquivo, reconstruídas a partir do transcript e do disco. Abre também pelo menu de contexto do explorador ("Histórico do Claude") e pela ação do editor "Claude: histórico deste arquivo".

## Chamados

Números de chamado citados no pedido viram filtro na barra lateral. O padrão é uma regex nas configurações do plugin; vazio, reconhece chaves no formato PROJ-123, como as do Jira e o DEM-001 do Dashboard. O pedido seguinte, em até 30 min e sem número próprio, herda o chamado (borda tracejada). Sem número no texto, dá para marcar à mão: **+ chamado no pedido** ou **+ chamado na sessão** aceita um número ou um nome livre ("login do Viagem"), que vira filtro igual a um chamado; o × no selo tira a marca. As marcas ficam em `plugin-data/pegadas/rotulos.json`. A busca de texto também procura no texto do pedido. O resumo por chamado pode ser copiado ou registrado no Dashboard, e a tarefa do Dashboard tem o botão "Pegadas".

## Ações sensíveis

Marcadas em vermelho e filtráveis em "só sensíveis": configuração, credencial, arquivo fora de projeto, reescrita inteira, apagar pasta ou arquivo, git push e git destrutivo, gravação em servidor externo, cofre, encerrar processo, comando de sistema, publicação de pacote, publicação de artifact e ferramenta MCP que grava.

## Desfazer

Escolhe-se o estado "antes" ou "depois" de uma ação, ou o pedido inteiro, e a prévia mostra o diff de cada arquivo com caixa de seleção. Só grava se o arquivo no disco ainda estiver como o plugin espera (hash); se mudou depois, avisa e pula. Antes de gravar, copia o estado atual para `plugin-data/pegadas/backups/<data-hora>/` com um `manifesto.json`. Arquivo criado pelo Claude é apagado ao desfazer. Abas abertas com alteração não salva geram aviso.

## Ao vivo

- Barra de status: "Claude: N mudança(s) hoje · N sensível(is)".
- Aviso no canto quando o Claude mexe numa extensão ou faz algo sensível, com Ver, Desfazer e Fechar; some em 15 s.
- No editor, as linhas que o Claude editou nos últimos 7 dias ganham marca na margem.

## Alvos

| Grupo | Como reconhece |
|---|---|
| Extensões do BlueScreen | arquivo em `~/.bluescreen/plugins/<id>`, na pasta de plugins do programa ou em `plugin-data/<id>`; comando que chama `127.0.0.1:<porta>/api/<id>/` (marcado "API") |
| Projetos | pasta em `~/Repositorys`, `~/source/repos`, `~/repos`, `~/Projetos`, `~/Projects`, `~/git`, `~/dev` ou `~/workspace` (contêineres sem `.git`/`package.json`/`pom.xml`/`Cargo.toml` usam dois níveis), ou outra pasta da home |
| Skills do Claude | `~/.claude/skills/<nome>` |
| Memória do Claude | `~/.claude/projects/*/memory` |
| Configuração | resto de `~/.bluescreen` e `~/.claude` |

Comando que não cita nenhum desses caminhos aparece em "Sem alvo".

## Limites

- A classificação de comandos (consulta, sensível, alvo) é por heurística sobre o texto do comando; o que um script faz por dentro não aparece.
- Desfazer só cobre Edit e Write. Mudança feita por comando aparece, mas não volta pelo plugin.
- Versões intermediárias dependem do transcript; se o arquivo foi mexido fora do Claude no meio do caminho, a reconstrução para naquele ponto.

## Rotas

`pegadas/{rev,eventos,evento,pedido,arquivo,restaurar-previa,restaurar,novas,marcas,resumo,sessoes,status,recarregar}`. `eventos` aceita `dias`, `desde` (ISO), `tipos` (`arquivo,comando,outro`), `consultas=1`, `sensiveis=1`, `grupo`, `alvo`, `semAlvo=1`, `sessao`, `pedido`, `chamado`, `q` e `limite`.

## Instalar em outra máquina

Copiar a pasta `pegadas` inteira para `%USERPROFILE%\.bluescreen\plugins\` e reabrir o BlueScreen (ou ligar o plugin na aba Plugins). Precisa do Node instalado (o servidor é `server.mjs`) e do Claude Code já usado naquela máquina, para existir `~/.claude/projects`. Não usa token nem cofre. O botão no Dashboard e o registro de resumo só aparecem se o plugin Dashboard também estiver instalado.
