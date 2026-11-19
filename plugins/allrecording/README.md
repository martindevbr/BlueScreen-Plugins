# AllRecording

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Martin Hartfelder |
| **Versão** | 0.3.0 |
| **Licença** | MIT |
| **Categoria** | Produtividade |
| **Precisa de** | nada além do BlueScreen |
| **Código** | [plugins/allrecording](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/allrecording) |
<!-- ficha:fim -->

Gravador leve de reuniões: grava a tela, o som do computador (a voz de quem está do outro lado no Meet, Teams ou Zoom) e o seu microfone, com marcadores ao vivo. Depois transcreve no seu PC e o Claude Code ou o Codex escrevem a ata, com resumo, decisões e tarefas. Não precisa de servidor nem de programa extra para gravar, e não aparece a janela "Escolha o que compartilhar" do navegador: a IDE captura a tela, a janela e o som do computador direto do Windows.

**Peça permissão antes de gravar.** O AllRecording lembra disso toda vez: a tela de gravar mostra o aviso, tem um botão que copia uma mensagem pronta para o chat da reunião, e a gravação só começa depois de você confirmar que todos concordaram. Gravar pessoas sem avisar é falta de respeito e pode ir contra a LGPD.

## Como usar

O ícone da câmera na barra da esquerda abre a lista de gravações e, na área grande, a tela do gravador.

1. Dê um nome para a reunião (ou deixe o sugerido, com a data e a hora).
2. Escolha **Tela e som** (vídeo) ou **Só o som** (arquivo bem menor, ótimo para a ata), e marque **Meu microfone** e **Som do computador**.
3. Clique em **Copiar aviso para o chat**, cole na reunião e espere todo mundo concordar.
4. Clique no botão vermelho e confirme em **Sim, todos concordaram**.
5. Em **Tela e som**, escolha no seletor do AllRecording a tela ou a janela da reunião e clique em **Gravar** (ou dê dois cliques no cartão). Em **Só o som** não há o que escolher: a gravação começa na hora.

O som do computador vem do alto-falante padrão do Windows, sem caixinha de "compartilhar áudio" para marcar. A janela da IDE libera o microfone sozinha, sem perguntar a cada gravação.

Gravando, a tela mostra o tempo e um medidor para o microfone e outro para o som do computador. Dá para **pausar**, **silenciar o microfone** (a gravação continua com o som dos outros), **marcar um momento** (botão do marcador, `Ctrl+Alt+M`, ou uma nota e `Enter`) e **parar**. A barra de baixo da IDE mostra o tempo enquanto grava; um clique nela volta para o gravador. Trocar de painel não para a gravação.

Clicando numa gravação da lista: o player, os marcadores (clique para pular até o trecho), **Transcrever e fazer a ata**, **Copiar para Downloads**, **Abrir a pasta** e **Apagar**. O nome se troca clicando nele.

| | |
|---|---|
| **Buscar em tudo** | "AllRecording: nova gravação de reunião", "marcar este momento", "parar e salvar", "copiar aviso de gravação para o chat" |
| `Ctrl+Alt+M` | marca o momento atual enquanto grava |

### Transcrição e ata

**Transcrever e fazer a ata** funciona de dois jeitos (em **Quem transcreve**, nas configurações):

