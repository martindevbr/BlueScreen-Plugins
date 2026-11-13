# QAutils

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Martin Hartfelder |
| **Versão** | 2.2.0 |
| **Licença** | MIT |
| **Categoria** | Qualidade e testes |
| **Precisa de** | nada além do BlueScreen |
| **Código** | [plugins/qautils](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/qautils) |
<!-- ficha:fim -->

Cenários de QA no BlueScreen, em Gherkin (Cucumber), para quem escreve, executa e documenta testes: painel por pasta e chamado, quadro de execução, autocompletar de passos, evidências, relatórios, casos de teste em CSV e relatório de bug. É um plugin nativo e só tem interface: usa o índice e a busca do núcleo, a pasta de dados do plugin e o console de Build. Não sobe nenhum servidor.

## Como usar

| | |
|---|---|
| **Painel QAutils** (`Alt+9`, se nenhum outro plugin usar a tecla) | os cenários do projeto: features por pasta e chamado, busca, tags e execução |
| **Aba fixa QAutils** | com o painel escolhido, a área do editor ganha a aba **QAutils** na primeira posição: o quadro de execução |
| **Editor** (`.feature`) | status, evidências e cópia acima de cada cenário; autocompletar e correções com `Alt+Enter` |
| **Buscar em tudo** | **QA: Nova feature** cria a feature de um chamado |

O uso mais comum: crie a feature do chamado (**+** no painel), escreva os cenários com o autocompletar, marque o status de cada um no editor ou arrastando o cartão no quadro, cole as evidências e gere o relatório de evidências ou o CSV.

### Painel (aba Cenários)

- **Features:** as features por pasta (equipe, mês), com o **chamado** do nome do arquivo em destaque (`INC1753202`, `PRB0068833`, `SDIGBSID00-2429`), o número de cenários e uma barra com o andamento da execução. "Recentes" ordena pelo que foi mexido por último. A seta abre os cenários de cada feature.
- **Busca:** texto (nome do arquivo, da funcionalidade, dos cenários e dos passos), `@tag` ou o número do chamado.
- **Tags:** as tags com contagem. Clique para filtrar. Em projeto automatizado, ▶ roda a tag.
- **Execução:** o percentual executado, ✓ passou, ✗ falhou, ⊘ bloqueado e ○ não executado, com as features com falha primeiro. Daqui saem o relatório de evidências e o CSV do que a busca encontrou.
- Botão **+**: nova feature. Clique no chamado: abre o link (veja as configurações) ou copia o número.

### Quadro de execução (aba fixa)

- **Indicadores:** cenários, % executado, passou, falhou, bloqueado e não executado do que está filtrado.
- **Quadro:** uma coluna por status (Não executado, Passou, Falhou, Bloqueado), com um cartão por cenário: CT, chamado, título, feature, tags, anotação, evidências e a data da execução.
  - **Arrastar o cartão** para outra coluna muda o status. É o mesmo status do painel e do editor: os três andam juntos.
  - **Clique** (ou `Enter`) abre a feature na linha do cenário. Clique no chamado abre o link ou copia; clique na tag filtra por ela.
  - **Botão direito:** status, anotação, relatório de bug, evidências, copiar o cenário, chamado e, em projeto automatizado, executar.
  - Cada coluna desenha 60 cartões de cada vez (**Mais…** traz os seguintes).
- **Filtros:** busca (cenário, passo, `@tag`, arquivo ou chamado), chamado, tag e pasta. Um filtro com uma opção só não aparece.
- **Cobertura:** uma linha por chamado, tag ou pasta, com a barra passou/falhou/bloqueado/não executado e os números. As piores vêm primeiro (mais falhas, mais bloqueios, menos executado). Clique na linha para ver só ela no quadro.
- **Relatório** e **CSV:** o relatório de evidências e os casos de teste só dos cenários filtrados, na pasta comum das features deles.
- Em área estreita as colunas se empilham e a tela rola inteira.

### Nova feature de chamado

No **+** do painel, no botão direito numa pasta (**Nova feature aqui…**) ou no Buscar em tudo (**QA: Nova feature**):

