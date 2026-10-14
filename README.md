# Lector Prodigy AutoCode

Página estática que lee un glucómetro **Prodigy AutoCode** por cable USB usando
Web Serial (Chrome / Edge de escritorio). Conecta, mantiene el medidor encendido,
descarga las mediciones, las exporta a CSV o JSON y genera el **reporte PDF**
de Mediciones (misma plantilla que el workflow de n8n, copiada en `reporte.js`;
el workflow de producción no se toca ni se llama). Todo pasa en el navegador:
la página no manda datos a ningún servidor.

Publicada en https://sechavarria-star.github.io/prodigy-lector-pages/

Protocolo: UART 9600 8N1 sobre cable Prolific PL2303, comandos de 1 byte
(`0x58` número de serie, `0x05` mediciones). Detalle y script equivalente en
Python en el repo `prodigy` (`scripts/leer_autocode.py`). Basado en el driver
open source de [Tidepool Uploader](https://github.com/tidepool-org/uploader).

Para probar sin medidor: `?demo` carga mediciones ficticias.
