# Bluetego

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Martin Hartfelder |
| **Versão** | 0.12.0 |
| **Licença** | MIT |
| **Categoria** | Outros |
| **Precisa de** | BlueScreen 2.1.33 ou mais novo · Node.js 18+ |
| **Automator** | 5 nós (categoria Bluetego) |
| **Código** | [plugins/bluetego](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/bluetego) |
<!-- ficha:fim -->

Investigação OSINT em grafo dentro do BlueScreen, no estilo do Maltego: você põe uma entidade (um domínio, um IP, um e-mail, um apelido, um nome, um CNPJ) e puxa o que está ligado a ela, em cadeia, até enxergar a infraestrutura, as pessoas e os pontos fracos. Serve para reconhecimento em pentest autorizado, resposta a incidente, conferir a exposição da própria empresa, golpes com a marca e due diligence de fornecedores.

O que ele faz diferente do Maltego:

- **Sem conta, sem licença, sem créditos.** As 105 transformações usam fontes públicas e gratuitas. VirusTotal, Portal da Transparência, Brave Search, token do GitHub e API da Anthropic são opcionais, com a chave guardada no Cofre da IDE.
- **O grafo pensa junto.** A aba **Análise** mostra pistas que o Bluetego tira sozinho (ligações que faltam, infraestrutura em comum, próximos passos), e a **IA** (os agentes da IDE, a API da Anthropic ou um Ollama local) analisa, responde perguntas e conduz a investigação no **piloto automático**.
- **O que as ferramentas especializadas fazem, num lugar só:** contas em até 2.434 sites (regras do Maigret), subdomínios de 4 fontes (como o Amass), metadados de documentos (como o FOCA), exploração do site (robots, sitemap, JavaScript, `.git` e `.env` expostos), pivôs por ID de rastreamento e buscas prontas.
- **Máquinas prontas** que encadeiam transformações como um investigador faria à mão.
- **Aprende com o uso:** o Bluetego anota quanto cada transformação rende em cada tipo de entidade neste PC, mostra a média no botão e sugere primeiro o que costuma render.
- **Organização de verdade**: cinco layouts animados (forças, hierárquico, radial, por tipo, círculo), resultados grandes recolhidos num "+N", foco na vizinhança, linha do tempo e minimapa.
- **Alertas no grafo**: portas expostas (RDP, SMB, bancos), CVEs, domínio sem DMARC, certificado vencendo, domínios parecidos registrados, empresa baixada na Receita, relatórios de ameaça.
- **Tudo local**: as investigações ficam na pasta de dados do plugin, com anotações, cores, histórico e desfazer.

## Como usar

O Bluetego aparece na barra da esquerda (ícone de grafo). Ele abre o grafo numa aba fixa e, na esquerda, a lista de investigações e os tipos de entidade no grafo.

1. Escreva no campo **Investigar** (no topo) um domínio, IP, e-mail, `@apelido`, nome, CNPJ, CPF, CEP, telefone ou CVE, e `Enter`. O tipo é adivinhado pelo valor e o **primeiro olhar** já roda: um roteiro curto para aquele tipo, com só o que importa (o que ficou de fora fica contado na entidade, e rodar a transformação de novo traz tudo). A entidade gira enquanto roda. Vários valores de uma vez também servem (aí rodam as transformações rápidas).
2. Clique numa entidade: aparece uma **barra de ações** em cima dela (rápidas, transformar, máquinas, foco, recolher, abrir, remover) e os detalhes no painel da direita.
3. Rode uma **máquina** (botão **Máquinas**, ou na barra da entidade) para várias transformações em sequência.
4. Abra a aba **Análise** para as pistas e a IA.
5. **Exportar** gera relatório em Markdown, planilha CSV, GraphML (Gephi, yEd, Maltego), SVG, PNG ou a investigação inteira em JSON.

Também dá para **colar** (`Ctrl+V` no grafo: um valor é investigado na hora, um texto maior abre a extração) e **arrastar um arquivo** para o grafo (log, e-mail, relatório, lista ou JSON do Bluetego).

| | |
|---|---|
| **Duplo clique** | na entidade: rodar as rápidas · no fundo: adicionar |
| **Botão direito** | na entidade: transformações, máquinas, ligar, foco, cores · numa ligação: mudar o rótulo, inverter, remover |
| `L` ou **Alt + arrastar** | ligar a entidade escolhida a outra (com sugestões de rótulo); duas selecionadas: ligar as duas |
| `N` | nova entidade já ligada à escolhida |
| `.` | só a vizinhança da escolhida (de novo: mais um salto) |
| `C` | recolher ou abrir os resultados soltos (o "+N") |
| `1` a `5` | forças, hierárquico, radial, por tipo, círculo |
| Setas | andar para a entidade vizinha |
| `F` · `M` · `T` · `P` | ajustar à tela · minimapa · linha do tempo · painel |
| **Shift + arrastar** · **Ctrl + clique** | selecionar várias · somar à seleção |
| `Ctrl+Z` · `Ctrl+Y` · `Del` · `Ctrl+C` · `?` | desfazer · refazer · remover · copiar os valores · todos os atalhos (funcionam em qualquer lugar da página, menos em campos de texto) |
| `Ctrl+F` · `/` | buscar no grafo (o campo mostra quantas entidades achou) |
| **Buscar em tudo** | "Bluetego: abrir", "Bluetego: nova investigação", "Bluetego: extrair entidades da seleção do editor" |
| Botão direito num arquivo do projeto | **Extrair entidades no Bluetego** |

Ligações feitas à mão (ou aceitas da IA) aparecem tracejadas. Uma transformação que traz mais de 25 resultados soltos guarda todos num "+N" na entidade: um clique no número abre.

## Organizar o grafo

| Layout | Para quê |
|---|---|
| **Forças** | o padrão: as ligações puxam e as entidades se afastam, sem se encostar |
| **Hierárquico** | da entidade de partida (ou da escolhida) para baixo, em níveis; muitos resultados de um pai viram uma grade, e muitos ramos quebram em fileiras |
| **Radial** | anéis em volta da entidade de partida, cada ramo na sua fatia |
| **Agrupado por tipo** | um grupo para cada tipo, com o nome e a quantidade; as ligações entre grupos mostram como os tipos se cruzam |
| **Círculo** | todas num círculo, ordenadas por tipo |

Numa organização fixa, cada resultado novo reorganiza com animação, sem mexer na câmera. Os rótulos têm tamanho fixo e não se sobrepõem nem cobrem entidades: cada um procura um lado livre (embaixo, em cima, à direita, à esquerda), e quando falta espaço ficam os das entidades mais importantes (escolhidas, com alerta, com mais ligações). Contas e URLs aparecem curtas ("GitHub · usuário", "site/…/página"); o valor inteiro fica na dica do mouse. Num grafo com mais de 25 entidades, as folhas só mostram o nome de perto. Passar o mouse acende a entidade e as vizinhas; sobre uma ligação, mostra de onde veio.

