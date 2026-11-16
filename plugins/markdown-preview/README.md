# Markdown Preview

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Pizzy-23 |
| **Versão** | 0.1.0 |
| **Licença** | MIT |
| **Categoria** | Produtividade |
| **Precisa de** | nada além do BlueScreen |
| **Código** | [plugins/markdown-preview](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/markdown-preview) |
<!-- ficha:fim -->

Arquivos `.md` e `.markdown` abrem já formatados, com um botão para voltar a editar. Para quem lê e escreve documentação na IDE.

## Como usar

O botão no canto do editor troca entre **Visualizar** e **Editar** (ou `Ctrl+Alt+M`), e a escolha fica por arquivo.

Imagens com caminho relativo ao arquivo aparecem, e um link relativo para outro `.md` abre o arquivo na IDE.

Outros plugins podem pedir para redesenhar: `bs.mdVisual?.sync()` (o Project Tasks usa isso).

## Autor e licença

Feito por Pizzy-23. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.1.0

- Primeira versão na loja.
