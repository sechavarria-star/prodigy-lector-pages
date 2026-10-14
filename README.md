# Lector Prodigy AutoCode

Página estática que lee un glucómetro **Prodigy AutoCode** por cable USB usando
Web Serial (Chrome / Edge de escritorio). Conecta, mantiene el medidor encendido,
descarga las mediciones y las exporta a CSV o JSON. Todo pasa en el navegador:
la página no manda datos a ningún servidor.

Publicada en https://sechavarria-star.github.io/prodigy-lector-pages/

Protocolo: UART 9600 8N1 sobre cable Prolific PL2303, comandos de 1 byte
(`0x58` número de serie, `0x05` mediciones). Detalle y script equivalente en
Python en el repo `prodigy` (`scripts/leer_autocode.py`). Basado en el driver
open source de [Tidepool Uploader](https://github.com/tidepool-org/uploader).