## Análise: pistas e IA

**Pistas** são o que o Bluetego conclui sozinho olhando o grafo, cada uma com a ação pronta:

- ligações que faltam: e-mail e o domínio dele, subdomínio e domínio, IP dentro de um bloco, URL e o site, a mesma organização escrita de jeitos diferentes, o valor de uma entidade citado nas propriedades de outra, e-mail ou apelido que combina com o nome de uma pessoa, CPF que combina com o CPF mascarado de um sócio;
- infraestrutura em comum: domínios diferentes no mesmo servidor, com o mesmo e-mail, a mesma organização, o mesmo CNPJ;
- os pontos de atenção e os próximos passos (as transformações que ainda faltam nas entidades centrais).

**IA** (configure o provedor na engrenagem do plugin):

- **Analisar**: resumo, hipóteses com a confiança (alta, média, baixa), ligações que faltam, entidades que vale buscar e próximas transformações, cada uma com um botão para aplicar.
- **Perguntar**: pergunta livre sobre o grafo ("quem está por trás deste domínio?").
- **Piloto automático**: você escreve o objetivo; a IA escolhe as transformações, o Bluetego roda, e ela olha o resultado e escolhe de novo, até chegar ao objetivo ou ao limite de rodadas. No fim, escreve a conclusão.
- **Só a seleção**: a IA olha só as entidades escolhidas e as vizinhas.

A IA trabalha só leitura: ela não mexe em arquivos nem roda comandos, e nada entra no grafo sem o seu clique, exceto as transformações que o piloto automático roda (que só consultam as fontes públicas da tabela abaixo). A resposta é conferida antes de aparecer: ligação para entidade que não existe, tipo inventado ou transformação que não serve para aquele tipo são descartados.

## Transformações

As marcadas com ⚡ são as rápidas, que o duplo clique roda.

