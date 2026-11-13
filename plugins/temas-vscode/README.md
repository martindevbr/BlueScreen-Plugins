# Temas do VS Code

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Luiz Faria |
| **Versão** | 1.1.0 |
| **Licença** | a definir pelo autor |
| **Categoria** | Aparência |
| **Precisa de** | nada além do BlueScreen |
| **Código** | [plugins/temas-vscode](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/temas-vscode) |
<!-- ficha:fim -->

Traz para o BlueScreen os temas que você já tem no VS Code, no Cursor, no Antigravity e em editores parecidos, ou um arquivo `.json` de tema avulso. O plugin lê as cores da interface e da sintaxe do tema, converte para o formato da Aparência e aplica: o tema vira uma predefinição que você escolhe de novo quando quiser. Para quem passou anos ajustando o visual num desses editores e quer a mesma cara aqui, sem refazer cor por cor.

Não precisa de nenhum desses editores aberto, só das pastas de extensões deles no disco.

## Como usar

| | |
|---|---|
| **Painel Temas do VS Code** (ícone do plugin) | a lista de temas encontrados, com filtro. Um clique aplica o tema |
| **Botões do painel** | **Importar arquivo de tema (.json)** abre um arquivo avulso; **Procurar de novo** refaz a busca nas pastas |
| **Buscar em tudo** | "Temas do VS Code: escolher" abre o painel; "Temas do VS Code: importar arquivo .json" vai direto para o arquivo |

1. Abra o painel. Na primeira vez ele procura os temas instalados (pode levar alguns segundos com muitas extensões).
2. Digite no filtro para achar pelo nome do tema, da extensão ou do editor de origem. Cada linha mostra uma bolinha escura ou clara (o modo do tema) e de qual editor ele veio; passe o mouse para ver a extensão.
3. Clique no tema. Ele é aplicado na hora e salvo nas predefinições da Aparência, e a linha fica marcada como o último aplicado.

Para um tema que não está instalado em lugar nenhum, use **Importar arquivo de tema (.json)**: aceita `.json` e `.jsonc`, com comentários e vírgulas sobrando, como os do VS Code. O nome vem do campo `name` do arquivo ou, sem ele, do nome do arquivo.

## Onde ele procura

Na sua pasta de usuário, as extensões instaladas de:

| Editor | Pasta |
|---|---|
| VS Code | `.vscode\extensions` |
| VS Code Insiders | `.vscode-insiders\extensions` |
| Cursor | `.cursor\extensions` |
| Antigravity | `.antigravity\extensions` |
| Windsurf | `.windsurf\extensions` |

E os temas que vêm de fábrica (aparecem como "embutido") do VS Code, do Cursor e do Antigravity instalados em `AppData\Local\Programs` (`Microsoft VS Code`, `cursor` e `Antigravity`), inclusive nas subpastas de versão que esses instaladores criam.

De cada extensão, o plugin lê o `package.json`, pega os temas declarados em `contributes.themes` (só os `.json`) e traduz nomes como `%themeLabel%` pelo `package.nls.json`. Um mesmo tema instalado em dois editores aparece uma vez só.

## Como a conversão funciona

- **Interface**: fundo, painéis, seleção, bordas, texto, cor de destaque e as cores de adicionado, modificado, removido e aviso vêm das chaves do tema do VS Code (`editor.background`, `sideBar.background`, `list.activeSelectionBackground`, `activityBarBadge.background`, `gitDecoration.*` e outras). Cores com transparência são misturadas com o fundo.
- **Sintaxe**: comentários, palavras-chave, textos, números, tipos, variáveis, anotações, tags e atributos de HTML e pontuação vêm das regras de `tokenColors`, escolhendo a regra de escopo mais específica.
- **O que faltar** no tema é completado com a predefinição BlueScreen (escura) ou BlueScreen claro, conforme o modo do tema.
- Temas que herdam de outro (`include`) são lidos junto com o tema base.

## Limites conhecidos

- Só temas de cores em `.json`. Temas `.tmTheme` e temas de ícones de arquivo ficam de fora.
- A sintaxe do BlueScreen tem menos categorias que a do VS Code, então o resultado é próximo, não idêntico: estilos de fonte (negrito, itálico) e regras muito específicas de uma linguagem não são levados.
- Os temas instalados só são procurados na abertura do painel ou em **Procurar de novo**. Se você instalar um tema novo no VS Code, clique em **Procurar de novo**.
- Em versões do BlueScreen sem a função de salvar predefinições pelo plugin, o tema é aplicado só na hora; para guardar, salve como predefinição na Aparência (o aviso explica).

## Autor e licença

Feito por Luiz Faria.

A licença ainda não foi definida pelo autor (`NOASSERTION` no `plugin.json`): até ele escolher uma, o código não pode ser reaproveitado fora do BlueScreen.

## Histórico de versões

### 1.1.0

- Versão publicada na loja (a primeira registrada neste repositório).
- Encontra os temas instalados no VS Code, VS Code Insiders, Cursor, Antigravity e Windsurf, e os que vêm com o VS Code, o Cursor e o Antigravity.
- Converte cores da interface e da sintaxe para uma predefinição da Aparência; importa também um `.json` de tema avulso.
