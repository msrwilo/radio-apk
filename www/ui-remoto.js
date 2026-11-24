// Pestaña Remoto: controla la música de Prometeo (agente en radio-agente) desde cualquier dispositivo.
// Rutas y estado: WIKI/sistemas/radio-backend.md §4. Pantallas: radio-flujo.md §5 y radio-brief-diseno.md §5.
// Y3 (23 nov 2026): tres bloques: Sonando, A continuación (cola pendiente + lo que pondría YouTube) y Recomendados.
// Y4 (23 nov 2026): bloque Inicio (recomendaciones de YouTube en cuadrícula) mientras no haya una búsqueda en pantalla. Sin YouTube Music desde el 24 nov 2026.
// Y5a (23 nov 2026): fichas Inicio | Listas; «Mis listas» (propias, guardadas en el agente de Prometeo), «Agregar a una lista…» y «Guardar como lista».
// Y5b (23 nov 2026): grupo «De mi cuenta de YouTube» (agente 0.1.10): solo leer y reproducir; «Copiar a mis listas» y «Actualizar».
import { esc, tiempo, ic, elegirOpcion, pedirTexto, confirmar, ordenable } from './ui-comun.js?v=1';

const URL_BASE = 'https://control-radio.lafortalezaceramica.com';
const K_FICHA = 'radio.remoto.ficha', K_URL = 'radio.remoto.url', K_VISTA = 'radio.remoto.vista';
const INICIO_VIDA = 10 * 60 * 1000;   // pasado este tiempo, al entrar a Remoto el inicio se vuelve a pedir
// Y5b: marca de las listas de la cuenta (rectángulo con el triángulo de reproducir, con el trazo de los demás íconos).
const IC_YT = '<svg viewBox="0 0 24 24" class="ic ic-yt" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.2 9.3v5.4l4.6-2.7z"/></svg>';
const CUENTA_VIDA = 10 * 60 * 1000;   // igual que la memoria del agente: pasado este tiempo, se vuelven a pedir al entrar
const CANDADO = '<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
const nombreDispositivo = () => {
  const ua = navigator.userAgent;
  const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Dispositivo';
  return so + (/Chrome|Edg/i.test(ua) ? ' · Chrome' : '');
};
const miniDe = (it, calidad = 'mqdefault') => (it && (it.miniatura || (it.id ? `https://i.ytimg.com/vi/${it.id}/${calidad}.jpg` : ''))) || '';

