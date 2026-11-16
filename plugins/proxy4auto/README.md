# Proxy4Auto

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Martin Hartfelder |
| **Versão** | 0.3.0 |
| **Licença** | MIT |
| **Categoria** | Desenvolvimento |
| **Precisa de** | BlueScreen 2.1.33 ou mais novo · Node.js 18+ |
| **Automator** | 15 nós (categoria Proxy) |
| **Código** | [plugins/proxy4auto](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/proxy4auto) |
<!-- ficha:fim -->

Um proxy reverso local que já vem dentro do plugin e é comandado por nós do Automator. Ele põe um serviço da internet atrás de um nome que resolve para `127.0.0.1` (`http://localhost-api` → `https://api.cliente.com`) e apaga os rastros do destino: links, cookies e os cabeçalhos da Vercel e da Cloudflare. Os fluxos criam e trocam rotas, testam e esperam destinos, chamam APIs pelo nome local, conferem se o disfarce vaza o endereço de verdade, comparam com o site original e acompanham o tráfego.

Não precisa instalar nem apontar para nenhum programa de fora: o proxy é um módulo do próprio plugin (o mesmo motor do [localhost-proxy](https://github.com/martindevbr/proxy-server)). O plugin não tem tela e não traz executável, arquivo de lote nem script: tudo acontece no Automator.

## Como usar

Abra o **Automator** e procure a categoria **Proxy** na paleta. Comece por **Apontar um nome**: o nó liga o proxy sozinho, cria a rota e diz o endereço local. Com o proxy ligado assim, ele sai quando o BlueScreen fecha; as rotas ficam guardadas para a próxima vez.

Sem administrador o proxy já atende a **Requisição pelo proxy**, os testes, o disfarce e a comparação. Para o nome local chegar em outros programas (o navegador, o seu app), ele precisa estar no hosts do Windows: use **Permissão de administrador** com "Gravar os nomes das rotas no hosts", ou **Ligar o proxy** como administrador. Nos dois casos quem pede a permissão é o próprio Windows.

## Nós do Automator

| Nó | Para quê |
|---|---|
| **Proxy no ar?** | Sai por sim ou por não, sem ligar o proxy. Diz as portas que não abriram e qual programa está nelas, as rotas recusadas e os nomes locais que ainda não chegam neste PC. |
| **Ligar o proxy** | Liga o proxy embutido e espera ele responder. Normal ou como administrador (grava o hosts sozinho); fica ligado até fechar o BlueScreen ou até o Desligar. |
| **Desligar o proxy** | O proxy sai por conta própria e tira os nomes dele do hosts. Se faltar permissão, o nó limpa, e o Windows pergunta. Avisa se o DNS do Windows ainda aponta para o proxy. |
| **Permissão de administrador** | Pede a permissão de administrador do Windows e segue por sim ou por não. Ações: só confirmar, gravar os nomes das rotas no hosts, tirá-los, pôr o DNS do Windows no proxy (o modo sem hosts), restaurar o DNS ou rodar um programa. |
| **Listar rotas** | Rotas com endereço local, destino e tráfego. Filtra só HTTP, só TCP, as que já deram erro ou as linhas recusadas. |
| **Apontar um nome** | Cria ou atualiza uma rota. Sem nome, sugere um a partir do destino (`https://api.cliente.com.br` vira `localhost-api-cliente`). Não duplica, testa o destino, diz se o nome já chega neste PC e pode gravar o hosts na hora. |
| **Remover rota** | Tira a rota e diz quantas restam. |
| **Testar destinos** | Confere se o destino de uma rota, ou de todas, responde. Sai por sim quando todos respondem. |
| **Esperar o destino** | Fica testando até o destino responder ou o tempo acabar. Para depois de um deploy ou de conectar uma VPN. |
| **Requisição pelo proxy** | GET, POST etc. pelo nome local, do jeito que um app faria. Aceita a URL do site original e pode seguir redirecionamentos enquanto forem rotas do proxy. |
| **Conferir o disfarce** | Abre as páginas pela rota e aponta o que entrega o destino: domínio original em cabeçalhos e links, Vercel, Cloudflare, cookie preso ao domínio de lá. Sai por sim quando está limpo. |
| **Comparar com o original** | Abre as mesmas páginas pelo proxy e direto no destino e compara status, tipo e tamanho. Mostra quanto tempo o proxy acrescenta. |
| **Converter endereço** | Troca a URL original pela local, ou o contrário. Pode criar a rota que faltar. |
| **Ajustar o proxy** | Liga e desliga reescrita de links, DNS local, hosts, acesso pela rede e log detalhado, ou troca portas e o DNS de fora. |
| **Tráfego recente** | As últimas requisições com o total, os erros, os 404, os tempos, o resumo por rota e as mais lentas. |

Nos campos de rota, a lista mostra as rotas do proxy, mesmo com ele desligado. Também dá para digitar o nome local, `nome:porta`, a URL local ou `tcp 5433`.

### Exemplos de fluxo

- **Ambiente de demonstração:** Iniciar manualmente → Apontar um nome (o destino do cliente, "Gravar no hosts") → Conferir o disfarce → Notificação com o `{{input.local}}`.
- **Vigia do disfarce:** Agenda (de hora em hora) → Conferir o disfarce → no "não", Notificação com `{{input.vazamentos}}`.
- **Depois do deploy:** Esperar o destino → no "sim", Comparar com o original → no "não", e-mail com `{{input.paginas}}`.
- **Destino caiu:** Agenda → Testar destinos → no "não", e-mail com `{{input.resultados}}`.
- **Modo sem hosts:** Permissão de administrador (DNS do Windows pelo proxy). Para voltar: Permissão de administrador (Restaurar o DNS do Windows).
- **Trocar de ambiente:** Apontar um nome com o mesmo nome e outro destino e "Trocar o destino": os apps continuam no mesmo `http://localhost-api`.

## Configurações

Aba Plugins › engrenagem do Proxy4Auto:

| Configuração | O que muda |
|---|---|
| **Ligar o proxy sozinho** | ligado (o padrão), qualquer nó que precise do proxy o liga sem administrador, e ele sai quando o BlueScreen fecha. Desligado, o fluxo precisa do nó **Ligar o proxy**. |
| **Porta de controle** | a porta de `127.0.0.1` por onde os nós mandam no proxy (padrão 7170). Só troque se outro programa a usar. |

As rotas e os ajustes do proxy ficam em texto na pasta de dados do plugin (`proxy/apontamentos.txt` e `proxy/config.txt`), junto com o `proxy.log` da última vez que ele ligou.

## Limites conhecidos

- A porta padrão dos nomes locais é a 80. Se outro programa estiver nela, o **Proxy no ar?** diz qual; o proxy tenta de novo sozinho a cada 5 segundos, ou troque com **Ajustar o proxy** (Porta HTTP).
- Sem administrador o proxy não grava o hosts. Depois de criar rotas novas, rode de novo "Gravar os nomes das rotas no hosts", ou escolha "Gravar no hosts" no próprio **Apontar um nome**.
- As ações que dependem da pergunta do Windows precisam de alguém no PC para aceitar: num fluxo sem ninguém, fique no modo Normal.
- De fábrica o proxy só atende este PC. Para outros aparelhos da rede, ligue "Aceitar outros aparelhos da rede" no **Ajustar o proxy**.
- O **Conferir o disfarce** e o **Comparar com o original** leem até 2 MB por página e não executam JavaScript: um link montado no navegador escapa.
- O **Tráfego recente** vê as últimas 1000 linhas do log, desde que o proxy ligou.

## Para desenvolver

```
node tests/basico.test.mjs
```

Os testes sobem o proxy embutido numa pasta temporária, em portas livres e com um hosts de mentira: não tocam no hosts, no DNS nem nas portas 80 e 7170 deste PC.

## Autor e licença

Feito por Martin Hartfelder. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

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
