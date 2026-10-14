// Reporte PDF de mediciones, versión navegador.
//
// COPIA de la plantilla del nodo Code "Armar HTML" del workflow de producción
// "Prodigy PDF - Reporte" (repo prodigy: src/code-nodes/pdf--armar-html.js).
// El workflow de producción NO se toca ni se llama desde acá: este archivo arma
// el mismo HTML con los datos del glucómetro y el navegador lo imprime a PDF.
//
// Diferencias con el original (a propósito):
//   - Recibe las filas por parámetro en vez de leer $input / $('Inicio Sub-PDF').
//   - El período es configurable (desde/hasta) en vez de fijo en 30 días.
//   - Los valores HI/LO (sin número) se excluyen de KPIs y gráfico, y van en la tabla.
//   - Sin logo: el original tiene {{LOGO_SRC}} sin resolver (pendiente 4 del repo prodigy).
//   - Línea de origen bajo el período (glucómetro + número de serie).
//   - CSS de impresión (A4, colores de fondo).

const LABEL_MOMENTO = {
  antes_desayuno: 'Antes del desayuno',
  despues_desayuno: 'Despu&eacute;s del desayuno',
  antes_almuerzo: 'Antes del almuerzo',
  despues_almuerzo: 'Despu&eacute;s del almuerzo',
  antes_cena: 'Antes de la cena',
  despues_cena: 'Despu&eacute;s de la cena',
  nocturno: 'Nocturna',
  otro: 'Otro',
};

