# SQLite Browser

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Pizzy-23 |
| **Versão** | 0.1.0 |
| **Licença** | MIT |
| **Categoria** | Desenvolvimento |
| **Precisa de** | nada além do BlueScreen |
| **Código** | [plugins/sqlite-browser](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/sqlite-browser) |
<!-- ficha:fim -->

Arquivos `.db`, `.sqlite`, `.sqlite3`, `.db3` e `.s3db` abrem numa aba própria, em vez do hexadecimal.

## Como usar

- À esquerda, as tabelas e views, com quantas linhas cada tabela tem. A estrutura (`CREATE TABLE`) aparece ao passar o mouse e embaixo dos dados.
- Os dados vêm em páginas de 200 linhas, com **Anterior** e **Próxima**.
- Um campo de SQL (`Ctrl+Enter` roda). Clique numa célula para copiar o valor, **Copiar CSV** copia o resultado.
- Abre **só para leitura**. Para `INSERT`, `UPDATE`, `DELETE` ou `CREATE`, marque **Permitir alterar** na barra. A alteração vai direto para o arquivo.

Precisa do Node.js 22.5 ou mais novo (tem o `node:sqlite` embutido). Se não tiver, baixe pela janela **SDKs e runtimes** da IDE.

## Autor e licença

Feito por Pizzy-23. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.1.0

- Primeira versão na loja.
