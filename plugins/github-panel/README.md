# GitHub Panel

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Pizzy-23 |
| **Versão** | 0.1.0 |
| **Licença** | MIT |
| **Categoria** | Integrações |
| **Precisa de** | nada além do BlueScreen |
| **Código** | [plugins/github-panel](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/github-panel) |
<!-- ficha:fim -->

Painel **GitHub** na barra da esquerda com o repositório do projeto aberto, tudo pelo [GitHub CLI](https://cli.github.com) (`gh`). Ele usa o login que o `gh` já tem: nenhum token fica guardado aqui.

## Como usar

- **PRs** abertos, **Meus** (os seus, inclusive os fechados), **Issues** e **Actions**.
- Cada PR mostra se é rascunho, a revisão (aprovado, pediu mudanças) e os checks (✓ 5/5, ✕ falhando, ● rodando).
- Ações ao passar o mouse: **Abrir** no navegador, **Checkout** (pede um segundo clique), **Diff** colorido ali mesmo.
- Actions que falharam: **Log do erro** (só os passos que falharam) e **Rodar de novo**.
- Barra de status: o PR do branch atual e o estado dos checks, atualizado a cada 5 minutos. Clique para abrir.
- Buscar em tudo: abrir o repositório e criar PR do branch atual no navegador.

Precisa do `gh` instalado e com login (`gh auth login`).

## Autor e licença

Feito por Pizzy-23. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.1.0

- Primeira versão na loja.
