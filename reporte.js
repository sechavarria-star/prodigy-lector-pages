// Reporte PDF de mediciones del glucómetro, versión navegador: MEDICIONES POR DÍA.
//
// Basado en la plantilla del nodo Code "Armar HTML" del workflow de producción
// "Prodigy PDF - Reporte" (repo prodigy: src/code-nodes/pdf--armar-html.js).
// El workflow de producción NO se toca ni se llama desde acá: este archivo arma
// el HTML con los datos del glucómetro y el navegador lo imprime a PDF.
//
// Mismo encabezado, KPIs, paleta y aviso legal que el original. Cambia el foco:
//   - El glucómetro no guarda si la medición fue antes o después de comer, así que
//     en vez de las series "antes / después" el gráfico muestra cada DÍA: promedio
//     (línea) y rango mín–máx del día (barra), sobre la franja objetivo 70–140.
//   - La tabla agrupa por día: cantidad, cada medición con su hora, mín, máx y promedio.
// Otras diferencias:
//   - Recibe las filas por parámetro y el período es configurable.
//   - Los valores HI/LO (sin número) se excluyen de promedios y gráfico; van en la tabla.
//     LO cuenta como hipoglucemia.
//   - Logo: el original deja {{LOGO_SRC}} y lo reemplaza el Apps Script con
//     https://prodigydiabetes.com.ar/images/Asset-3.svg. Acá se recibe como logoSrc
//     (copia local logo-prodigy.svg, como data URI para que esté listo al imprimir).
//     Va sobre un recuadro blanco: el azul del logo no se lee sobre el verde del encabezado.
//     Con logo, el encabezado no repite "Prodigy Diabetes": el título es el nombre del reporte.
//   - Línea de origen bajo el período (glucómetro + número de serie) y CSS de impresión A4.