| De | Transformação | Fonte |
|---|---|---|
| Domínio | ⚡ Resolver IPs (A, AAAA, CNAME) · ⚡ MX · ⚡ NS | DNS sobre HTTPS (Google, Cloudflare de reserva) |
| Domínio | ⚡ TXT, SPF e DMARC: os serviços que a empresa usa e quem pode mandar e-mail por ela | DNS |
| Domínio | ⚡ Segurança do e-mail: DMARC (política e quem recebe os relatórios), seletores DKIM, MTA-STS, TLS-RPT, BIMI, DNSSEC | DNS |
| Domínio | Credenciais roubadas por infostealer: funcionários e usuários infectados, logins vazados da empresa | Hudson Rock |
| Domínio | ⚡ Popularidade no mundo (ranking e variação) | Tranco |
| Domínio | Endereços no Common Crawl (segunda fonte de URLs antigas, independente da Wayback) | Common Crawl |
| Domínio, IP | Varreduras públicas: páginas, IPs que serviam, capturas de tela (últimos 30 dias) | urlscan.io |
| Domínio | ⚡ Registro (RDAP/WHOIS): registrante, registrador, contatos, datas e o CNPJ do titular (.br) | rdap.org |
| Domínio | ⚡ Tecnologias do site (servidor, CMS, frameworks, CDN, análise), com a versão exposta | o próprio site |
| Domínio | ⚡ Certificado TLS: emissor, validade, outros nomes do certificado | o próprio site |
| Domínio | Subdomínios de 4 fontes, com quem achou cada um | crt.sh, certspotter, HackerTarget, Wayback |
| Domínio | Explorar o site: o que o robots.txt esconde, o sitemap, rotas de API e chaves expostas no JavaScript, `.git`, `.env` e `.DS_Store` expostos, cabeçalhos de segurança que faltam | o próprio site |
| Domínio | Documentos públicos (PDF, Word, Excel, PowerPoint) e os metadados: autores, usuários do Windows, empresa, programa | o próprio site + Wayback |
| Domínio | ⚡ IDs de rastreamento (Google Analytics, AdSense, Tag Manager, Meta Pixel, Hotjar, Clarity) | o próprio site |
| ID de rastreamento | ⚡ Outros sites com o mesmo ID (costumam ser do mesmo dono) | HackerTarget |
| Domínio | Ler o site: título, e-mails, telefones, perfis sociais, domínios citados | o próprio site |
| Domínio, URL | Dados de contato do site: telefones, WhatsApp, e-mails, CNPJ (com a razão social pela Receita), endereço e CEP, redes sociais (Instagram, Facebook, LinkedIn, YouTube, TikTok, X, Threads, Pinterest…), lidos da página inicial, das páginas de contato, institucionais e de privacidade, e dos dados estruturados (schema.org) | o próprio site |
| Domínio | Endereços arquivados, primeiro os que interessam (backups, painéis, APIs, `.env`) | Wayback Machine |
| Domínio | Contatos de segurança: `security.txt` e o responsável no SOA | o próprio site + DNS |
| Domínio | Domínios parecidos registrados (letra trocada, final diferente, palavra a mais, até 260 variações) | DNS |
| IP | ⚡ DNS reverso · ⚡ sistema autônomo e prefixo (Team Cymru de reserva) · ⚡ localização e provedor (aproximada) | DNS, RIPEstat, Team Cymru, ipwho.is |
| IP | ⚡ Reputação: varre a internet? (GreyNoise), em quais listas de ameaça está e quem cuida de abuso (SANS ISC), relay do Tor, spam (StopForumSpam), rede de criminosos (Spamhaus DROP) | GreyNoise, SANS ISC, Tor Onionoo, StopForumSpam, Spamhaus |
| IP | ⚡ De qual nuvem, CDN ou robô é (AWS com serviço e região, Google, Google Cloud, Azure, Cloudflare, Oracle, Fastly, DigitalOcean, Linode, Vultr; Googlebot, Bingbot e GPTBot verificados pela faixa oficial) | faixas publicadas pelos provedores |
| IP | ⚡ Listas de bloqueio e ameaça: quantas listas citam o IP (IPsum), ataques nas últimas 48 h (FireHOL), comprometidos (Emerging Threats), 7 DNSBLs com o motivo, rede de criminosos (Spamhaus ASN-DROP e DROP v6) | IPsum, FireHOL, Emerging Threats, DNSBLs, Spamhaus |
| IP | Proxy, VPN, Tor, tipo de rede e ataques vistos | proxycheck.io |
| IP | Histórico do bloco: quem anuncia, desde quando, quem já anunciou antes, alocação no RIR e RPKI (inválido vira alerta) | RIPEstat |
| IP | Domínios que já apontaram para o IP, com datas, e os de agora | Mnemonic PassiveDNS, ip.thc.org |
| IP | Certificado servido na porta 443: nomes, organização, emissor, impressão digital (toca o alvo) | o próprio IP |
| IP | ⚡ Portas abertas e vulnerabilidades | Shodan InternetDB |
| IP | Domínios que apontam ou já apontaram para o IP (DNS passivo e reverso) | AlienVault OTX + HackerTarget |
| IP, rede | Dono do bloco (RDAP) | rdap.org |
| Sistema autônomo | ⚡ Quem opera · prefixos anunciados · vizinhos (quem dá e recebe trânsito) | RIPEstat |
| Sistema autônomo | Perfil da rede: site, pontos de troca, data centers, AS-SET | PeeringDB |
| IP, domínio, hash, URL | ⚡ Relatórios de ameaça · reputação no VirusTotal (chave no Cofre) | AlienVault OTX, VirusTotal |
| Hash | ⚡ Arquivo conhecido? Nome, tamanho, produto, se é malicioso, e os outros hashes do mesmo arquivo | CIRCL hashlookup |
| URL | ⚡ Domínio da URL · ⚡ seguir redirecionamentos e ler cabeçalhos | local, o próprio site |
| URL | Repositório do GitHub: dono, contribuidores, e-mails dos commits, site, tópicos | GitHub |
| E-mail | ⚡ Domínio do e-mail (e se ele recebe) · ⚡ perfil no Gravatar · ⚡ contas do GitHub que fazem commits com ele | DNS, Gravatar, GitHub |
| E-mail | ⚡ Chaves PGP: nome real e os outros e-mails da mesma chave (verificados no keys.openpgp.org, autodeclarados no keyserver.ubuntu.com) | servidores de chaves PGP |
| Apelido | Atividade no Hacker News e os sites que o apelido mais divulga · pacotes, repositórios e o e-mail público no npm · conta global da Wikimedia (todas as wikis) | Algolia HN, npm, Wikimedia |
| Apelido, pessoa | Launchpad (apelidos de IRC e chaves GPG) · fediverso (Mastodon e outras instâncias) · Stack Overflow e as contas da mesma pessoa na rede Stack Exchange | Launchpad, mastodon.social, Stack Exchange |
| Apelido | ⚡ Contas com este nome em 19 sites, com nome, cidade, empresa e site de cada perfil; provas do Keybase | APIs dos sites |
| Apelido | Contas em centenas de sites (até 2.434, os mais conhecidos primeiro), cada achado reconferido | regras do Maigret |
| Apelido | GitHub a fundo: e-mails dos commits e das chaves GPG, chaves SSH, repositórios, linguagens, organizações, quem segue e é seguido | GitHub |
| Apelido, conta, URL, e-mail | Investigar os commits: o fuso horário real (cada commit guarda o do computador), o horário e os dias em que a pessoa trabalha, os nomes e e-mails usados (com o fuso de cada um), o nome do computador vazado em e-mail mal configurado, coautores, repositórios de terceiros em que contribui, quanto assina os commits e o idioma das mensagens; robôs e IA ficam à parte | GitHub |
| Conta | ⚡ Nome de usuário da conta (para procurar o mesmo nome em outros sites) | local |
| Pessoa | ⚡ Pessoa pública: cargos, onde trabalha e estudou, contas oficiais | Wikidata |
| Pessoa | ⚡ Quantas pessoas no Brasil têm o primeiro nome (risco de homônimo) e a década mais comum de nascimento | IBGE (Censo) |
| Pessoa | Pesquisador: ORCID, instituição e citações · chaves PGP com o nome · contas no Bluesky com o nome | OpenAlex, keyserver.ubuntu.com, Bluesky |
| Pessoa | ⚡ Listas de sanções: EUA, ONU e União Europeia, com cargo e dados para descartar homônimo · ⚡ inabilitado para cargo público ou proibido de licitar | OFAC, ONU, UE, TCU |
| Pessoa | Parlamentar desde o Império: mandatos e partidos na Câmara, nascimento, ocupações declaradas; no Senado (desde 1946) comissões e suplentes | Câmara dos Deputados, Senado Federal |
| Pessoa | Processos no STF em que é parte · atos no Diário Oficial da União (nomeações, exonerações, punições, contratos), com o trecho e o órgão | STF, Imprensa Nacional |
| Pessoa | Possíveis menções em vazamentos de offshores (Panama, Paradise e Pandora Papers) | ICIJ Offshore Leaks |
| Pessoa | Autor(a): registro nas bibliotecas nacionais e livros · Prêmio Nobel · menções na imprensa mundial nos últimos 3 meses | VIAF, Open Library, Fundação Nobel, GDELT |
| Conta (ORCID) | Perfil completo do ORCID: empregos com cargo e ano, sites, e-mails públicos, outros nomes | ORCID |
| Pessoa | E-mails prováveis nos domínios ligados à pessoa, confirmados no Gravatar | DNS + Gravatar |
| Pessoa | Pesquisador com o nome e a instituição · contas do GitHub com o nome · artigos da Wikipédia · apelidos prováveis | ORCID, GitHub, Wikipédia, local |
| Organização | Localizar a empresa pelo nome e a cidade ("Oficina de Costura Neca tramandai"): endereço com CEP e mapa, telefone, perfis nas redes, as páginas que a citam e o CNPJ que a Receita confirma (mesma cidade e nome parecido) | busca na web (DuckDuckGo, Bing; Brave com a chave gratuita no Cofre), fichas schema.org dos diretórios, IBGE, Receita |
| Organização | ⚡ Site oficial, sede, donos, fundadores · artigos da Wikipédia | Wikidata, Wikipédia |
| CNPJ | ⚡ Razão social, nome fantasia, sócios (empresas sócias viram CNPJ), endereço, CEP, telefone, e-mail, regime (Simples, MEI) com a tributação ano a ano e as datas de entrada e saída do Simples e do MEI, atividades, matriz da filial | Receita (BrasilAPI, com a Minha Receita de reserva) |
| CNPJ | Contratos com o poder público em todas as esferas (quem contratou a empresa e quem ela contratou, com valores) e o cadastro de fornecedor federal | PNCP, Compras.gov |
| CNPJ | ⚡ Financiamentos do BNDES · ⚡ quantos domínios .br, blocos IP e ASN a empresa tem no registro.br | BNDES, registro.br |
| CNPJ | Registros em órgãos reguladores: companhia aberta (com a auditora), instituição do Banco Central, geradora de energia, transportadora (RNTRC), operadora de plano de saúde | CVM, Banco Central, ANEEL, ANTT, ANS |
| CNPJ, pessoa | Atos no Diário Oficial da União (por CNPJ: registros da ANVISA, extratos de contrato, notificações) | Imprensa Nacional |
| CPF | ⚡ Validar e ver a região fiscal de emissão · ⚡ inabilitado para cargo público ou proibido de licitar | local, TCU |
| CPF, CNPJ | Verificação de integridade: sanções (CEIS, CNEP), expulsão da administração federal (CEAF), pessoa politicamente exposta, servidor federal e contratos com o governo federal (PEP, servidor e CEAF só para CPF) | Portal da Transparência (chave gratuita no Cofre) |
| CPF, CNPJ | Sanções e condenações publicadas no Brasil, sem chave: CEIS e CNEP (arquivos do Portal da Transparência), contas julgadas irregulares (TCU), autos de infração e áreas embargadas (IBAMA), lista suja do trabalho escravo (MTE), condenações por improbidade (CNJ) e, para CPF, contas irregulares no TCE-RS | CGU, TCU, IBAMA, MTE, CNJ, TCE-RS |
| CEP | ⚡ Endereço e coordenadas | BrasilAPI |
| Telefone | ⚡ Tipo (celular, fixo, 0800, 4004), estado e região pelo DDD, operadora original da faixa, cidade do fixo pelo prefixo, os jeitos de escrever (inclusive o formato antigo de 8 dígitos do celular), links do WhatsApp, Telegram e Signal | local + libphonenumber |
| Telefone | Organização que publica este telefone · estabelecimento com este telefone no mapa (nome, endereço, site, e-mail; leva até 1 minuto) | Wikidata, OpenStreetMap (Overpass) |
| Telefone | Reputação de spam e golpe: nota, avaliações e categoria (sem os comentários) | tellows |
| Local | ⚡ Coordenadas e mapa | OpenStreetMap |
| Carteira cripto | ⚡ Saldo e as carteiras que mais mandaram e receberam | Blockstream |
| Vulnerabilidade | ⚡ Resumo, CVSS e EPSS (chance de exploração) | MITRE + FIRST |
| Vulnerabilidade | ⚡ Explorada de fato? (catálogo KEV, inclusive uso em ransomware e o prazo de correção) e avistamentos recentes | CISA + CIRCL |
| Texto | ⚡ Extrair entidades | local |
| Telefone, e-mail, apelido, pessoa, CNPJ, organização, domínio, carteira, hash | Procurar na web (telefone em todos os jeitos de escrever) | DuckDuckGo (Bing de reserva) |
| Domínio, pessoa, e-mail, telefone, apelido, CNPJ, organização | Buscas prontas (dorks) para abrir no navegador: documentos, painéis, listagens, backups, vazamentos em Pastebin e nuvem | local |

