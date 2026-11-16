# Env Checker

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Pizzy-23 |
| **Versão** | 0.1.0 |
| **Licença** | MIT |
| **Categoria** | Qualidade e testes |
| **Precisa de** | nada além do BlueScreen |
| **Código** | [plugins/env-checker](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/env-checker) |
<!-- ficha:fim -->

Painel na barra da esquerda para os arquivos `.env*` da raiz do projeto.

## Como usar

- Cada arquivo numa aba (`.env`, `.env.local`, `.env.example`...), com as variáveis e os valores **escondidos**. O olho mostra um de cada vez. Clique no nome para ir à linha no editor.
- Marca com ● as variáveis que parecem segredo (nome com token, secret, password, api_key... ou valor com cara de chave: `sk-`, `ghp_`, `AKIA`, `xox`, JWT, chave PEM, URL com senha).
- Avisos:
  - `.env` **commitado no git** (tire do repositório e troque os segredos);
  - `.env` fora do `.gitignore`, com o botão **Pôr no .gitignore**;
  - variáveis que faltam ou sobram em relação ao `.env.example`;
  - chave repetida;
  - `.env.example` com segredo de verdade dentro.
- **Gerar .env.example**: copia o `.env` só com os nomes e os comentários, sem nenhum valor.

Nada sai do PC: ele só lê os arquivos e roda `git check-ignore` e `git ls-files`.

## Autor e licença

Feito por Pizzy-23. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.1.0

- Primeira versão na loja.
