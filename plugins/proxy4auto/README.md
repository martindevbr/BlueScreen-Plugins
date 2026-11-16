# Proxy4Auto

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Martin Hartfelder |
| **Versão** | 0.2.0 |
| **Licença** | MIT |
| **Categoria** | Desenvolvimento |
| **Precisa de** | BlueScreen 2.1.33 ou mais novo · Node.js 18+ |
| **Automator** | 13 nós (categoria Proxy) |
| **Código** | [plugins/proxy4auto](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/proxy4auto) |
<!-- ficha:fim -->

Nós do Automator para o [localhost-proxy](https://github.com/martindevbr/proxy-server), o proxy reverso local que põe um serviço da internet atrás de um nome que resolve para `127.0.0.1` (`http://localhost-api` → `https://api.cliente.com`) e apaga os rastros do destino: links, cookies e os cabeçalhos da Vercel e da Cloudflare. Com o Proxy4Auto, os fluxos ligam e desligam o proxy, criam e trocam rotas, testam destinos, chamam APIs pelo nome local, conferem se o disfarce vaza o endereço de verdade e acompanham o tráfego.

O plugin não tem tela: tudo acontece no Automator.

## Como usar

Abra o **Automator** e procure a categoria **Proxy** na paleta. Os nós falam com o painel do proxy (`http://127.0.0.1:7070`, a `porta_painel` do `config.txt`), então o proxy precisa estar rodando, ou o fluxo começa com **Ligar o proxy**.

## Nós do Automator

| Nó | Para quê |
|---|---|
| **Proxy no ar?** | Sai por sim ou por não. Com "está tudo de pé", também confere portas que não abriram, DNS e linhas recusadas do `apontamentos.txt`. |
| **Ligar o proxy** | Sobe o `proxy.js` e espera o painel responder. Em modo administrador, o próprio BlueScreen pede a permissão do Windows (sem console nem `.bat`) e o proxy grava o hosts. |
| **Desligar o proxy** | Encerra o proxy, depois de conferir que quem escuta na porta do painel é ele. Se ele roda como administrador, pede a permissão do Windows para encerrar. Pode limpar o bloco do proxy no hosts. |
| **Permissão de administrador** | Ao executar, pede a permissão de administrador do Windows. Aceita, segue por sim e faz a ação escolhida: só confirmar, limpar o hosts, pôr o DNS do Windows no proxy (o modo sem hosts, sem o `dns-adaptador.ps1`), restaurar o DNS ou rodar um programa. Recusada, segue por não. |
| **Listar rotas** | Rotas com endereço local, destino e tráfego. Filtra só HTTP, só TCP, as que já deram erro ou as linhas recusadas. |
| **Apontar um nome** | Cria ou atualiza uma rota. Sem nome, sugere um a partir do destino (`https://api.cliente.com.br` vira `localhost-api-cliente`). Não duplica: com o mesmo destino, responde "Já estava assim". |
| **Remover rota** | Tira a rota. Os comentários do `apontamentos.txt` ficam. |
| **Testar destinos** | Confere se o destino de uma rota, ou de todas, responde. Sai por sim quando todos respondem. |
| **Requisição pelo proxy** | GET, POST etc. pelo nome local, do jeito que um app faria. Aceita a URL do site original e a converte sozinho. |
| **Conferir o disfarce** | Abre as páginas pela rota e aponta o que entrega o destino: domínio original em cabeçalhos e links, Vercel, Cloudflare, cookie preso ao domínio de lá. Sai por sim quando está limpo. |
| **Converter endereço** | Troca a URL original pela local, ou o contrário. Pode criar a rota que faltar. |
| **Ajustar o proxy** | Liga e desliga DNS local, hosts, reescrita de links e log detalhado, ou troca portas e o DNS de fora. |
| **Tráfego recente** | As últimas requisições com o total, os erros, os 404 e os tempos. |

Nos campos de rota, a lista mostra as rotas que o proxy tem agora. Também dá para digitar o nome local, `nome:porta`, a URL local ou `tcp 5433`.

### Exemplos de fluxo

- **Vigia do disfarce:** Agenda (de hora em hora) → Conferir o disfarce → no "não", Notificação com `{{input.vazamentos}}`.
- **Ambiente de demonstração:** Iniciar manualmente → Ligar o proxy → Apontar um nome (o destino do cliente) → Conferir o disfarce → Notificação com o `{{input.local}}`.
- **Destino caiu:** Agenda → Testar destinos → no "não", e-mail com `{{input.resultados}}`.
- **Modo sem hosts:** Ligar o proxy → Ajustar o proxy (DNS local = sim) → Permissão de administrador (DNS do Windows pelo proxy). Para voltar: Permissão de administrador (Restaurar o DNS do Windows).
- **Trocar de ambiente:** Apontar um nome com o mesmo nome e outro destino e "Trocar o destino": os apps continuam no mesmo `http://localhost-api`.

## Configurações

Aba Plugins › engrenagem do Proxy4Auto:

| Configuração | O que muda |
|---|---|
| **Endereço do painel do proxy** | onde o painel responde (padrão `http://127.0.0.1:7070`). Só aceita este PC. |
| **Pasta do proxy** | a pasta com o `proxy.js`, para **Ligar o proxy**. Vazia, usa a do proxy que estiver rodando. |

## Limites conhecidos

- O proxy encerrado de fora não tira o bloco dele do hosts. Por isso o **Desligar** tem a opção de limpar: o plugin tira o bloco ele mesmo, pedindo a permissão do Windows quando precisa.
- Ligar como administrador e desligar um proxy de administrador dependem de você aceitar a pergunta do Windows: num fluxo sem ninguém no PC, use o modo Normal.
- O **Conferir o disfarce** lê até 2 MB por página e não executa JavaScript: um link montado no navegador escapa.
- O **Tráfego recente** vê o que o painel guarda, que são as últimas 400 linhas do log.

## Para desenvolver

```
node tests/basico.test.mjs
```

Os testes usam um painel falso e não tocam no proxy, no hosts nem no DNS deste PC.

## Autor e licença

Feito por Martin Hartfelder. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.2.0

- Nó **Permissão de administrador**: pede a permissão do Windows ao executar e segue por sim ou por não, com as ações de hosts, DNS do Windows pelo proxy, restaurar o DNS e rodar um programa.
- Sem `.bat`: ligar como administrador, encerrar um proxy de administrador e limpar o hosts são feitos pelo próprio plugin, com a pergunta de permissão do Windows.

### 0.1.0

- Primeira versão: 12 nós no Automator para o localhost-proxy, com as listas de rotas vindas do painel.
