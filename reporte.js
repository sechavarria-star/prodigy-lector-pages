// Reporte PDF de mediciones del glucómetro (lector web), pensado para el diabetólogo.
//
// Basado en la plantilla del nodo Code "Armar HTML" del workflow de producción
// "Prodigy PDF - Reporte" (repo prodigy: src/code-nodes/pdf--armar-html.js). El workflow
// de producción NO se toca ni se llama desde acá: este archivo arma el HTML con los datos
// del glucómetro y el navegador lo imprime o lo descarga como PDF.
//
// Formato acordado el 21/10/2026 a partir de lo que espera un diabetólogo:
//   1. Resumen: período (90 días por defecto), días con mediciones, promedio, HbA1c
//      ESTIMADA (fórmula ADAG) y tiempo en rango 70–180 separado en bajo / en rango / alto.
//   2. Evolución por día: promedio y mín–máx de cada día sobre la franja 70–180.
//   3. Día modal: todas las mediciones superpuestas en 24 h (patrones por horario).
//   4. Bitácora: una fila por día y columnas POR HORARIO. El glucómetro no guarda si la
//      medición fue antes o después de comer ni notas, así que no se inventan columnas de
//      comidas: los cortes son los del mapeo horario del bot de WhatsApp.
// Valores HI/LO: cuentan como alto/bajo en el tiempo en rango; se excluyen de promedios.
// Logo: se recibe como logoSrc (PNG en data URI) y va sobre un recuadro blanco.

const escapar = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Franjas horarias de la bitácora y del día modal: [nombre, desde h, hasta h)
const FRANJAS = [
  ['Madrugada', 0, 6], ['Ma&ntilde;ana', 6, 11], ['Mediod&iacute;a', 11, 15], ['Tarde', 15, 18], ['Noche', 18, 24],
];
const BAJO = 70, ALTO = 180;
const COLOR = { bajo: '#C0392B', alto: '#B7791F', ok: '#2C2C2A', verde: '#1D9E75', banda: '#E1F5EE' };