**Busca ampla de contas:** usa as regras de detecção do [Maigret](https://github.com/soxoj/maigret) (licença MIT, em `vendor/maigret`): 2.434 sites que dizem com certeza se o perfil existe, sem sites adultos. Cada achado é reconferido com um nome que o próprio site garante não existir; se o site disser "existe" também para ele, o achado sai (o histórico lista os sites descartados). A configuração **Sites na busca ampla** escolhe quantos conferir (500 por padrão, uns 30 a 60 segundos). Para atualizar a base: `node ferramentas/atualizar-maigret.mjs`.

**Contas em 18 sites:** GitHub, GitLab, Reddit, Keybase, Hacker News, dev.to, Docker Hub, Chess.com, Lichess, Bluesky, Mastodon, Duolingo, Wikipédia, Codewars, Speedrun.com, Gravatar, Steam e Telegram. Só entram sites que dizem com certeza se o usuário existe (npm, PyPI, Bitbucket e Codeberg ficaram de fora porque respondem igual para quem existe e para quem não existe). Ter o mesmo nome de usuário em dois sites **não prova** que é a mesma pessoa; as **provas do Keybase** provam, porque o dono assinou que as contas são dele.

**Busca na web:** só entra resultado que cita o que se procurou (no título, no trecho ou no endereço). Buscadores bloqueiam muitas consultas automáticas seguidas; quando isso acontece, o aviso diz, e as propriedades trazem o link para **abrir a mesma busca no navegador**. Nome de uma palavra só ("Josh") não é procurado: traria só homônimos.

## Máquinas

| Máquina | Começa em | O que faz |
|---|---|---|
| **Pegada do domínio** | Domínio | DNS, registro, contatos do site (telefones, WhatsApp, CNPJ com a razão social, endereço, redes sociais), certificado, tecnologias, subdomínios, os IPs de cada um, quem hospeda e o que está exposto |
| **Superfície de ataque** | Domínio | subdomínios de 4 fontes, exploração do site (robots, JavaScript, `.git`, `.env`), documentos, certificados, tecnologias, contatos de segurança, IPs, portas, CVEs e a Wayback Machine |
| **Pessoas da empresa** | Domínio | autores e usuários nos documentos públicos, e-mails e perfis no site e no registro; Gravatar dos e-mails e contas dos perfis |
| **Golpes com a marca** | Domínio | domínios parecidos registrados; quais recebem e-mail, têm certificado, aparecem em relatórios de ameaça e quem registrou |
| **Raio-x do IP** | IP | DNS reverso, sistema autônomo, dono do bloco, localização, portas e vulnerabilidades |
| **Inteligência de ameaça** | IP | relatórios de ameaça, domínios que já apontaram para o IP e a reputação de cada um |
| **Quem é este e-mail** | E-mail | domínio, Gravatar, contas do GitHub com o e-mail, a web e o mesmo nome de usuário em outros sites |
| **Rastro do apelido** | Apelido | contas em 18 sites com os dados de cada perfil e em centenas de outros, o GitHub a fundo (inclusive o fuso e os horários dos commits), a web e o Gravatar dos e-mails |
| **Pegada da pessoa** | Pessoa | Quantas pessoas têm o nome (IBGE), Wikidata, ORCID, Wikipédia, mandatos na Câmara e no Senado, sanções, TCU, processos no STF, Diário Oficial da União, Offshore Leaks, livros, Nobel, chaves PGP, contas com o nome (GitHub, Bluesky, fediverso, Stack Overflow, Launchpad), a web, e os apelidos prováveis com as contas que existem |
| **Empresa brasileira** | CNPJ | Receita, as empresas sócias e a matriz, CEP, Wikidata e o domínio do e-mail |
| **Rastro do telefone** | Telefone | tipo, operadora original e região, organizações e estabelecimentos com este telefone (Wikidata, OpenStreetMap), apps de mensagem, onde o número aparece na web e o que essas páginas citam |
| **Rastro da carteira** | Carteira cripto | saldo e as carteiras que mais mandaram e receberam, e o mesmo para cada uma delas |

Cada passo tem um teto de entidades, a máquina para sozinha depois de 600 entidades novas, e o × na barra de progresso para tudo.

## Nós do Automator

O Bluetego acrescenta a categoria **Bluetego** à paleta do Automator, para investigar sem abrir o grafo: monitorar a exposição de um domínio toda semana, conferir os indicadores que chegam num e-mail, levantar um fornecedor antes da reunião.

| Nó | Para quê |
|---|---|
| **Investigar** | Roda o primeiro olhar ou uma das máquinas num valor e devolve a semente, as entidades por tipo, os alertas e as ligações. Com **Guardar no Bluetego**, o grafo vira uma investigação para abrir e continuar na tela. |
| **Rodar transformação** | Uma das transformações (DNS, RDAP, contas, sanções, portas, CNPJ…) num valor. A lista mostra os tipos que cada uma aceita. |
| **Tem alerta?** | Sai por sim quando a investigação achou algo grave (porta exposta, CVE, domínio sem DMARC, empresa baixada…) e por não quando está limpo. |
| **Achar entidades no texto** | Acha domínios, IPs, e-mails, telefones, CNPJs, URLs, hashes e CVEs num texto. Junto com **Para cada item** e **Investigar**, cada indicador vira uma investigação. |
| **Reconhecer entidade** | Diz o que é um valor e o devolve na forma certa (CNPJ com pontuação, telefone com +55, domínio em minúsculas). |

As consultas passam pelo servidor do plugin, com o mesmo cache e as mesmas chaves do Cofre da tela. Exemplo de fluxo: Agenda (segunda, 8h) → Investigar (`minhaempresa.com.br`, Superfície de ataque) → Tem alerta? → no sim, Notificação com `{{input.alertas}}`.

## Configurações

Aba Plugins › engrenagem do Bluetego:

| Configuração | O que muda |
|---|---|
| **Sites na busca ampla de contas** | quantos sites a busca ampla confere, os mais conhecidos primeiro (20 a 2.434, padrão 500) |
| **Entidades novas por transformação** | o máximo que uma transformação acrescenta de uma vez (padrão 40, até 500); quando corta, o histórico diz quantas havia |
| **IA** | quem pensa: **Agentes de IA da IDE** (o padrão; precisa do Automator ligado), **API da Anthropic**, **Ollama neste PC** ou **Desligada** |
| **Agente da IDE** | o agente de Agentes de IA: `claude`, `codex` ou um que você cadastrou |
| **Modelo da IA** | vazio: o do agente; `claude-sonnet-5-5` na API da Anthropic; `llama3.1` no Ollama |
| **Endereço do Ollama** | onde o Ollama responde (`http://localhost:11434`) |
| **Rodadas do piloto automático** | quantas vezes a IA escolhe e roda transformações antes da conclusão (1 a 10, padrão 4) |

**No Cofre (todos opcionais):** `bluetego.virustotal` (a chave gratuita serve), `bluetego.github` (um token sem nenhuma permissão sobe a cota do GitHub de 60 para 5.000 consultas por hora; sem ele, o aviso diz quando a cota volta) e `bluetego.anthropic` (só se você escolher a API da Anthropic). As chaves nunca passam pela página nem pelo servidor do plugin: o núcleo da IDE as põe no pedido.

## Segurança, dados e limites legais

- **Use em alvos que você pode investigar**: a sua empresa, um cliente com contrato, um incidente que você está tratando. Pesquisar pessoas tem limites legais (no Brasil, a LGPD): use para fins legítimos e não guarde mais do que precisa.
- **CPF:** o Bluetego valida o CPF, mostra a região fiscal de emissão, cruza com o CPF mascarado que a Receita publica dos sócios e faz a verificação de integridade que compliance e due diligence fazem: condenação no TCU e, com a chave do Portal da Transparência, sanções, expulsões, PEP, servidor federal e contratos com o governo. O nome só aparece quando a própria fonte oficial o publica junto do CPF (condenado, sancionado, servidor, PEP). Ele **não** descobre de quem é um CPF: não consulta cadastro de pessoa física (nome, endereço, telefone) nem benefícios sociais, não usa bases vazadas e não procura CPF na web. Dado pessoal é protegido pela LGPD, e consulta de dono de CPF é a ferramenta de quem aplica golpe.
- **Listas que só publicam o CPF mascarado ficam de fora por CPF** (Banco Central, PGFN, PEP): a máscara casa com cerca de mil pessoas, e cruzar por ela seria descobrir o dono do CPF. Pelo mesmo motivo, o Bluetego não busca empresas pela máscara do CPF do sócio.
- **Chave do Brave Search (opcional):** o plano gratuito da API do Brave Search melhora o localizador de empresas, que sem ela depende do DuckDuckGo (bloqueia muitas buscas seguidas) e do Bing de reserva. Guarde no Cofre como `bluetego.brave`.
- **Chave do Portal da Transparência:** gratuita, tirada com o e-mail em portaldatransparencia.gov.br/api-de-dados/cadastrar-email e guardada no Cofre da IDE (`bluetego.transparencia`). Sem ela, a transformação pede a chave.
- **Checagens ativas:** "Explorar o site" pede ao servidor do alvo o `robots.txt`, o sitemap, os arquivos JavaScript da página e três caminhos que nunca deviam responder (`/.git/HEAD`, `/.env`, `/.DS_Store`). São pedidos comuns de leitura, mas aparecem no log do alvo: use só com autorização. Chaves achadas no JavaScript ficam **mascaradas** no grafo.
- **Atribuição:** conteúdo do Stack Exchange e da Wikipédia é CC BY-SA, e o do SANS ISC é CC BY-NC-SA (uso não comercial); GreyNoise, Hudson Rock, CIRCL e Tranco pedem que a fonte seja citada. Os dados do IBAMA são ODbL, os do TCE-RS são CC BY, o IPsum é de domínio público (Unlicense) e os dados do registro.br não podem ser redistribuídos nem usados comercialmente. O ICIJ Offshore Leaks é ODbL e CC BY-SA, e o VIAF é ODC-By (citar a OCLC). A numeração de telefones vem do libphonenumber do Google (Apache-2.0, em `vendor/libphonenumber`), os dados do mapa são do OpenStreetMap (ODbL, © colaboradores do OpenStreetMap) e o Wikidata é CC0. O relatório exportado cita as fontes nas propriedades; cite-as também se publicar o resultado.
- **E-mail escondido não é revelado:** o Launchpad acha a conta de um e-mail mesmo quando o dono escolheu escondê-lo, e por isso o Bluetego só consulta o Launchpad por nome e apelido. Nome em chave PGP do keyserver.ubuntu.com é autodeclarado (qualquer um publica uma chave com qualquer nome), e a ligação diz isso.
- **Nome completo e homônimos:** as fontes de nome só consultam com nome e sobrenome e só aceitam um resultado quando todas as palavras do nome aparecem nele (em qualquer ordem, sem acento). Processo, ato do Diário Oficial, sanção e menção em vazamento continuam podendo ser de um homônimo: a ligação diz isso, e as propriedades trazem o que serve para conferir (nascimento, município, cargo, trecho).
- **CPF do TCU é descartado:** a lista de inabilitados e inidôneos do TCU publica o CPF completo; o Bluetego não mostra, não guarda e não cria entidade com ele.
- **Para onde vão os valores:** cada transformação manda o valor à fonte da tabela acima. "Ler o site", "Dados de contato do site" (a inicial e até 5 páginas de contato linkadas nela), "Tecnologias", "Certificado" e "Seguir redirecionamentos" acessam o próprio site do alvo, que vê o seu IP.
- **IA:** o resumo do grafo (valores, propriedades e anotações) vai para o provedor escolhido. Com os Agentes de IA da IDE ou a API da Anthropic, ele sai do PC; com o Ollama, não sai.
- **Onde ficam as investigações:** `~/.bluescreen/plugin-data/bluetego/files/investigacoes/`, uma por arquivo JSON. As exportações vão para `files/exportacoes/`, e o Explorer abre na pasta.
- O servidor do plugin só responde no próprio PC e guarda as respostas por 10 minutos para não repetir consultas.

## Limites conhecidos

- A localização por IP é a do provedor, não a da pessoa.
- crt.sh, Wayback Machine e os buscadores às vezes demoram, caem ou bloqueiam consultas em sequência; a transformação diz o motivo e dá para rodar de novo depois.
- Sem token, a API do GitHub aceita 60 consultas por hora (o Rastro do apelido gasta cerca de 10).
- O Querido Diário (diários oficiais municipais) ficou de fora por enquanto: a API estava fora do ar.
- A HackerTarget (DNS reverso, subdomínios e IDs de rastreamento) deixa 50 consultas gratuitas por dia; quando acabam, a transformação avisa.
- Outras cotas gratuitas: GreyNoise (25 consultas), Stack Exchange (300 por dia), urlscan (30 por minuto e só os últimos 30 dias), Tranco (1 por segundo).
- Ficaram de fora por não serem confiáveis sem chave: abuse.ch (MalwareBazaar, URLhaus, ThreatFox passaram a exigir chave), ransomware.live (respondia 404 para qualquer busca), BGPView (fora do ar), archive.today (bloqueia robôs), DBLP (desafio anti-robô). Para nomes: Interpol, FBI, SEC EDGAR, TSE, STJ, Lattes, Library of Congress e CourtListener bloqueiam robôs; OpenSanctions, Portal da Transparência, OpenCorporates e Companies House exigem chave; Querido Diário estava fora do ar. Para telefones: a consulta de operadora e portabilidade da ABR Telecom e o "Qual Empresa Me Ligou" têm captcha; o WhatsApp proíbe coleta automática (fica só o link); o link do Telegram não distingue número com e sem conta; Mojeek, Brave, SearXNG e Reddit bloqueiam robôs ou exigem chave.
- **Telefone:** a operadora é a dona original da faixa de números; se o número foi portado para outra, isso não aparece. Cada consulta ao tellows aumenta o contador público de pesquisas daquele número, por isso ele não entra em máquina, só roda à mão. A busca no OpenStreetMap varre o estado inteiro do DDD e leva de 40 segundos a 1 minuto.
- As listas de sanções são baixadas inteiras e guardadas por um dia (a da União Europeia tem 25 MB): a primeira consulta do dia demora uns 30 segundos. O GDELT (imprensa) aceita uma consulta a cada 5 segundos e bloqueia o IP por um tempo depois de várias seguidas; por isso não entra em máquina, só roda à mão.
- Documentos no formato antigo (`.doc`, `.xls`) e PDFs criptografados não têm os metadados lidos.
- Grafos com mais de 2.000 entidades ficam lentos para organizar; esconda tipos pela legenda ou recolha os resultados grandes.

## Para desenvolver

```
node tests/logica.test.mjs
node tests/novidades.test.mjs
node tests/avancadas.test.mjs
node tests/fontes.test.mjs
node tests/nomes.test.mjs
node tests/contatos.test.mjs
node tests/telefones.test.mjs
node tests/github.test.mjs
node tests/bugs.test.mjs
node tests/raciocinio.test.mjs
node tests/inicio.test.mjs
node tests/integridade.test.mjs
node tests/empresa.test.mjs
node tests/sancoes-br.test.mjs
node tests/ip.test.mjs
node tests/localizar.test.mjs
node tests/automator.test.mjs
```

Os testes não usam a rede: cada fonte responde por um `fetch` falso. A lógica fica em `lib/`: `entidades.mjs` (tipos, detecção, normalização e extração), `transformacoes.mjs` (as transformações), `maquinas.mjs`, `pistas.mjs` (o raciocínio sem IA), `metadados.mjs` (PDF e Office, sem dependências), `maigret.mjs` (a busca ampla de contas) e `ia.mjs` (o pedido e a conferência da resposta da IA). `automator.mjs` monta o grafo dos nós do Automator sem tela. O `server.mjs` liga a rede, o cache, as rotas e a ponte local dos nós (o `no.mjs` lê a porta e a chave em `ponte.json`, na pasta de dados); o `ui.js` desenha o grafo num canvas, sem bibliotecas de fora.

## Autor e licença

Feito por Martin Hartfelder. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.12.0

- **Nós no Automator:** Investigar (primeiro olhar ou qualquer máquina, podendo guardar o resultado como investigação), Rodar transformação, Tem alerta?, Achar entidades no texto e Reconhecer entidade. As listas de roteiros, transformações e tipos vêm do próprio Bluetego.

### 0.11.0

- **Localizar uma empresa pelo nome e a cidade**, como o Google faz: escreva "Oficina de Costura Neca tramandai" no Investigar.
  - O texto com palavra de negócio (oficina, loja, padaria, costura, Ltda…) vira empresa, não pessoa; a cidade no fim é reconhecida pela lista de municípios do IBGE (sem acento, com ou sem a UF; "Pedro Osório" não é "Osório").
  - Procura na web (DuckDuckGo, Bing de reserva e, com a chave gratuita no Cofre, o Brave Search), fica só com as páginas que citam o nome inteiro e a cidade, e lê a ficha schema.org dos diretórios: telefone, endereço com CEP, coordenadas e perfis.
  - O CNPJ achado só entra se a Receita confere a cidade e o nome; o primeiro olhar já traz os dados dele.
  - Com a cidade informada, página de outra cidade não entra no grafo (é outra empresa com o mesmo nome).
- Correção: o texto dos resultados de busca perdia as letras acentuadas escritas como entidade HTML (`&#237;` virava espaço: "Tramanda", "S o Jos") e separava a palavra destacada pelo buscador ("Tramanda í"). Valia para todas as buscas na web.

### 0.10.0

- **CPF e CNPJ, sanções sem chave:** CEIS e CNEP (os arquivos do Portal da Transparência, abertos sem dependência), contas julgadas irregulares no TCU, autos de infração e áreas embargadas do IBAMA, a lista suja do trabalho escravo, as condenações por improbidade do CNJ e, para CPF, as contas irregulares do TCE-RS. O nome só aparece quando a própria lista o publica junto do documento. Entra no primeiro olhar do CPF e do CNPJ.
- **Pegada da empresa pelo CNPJ:** contratos com o poder público em todas as esferas (PNCP) e o cadastro de fornecedor federal, financiamentos do BNDES, domínios e blocos IP no registro.br, registros na CVM (com a auditora), no Banco Central, na ANEEL, na ANTT e na ANS, Diário Oficial pelo CNPJ e a tributação ano a ano com as datas do Simples e do MEI.
- **IP:**
  - de qual nuvem, CDN ou robô ele é, pelas faixas oficiais (AWS com serviço e região, Google, Azure, Cloudflare, Oracle e outros; Googlebot, Bingbot e GPTBot verificados);
  - listas de bloqueio e ameaça (IPsum, FireHOL, Emerging Threats, 7 DNSBLs com o motivo, Spamhaus ASN-DROP);
  - proxy, VPN e tipo de rede;
  - histórico do bloco (quem já anunciou, desde quando, RPKI);
  - DNS passivo com datas;
  - o certificado servido pelo IP.
- Correções: uma conexão derrubada no meio (ECONNRESET) agora tenta de novo uma vez antes de o site ser dado como fora do ar; o resultado de uma fonte não apaga mais o "risco" de outra (cada uma tem a sua propriedade).
- Ficaram de fora, com motivo: listas com CPF mascarado (Banco Central, PGFN, PEP), a busca de empresas pela máscara do CPF do sócio (identificaria o dono do CPF), a busca por sócio do Minha Receita (voltava vazia até para sócios que existem), ip-api.com (só uso não comercial), a lista do iCloud Private Relay (12 MB) e o INPI e a Anvisa (arquivos de gigabytes).

### 0.9.0

- **Verificação de integridade por CPF** (e CNPJ), só em fontes oficiais:
  - condenação no TCU pelo CPF (inabilitado para cargo público ou proibido de licitar), sem chave, no primeiro olhar do CPF;
  - com a chave gratuita do Portal da Transparência no Cofre: sanções (CEIS, CNEP), expulsão da administração federal (CEAF), pessoa politicamente exposta, servidor federal e contratos com o governo federal. Para CNPJ, sanções e contratos.
- O Bluetego continua sem descobrir o dono de um CPF: não consulta cadastro de pessoa física nem benefícios sociais, não usa bases vazadas e não procura CPF na web (um teste garante isso).

### 0.8.0

- **Primeiro olhar:** ao inserir um valor, o Bluetego já roda um roteiro curto e escolhido para o tipo e mostra só o que importa:
  - **pessoa:** Wikidata (cargos, nascimento, contas oficiais), mandatos, sanções, TCU, STF, Diário Oficial, Offshore Leaks, livros e quantas pessoas têm o nome;
  - **telefone:** região, operadora original, organização ou estabelecimento com o número e onde ele aparece na web;
  - **site:** IPs e provedor, dono no registro, contatos do site (telefone, WhatsApp, CNPJ, endereço, redes), a razão social e os sócios do CNPJ achado, tecnologias, quem atende o e-mail e a segurança do e-mail;
  - também e-mail, apelido, IP, CNPJ, URL e organização.
- **Sem lixo:** cada passo é podado (alertas sempre ficam e vêm primeiro; servidores de nomes, links de apps e listas longas saem), e o que ficou de fora vira só uma contagem na entidade: rodar a transformação de novo traz tudo. Fontes que trazem homônimos ou dezenas de itens soltos (busca na web por nome, apelidos adivinhados, centenas de sites, subdomínios) ficam para as máquinas.
- Nome de pessoa e telefone com espaços ("+55 11 3003-5555") entram como um valor só; "3003-5555" depois de um DDD não vira um segundo telefone.
- - O "Transformar" (barra flutuante e menu do botão direito) abre um painel próprio em vez do menu da IDE: com 30 ou mais transformações de nome longo, o menu saía da tela. O painel cabe sempre na janela, rola, filtra por nome ou fonte, anda com as setas (Enter roda, Esc fecha) e mostra primeiro as que ainda não rodaram.

### 0.7.0

- **Investigar os commits do GitHub** (de um usuário, um repositório ou um e-mail): o fuso horário real de quem faz os commits, o horário e os dias em que trabalha, todos os nomes e e-mails usados (com o fuso de cada um), o nome do computador quando ele vaza no e-mail do commit, coautores, repositórios de terceiros, assinatura e idioma. Datas impossíveis (forjadas) são descartadas e o resultado diz quantos commits estão nos repositórios do próprio usuário, porque qualquer um pode fazer um commit "como" outra pessoa. Entra no "Rastro do apelido".
- **19 bugs corrigidos no motor**, cada um com teste:
  - o cache misturava textos que começam igual;
  - erro que não é de conexão deixava um site "fora do ar" por 2 minutos;
  - número de versão virava IP e intervalo de anos virava telefone;
  - o mesmo IPv6 escrito de dois jeitos virava duas entidades;
  - PDF cortado ou `%` malformado numa página derrubava a transformação;
  - entre outros.
- **Máquinas mais econômicas:** as buscas por nome rodam só na pessoa investigada, não em cada nome achado no caminho; passos caros têm teto; a ordem foi corrigida (os e-mails da chave PGP agora são olhados). Um teste confere todas as máquinas contra o catálogo.
- **IA mais segura:** o texto coletado de páginas vai delimitado como dado (não é obedecido), o piloto só roda o que foi oferecido, resposta malformada não derruba e o pedido cabe no limite com grafos grandes.
- **Pistas novas:** alerta de sanção, TCU, STF e Offshore Leaks em destaque (com aviso de homônimo), cautela com homônimos, CNPJ e telefone achados para consultar, outros e-mails da chave PGP, mesma pessoa em fontes diferentes.
- **Interface:**
  - o nome da entidade principal aparece mesmo cercada de vizinhos;
  - os nomes dos grupos e das ligações não se sobrepõem;
  - nova investigação começa com a câmera certa;
  - a busca mostra quantas achou e destaca os nomes;
  - os atalhos funcionam fora do grafo;
  - "Parar" na fila;
  - janela estreita reorganiza a barra e o painel;
  - foco visível e rótulos para leitores de tela;
  - investigação aberta sem posições não trava mais.
- Valor só com pontuação ("???") não vira entidade.

### 0.6.0

- **Dados de contato do site:** de um domínio ou URL, os telefones, o WhatsApp, os e-mails, o CNPJ, o endereço e as redes sociais da empresa. Lê a página inicial e até 5 páginas de contato, institucionais e de privacidade linkadas nela, e os dados estruturados (schema.org) que muitos sites publicam. Posts, botões de compartilhar e e-mails de exemplo de formulário ficam de fora; site que bloqueia robôs avisa em vez de falhar.
- A "Pegada do domínio" usa os contatos do site e consulta a razão social dos CNPJs achados.
- **Telefone:**
  - operadora original da faixa e cidade do fixo pelo prefixo, sem rede (numeração do libphonenumber do Google, guardada no plugin);
  - organização com este telefone (Wikidata) e estabelecimento com este telefone no mapa (OpenStreetMap), os dois na máquina "Rastro do telefone";
  - reputação de spam e golpe (tellows), só à mão;
  - celular escrito no formato antigo, de 8 dígitos (51 9955-3811), vira o número de hoje (51 99955-3811), e as duas formas entram na busca na web;
  - telefone escrito como `55…` sem o `+` ou com o `0` de discagem antes do DDD vira o mesmo número.

### 0.5.0

- **Busca por nome completo com 9 transformações novas**, de fontes oficiais testadas ao vivo com pessoas públicas e com um nome que não existe:
  - **Sanções num clique:** OFAC (EUA), ONU e União Europeia, e o TCU (inabilitados para cargo público e proibidos de licitar).
  - **Justiça e governo:** processos no STF em que o nome é parte e atos no Diário Oficial da União.
  - **Parlamentares:** a antiga transformação de deputado passa a cobrir todas as legislaturas da Câmara (com nascimento e ocupações declaradas) e o Senado desde 1946 (comissões e suplentes).
  - **Outras:** Offshore Leaks do ICIJ, registro nas bibliotecas nacionais (VIAF) e livros (Open Library), Prêmio Nobel e menções na imprensa mundial (GDELT, só à mão).
- Os resultados só valem com todas as palavras do nome, e o CPF da lista do TCU é descartado.
- A máquina "Pegada da pessoa" usa as fontes novas.

### 0.4.0

- **22 transformações novas com cerca de 30 fontes**, pesquisadas e testadas ao vivo (cada fonte com um valor que existe e um que não existe) antes de entrar:
  - **Infraestrutura e ameaça:** reputação do IP num clique (GreyNoise, SANS ISC, Tor, StopForumSpam, Spamhaus DROP), CVE explorada de fato (CISA KEV, inclusive uso em ransomware) com os avistamentos do CIRCL, hash conhecido (CIRCL hashlookup), credenciais roubadas por infostealer (Hudson Rock), segurança do e-mail (DMARC, DKIM, MTA-STS, TLS-RPT, BIMI, DNSSEC), varreduras do urlscan, popularidade (Tranco), Common Crawl, PeeringDB, e o Team Cymru de reserva para IP→ASN.
  - **Pessoas:** chaves PGP (nome real e outros e-mails), Launchpad, fediverso, Bluesky e Stack Exchange por nome, Hacker News, npm, conta global da Wikimedia, OpenAlex e o perfil completo do ORCID, quantas pessoas têm o primeiro nome (IBGE), deputados federais (Câmara), as cidades do DDD, Hugging Face nos sites de contas e a Wikipédia em inglês.
- As máquinas de IP, ameaça, superfície de ataque, golpes, pegada do domínio, e-mail, apelido e pessoa usam as fontes novas.
- Correção: o servidor não lia respostas do tipo `application/pgp-keys`.

### 0.3.0

- **Contas em até 2.434 sites** com as regras do Maigret, cada achado reconferido com um nome inexistente (zero falso positivo nos testes).
- **Subdomínios de 4 fontes** (crt.sh, certspotter, HackerTarget, Wayback), ordenados pelas que mais confirmam; uma fonte fora do ar não derruba as outras.
- **Documentos e metadados** (como o FOCA): PDFs e documentos do Office do site e da Wayback viram autores, usuários do Windows, empresa e programa. Lê o dicionário do PDF, o XMP e os fluxos compactados.
- **Explorar o site:** robots.txt, sitemap, rotas de API e chaves expostas no JavaScript (mascaradas), `.git`, `.env` e `.DS_Store` expostos, cabeçalhos de segurança.
- **IDs de rastreamento** como entidade nova e o pivô para os outros sites com o mesmo ID; o DNS reverso do IP soma a HackerTarget ao OTX.
- **E-mails prováveis** de uma pessoa nos domínios ligados a ela, confirmados no Gravatar; **buscas prontas** (dorks) para 7 tipos.
- **Aprendizado:** o rendimento de cada transformação por tipo fica anotado; as pistas sugerem primeiro o que rende, e os botões mostram a média.
- As máquinas Superfície de ataque, Pessoas da empresa, Pegada do domínio e Rastro do apelido usam as novidades.
- **Escopo:** as máquinas de domínio só sondam domínios da mesma empresa; vizinhos de hospedagem que aparecem no caminho (outros clientes do mesmo IP ou CDN) são pulados, e o histórico diz quantos.
- **Disjuntor:** um site fora do ar faz as consultas seguintes a ele falharem na hora por 2 minutos, e o histórico resume numa linha só.
- **Visão mais limpa:** rótulos curtos ("GitHub · usuário" em vez da URL), rótulos que desviam das entidades e dos outros rótulos, folhas menores, ligações e setas mais leves, nomes das folhas só de perto quando o grafo é grande, legenda numa linha e minimapa só a partir de 30 entidades.

### 0.2.0

- **Interface:** campo Investigar sempre à mão, barra de ações flutuante sobre a entidade, colar (`Ctrl+V`) e arrastar arquivos no grafo, painel com abas, minimapa, controles de zoom, ajuda de atalhos (`?`), animações de entrada, de reorganização e de câmera, e as entidades giram enquanto são transformadas.
- **Organização:** cinco layouts animados (forças, hierárquico, radial, por tipo, círculo), rótulos sem sobreposição em tamanho fixo, destaque ao passar o mouse, ligações curvas de ida e volta, resultados grandes recolhidos num "+N", foco na vizinhança e linha do tempo para reproduzir a investigação.
- **Ligar à mão:** `L`, Alt + arrastar ou o menu, com sugestões de rótulo pelos tipos; menu nas ligações para mudar, inverter ou remover; nova entidade já ligada (`N`).
- **Pistas:** o Bluetego aponta sozinho as ligações que faltam, a infraestrutura em comum e os próximos passos.
- **IA:** análise, perguntas e piloto automático pelos Agentes de IA da IDE, pela API da Anthropic ou por um Ollama local, com a resposta conferida contra o grafo.
- **Novos tipos:** CNPJ, CPF, CEP, tecnologia e carteira cripto.
- **22 transformações novas:** tecnologias do site, certificado TLS, contatos de segurança, domínios parecidos, DNS passivo e relatórios de ameaça (OTX), vizinhos do sistema autônomo, Receita (com Minha Receita de reserva), CEP, CPF, Wikidata para organizações e pessoas, ORCID, Wikipédia, GitHub a fundo (commits, chaves, rede, repositório, e-mail para conta, nome para conta), coordenadas, Bitcoin e busca na web.
- **Contas em 18 sites** (antes 9), com os dados de cada perfil e as provas do Keybase; busca na web só com resultados que citam o termo.
- **Telefones:** números brasileiros sem +55, 0800 e 4004, região pelo DDD, os jeitos de escrever e os links do WhatsApp, Telegram e Signal.
- **Cinco máquinas novas:** golpes com a marca, inteligência de ameaça, empresa brasileira, rastro da carteira e rastro do telefone.
- Exportação em SVG.

### 0.1.0

- Primeira versão: grafo com física, 16 tipos de entidade, 27 transformações, 7 máquinas, extração de texto e de arquivos do projeto, alertas, anotações, caminho entre entidades, desfazer, e exportação em Markdown, CSV, GraphML, PNG e JSON.
