// Dashboard de uso (#modoadmin).
//
// Se abre con appmediciones.giwa-ia.com/#modoadmin. El hash solo muestra la vista: los
// datos los da la Edge Function prodigy-med (acción "dashboard") únicamente con la clave
// de administrador, que se valida en el servidor. Este archivo es público y no guarda
// nada secreto. La clave se recuerda solo en esta pestaña (sessionStorage).
//
// Todo lo que viene de la base se escapa: los eventos los puede mandar cualquiera.

(() => {
  const CLAVE_KEY = 'lector-autocode:admin';
  const EVENTOS = { pagina_abierta: 'Abrió la página', conectado: 'Conectó el medidor', lectura: 'Leyó las mediciones',
    reporte_pdf: 'Generó el reporte', gracias: 'Llegó al final', error: 'Error' };
  const ERRORES = { sin_puerto: 'No eligió el medidor', puerto_ocupado: 'Puerto ocupado', no_responde_serie: 'El medidor no responde',
    descarga: 'Falló la lectura', conexion: 'Error al conectar', otro: 'Otro' };
  let dias = 30, cargando = false;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => Number(n || 0).toLocaleString('es-AR');
  const fechaHora = t => t ? new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const fechaCorta = f => { if (!f) return '—'; const [a, m, d] = String(f).slice(0, 10).split('-'); return `${d}/${m}/${a.slice(2)}`; };
  const leerClave = () => { try { return sessionStorage.getItem(CLAVE_KEY) || ''; } catch { return ''; } };
  const guardarClave = v => { try { v ? sessionStorage.setItem(CLAVE_KEY, v) : sessionStorage.removeItem(CLAVE_KEY); } catch {} };

  function esAdmin() { return location.hash === '#modoadmin'; }

  function rutear() {
    const admin = esAdmin();
    $('vistaAdmin').hidden = !admin;
    if (admin) {
      $('vistaSimple').hidden = true; $('vistaTecnica').hidden = true;
      document.body.classList.remove('vista-simple');
      $('estado').hidden = true;
      if (leerClave()) cargar(); else mostrarLogin();
    } else {
      $('estado').hidden = false;
      let v = null; try { v = localStorage.getItem('lector-autocode:vista'); } catch {}
      verVista(v === 'tecnica');
    }
  }

  function mostrarLogin(msg = '') {
    $('admLogin').hidden = false; $('admPanel').hidden = true;
    $('admError').textContent = msg; $('admError').hidden = !msg;
    setTimeout(() => $('admClave').focus(), 0);
  }

  async function cargar() {
    if (cargando) return;
    cargando = true;
    $('admActualizar').disabled = true; $('admEstado').textContent = 'Cargando…';
    try {
      const r = await fetch(API_USO, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ accion: 'dashboard', clave: leerClave(), dias }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { guardarClave(''); mostrarLogin('Clave incorrecta.'); return; }
      if (r.status === 429) { guardarClave(''); mostrarLogin('Demasiados intentos con clave incorrecta. Esperá 15 minutos y probá de nuevo.'); return; }
      if (!r.ok || !j.ok) throw new Error(j.error || r.status);
      $('admLogin').hidden = true; $('admPanel').hidden = false;
      pintar(j.datos);
      $('admEstado').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      if (!$('admPanel').hidden) $('admEstado').textContent = 'No se pudo actualizar.';
      else mostrarLogin('No se pudo conectar con el servidor. Probá de nuevo.');
    } finally {
      cargando = false; $('admActualizar').disabled = false;
    }
  }

  // ── pintar ───────────────────────────────────────────
  function pintar(d) {
    const k = d.kpis || {};
    const conv = k.sesiones ? Math.round(100 * k.sesiones_con_lectura / k.sesiones) : 0;
    const tiles = [
      ['Visitas', num(k.sesiones), 'sesiones distintas', '--blue'],
      ['Medidores', num(k.equipos), 'números de serie distintos', '--violet'],
      ['Lecturas', num(k.lecturas), `${num(k.mediciones_leidas)} mediciones leídas`, '--teal'],
      ['Reportes PDF', num(k.reportes), 'generados', '--ok'],
      ['Conversión', `${conv}%`, 'de las visitas leyó el medidor', '--blue'],
      ['Errores', num(k.errores), 'en el período', k.errores ? '--wa' : '--mt'],
    ];
    $('admKpis').innerHTML = tiles.map(([l, v, s, c]) =>
      `<div class="kpi" style="--accent:var(${c})"><div class="kpi-lbl">${l}</div><div class="kpi-val">${v}</div><div class="kpi-sub">${s}</div></div>`).join('');

    pintarPorDia(d.por_dia || []);
    pintarEmbudo(d.embudo || []);

    $('admErrores').innerHTML = (d.errores || []).length
      ? d.errores.map(e => `<tr><td>${esc(ERRORES[e.tipo] || e.tipo)}</td><td class="num">${num(e.cantidad)}</td></tr>`).join('')
      : '<tr><td colspan="2" class="vacio">Sin errores en el período.</td></tr>';

    $('admEntornos').innerHTML = (d.entornos || []).length
      ? d.entornos.map(e => `<tr><td>${esc(e.navegador)}</td><td>${esc(e.sistema)}</td><td class="num">${num(e.sesiones)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="vacio">Sin visitas en el período.</td></tr>';

    const v = d.vistas || {};
    $('admVistas').textContent = `Vista simple: ${num(v.simple)} · técnica: ${num(v.tecnica)} sesiones`;

    $('admEquipos').innerHTML = (d.equipos || []).length
      ? d.equipos.map(e => `<tr><td class="mono">${esc(e.serie)}</td><td>${esc(e.cable || '—')}</td>
          <td class="num">${e.mediciones_guardadas ?? '—'}</td><td class="mono">${fechaCorta(e.medicion_mas_vieja)} → ${fechaCorta(e.medicion_mas_nueva)}</td>
          <td class="num">${num(e.conexiones)}</td><td class="num">${num(e.lecturas)}</td><td class="num">${num(e.reportes)}</td>
          <td class="mono">${fechaHora(e.primera_vez)}</td><td class="mono">${fechaHora(e.ultima_vez)}</td></tr>`).join('')
      : '<tr><td colspan="9" class="vacio">Todavía no se conectó ningún medidor.</td></tr>';

    $('admUltimos').innerHTML = (d.ultimos || []).length
      ? d.ultimos.map(u => {
          const det = u.evento === 'lectura' ? `${num(u.detalle?.cantidad)} mediciones`
            : u.evento === 'reporte_pdf' ? `${num(u.detalle?.mediciones)} mediciones · ${num(u.detalle?.dias)} días`
            : u.evento === 'error' ? (ERRORES[u.detalle?.tipo] || u.detalle?.tipo || '') : '';
          const cls = u.evento === 'error' ? 'xw' : u.evento === 'reporte_pdf' || u.evento === 'gracias' ? 'xg' : u.evento === 'lectura' ? 'xt' : 'xb';
          return `<tr><td class="mono">${fechaHora(u.creado)}</td><td><span class="bx ${cls}">${esc(EVENTOS[u.evento] || u.evento)}</span></td>
            <td>${esc(det)}</td><td class="mono">${esc(u.serie || '—')}</td><td>${esc(u.navegador || '—')} · ${esc(u.sistema || '—')}</td></tr>`;
        }).join('')
      : '<tr><td colspan="5" class="vacio">Sin eventos todavía.</td></tr>';
  }

  // Barras: visitas por día (una sola serie). Tooltip con visitas, lecturas y reportes.
  function pintarPorDia(filas) {
    const cont = $('admPorDia');
    const max = Math.max(1, ...filas.map(f => f.sesiones));
    const W = 720, H = 200, x0 = 34, x1 = W - 6, y0 = 10, y1 = H - 24;
    const n = filas.length || 1, paso = (x1 - x0) / n, ancho = Math.max(2, paso - 2);
    const tope = Math.max(4, Math.ceil(max / 4) * 4);
    const sy = v => y1 - (y1 - y0) * v / tope;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = tope * i / 4, y = sy(v).toFixed(1);
      g += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" class="grid"/><text x="${x0 - 6}" y="${(+y + 3).toFixed(1)}" text-anchor="end" class="eje">${v}</text>`;
    }
    const cadaEtiqueta = Math.ceil(n / 8);
    filas.forEach((f, i) => {
      const x = x0 + i * paso + 1, y = sy(f.sesiones), h = y1 - y;
      if (f.sesiones > 0) {
        const r = Math.min(4, ancho / 2, h);
        g += `<path class="barra" d="M${x},${y1} V${y + r} Q${x},${y} ${x + r},${y} H${x + ancho - r} Q${x + ancho},${y} ${x + ancho},${y + r} V${y1} Z"/>`;
      }
      g += `<rect class="hit" x="${x0 + i * paso}" y="${y0}" width="${paso}" height="${y1 - y0}" data-i="${i}"/>`;
      const ultimaMarcada = Math.floor((n - 1) / cadaEtiqueta) * cadaEtiqueta;
      const etiqueta = i % cadaEtiqueta === 0 || (i === n - 1 && n - 1 - ultimaMarcada >= cadaEtiqueta / 2);
      if (etiqueta) g += `<text x="${(x + ancho / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="eje">${fechaCorta(f.dia).slice(0, 5)}</text>`;
    });
    g += `<line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" class="base"/>`;
    cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Visitas por día">${g}</svg><div class="tip" hidden></div>`;
    const tip = cont.querySelector('.tip');
    cont.querySelectorAll('.hit').forEach(r => {
      r.addEventListener('mouseenter', () => {
        const f = filas[+r.dataset.i];
        tip.innerHTML = `<b>${fechaCorta(f.dia)}</b><br>${num(f.sesiones)} visitas · ${num(f.lecturas)} lecturas · ${num(f.reportes)} reportes`;
        tip.hidden = false;
        const bx = r.getBoundingClientRect(), cx = cont.getBoundingClientRect();
        tip.style.left = Math.min(Math.max(bx.left - cx.left + bx.width / 2, 90), cx.width - 90) + 'px';
      });
      r.addEventListener('mouseleave', () => { tip.hidden = true; });
    });
    $('admPorDiaTotal').textContent = filas.length ? `${num(filas.reduce((a, f) => a + f.sesiones, 0))} visitas en ${filas.length} días` : '';
  }

  // Embudo: sesiones que llegaron a cada paso, en % de las que abrieron la página.
  function pintarEmbudo(filas) {
    const base = Math.max(1, filas[0]?.sesiones || 0);
    $('admEmbudo').innerHTML = filas.map(f => {
      const pct = Math.round(100 * f.sesiones / base);
      return `<div class="emb"><div class="emb-l">${esc(EVENTOS[f.evento] || f.evento)}</div>
        <div class="emb-b"><span style="width:${filas[0]?.sesiones ? pct : 0}%"></span></div>
        <div class="emb-v">${num(f.sesiones)} <small>${filas[0]?.sesiones ? pct + '%' : ''}</small></div></div>`;
    }).join('');
  }

  // ── eventos ──────────────────────────────────────────
  $('admEntrar').onclick = () => { const v = $('admClave').value.trim(); if (!v) return; guardarClave(v); $('admClave').value = ''; cargar(); };
  $('admClave').onkeydown = e => { if (e.key === 'Enter') $('admEntrar').click(); };
  $('admActualizar').onclick = cargar;
  $('admSalir').onclick = () => { guardarClave(''); location.hash = ''; };
  document.querySelectorAll('#admDias .chip').forEach(b => b.onclick = () => {
    dias = +b.dataset.dias;
    document.querySelectorAll('#admDias .chip').forEach(x => x.classList.toggle('chip-on', x === b));
    cargar();
  });
  window.addEventListener('hashchange', rutear);
  if (esAdmin()) rutear();
})();