- **Nome do arquivo:** `CHAMADO - Título.feature`.
- **Pasta do mês:** se a pasta escolhida já tem subpastas por mês (`OUTUBRO`, `OUTUBRO-2026`, `outubro_2026`), a feature vai para a do mês atual, no mesmo estilo.
- **Conteúdo:**
  - `# language: pt` (ou o idioma do projeto);
  - a tag do chamado (`@INC1753202`);
  - a história de usuário (Como / Eu quero / Para que);
  - os cenários já numerados (`CT001`, `CT002`…).

### No editor (`.feature`)

- **Acima de cada cenário:** o status (**○ Não executado → ✓ Passou / ✗ Falhou / ⊘ Bloqueado**, com anotação), as **📷 Evidências** e **Copiar**, que copia o cenário em texto pronto para colar no chamado, com o resultado. Cenário executado ganha uma **faixa colorida na margem esquerda**, do título ao último passo: verde (passou), vermelha (falhou) ou amarela (bloqueado).
- **Acima da funcionalidade:** o resumo da execução, o **Relatório de evidências** e o **Exportar CSV**.
- **Autocompletar:**
  - palavras-chave no idioma do arquivo; num arquivo novo, no idioma da configuração ou das features do projeto (sem features: **português**);
  - em português: `Funcionalidade`, `Contexto`, `Cenário`, `Esquema do Cenário`, `Exemplos`, `Regra`, `Dado`/`Dada`/`Dados`/`Dadas`, `Quando`, `Então`, `E`, `Mas`. Dá para digitar sem acento (`cenario`, `entao`) ou o termo em inglês (`feat`, `scen`, `then`): a sugestão já vem em português;
  - a primeira palavra-chave em português põe o `# language: pt` na primeira linha (sem ele o Cucumber lê o arquivo como inglês). Arquivo sem esse cabeçalho ganha um aviso, e `Alt+Enter` o adiciona;
  - cenário novo já com o próximo número (`CT006`);
  - os passos já escritos no projeto (os mais usados e os do mesmo tipo Dado/Quando/Então primeiro);
  - as step definitions, com os parâmetros para preencher;
  - `@tags` (inclusive a do chamado do arquivo);
  - as `<colunas>` dos Exemplos.
- **Passo parecido:** quando um passo é quase igual a um padrão do projeto (outra grafia, um acento, uma palavra trocada), o editor avisa e `Alt+Enter` troca pelo padrão.
- **`Alt+Enter` no cabeçalho da funcionalidade ou de um cenário:**
  - **mover os passos repetidos para o `Contexto`:** os que abrem todos os cenários do mesmo jeito; o primeiro passo que sobra vira "Quando/Então" se começava com "E";
  - **converter as palavras-chave** para português ou inglês (Feature ↔ Funcionalidade, Given ↔ Dado...), sem mexer na descrição, nas tabelas nem nas docstrings (só no cabeçalho da funcionalidade);
  - **renumerar os cenários** (`CT001`, `CT002`… mantendo o prefixo e a largura);
  - **formatar e alinhar as tabelas**.
- **`Shift+Alt+F`:** formata (recuo padrão, tabelas alinhadas, docstrings preservadas).
- **Estrutura:** `Ctrl+F12` e a trilha mostram a funcionalidade e os cenários.
- **Navegação:** `Shift+F12` mostra onde mais o passo é usado. Passar o mouse mostra quantas vezes ele aparece.
- **Comentário que parece tag** (`#Sistema_E2E_...`): `Alt+Enter` transforma em `@tag` acima da funcionalidade.

### Bug a partir de um cenário

No status de um cenário (acima dele, no editor) há **Abrir relatório de bug deste cenário…**, com a pré-condição, os passos, o esperado, o chamado e as evidências já preenchidos. Copia como texto (para o chamado) ou Markdown (Jira, Azure, GitHub), ou salva em `qa/bugs/`.

## Evidências e relatórios

