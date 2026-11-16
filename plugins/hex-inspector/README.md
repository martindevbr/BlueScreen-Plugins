# Hex Inspector

<!-- ficha:inicio (gerada por ferramentas/plugins.mjs: não edite à mão) -->
| | |
|---|---|
| **Autor** | Pizzy-23 |
| **Versão** | 0.1.0 |
| **Licença** | MIT |
| **Categoria** | Desenvolvimento |
| **Precisa de** | nada além do BlueScreen |
| **Código** | [plugins/hex-inspector](https://github.com/martindevbr/BlueScreen-Plugins/tree/main/plugins/hex-inspector) |
<!-- ficha:fim -->

Toma o lugar do visualizador hexadecimal da IDE nos binários (`.exe`, `.dll`, `.bin`, `.dat`, `.pak`, arquivos sem extensão conhecida...). Feito para ler formatos de jogos e de programas.

## Como usar

- **O arquivo inteiro**: rola do começo ao fim, mesmo com vários GB. Ele lê só os pedaços que estão na tela.
- **Seleção**: clique, arraste, Shift+clique ou Shift+setas. `Ctrl+C` (ou **Copiar hex**) copia em hexadecimal. Setas, PageUp/PageDown, Home/End e Ctrl+Home/Ctrl+End navegam.
- **Inspetor** do byte selecionado: bits, u8/i8, u16, i16, u32, i32, u64, i64, f16, f32, f64, ASCII e UTF-16LE, em little ou big-endian. Clique num valor para copiar.
- **Ir para**: `0x1A2B`, `1A2Bh` ou decimal, e Enter.
- **Buscar** texto, bytes em hex (`4D 5A 90 00`) ou texto UTF-16, a partir da seleção e dando a volta no arquivo.
- **Formato detectado** na barra: PE, ELF, ZIP, PNG, DDS, KTX, glb, FBX, UnityFS, GVAS (save do Unreal), CR2W, Wwise (BKHD/AKPK), FMOD (FSB5), BND4/BHD5, gzip, zstd, LZ4, zlib, SQLite e mais.

Só leitura. Desligar o plugin devolve o hexadecimal original.

## Autor e licença

Feito por Pizzy-23. Licença MIT (veja o campo `license` do `plugin.json`).

## Histórico de versões

### 0.1.0

- Primeira versão na loja.