- **Motor local e o agente escreve a ata** (padrão). O áudio vira texto no seu PC, com o [faster-whisper](https://github.com/SYSTRAN/faster-whisper). Na primeira vez o AllRecording cria um ambiente Python só dele e instala o faster-whisper (~150 MB), e o modelo escolhido é baixado uma vez. Depois o Claude Code ou o Codex recebem só o texto, sem poder mexer em nada, e devolvem a ata. O áudio não sai do PC.
- **O agente faz tudo.** O Claude Code ou o Codex rodam na pasta da gravação, acham (ou instalam) um transcritor local e gravam a transcrição e a ata. Nesse modo o agente pode rodar comandos: use se o motor local não serve no seu PC.

A ata traz resumo, decisões, tarefas (com responsável e prazo quando foram ditos), pontos em aberto e o que se falava em cada marcador, sempre com o tempo `[mm:ss]`: clique nele para ouvir o trecho. A transcrição completa fica na aba **Transcrição**.

O agente usa o programa, o modelo e o esforço de **Agentes de IA** da IDE quando o Automator está ligado; sem ele, chama `claude` ou `codex` direto. Os dois precisam estar instalados e com login feito.

## Configurações

Aba Plugins › engrenagem do AllRecording:

| Configuração | O que muda |
|---|---|
| **Qualidade do vídeo** | Leve (15 quadros/s, ~0,4 GB por hora), Normal (24, ~0,7 GB) ou Alta (30, ~1,4 GB). Só o som fica em ~40 MB por hora |
| **Aviso para o chat da reunião** | a mensagem que **Copiar aviso para o chat** põe na área de transferência |
| **Quem transcreve** | motor local + agente escreve a ata, ou o agente faz tudo (veja acima) |
| **Agente de IA** | Claude Code ou Codex |
| **Modelo do agente** | vazio: o do agente |
| **Modelo de transcrição** | base, small (padrão), medium ou large-v3: maior é mais preciso e mais lento |
| **Idioma da reunião** | `pt`, `en`, `es`...; vazio detecta sozinho |

## Onde ficam os arquivos

Tudo fica na pasta de dados do plugin (Plugins › botão direito no AllRecording › **Pasta de dados**), em `files/gravacoes/<data-hora>/`: `gravacao.webm`, `meta.json` (nome, duração, marcadores e quando a permissão foi confirmada), `transcricao.json`, `transcricao.md` e `ata.md`. O ambiente Python e os modelos de transcrição ficam em `files/venv` e `files/modelos`. Apagar os dados do plugin apaga tudo isso.

A gravação vai para o disco em pedaços de 4 segundos: se a IDE fechar no meio, a gravação aparece como **interrompida** e **Montar o arquivo** junta o que foi salvo.

## Limites conhecidos

- A captura nativa precisa de uma IDE com `/api/capture` (Windows, BlueScreen a partir da versão que trouxe o seletor). Numa IDE mais antiga, ou aberta de outro aparelho pela rede, o AllRecording volta a usar a janela de compartilhar do navegador; aí o som do computador só vem marcando **Compartilhar áudio do sistema**, e compartilhar a **tela inteira** é o jeito mais garantido.
- O som do computador é o de **todo** o alto-falante padrão (inclusive avisos e músicas que tocarem durante a reunião). Se a saída mudar no meio (um fone conectado), a captura passa para a nova.
- Janela minimizada não tem imagem: restaure antes de gravar. Janelas de vídeo protegido (filmes com DRM) podem sair pretas.
- Os arquivos são WebM (VP9/Opus). Com o `ffmpeg` no PATH, o AllRecording acerta o cabeçalho para o player mostrar a duração e pular no tempo; sem ele, a gravação funciona, mas alguns players não mostram a duração.
- A transcrição não separa quem falou o quê.

## Para desenvolver

```
node tests/basico.test.mjs
```

## Autor e licença

Feito por Martin Hartfelder. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.3.0

- Visual novo, mais limpo, e ainda leve (sem bibliotecas; no modo leve da IDE, os medidores redesenham menos vezes).
- Escolha do microfone e botão **Testar**, com o nível ao vivo, antes de gravar.
- Contagem de 3 segundos antes de começar (dá para desligar).
- Marcadores por tipo: **Decisão**, **Tarefa**, **Dúvida** e **Importante**, com nota; dá para tirar um marcador. Os tipos entram na ata.
- Tamanho da gravação ao vivo.
- No player: linha do tempo com os marcadores, voltar e avançar 10 s (J e L), velocidade de 1× a 2× e **Marcar aqui** depois de gravado.
- Busca na transcrição, com os trechos destacados, e **salvar a ata** (.md) em Downloads.
- Lista de gravações agrupada por dia, com busca, e as recentes na tela inicial.

### 0.2.0

- Seletor próprio de tela ou janela, com miniaturas, no lugar da janela "Escolha o que compartilhar" do navegador.
- Só o som: começa direto, com o som do computador vindo do Windows, sem pedir tela.
- A janela da IDE não pergunta mais pelo microfone.

### 0.1.0

- Primeira versão: tela e som ou só o som, microfone e som do computador misturados, medidores, pausa, silenciar, marcadores, aviso de permissão a cada gravação, recuperação de gravação interrompida, transcrição local com faster-whisper e ata pelo Claude Code ou Codex.
