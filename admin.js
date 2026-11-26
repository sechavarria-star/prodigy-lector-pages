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
    reporte_pdf: 'Generó el reporte', gracias: 'Llegó al final', opinion: 'Dejó su opinión', error: 'Error' };
  const ERRORES = { sin_puerto: 'No eligió el medidor', puerto_ocupado: 'Puerto ocupado', no_responde_serie: 'El medidor no responde',
    descarga: 'Falló la lectura', conexion: 'Error al conectar', sin_hid: 'No eligió el medidor (USB integrado)',
    conexion_hid: 'Error al conectar (USB integrado)', pdf_descarga: 'Falló la descarga del PDF', lectura_incompleta: 'Lectura incompleta', otro: 'Otro' };
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
    document.body.classList.toggle('modo-admin', admin);
    if (admin) {
      $('vistaSimple').hidden = true; $('vistaTecnica').hidden = true;
      document.body.classList.remove('vista-simple');
      $('estado').hidden = true;
      if (leerClave()) cargar().then(badgeHandoff); else mostrarLogin();
    } else {
      pararPolls();
      $('estado').hidden = false;
      verVista(new URLSearchParams(location.search).has('tecnico'));
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
      cargadas.lector = dias;
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
    const k = d.kpis || {}, op = d.opinion || {};
    const conv = k.sesiones ? Math.round(100 * k.sesiones_con_lectura / k.sesiones) : 0;
    const tiles = [
      ['Visitas', num(k.sesiones), 'sesiones distintas', '--blue'],
      ['Medidores', num(k.equipos), 'números de serie distintos', '--violet'],
      ['Lecturas', num(k.lecturas), `${num(k.mediciones_leidas)} mediciones leídas`, '--teal'],
      ['Reportes PDF', num(k.reportes), 'generados', '--ok'],
      ['Conversión', `${conv}%`, 'de las visitas leyó el medidor', '--blue'],
      ['Errores', num(k.errores), 'en el período', k.errores ? '--wa' : '--mt'],
      ['Opinión', op.votos ? `${String(op.promedio).replace('.', ',')} ★` : '—', `${num(op.votos)} votos`, '--yl'],
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

    const maxVotos = Math.max(1, ...(op.estrellas || []).map(e => e.votos));
    $('admOpinionTotal').textContent = op.votos ? `${num(op.votos)} votos · promedio ${String(op.promedio).replace('.', ',')} de 5` : 'Sin votos en el período';
    $('admOpinionBarras').innerHTML = (op.estrellas || []).map(e => `<div class="emb"><div class="emb-l">${'★'.repeat(e.estrellas)}</div>
        <div class="emb-b"><span style="width:${Math.round(100 * e.votos / maxVotos)}%"></span></div>
        <div class="emb-v">${num(e.votos)}</div></div>`).join('');
    $('admOpiniones').innerHTML = (op.comentarios || []).length
      ? op.comentarios.map(c => `<tr><td class="mono">${fechaHora(c.creado)}</td><td>${'★'.repeat(Math.min(5, Math.max(0, +c.estrellas || 0)))}</td>
          <td>${esc(c.comentario)}</td><td class="mono">${esc(c.serie || '—')}</td><td>${esc(c.sistema || '—')}</td></tr>`).join('')
      : '<tr><td colspan="5" class="vacio">Sin comentarios en el período.</td></tr>';

    $('admEquipos').innerHTML = (d.equipos || []).length
      ? d.equipos.map(e => `<tr><td class="mono">${esc(e.serie)}</td><td>${esc(e.cable || '—')}</td>
          <td class="num">${e.mediciones_guardadas ?? '—'}</td><td class="mono">${fechaCorta(e.medicion_mas_vieja)} → ${fechaCorta(e.medicion_mas_nueva)}</td>
          <td class="num">${num(e.conexiones)}</td><td class="num">${num(e.lecturas)}</td><td class="num">${num(e.reportes)}</td>
          <td class="mono">${fechaHora(e.primera_vez)}</td><td class="mono">${fechaHora(e.ultima_vez)}</td></tr>`).join('')
      : '<tr><td colspan="9" class="vacio">Todavía no se conectó ningún medidor.</td></tr>';

    $('admUltimos').innerHTML = (d.ultimos || []).length
      ? d.ultimos.map(u => {
          const det = u.evento === 'lectura' ? `${num(u.detalle?.cantidad)} mediciones${u.detalle?.faltan ? ` · faltan ${num(u.detalle.faltan)}` : ''}`
            : u.evento === 'reporte_pdf' ? `${num(u.detalle?.mediciones)} mediciones · ${num(u.detalle?.dias)} días`
            : u.evento === 'opinion' ? `${'★'.repeat(Math.min(5, Math.max(0, +u.detalle?.estrellas || 0)))} ${u.detalle?.comentario || ''}`
            : u.evento === 'error' ? (ERRORES[u.detalle?.tipo] || u.detalle?.tipo || '') : '';
          const cls = u.evento === 'error' ? 'xw' : u.evento === 'reporte_pdf' || u.evento === 'gracias' ? 'xg' : u.evento === 'lectura' ? 'xt' : 'xb';
          return `<tr><td class="mono">${fechaHora(u.creado)}</td><td><span class="bx ${cls}">${esc(EVENTOS[u.evento] || u.evento)}</span></td>
            <td>${esc(det)}</td><td class="mono">${esc(u.serie || '—')}</td><td>${esc(u.navegador || '—')} · ${esc(u.sistema || '—')}</td></tr>`;
        }).join('')
      : '<tr><td colspan="5" class="vacio">Sin eventos todavía.</td></tr>';
  }

  // Barras: visitas por día (una sola serie). Tooltip con visitas, lecturas y reportes.
  function pintarPorDia(filas) {
    barras($('admPorDia'), filas, 'sesiones', 'Visitas por día',
      f => `<b>${fechaCorta(f.dia)}</b><br>${num(f.sesiones)} visitas · ${num(f.lecturas)} lecturas · ${num(f.reportes)} reportes`);
    $('admPorDiaTotal').textContent = filas.length ? `${num(filas.reduce((a, f) => a + f.sesiones, 0))} visitas en ${filas.length} días` : '';
  }

  // Más de 120 días: se agrupa por semana (lunes) para que las barras se lean.
  function porSemana(filas, campos) {
    if (filas.length <= 120) return filas;
    const out = [];
    filas.forEach(f => {
      const d = new Date(String(f.dia).slice(0, 10) + 'T12:00:00');
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const k = d.toISOString().slice(0, 10);
      let s = out[out.length - 1];
      if (!s || s.dia !== k) { s = { dia: k, semana: true }; campos.forEach(c => s[c] = 0); out.push(s); }
      campos.forEach(c => s[c] += Number(f[c] || 0));
    });
    return out;
  }

  // Gráfico de barras genérico (una serie, campo `campo`); `tip(fila)` arma el tooltip.
  function barras(cont, filas, campo, aria, tip) {
    const max = Math.max(1, ...filas.map(f => f[campo]));
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
      const x = x0 + i * paso + 1, y = sy(f[campo]), h = y1 - y;
      if (f[campo] > 0) {
        const r = Math.min(4, ancho / 2, h);
        g += `<path class="barra" d="M${x},${y1} V${y + r} Q${x},${y} ${x + r},${y} H${x + ancho - r} Q${x + ancho},${y} ${x + ancho},${y + r} V${y1} Z"/>`;
      }
      g += `<rect class="hit" x="${x0 + i * paso}" y="${y0}" width="${paso}" height="${y1 - y0}" data-i="${i}"/>`;
      const ultimaMarcada = Math.floor((n - 1) / cadaEtiqueta) * cadaEtiqueta;
      const etiqueta = i % cadaEtiqueta === 0 || (i === n - 1 && n - 1 - ultimaMarcada >= cadaEtiqueta / 2);
      if (etiqueta) g += `<text x="${(x + ancho / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="eje">${fechaCorta(f.dia).slice(0, 5)}</text>`;
    });
    g += `<line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" class="base"/>`;
    cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(aria)}">${g}</svg><div class="tip" hidden></div>`;
    const caja = cont.querySelector('.tip');
    cont.querySelectorAll('.hit').forEach(r => {
      r.addEventListener('mouseenter', () => {
        caja.innerHTML = tip(filas[+r.dataset.i]);
        caja.hidden = false;
        const bx = r.getBoundingClientRect(), cx = cont.getBoundingClientRect();
        caja.style.left = Math.min(Math.max(bx.left - cx.left + bx.width / 2, 90), cx.width - 90) + 'px';
      });
      r.addEventListener('mouseleave', () => { caja.hidden = true; });
    });
  }

  // Barras horizontales simples (canal, origen): [{etiqueta, n}].
  function barrasH(cont, filas, vacio) {
    const max = Math.max(1, ...filas.map(f => f.n)), tot = filas.reduce((a, f) => a + f.n, 0);
    cont.innerHTML = filas.length ? filas.map(f => `<div class="emb"><div class="emb-l">${esc(f.etiqueta)}</div>
      <div class="emb-b"><span style="width:${Math.round(100 * f.n / max)}%"></span></div>
      <div class="emb-v">${num(f.n)} <small>${tot ? Math.round(100 * f.n / tot) + '%' : ''}</small></div></div>`).join('')
      : `<div class="vacio">${vacio}</div>`;
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

  // ── Agente IA · Mediciones bot · Handoff ─────────────
  // Datos del bot de Soporte (PRODIGY_V3) y del de Mediciones. Pasan por la Edge Function
  // (acción "agente", misma clave) hacia la rama "Panel ·" de PRODIGY_V3 en n8n.
  const ERR_AGENTE = {
    solo_whatsapp: 'Solo se puede atender por WhatsApp: esta conversación es de Telegram.',
    no_tomado: 'Primero tomá el chat: mientras no esté tomado, contesta el bot.',
    fuera_de_ventana: 'Pasaron más de 24 h desde el último mensaje de la persona: WhatsApp no deja escribirle hasta que vuelva a escribir.',
    texto_vacio: 'Escribí un mensaje.', whatsapp: 'WhatsApp rechazó el envío. Probá de nuevo en un rato.',
    no_configurado: 'El panel del agente todavía no está configurado en el servidor.', usuario: 'Número inválido.',
    n8n: 'No se pudo conectar con el bot. Probá de nuevo.', base: 'Error leyendo la base del bot.',
  };
  const QUIEN_KEY = 'lector-autocode:quien';
  let tab = 'lector', agDatos = null, agConvs = [], hfLista = [], chatUid = null, chatDatos = null;
  let pollChat = null, pollLista = null, enviando = false;
  const cargadas = {};  // pestaña → días con que se cargó (si cambia el período, se recarga)

  async function agente(op, extra = {}) {
    const r = await fetch(API_USO, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ accion: 'agente', clave: leerClave(), op, dias, ...extra }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { guardarClave(''); pararPolls(); mostrarLogin('Clave incorrecta.'); throw Object.assign(new Error('clave'), { silencio: true }); }
    if (r.status === 429) { guardarClave(''); pararPolls(); mostrarLogin('Demasiados intentos con clave incorrecta. Esperá 15 minutos y probá de nuevo.'); throw Object.assign(new Error('bloqueado'), { silencio: true }); }
    if (!r.ok && !j.error) throw new Error('n8n');
    if (j.ok === false) throw new Error(j.error || 'n8n');
    return j;
  }
  const msgError = e => ERR_AGENTE[e.message] || 'No se pudo cargar. Probá de nuevo.';
  function avisar(id, e) { const el = $(id); if (e?.silencio) return; el.textContent = e ? msgError(e) : ''; el.hidden = !e; }
  const hace = t => {
    if (!t) return '—';
    const m = Math.round((Date.now() - new Date(t)) / 60000);
    return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} d`;
  };
  const kpis = (id, tiles) => { $(id).innerHTML = tiles.map(([l, v, s, c]) =>
    `<div class="kpi" style="--accent:var(${c})"><div class="kpi-lbl">${l}</div><div class="kpi-val">${v}</div><div class="kpi-sub">${s}</div></div>`).join(''); };
  const iniciales = n => String(n || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  // Duración legible: "8 min", "3 h 05 min", "2 d 4 h".
  const dur = ms => {
    if (ms == null || isNaN(ms) || ms < 0) return '—';
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m} min`;
    if (m < 1440) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
    return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
  };
  const desde = t => t ? dur(Date.now() - new Date(t)) : '—';
  // Versión corta para los indicadores: "5m", "1h 05m", "23h 54m", "2d 2h".
  const corta = ms => dur(ms).replace(/ (h|d|min)\b/g, (_, u) => u === 'min' ? 'm' : u).replace(/ 0?(\d+) min$/, ' $1m');
  const BADGE_HF = { pendiente: ['Pendiente', 'xw'], tomado: ['Tomado', 'xb'], cerrado: ['Cerrado', 'xm'] };
  const badgeHf = e => e && BADGE_HF[e] ? `<span class="bx ${BADGE_HF[e][1]}">${BADGE_HF[e][0]}</span>` : '';
  const nombreConv = c => c.alias || c.nombre || c.user_id;

  function verTab(t) {
    tab = t;
    document.querySelectorAll('#admTabs .adm-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('tabLector').hidden = t !== 'lector'; $('tabAgente').hidden = t !== 'agente';
    $('tabMedbot').hidden = t !== 'medbot'; $('tabHandoff').hidden = t !== 'handoff';
    $('admDias').style.visibility = t === 'handoff' ? 'hidden' : '';
    pararPolls();
    if (t === 'handoff') pollLista = setInterval(() => cargarHandoffs(true), 60000);
    if (t === 'handoff' && chatUid) pollChat = setInterval(() => cargarChat(true), 30000);
    if (cargadas[t] !== dias || t === 'handoff') actualizar();
  }
  // Al entrar: cuántas derivaciones pendientes hay (badge de la pestaña), solo si la clave ya anduvo.
  function badgeHandoff() { if (!$('admPanel').hidden) cargarHandoffs(true); }
  function pararPolls() { clearInterval(pollChat); clearInterval(pollLista); pollChat = pollLista = null; }

  function actualizar() {
    if (tab === 'lector') return cargar();
    if (tab === 'agente' || tab === 'medbot') return cargarAgente();
    return Promise.all([cargarHandoffs(), chatUid ? cargarChat() : null]);
  }

  async function cargarAgente() {
    $('admEstado').textContent = 'Cargando…';
    try {
      const [m, c] = await Promise.all([agente('metricas'), agente('conversaciones', { q: $('agBuscar').value.trim() })]);
      agDatos = m; agConvs = c.conversaciones || [];
      cargadas.agente = cargadas.medbot = dias;
      pintarAgente(); pintarConvs(); pintarMedbot();
      avisar('agError'); avisar('mbError');
      $('admEstado').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      avisar(tab === 'medbot' ? 'mbError' : 'agError', e); $('admEstado').textContent = '';
    }
  }

  function pintarAgente() {
    const s = agDatos.soporte || {};
    kpis('agKpis', [
      ['Usuarios únicos', num(s.usuarios), `${num(s.usuarios_whatsapp)} por WhatsApp`, '--blue'],
      ['Consultas', num(s.del_usuario), 'mensajes de usuarios', '--violet'],
      ['Respuestas del bot', num(s.del_agente), `${s.del_usuario ? Math.round(100 * s.del_agente / s.del_usuario) : 0}% de las consultas`, '--teal'],
      ['Respuestas humanas', num(s.humanos), 'desde el handoff', '--ok'],
      ['Derivaciones', num(s.handoffs), 'pedidos de hablar con una persona', s.handoffs ? '--wa' : '--mt'],
    ]);
    const filas = porSemana(s.por_dia || [], ['mensajes', 'usuarios']);
    const sem = filas[0]?.semana;
    barras($('agPorDia'), filas, 'mensajes', 'Consultas por día',
      f => `<b>${sem ? 'Semana del ' : ''}${fechaCorta(f.dia)}</b><br>${num(f.mensajes)} consultas · ${num(f.usuarios)} usuarios`);
    $('agPorDiaTotal').textContent = `${num(s.del_usuario)} consultas${sem ? ' · por semana' : ''}`;
  }

  function pintarConvs() {
    $('agConvs').innerHTML = agConvs.length
      ? agConvs.map(c => `<tr class="clic" data-uid="${esc(c.user_id)}"><td>${esc(nombreConv(c))}<div class="kpi-sub mono">${esc(c.user_id)}</div></td>
          <td><span class="bx ${c.canal === 'whatsapp' ? 'xg' : 'xb'}">${c.canal === 'whatsapp' ? 'WhatsApp' : 'Telegram'}</span></td>
          <td class="num">${num(c.mensajes)}</td><td class="num">${num(c.del_usuario)}</td>
          <td class="mono">${fechaHora(c.ultimo)}</td><td>${badgeHf(c.handoff)}</td></tr>`).join('')
      : '<tr><td colspan="6" class="vacio">Sin conversaciones en el período.</td></tr>';
    $('agConvs').querySelectorAll('tr.clic').forEach(tr => tr.onclick = () => abrirChat(tr.dataset.uid));
  }

  function pintarMedbot() {
    const m = agDatos.mediciones || {};
    kpis('mbKpis', [
      ['Pacientes registrados', num(m.pacientes), 'dados de alta en el bot (total)', '--blue'],
      ['Pacientes que midieron', num(m.usuarios), 'en el período', '--violet'],
      ['Mediciones', num(m.mediciones), 'registradas en el período', '--teal'],
      ['Promedio', m.promedio != null ? `${num(m.promedio)}` : '—', 'mg/dL', '--ok'],
    ]);
    const filas = porSemana(m.por_dia || [], ['mediciones']);
    const sem = filas[0]?.semana;
    barras($('mbPorDia'), filas, 'mediciones', 'Mediciones por día',
      f => `<b>${sem ? 'Semana del ' : ''}${fechaCorta(f.dia)}</b><br>${num(f.mediciones)} mediciones`);
    $('mbPorDiaTotal').textContent = `${num(m.mediciones)} mediciones${sem ? ' · por semana' : ''}`;
    const nom = { whatsapp: 'WhatsApp', telegram: 'Telegram', texto: 'Texto', foto: 'Foto del medidor', audio: 'Audio' };
    barrasH($('mbCanal'), (m.por_canal || []).map(x => ({ etiqueta: nom[x.canal] || x.canal, n: x.n })), 'Sin mediciones en el período.');
    barrasH($('mbOrigen'), (m.por_origen || []).map(x => ({ etiqueta: nom[x.origen] || x.origen, n: x.n })), 'Sin mediciones en el período.');
  }

  // ── Handoff ──
  async function cargarHandoffs(silencioso) {
    try {
      const j = await agente('handoffs');
      // Una sola fila por persona: la derivación más reciente (si hay una abierta, es esa).
      const ultima = {};
      (j.handoffs || []).forEach(h => { if (!ultima[h.user_id] || new Date(h.creado) > new Date(ultima[h.user_id].creado)) ultima[h.user_id] = h; });
      hfLista = (j.handoffs || []).filter(h => ultima[h.user_id] === h);
      cargadas.handoff = dias;
      pintarHandoffs(); if (!silencioso) avisar('hfError');
    } catch (e) { if (!silencioso) avisar('hfError', e); }
  }

  function pintarHandoffs() {
    const pend = hfLista.filter(h => h.estado === 'pendiente').length;
    $('admHfBadge').textContent = pend; $('admHfBadge').hidden = !pend;
    if (hfBusqueda) return pintarBusqueda();  // con el buscador activo, la lista muestra los resultados
    $('hfListaTit').textContent = 'Derivaciones';
    $('hfLista').innerHTML = hfLista.length ? hfLista.map(h => {
      const nombre = h.nombre || h.alias || h.user_id, abierto = h.estado !== 'cerrado';
      return `<div class="hf-item${h.user_id === chatUid ? ' sel' : ''}" data-uid="${esc(h.user_id)}">
        <div class="hf-av ${h.estado === 'pendiente' ? 'xw' : abierto ? '' : 'xm'}">${esc(iniciales(nombre))}</div>
        <div class="cuerpo">
        <div class="t"><span>${esc(nombre)}</span><span class="hora" title="Derivado ${fechaHora(h.creado)}">${abierto ? desde(h.creado) : ''}</span></div>
        <div class="s">${badgeHf(h.estado)} ${h.estado === 'tomado' ? `${esc(h.atendido_por || '—')} · hace ${desde(h.tomado)}` : h.estado === 'cerrado' ? `Cerrado ${hace(h.cerrado)} · duró ${dur(new Date(h.cerrado) - new Date(h.creado))}` : `Esperando hace ${desde(h.creado)}`}</div>
        <div class="s">${h.canal === 'telegram' ? 'Telegram · ' : ''}${esc(h.ultimo_texto || '—')}</div></div></div>`;
    }).join('')
      : '<div class="vacio">No hay derivaciones. Cuando alguien pida hablar con una persona, aparece acá.</div>';
    $('hfLista').querySelectorAll('.hf-item').forEach(el => el.onclick = () => abrirChat(el.dataset.uid));
  }

  // Buscador de usuarios de la pestaña Handoff: busca en todas las conversaciones del bot
  // (nombre o número, sin límite de fecha) para abrir —y tomar— cualquier chat.
  let hfBusqueda = '', hfResultados = [], hfBuscarT;
  function pintarBusqueda() {
    $('hfListaTit').textContent = `Resultados · ${hfResultados.length}`;
    $('hfLista').innerHTML = hfResultados.length ? hfResultados.map(c => `<div class="hf-item${c.user_id === chatUid ? ' sel' : ''}" data-uid="${esc(c.user_id)}">
        <div class="hf-av">${esc(iniciales(nombreConv(c)))}</div>
        <div class="cuerpo">
        <div class="t"><span>${esc(nombreConv(c))}</span>${badgeHf(c.handoff)}</div>
        <div class="s mono">${c.canal === 'whatsapp' ? '+' : 'Telegram · '}${esc(c.user_id)}</div>
        <div class="s">${num(c.mensajes)} mensajes · último ${hace(c.ultimo)}</div></div></div>`).join('')
      : '<div class="vacio">No hay usuarios que coincidan.</div>';
    $('hfLista').querySelectorAll('.hf-item').forEach(el => el.onclick = () => abrirChat(el.dataset.uid));
  }
  $('hfBuscar').oninput = () => {
    clearTimeout(hfBuscarT);
    hfBuscarT = setTimeout(async () => {
      const q = $('hfBuscar').value.trim();
      hfBusqueda = q.length >= 2 ? q : '';
      if (!hfBusqueda) { hfResultados = []; return pintarHandoffs(); }
      $('hfListaTit').textContent = 'Buscando…';
      try {
        const j = await agente('conversaciones', { q: hfBusqueda, dias: 0 });
        if (q !== $('hfBuscar').value.trim()) return;  // llegó tarde: ya se escribió otra cosa
        hfResultados = j.conversaciones || []; pintarBusqueda(); avisar('hfError');
      } catch (e) { avisar('hfError', e); }
    }, 350);
  };

  function abrirChat(uid) {
    chatUid = uid; chatDatos = null;
    $('hfVacio').hidden = true; $('hfChat').hidden = false; $('hfMensajes').innerHTML = '<div class="vacio">Cargando…</div>';
    $('hfInfo').hidden = true;
    $('hfAviso').hidden = true; $('hfTexto').value = '';
    verTab('handoff');
    pintarHandoffs();
  }

  async function cargarChat(silencioso) {
    const uid = chatUid;
    if (!uid) return;
    try {
      const j = await agente('chat', { user_id: uid });
      if (uid !== chatUid) return;
      const abajo = (() => { const c = $('hfMensajes'); return c.scrollHeight - c.scrollTop - c.clientHeight < 60; })();
      chatDatos = j; pintarChat(abajo || !silencioso);
    } catch (e) { if (!silencioso) { $('hfAviso').textContent = msgError(e); $('hfAviso').hidden = e.silencio; } }
  }

  function pintarChat(bajar) {
    const c = chatDatos, h = c.handoff, wa = c.canal === 'whatsapp';
    const ventana = c.ultimo_usuario && Date.now() - new Date(c.ultimo_usuario) < 24 * 3600e3;
    const tomado = h?.estado === 'tomado';
    $('hfNombre').textContent = h?.nombre || c.alias || c.user_id;
    $('hfNumero').textContent = (wa ? '+' : 'Telegram · ') + c.user_id;
    $('hfEstado').innerHTML = (tomado ? `${badgeHf('tomado')} por ${esc(h.atendido_por || '—')} desde ${fechaHora(h.tomado)} · el bot no le contesta`
      : h?.estado === 'pendiente' ? `${badgeHf('pendiente')} pidió una persona ${hace(h.creado)} · el bot sigue contestando`
      : 'Atiende el bot') + ` · último mensaje ${hace(c.ultimo_usuario)}`;
    $('hfTomar').hidden = !wa || tomado; $('hfDevolver').hidden = !h;
    $('hfDevolver').textContent = tomado ? 'Devolver al bot' : 'Cerrar derivación';
    $('hfPie').hidden = !wa || !tomado;
    const aviso = !wa ? 'Esta conversación es de Telegram: el panel solo puede responder por WhatsApp.'
      : tomado && !ventana ? ERR_AGENTE.fuera_de_ventana : '';
    $('hfAviso').textContent = aviso; $('hfAviso').hidden = !aviso;
    $('hfEnviar').disabled = !ventana || enviando; $('hfTexto').disabled = !ventana;
    const caja = $('hfMensajes');
    // Marcas de sistema intercaladas por hora: cuándo se derivó, se tomó y se cerró.
    const hi = infoHandoff();
    const marcas = hi ? [[hi.creado, 'pidió hablar con una persona'], [hi.tomado, `tomado por ${hi.atendido_por || '—'}`], [hi.cerrado, 'devuelto al bot']]
      .filter(([t]) => t).map(([t, txt]) => ({ sys: true, creado: t, txt })) : [];
    const items = [...(c.mensajes || []), ...marcas].sort((a, b) => new Date(a.creado) - new Date(b.creado));
    caja.innerHTML = (c.mensajes || []).length ? items.map(m => {
      if (m.sys) return `<div class="hf-sys">— ${esc(m.txt)} · ${fechaHora(m.creado)} —</div>`;
      const humano = m.autor && m.autor.startsWith('humano:');
      const cls = m.role === 'user' ? 'u' : humano ? 'h' : 'a';
      const quien = m.role === 'user' ? '' : humano ? m.autor.slice(7) + ' · ' : 'Bot · ';
      return `<div class="msg ${cls}">${esc(m.content)}<small>${esc(quien)}${fechaHora(m.creado)}</small></div>`;
    }).join('') : '<div class="vacio">Sin mensajes.</div>';
    if (bajar) caja.scrollTop = caja.scrollHeight;
    pintarInfo();
  }

  // Derivación a mostrar: la abierta (viene en el chat) o, si no hay, la última cerrada de la lista.
  function infoHandoff() {
    const c = chatDatos;
    if (!c) return null;
    return c.handoff || hfLista.filter(h => h.user_id === c.user_id).sort((a, b) => new Date(b.creado) - new Date(a.creado))[0] || null;
  }

  // Panel derecho (como el del hospital): usuario, derivación y métricas.
  function pintarInfo() {
    const c = chatDatos, h = infoHandoff(), wa = c.canal === 'whatsapp';
    const fila = (k, v) => `<div class="hf-irow"><span class="k">${k}</span><span class="v">${v}</span></div>`;
    const msgs = c.mensajes || [];
    const ventanaMs = c.ultimo_usuario ? 24 * 3600e3 - (Date.now() - new Date(c.ultimo_usuario)) : -1;
    const espera = !h ? '—' : h.tomado ? corta(new Date(h.tomado) - new Date(h.creado)) : h.estado === 'pendiente' ? corta(Date.now() - new Date(h.creado)) : '—';
    const ESTADO_BOT = { WAIT_HUMAN: 'Pidiendo datos para derivar', WAIT_REPLACEMENT: 'Pidiendo datos de reemplazo', WAIT_CONTROL: 'Control de solución', WAIT_FEEDBACK: 'Esperando opinión' };
    $('hfInfo').hidden = false;
    $('hfInfo').innerHTML = `
      <div class="hf-psec"><div class="sec">Usuario</div>
        ${fila('Nombre', esc(h?.nombre || '—'))}
        ${fila('Perfil', esc(c.alias || '—'))}
        ${fila(wa ? 'WhatsApp' : 'Telegram', `<span class="mono">${wa ? '+' : ''}${esc(c.user_id)}</span>`)}
        ${h?.dni ? fila('DNI', `<span class="mono">${esc(h.dni)}</span>`) : ''}
        ${h?.email ? fila('Email', esc(h.email)) : ''}
        ${fila('Primer mensaje', msgs.length ? fechaHora(msgs[0].creado) : '—')}
      </div>
      <div class="hf-psec"><div class="sec">Derivación</div>
        ${h ? `${fila('Estado', badgeHf(h.estado))}
        ${fila('Derivado', `${fechaHora(h.creado)}<div class="kpi-sub">hace ${desde(h.creado)}</div>`)}
        ${h.tomado ? fila('Tomado', `${fechaHora(h.tomado)}<div class="kpi-sub">${esc(h.atendido_por || '—')}</div>`) : ''}
        ${h.cerrado ? fila('Devuelto al bot', fechaHora(h.cerrado)) : ''}` : fila('Estado', 'Sin derivación · atiende el bot')}
        ${c.estado_bot ? fila('Bot', esc(ESTADO_BOT[c.estado_bot] || c.estado_bot)) : ''}
        <div class="hf-met">
          <div><div class="l">${h?.tomado ? 'Respuesta' : 'Espera'}</div><div class="n">${espera}</div></div>
          <div><div class="l">Mensajes</div><div class="n">${num(msgs.length)}</div></div>
          <div><div class="l">Ventana 24h</div><div class="n" style="color:var(${!wa ? '--mt' : ventanaMs > 0 ? '--ok' : '--rd'})">${!wa ? '—' : ventanaMs > 0 ? corta(ventanaMs) : 'Cerrada'}</div></div>
        </div>
      </div>
      ${h?.motivo ? `<div class="hf-psec"><div class="sec">Último mensaje al derivar</div><div class="hf-motivo">${esc(h.motivo)}</div></div>` : ''}`;
  }

  async function accionChat(op, extra = {}) {
    const uid = chatUid;
    try {
      await agente(op, { user_id: uid, quien: quien(), ...extra });
      await Promise.all([cargarChat(), cargarHandoffs(true)]);
      return true;
    } catch (e) { if (!e.silencio) { $('hfAviso').textContent = msgError(e); $('hfAviso').hidden = false; } return false; }
  }
  const quien = () => $('hfQuien').value.trim();
  // Diálogo de confirmación con la estética del panel. Esc o clic afuera = cancelar.
  function confirmar([titulo, texto, si]) {
    const dlg = $('admDlg');
    $('admDlgTitulo').textContent = titulo; $('admDlgTexto').textContent = texto; $('admDlgSi').textContent = si;
    return new Promise(res => {
      const fin = v => { dlg.close(); res(v); };
      $('admDlgSi').onclick = () => fin(true);
      $('admDlgNo').onclick = () => fin(false);
      dlg.oncancel = e => { e.preventDefault(); fin(false); };
      dlg.onclick = e => { // clic en el fondo (fuera de la caja), no en el padding del diálogo
        const r = dlg.getBoundingClientRect();
        if (e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) fin(false);
      };
      dlg.showModal(); $('admDlgSi').focus();
    });
  }
  function pedirQuien() {
    if (quien()) return true;
    $('hfAviso').textContent = 'Poné tu nombre en "Atendido por" antes de tomar o responder.'; $('hfAviso').hidden = false;
    $('hfQuien').focus(); return false;
  }

  $('hfTomar').onclick = async () => { if (!pedirQuien()) return; $('hfTomar').disabled = true; await accionChat('tomar'); $('hfTomar').disabled = false; };
  $('hfDevolver').onclick = async () => {
    const tomado = chatDatos?.handoff?.estado === 'tomado';
    const ok = await confirmar(tomado
      ? ['¿Devolver al bot?', 'El bot vuelve a contestarle automáticamente a esta persona.', 'Devolver al bot']
      : ['¿Cerrar la derivación?', 'Se marca como resuelta y sale de la lista de pendientes.', 'Cerrar derivación']);
    if (!ok) return;
    $('hfDevolver').disabled = true; await accionChat('devolver'); $('hfDevolver').disabled = false;
  };
  $('hfEnviar').onclick = async () => {
    const t = $('hfTexto').value.trim();
    if (!t || enviando || !pedirQuien()) return;
    enviando = true; $('hfEnviar').disabled = true; $('hfEnviar').textContent = 'Enviando…';
    if (await accionChat('responder', { texto: t })) $('hfTexto').value = '';
    enviando = false; $('hfEnviar').textContent = 'Enviar'; if (chatDatos) pintarChat(true);
  };
  $('hfTexto').onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('hfEnviar').click(); };
  try { $('hfQuien').value = localStorage.getItem(QUIEN_KEY) || ''; } catch {}
  $('hfQuien').onchange = () => { try { localStorage.setItem(QUIEN_KEY, quien()); } catch {} };
  let buscarT;
  $('agBuscar').oninput = () => { clearTimeout(buscarT); buscarT = setTimeout(async () => {
    try { agConvs = (await agente('conversaciones', { q: $('agBuscar').value.trim() })).conversaciones || []; pintarConvs(); } catch (e) { avisar('agError', e); }
  }, 350); };
  document.querySelectorAll('#admTabs .adm-tab').forEach(b => b.onclick = () => verTab(b.dataset.tab));

  // ── eventos ──────────────────────────────────────────
  $('admEntrar').onclick = () => { const v = $('admClave').value.trim(); if (!v) return; guardarClave(v); $('admClave').value = ''; cargar().then(() => { if ($('admPanel').hidden) return; if (tab !== 'lector') verTab(tab); else badgeHandoff(); }); };
  $('admClave').onkeydown = e => { if (e.key === 'Enter') $('admEntrar').click(); };
  $('admActualizar').onclick = actualizar;
  $('admSalir').onclick = () => { pararPolls(); guardarClave(''); location.hash = ''; };
  document.querySelectorAll('#admDias .chip').forEach(b => b.onclick = () => {
    dias = +b.dataset.dias;
    document.querySelectorAll('#admDias .chip').forEach(x => x.classList.toggle('chip-on', x === b));
    actualizar();
  });
  window.addEventListener('hashchange', rutear);
  if (esAdmin()) rutear();
})();
