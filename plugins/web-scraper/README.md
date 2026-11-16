# Web Scraper

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Pizzy-23 |
| **Versão** | 0.3.1 |
| **Licença** | MIT |
| **Categoria** | Desenvolvimento |
| **Precisa de** | nada além do BlueScreen |
| **Código** | [plugins/web-scraper](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/web-scraper) |
<!-- ficha:fim -->

Raspagem de páginas da web sem escrever código. Você clica na página para dizer o que é cada item (um produto, uma linha de tabela, um post) e o que tirar de cada um (texto, link, imagem); o plugin mostra a tabela na hora, segue as próximas páginas e exporta em CSV ou JSON. Páginas montadas por JavaScript abrem num navegador de verdade, sem janela, que também mostra todas as requisições que a página fez: achou a API com os dados, um clique e ela vira a fonte da raspagem.

## Como usar

O ícone **Web Scraper** na barra da esquerda lista as receitas e abre a tela na aba fixa. Também em **Buscar em tudo**: "Web Scraper: abrir".

### Para começar: os exemplos

**Exemplos**, no painel da esquerda, acrescenta três receitas prontas, uma de cada jeito de raspar:

| Receita | O que mostra |
|---|---|
| **livros** | HTML comum: item e campos por seletor CSS e o botão de próxima página (books.toscrape.com, um site feito para treinar) |
| **frases com rolagem infinita** | página montada por JavaScript, aberta no navegador e rolada até o fim (quotes.toscrape.com) |
| **MangaDex, os mais seguidos** | API pública em JSON, com caminhos (`attributes.title.*`, `attributes.tags.*.attributes.name.en`) e paginação por `{offset:20}` |

Abra uma, clique em **Testar na 1ª página** e depois em **Raspar tudo**.

### O caminho mais fácil

1. Cole a URL e clique em **Escolher clicando na página**. A página aparece dentro da tela.
2. **Escolher o item** e clique em qualquer parte de um produto: o plugin entende que o produto inteiro é o item e marca todos em azul.
3. Em seguida, clique no que quer em cada coluna (o título, o preço, a foto, o link). Cada clique vira um campo: link pega o endereço, imagem pega o `src`, o resto pega o texto.
4. **Testar na 1ª página** e confira a tabela; ajuste o nome das colunas se quiser.
5. **Raspar tudo** e depois **Copiar CSV**, **Copiar JSON** ou **Salvar no projeto** (o caminho termina em `.csv` ou `.json`; se o arquivo já existe, o botão pede um segundo clique).

### Páginas com JavaScript e as requisições

Se o teste diz que a página está quase vazia (lojas, SPAs, rolagem infinita), marque **Abrir num navegador de verdade**. O plugin abre o Chrome ou o Edge do PC sem janela, espera a página carregar e o item aparecer, rola até o fim quantas vezes você pedir (**Rolar até o fim**) e raspa o HTML já montado.

Nesse modo, **Requisições da página** lista tudo o que a página pediu. **só dados** mostra só as chamadas de API (XHR, fetch, JSON), e o campo de filtro procura também dentro das respostas: digite um preço ou um nome que aparece na tela para achar a API que trouxe. Clicando numa requisição:

- **Usar esta API** cria uma receita nova que chama a API direto (mais rápido e sem navegador), com o mesmo método, corpo e headers, e já sugere o item (a maior lista do JSON) e as colunas;
- **Copiar como curl** e **Copiar resposta**.

### Em detalhe

- **URLs**: uma por linha. `{pagina}` na URL (ou no corpo do pedido) vira 1, 2, 3..., e `{offset:20}` vira 0, 20, 40..., até vir uma página sem linhas ou chegar ao **Máx. de páginas**.
- **Item**: seletor CSS (`article.produto`, `table tbody tr`) ou, quando a resposta é JSON, o caminho da lista (`data.items`). Vazio, a página toda vira uma linha.
- **Campos**: nome da coluna, seletor dentro do item (ou caminho JSON: `preco.valor`, `fotos.0.url`; `*` passa por todos os itens de uma lista ou valores de um objeto, como `tags.*.nome`) e, no HTML, o que pegar: `text`, `html`, `href`, `src` ou outro atributo. Links viram endereço completo. **todos** junta todos os que casarem, separados por `|`.
- **Paginação e ritmo**: **Próxima página** é o seletor do link para a seguinte (`a[rel=next]`) ou, em JSON, o caminho da URL seguinte (`links.next`). O plugin não repete página e espera a **Espera entre páginas** entre um pedido e outro. Com mais de uma página, a tabela ganha a coluna `_pagina`.
- **Pedido**: método, headers (um por linha) e corpo, para APIs. Valem quando o navegador está desligado.
- **Testar um seletor** mostra quantos elementos casam na 1ª página e o HTML dos 5 primeiros (ou o valor do caminho, em JSON).

## Configurações

Aba Plugins › engrenagem do Web Scraper:

| Configuração | O que muda |
|---|---|
| **User-Agent** | como o pedido se apresenta ao site (também no navegador sem janela) |
| **Tempo limite de cada página** | segundos até desistir de uma página |
| **Navegador (Chrome ou Edge)** | o caminho do `chrome.exe` ou `msedge.exe`, se o plugin não achar sozinho |

## Limites conhecidos

- O navegador sem janela precisa do Chrome ou do Edge instalados (o Edge já vem no Windows). Ele fica aberto 2 minutos depois do último uso, para os testes seguintes serem rápidos, e fecha sozinho.
- Não faz login nem passa por CAPTCHA. Para uma API que precisa de login, **Usar esta API** copia os headers que a página mandou (inclusive cookies e tokens) para a receita: eles ficam guardados na pasta de dados do plugin.
- O seletor visual mostra a página sem os scripts dela; num site que monta tudo por JavaScript, use **Abrir num navegador de verdade** antes, para ver a página montada.
- Alguns sites mandam pedidos com cara de navegador falso para uma verificação anti-robô, que o plugin não tenta passar. Em APIs públicas, como a do MangaDex, um `User-Agent` que diga quem é (em **Pedido**) costuma resolver.
- Respeite os termos de uso e o `robots.txt` de cada site e use uma espera entre páginas para não sobrecarregar o servidor.

## Segurança e dados

Os pedidos saem do seu PC direto para os sites da lista: pelo núcleo da IDE (`plugin.fetch`) ou pelo navegador sem janela, que usa um perfil próprio na pasta de dados do plugin (não mexe no seu Chrome ou Edge) e só aceita conexão da IDE. As receitas ficam na pasta de dados do plugin; o resultado só sai quando você copia ou salva.

## Autor e licença

Feito por Pizzy-23. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.3.1

- Os botões agora parecem botões (usam o estilo `chip` da IDE, com borda; os principais em destaque).

### 0.3.0

- **Exemplos**: três receitas prontas (HTML com paginação, página com JavaScript, API do MangaDex).
- `*` nos caminhos JSON e paginação por deslocamento com `{offset:N}`.

### 0.2.0

- Seletor visual: clique na página para escolher o item e os campos.
- Abrir num navegador de verdade (Chrome ou Edge sem janela): páginas com JavaScript, rolagem infinita e a lista de requisições da página.
- **Usar esta API**: uma requisição capturada vira receita, com item e colunas sugeridos.
- Respostas em JSON com caminhos (`data.items`, `preco.valor`), `{pagina}` na URL e no corpo, método, headers e corpo do pedido.

### 0.1.0

- Primeira versão: receitas com item e campos por seletor CSS, teste na 1ª página, paginação, charset da página, CSV/JSON e salvar no projeto.