export function crearRemotoUI({ seccion, store, toast, alRadio, oyendoLocal = () => false }) {
  let est = null;          // último estado recibido del agente
  // Recomendados del lateral de YouTube y el video al que pertenecen. El evento «estado» no los trae (agente 0.1.7):
  // llegan en el evento «siguientes», en GET /estado y en las respuestas de las órdenes. Solo valen para ese video.
  let recs = { id: null, lista: [] };
  let red = 'conectando';  // 'ok' | 'conectando' | 'caido'
  let es = null, reintento = 0;
  let resultados = null, buscando = false, ultimaBusqueda = '';
  let arrastrando = false;
  // Y4: inicio. `estadoIni`: 'vacio' (sin pedir) | 'cargando' | 'listo' | 'error' | 'sinvideos'.
  let inicio = { estadoIni: 'vacio', fuente: null, secciones: [], t: 0 };
  let pidiendoInicio = 0;
  // Y5a: listas propias. `vista`: ficha del bloque derecho ('inicio' | 'listas'). `listasP.estado`: 'vacio' | 'cargando' | 'listo' | 'error' | 'viejo'
  // ('viejo' = el agente de Prometeo todavía no tiene listas, versión anterior a 0.1.9). `abierta`: la lista que se está viendo.
  let vista = store.get(K_VISTA) === 'listas' ? 'listas' : 'inicio';
  let listasP = { estado: 'vacio', propias: [], t: 0 };
  let abierta = null;      // { id, origen: 'propia' | 'cuenta', estado: 'cargando' | 'listo', datos }
  let pidiendoListas = 0, verL = 0;
  // Y5b: listas de la cuenta de YouTube. `estado`: 'vacio' | 'cargando' | 'listo' | 'sinleer' (YouTube no las mostró) | 'error' |
  // 'viejo' (agente anterior a 0.1.10). `releyendo`: se piden de nuevo sin quitar las que ya se ven.
  let listasC = { estado: 'vacio', cuenta: [], t: 0, releyendo: false };
  let pidiendoCuenta = 0;
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
    es.addEventListener('siguientes', ev => {
      let d; try { d = JSON.parse(ev.data); } catch { return; }
      recs = { id: d.id || null, lista: Array.isArray(d.recomendados) ? d.recomendados : [] };
      ultimoEvento = Date.now();
      if (visible) pintar(); else sucio = true;
    });
    // Y5a: las listas propias cambiadas en cualquier dispositivo llegan aquí (agente 0.1.9 en adelante).
    es.addEventListener('listas', ev => {
      let d; try { d = JSON.parse(ev.data); } catch { return; }
      listasP = { estado: 'listo', propias: Array.isArray(d.propias) ? d.propias : [], t: Date.now() }; verL++;
      ultimoEvento = Date.now();
      if (abierta && abierta.estado === 'listo' && abierta.origen !== 'cuenta') recargarAbierta();
      if (visible) pintarListas(); else sucio = true;
    });
    es.onerror = () => {
      red = 'caido'; pintarEstado(); avisar();
      // Si el navegador desistió (ficha mala, agente caído), se revisa y se reintenta.
      if (es && es.readyState === 2) { clearTimeout(reintento); reintento = setTimeout(revisar, 4000); }
    };
  }
  async function revisar() {
    if (!ficha()) return;
    try {
      est = await api('GET', '/estado', null, 8000); tomarRecs(est); red = 'ok'; ultimoEvento = Date.now();
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
    cerrarFlujo(); store.set(K_FICHA, ''); est = null; resultados = null; recs = { id: null, lista: [] };
    inicio = { estadoIni: 'vacio', fuente: null, secciones: [], t: 0 }; pidiendoInicio++;
    listasP = { estado: 'vacio', propias: [], t: 0 }; abierta = null; pidiendoListas++; verL++;
    listasC = { estado: 'vacio', cuenta: [], t: 0, releyendo: false }; pidiendoCuenta++;
    if (avisarUsuario) toast('Remoto', 'Este dispositivo salió del control remoto');
    pintar(); avisar();
  }

  // ---------- órdenes ----------
  async function orden(metodo, ruta, cuerpo, ms) {
    try { const r = await api(metodo, ruta, cuerpo, ms); if (r && r.cola) { est = r; tomarRecs(r); red = 'ok'; if (visible) pintar(); avisar(); } return r; }
    catch (e) { toast('Remoto', mensaje(e)); return null; }
  }
  const control = (accion, segundo) => orden('POST', '/control', { accion, segundo });
  const hayActual = () => !!(est && est.actual);
  function tomarRecs(r) { if (r && Array.isArray(r.recomendados)) recs = { id: (r.actual && r.actual.id) || null, lista: r.recomendados }; }
  // Lo que falta por sonar de la cola propia: lo ya reproducido y lo que suena no se muestran.
  const pendientes = () => (est && est.cola ? est.cola.slice((est.indice || 0) + 1) : []);
  const recsVigentes = () => (est && est.actual && recs.id === est.actual.id ? recs.lista : []);

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
        <div class="rem-prov" role="group" aria-label="Fuente"><button type="button" class="on" aria-pressed="true">YouTube</button><button type="button" disabled>Radio Garden<small>Pronto</small></button><button type="button" disabled>SoundCloud<small>Pronto</small></button></div>
        <button type="button" class="rem-aviso" hidden>${ic('radio')}<span>Estás oyendo tu música. Toca para oír la radio</span></button>
        <div class="rem-bloque rem-sonando"></div>
        <div class="rem-bloque rem-colab"></div>
      </div>
      <div class="rem-col rem-der">
        <form class="rem-buscar"><label class="campo">${ic('buscar')}<input type="search" name="q" placeholder="Buscar en YouTube" enterkeyhint="search" autocomplete="off" aria-label="Buscar en YouTube"></label><button type="submit" class="boton principal chico">Buscar</button></form>
        <div class="rem-res"></div>
        <div class="rem-bloque rem-recs" hidden></div>
        <div class="rem-fichas" role="tablist" aria-label="Inicio o listas" hidden><button type="button" role="tab" data-v="inicio">Inicio</button><button type="button" role="tab" data-v="listas">Listas</button></div>
        <div class="rem-bloque rem-inicio" hidden></div>
        <div class="rem-bloque rem-listas" hidden></div>
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
    seccion.querySelector('.rem-recs').addEventListener('click', clicRecomendado);
    seccion.querySelector('.rem-inicio').addEventListener('click', clicInicio);
    seccion.querySelector('.rem-listas').addEventListener('click', clicListas);
    seccion.querySelector('.rem-fichas').addEventListener('click', e => {
      const b = e.target.closest('button[data-v]'); if (!b || b.dataset.v === vista) return;
      vista = b.dataset.v; store.set(K_VISTA, vista);
      pintarInicio(); pintarListas();
      if (vista === 'inicio') pedirInicio(); else pedirVistaListas();
    });
    pintarResultados();
    pintarInicio();
    pintarListas();
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
      <div class="rem-fila-datos"><div class="rem-datos"><b>${esc(a.titulo)}</b><span>${esc(a.autor || '')}</span></div>
        <button type="button" class="ic-btn" data-a="lista" aria-label="Agregar a una lista">${ic('sig_lista')}</button></div>
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
    else if (a === 'lista' && est && est.actual) agregarALista(est.actual);
  }

  // Bloque «A continuación»: la cola pendiente y, si no hay, lo que YouTube pondría después (marcado «Automático»).
  // Con cola pendiente no se muestra la continuación de YouTube: es la del video actual y cambiaría al acabarse la cola.
  function pintarCola() {
    const c = seccion.querySelector('.rem-colab');
    if (!c) return;
    const pend = pendientes();
    const cont = est && est.actual ? est.continuacion : null;
    let pie = '';
    if (pend.length) pie = '<p class="rem-nota rem-nota-izq">Al acabar la cola, sigue lo que elija YouTube.</p>';
    else if (cont) pie = `<p class="rem-sub">Después, YouTube pone</p>${filaItem(cont, 'data-c', true)}`;
    else if (est && est.actual) pie = '<p class="rem-nota rem-nota-izq">YouTube todavía no dice qué sigue.</p>';
    else pie = '<p class="rem-nota rem-nota-izq">No hay nada en la fila.</p>';
    const botonesCab = (est && est.actual ? '<button type="button" class="boton chico" data-a="guardar">Guardar como lista</button>' : '') +
      (pend.length ? '<button type="button" class="boton chico" data-a="vaciar">Quitar todo</button>' : '');
    c.innerHTML = `<header class="rem-cab"><b>A continuación</b>${botonesCab ? `<span class="rem-cab-acc">${botonesCab}</span>` : ''}</header>` +
      (pend.length ? `<div class="rem-lista">${pend.map(filaCola).join('')}</div>` : '') + pie;
    const lista = c.querySelector('.rem-lista');
    // Posiciones de la lista pendiente → posiciones en la cola completa del agente (después de lo que suena).
    if (lista) ordenable(lista, {
      alMover: (d, h) => { const p = pendientes(); if (p[d]) orden('POST', '/cola/mover', { uid: p[d].uid, a: (est.indice || 0) + 1 + h }); },
      alQuitar: i => { const p = pendientes(); if (p[i]) orden('POST', '/cola/quitar', { uid: p[i].uid }); }
    });
  }
  const etiquetaAuto = '<em class="rem-auto">Automático</em>';
  function filaCola(it) {
    return `<div class="fila fila-cola" data-uid="${esc(it.uid)}">
      <button type="button" class="fila-asa" data-asa aria-label="Arrastrar para mover">${ic('asa')}</button>
      <span class="rem-art"><img src="${esc(miniDe(it))}" alt="" loading="lazy" decoding="async"></span>
      <span class="fila-txt"><b>${esc(it.titulo)}</b><small>${it.automatico ? etiquetaAuto : ''}${esc([it.autor, it.duracion ? tiempo(it.duracion) : 'En vivo'].filter(Boolean).join(' · '))}</small></span>
      <button type="button" class="fila-mas" data-quitar aria-label="Quitar de la cola">${ic('cerrar')}</button></div>`;
  }
  // Renglón de un video que todavía no está en la cola (resultado, recomendado o continuación de YouTube).
  function filaItem(r, attr, auto = false) {
    return `<button type="button" class="fila rem-r" ${attr}>
      <span class="rem-art rem-art-g"><img src="${esc(miniDe(r))}" alt="" loading="lazy" decoding="async"></span>
      <span class="fila-txt"><b>${esc(r.titulo)}</b><small>${auto ? etiquetaAuto : ''}${esc(r.autor || '')}</small></span>
      <span class="fila-t">${r.duracion ? tiempo(r.duracion) : '<em class="rem-vivo-ch">En vivo</em>'}</span></button>`;
  }
  async function clicCola(e) {
    if (e.target.closest('[data-a=guardar]')) { guardarCola(); return; }
    const v = e.target.closest('[data-a=vaciar]');
    if (v) {
      const uids = pendientes().map(x => x.uid);
      if (!uids.length) return;
      if (!await confirmar({ titulo: '¿Quitar lo que sigue?', texto: 'Lo que suena no se detiene.', boton: 'Quitar todo', peligro: true })) return;
      // El agente no tiene una orden para esto (/cola/vaciar también detiene lo que suena): se quita uno por uno.
      for (const uid of uids) { if (!await orden('POST', '/cola/quitar', { uid })) break; }
      return;
    }
    if (e.target.closest('[data-c]')) { if (est && est.continuacion) ofrecer(est.continuacion); return; }
    const q = e.target.closest('[data-quitar]');
    if (q) orden('POST', '/cola/quitar', { uid: q.closest('.fila').dataset.uid });
  }

  // Bloque «Recomendados»: los del lateral de YouTube del video que suena.
  function pintarRecs() {
    const c = seccion.querySelector('.rem-recs');
    if (!c) return;
    c.hidden = !(est && est.actual);
    if (c.hidden) { c.innerHTML = ''; return; }
    const l = recsVigentes();
    c.innerHTML = '<header class="rem-cab"><b>Recomendados</b></header>' +
      (l.length ? `<div class="rem-lista">${l.map((r, i) => filaItem(r, `data-i="${i}"`)).join('')}</div>`
        : '<p class="rem-nota rem-nota-izq">YouTube todavía no muestra recomendados para este video.</p>');
  }
  function clicRecomendado(e) {
    const b = e.target.closest('.rem-r'); if (!b) return;
    const r = recsVigentes()[+b.dataset.i];
    if (r) ofrecer(r);
  }

  // ---------- Y4: Inicio ----------
  // 24 nov 2026 (Wilo): sin YouTube Music. El inicio sale siempre de youtube.com y ya no hay selector.
  const fuenteInicio = () => 'youtube';
  const NOMBRE_FUENTE = { youtube: 'YouTube' };
  // Se pide al agente (GET /inicio). Una petición a la vez; si se cambia de fuente a medias, la vieja se descarta.
  async function pedirInicio(forzar = false) {
    if (!ficha() || !est || !est.conectado) return;
    const fuente = fuenteInicio();
    if (!forzar && inicio.fuente === fuente && inicio.estadoIni === 'listo' && Date.now() - inicio.t < INICIO_VIDA) return;
    if (!forzar && inicio.fuente === fuente && inicio.estadoIni === 'cargando') return;
    // Tras un fallo o una lectura vacía no se insiste cada segundo: pasados 30 s, o con el botón.
    if (!forzar && inicio.fuente === fuente && (inicio.estadoIni === 'error' || inicio.estadoIni === 'sinvideos') && Date.now() - inicio.t < 30000) return;
    const mio = ++pidiendoInicio;
    inicio = { ...inicio, fuente, estadoIni: 'cargando', secciones: inicio.fuente === fuente ? inicio.secciones : [] };
    pintarInicio();
    let r = null, fallo = false;
    try { r = await api('GET', `/inicio?proveedor=youtube&fuente=${fuente}${forzar ? '&refrescar=1' : ''}`, null, 60000); }
    catch (e) { fallo = true; }
    if (mio !== pidiendoInicio) return;   // llegó tarde: se pidió otra cosa
    const secs = !fallo && r && Array.isArray(r.secciones) ? r.secciones.filter(s => s && Array.isArray(s.items) && s.items.length) : [];
    inicio = { estadoIni: fallo ? 'error' : secs.length ? 'listo' : 'sinvideos', fuente, secciones: secs, t: Date.now() };
    pintarInicio();
  }
  function tarjeta(r, k) {
    return `<button type="button" class="rem-tarj" data-k="${k}">
      <span class="rem-tarj-mini"><img src="${esc(miniDe(r))}" alt="" loading="lazy" decoding="async">${r.duracion ? `<small>${tiempo(r.duracion)}</small>` : '<small class="rem-tarj-vivo">En vivo</small>'}</span>
      <span class="rem-tarj-txt"><b>${esc(r.titulo)}</b><small>${esc(r.autor || '')}</small></span></button>`;
  }
  function pintarInicio() {
    const c = seccion.querySelector('.rem-inicio');
    if (!c) return;
    // Con una búsqueda en pantalla (o buscando) el inicio no se ve.
    const oculto = !ficha() || buscando || resultados != null || vista !== 'inicio';
    c.hidden = oculto;
    if (oculto) return;
    const f = fuenteInicio();
    // pintar() corre cada segundo mientras suena algo: el bloque solo se redibuja si cambió.
    const llave = JSON.stringify([f, inicio.estadoIni, inicio.fuente, inicio.t, !!(est && est.conectado)]);
    if (c.dataset.k === llave) return;
    c.dataset.k = llave;
    const cab = `<header class="rem-cab"><span></span><span class="rem-cab-acc">
      <button type="button" class="ic-btn" data-a="actualizar" aria-label="Actualizar el inicio">${ic('actualizar')}</button></span></header>`;
    let cuerpo;
    if (!est || !est.conectado) cuerpo = '<p class="rem-nota rem-nota-izq">El inicio aparece cuando Prometeo esté conectado.</p>';
    else if (inicio.estadoIni === 'cargando' && !inicio.secciones.length) cuerpo = `<p class="rem-nota rem-nota-izq rem-cargando">Cargando el inicio de ${NOMBRE_FUENTE[f]}…</p>`;
    else if (inicio.estadoIni === 'error' || inicio.estadoIni === 'sinvideos') {
      cuerpo = `<p class="rem-nota rem-nota-izq">${inicio.estadoIni === 'error' ? 'YouTube no respondió.' : `${NOMBRE_FUENTE[f]} no mostró su inicio.`}</p><div class="rem-volver-caja"><button type="button" class="boton chico" data-a="actualizar">Intentar otra vez</button></div>`;
    } else if (inicio.estadoIni === 'vacio') cuerpo = '';
    else {
      let k = 0;
      cuerpo = inicio.secciones.map(s => `<section class="rem-sec"><h3>${esc(s.titulo || '')}</h3><div class="rem-grid">${s.items.map(it => tarjeta(it, k++)).join('')}</div></section>`).join('');
    }
    c.innerHTML = cab + cuerpo;
    c.classList.toggle('rem-actualizando', inicio.estadoIni === 'cargando' && inicio.secciones.length > 0);
  }
  function clicInicio(e) {
    if (e.target.closest('[data-a=actualizar]')) { pedirInicio(true); return; }
    const t = e.target.closest('.rem-tarj');
    if (!t) return;
    const todos = inicio.secciones.flatMap(s => s.items);
    const r = todos[+t.dataset.k];
    if (r) ofrecer(r);
  }

  // ---------- Y5a: listas propias ----------
  const soloItem = x => ({ proveedor: x.proveedor || 'youtube', id: x.id, titulo: x.titulo, autor: x.autor, duracion: x.duracion, miniatura: x.miniatura });
  const nCanciones = n => `${n} ${n === 1 ? 'canción' : 'canciones'}`;
  // Orden con aviso en texto llano (las listas no cambian lo que suena, salvo «Reproducir»).
  async function lorden(metodo, ruta, cuerpo) {
    try { return await api(metodo, ruta, cuerpo, 20000); } catch (e) { toast('Listas', mensaje(e)); return null; }
  }
  async function pedirListas(forzar = false) {
    if (!ficha() || red === 'caido') return;
    if (!forzar && (listasP.estado === 'listo' || listasP.estado === 'cargando' || listasP.estado === 'viejo')) return;
    if (!forzar && listasP.estado === 'error' && Date.now() - listasP.t < 30000) return;
    const mio = ++pidiendoListas;
    listasP = { ...listasP, estado: 'cargando', t: Date.now() }; verL++; pintarListas();
    try {
      const r = await api('GET', '/listas', null, 15000);
      if (mio !== pidiendoListas) return;
      listasP = { estado: 'listo', propias: Array.isArray(r.propias) ? r.propias : [], t: Date.now() };
    } catch (e) {
      if (mio !== pidiendoListas) return;
      listasP = { estado: e && e.codigo === 404 ? 'viejo' : 'error', propias: listasP.propias, t: Date.now() };
    }
    verL++; pintarListas();
  }
  function pedirVistaListas() { pedirListas(); pedirCuenta(); }
  // Y5b: listas de la cuenta de YouTube. El agente las lee de youtube.com (puede tardar: va en fila con la búsqueda y el inicio).
  async function pedirCuenta(forzar = false, refrescar = false) {
    if (!ficha() || red === 'caido') return;
    const l = listasC;
    if (!forzar) {
      if (l.estado === 'cargando' || l.releyendo || l.estado === 'viejo') return;
      if (l.estado === 'listo' && Date.now() - l.t < CUENTA_VIDA) return;
      if ((l.estado === 'error' || l.estado === 'sinleer') && Date.now() - l.t < 30000) return;
    }
    const mio = ++pidiendoCuenta;
    // Con listas en pantalla se releen sin quitarlas; si no, se muestra «Cargando…».
    listasC = l.estado === 'listo' && l.cuenta.length ? { ...l, releyendo: true } : { estado: 'cargando', cuenta: [], t: Date.now(), releyendo: false };
    verL++; pintarListas();
    try {
      const r = await api('GET', `/listas/cuenta${refrescar ? '?refrescar=1' : ''}`, null, 90000);
      if (mio !== pidiendoCuenta) return;
      const cuenta = Array.isArray(r.cuenta) ? r.cuenta : [];
      listasC = { estado: cuenta.length ? 'listo' : 'sinleer', cuenta, t: Date.now(), releyendo: false };
    } catch (e) {
      if (mio !== pidiendoCuenta) return;
      // 404: el agente todavía no sabe de listas de la cuenta (anterior a 0.1.10).
      listasC = { estado: e && e.codigo === 404 ? 'viejo' : 'error', cuenta: [], t: Date.now(), releyendo: false };
    }
    verL++; pintarListas();
  }
  async function abrirLista(id, origen = 'propia', refrescar = false) {
    const ruta = origen === 'cuenta' ? `/listas/cuenta/${encodeURIComponent(id)}${refrescar ? '?refrescar=1' : ''}` : `/listas/propia/${id}`;
    abierta = { id, origen, estado: 'cargando', datos: null }; verL++; pintarListas();
    const mio = abierta;
    try {
      const d = await api('GET', ruta, null, origen === 'cuenta' ? 120000 : 15000);
      if (abierta !== mio) return;
      abierta = { id, origen, estado: 'listo', datos: { ...d, items: Array.isArray(d.items) ? d.items : [] } };
    } catch (e) {
      if (abierta !== mio) return;
      abierta = null;
      toast('Listas', e && e.codigo === 404 ? (origen === 'cuenta' ? 'El agente de Prometeo necesita la versión 0.1.10' : 'Esa lista ya no existe') : mensaje(e));
    }
    verL++; pintarListas();
  }
  async function recargarAbierta() {
    const id = abierta && abierta.origen !== 'cuenta' && abierta.id; if (!id) return;
    try {
      const d = await api('GET', `/listas/propia/${id}`, null, 15000);
      if (!abierta || abierta.id !== id) return;
      abierta = { id, origen: 'propia', estado: 'listo', datos: d };
    } catch (e) {
      if (e && e.codigo === 404 && abierta && abierta.id === id) { abierta = null; toast('Listas', 'Esa lista ya no existe'); }
      else return;
    }
    verL++; if (visible) pintarListas();
  }
  const miniLista = l => `<span class="rem-art rem-art-g${l.miniatura ? '' : ' rem-art-vacia'}">${l.miniatura ? `<img src="${esc(l.miniatura)}" alt="" loading="lazy" decoding="async">` : ic('lista')}</span>`;
  function filaCancion(it, i) {
    return `<div class="fila fila-cola rem-lcan" data-uid="${esc(it.uid)}" data-i="${i}">
      <button type="button" class="fila-asa" data-asa aria-label="Arrastrar para mover">${ic('asa')}</button>
      <span class="rem-art"><img src="${esc(miniDe(it))}" alt="" loading="lazy" decoding="async"></span>
      <span class="fila-txt"><b>${esc(it.titulo)}</b><small>${esc([it.autor, it.duracion ? tiempo(it.duracion) : 'En vivo'].filter(Boolean).join(' · '))}</small></span>
      <button type="button" class="fila-mas" data-quitar aria-label="Quitar de la lista">${ic('cerrar')}</button></div>`;
  }
  function filaCancionCuenta(it, i) {
    return `<button type="button" class="fila rem-lcan" data-i="${i}">
      <span class="rem-art"><img src="${esc(miniDe(it))}" alt="" loading="lazy" decoding="async"></span>
      <span class="fila-txt"><b>${esc(it.titulo)}</b><small>${esc([it.autor, it.duracion ? tiempo(it.duracion) : ''].filter(Boolean).join(' · '))}</small></span>
      <span class="fila-ir">${ic('mas')}</span></button>`;
  }
  // Y5b: grupo «De mi cuenta de YouTube» de la vista principal.
  function grupoCuenta() {
    const l = listasC;
    const cab = `<header class="rem-cab rem-cab-cuenta"><b>De mi cuenta de YouTube</b>${l.estado === 'viejo' ? '' : `<button type="button" class="ic-btn${l.releyendo || l.estado === 'cargando' ? ' girando' : ''}" data-a="cuenta-actualizar" aria-label="Volver a leer las listas de YouTube">${ic('actualizar')}</button>`}</header>`;
    const otraVez = '<div class="rem-volver-caja"><button type="button" class="boton chico" data-a="cuenta-actualizar">Intentar otra vez</button></div>';
    let cuerpo;
    if (l.estado === 'viejo') cuerpo = '<p class="rem-nota rem-nota-izq">Para ver las listas de tu cuenta, el agente de Prometeo necesita la versión 0.1.10.</p>';
    else if (l.estado === 'sinleer' || l.estado === 'error') cuerpo = `<p class="rem-nota rem-nota-izq">YouTube no mostró tus listas.</p>${otraVez}`;
    else if (l.estado !== 'listo') cuerpo = '<p class="rem-nota rem-nota-izq rem-cargando">Cargando tus listas de YouTube…</p>';
    else cuerpo = `<div class="rem-lista">${l.cuenta.map(x => `<button type="button" class="fila rem-lrow" data-id="${esc(x.id)}" data-origen="cuenta">${miniLista(x)}
      <span class="fila-txt"><b>${esc(x.nombre)}</b><small class="rem-yt">${IC_YT}${x.total == null ? 'YouTube' : nCanciones(x.total)}</small></span><span class="fila-ir">${ic('derecha')}</span></button>`).join('')}</div>`;
    return `<section class="rem-grupo-cuenta">${cab}${cuerpo}</section>`;
  }
  function pintarListas() {
    const c = seccion.querySelector('.rem-listas'), f = seccion.querySelector('.rem-fichas');
    if (!c || !f) return;
    const fuera = !ficha() || buscando || resultados != null;   // con una búsqueda en pantalla, las fichas se esconden
    f.hidden = fuera;
    f.querySelectorAll('button').forEach(b => { const on = b.dataset.v === vista; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    c.hidden = fuera || vista !== 'listas';
    if (c.hidden) return;
    // pintar() corre cada segundo: el bloque solo se redibuja si cambió, y nunca mientras se arrastra una fila.
    const llave = String(verL);
    if (c.dataset.k === llave || c.querySelector('.fila.arrastrando')) return;
    c.dataset.k = llave;
    if (abierta) { pintarUnaLista(c); return; }
    let cuerpo;
    const l = listasP;
    if (l.estado === 'viejo') cuerpo = '<p class="rem-nota rem-nota-izq">El agente de Prometeo todavía no guarda listas. Hay que ponerle la versión 0.1.9.</p><div class="rem-volver-caja"><button type="button" class="boton chico" data-a="reintentar">Intentar otra vez</button></div>';
    else if (l.estado === 'error') cuerpo = '<p class="rem-nota rem-nota-izq">No pude leer tus listas.</p><div class="rem-volver-caja"><button type="button" class="boton chico" data-a="reintentar">Intentar otra vez</button></div>';
    else if (l.estado !== 'listo') cuerpo = '<p class="rem-nota rem-nota-izq rem-cargando">Cargando tus listas…</p>';
    else if (!l.propias.length) cuerpo = '<p class="rem-nota rem-nota-izq">Todavía no tienes listas. Crea una o guarda la cola como lista.</p>';
    else cuerpo = `<div class="rem-lista">${l.propias.map(x => `<button type="button" class="fila rem-lrow" data-id="${esc(x.id)}">${miniLista(x)}
      <span class="fila-txt"><b>${esc(x.nombre)}</b><small>${nCanciones(x.total)}</small></span><span class="fila-ir">${ic('derecha')}</span></button>`).join('')}</div>`;
    c.innerHTML = `<header class="rem-cab"><b>Mis listas</b><button type="button" class="boton chico" data-a="nueva">Nueva lista</button></header>` + cuerpo + grupoCuenta();
  }
  function pintarUnaLista(c) {
    const atras = `<header class="rem-cab rem-cab-lista"><button type="button" class="boton chico" data-a="atras">‹ Listas</button>${abierta.estado === 'listo' ? `<button type="button" class="ic-btn" data-a="menu" aria-label="Más opciones de la lista">${ic('mas')}</button>` : ''}</header>`;
    if (abierta.estado !== 'listo') { c.innerHTML = atras + `<p class="rem-nota rem-nota-izq rem-cargando">${abierta.origen === 'cuenta' ? 'Leyendo la lista en YouTube…' : 'Cargando la lista…'}</p>`; return; }
    if (abierta.origen === 'cuenta') { pintarListaCuenta(c, atras); return; }
    const d = abierta.datos, n = d.items.length;
    c.innerHTML = atras + `<div class="rem-lhead"><b>${esc(d.nombre)}</b><span>${nCanciones(n)}</span></div>` +
      (n ? `<div class="rem-lbotones"><button type="button" class="boton principal chico" data-a="reproducir">Reproducir</button><button type="button" class="boton chico" data-a="aleatorio">Aleatorio</button><button type="button" class="boton chico" data-a="final">Al final de la cola</button></div>
        <div class="rem-lista rem-lcanc">${d.items.map(filaCancion).join('')}</div>`
        : '<p class="rem-nota rem-nota-izq">Esta lista está vacía. Agrega música desde la hoja de cualquier canción («Agregar a una lista…»).</p>');
    const lista = c.querySelector('.rem-lcanc');
    if (lista) ordenable(lista, {
      alMover: (desde, hasta) => moverEnLista(desde, hasta),
      alQuitar: i => quitarDeLista(i)
    });
  }
  // Y5b: lista de la cuenta de YouTube: sin reordenar ni quitar (solo se lee); ⋯ con «Copiar a mis listas» y «Actualizar».
  function pintarListaCuenta(c, atras) {
    const d = abierta.datos, n = d.items.length;
    c.innerHTML = atras + `<div class="rem-lhead"><b>${esc(d.nombre)}</b><span class="rem-yt">${IC_YT}De tu cuenta de YouTube · ${nCanciones(n)}</span></div>` +
      (n ? `<div class="rem-lbotones"><button type="button" class="boton principal chico" data-a="reproducir">Reproducir</button><button type="button" class="boton chico" data-a="aleatorio">Aleatorio</button><button type="button" class="boton chico" data-a="final">Al final de la cola</button></div>
        <div class="rem-lista rem-lcanc">${d.items.map(filaCancionCuenta).join('')}</div>`
        : '<p class="rem-nota rem-nota-izq">YouTube no mostró las canciones de esta lista.</p><div class="rem-volver-caja"><button type="button" class="boton chico" data-a="cuenta-releer">Intentar otra vez</button></div>');
  }
  async function moverEnLista(desde, hasta) {
    if (!abierta || abierta.estado !== 'listo') return;
    const id = abierta.id, items = abierta.datos.items, it = items[desde]; if (!it) return;
    items.splice(desde, 1); items.splice(hasta, 0, it); verL++; pintarListas();   // se ve de inmediato; el agente lo confirma
    const r = await lorden('POST', `/listas/propia/${id}/mover`, { uid: it.uid, a: hasta });
    if (r && abierta && abierta.id === id) { abierta = { id, origen: 'propia', estado: 'listo', datos: r }; verL++; pintarListas(); }
    else if (!r) recargarAbierta();
  }
  async function quitarDeLista(i) {
    if (!abierta || abierta.estado !== 'listo') return;
    const id = abierta.id, it = abierta.datos.items[i]; if (!it) return;
    abierta.datos.items.splice(i, 1); verL++; pintarListas();
    const r = await lorden('POST', `/listas/propia/${id}/quitar`, { uid: it.uid });
    if (r && abierta && abierta.id === id) { abierta = { id, origen: 'propia', estado: 'listo', datos: r }; verL++; pintarListas(); }
    else if (!r) recargarAbierta();
  }
  async function reproducirLista(aleatorio) {
    if (!abierta || abierta.estado !== 'listo') return;
    const d = abierta.datos;
    // Confirmado por Wilo (23 nov 2026): con cola pendiente, la app pregunta antes de reemplazarla.
    if (pendientes().length && !await confirmar({ titulo: '¿Cambiar lo que sigue por esta lista?', texto: 'Lo que suena se corta.', boton: 'Cambiar' })) return;
    if (await orden('POST', '/listas/reproducir', { origen: abierta.origen || 'propia', id: d.id, modo: 'ahora', aleatorio }, 120000)) toast('Prometeo', 'Suena en unos segundos');
  }
  async function listaAlFinal() {
    if (!abierta || abierta.estado !== 'listo') return;
    const d = abierta.datos;
    if (await orden('POST', '/listas/reproducir', { origen: abierta.origen || 'propia', id: d.id, modo: 'final', aleatorio: false }, 120000)) toast('Cola de Prometeo', `${d.items.length === 1 ? 'Se agregó' : 'Se agregaron'} ${nCanciones(d.items.length)}`);
  }
  async function menuLista() {
    if (!abierta || abierta.estado !== 'listo') return;
    if (abierta.origen === 'cuenta') { menuListaCuenta(); return; }
    const d = abierta.datos;
    const op = await elegirOpcion({
      titulo: d.nombre,
      opciones: [
        { id: 'ren', texto: 'Renombrar', icono: 'lista' },
        { id: 'borrar', texto: 'Borrar lista', sub: 'Se guarda en la papelera de Prometeo', icono: 'papelera', peligro: true }
      ]
    });
    if (op === 'ren') {
      const n = await pedirTexto({ titulo: 'Nombre de la lista', valor: d.nombre, boton: 'Guardar' });
      if (!n || n === d.nombre) return;
      const r = await lorden('POST', `/listas/propia/${d.id}/renombrar`, { nombre: n });
      if (r && abierta && abierta.id === d.id) { abierta = { id: d.id, origen: 'propia', estado: 'listo', datos: r }; verL++; pintarListas(); }
    } else if (op === 'borrar' && await confirmar({ titulo: `¿Borrar “${d.nombre}”?`, texto: 'Se guarda en la papelera de Prometeo.', boton: 'Borrar', peligro: true })) {
      if (await lorden('POST', `/listas/propia/${d.id}/borrar`)) { abierta = null; verL++; pintarListas(); toast('Listas', `“${d.nombre}” fue a la papelera`); }
    }
  }
  async function menuListaCuenta() {
    const d = abierta.datos, id = abierta.id;
    const op = await elegirOpcion({
      titulo: d.nombre,
      opciones: [
        { id: 'copiar', texto: 'Copiar a mis listas', sub: 'Para editarla en la radio; la de YouTube no cambia', icono: 'nuevo' },
        { id: 'actualizar', texto: 'Actualizar', sub: 'Volver a leerla en YouTube', icono: 'actualizar' }
      ]
    });
    if (op === 'copiar') copiarAMisListas();
    else if (op === 'actualizar') abrirLista(id, 'cuenta', true);
  }
  // «Copiar a mis listas»: crea una lista propia con el mismo nombre y las mismas canciones (POST /listas/propia, agente 0.1.9+).
  async function copiarAMisListas() {
    if (!abierta || abierta.origen !== 'cuenta' || abierta.estado !== 'listo') return;
    const d = abierta.datos;
    if (!d.items.length) { toast('Listas', 'Esta lista no tiene canciones que copiar'); return; }
    const nombre = String(d.nombre || 'Lista de YouTube').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Lista de YouTube';
    const l = await lorden('POST', '/listas/propia', { nombre, items: d.items.map(soloItem) });
    if (l) toast('Listas', 'Copiada a tus listas');
  }
  async function nuevaLista() {
    const nombre = await pedirTexto({ titulo: 'Nueva lista', marca: 'Nombre de la lista', boton: 'Crear' });
    if (!nombre) return;
    const l = await lorden('POST', '/listas/propia', { nombre });
    if (l) { abierta = { id: l.id, origen: 'propia', estado: 'listo', datos: l }; verL++; pintarListas(); }
  }
  function clicListas(e) {
    const a = e.target.closest('[data-a]');
    if (a) {
      switch (a.dataset.a) {
        case 'nueva': nuevaLista(); break;
        case 'reintentar': pedirListas(true); break;
        case 'atras': abierta = null; verL++; pintarListas(); break;
        case 'menu': menuLista(); break;
        case 'reproducir': reproducirLista(false); break;
        case 'aleatorio': reproducirLista(true); break;
        case 'final': listaAlFinal(); break;
        case 'cuenta-actualizar': pedirCuenta(true, true); break;
        case 'cuenta-releer': if (abierta) abrirLista(abierta.id, 'cuenta', true); break;
      }
      return;
    }
    const fila = e.target.closest('.rem-lrow');
    if (fila) { abrirLista(fila.dataset.id, fila.dataset.origen === 'cuenta' ? 'cuenta' : 'propia'); return; }
    const q = e.target.closest('[data-quitar]');
    if (q) { quitarDeLista(+q.closest('.fila').dataset.i); return; }
    const c = e.target.closest('.rem-lcan');
    if (c && abierta && abierta.datos) { const it = abierta.datos.items[+c.dataset.i]; if (it) ofrecer(it); }
  }
  // «Agregar a una lista…» (hoja de cualquier canción): elige una lista propia o crea una nueva con esa canción.
  async function agregarALista(x) {
    const r = soloItem(x);
    if (listasP.estado !== 'listo') await pedirListas(true);
    if (listasP.estado === 'viejo') { toast('Listas', 'El agente de Prometeo todavía no guarda listas (versión 0.1.9)'); return; }
    if (listasP.estado !== 'listo') { toast('Listas', 'No pude leer tus listas'); return; }
    const op = await elegirOpcion({
      titulo: 'Agregar a una lista',
      opciones: [{ id: 'nueva', texto: 'Nueva lista…', icono: 'nuevo' }, ...listasP.propias.map(l => ({ id: 'l:' + l.id, texto: l.nombre, sub: nCanciones(l.total), icono: 'lista' }))]
    });
    if (!op) return;
    if (op === 'nueva') {
      const nombre = await pedirTexto({ titulo: 'Nueva lista', marca: 'Nombre de la lista', boton: 'Crear y agregar' });
      if (!nombre) return;
      const l = await lorden('POST', '/listas/propia', { nombre, items: [r] });
      if (l) toast('Listas', `Agregada a “${l.nombre}”`);
      return;
    }
    const id = op.slice(2), nombre = (listasP.propias.find(l => l.id === id) || {}).nombre || 'la lista';
    try { await api('POST', `/listas/propia/${id}/agregar`, r, 20000); toast('Listas', `Agregada a “${nombre}”`); }
    catch (e) { toast('Listas', e && e.codigo === 409 && /Ya está/.test(e.error || '') ? `Ya está en “${nombre}”` : mensaje(e)); }
  }
  // «Guardar como lista» (en A continuación): lo que suena más lo que falta por sonar.
  async function guardarCola() {
    if (!est || !est.actual) return;
    const items = [est.actual, ...pendientes()].map(soloItem);
    const nombre = await pedirTexto({ titulo: 'Guardar como lista', marca: 'Nombre de la lista', boton: 'Guardar' });
    if (!nombre) return;
    const l = await lorden('POST', '/listas/propia', { nombre, items });
    if (l) toast('Listas', `Guardada como “${l.nombre}” (${nCanciones(l.items.length)})`);
  }

  async function buscar(texto) {
    const q = String(texto || '').trim();
    if (!q && !buscando) { volverAlInicio(); return; }   // búsqueda vacía: de vuelta al inicio
    if (!q || buscando) return;
    ultimaBusqueda = q; buscando = true; resultados = null; pintarResultados(); pintarInicio(); pintarListas();
    try {
      const r = await api('GET', `/buscar?proveedor=youtube&q=${encodeURIComponent(q)}`, null, 30000);
      resultados = r.resultados || [];
    } catch (e) {
      resultados = [];
      toast('YouTube no respondió', e && e.codigo === 0 ? 'Prometeo no responde' : 'Intenta otra vez');
    } finally { buscando = false; pintarResultados(); pintarInicio(); pintarListas(); }
  }
  function volverAlInicio() {
    ultimaBusqueda = ''; resultados = null;
    const q = seccion.querySelector('input[name=q]'); if (q) q.value = '';
    pintarResultados(); pintarInicio(); pintarListas();
    if (vista === 'inicio') pedirInicio(); else pedirVistaListas();
  }
  function pintarResultados() {
    const c = seccion.querySelector('.rem-res');
    if (!c) return;
    if (buscando) { c.innerHTML = '<p class="rem-nota">Buscando…</p>'; return; }
    if (resultados == null) { c.innerHTML = ''; return; }
    const volver = '<button type="button" class="boton chico rem-volver" data-a="inicio">Volver</button>';
    if (!resultados.length) { c.innerHTML = `<p class="rem-nota">No hay resultados.</p><div class="rem-volver-caja">${volver}</div>`; return; }
    c.innerHTML = `<div class="rem-volver-caja">${volver}</div>` + resultados.map((r, i) => filaItem(r, `data-i="${i}"`)).join('');
  }
  function clicResultado(e) {
    if (e.target.closest('[data-a=inicio]')) { volverAlInicio(); return; }
    const b = e.target.closest('.rem-r'); if (!b || !resultados) return;
    const r = resultados[+b.dataset.i];
    if (r) ofrecer(r);
  }
  // Hoja de opciones para un video que no está en la cola. Se manda sin `automatico` ni `uid`: lo puso el usuario.
  async function ofrecer(x) {
    const r = { proveedor: x.proveedor || 'youtube', id: x.id, titulo: x.titulo, autor: x.autor, duracion: x.duracion, miniatura: x.miniatura };
    const op = await elegirOpcion({
      titulo: r.titulo,
      opciones: [
        { id: 'ya', texto: 'Reproducir ahora', icono: 'play' },
        { id: 'sig', texto: 'A continuación', icono: 'sig_lista' },
        { id: 'fin', texto: 'Al final de la cola', icono: 'cola' },
        { id: 'lista', texto: 'Agregar a una lista…', icono: 'lista' }
      ]
    });
    if (!op) return;
    if (op === 'lista') { agregarALista(r); return; }
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
    // Cada bloque se redibuja solo si cambió; la cola, no mientras se arrastra una fila.
    const cont = est && est.actual && est.continuacion;
    const k = est ? JSON.stringify([pendientes().map(x => x.uid), !!est.actual, cont ? cont.id : '']) : '';
    const c = seccion.querySelector('.rem-colab');
    if (c && c.dataset.k !== k && !c.querySelector('.fila.arrastrando')) { c.dataset.k = k; pintarCola(); }
    const kr = est && est.actual ? est.actual.id + '|' + recsVigentes().map(x => x.id).join(',') : '';
    const cr = seccion.querySelector('.rem-recs');
    if (cr && cr.dataset.k !== kr) { cr.dataset.k = kr; pintarRecs(); }
    pintarInicio();
    pintarListas();
    if (visible) { if (vista === 'inicio') pedirInicio(); else pedirVistaListas(); }
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
