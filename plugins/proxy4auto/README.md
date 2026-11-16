# Proxy4Auto

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Martin Hartfelder |
| **Versão** | 0.5.0 |
| **Licença** | MIT |
| **Categoria** | Desenvolvimento |
| **Precisa de** | BlueScreen 2.1.33 ou mais novo · Node.js 18+ |
| **Automator** | 11 nós (categoria Proxy) |
| **Código** | [plugins/proxy4auto](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/proxy4auto) |
<!-- ficha:fim -->

Um proxy reverso local que já vem dentro do plugin, num nó só do Automator. Ele põe um serviço da internet atrás de um nome que resolve para `127.0.0.1` (`http://localhost-api` → `https://api.cliente.com`) e apaga os rastros do destino: links, cookies e os cabeçalhos da Vercel e da Cloudflare.

O proxy é o nó **Proxy**: você põe as rotas nele e executa o fluxo. Ele fica no ar enquanto o fluxo roda, mostra o registro ao vivo e dispara o que estiver ligado nas saídas dele. Parou o fluxo, o proxy desliga.

Não precisa instalar nem apontar para nenhum programa de fora: o proxy é um módulo do próprio plugin (o mesmo motor do [localhost-proxy](https://github.com/martindevbr/proxy-server)). O plugin não tem tela e não traz executável, arquivo de lote nem script.

## Como usar

No **Automator**, categoria **Proxy**, ligue um gatilho (Iniciar manualmente, ou Ao abrir o BlueScreen) no nó **Proxy** e preencha a tabela de rotas: o destino e, se quiser, o nome local. Execute.

- O nó fica em execução, com o estado (`no ar · 2 rotas · 42 requisições · 1 erro`) e as últimas linhas do registro dentro dele. Clique no nó para ver o registro inteiro no painel, atualizando sozinho.
- O que você ligar nas saídas acontece na hora, com o proxy no ar:
  - **ao ligar** dispara uma vez, quando o proxy sobe. É onde entram o Conferir o disfarce, o Testar destinos ou um aviso de "está no ar".
  - **cada requisição** dispara a cada requisição que passa, com rota, método, caminho, status e tempo.
  - **cada erro** dispara nas que falham (sem resposta ou status 500 ou mais).
- Clique em **Parar** e o proxy sai, tirando os nomes dele do hosts.

## Nós do Automator

| Nó | Para quê |
|---|---|
| **Proxy** | O proxy inteiro: as rotas (site ou API por nome, banco ou outro serviço TCP por porta), a porta dos nomes locais, se grava os nomes no hosts, a reescrita de links e o que aparece no registro. Segura o fluxo enquanto está no ar e tem as saídas **ao ligar**, **cada requisição** e **cada erro**. |
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

Os nós de uso funcionam ligados numa saída do **Proxy** (no mesmo fluxo) ou em outro fluxo, desde que o proxy esteja no ar. Nos campos de rota, a lista mostra as rotas do proxy; também dá para digitar o nome local, `nome:porta`, a URL local ou `tcp 5433`.

Na tabela de rotas do **Proxy**: sem nome local, ele sai do destino (`https://api.cliente.com.br` vira `localhost-api-cliente`). Para um banco ou outro serviço TCP, escreva `tcp://host:porta` no destino e a porta local.

### Exemplos de fluxo

- **Ambiente de demonstração:** Iniciar manualmente → Proxy (Gravar no hosts). Terminou, Parar.
- **Confere ao subir:** Proxy → *ao ligar* → Conferir o disfarce → no "não", Notificação com `{{input.vazamentos}}`.
- **Avisar quando falhar:** Proxy → *cada erro* → Notificação com `{{input.metodo}} {{input.url}} respondeu {{input.status}}`.
- **Contar ou guardar o tráfego:** Proxy → *cada requisição* → Variável (somar) ou Gravar em arquivo.
- **Sempre no ar:** Ao abrir o BlueScreen → Proxy.
- **Trocar de ambiente:** dois fluxos com o mesmo nome local e destinos diferentes. Pare um e execute o outro: os apps continuam no mesmo `http://localhost-api`.

## Configurações

Aba Plugins › engrenagem do Proxy4Auto:

| Configuração | O que muda |
|---|---|
| **Porta de controle** | a porta de `127.0.0.1` por onde os nós falam com o proxy ligado (padrão 7170). Só troque se outro programa a usar. |

O que o proxy faz (portas, rotas, hosts, reescrita) não é configuração: está nos campos do nó **Proxy**.

## Limites conhecidos

- O registro ao vivo e as saídas em tempo real precisam do BlueScreen 2.1.40 ou mais novo. No 2.1.39 o proxy liga e segura o fluxo, mas sem registro nem eventos; antes dele, o BlueScreen encerra o nó depois de 1 hora.
- Um proxy por vez: com um fluxo segurando o proxy, o **Proxy** de outro fluxo para com erro até o primeiro ser parado.
- Os eventos rodam um de cada vez. Com muito tráfego e um trecho demorado ligado em *cada requisição*, eles fazem fila; para só reagir a problemas, ligue em *cada erro*.
- Enquanto o proxy está ligado, o fluxo dele ocupa uma das execuções simultâneas do Automator.
- Para mudar uma rota, mude o nó e execute o fluxo de novo.
- A porta padrão dos nomes locais é a 80. Se outro programa estiver nela, o **Proxy** para e diz qual; troque a porta no nó ou libere-a.
- "Gravar no hosts" depende de você aceitar a pergunta do Windows ao ligar: num fluxo sem ninguém no PC, deixe em "Não gravar no hosts".
- Com o DNS do Windows pelo proxy, restaure o DNS antes de parar o fluxo do proxy, senão a internet deste PC para.
- De fábrica o proxy só atende este PC.
- O **Conferir o disfarce** e o **Comparar com o original** leem até 2 MB por página e não executam JavaScript: um link montado no navegador escapa.
- O registro ao vivo guarda as últimas 200 linhas; o **Tráfego recente**, as últimas 1000 requisições e avisos.

## Para desenvolver

```
node tests/basico.test.mjs
```

Os testes rodam os nós como o Automator os roda (o nó Proxy segurando o fluxo e mandando registro e eventos), com o proxy embutido numa pasta temporária, em portas livres e com um hosts de mentira: não tocam no hosts, no DNS nem nas portas 80 e 7170 deste PC.

## Autor e licença

Feito por Martin Hartfelder. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.5.0

- O proxy virou um nó só, **Proxy**, com as rotas numa tabela. Saíram **Novo proxy**, **Rota** e **Ligar o proxy**: fluxos feitos na 0.4.0 precisam trocar os três por ele.
- Registro ao vivo: o estado e as últimas linhas aparecem no nó, e o registro inteiro no painel, enquanto o proxy roda.
- Saídas em tempo real: **ao ligar**, **cada requisição** e **cada erro** disparam o que estiver ligado nelas com o proxy no ar. Os nós de uso agora cabem no mesmo fluxo do proxy.

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