const escapar = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// rows: [{ fecha_medicion:'YYYY-MM-DD', hora_medicion:'HH:MM', valor:number|'HI'|'LO', momento, nota }]
function armarHtmlReporte({ rows, nombre = 'Paciente', desde, hasta = new Date(), origen = '' }) {
  const fmtFecha = (f) => { if(!f) return ''; const p = String(f).split('-'); return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : f; };
  const fmtHora = (h) => h ? String(h).substring(0,5) : '';
  const fmtCorto = (f) => { if(!f) return ''; const p = String(f).split('-'); return p.length===3 ? p[2]+'/'+p[1] : f; };
  const esNum = r => !isNaN(Number(r.valor));
  const clave = r => (r.fecha_medicion||'') + (r.hora_medicion||'');

  // Filtros para grafico (solo antes_* y despues_*, con valor numérico)
  const antes = rows.filter(r => esNum(r) && r.momento && r.momento.startsWith('antes_')).sort((a,b)=> clave(a).localeCompare(clave(b)));
  const despues = rows.filter(r => esNum(r) && r.momento && r.momento.startsWith('despues_')).sort((a,b)=> clave(a).localeCompare(clave(b)));

  // KPIs
  const valores = rows.map(r => Number(r.valor)).filter(v => !isNaN(v));
  const promedio = valores.length ? Math.round(valores.reduce((a,b)=>a+b,0)/valores.length) : 0;
  const enRango = valores.filter(v => v >= 70 && v <= 140).length;
  const pctEnRango = valores.length ? Math.round((enRango/valores.length)*100) : 0;
  const hipoglucemias = valores.filter(v => v < 70).length + rows.filter(r => r.valor === 'LO').length;

  // Colores condicionales
  const colorRango = pctEnRango >= 70 ? '#0F6E56' : (pctEnRango >= 50 ? '#9C7A1A' : '#993C1D');
  const bgRango = pctEnRango >= 70 ? '#E1F5EE' : (pctEnRango >= 50 ? '#FFF4C7' : '#FFE4D6');
  const colorHipo = hipoglucemias > 0 ? '#993C1D' : '#5F5E5A';
  const bgHipo = hipoglucemias > 0 ? '#FFD6CC' : '#F1EFE8';

  const hoy = new Date();
  const fmtD = (d) => ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear();

  // GRAFICO SVG
  function construirGrafico(antesArr, despuesArr) {
    const todos = valores;
    if (todos.length === 0) {
      return '<div style="text-align:center;color:#888780;font-size:11px;padding:30px;">Sin datos suficientes para el gr&aacute;fico</div>';
    }
    let minV = Math.min(...todos), maxV = Math.max(...todos);
    const pad = Math.max(10, (maxV - minV) * 0.15);
    minV = Math.max(0, Math.floor((minV - pad) / 10) * 10);
    maxV = Math.ceil((maxV + pad) / 10) * 10;
    const W = 560, H = 240, x0 = 50, x1 = 540, y0 = 20, y1 = 195;
    const sx = (i, n) => n <= 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (n - 1);
    const sy = (v) => y1 - (y1 - y0) * (v - minV) / (maxV - minV || 1);

    let grid = '';
    for (let k = 0; k <= 4; k++) {
      const val = minV + (maxV - minV) * k / 4;
      const y = sy(val);
      grid += `<line x1="${x0}" y1="${y.toFixed(1)}" x2="${x1}" y2="${y.toFixed(1)}" stroke="#F1EFE8" stroke-width="1"/>`;
      grid += `<text x="${x0-8}" y="${(y+3).toFixed(1)}" text-anchor="end" font-family="Arial" font-size="10" fill="#888780">${Math.round(val)}</text>`;
    }

    function serie(arr, color, dash) {
      if (!arr.length) return '';
      const n = arr.length;
      const pts = arr.map((r, i) => `${sx(i, n).toFixed(1)},${sy(Number(r.valor)).toFixed(1)}`).join(' ');
      let s = `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5"${dash ? ' stroke-dasharray="6 4"' : ''}/>`;
      arr.forEach((r, i) => { s += `<circle cx="${sx(i,n).toFixed(1)}" cy="${sy(Number(r.valor)).toFixed(1)}" r="4" fill="${color}"/>`; });
      return s;
    }

    const base = antesArr.length >= despuesArr.length ? antesArr : despuesArr;
    let xlabels = '';
    const nb = base.length;
    base.forEach((r, i) => { xlabels += `<text x="${sx(i,nb).toFixed(1)}" y="212" text-anchor="middle" font-family="Arial" font-size="9" fill="#888780">${fmtCorto(r.fecha_medicion)}</text>`; });

    const leyenda = '<line x1="160" y1="230" x2="185" y2="230" stroke="#1D9E75" stroke-width="2.5"/><circle cx="172" cy="230" r="3.5" fill="#1D9E75"/><text x="192" y="234" font-family="Arial" font-size="11" fill="#5F5E5A">Antes de comer</text><line x1="320" y1="230" x2="345" y2="230" stroke="#D85A30" stroke-width="2.5" stroke-dasharray="6 4"/><circle cx="332" cy="230" r="3.5" fill="#D85A30"/><text x="352" y="234" font-family="Arial" font-size="11" fill="#5F5E5A">Despu&eacute;s de comer</text>';

    return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg"><line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" stroke="#D3D1C7" stroke-width="1"/><line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="#D3D1C7" stroke-width="1"/>${grid}${serie(antesArr,'#1D9E75',false)}${serie(despuesArr,'#D85A30',true)}${xlabels}${leyenda}</svg>`;
  }

  const grafico = construirGrafico(antes, despues);

  // Tabla cronologica unica (desc por fecha+hora)
  const todosOrdenados = rows.slice().sort((a,b) => {
    const ka = (a.fecha_medicion || '') + ' ' + (a.hora_medicion || '');
    const kb = (b.fecha_medicion || '') + ' ' + (b.hora_medicion || '');
    return kb.localeCompare(ka);
  });

  const filas = todosOrdenados.length ? todosOrdenados.map(r => {
    const fecha = fmtFecha(r.fecha_medicion);
    const hora = fmtHora(r.hora_medicion);
    const momento = LABEL_MOMENTO[r.momento] || (r.momento ? escapar(r.momento) : 'Sin especificar');
    const nota = r.nota ? escapar(r.nota) : '&mdash;';
    return `<tr><td style="padding:5px 8px;border-bottom:0.5px solid #F1EFE8;">${fecha} ${hora}</td><td style="padding:5px 8px;border-bottom:0.5px solid #F1EFE8;">${momento}</td><td style="padding:5px 8px;border-bottom:0.5px solid #F1EFE8;text-align:right;font-weight:bold;">${escapar(r.valor)}</td><td style="padding:5px 8px;border-bottom:0.5px solid #F1EFE8;font-size:11px;color:#5F5E5A;">${nota}</td></tr>`;
  }).join('') : '<tr><td colspan="4" style="padding:10px 8px;color:#888780;text-align:center;">Sin registros en este per&iacute;odo</td></tr>';

  const thead = '<thead><tr style="color:#888780;text-align:left;"><th style="padding:5px 8px;border-bottom:1px solid #D3D1C7;font-weight:bold;width:22%;">Fecha y hora</th><th style="padding:5px 8px;border-bottom:1px solid #D3D1C7;font-weight:bold;width:28%;">Momento</th><th style="padding:5px 8px;border-bottom:1px solid #D3D1C7;font-weight:bold;text-align:right;width:12%;">mg/dL</th><th style="padding:5px 8px;border-bottom:1px solid #D3D1C7;font-weight:bold;">Notas</th></tr></thead>';

  const lineaOrigen = origen ? `<div style="font-size:10px;color:#5F5E5A;margin-top:2px;">${escapar(origen)}</div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte de Mediciones</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;color:#2C2C2A;background:#fff;}@page{size:A4;margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{break-inside:avoid}</style></head><body>
<div style="background:#0F6E56;padding:20px 28px;display:flex;justify-content:space-between;align-items:center;"><div style="display:flex;align-items:center;gap:14px;"><div><div style="font-size:20px;font-weight:bold;color:#ffffff;">Prodigy Diabetes</div><div style="font-size:12px;color:#9FE1CB;">Reporte de mediciones de glucemia</div></div></div><div style="text-align:right;font-size:11px;color:#E1F5EE;"><div style="font-size:10px;color:#5DCAA5;text-transform:uppercase;">Generado</div>${fmtD(hoy)}</div></div>
<div style="padding:22px 28px;">
<div style="display:flex;gap:10px;margin-bottom:12px;"><div style="flex:1;background:#F1EFE8;border-radius:8px;padding:11px 14px;"><div style="font-size:10px;color:#5F5E5A;text-transform:uppercase;">Paciente</div><div style="font-size:15px;font-weight:bold;color:#2C2C2A;">${escapar(nombre)}</div></div><div style="flex:1.4;background:#F1EFE8;border-radius:8px;padding:11px 14px;"><div style="font-size:10px;color:#5F5E5A;text-transform:uppercase;">Per&iacute;odo</div><div style="font-size:13px;font-weight:bold;color:#2C2C2A;">${fmtD(desde)} - ${fmtD(hasta)} &middot; ${rows.length} mediciones</div>${lineaOrigen}</div></div>
<div style="display:flex;gap:10px;margin-bottom:22px;"><div style="flex:1;background:#F1EFE8;border-radius:8px;padding:11px 14px;text-align:center;"><div style="font-size:10px;color:#5F5E5A;text-transform:uppercase;">Promedio</div><div style="font-size:22px;font-weight:bold;color:#2C2C2A;">${promedio}<span style="font-size:11px;font-weight:normal;color:#888780;"> mg/dL</span></div></div><div style="flex:1;background:${bgRango};border-radius:8px;padding:11px 14px;text-align:center;"><div style="font-size:10px;color:${colorRango};text-transform:uppercase;">Tiempo en Rango (70-140)</div><div style="font-size:22px;font-weight:bold;color:${colorRango};">${pctEnRango}%</div></div><div style="flex:1;background:${bgHipo};border-radius:8px;padding:11px 14px;text-align:center;"><div style="font-size:10px;color:${colorHipo};text-transform:uppercase;">Hipoglucemias (&lt;70)</div><div style="font-size:22px;font-weight:bold;color:${colorHipo};">${hipoglucemias}</div></div></div>
<div style="font-size:13px;font-weight:bold;color:#2C2C2A;margin-bottom:10px;">Evoluci&oacute;n de las mediciones</div>
<div style="border:0.5px solid #D3D1C7;border-radius:8px;padding:14px 10px 8px;margin-bottom:6px;">${grafico}</div>
<div style="font-size:10px;color:#888780;text-align:center;margin-bottom:22px;">Valores en mg/dL. Las mediciones marcadas como "Nocturna", "Otro" o sin especificar no aparecen en el gr&aacute;fico, s&iacute; en la tabla.</div>
<div style="font-size:13px;font-weight:bold;color:#2C2C2A;margin-bottom:10px;">Detalle de mediciones</div>
<table style="width:100%;font-size:12px;border-collapse:collapse;margin-bottom:20px;">${thead}<tbody>${filas}</tbody></table>
<div style="border-top:1px solid #D3D1C7;padding-top:12px;font-size:10px;color:#888780;line-height:1.5;"><strong>AVISO LEGAL:</strong> Este reporte es un registro estad&iacute;stico de mediciones autoinformadas por el usuario. Su car&aacute;cter es puramente informativo y no reemplaza ni sustituye el diagn&oacute;stico, tratamiento o consejo de un m&eacute;dico matriculado. Ante cualquier duda o variaci&oacute;n en sus valores, consulte a su m&eacute;dico de cabecera. El desarrollador no se responsabiliza por las decisiones m&eacute;dicas tomadas en base a este documento.<br><br>Prodigy Diabetes &middot; Servicio al cliente: +54 9 11 6409-6023 &middot; prodigydiabetes.com.ar</div>
</div>
</body></html>`;
}
