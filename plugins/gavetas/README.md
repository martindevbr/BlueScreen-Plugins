# Gavetas

Gavetas com nome e cor na barra lateral, para agrupar os painéis (Claude Code, Dashboard, Pegadas...).

- Botão direito num ícone da barra › **Colocar na gaveta** › escolher uma gaveta ou **Nova gaveta…**. Para sair: **Tirar da gaveta**.
- Clique na gaveta abre ou recolhe. Recolhida, ela acende quando um painel dela está aberto.
- Botão direito na gaveta: renomear e mudar a cor (8 cores ou qualquer uma), escolher os painéis dela, recolher e desfazer.
- A gaveta fica no lugar do primeiro painel dela. Para mudar a posição, reorganize a barra (segurar um ícone por 2 s); os atalhos continuam os mesmos.
- No modo de reorganizar a barra as gavetas somem e voltam ao concluir.

Os dados ficam em `~/.bluescreen/plugin-data/gavetas/store.json` (chave `grupos`).

## Arquitetura

**Decisão:** só `ui.js`
**Analisado em:** 2026-10-22, versão 2.0.0

Troca `renderStrip`, `btnState` e `showMenu` do núcleo (funções globais, como o PLUGINS.md permite) chamando a original e acrescentando as gavetas; o `onUnload` devolve as originais. Nenhum motivo de N1 a N7.

**Reavaliar quando:** o núcleo ganhar um gancho para a barra (`strip:render`) ou para o menu dos ícones dela.