// rows: [{ fecha_medicion:'YYYY-MM-DD', hora_medicion:'HH:MM', valor:number|'HI'|'LO' }]
function armarHtmlReporte({ rows, nombre = 'Paciente', desde, hasta = new Date(), origen = '', logoSrc = '' }) {
  const fmtFecha = (f) => { const p = String(f).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : f; };
  const fmtCorto = (f) => { const p = String(f).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : f; };
  const fmtD = (d) => ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mi&eacute;', 'Jue', 'Vie', 'S&aacute;b'];
  const diaSemana = (f) => { const [a, m, d] = f.split('-'); return DIAS[new Date(+a, m - 1, +d).getDay()]; };
  const esNum = r => !isNaN(Number(r.valor));
  const minutos = r => { const [h, m] = String(r.hora_medicion || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const colorDe = v => v < BAJO ? COLOR.bajo : v > ALTO ? COLOR.alto : COLOR.ok;
  const hoy = new Date();

  // ── Resumen ──────────────────────────────────────────
  const valores = rows.filter(esNum).map(r => Number(r.valor));
  const promedio = valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : 0;
  // HbA1c estimada (ADAG, Nathan 2008): A1c = (glucemia promedio + 46,7) / 28,7
  const a1c = valores.length ? ((promedio + 46.7) / 28.7).toFixed(1).replace('.', ',') : '&mdash;';
  const nBajo = valores.filter(v => v < BAJO).length + rows.filter(r => r.valor === 'LO').length;
  const nAlto = valores.filter(v => v > ALTO).length + rows.filter(r => r.valor === 'HI').length;
  const total = rows.length || 1;
  const pBajo = Math.round(100 * nBajo / total), pAlto = Math.round(100 * nAlto / total);
  const pRango = rows.length ? 100 - pBajo - pAlto : 0;
  const diasPeriodo = Math.max(1, Math.round((new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate()) -
    new Date(desde.getFullYear(), desde.getMonth(), desde.getDate())) / 864e5) + 1);

  // ── Por día ──────────────────────────────────────────
  const porDia = {};
  for (const r of rows) (porDia[r.fecha_medicion] ||= []).push(r);
  const dias = Object.keys(porDia).sort().map(fecha => {
    const meds = porDia[fecha].slice().sort((a, b) => minutos(a) - minutos(b));
    const nums = meds.filter(esNum).map(r => Number(r.valor));
    return { fecha, meds, min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null,
      prom: nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null };
  });
  const diasConValor = dias.filter(d => d.prom !== null);
  const pctDias = Math.min(100, Math.round(100 * dias.length / diasPeriodo));

  // Escala vertical común a los dos gráficos
  // 4 divisiones con un paso "redondo" (10, 20, 25, 50, 100…) para que el eje se lea fácil.
  const lo = Math.min(BAJO, ...valores) - 10, hi = Math.max(ALTO, ...valores) + 10;
  const paso = [10, 20, 25, 50, 100, 150, 200].find(p => Math.max(0, Math.floor(lo / p) * p) + 4 * p >= hi) || 200;
  const minV = Math.max(0, Math.floor(lo / paso) * paso), maxV = minV + 4 * paso;

  const W = 560, H = 230, x0 = 50, x1 = 540, y0 = 16, y1 = 188;
  const sy = v => y1 - (y1 - y0) * (v - minV) / (maxV - minV || 1);
  function ejes() {
    let g = `<rect x="${x0}" y="${sy(ALTO).toFixed(1)}" width="${x1 - x0}" height="${(sy(BAJO) - sy(ALTO)).toFixed(1)}" fill="${COLOR.banda}"/>`;
    for (let k = 0; k <= 4; k++) {
      const val = minV + (maxV - minV) * k / 4, y = sy(val).toFixed(1);
      g += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#F1EFE8" stroke-width="1"/>`;
      g += `<text x="${x0 - 8}" y="${(+y + 3).toFixed(1)}" text-anchor="end" font-family="Arial" font-size="10" fill="#888780">${Math.round(val)}</text>`;
    }
    return g + `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" stroke="#D3D1C7"/><line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="#D3D1C7"/>`;
  }
  const sinDatos = '<div style="text-align:center;color:#888780;font-size:11px;padding:30px;">Sin datos suficientes para el gr&aacute;fico</div>';

  // ── Gráfico 1: evolución por día (promedio + mín–máx) ──
  function graficoDias() {
    if (!diasConValor.length) return sinDatos;
    const n = diasConValor.length;
    const sx = i => n <= 1 ? (x0 + x1) / 2 : x0 + 12 + (x1 - x0 - 24) * i / (n - 1);
    let barras = '', puntos = '';
    diasConValor.forEach((d, i) => {
      const x = sx(i).toFixed(1);
      if (d.max > d.min) barras += `<line x1="${x}" y1="${sy(d.max).toFixed(1)}" x2="${x}" y2="${sy(d.min).toFixed(1)}" stroke="#9FE1CB" stroke-width="${n > 60 ? 3 : 6}" stroke-linecap="round"/>`;
      puntos += `<circle cx="${x}" cy="${sy(d.prom).toFixed(1)}" r="${n > 60 ? 2.5 : 4}" fill="${d.prom < BAJO ? COLOR.bajo : COLOR.verde}"/>`;
    });
    const linea = n > 1 ? `<polyline points="${diasConValor.map((d, i) => `${sx(i).toFixed(1)},${sy(d.prom).toFixed(1)}`).join(' ')}" fill="none" stroke="${COLOR.verde}" stroke-width="1.5"/>` : '';
    const paso = Math.max(1, Math.ceil(n / 12)), ultimaMarcada = Math.floor((n - 1) / paso) * paso;
    let etiquetas = '';
    diasConValor.forEach((d, i) => {
      if (i % paso === 0 || (i === n - 1 && n - 1 - ultimaMarcada >= paso / 2))
        etiquetas += `<text x="${sx(i).toFixed(1)}" y="${y1 + 16}" text-anchor="middle" font-family="Arial" font-size="9" fill="#888780">${fmtCorto(d.fecha)}</text>`;
    });
    const leyenda = `<line x1="95" y1="${H - 6}" x2="120" y2="${H - 6}" stroke="${COLOR.verde}" stroke-width="2"/><circle cx="107" cy="${H - 6}" r="3.5" fill="${COLOR.verde}"/><text x="127" y="${H - 2}" font-family="Arial" font-size="11" fill="#5F5E5A">Promedio del d&iacute;a</text>`
      + `<line x1="245" y1="${H - 12}" x2="245" y2="${H}" stroke="#9FE1CB" stroke-width="6" stroke-linecap="round"/><text x="255" y="${H - 2}" font-family="Arial" font-size="11" fill="#5F5E5A">M&iacute;nimo a m&aacute;ximo</text>`
      + `<rect x="370" y="${H - 12}" width="16" height="12" fill="${COLOR.banda}"/><text x="392" y="${H - 2}" font-family="Arial" font-size="11" fill="#5F5E5A">Rango ${BAJO}-${ALTO}</text>`;
    return `<svg viewBox="0 0 ${W} ${H + 4}" width="100%" xmlns="http://www.w3.org/2000/svg">${ejes()}${barras}${linea}${puntos}${etiquetas}${leyenda}</svg>`;
  }

  // ── Gráfico 2: día modal (todas las mediciones en 24 h + mediana por hora) ──
  function graficoModal() {
    const pts = rows.filter(esNum);
    if (!pts.length) return sinDatos;
    const sx = min => x0 + (x1 - x0) * min / 1440;
    let g = '';
    for (let h = 0; h <= 24; h += 3) {
      const x = sx(h * 60).toFixed(1);
      g += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="#F1EFE8"/><text x="${x}" y="${y1 + 16}" text-anchor="middle" font-family="Arial" font-size="9" fill="#888780">${String(h).padStart(2, '0')}:00</text>`;
    }
    for (const [, d, h] of FRANJAS.slice(1)) {
      const x = sx(d * 60).toFixed(1);
      g += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="#D3D1C7" stroke-dasharray="3 3"/>`;
    }
    for (const r of pts) {
      const v = Number(r.valor);
      g += `<circle cx="${sx(minutos(r)).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="2.6" fill="${colorDe(v) === COLOR.ok ? COLOR.verde : colorDe(v)}" fill-opacity="0.7"/>`;
    }
    // mediana por hora (solo horas con 2+ mediciones)
    const porHora = Array.from({ length: 24 }, () => []);
    for (const r of pts) porHora[Math.min(23, Math.floor(minutos(r) / 60))].push(Number(r.valor));
    const mediana = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const tramo = porHora.map((a, h) => a.length >= 2 ? `${sx(h * 60 + 30).toFixed(1)},${sy(mediana(a)).toFixed(1)}` : null);
    let segmentos = '', actual = [];
    for (const p of [...tramo, null]) {
      if (p) actual.push(p);
      else { if (actual.length > 1) segmentos += `<polyline points="${actual.join(' ')}" fill="none" stroke="#0F6E56" stroke-width="2.2"/>`; actual = []; }
    }
    const leyenda = `<circle cx="100" cy="${H - 6}" r="3" fill="${COLOR.verde}" fill-opacity="0.7"/><text x="108" y="${H - 2}" font-family="Arial" font-size="11" fill="#5F5E5A">Cada medici&oacute;n</text>`
      + `<line x1="200" y1="${H - 6}" x2="225" y2="${H - 6}" stroke="#0F6E56" stroke-width="2.2"/><text x="231" y="${H - 2}" font-family="Arial" font-size="11" fill="#5F5E5A">Mediana por hora</text>`
      + `<circle cx="350" cy="${H - 6}" r="3" fill="${COLOR.bajo}"/><text x="358" y="${H - 2}" font-family="Arial" font-size="11" fill="#5F5E5A">&lt;${BAJO}</text>`
      + `<circle cx="400" cy="${H - 6}" r="3" fill="${COLOR.alto}"/><text x="408" y="${H - 2}" font-family="Arial" font-size="11" fill="#5F5E5A">&gt;${ALTO}</text>`;
    return `<svg viewBox="0 0 ${W} ${H + 4}" width="100%" xmlns="http://www.w3.org/2000/svg">${ejes()}${g}${segmentos}${leyenda}</svg>`;
  }

  // ── Bitácora por horario ─────────────────────────────
  const celda = 'padding:5px 6px;border-bottom:0.5px solid #F1EFE8;vertical-align:top;font-size:11px;line-height:1.5;';
  const filas = dias.length ? dias.slice().reverse().map(d => {
    const cols = FRANJAS.map(([, desdeH, hastaH]) => {
      const meds = d.meds.filter(r => { const h = minutos(r) / 60; return h >= desdeH && h < hastaH; });
      if (!meds.length) return `<td style="${celda}text-align:center;color:#D3D1C7;">&middot;</td>`;
      return `<td style="${celda}text-align:center;">` + meds.map(r => {
        const v = esNum(r) ? Number(r.valor) : null;
        const color = v === null ? (r.valor === 'LO' ? COLOR.bajo : COLOR.alto) : colorDe(v);
        const peso = v === null || v < BAJO || v > ALTO ? 'bold' : 'normal';
        return `<span style="white-space:nowrap;"><strong style="color:${color};font-weight:${peso};font-size:12px;">${v ?? escapar(r.valor)}</strong> <span style="color:#888780;font-size:9px;">${escapar(String(r.hora_medicion).substring(0, 5))}</span></span>`;
      }).join('<br>') + '</td>';
    }).join('');
    return `<tr><td style="${celda}white-space:nowrap;"><span style="color:#888780;">${diaSemana(d.fecha)}</span> ${fmtFecha(d.fecha)}</td>${cols}<td style="${celda}text-align:right;font-weight:bold;">${d.prom ?? '&mdash;'}</td></tr>`;
  }).join('') : `<tr><td colspan="${FRANJAS.length + 2}" style="padding:10px 8px;color:#888780;text-align:center;">Sin registros en este per&iacute;odo</td></tr>`;
  const th = 'padding:5px 6px;border-bottom:1px solid #D3D1C7;font-weight:bold;font-size:10px;';
  const thead = `<thead><tr style="color:#888780;"><th style="${th}text-align:left;width:15%;">D&iacute;a</th>`
    + FRANJAS.map(([n, d, h]) => `<th style="${th}text-align:center;">${n}<br><span style="font-weight:normal;font-size:9px;">${d}&ndash;${h} h</span></th>`).join('')
    + `<th style="${th}text-align:right;width:9%;">Prom.</th></tr></thead>`;

  // ── Armado ───────────────────────────────────────────
  const caja = 'flex:1;background:#F1EFE8;border-radius:8px;padding:10px 12px;';
  const etq = 'font-size:9.5px;color:#5F5E5A;text-transform:uppercase;';
  const barraTIR = `<div style="display:flex;height:12px;border-radius:6px;overflow:hidden;margin:6px 0 4px;">`
    + (pBajo ? `<div style="width:${pBajo}%;background:${COLOR.bajo};"></div>` : '')
    + (pRango ? `<div style="width:${pRango}%;background:${COLOR.verde};"></div>` : '')
    + (pAlto ? `<div style="width:${pAlto}%;background:${COLOR.alto};"></div>` : '') + `</div>`;
  const lineaOrigen = origen ? `<div style="font-size:10px;color:#5F5E5A;margin-top:2px;">${escapar(origen)}</div>` : '';
  const titulo = logoSrc
    ? '<div style="font-size:18px;font-weight:bold;color:#ffffff;">Reporte de mediciones de glucemia</div>'
    : '<div><div style="font-size:20px;font-weight:bold;color:#ffffff;">Prodigy Diabetes</div><div style="font-size:12px;color:#9FE1CB;">Reporte de mediciones de glucemia</div></div>';
  const seccion = t => `<div style="font-size:13px;font-weight:bold;color:#2C2C2A;margin:16px 0 8px;">${t}</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte de Mediciones</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;color:#2C2C2A;background:#fff;}@page{size:A4;margin:0}html,body{height:auto}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}tr,svg{break-inside:avoid}thead{display:table-header-group}</style></head><body>
<div style="background:#0F6E56;padding:16px 28px;display:flex;justify-content:space-between;align-items:center;"><div style="display:flex;align-items:center;gap:14px;">${logoSrc ? `<div style="background:#ffffff;border-radius:8px;padding:6px 10px;"><img src="${logoSrc}" alt="Prodigy" style="height:32px;width:auto;display:block;"/></div>` : ''}${titulo}</div><div style="text-align:right;font-size:11px;color:#E1F5EE;"><div style="font-size:10px;color:#5DCAA5;text-transform:uppercase;">Generado</div>${fmtD(hoy)}</div></div>
<div style="padding:16px 28px 14px;">
<div style="display:flex;gap:10px;margin-bottom:10px;"><div style="${caja}"><div style="${etq}">Paciente</div><div style="font-size:15px;font-weight:bold;">${escapar(nombre)}</div></div><div style="${caja}flex:1.6;"><div style="${etq}">Per&iacute;odo</div><div style="font-size:13px;font-weight:bold;">${fmtD(desde)} - ${fmtD(hasta)} &middot; ${diasPeriodo} d&iacute;as</div><div style="font-size:11px;color:#2C2C2A;margin-top:2px;">${rows.length} mediciones &middot; ${dias.length} de ${diasPeriodo} d&iacute;as con mediciones (${pctDias}%)</div>${lineaOrigen}</div></div>
<div style="display:flex;gap:10px;">
<div style="${caja}text-align:center;"><div style="${etq}">Promedio</div><div style="font-size:22px;font-weight:bold;">${promedio}<span style="font-size:11px;font-weight:normal;color:#888780;"> mg/dL</span></div></div>
<div style="${caja}text-align:center;"><div style="${etq}">HbA1c estimada</div><div style="font-size:22px;font-weight:bold;">${a1c}<span style="font-size:11px;font-weight:normal;color:#888780;">${valores.length ? ' %' : ''}</span></div><div style="font-size:9px;color:#888780;">a partir del promedio</div></div>
<div style="${caja}flex:1.9;"><div style="${etq}">Tiempo en rango (${BAJO}-${ALTO} mg/dL)</div>${barraTIR}<div style="display:flex;justify-content:space-between;font-size:11px;"><span style="color:${COLOR.bajo};"><strong>${pBajo}%</strong> bajo (&lt;${BAJO})</span><span style="color:${COLOR.verde};"><strong>${pRango}%</strong> en rango</span><span style="color:${COLOR.alto};"><strong>${pAlto}%</strong> alto (&gt;${ALTO})</span></div></div>
</div>
${seccion('Evoluci&oacute;n por d&iacute;a')}
<div style="border:0.5px solid #D3D1C7;border-radius:8px;padding:10px 10px 6px;">${graficoDias()}</div>
${seccion('D&iacute;a modal &middot; todas las mediciones superpuestas en 24 horas')}
<div style="border:0.5px solid #D3D1C7;border-radius:8px;padding:10px 10px 6px;">${graficoModal()}</div>
<div style="font-size:9.5px;color:#888780;text-align:center;margin-top:4px;">Permite ver si los valores suben o bajan siempre en el mismo horario. Las l&iacute;neas punteadas separan las franjas de la bit&aacute;cora.</div>
${seccion('Bit&aacute;cora por horario')}
<table class="bitacora" style="width:100%;border-collapse:collapse;margin-bottom:12px;">${thead}<tbody>${filas}</tbody></table>
<div style="font-size:9.5px;color:#888780;line-height:1.5;margin-bottom:10px;">Valores en mg/dL, con la hora de cada medici&oacute;n. <span style="color:${COLOR.bajo};font-weight:bold;">Rojo</span>: menor a ${BAJO}. <span style="color:${COLOR.alto};font-weight:bold;">&Aacute;mbar</span>: mayor a ${ALTO}. HI/LO: fuera del rango que mide el equipo. El glucómetro no registra si la medici&oacute;n fue antes o despu&eacute;s de comer: las columnas son franjas horarias. La HbA1c estimada se calcula con la f&oacute;rmula ADAG a partir del promedio de mediciones capilares; es orientativa y no reemplaza el an&aacute;lisis de laboratorio.</div>
<div style="border-top:1px solid #D3D1C7;padding-top:12px;font-size:10px;color:#888780;line-height:1.5;"><strong>AVISO LEGAL:</strong> Este reporte es un registro estad&iacute;stico de mediciones autoinformadas por el usuario. Su car&aacute;cter es puramente informativo y no reemplaza ni sustituye el diagn&oacute;stico, tratamiento o consejo de un m&eacute;dico matriculado. Ante cualquier duda o variaci&oacute;n en sus valores, consulte a su m&eacute;dico de cabecera. El desarrollador no se responsabiliza por las decisiones m&eacute;dicas tomadas en base a este documento.<br><br>Prodigy Diabetes &middot; Servicio al cliente: +54 9 11 6409-6023 &middot; prodigydiabetes.com.ar</div>
</div>
</body></html>`;
}
