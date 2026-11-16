# Open Ports

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Pizzy-23 |
| **Versão** | 0.1.0 |
| **Licença** | MIT |
| **Categoria** | Desenvolvimento |
| **Precisa de** | nada além do BlueScreen |
| **Código** | [plugins/open-ports](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/open-ports) |
<!-- ficha:fim -->

Painel na barra da esquerda com as portas TCP em que algum programa está ouvindo.

## Como usar

- Porta, programa, PID e o título da janela, quando tem.
- **local** (só este PC) ou **rede** (0.0.0.0 / ::, outros aparelhos alcançam), em amarelo.
- Ao passar o mouse: **Abrir** no navegador (`http://127.0.0.1:porta`) e **Encerrar** o processo pelo PID exato. Encerrar pede um segundo clique e não aparece para os processos do Windows.
- Os processos do sistema ficam escondidos. Marque **sistema** para ver todos.
- Filtre por porta, nome ou PID. Com o painel aberto, a lista se atualiza a cada 5 segundos.

Bom para achar o servidor de dev esquecido que está segurando a porta 3000.

## Autor e licença

Feito por Pizzy-23. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.1.0

- Primeira versão na loja.
