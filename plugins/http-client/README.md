# HTTP Client

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Pizzy-23 |
| **Versão** | 0.1.0 |
| **Licença** | MIT |
| **Categoria** | Desenvolvimento |
| **Precisa de** | nada além do BlueScreen |
| **Código** | [plugins/http-client](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/http-client) |
<!-- ficha:fim -->

Painel na barra da esquerda para testar APIs, no estilo do Postman.

## Como usar

- Várias requisições guardadas, cada uma com método, URL, headers (`Nome: valor`, um por linha), token Bearer e body.
- **Variáveis**: `baseUrl=https://api.exemplo.com`, uma por linha, e `{{baseUrl}}/rota` na requisição.
- **Segredos**: guarde tokens cifrados (DPAPI, só neste PC) e use `{{secret:nome}}`. O núcleo troca na hora de enviar, e o valor não volta para a página nem fica no histórico. Prefira isso a colar o token direto no campo.
- Histórico das últimas 30, **Copiar curl** e **Importar do Postman (v2.1)**.
- O pedido sai pelo núcleo da IDE, então não esbarra em CORS.

`Ctrl+Enter` (ou Enter na URL) envia.

## Autor e licença

Feito por Pizzy-23. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.1.0

- Primeira versão na loja.
