// Pestaña Remoto: controla la música de Prometeo (agente en radio-agente) desde cualquier dispositivo.
// Rutas y estado: WIKI/sistemas/radio-backend.md §4. Pantallas: radio-flujo.md §5 y radio-brief-diseno.md §5.
import { esc, tiempo, ic, elegirOpcion, confirmar, ordenable } from './ui-comun.js?v=1';

const URL_BASE = 'https://control-radio.lafortalezaceramica.com';
const K_FICHA = 'radio.remoto.ficha', K_URL = 'radio.remoto.url';
const CANDADO = '<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
const nombreDispositivo = () => {
  const ua = navigator.userAgent;
  const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Dispositivo';
  return so + (/Chrome|Edg/i.test(ua) ? ' · Chrome' : '');
};
const miniDe = (it, calidad = 'mqdefault') => (it && (it.miniatura || (it.id ? `https://i.ytimg.com/vi/${it.id}/${calidad}.jpg` : ''))) || '';

export function crearRemotoUI({ seccion, store, toast, alRadio, oyendoLocal = () => false }) {
  let est = null;          // último estado recibido del agente
  let red = 'conectando';  // 'ok' | 'conectando' | 'caido'
  let es = null, reintento = 0;
  let resultados = null, buscando = false, ultimaBusqueda = '';
  let arrastrando = false;
  let visible = false, sucio = true, pantalla = '';
  let ultimoEvento = 0;    // cuándo llegó lo último del agente (estado o latido)
  const oyentes = new Set();
  const avisar = () => oyentes.forEach(f => { try { f(); } catch (e) { console.warn(e); } });

  const base = () => (store.get(K_URL) || URL_BASE).replace(/\/+$/, '');
  const ficha = () => store.get(K_FICHA) || '';

  // ---------- red ----------
  async function api(metodo, ruta, cuerpo, ms = 20000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    let r;
    try {
      r = await fetch(base() + '/api' + ruta, {
        method: metodo, signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', ...(ficha() ? { Authorization: 'Bearer ' + ficha() } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
      });
    } catch { throw { codigo: 0, error: 'Prometeo no responde' }; } finally { clearTimeout(t); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 && ficha() && ruta !== '/sesion') { salir(false); }
      throw { codigo: r.status, error: j.error || 'Error', detalle: j.detalle || '' };
    }
    return j;
  }
  const mensaje = e => (e && e.codigo === 0 ? 'Prometeo no responde' : (e && e.error) || 'Algo falló');

  function cerrarFlujo() { if (es) { es.close(); es = null; } clearTimeout(reintento); }
  function conectar() {
    cerrarFlujo();
    if (!ficha()) return;
    red = 'conectando'; pintarEstado(); ultimoEvento = Date.now();
    es = new EventSource(`${base()}/api/eventos?ficha=${encodeURIComponent(ficha())}`);
    es.addEventListener('estado', ev => {
      try { est = JSON.parse(ev.data); } catch { return; }
      red = 'ok'; ultimoEvento = Date.now();
      if (visible) pintar(); else sucio = true;
      avisar();
    });
    // Latido del agente (0.1.6 en adelante): sirve para saber que el flujo sigue vivo aunque nada cambie.
    es.addEventListener('latido', () => { ultimoEvento = Date.now(); });
    es.onerror = () => {
      red = 'caido'; pintarEstado(); avisar();
      // Si el navegador desistió (ficha mala, agente caído), se revisa y se reintenta.
      if (es && es.readyState === 2) { clearTimeout(reintento); reintento = setTimeout(revisar, 4000); }
    };
  }
  async function revisar() {
    if (!ficha()) return;
    try {
      est = await api('GET', '/estado', null, 8000); red = 'ok'; ultimoEvento = Date.now();
      conectar();   // reabre el flujo; conectar() deja 'conectando' hasta que llegue el primer estado
      red = 'ok';   // el estado recién pedido es fresco: no hace falta esperar al flujo para mostrarlo
      pintarEstado();
      if (visible) pintar(); else sucio = true;
      avisar();
    } catch (e) { red = 'caido'; pintarEstado(); avisar(); clearTimeout(reintento); if (ficha()) reintento = setTimeout(revisar, 6000); }
  }
  // Un teléfono o la APK en segundo plano pueden dejar el flujo congelado o muerto sin avisar (no salta onerror).
  // Al volver a primer plano, al recuperar la red y al abrir la pestaña: lo que había deja de valer como «actual»
  // (se atenúa y dice «Actualizando…») hasta que llegue el estado nuevo, y se reabre el flujo.
  let revisando = 0;
  // Con algo sonando el agente manda estado cada segundo; en pausa, un latido cada 15 s (agente 0.1.6).
  const callado = () => Date.now() - ultimoEvento > (est && !est.pausado ? 4000 : 20000);
  function revalidar() {
    if (!ficha()) return;
    if (est) { red = 'conectando'; pintarEstado(); avisar(); }
    const mio = ++revisando;
    revisar().finally(() => { if (mio === revisando) revisando = 0; });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && callado()) revalidar(); });
  window.addEventListener('pageshow', e => { if (e.persisted && callado()) revalidar(); });
  window.addEventListener('online', revalidar);
  window.addEventListener('focus', () => { if (callado()) revalidar(); });
  // Vigilante: si el flujo lleva demasiado callado, se revalida. Con un agente viejo (sin latido) y en pausa
  // esto reabre el flujo cada ~45 s, sin consecuencias.
  setInterval(() => {
    if (!ficha() || document.visibilityState === 'hidden' || revisando) return;
    if (Date.now() - ultimoEvento > 45000) revalidar();
  }, 10000);
  function salir(avisarUsuario = true) {
    cerrarFlujo(); store.set(K_FICHA, ''); est = null; resultados = null;
    if (avisarUsuario) toast('Remoto', 'Este dispositivo salió del control remoto');
    pintar(); avisar();
  }

  // ---------- órdenes ----------
  async function orden(metodo, ruta, cuerpo, ms) {
    try { const r = await api(metodo, ruta, cuerpo, ms); if (r && r.cola) { est = r; red = 'ok'; if (visible) pintar(); avisar(); } return r; }
    catch (e) { toast('Remoto', mensaje(e)); return null; }
  }
  const control = (accion, segundo) => orden('POST', '/control', { accion, segundo });
  const hayActual = () => !!(est && est.actual);

  // ---------- pantallas ----------
  const dot = { ok: 'ok', conectando: 'cargando', caido: 'caido' };
  function textoEstado() {
    if (red === 'caido') return 'Prometeo no responde';
    if (red === 'conectando' && est) return 'Actualizando…';
    if (red === 'conectando' || !est) return 'Conectando…';
    if (!est.conectado) return 'Conectando el navegador de Prometeo…';
    return 'Prometeo conectado';
  }
  function pintarEstado() {
    const b = seccion.querySelector('.rem-estado');
    if (!b) return;
    const k = red === 'ok' && est && est.conectado ? 'ok' : (red === 'caido' ? 'caido' : 'cargando');
    b.dataset.k = k;
    // Sin conexión confirmada, lo que se ve puede estar viejo: se atenúa.
    seccion.classList.toggle('rem-rancio', red !== 'ok' && !!est);
    b.querySelector('b').textContent = textoEstado();
    const rb = seccion.querySelector('.rem-reintentar');
    if (rb) rb.hidden = red !== 'caido';
  }

  function pantallaClave() {
    pantalla = 'clave';
    seccion.className = 'p-card bib rem-clave';
    seccion.innerHTML = `${CANDADO.replace('class="ic"', 'class="ic rem-candado"')}<h2>Clave del control remoto</h2>
      <p class="bib-txt">Con ella pones música en Prometeo desde este dispositivo. Solo la pide una vez.</p>
      <form class="rem-form" autocomplete="on"><label class="campo">${CANDADO}<input type="password" name="clave" placeholder="Clave" autocomplete="current-password" enterkeyhint="go" aria-label="Clave"></label>
      <button type="submit" class="bib-btn principal">Entrar</button></form><p class="bib-error" hidden></p>`;
    const form = seccion.querySelector('form'), err = seccion.querySelector('.bib-error'), inp = form.querySelector('input'), btn = form.querySelector('button');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const clave = inp.value;
      if (!clave) return;
      btn.disabled = true; err.hidden = true;
      try {
        const r = await api('POST', '/sesion', { clave, nombre: nombreDispositivo() }, 15000);
        store.set(K_FICHA, r.ficha); inp.value = '';
        conectar(); pintar();
      } catch (x) {
        err.textContent = x.codigo === 429 ? 'Demasiados intentos; espera 15 minutos' : x.codigo === 401 ? 'Clave incorrecta' : mensaje(x);
        err.hidden = false; inp.select();
      } finally { btn.disabled = false; }
    });
  }

  function pantallaPrincipal() {
    pantalla = 'principal';
    seccion.className = 'p-rem';
    seccion.innerHTML = `<div class="rem">
      <div class="rem-col rem-izq">
        <div class="rem-top"><span class="rem-estado" data-k="cargando"><i class="dot"></i><b>Conectando…</b></span>
          <button type="button" class="boton chico rem-reintentar" hidden>Reintentar</button>
          <button type="button" class="ic-btn rem-mas" aria-label="Más opciones">${ic('mas')}</button></div>
        <div class="rem-prov" role="group" aria-label="Fuente"><button type="button" class="on" aria-pressed="true">YouTube</button><button type="button" disabled>SoundCloud<small>Pronto</small></button><button type="button" disabled>Radio Garden<small>Pronto</small></button></div>
        <button type="button" class="rem-aviso" hidden>${ic('radio')}<span>Estás oyendo tu música. Toca para oír la radio</span></button>
        <div class="rem-bloque rem-sonando"></div>
        <div class="rem-bloque rem-colab"></div>
      </div>
      <div class="rem-col rem-der">
        <form class="rem-buscar"><label class="campo">${ic('buscar')}<input type="search" name="q" placeholder="Buscar en YouTube" enterkeyhint="search" autocomplete="off" aria-label="Buscar en YouTube"></label><button type="submit" class="boton principal chico">Buscar</button></form>
        <div class="rem-res"></div>
      </div></div>`;
    const q = seccion.querySelector('input[name=q]');
    q.value = ultimaBusqueda;
    seccion.querySelector('.rem-buscar').addEventListener('submit', e => { e.preventDefault(); buscar(q.value); });
    seccion.querySelector('.rem-reintentar').addEventListener('click', () => { red = 'conectando'; pintarEstado(); revisar(); });
    seccion.querySelector('.rem-aviso').addEventListener('click', () => alRadio && alRadio());
    seccion.querySelector('.rem-mas').addEventListener('click', menuMas);
    // Si una miniatura no carga (sin internet, video borrado), se oculta y queda el fondo.
    seccion.addEventListener('error', e => { if (e.target && e.target.tagName === 'IMG') e.target.hidden = true; }, true);
    seccion.querySelector('.rem-sonando').addEventListener('click', clicSonando);
    seccion.querySelector('.rem-res').addEventListener('click', clicResultado);
    seccion.querySelector('.rem-colab').addEventListener('click', clicCola);
    pintarResultados();
  }

  function pintarSonando() {
    const c = seccion.querySelector('.rem-sonando');
    if (!c) return;
    const a = est && est.actual;
    if (!a) {
      c.innerHTML = `<div class="rem-vacio">${ic('radio')}<b>Nada suena en Prometeo</b><span>Busca un video y ponlo aquí.</span></div>`;
      return;
    }
    const vivo = !!est.envivo, dur = est.duracion, pos = est.posicion || 0;
    const frac = !vivo && dur ? Math.max(0, Math.min(1, pos / dur)) : 0;
    const existe = c.querySelector('.rem-barra');
    if (existe && c.dataset.uid === a.uid && c.dataset.vivo === String(vivo)) {
      // Solo se actualiza lo que cambia cada segundo.
      if (!arrastrando) { c.querySelector('.rem-barra i').style.width = frac * 100 + '%'; c.querySelector('.rem-t1').textContent = vivo ? '' : tiempo(pos); }
      const t2 = c.querySelector('.rem-t2'); if (t2) t2.textContent = vivo ? '' : tiempo(dur);
      const pb = c.querySelector('[data-a=play]'); pb.innerHTML = est.pausado ? ic('play') : ic('pausa'); pb.setAttribute('aria-label', est.pausado ? 'Reanudar' : 'Pausar');
      c.querySelector('.rem-error').textContent = est.error || ''; c.querySelector('.rem-error').hidden = !est.error;
      return;
    }
    c.dataset.uid = a.uid; c.dataset.vivo = String(vivo);
    c.innerHTML = `<div class="rem-mini"><img src="${esc(miniDe(a, 'hqdefault'))}" alt="" decoding="async"></div>
      <div class="rem-datos"><b>${esc(a.titulo)}</b><span>${esc(a.autor || '')}</span></div>
      <p class="rem-error" ${est.error ? '' : 'hidden'}>${esc(est.error || '')}</p>
      <div class="rem-prog">${vivo ? '<span class="rem-vivo"><i></i>En vivo</span>' : `<span class="rem-t1">${tiempo(pos)}</span><div class="rem-barra" role="slider" aria-label="Posición" tabindex="0"><i style="width:${frac * 100}%"></i></div><span class="rem-t2">${tiempo(dur)}</span>`}</div>
      <div class="rem-trans"><button type="button" data-a="ant" aria-label="Anterior">${ic('ant')}</button>
        <button type="button" class="rem-play" data-a="play" aria-label="${est.pausado ? 'Reanudar' : 'Pausar'}">${est.pausado ? ic('play') : ic('pausa')}</button>
        <button type="button" data-a="sig" aria-label="Siguiente">${ic('sig')}</button></div>
      <p class="rem-nota">El cambio se oye en la radio unos segundos después.</p>`;
    const barra = c.querySelector('.rem-barra');
    if (barra) engancharBarra(barra, c);
  }

  function engancharBarra(barra, c) {
    const fr = e => { const r = barra.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))); };
    let f = 0;
    const mover = e => { f = fr(e); barra.querySelector('i').style.width = f * 100 + '%'; c.querySelector('.rem-t1').textContent = tiempo(f * (est.duracion || 0)); };
    barra.addEventListener('pointerdown', e => { if (!est || !est.duracion) return; arrastrando = true; barra.setPointerCapture(e.pointerId); mover(e); });
    barra.addEventListener('pointermove', e => { if (arrastrando) mover(e); });
    const fin = e => { if (!arrastrando) return; arrastrando = false; mover(e); control('ir', Math.round(f * (est.duracion || 0))); };
    barra.addEventListener('pointerup', fin);
    barra.addEventListener('pointercancel', () => { arrastrando = false; pintarSonando(); });
  }
  function clicSonando(e) {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'play') control(est && est.pausado ? 'reanudar' : 'pausa');
    else if (a === 'ant') control('anterior');
    else if (a === 'sig') control('siguiente');
  }

  function pintarCola() {
    const c = seccion.querySelector('.rem-colab');
    if (!c) return;
    const cola = (est && est.cola) || [];
    c.innerHTML = `<header class="rem-cab"><b>Cola de Prometeo</b>${cola.length ? '<button type="button" class="boton chico" data-a="vaciar">Vaciar</button>' : ''}</header>` +
      (cola.length ? `<div class="rem-lista">${cola.map((it, i) => filaCola(it, i)).join('')}</div>` : '<p class="rem-nota">La cola está vacía.</p>');
    const lista = c.querySelector('.rem-lista');
    if (lista) ordenable(lista, {
      alMover: (d, h) => orden('POST', '/cola/mover', { uid: est.cola[d].uid, a: h }),
      alQuitar: i => orden('POST', '/cola/quitar', { uid: est.cola[i].uid })
    });
  }
  function filaCola(it, i) {
    const suena = est && i === est.indice;
    return `<div class="fila fila-cola${suena ? ' suena' : ''}" data-uid="${esc(it.uid)}">
      <button type="button" class="fila-asa" data-asa aria-label="Arrastrar para mover">${ic('asa')}</button>
      <span class="rem-art"><img src="${esc(miniDe(it))}" alt="" loading="lazy" decoding="async"></span>
      <span class="fila-txt"><b>${esc(it.titulo)}</b><small>${esc([it.autor, it.duracion ? tiempo(it.duracion) : 'En vivo'].filter(Boolean).join(' · '))}</small></span>
      <button type="button" class="fila-mas" data-quitar aria-label="Quitar de la cola">${ic('cerrar')}</button></div>`;
  }
  async function clicCola(e) {
    const v = e.target.closest('[data-a=vaciar]');
    if (v) {
      if (await confirmar({ titulo: '¿Vaciar la cola?', texto: 'Se detiene lo que suena en Prometeo.', boton: 'Vaciar', peligro: true })) orden('POST', '/cola/vaciar');
      return;
    }
    const q = e.target.closest('[data-quitar]');
    if (q) orden('POST', '/cola/quitar', { uid: q.closest('.fila').dataset.uid });
  }

  async function buscar(texto) {
    const q = String(texto || '').trim();
    if (!q || buscando) return;
    ultimaBusqueda = q; buscando = true; resultados = null; pintarResultados();
    try {
      const r = await api('GET', `/buscar?proveedor=youtube&q=${encodeURIComponent(q)}`, null, 30000);
      resultados = r.resultados || [];
    } catch (e) {
      resultados = [];
      toast('YouTube no respondió', e && e.codigo === 0 ? 'Prometeo no responde' : 'Intenta otra vez');
    } finally { buscando = false; pintarResultados(); }
  }
  function pintarResultados() {
    const c = seccion.querySelector('.rem-res');
    if (!c) return;
    if (buscando) { c.innerHTML = '<p class="rem-nota">Buscando…</p>'; return; }
    if (resultados == null) { c.innerHTML = ''; return; }
    if (!resultados.length) { c.innerHTML = '<p class="rem-nota">No hay resultados.</p>'; return; }
    c.innerHTML = resultados.map((r, i) => `<button type="button" class="fila rem-r" data-i="${i}">
      <span class="rem-art rem-art-g"><img src="${esc(miniDe(r))}" alt="" loading="lazy" decoding="async"></span>
      <span class="fila-txt"><b>${esc(r.titulo)}</b><small>${esc(r.autor || '')}</small></span>
      <span class="fila-t">${r.duracion ? tiempo(r.duracion) : '<em class="rem-vivo-ch">En vivo</em>'}</span></button>`).join('');
  }
  async function clicResultado(e) {
    const b = e.target.closest('.rem-r'); if (!b || !resultados) return;
    const r = resultados[+b.dataset.i];
    const op = await elegirOpcion({
      titulo: r.titulo,
      opciones: [
        { id: 'ya', texto: 'Reproducir ahora', icono: 'play' },
        { id: 'sig', texto: 'A continuación', icono: 'sig_lista' },
        { id: 'fin', texto: 'Al final de la cola', icono: 'cola' }
      ]
    });
    if (!op) return;
    if (op === 'ya') { if (await orden('POST', '/reproducir', r)) toast('Prometeo', 'Suena en unos segundos'); }
    else if (await orden('POST', '/cola/agregar', { ...r, siguiente: op === 'sig' })) toast('Cola de Prometeo', op === 'sig' ? 'Suena a continuación' : 'Agregado al final');
  }

  async function menuMas() {
    const op = await elegirOpcion({
      titulo: 'Control remoto',
      opciones: [
        { id: 'ventana', texto: est && est.ventana ? 'Ocultar la ventana de Prometeo' : 'Mostrar la ventana de Prometeo', sub: 'El navegador que toca la música', icono: 'video' },
        { id: 'salir', texto: 'Salir de este dispositivo', sub: 'Pedirá la clave otra vez', icono: 'cerrar', peligro: true }
      ]
    });
    if (op === 'ventana') orden('POST', '/ventana', { accion: est && est.ventana ? 'ocultar' : 'mostrar' });
    else if (op === 'salir' && await confirmar({ titulo: '¿Salir de este dispositivo?', texto: 'Para volver a entrar necesitarás la clave.', boton: 'Salir' })) salir();
  }

  function pintarAviso() {
    const a = seccion.querySelector('.rem-aviso');
    if (a) a.hidden = !oyendoLocal();
  }

  function pintar() {
    sucio = false;
    if (!ficha()) { if (pantalla !== 'clave') pantallaClave(); return; }
    if (pantalla !== 'principal') pantallaPrincipal();
    pintarEstado(); pintarAviso(); pintarSonando();
    // La cola se redibuja solo si cambió; no mientras se arrastra una fila.
    const k = est ? JSON.stringify([est.cola.map(x => x.uid), est.indice]) : '';
    const c = seccion.querySelector('.rem-colab');
    if (c && c.dataset.k !== k && !c.querySelector('.fila.arrastrando')) { c.dataset.k = k; pintarCola(); }
  }

  // ---------- lo que la app usa ----------
  // Con la radio sonando y algo en la cola de Prometeo, la franja y los controles del sistema hablan de eso.
  const activo = () => !!(ficha() && red === 'ok' && est && est.conectado && hayActual());
  if (ficha()) conectar();
  pintar();

  return {
    activo,
    alCambio(f) { oyentes.add(f); return () => oyentes.delete(f); },
    // Al entrar a la pestaña se pide el estado y se reabre el flujo; mientras tanto se pinta lo último, atenuado.
    alMostrar() { visible = true; if (sucio || pantalla === '') pintar(); else { pintarAviso(); pintarEstado(); } if (ficha() && callado()) revalidar(); },
    alOcultar() { visible = false; },
    refrescar() { if (visible) pintarAviso(); },
    reproduciendo: () => !!(est && est.actual && !est.pausado),
    anterior: () => control('anterior'),
    siguiente: () => control('siguiente'),
    // Datos para la franja «Ahora suena»
    franja() {
      const a = est && est.actual;
      if (!a) return null;
      return {
        titulo: a.titulo, sub: a.autor || 'Prometeo', imagen: miniDe(a), anterior: true, siguiente: true,
        progreso: est.envivo || !est.duracion ? null : (est.posicion || 0) / est.duracion
      };
    },
    sesion() {
      const a = est && est.actual;
      return a ? { titulo: a.titulo, artista: a.autor || 'Prometeo', portada: miniDe(a, 'hqdefault') } : null;
    }
  };
}
