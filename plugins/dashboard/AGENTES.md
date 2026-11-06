# Dashboard: guia para agentes

Quadros e tarefas em colunas. Quadros, colunas, status e campos vêm da configuração: leia `GET config` (ou `GET dados`) antes de gravar, em vez de supor ids.

Base: `http://127.0.0.1:4747/api/dashboard/`. Toda resposta é JSON com `ok: true` ou `ok: false, erro`. As escritas só aceitam chamada deste computador.

## Regra de uso

Se a tarefa já existe, acrescente `andamento` em vez de criar outra. Sem número, deixe `numero` vazio e o plugin gera `<prefixo>-NNN` (`config.numeracao`).

## Rotas

| Rota | Método | Corpo | Faz |
|---|---|---|---|
| `dados` | GET | | `{ arquivo, arquivoConfig, rev, config, quadros, items }` |
| `config` | GET | | `{ config, arquivoConfig }` |
| `config` | POST | `{ config }` | troca a configuração inteira (valida e devolve normalizada) |
| `quadros` | GET | | lista de quadros |
| `rev` | GET | | revisão (mtime do arquivo de tarefas) |
| `quadro` | POST | `{ nome, descricao }` cria; `{ id, nome?, descricao? }` altera | quadro salvo |
| `quadro-excluir` | POST | `{ id }` | só quadro não protegido e vazio |
| `item` | POST | `{ id?, campos, andamento? }` | cria (sem `id`) ou altera a tarefa |
| `item-excluir` | POST | `{ id }` | apaga a tarefa |
| `ajuda` | GET | | este guia |

Na criação, `campos.aba` (id do quadro) é obrigatório. Só os campos enviados mudam, e só os que existem em `config.campos` (mais `aba`, `status`, `dataAbertura`, `dataAtualizacao`, `dataEncerramento`); o resto é ignorado. `andamento` vira uma linha datada no `historico`, e a troca de status também. Status de coluna com `fechado: true` grava `dataEncerramento`.

## Configuração

`config.colunas[].status` lista os status válidos (o primeiro de cada coluna é o do arrastar). `config.campos[]` traz `id`, `tipo` (`linha`, `texto`, `data`, `numero`, `opcoes`) e `opcoes`. Para mudar a configuração, faça `GET config`, altere o objeto e mande de volta em `POST config`: quadro com tarefa ou protegido não pode sair, status não pode repetir entre colunas, e `id`, `aba`, `numero`, `status`, `historico`, `desativado` e as datas são reservados.

## Exemplo (Node; o curl do Git Bash estraga acento)

```js
const { config } = await fetch('http://127.0.0.1:4747/api/dashboard/config').then((r) => r.json());
await fetch('http://127.0.0.1:4747/api/dashboard/item', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ campos: { aba: config.quadros[0].id, status: config.colunas[1].status[0] }, andamento: 'Começou a análise' }),
}).then((r) => r.json());
```