- **Evidências:** tire o print (`Win+Shift+S`), clique em **📷 Evidência** acima do cenário e cole com `Ctrl+V`, ou arraste imagens. Elas ficam ao lado da feature: `<pasta>/evidencias/<nome da feature>/CT001_1.png`. Vão para o repositório junto da feature, se você quiser.
- **Relatório de evidências (HTML):** funcionalidade, cenários, passos, Exemplos, status, data, QA, observações e as imagens. Abre no navegador, onde dá para imprimir em PDF. O de uma feature fica na pasta das evidências dela; o de uma pasta, em `relatorio-evidencias.html`.
- **CSV:** casos de teste para Excel, Xray, Zephyr ou Azure Test Plans, com as colunas Chamado, Arquivo, Funcionalidade, ID, Cenário, Tags, Pré-condições (Contexto + Dado), Passos (Quando), Resultado esperado (Então), Exemplos, Status, Executado em, QA e Observação. Separado por `;`, abre direto no Excel em português, e o BlueScreen o abre como planilha.

O status de execução é seu (fica na pasta de dados do plugin, em `~/.bluescreen/plugin-data/qautils`). O relatório e o CSV levam o status para quem precisar.

## Automação

Quando o projeto tem step definitions (Java, Kotlin, JS/TS, Ruby, Python/behave ou C#/SpecFlow), o modo automação liga sozinho:

- **Steps:** os sem definição e os ambíguos ficam marcados. `Alt+Enter` gera a definição no idioma da feature (`@Dado`, `@Quando`, `@Entao` com o import de `io.cucumber.java.pt`, ou `Given`/`When`/`Then`) e insere no arquivo de steps que você escolher.
- **`F12` / `Ctrl+clique`** num passo vai para a step definition.
- **▶ Executar** a feature, o cenário ou uma tag:
  - **Maven:** `mvn test -Dcucumber.features=arquivo:linha`, só com a classe do Cucumber;
  - **Gradle:** `cleanTest test`, com `CUCUMBER_FEATURES`;
  - **npm:** `npx cucumber-js`;
  - **Ruby:** `bundle exec cucumber`;
  - **behave**.

  A saída vai para o console de Build.

## Configurações

Aba Plugins › engrenagem do QAutils:

| Configuração | O que muda |
|---|---|
| **Seu nome (vai nos relatórios e nos bugs)** | o nome do QA no relatório de evidências, no CSV e no relatório de bug. Vazio por padrão |
| **Ambientes** | um por linha, `NOME=endereço` (ex.: `HML=https://hml-portal.empresa.com.br`). O relatório de bug oferece a lista. Vazio por padrão |
| **Links dos chamados** | um por linha, `PREFIXO=endereço com {id}`, ex.: `INC=https://empresa.service-now.com/nav_to.do?uri=incident.do?sysparm_query=number={id}`. O chamado do nome do arquivo vira link no painel e no relatório. Sem link, clicar no chamado copia o número |
| **Cenários: modo** | **Automático** (o padrão: documentação se o projeto não tem step definitions, automação se tem), **Documentação** (sem aviso de step sem definição) ou **Automação** (confere as step definitions) |
| **Idioma das features novas** | **O mesmo das features do projeto** (o padrão), **Português** (Funcionalidade, Cenário, Dado...) ou **Inglês** (Feature, Scenario, Given...) |
| **Prefixo dos cenários** | `CT` por padrão: cenários numerados como CT001, CT002... (cenário novo e **renumerar cenários**) |
| **Pasta das evidências** | `evidencias` por padrão. Criada ao lado da feature: `<pasta>/<nome da feature>/CT001_1.png` |
| **Pasta dos relatórios de bug** | `qa` por padrão, na raiz do projeto: os bugs salvos ficam em `qa/bugs/` |
| **Avisar passo parecido com um já usado no projeto** | ligado por padrão. Desligado, o editor não avisa de passo quase igual a um padrão do projeto |

## Autor e licença

Feito por Martin Hartfelder. Licença MIT (veja o campo `license` do `plugin.json`).

Até a versão 2.1, o QAutils vinha junto com o BlueScreen. Agora ele é instalado pela loja de plugins.

## Histórico de versões

### 2.2.0

- Passou a ser instalado pela loja (até o BlueScreen 2.1 vinha junto com a IDE).
- Painel de cenários por pasta e chamado, com a aba fixa **QAutils** (quadro de execução com status, filtros e cobertura).
- Editor de `.feature` com autocompletar, correções por `Alt+Enter`, evidências, relatório de evidências, CSV de casos de teste e relatório de bug.
- Modo automação: confere as step definitions, gera as que faltam e executa com Maven, Gradle, npm, Ruby ou behave.