const escapar = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// rows: [{ fecha_medicion:'YYYY-MM-DD', hora_medicion:'HH:MM', valor:number|'HI'|'LO' }]
function armarHtmlReporte({ rows, nombre = 'Paciente', desde, hasta = new Date(), origen = '', logoSrc = '' }) {
  const fmtFecha = (f) => { if(!f) return ''; const p = String(f).split('-'); return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : f; };
  const fmtCorto = (f) => { if(!f) return ''; const p = String(f).split('-'); return p.length===3 ? p[2]+'/'+p[1] : f; };
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mi&eacute;', 'Jue', 'Vie', 'S&aacute;b'];
  const diaSemana = (f) => { const [a, m, d] = f.split('-'); return DIAS[new Date(+a, m - 1, +d).getDay()]; };
  const esNum = r => !isNaN(Number(r.valor));

  // KPIs (sobre todas las mediciones numéricas, como el original)
  const valores = rows.filter(esNum).map(r => Number(r.valor));
  const promedio = valores.length ? Math.round(valores.reduce((a,b)=>a+b,0)/valores.length) : 0;
  const enRango = valores.filter(v => v >= 70 && v <= 140).length;
  const pctEnRango = valores.length ? Math.round((enRango/valores.length)*100) : 0;
  const hipoglucemias = valores.filter(v => v < 70).length + rows.filter(r => r.valor === 'LO').length;

  // Agrupar por día
  const porDia = {};
  for (const r of rows) (porDia[r.fecha_medicion] ||= []).push(r);
  const dias = Object.keys(porDia).sort().map(fecha => {
    const meds = porDia[fecha].slice().sort((a,b) => String(a.hora_medicion).localeCompare(String(b.hora_medicion)));
    const nums = meds.filter(esNum).map(r => Number(r.valor));
    return {
      fecha, meds,
      min: nums.length ? Math.min(...nums) : null,
      max: nums.length ? Math.max(...nums) : null,
      prom: nums.length ? Math.round(nums.reduce((a,b)=>a+b,0)/nums.length) : null,
    };
  });
  const diasConValor = dias.filter(d => d.prom !== null);

  // Colores condicionales (los del original)
  const colorRango = pctEnRango >= 70 ? '#0F6E56' : (pctEnRango >= 50 ? '#9C7A1A' : '#993C1D');
  const bgRango = pctEnRango >= 70 ? '#E1F5EE' : (pctEnRango >= 50 ? '#FFF4C7' : '#FFE4D6');
  const colorHipo = hipoglucemias > 0 ? '#993C1D' : '#5F5E5A';
  const bgHipo = hipoglucemias > 0 ? '#FFD6CC' : '#F1EFE8';
  const colorValor = v => v < 70 ? '#993C1D' : (v > 180 ? '#9C7A1A' : '#2C2C2A');

  const hoy = new Date();
  const fmtD = (d) => ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear();

  // GRAFICO SVG: un punto por día (promedio) + barra mín–máx + franja 70–140
  function construirGrafico() {
    if (diasConValor.length === 0) {
      return '<div style="text-align:center;color:#888780;font-size:11px;padding:30px;">Sin datos suficientes para el gr&aacute;fico</div>';
    }
    let minV = Math.min(70, ...valores), maxV = Math.max(140, ...valores);
    const pad = Math.max(10, (maxV - minV) * 0.1);
    minV = Math.max(0, Math.floor((minV - pad) / 10) * 10);
    maxV = Math.ceil((maxV + pad) / 10) * 10;
    maxV = minV + Math.ceil((maxV - minV) / 40) * 40; // 4 divisiones en múltiplos de 10
    const W = 560, H = 240, x0 = 50, x1 = 540, y0 = 20, y1 = 195;
    const n = diasConValor.length;
    const sx = (i) => n <= 1 ? (x0 + x1) / 2 : x0 + 12 + (x1 - x0 - 24) * i / (n - 1);
    const sy = (v) => y1 - (y1 - y0) * (v - minV) / (maxV - minV || 1);

    let grid = `<rect x="${x0}" y="${sy(140).toFixed(1)}" width="${x1-x0}" height="${(sy(70)-sy(140)).toFixed(1)}" fill="#E1F5EE"/>`;
    for (let k = 0; k <= 4; k++) {
      const val = minV + (maxV - minV) * k / 4;
      const y = sy(val);
      grid += `<line x1="${x0}" y1="${y.toFixed(1)}" x2="${x1}" y2="${y.toFixed(1)}" stroke="#F1EFE8" stroke-width="1"/>`;
      grid += `<text x="${x0-8}" y="${(y+3).toFixed(1)}" text-anchor="end" font-family="Arial" font-size="10" fill="#888780">${Math.round(val)}</text>`;
    }

    let barras = '', puntos = '';
    const pts = diasConValor.map((d, i) => `${sx(i).toFixed(1)},${sy(d.prom).toFixed(1)}`).join(' ');
    diasConValor.forEach((d, i) => {
      const x = sx(i).toFixed(1);
      if (d.max > d.min) barras += `<line x1="${x}" y1="${sy(d.max).toFixed(1)}" x2="${x}" y2="${sy(d.min).toFixed(1)}" stroke="#9FE1CB" stroke-width="6" stroke-linecap="round"/>`;
      puntos += `<circle cx="${x}" cy="${sy(d.prom).toFixed(1)}" r="4" fill="${d.prom < 70 ? '#D85A30' : '#1D9E75'}"/>`;
    });
    const linea = n > 1 ? `<polyline points="${pts}" fill="none" stroke="#1D9E75" stroke-width="2"/>` : '';

    // etiquetas: como mucho ~12 para que no se pisen
    const paso = Math.max(1, Math.ceil(n / 12));
    let xlabels = '';
    diasConValor.forEach((d, i) => {
      if (i % paso === 0 || i === n - 1) xlabels += `<text x="${sx(i).toFixed(1)}" y="212" text-anchor="middle" font-family="Arial" font-size="9" fill="#888780">${fmtCorto(d.fecha)}</text>`;
    });

    const leyenda = '<line x1="95" y1="230" x2="120" y2="230" stroke="#1D9E75" stroke-width="2"/><circle cx="107" cy="230" r="3.5" fill="#1D9E75"/><text x="127" y="234" font-family="Arial" font-size="11" fill="#5F5E5A">Promedio del d&iacute;a</text>'
      + '<line x1="245" y1="224" x2="245" y2="236" stroke="#9FE1CB" stroke-width="6" stroke-linecap="round"/><text x="255" y="234" font-family="Arial" font-size="11" fill="#5F5E5A">M&iacute;nimo a m&aacute;ximo</text>'
      + '<rect x="370" y="224" width="16" height="12" fill="#E1F5EE"/><text x="392" y="234" font-family="Arial" font-size="11" fill="#5F5E5A">Rango 70-140</text>';

    return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg">${grid}<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" stroke="#D3D1C7" stroke-width="1"/><line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="#D3D1C7" stroke-width="1"/>${barras}${linea}${puntos}${xlabels}${leyenda}</svg>`;
  }

  const grafico = construirGrafico();

  // Tabla por día (desc)
  const td = 'padding:5px 8px;border-bottom:0.5px solid #F1EFE8;vertical-align:top;';
  const filas = dias.length ? dias.slice().reverse().map(d => {
    const lista = d.meds.map(r => {
      const v = esNum(r) ? `<strong style="color:${colorValor(Number(r.valor))};">${Number(r.valor)}</strong>` : `<strong style="color:#993C1D;">${escapar(r.valor)}</strong>`;
      return `<span style="white-space:nowrap;"><span style="color:#888780;">${escapar(String(r.hora_medicion).substring(0,5))}</span> ${v}</span>`;
    }).join(' &nbsp;&middot;&nbsp; ');
    const num = (v) => v === null ? '&mdash;' : v;
    return `<tr><td style="${td}white-space:nowrap;"><span style="color:#888780;">${diaSemana(d.fecha)}</span> ${fmtFecha(d.fecha)}</td><td style="${td}text-align:center;">${d.meds.length}</td><td style="${td}font-size:11px;line-height:1.7;">${lista}</td><td style="${td}text-align:right;">${num(d.min)}</td><td style="${td}text-align:right;">${num(d.max)}</td><td style="${td}text-align:right;font-weight:bold;">${num(d.prom)}</td></tr>`;
  }).join('') : '<tr><td colspan="6" style="padding:10px 8px;color:#888780;text-align:center;">Sin registros en este per&iacute;odo</td></tr>';

  const th = 'padding:5px 8px;border-bottom:1px solid #D3D1C7;font-weight:bold;';
  const thead = `<thead><tr style="color:#888780;text-align:left;"><th style="${th}width:17%;">D&iacute;a</th><th style="${th}text-align:center;width:9%;">Cant.</th><th style="${th}">Mediciones (hora y mg/dL)</th><th style="${th}text-align:right;width:8%;">M&iacute;n</th><th style="${th}text-align:right;width:8%;">M&aacute;x</th><th style="${th}text-align:right;width:11%;">Promedio</th></tr></thead>`;

  const lineaOrigen = origen ? `<div style="font-size:10px;color:#5F5E5A;margin-top:2px;">${escapar(origen)}</div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte de Mediciones</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;color:#2C2C2A;background:#fff;}@page{size:A4;margin:0}html,body{height:auto}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{break-inside:avoid}</style></head><body>
<div style="background:#0F6E56;padding:16px 28px;display:flex;justify-content:space-between;align-items:center;"><div style="display:flex;align-items:center;gap:14px;">${logoSrc ? `<div style="background:#ffffff;border-radius:8px;padding:6px 10px;"><img src="${logoSrc}" alt="Prodigy" style="height:32px;width:auto;display:block;"/></div>` : ''}${logoSrc
  ? '<div style="font-size:18px;font-weight:bold;color:#ffffff;">Reporte de mediciones de glucemia por d&iacute;a</div>'
  : '<div><div style="font-size:20px;font-weight:bold;color:#ffffff;">Prodigy Diabetes</div><div style="font-size:12px;color:#9FE1CB;">Reporte de mediciones de glucemia por d&iacute;a</div></div>'}</div><div style="text-align:right;font-size:11px;color:#E1F5EE;"><div style="font-size:10px;color:#5DCAA5;text-transform:uppercase;">Generado</div>${fmtD(hoy)}</div></div>
<div style="padding:18px 28px 14px;">
<div style="display:flex;gap:10px;margin-bottom:12px;"><div style="flex:1;background:#F1EFE8;border-radius:8px;padding:11px 14px;"><div style="font-size:10px;color:#5F5E5A;text-transform:uppercase;">Paciente</div><div style="font-size:15px;font-weight:bold;color:#2C2C2A;">${escapar(nombre)}</div></div><div style="flex:1.4;background:#F1EFE8;border-radius:8px;padding:11px 14px;"><div style="font-size:10px;color:#5F5E5A;text-transform:uppercase;">Per&iacute;odo</div><div style="font-size:13px;font-weight:bold;color:#2C2C2A;">${fmtD(desde)} - ${fmtD(hasta)} &middot; ${rows.length} mediciones en ${dias.length} d&iacute;as</div>${lineaOrigen}</div></div>
<div style="display:flex;gap:10px;margin-bottom:16px;"><div style="flex:1;background:#F1EFE8;border-radius:8px;padding:11px 14px;text-align:center;"><div style="font-size:10px;color:#5F5E5A;text-transform:uppercase;">Promedio</div><div style="font-size:22px;font-weight:bold;color:#2C2C2A;">${promedio}<span style="font-size:11px;font-weight:normal;color:#888780;"> mg/dL</span></div></div><div style="flex:1;background:${bgRango};border-radius:8px;padding:11px 14px;text-align:center;"><div style="font-size:10px;color:${colorRango};text-transform:uppercase;">Tiempo en Rango (70-140)</div><div style="font-size:22px;font-weight:bold;color:${colorRango};">${pctEnRango}%</div></div><div style="flex:1;background:${bgHipo};border-radius:8px;padding:11px 14px;text-align:center;"><div style="font-size:10px;color:${colorHipo};text-transform:uppercase;">Hipoglucemias (&lt;70)</div><div style="font-size:22px;font-weight:bold;color:${colorHipo};">${hipoglucemias}</div></div></div>
<div style="font-size:13px;font-weight:bold;color:#2C2C2A;margin-bottom:10px;">Evoluci&oacute;n por d&iacute;a</div>
<div style="border:0.5px solid #D3D1C7;border-radius:8px;padding:14px 10px 8px;margin-bottom:6px;">${grafico}</div>
<div style="font-size:10px;color:#888780;text-align:center;margin-bottom:14px;">Valores en mg/dL. Cada punto es el promedio del d&iacute;a; la barra va de la medici&oacute;n m&aacute;s baja a la m&aacute;s alta. Solo aparecen los d&iacute;as con mediciones.</div>
<div style="font-size:13px;font-weight:bold;color:#2C2C2A;margin-bottom:10px;">Detalle por d&iacute;a</div>
<table style="width:100%;font-size:12px;border-collapse:collapse;margin-bottom:12px;">${thead}<tbody>${filas}</tbody></table>
<div style="border-top:1px solid #D3D1C7;padding-top:12px;font-size:10px;color:#888780;line-height:1.5;"><strong>AVISO LEGAL:</strong> Este reporte es un registro estad&iacute;stico de mediciones autoinformadas por el usuario. Su car&aacute;cter es puramente informativo y no reemplaza ni sustituye el diagn&oacute;stico, tratamiento o consejo de un m&eacute;dico matriculado. Ante cualquier duda o variaci&oacute;n en sus valores, consulte a su m&eacute;dico de cabecera. El desarrollador no se responsabiliza por las decisiones m&eacute;dicas tomadas en base a este documento.<br><br>Prodigy Diabetes &middot; Servicio al cliente: +54 9 11 6409-6023 &middot; prodigydiabetes.com.ar</div>
</div>
</body></html>`;
}
