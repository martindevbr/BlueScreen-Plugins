# Proxy4Auto

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Martin Hartfelder |
| **Versão** | 0.4.0 |
| **Licença** | MIT |
| **Categoria** | Desenvolvimento |
| **Precisa de** | BlueScreen 2.1.33 ou mais novo · Node.js 18+ |
| **Automator** | 13 nós (categoria Proxy) |
| **Código** | [plugins/proxy4auto](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/proxy4auto) |
<!-- ficha:fim -->

Um proxy reverso local que já vem dentro do plugin e é montado por nós do Automator. Ele põe um serviço da internet atrás de um nome que resolve para `127.0.0.1` (`http://localhost-api` → `https://api.cliente.com`) e apaga os rastros do destino: links, cookies e os cabeçalhos da Vercel e da Cloudflare.

O proxy é o fluxo: você o monta com os nós **Novo proxy → Rota → Ligar o proxy**, e ele fica ligado enquanto o fluxo roda. Parou o fluxo, o proxy desliga. Não existe nó de desligar, nem configuração guardada fora do fluxo.

Não precisa instalar nem apontar para nenhum programa de fora: o proxy é um módulo do próprio plugin (o mesmo motor do [localhost-proxy](https://github.com/martindevbr/proxy-server)). O plugin não tem tela e não traz executável, arquivo de lote nem script.

## Como usar

No **Automator**, categoria **Proxy**, monte um fluxo assim:

1. **Novo proxy** começa a montagem (a porta dos nomes locais, se grava os nomes no hosts, se reescreve os links).
2. **Rota**, um nó para cada rota, um atrás do outro (ou um só com várias, uma por linha).
3. **Ligar o proxy** fecha a montagem: sobe o proxy e segura o fluxo. O fluxo aparece como em execução enquanto o proxy está no ar.

Clique em **Parar** no fluxo e o proxy sai, tirando os nomes dele do hosts. Para o proxy subir junto com o BlueScreen, comece o fluxo pelo gatilho **Ao abrir o BlueScreen**.

Os outros nós (requisição, disfarce, testes, tráfego) usam o proxy que estiver ligado. Como o **Ligar o proxy** segura o fluxo dele, esses nós vão em outro fluxo.

## Nós do Automator

Montagem, nesta ordem:

| Nó | Para quê |
|---|---|
| **Novo proxy** | Começa a montar. Define a porta dos nomes locais, se os nomes vão para o hosts enquanto ligado, a reescrita de links, o acesso pela rede e o DNS local. Não liga nada. |
| **Rota** | Acrescenta uma rota ao proxy em montagem: nome local → site ou API, ou porta TCP local → banco remoto. Sem nome, sugere um a partir do destino (`https://api.cliente.com.br` vira `localhost-api-cliente`). Aceita várias de uma vez, uma por linha. |
| **Ligar o proxy** | Sobe o proxy com o que chegou e segura o fluxo. Com um tempo marcado, desliga sozinho ao fim e segue o fluxo com o resumo do tráfego. Se uma porta estiver ocupada, para e diz qual programa está nela. |

Uso, em outros fluxos, com o proxy ligado:

| Nó | Para quê |
|---|---|
| **Proxy no ar?** | Sai por sim ou por não. Diz as portas que não abriram e qual programa está nelas, e os nomes locais que ainda não chegam neste PC. |
| **Listar rotas** | Rotas com endereço local, destino e tráfego. |
| **Testar destinos** | Confere se o destino de uma rota, ou de todas, responde. Sai por sim quando todos respondem. |
| **Esperar o destino** | Fica testando até o destino responder ou o tempo acabar. Para depois de um deploy ou de conectar uma VPN. |
| **Requisição pelo proxy** | GET, POST etc. pelo nome local, do jeito que um app faria. Aceita a URL do site original e pode seguir redirecionamentos enquanto forem rotas do proxy. |
| **Conferir o disfarce** | Abre as páginas pela rota e aponta o que entrega o destino: domínio original em cabeçalhos e links, Vercel, Cloudflare, cookie preso ao domínio de lá. Sai por sim quando está limpo. |
| **Comparar com o original** | Abre as mesmas páginas pelo proxy e direto no destino e compara status, tipo e tamanho. Mostra quanto tempo o proxy acrescenta. |
| **Converter endereço** | Troca a URL original pela local, ou o contrário. |
| **Tráfego recente** | As últimas requisições com o total, os erros, os 404, os tempos, o resumo por rota e as mais lentas. |
| **Permissão de administrador** | Pede a permissão de administrador do Windows e segue por sim ou por não. Ações: só confirmar, pôr o DNS do Windows no proxy (o modo sem hosts), restaurar o DNS, tirar do hosts nomes que sobraram, ou rodar um programa. |

Nos campos de rota, a lista mostra as rotas do proxy. Também dá para digitar o nome local, `nome:porta`, a URL local ou `tcp 5433`.

### Exemplos de fluxo

- **Ambiente de demonstração:** Iniciar manualmente → Novo proxy (Gravar no hosts) → Rota (o destino do cliente) → Ligar o proxy. Terminou a demonstração, Parar.
- **Sempre no ar:** Ao abrir o BlueScreen → Novo proxy → Rota → Rota → Ligar o proxy.
- **Janela de teste:** Novo proxy → Rota → Ligar o proxy (30 minutos) → Notificação com `{{input.requisicoes}}` requisições e `{{input.erros}}` erros.
- **Vigia do disfarce** (outro fluxo): Agenda (de hora em hora) → Proxy no ar? → no "sim", Conferir o disfarce → no "não", Notificação com `{{input.vazamentos}}`.
- **Depois do deploy** (outro fluxo): Esperar o destino → no "sim", Comparar com o original → no "não", e-mail com `{{input.paginas}}`.
- **Trocar de ambiente:** dois fluxos com o mesmo nome local e destinos diferentes. Pare um e execute o outro: os apps continuam no mesmo `http://localhost-api`.

## Configurações

Aba Plugins › engrenagem do Proxy4Auto:

| Configuração | O que muda |
|---|---|
| **Porta de controle** | a porta de `127.0.0.1` por onde os nós falam com o proxy ligado (padrão 7170). Só troque se outro programa a usar. |

O que o proxy faz (portas, rotas, hosts, reescrita) não é configuração: está nos nós do fluxo que o liga.

## Limites conhecidos

- Um proxy por vez: com um fluxo segurando o proxy, o **Ligar o proxy** de outro fluxo para com erro até o primeiro ser parado.
- O **Ligar o proxy** segura o fluxo sem limite de tempo a partir do BlueScreen 2.1.39. Em versão mais antiga o BlueScreen encerra o nó depois de 1 hora, e o proxy sai junto.
- Enquanto o proxy está ligado, o fluxo dele ocupa uma das execuções simultâneas do Automator.
- Para mudar uma rota, mude o nó e execute o fluxo de novo: não há como mexer nas rotas com o proxy ligado.
- A porta padrão dos nomes locais é a 80. Se outro programa estiver nela, o **Ligar o proxy** diz qual; troque em **Novo proxy** ou libere a porta.
- "Gravar no hosts" depende de você aceitar a pergunta do Windows ao ligar: num fluxo sem ninguém no PC, deixe em "Não gravar".
- Com o DNS do Windows pelo proxy, restaure o DNS antes de parar o fluxo do proxy, senão a internet deste PC para.
- De fábrica o proxy só atende este PC.
- O **Conferir o disfarce** e o **Comparar com o original** leem até 2 MB por página e não executam JavaScript: um link montado no navegador escapa.
- O **Tráfego recente** vê as últimas 1000 linhas do log, desde que o proxy ligou.

## Para desenvolver

```
node tests/basico.test.mjs
```

Os testes rodam os nós como o Automator os roda (Novo proxy → Rota → Ligar o proxy segurando), com o proxy embutido numa pasta temporária, em portas livres e com um hosts de mentira: não tocam no hosts, no DNS nem nas portas 80 e 7170 deste PC.

## Autor e licença

Feito por Martin Hartfelder. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.4.0

- O proxy passa a ser montado pelo fluxo: **Novo proxy → Rota → Ligar o proxy**. Ele fica ligado enquanto o fluxo roda e desliga quando o fluxo para.
- Saíram os nós **Desligar o proxy**, **Apontar um nome**, **Remover rota** e **Ajustar o proxy**, e a configuração "Ligar o proxy sozinho": o que o proxy faz está todo nos nós do fluxo que o liga. Fluxos feitos na 0.3.0 com esses nós precisam ser refeitos.
- **Ligar o proxy** pode ficar ligado por um tempo marcado e seguir o fluxo com o resumo do tráfego.
- Um proxy deixado ligado pela 0.3.0 é desligado sozinho na primeira vez que um fluxo novo liga o dele.

### 0.3.0

- O proxy vem embutido no plugin: acabou a configuração "Pasta do proxy" e não é preciso ter o localhost-proxy instalado. A pasta do plugin não tem executável, arquivo de lote nem script.
- Os nós ligam o proxy sozinhos quando precisam, e ele sai quando o BlueScreen fecha (dá para desligar isso nas configurações ou deixá-lo ligado até o **Desligar o proxy**).
- Nós novos: **Esperar o destino** e **Comparar com o original**.
- **Permissão de administrador** ganhou "Gravar os nomes das rotas no hosts": o proxy segue sem administrador e os nomes locais chegam em qualquer programa. A ação de DNS liga o DNS local sozinha e não mexe no Windows se ele não subir.
- **Proxy no ar?** e **Apontar um nome** dizem qual programa ocupa a porta que não abriu e se o nome local já chega neste PC. O proxy tenta de novo a porta ocupada a cada 5 segundos.
- **Requisição pelo proxy** segue redirecionamentos; **Tráfego recente** resume por rota e mostra as mais lentas; **Ajustar o proxy** abre ou fecha o acesso pela rede (de fábrica, só este PC).
- **Desligar o proxy** é limpo: o proxy sai por conta própria e tira os nomes dele do hosts.
- Mudou: a porta de controle passa a ser a 7170 e o bloco no hosts tem marca própria, então o plugin não mexe mais num localhost-proxy avulso que esteja rodando. As rotas daquele não são importadas.

### 0.2.0

- Nó **Permissão de administrador**: pede a permissão do Windows ao executar e segue por sim ou por não, com as ações de hosts, DNS do Windows pelo proxy, restaurar o DNS e rodar um programa.
- Sem `.bat`: ligar como administrador, encerrar um proxy de administrador e limpar o hosts são feitos pelo próprio plugin, com a pergunta de permissão do Windows.

### 0.1.0

- Primeira versão: 12 nós no Automator para o localhost-proxy, com as listas de rotas vindas do painel.
