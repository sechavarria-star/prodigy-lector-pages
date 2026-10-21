# Lector Prodigy AutoCode

Página estática que lee un glucómetro **Prodigy AutoCode** por cable USB usando
Web Serial (Chrome / Edge de escritorio). Conecta, mantiene el medidor encendido,
descarga las mediciones, las exporta a CSV o JSON y genera un **reporte PDF por día** (descarga directa con html2pdf.js, o imprimir)
(`reporte.js`: mismo diseño que el reporte del bot de Mediciones en n8n, pero con
promedio y mín–máx de cada día, porque el glucómetro no guarda si fue antes o
después de comer; el workflow de producción no se toca ni se llama). Las mediciones nunca
salen del navegador. La página registra el **uso** (eventos como conectar, leer o
generar el reporte) y datos del **equipo** (número de serie, tipo de cable, cuántas
mediciones tiene y su rango de fechas) en la Edge Function `prodigy-med` de
Supabase, sin valores de glucemia ni el nombre del paciente. El código de la base y
de la función está en el repo `prodigy` (`lector/supabase/`).

Publicada en https://appmediciones.giwa-ia.com

Dos modelos de conexión, mismo protocolo (comandos de 1 byte: `0x58` número de serie,
`0x05` mediciones):

- **Cable aparte** (Prolific PL2303 `067B:2303`): Web Serial, UART 9600 8N1. Probado con un medidor real.
- **USB integrado** (HID; V6 eBiologic `8E14:0900`, V7 `04D9:B564`): WebHID, protocolo del driver de
  Tidepool. Probado con un medidor simulado; **en macOS no funciona**: el sistema no le asigna el driver
  HID a este equipo (verificado 21/10/2026), así que Chrome no lo ve. Pendiente probar en Windows. Detalle y script equivalente en
Python en el repo `prodigy` (`scripts/leer_autocode.py`). Basado en el driver
open source de [Tidepool Uploader](https://github.com/tidepool-org/uploader).

**Vista simple** (la de entrada): pensada para una persona mayor, con letra grande
y un paso a la vez: conectar → leer → descargar el reporte. El log, el comando
manual, el keep-alive y la tabla están en el **modo técnico** (link al pie, o
`?tecnico`). La página recuerda la vista elegida y el nombre del paciente en el
navegador.

Para probar sin medidor: `?demo` carga mediciones ficticias.

**Dashboard de uso:** `#modoadmin` al final de la URL. Pide la clave de administrador,
que se valida en el servidor (este repo no tiene nada secreto). Código en `admin.js`.

Al cambiar `reporte.js` o `admin.js`, subir el `?v=` con que los carga `index.html`.
