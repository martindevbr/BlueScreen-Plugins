# Contribuindo com os plugins do BlueScreen

Obrigado por querer ajudar. Este guia é o padrão do repositório: o que está aqui, a ferramenta `ferramentas/plugins.mjs` confere, e o CI recusa o pull request que não seguir. Assim a loja do BlueScreen recebe só plugins que instalam, carregam e explicam o que fazem.

Como escrever um plugin (a API `bs`, o servidor, o cofre, os nós do Automator) está em [docs/PLUGINS.md](https://github.com/martindevbr/BlueScreen-IDE/blob/main/docs/PLUGINS.md) e [docs/AUTOMACOES.md](https://github.com/martindevbr/BlueScreen-IDE/blob/main/docs/AUTOMACOES.md), no repositório do BlueScreen.

## O caminho de um pull request

1. **Fork e branch.** Faça um fork, e um branch com o nome do que muda (`meu-plugin`, `bluespotify-fila-infinita`).
2. **Crie ou altere.** Plugin novo: `node ferramentas/plugins.mjs novo <id> --nome "Nome" --autor "Seu Nome" --categoria <categoria>` (acrescente `--servidor` se ele precisar de um `server.mjs`).
3. **Teste na IDE de verdade.** Aponte a loja para o seu clone e instale por ela, como os outros vão instalar:
   ```
   set BLUESCREEN_PLUGIN_REPO=C:\caminho\do\seu\clone
   ```
   Com `BLUESCREEN_HOME` apontando para uma pasta vazia, a instância de teste não mexe nos seus plugins e dados. Confira no tema escuro e no claro.
4. **Confira o padrão.** `node ferramentas/plugins.mjs tudo` (valida, roda os testes e confere as fichas). Se a ficha ou a tabela estiver desatualizada, `node ferramentas/plugins.mjs gerar` refaz.
5. **Suba a versão** se mudou código (veja [Versões](#versões)).
6. **Abra o pull request** para o `main` e preencha o modelo. O CI roda tudo de novo, mais a conferência de versão.

O `main` é protegido: só entra por pull request, com o CI passando, e quem aceita é quem mantém o repositório. Antes de aceitar, ele revisa o código de plugins de outras pessoas antes de aceitar: um plugin roda com as permissões da IDE, então código ofuscado, que baixa e executa coisas de fora ou manda dados para servidores não explicados no README não entra.

## O padrão de um plugin

```
plugins/<id>/
  plugin.json       obrigatório: o manifesto
  README.md         obrigatório: no formato abaixo
  icon.svg          recomendado: quadrado, até 64 KB (SVG, PNG, JPG ou WebP)
  ui.js, style.css  a interface (opcional)
  server.mjs        o servidor (opcional; Node.js 18+, sem dependências do npm)
  automator.json    nós do Automator (opcional)
  lib/, tests/      código de apoio e testes (tests/*.test.mjs rodam no CI)
```

O nome da pasta é o `id`: minúsculas, números e hífen. Sem `id` igual ao nome da pasta, a loja ignora o plugin.

### `plugin.json`

| Campo | | |
|---|---|---|
| `id` | obrigatório | igual ao nome da pasta |
| `name` | obrigatório | até 40 caracteres; é o título do README |
| `description` | obrigatório | até 300 caracteres, terminando com ponto: é o texto do cartão na loja |
| `version` | obrigatório | `X.Y.Z` (veja [Versões](#versões)) |
| `author` | obrigatório | quem fez o plugin (nome de pessoa ou de equipe) |
| `license` | obrigatório | `MIT` (padrão), `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `Zlib`, `0BSD` ou `Unlicense`. `NOASSERTION` só para plugins antigos cujo autor ainda não escolheu |
| `category` | obrigatório | uma das [categorias](#categorias) |
| `keywords` | opcional | até 12 palavras que a busca da loja também encontra |
| `contributors` | opcional | quem mais ajudou de forma importante (o histórico do Git já registra cada commit) |
| `minBlueScreen` | opcional | a versão mais antiga do BlueScreen em que o plugin funciona (`2.1.33`). A loja não deixa instalar numa IDE mais velha e explica o motivo |
| `icon`, `order`, `server`, `requires`, `hooks`, `settings`, `vault` | opcionais | como em [docs/PLUGINS.md](https://github.com/martindevbr/BlueScreen-IDE/blob/main/docs/PLUGINS.md) |

Use `minBlueScreen` quando o plugin depender de algo que o BlueScreen ganhou numa versão específica. Por exemplo, `choicesFrom` nos campos do Automator chegou na 2.1.33 (o validador avisa).

### Categorias

| Chave | Na loja |
|---|---|
| `ia` | Inteligência artificial |
| `desenvolvimento` | Desenvolvimento |
| `qualidade` | Qualidade e testes |
| `produtividade` | Produtividade |
| `integracoes` | Integrações |
| `midia` | Música e mídia |
| `aparencia` | Aparência |
| `outros` | Outros |

Precisa de uma categoria nova? Proponha numa issue: ela entra aqui, na ferramenta e na loja da IDE ao mesmo tempo.

### `README.md`

A loja mostra o README na página do plugin, então ele é a documentação de quem usa. O formato:

```markdown
# Nome do plugin            (igual ao "name" do plugin.json)

<!-- ficha:inicio ... -->   (gerada: autor, versão, licença, categoria, o que precisa, nós, código)
<!-- ficha:fim -->

Um parágrafo: o que o plugin faz e para quem.

## Como usar               obrigatório: onde aparece (painel, aba, atalhos, Buscar em tudo) e o uso mais comum
## Configurações           obrigatório se o plugin.json tiver "settings": o que cada uma muda
## Nós do Automator        obrigatório se houver automator.json: o que cada nó faz
...                        o que mais ajudar: limites conhecidos, segurança e dados, arquitetura, para desenvolver
## Autor e licença         obrigatório: cita o "author" do plugin.json e a licença
## Histórico de versões    obrigatório: um "### X.Y.Z" por versão, a mais nova em cima, com o que mudou
```

- A ficha é gerada a partir do `plugin.json` por `node ferramentas/plugins.mjs gerar`. Não edite à mão: o CI recusa a ficha desatualizada.
- Links para arquivos do próprio plugin são relativos (`[guia](GUIA.md)`); para fora, use o endereço completo.
- Textos em português, diretos, dizendo o que acontece ("Abrir no Spotify", não "Prosseguir"). Atalhos em `Ctrl+Alt+M`, nomes de botões e menus em **negrito**.
- Imagens vão numa pasta `docs/` do plugin, de preferência em PNG ou WebP pequenos.

## Versões

A IDE só avisa de atualização quando a versão do `plugin.json` aumenta. Por isso, num pull request:

- **mudou código** (qualquer arquivo fora de `README.md`, `docs/`, `tests/`): a versão precisa subir, e o `## Histórico de versões` ganha a entrada nova;
- **só documentação, testes ou metadados** (`description`, `author`, `license`, `category`, `keywords`, `contributors`, `minBlueScreen`): a versão pode ficar.

O CI confere com `node ferramentas/plugins.mjs versoes --base origin/main`. Use `X.Y.Z`: `Z` para correção, `Y` para recurso novo, `X` quando muda algo que o usuário precisa refazer (configuração, dados).

## Regras do código

- **Sem dependências do npm** nos plugins: a loja copia a pasta como está, e ninguém roda `npm install`. Biblioteca de terceiros vai copiada para dentro do plugin (em `vendor/`) com a licença junto, e só se for permissiva (MIT, Apache-2.0, BSD, ISC, Zlib). Nada de GPL, LGPL ou AGPL.
- **Sem CDN** na interface: o BlueScreen roda offline. Exceção: SDKs que o próprio serviço exige carregar da origem dele (como o Web Playback SDK do Spotify), explicados no README.
- **Segredos nunca no código.** Tokens vão em `plugin.secrets` ou no cofre da IDE. O validador procura chaves e tokens conhecidos e recusa o arquivo.
- **Dados do plugin** ficam na pasta de dados (`plugin.data`, `plugin.files`), nunca em `localStorage`.
- **Servidor só em `127.0.0.1`**, conferindo o token que a IDE manda (`x-bluescreen-token`). Veja o `server.mjs` do modelo.
- Siga o estilo do código ao redor: comentários curtos em português explicando o porquê.

## Commits

- Mensagem curta e clara, com o mínimo necessário para entender o que mudou. Comece pelo plugin quando for de um só: `BlueSpotify: fila infinita`.
- Nunca inclua metadados de IA no commit: nada de IA como `Co-authored-by`, autor ou signatário, nem trailers ou textos como `Generated by AI`. Remova esses acréscimos se uma ferramenta os inserir sozinha.
- Preserve a sua autoria Git verdadeira: não invente nem troque a identidade de quem fez o commit.

## Mexendo no plugin de outra pessoa

Correções e melhorias em plugins de outras pessoas são bem-vindas pelo mesmo caminho. O autor original é chamado para revisar quando o GitHub permite. Mudança grande de comportamento: abra uma issue antes, para combinar com quem mantém o plugin. Se a sua contribuição for importante, acrescente o seu nome em `contributors`.

## Licença das contribuições

Ao abrir um pull request, você confirma que o código é seu (ou que você pode contribuí-lo) e que ele entra sob a licença declarada no `plugin.json` do plugin que você alterou. Num plugin novo, sob a licença que você declarar.
