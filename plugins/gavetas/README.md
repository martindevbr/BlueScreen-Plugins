# Gavetas

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Luiz Faria |
| **Versão** | 2.0.0 |
| **Licença** | a definir pelo autor |
| **Categoria** | Produtividade |
| **Precisa de** | nada além do BlueScreen |
| **Código** | [plugins/gavetas](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/gavetas) |
<!-- ficha:fim -->

Gavetas com nome e cor na barra lateral, para agrupar os painéis (Claude Code, Dashboard, Pegadas...). Útil para quem tem muitos plugins instalados e quer a barra arrumada: cada gaveta junta vários ícones sob uma pasta colorida, que abre e recolhe com um clique.

## Como usar

O plugin não tem tela própria: ele aparece na barra lateral da esquerda e no menu de botão direito dos ícones dela.

| | |
|---|---|
| **Botão direito num ícone da barra** | **Colocar na gaveta** › escolher uma gaveta ou **Nova gaveta…**. Se o ícone já está numa gaveta, aparece também **Tirar da gaveta** |
| **Clique na gaveta** | abre ou recolhe. Recolhida, ela acende quando um painel dela está aberto. Passar o mouse mostra os painéis que estão nela, e o número ao lado do nome diz quantos são |
| **Botão direito na gaveta** | **Renomear e mudar a cor…**, **Cor**, **Painéis nesta gaveta** (marca e desmarca painéis), **Recolher** ou **Expandir** e **Desfazer a gaveta** (os painéis voltam soltos para a barra) |
| **Buscar em tudo** | "Gavetas: recolher todas" e "Gavetas: expandir todas" |

Uso mais comum:

1. Clique com o botão direito num ícone da barra › **Colocar na gaveta** › **Nova gaveta…**.
2. Na janelinha que abre, dê um nome, escolha uma das 8 cores (ou qualquer outra no seletor de cor) e clique em **Salvar**. `Enter` salva e `Esc` cancela.
3. Coloque outros ícones na mesma gaveta pelo mesmo menu, agora escolhendo a gaveta pelo nome.

Detalhes:

- A gaveta fica no lugar do primeiro painel dela. Para mudar a posição, reorganize a barra (segurar um ícone por 2 s); os atalhos dos painéis continuam os mesmos.
- No modo de reorganizar a barra as gavetas somem e voltam ao concluir.
- Uma gaveta que fica sem nenhum painel é apagada sozinha.

## Dados

Os dados ficam em `~/.bluescreen/plugin-data/gavetas/store.json` (chave `grupos`): o nome, a cor, se está aberta e os painéis de cada gaveta.

## Arquitetura

**Decisão:** só `ui.js`
**Analisado em:** 2026-10-22, versão 2.0.0

Troca `renderStrip`, `btnState` e `showMenu` do núcleo (funções globais, como o PLUGINS.md permite) chamando a original e acrescentando as gavetas; o `onUnload` devolve as originais. Nenhum motivo de N1 a N7.

**Reavaliar quando:** o núcleo ganhar um gancho para a barra (`strip:render`) ou para o menu dos ícones dela.

## Autor e licença

Feito por Luiz Faria.

A licença ainda não foi definida pelo autor (`NOASSERTION` no `plugin.json`): até ele escolher uma, o código não pode ser reaproveitado fora do BlueScreen.

## Histórico de versões

### 2.0.0

- Versão publicada na loja (a primeira registrada neste repositório).
