// Pestaña Reproductor (etapa 3): biblioteca con vistas, filtros, índice A–Z, buscador, detalle, listas y favoritos.
// Las pantallas de la etapa 2 (vacío, elegir carpeta, avance, volver a conectar) siguen igual y se muestran cuando no hay biblioteca que mostrar.
import { esc, num, tiempo, duracionLarga, ic, crearHoja, elegirOpcion, pedirTexto, confirmar, crearCaratulas, crearVirtual, ordenable, pulsacionLarga, empujar, cerrarItem } from './ui-comun.js?v=1';
import { crearAhoraSuena, crearCola } from './ui-ahora.js?v=1';
import { normalizar } from './biblioteca.js?v=2';

const VISTAS = [
  { id: 'canciones', n: 'Canciones', i: 'cancion' }, { id: 'albumes', n: 'Álbumes', i: 'album' }, { id: 'artistas', n: 'Artistas', i: 'artista' },
  { id: 'generos', n: 'Géneros', i: 'genero' }, { id: 'anios', n: 'Años', i: 'anio' }, { id: 'listas', n: 'Listas', i: 'lista' }, { id: 'favoritos', n: 'Favoritos', i: 'corazon' }
];
const ORDENES = {
  canciones: [['titulo', 'Título'], ['artista', 'Artista'], ['reciente', 'Recién agregadas']],
  favoritos: [['titulo', 'Título'], ['artista', 'Artista'], ['reciente', 'Recién agregadas']],
  albumes: [['nombre', 'Nombre'], ['artista', 'Artista'], ['anio', 'Año'], ['reciente', 'Recién agregados']],
  artistas: [['nombre', 'Nombre'], ['canciones', 'Más canciones']],
  generos: [['nombre', 'Nombre'], ['canciones', 'Más canciones']],
  anios: [['nuevo', 'Más nuevos primero'], ['viejo', 'Más viejos primero']],
  listas: [['nombre', 'Nombre'], ['reciente', 'Recién cambiadas']]
};
const col = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const ARTICULOS = /^(el|la|los|las|un|una|unos|unas|the|a|an)\s+/;
const letraDe = t => { const n = normalizar(t); const c = (n.replace(ARTICULOS, '') || n).replace(/^[^a-z0-9]+/, '').charAt(0).toUpperCase(); return c >= 'A' && c <= 'Z' ? c : '#'; };
const claveArtista = p => (p.artistaAlbum || p.artista || '').trim();
const nombreArtista = p => claveArtista(p) || 'Artista desconocido';
const cmpPista = (a, b) => (a.disco || 0) - (b.disco || 0) || (a.pista || 0) - (b.pista || 0) || col.compare(a.titulo, b.titulo);
const AZ = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function cuando(ms) {
  if (!ms) return '';
  const d = new Date(ms), hoy = new Date();
  const hora = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return 'hoy, ' + hora;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: d.getFullYear() === hoy.getFullYear() ? undefined : 'numeric' }) + ', ' + hora;
}
function duracionMs(ms) { const s = Math.round((ms || 0) / 1000); return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; }

export function crearReproductorUI({ seccion, biblioteca: bib, local, store, acciones = {}, toast = () => {}, version = '' }) {
  if (!seccion) return null;
  let faseVista = null, ocupado = false, modoLib = false, libListo = false;
  const cat = crearCaratulas(bib);
  const avisar = (t, s) => { try { toast(t, s); } catch { /* */ } };

  // ---------- Estado de la pantalla ----------
  const S = { vista: 'canciones', orden: { canciones: 'titulo', favoritos: 'titulo', albumes: 'nombre', artistas: 'nombre', generos: 'nombre', anios: 'nuevo', listas: 'nombre' }, anio: null, generos: [] };
  let detalle = null;      // { tipo, clave }
  let detItem = null;      // elemento de la pila de «atrás»
  let memo = null, verDatos = -1, listasCache = [];
  let guardarT = 0;
  const guardarVista = () => { clearTimeout(guardarT); guardarT = setTimeout(() => bib.guardarEstado('vista', { vista: S.vista, orden: S.orden, anio: S.anio, generos: S.generos }).catch(() => {}), 400); };

  // ---------- Pantallas de la etapa 2 ----------
  const lanzarEscaneo = async () => {
    try { await bib.escanear(); } catch (e) { bib.estado.error = (e && e.message) || 'No se pudo leer la carpeta'; pintar(true); }
  };
  async function elegir() {
    if (ocupado) return; ocupado = true;
    try { if (await bib.elegirCarpeta()) { ocupado = false; await lanzarEscaneo(); } }
    catch (e) { bib.estado.error = (e && e.message) || 'No se pudo abrir la carpeta'; pintar(true); }
    finally { ocupado = false; }
  }
  async function reconectar() {
    if (ocupado) return; ocupado = true;
    try {
      if (await bib.volverAConectar()) { ocupado = false; await lanzarEscaneo(); }
      else { bib.estado.error = 'No se dio el permiso. Toca «Volver a conectar» y acepta, o elige la carpeta otra vez.'; pintar(true); }
    } catch (e) { bib.estado.error = (e && e.message) || 'No se pudo volver a conectar'; pintar(true); }
    finally { ocupado = false; }
  }
  function htmlTarjeta(e) {
    const err = e.error ? `<p class="bib-error" role="alert">${esc(e.error)}</p>` : '';
    switch (e.fase) {
      case 'inicio':
        return '<h2>Reproductor</h2><p class="bib-txt">Leyendo tu biblioteca…</p>';
      case 'sin-carpeta':
        return `<span class="bib-icono">${ic('carpeta')}</span><h2>Tu música vive en este dispositivo</h2><p class="bib-txt">La app solo la lee; no la copia ni la sube a ningún lado.</p>${err}
          <button type="button" class="bib-btn principal" data-acc="elegir">Elegir carpeta de música</button>`;
      case 'permiso':
        return `<h2>No encuentro la carpeta de música</h2><p class="bib-txt">${e.carpeta ? `Carpeta guardada: <b>${esc(e.carpeta)}</b>. ` : ''}El navegador pide permiso otra vez para leerla.</p>${err}
          <button type="button" class="bib-btn principal" data-acc="reconectar">Volver a conectar</button>
          <button type="button" class="bib-btn" data-acc="elegir">Elegir otra carpeta</button>`;
      case 'escaneando':
        return `<h2>Leyendo tu música</h2>
          <p class="bib-txt" id="bibAvance" aria-live="polite"></p>
          <div class="bib-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="bibBarra"></i></div>
          <button type="button" class="bib-btn" data-acc="cancelar">Cancelar</button>`;
      case 'error':
        return `<h2>Reproductor</h2><p class="bib-error" role="alert">${esc(e.error || 'Algo salió mal')}</p>
          <button type="button" class="bib-btn principal" data-acc="reintentar">Reintentar</button>`;
      default: { // 'lista' sin canciones
        const u = e.ultimoEscaneo;
        const detalleTxt = u ? `Última actualización: ${cuando(u.fecha)} · ${num(u.nuevas)} nuevas, ${num(u.cambiadas || 0)} cambiadas, ${num(u.quitadas)} quitadas${u.errores ? ` · <span class="bib-aviso">${num(u.errores)} no se pudieron leer</span>` : ''} · ${duracionMs(u.duracionMs)}` : 'Aún no se ha escaneado.';
        return `<h2>Reproductor</h2><p class="bib-txt">La carpeta está conectada, pero la biblioteca está vacía.</p>
          <p class="bib-txt bib-chico">${e.carpeta ? `Carpeta: ${esc(e.carpeta)}<br>` : ''}${detalleTxt}</p>${err}
          <button type="button" class="bib-btn principal" data-acc="actualizar">Escanear la carpeta</button>
          <button type="button" class="bib-btn" data-acc="elegir">Cambiar carpeta</button>`;
      }
    }
  }

  // ---------- Datos derivados ----------
  function derivar() {
    const clave = bib.cache.version + '|' + JSON.stringify(S.anio) + '|' + S.generos.join('\u0001');
    if (memo && memo.clave === clave) return memo;
    let L = bib.cache.pistas;
    if (S.anio) L = L.filter(p => (p.anio || 0) >= S.anio.desde && (p.anio || 0) <= S.anio.hasta);
    if (S.generos.length) { const g = new Set(S.generos); L = L.filter(p => g.has(p.genero || '')); }
    memo = { clave, L, albumes: null, artistas: null, generos: null, anios: null };
    return memo;
  }
  const tieneCar = p => { const a = bib.cache.albumes.get(p.albumId); return !!(a && a.tieneCaratula); };
  function agrupar(L, clavePista, hacer) {
    const m = new Map();
    for (const p of L) { const k = clavePista(p); let g = m.get(k); if (!g) { g = hacer(k, p); m.set(k, g); } g.n++; g.dur += p.duracion || 0; g.pistas.push(p); }
    return [...m.values()];
  }
  function listaAlbumes() {
    const d = derivar(); if (d.albumes) return d.albumes;
    const a = agrupar(d.L, p => p.albumId, (k, p) => ({ clave: k, nombre: p.album || 'Sin álbum', artista: nombreArtista(p), anio: 0, n: 0, dur: 0, pistas: [], albumId: k, reciente: 0 }));
    for (const g of a) { g.anio = Math.min(...g.pistas.map(p => p.anio || 9999)); if (g.anio === 9999) g.anio = 0; g.reciente = Math.max(...g.pistas.map(p => p.agregado || 0)); g.tiene = tieneCar(g.pistas[0]); }
    const o = S.orden.albumes;
    a.sort((x, y) => o === 'artista' ? col.compare(x.artista, y.artista) || col.compare(x.nombre, y.nombre) : o === 'anio' ? (x.anio || 9999) - (y.anio || 9999) || col.compare(x.nombre, y.nombre) : o === 'reciente' ? y.reciente - x.reciente : col.compare(x.nombre, y.nombre));
    return (d.albumes = a);
  }
  function listaArtistas() {
    const d = derivar(); if (d.artistas) return d.artistas;
    const a = agrupar(d.L, p => normalizar(claveArtista(p)), (k, p) => ({ clave: k, nombre: nombreArtista(p), n: 0, dur: 0, pistas: [] }));
    for (const g of a) {
      const albs = new Set(g.pistas.map(p => p.albumId)); g.albumes = albs.size;
      const conCar = g.pistas.find(tieneCar); g.albumId = conCar ? conCar.albumId : ''; g.tiene = !!conCar;
    }
    a.sort((x, y) => S.orden.artistas === 'canciones' ? y.n - x.n || col.compare(x.nombre, y.nombre) : col.compare(x.nombre, y.nombre));
    return (d.artistas = a);
  }
  function listaGeneros() {
    const d = derivar(); if (d.generos) return d.generos;
    const a = agrupar(d.L, p => p.genero || '', (k, p) => ({ clave: k, nombre: k || 'Sin género', n: 0, dur: 0, pistas: [] }));
    a.sort((x, y) => S.orden.generos === 'canciones' ? y.n - x.n || col.compare(x.nombre, y.nombre) : (x.clave ? 0 : 1) - (y.clave ? 0 : 1) || col.compare(x.nombre, y.nombre));
    return (d.generos = a);
  }
  function listaAnios() {
    const d = derivar(); if (d.anios) return d.anios;
    const a = agrupar(d.L, p => p.anio || 0, (k) => ({ clave: k, nombre: k ? String(k) : 'Sin año', n: 0, dur: 0, pistas: [] }));
    a.sort((x, y) => (x.clave ? 0 : 1) - (y.clave ? 0 : 1) || (S.orden.anios === 'viejo' ? x.clave - y.clave : y.clave - x.clave));
    return (d.anios = a);
  }
  function pistasOrdenadas(L, orden) {
    const c = L.slice();
    if (orden === 'artista') c.sort((a, b) => col.compare(nombreArtista(a), nombreArtista(b)) || col.compare(a.album, b.album) || cmpPista(a, b));
    else if (orden === 'reciente') c.sort((a, b) => (b.agregado || 0) - (a.agregado || 0) || col.compare(a.titulo, b.titulo));
    else c.sort((a, b) => col.compare(a.orden || a.titulo, b.orden || b.titulo));
    return c;
  }
  const clavesOrden = { titulo: p => letraDe(p.titulo), artista: p => letraDe(nombreArtista(p)) };

  // ---------- Esqueleto de la biblioteca ----------
  const lib = document.createElement('div');
  lib.className = 'lib';
  lib.innerHTML = `
    <nav class="lib-vistas" aria-label="Vistas de la biblioteca">${VISTAS.map(v => `<button type="button" class="lib-vista" data-vista="${v.id}">${ic(v.i)}<span>${v.n}</span></button>`).join('')}</nav>
    <section class="lib-centro">
      <div class="lib-maqueta" hidden>Maqueta con datos de ejemplo: nada de esto es tu música.</div>
      <div class="lib-herr">
        <button type="button" data-a="buscar" aria-label="Buscar" title="Buscar">${ic('buscar')}</button>
        <button type="button" data-a="anio" aria-label="Filtrar por año" title="Año">${ic('anio')}</button>
        <button type="button" data-a="genero" aria-label="Filtrar por género" title="Género">${ic('genero')}</button>
        <button type="button" data-a="orden" aria-label="Ordenar" title="Orden">${ic('orden')}</button>
        <button type="button" data-a="mas" aria-label="Más opciones" title="Más">${ic('mas')}</button>
      </div>
      <div class="lib-buscar" hidden><label class="campo">${ic('buscar')}<input type="search" placeholder="Canciones, álbumes, artistas" autocomplete="off" spellcheck="false" enterkeyhint="search"></label><button type="button" class="boton chico" data-a="buscar-x">Cancelar</button></div>
      <div class="lib-fichas" hidden></div>
      <div class="lib-cuerpo">
        <div class="lib-scroll"><div class="lib-plano"></div></div>
        <div class="lib-az" hidden></div><div class="lib-burbuja" hidden></div>
        <div class="lib-resultados" hidden></div>
      </div>
      <div class="lib-detalle" hidden></div>
    </section>
    <aside class="lib-cola" aria-label="Cola"></aside>`;
  const $q = s => lib.querySelector(s);
  const scroll = $q('.lib-scroll'), plano = $q('.lib-plano'), azEl = $q('.lib-az'), burbuja = $q('.lib-burbuja');
  const fichas = $q('.lib-fichas'), buscarBox = $q('.lib-buscar'), inputBuscar = buscarBox.querySelector('input');
  const resultados = $q('.lib-resultados'), detEl = $q('.lib-detalle'), herr = $q('.lib-herr');
  let listaCanc = [];      // canciones que muestra la vista actual (Canciones o Favoritos)
  let virtual = null;
  let buscando = false;

  // ---------- Filas ----------
  const marca = p => (local && local.pista && local.pista.ruta === p.ruta) ? ' suena' : '';
  function filaPista(p, { top = null, numero = null, asa = false, i = null } = {}) {
    const art = numero != null ? `<span class="fila-n">${esc(numero || '·')}</span>` : `<span class="fila-art">${cat.html({ albumId: p.albumId, tieneCaratula: !p.faltante && tieneCar(p), inicial: p.titulo })}</span>`;
    const sub = p.faltante ? 'No encontrada' : [nombreArtista(p) === 'Artista desconocido' && !p.artista ? 'Artista desconocido' : nombreArtista(p), p.album].filter(Boolean).join(' · ');
    return `<div class="fila${marca(p)}${p.favorito ? ' es-fav' : ''}${p.faltante ? ' falta' : ''}${numero != null ? ' numerada' : ''}" data-r="${esc(p.ruta)}"${i != null ? ` data-i="${i}"` : ''}${top != null ? ` style="top:${top}px"` : ''}>
      ${asa ? `<button type="button" class="fila-asa" data-asa aria-label="Arrastrar para mover">${ic('asa')}</button>` : ''}
      ${art}
      <span class="fila-txt"><b>${esc(p.titulo)}</b><small>${esc(sub)}</small></span>
      <i class="eq" aria-hidden="true"><s></s><s></s><s></s></i>
      <span class="fila-fav" aria-hidden="true">${ic('corazon')}</span>
      <span class="fila-t">${esc(tiempo(p.duracion))}</span>
      <button type="button" class="fila-mas" data-mas aria-label="Más opciones de ${esc(p.titulo)}">${ic('mas')}</button>
    </div>`;
  }
  const filaGrupo = (g, attr, extra = '') => `<button type="button" class="fila fila-grupo" ${attr} data-ini="${esc(g.ini || '')}">
      <span class="fila-art">${g.icono ? `<span class="ficha" style="--h:${(g.nombre.length * 47) % 360}"><b>${ic(g.icono)}</b></span>` : cat.html({ albumId: g.albumId, tieneCaratula: g.tiene, inicial: g.nombre })}</span>
      <span class="fila-txt"><b>${esc(g.nombre)}</b><small>${esc(g.sub)}</small></span>${extra}<span class="fila-ir">${ic('derecha')}</span></button>`;
  const subCuenta = g => `${num(g.n)} ${g.n === 1 ? 'canción' : 'canciones'}`;

  // ---------- Vista principal ----------
  function lleno(msg, btn = '') { return `<div class="vacio"><p>${msg}</p>${btn}</div>`; }
  const hayFiltros = () => !!S.anio || S.generos.length > 0;
  const quitarFiltrosBtn = () => hayFiltros() ? '<button type="button" class="boton" data-a="quitar-filtros">Quitar filtros</button>' : '';

  function pintarVista() {
    if (!libListo) return;
    const v = S.vista;
    lib.dataset.vista = v;
    lib.querySelectorAll('.lib-vista').forEach(b => { const on = b.dataset.vista === v; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    let letras = null;
    if (v === 'canciones' || v === 'favoritos') {
      let L = derivar().L;
      if (v === 'favoritos') L = L.filter(p => p.favorito);
      listaCanc = pistasOrdenadas(L, S.orden[v]);
      plano.hidden = true; virtual.esp.hidden = false;
      virtual.poner(listaCanc.length);
      if (!listaCanc.length) {
        plano.hidden = false; virtual.esp.hidden = true;
        plano.innerHTML = v === 'favoritos' && !hayFiltros() ? lleno(`Todavía no tienes favoritas.<br>Toca el corazón en «Ahora suena» o en el menú ⋯ de una canción.`) : lleno('No hay canciones con estos filtros.', quitarFiltrosBtn());
      } else {
        const f = clavesOrden[S.orden[v]];
        if (f) { letras = new Map(); listaCanc.forEach((p, i) => { const l = f(p); if (!letras.has(l)) letras.set(l, i); }); }
      }
    } else {
      virtual.esp.hidden = true; plano.hidden = false; virtual.poner(0);
      if (v === 'albumes') {
        const a = listaAlbumes();
        const porNombre = S.orden.albumes === 'nombre', porArtista = S.orden.albumes === 'artista';
        plano.innerHTML = a.length ? `<div class="rejilla">${a.map(g => { g.ini = porNombre ? letraDe(g.nombre) : porArtista ? letraDe(g.artista) : ''; return `<button type="button" class="tarjeta" data-album="${esc(g.clave)}" data-ini="${g.ini}">
          <span class="tarjeta-art">${cat.html({ albumId: g.albumId, tieneCaratula: g.tiene, inicial: g.nombre, tam: 'grande', clase: 'cuadro' })}</span><b>${esc(g.nombre)}</b><small>${esc(g.artista)}${g.anio ? ' · ' + g.anio : ''}</small></button>`; }).join('')}</div>` : lleno('No hay álbumes con estos filtros.', quitarFiltrosBtn());
        if (a.length && (porNombre || porArtista)) letras = true;
      } else if (v === 'artistas') {
        const a = listaArtistas();
        plano.innerHTML = a.length ? a.map(g => { g.ini = S.orden.artistas === 'nombre' ? letraDe(g.nombre) : ''; g.sub = `${num(g.albumes)} ${g.albumes === 1 ? 'álbum' : 'álbumes'} · ${subCuenta(g)}`; return filaGrupo(g, `data-artista="${esc(g.clave)}"`); }).join('') : lleno('No hay artistas con estos filtros.', quitarFiltrosBtn());
        if (a.length && S.orden.artistas === 'nombre') letras = true;
      } else if (v === 'generos') {
        const a = listaGeneros();
        plano.innerHTML = a.length ? a.map(g => { g.sub = subCuenta(g); g.icono = 'genero'; return filaGrupo(g, `data-genero="${esc(g.clave)}"`); }).join('') : lleno('No hay géneros con estos filtros.', quitarFiltrosBtn());
      } else if (v === 'anios') {
        const a = listaAnios();
        plano.innerHTML = a.length ? a.map(g => { g.sub = subCuenta(g); g.icono = 'anio'; return filaGrupo(g, `data-anio="${g.clave}"`); }).join('') : lleno('No hay años con estos filtros.', quitarFiltrosBtn());
      } else if (v === 'listas') {
        const ls = listasCache.slice().sort((x, y) => S.orden.listas === 'reciente' ? (y.modificada || 0) - (x.modificada || 0) : col.compare(x.nombre, y.nombre));
        plano.innerHTML = `<button type="button" class="fila fila-grupo nueva" data-a="nueva-lista"><span class="fila-art"><span class="ficha nueva-ficha"><b>${ic('nuevo')}</b></span></span><span class="fila-txt"><b>Nueva lista</b><small>Junta canciones a tu gusto</small></span></button>` +
          ls.map(l => filaGrupo({ nombre: l.nombre, sub: `${num(l.rutas.length)} ${l.rutas.length === 1 ? 'canción' : 'canciones'}`, icono: 'lista' }, `data-lista="${l.id}"`)).join('');
      }
    }
    azPintar(letras);
    scroll.scrollTop = 0;
    cat.cargar(plano);
    if (virtual) cat.cargar(virtual.esp);
    scroll.classList.toggle('vacia', !plano.hidden && !!plano.querySelector('.vacio'));
  }
  // Índice A–Z
  let azMapa = null;
  function azPintar(letras) {
    azMapa = null;
    if (!letras) { azEl.hidden = true; return; }
    let presentes;
    if (letras === true) { presentes = new Map(); plano.querySelectorAll('[data-ini]').forEach(el => { const l = el.dataset.ini; if (l && !presentes.has(l)) presentes.set(l, el); }); }
    else presentes = letras;
    const lista = AZ.filter(l => presentes.has(l));
    if (lista.length < 3) { azEl.hidden = true; return; }
    azMapa = { presentes, lista };
    azEl.innerHTML = lista.map(l => `<span data-l="${l}">${l}</span>`).join('');
    azEl.hidden = false;
  }
  function azIr(l) {
    if (!azMapa) return;
    const x = azMapa.presentes.get(l); if (x == null) return;
    if (typeof x === 'number') virtual.irA(x); else scroll.scrollTo({ top: Math.max(0, x.offsetTop - 4) });
  }
  function azEvento(e) {
    if (!azMapa) return;
    const r = azEl.getBoundingClientRect();
    const f = Math.max(0, Math.min(0.999, (e.clientY - r.top) / Math.max(1, r.height)));
    const l = azMapa.lista[Math.floor(f * azMapa.lista.length)];
    burbuja.textContent = l; burbuja.hidden = false; burbuja.style.top = Math.max(20, Math.min(r.height - 20, e.clientY - r.top + (azEl.offsetTop || 0))) + 'px';
    azIr(l);
  }
  azEl.addEventListener('pointerdown', e => { e.preventDefault(); azEl.setPointerCapture(e.pointerId); azEl.classList.add('activo'); azEvento(e); });
  azEl.addEventListener('pointermove', e => { if (azEl.hasPointerCapture(e.pointerId)) azEvento(e); });
  for (const ev of ['pointerup', 'pointercancel']) azEl.addEventListener(ev, () => { azEl.classList.remove('activo'); setTimeout(() => { burbuja.hidden = true; }, 350); });

  // ---------- Fichas de filtros activos ----------
  function etiquetaAnio() { const a = S.anio; if (!a) return ''; return a.desde === a.hasta ? (a.desde ? String(a.desde) : 'Sin año') : `${a.desde}–${a.hasta}`; }
  function pintarFichas() {
    if (!libListo) return;
    const f = [];
    if (S.anio) f.push(`<button type="button" class="ficha-filtro" data-quitar="anio">${esc(etiquetaAnio())}${ic('cerrar')}</button>`);
    for (const g of S.generos) f.push(`<button type="button" class="ficha-filtro" data-quitar="g:${esc(g)}">${esc(g || 'Sin género')}${ic('cerrar')}</button>`);
    fichas.innerHTML = f.join(''); fichas.hidden = !f.length;
    lib.querySelector('[data-a="anio"]').classList.toggle('on', !!S.anio);
    lib.querySelector('[data-a="genero"]').classList.toggle('on', S.generos.length > 0);
  }

  // ---------- Hojas de filtro y orden ----------
  function contarPor(clavePista, filtrarGenero) {
    const m = new Map(); let L = bib.cache.pistas;
    if (filtrarGenero && S.generos.length) { const g = new Set(S.generos); L = L.filter(p => g.has(p.genero || '')); }
    for (const p of L) { const k = clavePista(p); m.set(k, (m.get(k) || 0) + 1); }
    return m;
  }
  function abrirFiltroAnio() {
    const cuentas = contarPor(p => p.anio || 0, true);
    const anios = [...cuentas.keys()].filter(Boolean).sort((a, b) => b - a);
    if (!anios.length) { avisar('Sin años', 'Tus canciones no traen año'); return; }
    const decadas = [...new Set(anios.map(a => Math.floor(a / 10) * 10))];
    const h = crearHoja({ titulo: 'Año', clase: 'hoja-menu', html: '' });
    const paso1 = () => {
      const total = [...cuentas.values()].reduce((s, n) => s + n, 0);
      h.cuerpo.innerHTML = `<ul class="menu"><li><button type="button" class="menu-op${!S.anio ? ' on' : ''}" data-todos><span class="menu-sin"></span><span class="menu-txt"><b>Todos</b><small>${num(total)} canciones</small></span>${!S.anio ? ic('check', 'menu-ok') : ''}</button></li>` +
        decadas.map(d => { const n = anios.filter(a => Math.floor(a / 10) * 10 === d).reduce((s, a) => s + cuentas.get(a), 0); return `<li><button type="button" class="menu-op" data-decada="${d}"><span class="menu-sin"></span><span class="menu-txt"><b>${d}s</b><small>${num(n)} canciones</small></span>${ic('derecha')}</button></li>`; }).join('') +
        (cuentas.get(0) ? `<li><button type="button" class="menu-op" data-anio="0"><span class="menu-sin"></span><span class="menu-txt"><b>Sin año</b><small>${num(cuentas.get(0))} canciones</small></span></button></li>` : '') + '</ul>';
    };
    const paso2 = d => {
      const ys = anios.filter(a => Math.floor(a / 10) * 10 === d);
      const n = ys.reduce((s, a) => s + cuentas.get(a), 0);
      h.cuerpo.innerHTML = `<button type="button" class="menu-atras" data-atras>${ic('atras')} ${d}s</button><ul class="menu"><li><button type="button" class="menu-op" data-rango="${d}"><span class="menu-sin"></span><span class="menu-txt"><b>Toda la década</b><small>${num(n)} canciones</small></span></button></li>` +
        ys.map(a => `<li><button type="button" class="menu-op${S.anio && S.anio.desde === a && S.anio.hasta === a ? ' on' : ''}" data-anio="${a}"><span class="menu-sin"></span><span class="menu-txt"><b>${a}</b><small>${num(cuentas.get(a))} canciones</small></span></button></li>`).join('') + '</ul>';
    };
    paso1();
    h.cuerpo.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-todos')) { S.anio = null; aplicarFiltros(); h.cerrar(); }
      else if (b.dataset.decada) paso2(+b.dataset.decada);
      else if (b.hasAttribute('data-atras')) paso1();
      else if (b.dataset.rango) { const d = +b.dataset.rango; S.anio = { desde: d, hasta: d + 9 }; aplicarFiltros(); h.cerrar(); }
      else if (b.dataset.anio != null) { const a = +b.dataset.anio; S.anio = { desde: a, hasta: a }; aplicarFiltros(); h.cerrar(); }
    });
  }
  function abrirFiltroGenero() {
    const cuentas = contarPor(p => p.genero || '', false);
    if (!cuentas.size || (cuentas.size === 1 && cuentas.has(''))) { avisar('Sin géneros', 'Tus canciones no traen género'); return; }
    const gs = [...cuentas.keys()].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || col.compare(a, b));
    const sel = new Set(S.generos);
    const h = crearHoja({
      titulo: 'Género', clase: 'hoja-menu',
      html: `<ul class="menu">${gs.map((g, i) => `<li><button type="button" class="menu-op${sel.has(g) ? ' on' : ''}" data-i="${i}"><span class="menu-caja">${ic('check')}</span><span class="menu-txt"><b>${esc(g || 'Sin género')}</b><small>${num(cuentas.get(g))} canciones</small></span></button></li>`).join('')}</ul>
        <div class="botones pie"><button type="button" class="boton" data-limpiar>Quitar filtro</button><button type="button" class="boton principal" data-listo>Listo</button></div>`
    });
    h.cuerpo.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.i != null) { const g = gs[+b.dataset.i]; if (sel.has(g)) sel.delete(g); else sel.add(g); b.classList.toggle('on', sel.has(g)); }
      else if (b.hasAttribute('data-limpiar')) { S.generos = []; aplicarFiltros(); h.cerrar(); }
      else if (b.hasAttribute('data-listo')) { S.generos = gs.filter(g => sel.has(g)); aplicarFiltros(); h.cerrar(); }
    });
  }
  async function abrirOrden() {
    const v = S.vista, ops = ORDENES[v];
    const r = await elegirOpcion({ titulo: 'Ordenar por', opciones: ops.map(([id, t]) => ({ id, texto: t, activo: S.orden[v] === id })) });
    if (r && r !== S.orden[v]) { S.orden[v] = r; memo = null; guardarVista(); pintarVista(); }
  }
  function aplicarFiltros() { memo = null; guardarVista(); pintarFichas(); pintarVista(); if (buscando) buscar(); }

  // ---------- Reproducir y menús de canciones ----------
  const rutasDe = arr => arr.filter(p => !p.faltante).map(p => p.ruta);
  function reproducirDe(arr, ruta, opciones) {
    const rutas = rutasDe(arr), i = rutas.indexOf(ruta);
    if (i < 0) { avisar('No encontrada', 'Esa canción ya no está en la carpeta'); return; }
    acciones.reproducir(rutas, i, opciones);
  }
  function reproducirTodo(arr, aleatorio) {
    const rutas = rutasDe(arr); if (!rutas.length) return;
    if (aleatorio) acciones.reproducirAleatorio(rutas); else acciones.reproducir(rutas, 0, { aleatorio: false });
  }
  function engancharPistas(cont, getLista) {
    cont.addEventListener('click', e => {
      const f = e.target.closest('.fila[data-r]'); if (!f || !cont.contains(f) || f.classList.contains('deslizando')) return;
      if (e.target.closest('[data-asa]')) return;
      if (e.target.closest('[data-mas]')) { menuPista(f.dataset.r); return; }
      reproducirDe(getLista(), f.dataset.r);
    });
    pulsacionLarga(cont, '.fila[data-r]', f => menuPista(f.dataset.r));
  }
  function alternarFavorito(p) {
    p.favorito = p.favorito ? 0 : 1;
    bib.guardarPistas([p]).catch(() => {});
    lib.querySelectorAll(`.fila[data-r]`).forEach(f => { if (f.dataset.r === p.ruta) f.classList.toggle('es-fav', !!p.favorito); });
    if (libListo && S.vista === 'favoritos' && !detalle && !buscando) pintarVista();
    avisar(p.favorito ? 'Favorita' : 'Quitada de favoritos', p.titulo);
  }
  async function menuPista(ruta) {
    const p = bib.pista(ruta); if (!p) return;
    const ops = [
      { id: 'sig', texto: 'Reproducir a continuación', icono: 'sig_lista' },
      { id: 'fin', texto: 'Agregar al final de la cola', icono: 'cola' },
      { id: 'lista', texto: 'Agregar a lista…', icono: 'lista' },
      { id: 'fav', texto: p.favorito ? 'Quitar de favoritos' : 'Favorito', icono: 'corazon', activo: !!p.favorito }
    ];
    if (p.album) ops.push({ id: 'album', texto: 'Ir al álbum', sub: p.album, icono: 'album' });
    if (p.artista || p.artistaAlbum) ops.push({ id: 'artista', texto: 'Ir al artista', sub: nombreArtista(p), icono: 'artista' });
    const r = await elegirOpcion({ titulo: p.titulo, opciones: ops });
    if (r === 'sig') { acciones.enCola('sig', [ruta]); avisar('A continuación', p.titulo); }
    else if (r === 'fin') { acciones.enCola('fin', [ruta]); avisar('Al final de la cola', p.titulo); }
    else if (r === 'lista') agregarALista([ruta]);
    else if (r === 'fav') alternarFavorito(p);
    else if (r === 'album') abrirDetalle('album', p.albumId);
    else if (r === 'artista') abrirDetalle('artista', normalizar(claveArtista(p)));
  }

  // ---------- Listas ----------
  async function cargarListas() { try { listasCache = await bib.listas(); } catch { listasCache = []; } }
  async function nuevaLista(rutas = []) {
    const nombre = await pedirTexto({ titulo: 'Nueva lista', marca: 'Nombre de la lista', boton: 'Crear' });
    if (!nombre) return null;
    const l = { nombre, creada: Date.now(), modificada: Date.now(), rutas: rutas.slice() };
    l.id = await bib.guardarLista(l);
    await cargarListas();
    if (libListo && S.vista === 'listas' && !detalle) pintarVista();
    return l;
  }
  async function agregarALista(rutas) {
    await cargarListas();
    const ops = [{ id: 'nueva', texto: 'Nueva lista…', icono: 'nuevo' }, ...listasCache.map(l => ({ id: String(l.id), texto: l.nombre, sub: `${num(l.rutas.length)} canciones`, icono: 'lista' }))];
    const r = await elegirOpcion({ titulo: 'Agregar a lista', opciones: ops });
    if (!r) return;
    if (r === 'nueva') { const l = await nuevaLista(rutas); if (l) avisar('Lista creada', l.nombre); return; }
    const l = listasCache.find(x => String(x.id) === r); if (!l) return;
    l.rutas = l.rutas.concat(rutas); l.modificada = Date.now();
    await bib.guardarLista(l);
    avisar('Agregada', l.nombre);
    if (detalle && detalle.tipo === 'lista' && String(detalle.clave) === r) pintarDetalle();
  }
  async function guardarYRefrescarLista(l) { l.modificada = Date.now(); await bib.guardarLista(l); pintarDetalle(); }

  // ---------- Detalle ----------
  function datosDetalle() {
    const { tipo, clave } = detalle, todas = bib.cache.pistas;
    if (tipo === 'album') {
      const L = todas.filter(p => p.albumId === clave).sort(cmpPista); if (!L.length) return null;
      const a = bib.cache.albumes.get(clave) || {}, p0 = L[0];
      return { titulo: p0.album || 'Sin álbum', sub: nombreArtista(p0) + (a.anio ? ' · ' + a.anio : ''), pistas: L, albumId: clave, tiene: !!a.tieneCaratula, numerada: true, kind: 'álbum' };
    }
    if (tipo === 'artista') {
      const L = todas.filter(p => normalizar(claveArtista(p)) === clave).sort((x, y) => (x.anio || 9999) - (y.anio || 9999) || col.compare(x.album, y.album) || cmpPista(x, y)); if (!L.length) return null;
      const albs = new Set(L.map(p => p.albumId)), conCar = L.find(tieneCar);
      return { titulo: nombreArtista(L[0]), sub: `${num(albs.size)} ${albs.size === 1 ? 'álbum' : 'álbumes'}`, pistas: L, albumId: conCar ? conCar.albumId : '', tiene: !!conCar, kind: 'artista' };
    }
    if (tipo === 'genero') {
      const L = todas.filter(p => (p.genero || '') === clave).sort((x, y) => col.compare(nombreArtista(x), nombreArtista(y)) || col.compare(x.album, y.album) || cmpPista(x, y)); if (!L.length) return null;
      return { titulo: clave || 'Sin género', sub: 'Género', pistas: L, albumId: '', tiene: false, icono: 'genero', kind: 'género' };
    }
    if (tipo === 'anio') {
      const L = todas.filter(p => (p.anio || 0) === +clave).sort((x, y) => col.compare(nombreArtista(x), nombreArtista(y)) || cmpPista(x, y)); if (!L.length) return null;
      return { titulo: +clave ? String(clave) : 'Sin año', sub: 'Año', pistas: L, albumId: '', tiene: false, icono: 'anio', kind: 'año' };
    }
    if (tipo === 'lista') {
      const l = listasCache.find(x => String(x.id) === String(clave)); if (!l) return null;
      const L = l.rutas.map(r => local ? local.infoDe(r) : (bib.pista(r) || { ruta: r, titulo: r, faltante: true }));
      return { titulo: l.nombre, sub: 'Lista', pistas: L, albumId: '', tiene: false, icono: 'lista', lista: l, kind: 'lista' };
    }
    return null;
  }
  function pintarDetalle() {
    if (!detalle) return;
    const d = datosDetalle();
    if (!d) { cerrarDetalleDirecto(); return; }
    const dur = d.pistas.reduce((s, p) => s + (p.duracion || 0), 0);
    const meta = `${num(d.pistas.length)} ${d.pistas.length === 1 ? 'canción' : 'canciones'}${dur ? ' · ' + duracionLarga(dur) : ''}`;
    const art = d.icono ? `<span class="ficha grande" style="--h:${(d.titulo.length * 53) % 360}"><b>${ic(d.icono)}</b></span>` : cat.html({ albumId: d.albumId, tieneCaratula: d.tiene, inicial: d.titulo, tam: 'grande', clase: 'grande' });
    const esLista = d.kind === 'lista';
    detEl.innerHTML = `<header class="det-barra"><button type="button" class="ic-btn" data-a="det-atras" aria-label="Volver">${ic('atras')}</button><b class="det-mini">${esc(d.titulo)}</b>${esLista ? `<button type="button" class="ic-btn" data-a="det-mas" aria-label="Más opciones de la lista">${ic('mas')}</button>` : '<span class="det-hueco"></span>'}</header>
      <div class="det-scroll"><div class="det-cab"><div class="det-arte">${art}</div><div class="det-info"><h2>${esc(d.titulo)}</h2><p class="det-sub">${esc(d.sub)}</p><p class="det-meta">${meta}</p>
        <div class="det-botones"><button type="button" class="boton principal" data-a="det-play">${ic('play')}Reproducir</button><button type="button" class="boton" data-a="det-azar">${ic('aleatorio')}Aleatorio</button></div></div></div>
        <div class="det-pistas${esLista ? ' con-orden' : ''}">${d.pistas.length ? d.pistas.map((p, i) => filaPista(p, { numero: d.numerada ? (p.pista || '') : null, asa: esLista, i })).join('') : '<p class="vacio-txt">Esta lista está vacía. Agrega canciones desde el menú ⋯ de cualquier canción.</p>'}</div></div>`;
    cat.cargar(detEl);
    const cont = detEl.querySelector('.det-pistas');
    cont.listaFn = () => detalleActual().pistas;
    if (esLista) ordenable(cont, {
      alMover: (de, a) => { const l = d.lista; const [x] = l.rutas.splice(de, 1); l.rutas.splice(a, 0, x); guardarYRefrescarLista(l); },
      alQuitar: i => { const l = d.lista; l.rutas.splice(i, 1); guardarYRefrescarLista(l); }
    });
  }
  const detalleActual = () => datosDetalle() || { pistas: [] };
  function abrirDetalle(tipo, clave) {
    if (buscando) cerrarBusqueda();
    detalle = { tipo, clave };
    detEl.hidden = false; lib.classList.add('con-detalle');
    pintarDetalle();
    detEl.scrollTop = 0; const sc = detEl.querySelector('.det-scroll'); if (sc) sc.scrollTop = 0;
    if (!detItem) { detItem = { cerrar: cerrarDetalleDirecto }; empujar(detItem); }
    if (acciones.verReproductor) acciones.verReproductor();
  }
  function cerrarDetalleDirecto() {
    detalle = null; detEl.hidden = true; detEl.innerHTML = ''; lib.classList.remove('con-detalle'); detItem = null;
  }
  const cerrarDetalle = () => { if (detItem) cerrarItem(detItem); };
  engancharPistas(detEl, () => detalleActual().pistas);
  detEl.addEventListener('click', async e => {
    const b = e.target.closest('button[data-a]'); if (!b || !detalle) return;
    const a = b.dataset.a, d = datosDetalle();
    if (a === 'det-atras') cerrarDetalle();
    else if (a === 'det-play' && d) reproducirTodo(d.pistas, false);
    else if (a === 'det-azar' && d) reproducirTodo(d.pistas, true);
    else if (a === 'det-mas' && d && d.lista) {
      const r = await elegirOpcion({ titulo: d.titulo, opciones: [{ id: 'ren', texto: 'Cambiar nombre', icono: 'lista' }, { id: 'sig', texto: 'Reproducir a continuación', icono: 'sig_lista' }, { id: 'fin', texto: 'Agregar a la cola', icono: 'cola' }, { id: 'borrar', texto: 'Borrar lista', icono: 'papelera', peligro: true }] });
      if (r === 'ren') { const n = await pedirTexto({ titulo: 'Nombre de la lista', valor: d.lista.nombre, boton: 'Guardar' }); if (n) { d.lista.nombre = n; await guardarYRefrescarLista(d.lista); await cargarListas(); } }
      else if (r === 'sig' || r === 'fin') { const rs = rutasDe(d.pistas); if (rs.length) { acciones.enCola(r, rs); avisar(r === 'sig' ? 'A continuación' : 'Al final de la cola', d.lista.nombre); } }
      else if (r === 'borrar' && await confirmar({ titulo: 'Borrar lista', texto: `Se borra «${d.lista.nombre}». Las canciones siguen en tu carpeta.`, boton: 'Borrar', peligro: true })) {
        await bib.borrarLista(d.lista.id); await cargarListas(); cerrarDetalle(); if (libListo && S.vista === 'listas') pintarVista();
      }
    }
  });

  // ---------- Buscador ----------
  function abrirBusqueda() { buscando = true; lib.classList.add('buscando'); buscarBox.hidden = false; herr.hidden = true; scroll.hidden = true; azEl.hidden = true; resultados.hidden = false; inputBuscar.value = ''; buscar(); setTimeout(() => inputBuscar.focus(), 50); }
  function cerrarBusqueda() { buscando = false; lib.classList.remove('buscando'); buscarBox.hidden = true; herr.hidden = false; scroll.hidden = false; resultados.hidden = true; inputBuscar.blur(); pintarVista(); }
  let resCanc = [];
  function buscar() {
    const q = normalizar(inputBuscar.value);
    if (!q) { resultados.innerHTML = lleno('Escribe el nombre de una canción, un álbum o un artista.'); resCanc = []; return; }
    const palabras = q.split(' ');
    const coincide = txt => { const n = normalizar(txt); return palabras.every(w => n.includes(w)); };
    const pistas = bib.cache.pistas.filter(p => coincide(p.titulo + ' ' + p.artista + ' ' + p.album)).sort((a, b) => col.compare(a.orden || a.titulo, b.orden || b.titulo));
    const albs = [...bib.cache.albumes.values()].filter(a => coincide(a.nombre + ' ' + a.artista));
    const arts = new Map();
    for (const p of bib.cache.pistas) { const k = normalizar(claveArtista(p)); if (!k || arts.has(k)) continue; if (coincide(claveArtista(p))) arts.set(k, p); }
    resCanc = pistas.slice(0, 80);
    let h = '';
    if (arts.size) h += `<h4 class="res-tit">Artistas</h4>` + [...arts.entries()].slice(0, 8).map(([k, p]) => filaGrupo({ nombre: nombreArtista(p), sub: 'Artista', albumId: p.albumId, tiene: tieneCar(p) }, `data-artista="${esc(k)}"`)).join('');
    if (albs.length) h += `<h4 class="res-tit">Álbumes</h4>` + albs.slice(0, 12).map(a => { const p = bib.cache.pistas.find(x => x.albumId === a.id); return filaGrupo({ nombre: a.nombre || 'Sin álbum', sub: [a.artista, a.anio].filter(Boolean).join(' · '), albumId: a.id, tiene: a.tieneCaratula }, `data-album="${esc(a.id)}"`); }).join('');
    if (resCanc.length) h += `<h4 class="res-tit">Canciones${pistas.length > resCanc.length ? ` <small>(las primeras ${resCanc.length} de ${num(pistas.length)})</small>` : ''}</h4><div class="res-pistas">` + resCanc.map((p, i) => filaPista(p, { i })).join('') + '</div>';
    resultados.innerHTML = h || lleno('No encontré nada con eso.');
    cat.cargar(resultados);
  }
  let buscarT = 0;
  inputBuscar.addEventListener('input', () => { clearTimeout(buscarT); buscarT = setTimeout(buscar, 110); });
  engancharPistas(resultados, () => resCanc);

  // ---------- Menú ⋯ y ajustes ----------
  async function menuMas() {
    const u = bib.estado.ultimoEscaneo;
    const r = await elegirOpcion({ titulo: 'Tu música', opciones: [
      { id: 'actualizar', texto: 'Actualizar biblioteca', sub: u ? 'Última vez: ' + cuando(u.fecha) : 'Aún no se ha escaneado', icono: 'actualizar' },
      { id: 'ajustes', texto: 'Ajustes de la biblioteca', icono: 'ajustes' },
      { id: 'radio', texto: 'Oír la radio en vivo', icono: 'radio' }
    ] });
    if (r === 'actualizar') lanzarEscaneo(); else if (r === 'ajustes') abrirAjustes(); else if (r === 'radio') acciones.radio();
  }
  function infoSistema() {
    const ua = navigator.userAgent || '', d = navigator.userAgentData;
    const android = (ua.match(/Android\s+([\d.]+)/) || [])[1];
    let chrome = ''; const m = ua.match(/(Edg|Chrome|Firefox|Version)\/([\d.]+)/);
    if (d && d.brands) { const b = d.brands.find(x => /Chrom|Edge/i.test(x.brand) && !/Not/i.test(x.brand)); if (b) chrome = `${b.brand.replace('Google ', '')} ${b.version}`; }
    if (!chrome && m) chrome = `${m[1] === 'Edg' ? 'Edge' : m[1] === 'Version' ? 'Safari' : m[1]} ${m[2].split('.')[0]}`;
    return { android: android || '', navegador: chrome || 'No se pudo saber', plataforma: (d && d.platform) || navigator.platform || '' };
  }
  function abrirAjustes() {
    const e = bib.estado, u = e.ultimoEscaneo, s = infoSistema();
    const h = crearHoja({ titulo: 'Ajustes de la biblioteca', clase: 'hoja-ajustes', html: `
      <section class="aj"><h4>Carpeta</h4><p class="aj-txt">${esc(e.carpeta || 'Ninguna')}</p><button type="button" class="boton" data-a="carpeta">${ic('carpeta')}Cambiar carpeta</button></section>
      <section class="aj"><h4>Biblioteca</h4><p class="aj-txt">${num(e.total)} canciones · ${num(e.albumes)} álbumes<br>${u ? `Última actualización: ${esc(cuando(u.fecha))} (${esc(duracionMs(u.duracionMs))})` : 'Aún no se ha escaneado'}</p><button type="button" class="boton" data-a="actualizar">${ic('actualizar')}Actualizar biblioteca</button></section>
      <section class="aj"><h4>Listas y favoritos</h4><p class="aj-txt">La biblioteca se reconstruye sola al escanear; las listas y los favoritos no. Guárdalos en un archivo por si cambias de dispositivo.</p><div class="botones"><button type="button" class="boton" data-a="exportar">${ic('exportar')}Exportar</button><button type="button" class="boton" data-a="importar">${ic('importar')}Importar</button></div><input type="file" accept="application/json,.json" hidden></section>
      <section class="aj"><h4>Esta app</h4><p class="aj-txt">${esc(version || 'Radio')}<br>Navegador: ${esc(s.navegador)}${s.android ? `<br>Android ${esc(s.android)}` : s.plataforma ? `<br>${esc(s.plataforma)}` : ''}</p></section>` });
    const inp = h.cuerpo.querySelector('input[type=file]');
    h.cuerpo.addEventListener('click', async ev => {
      const b = ev.target.closest('button[data-a]'); if (!b) return;
      if (b.dataset.a === 'carpeta') { h.cerrar(); setTimeout(elegir, 320); }
      else if (b.dataset.a === 'actualizar') { h.cerrar(); setTimeout(lanzarEscaneo, 320); }
      else if (b.dataset.a === 'exportar') {
        try {
          const datos = await bib.exportar();
          const blob = new Blob([JSON.stringify(datos, null, 1)], { type: 'application/json' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
          a.download = `radio-listas-y-favoritos-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 1000);
          avisar('Listo', `${num(datos.favoritos.length)} favoritos y ${num(datos.listas.length)} listas`);
        } catch (err) { avisar('No se pudo exportar', (err && err.message) || ''); }
      } else if (b.dataset.a === 'importar') inp.click();
    });
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      try {
        const r = await bib.importar(JSON.parse(await f.text()));
        await cargarListas(); memo = null; pintarVista();
        avisar('Importado', `${num(r.favoritos)} favoritos nuevos · ${num(r.listasNuevas)} listas nuevas${r.listasUnidas ? ` · ${num(r.listasUnidas)} unidas` : ''}`);
      } catch (err) { avisar('No se pudo importar', (err && err.message) || 'Archivo no válido'); }
      inp.value = '';
    });
  }

  // ---------- Eventos de la biblioteca ----------
  lib.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('lib-vista')) { cerrarDetalle(); if (buscando) cerrarBusqueda(); S.vista = b.dataset.vista; guardarVista(); pintarVista(); return; }
    if (b.dataset.quitar) {
      if (b.dataset.quitar === 'anio') S.anio = null; else S.generos = S.generos.filter(g => 'g:' + g !== b.dataset.quitar);
      aplicarFiltros(); return;
    }
    if (b.dataset.album) { abrirDetalle('album', b.dataset.album); return; }
    if (b.dataset.artista) { abrirDetalle('artista', b.dataset.artista); return; }
    if (b.dataset.genero != null && b.hasAttribute('data-genero')) { abrirDetalle('genero', b.dataset.genero); return; }
    if (b.dataset.anio != null && b.hasAttribute('data-anio') && b.classList.contains('fila')) { abrirDetalle('anio', b.dataset.anio); return; }
    if (b.dataset.lista) { abrirDetalle('lista', b.dataset.lista); return; }
    const a = b.dataset.a; if (!a || a.startsWith('det-')) return;
    if (a === 'buscar') abrirBusqueda();
    else if (a === 'buscar-x') cerrarBusqueda();
    else if (a === 'anio') abrirFiltroAnio();
    else if (a === 'genero') abrirFiltroGenero();
    else if (a === 'orden') abrirOrden();
    else if (a === 'mas') menuMas();
    else if (a === 'quitar-filtros') { S.anio = null; S.generos = []; aplicarFiltros(); }
    else if (a === 'nueva-lista') nuevaLista();
  });
  engancharPistas(scroll, () => listaCanc);
  // Una sola entrada de teclado en el buscador: Escape cierra, Enter quita el teclado
  inputBuscar.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarBusqueda(); else if (e.key === 'Enter') inputBuscar.blur(); });

  // Marca la canción que suena y el ecualizador animado
  let marcada = '', activa = null;
  function marcarSonando() {
    if (!local) return;
    const r = local.pista ? local.pista.ruta : '', son = local.sonando;
    lib.classList.toggle('sonando', son);
    if (r === marcada) return;
    marcada = r;
    lib.querySelectorAll('.fila.suena').forEach(f => { if (f.dataset.r !== r) f.classList.remove('suena'); });
    if (r) lib.querySelectorAll('.fila[data-r]').forEach(f => { if (f.dataset.r === r) f.classList.add('suena'); });
  }

  // Cola fija en pantallas anchas (≥ 1200 px; en las demás se abre como hoja desde «Ahora suena»)
  function montarCola() { if (local) crearCola({ cont: $q('.lib-cola'), local, bib }); }

  // ---------- Pantalla completa del reproductor ----------
  async function iniciarBiblioteca() {
    if (libListo) return;
    libListo = true;
    virtual = crearVirtual(scroll, { alto: 64, fila: (i, top) => filaPista(listaCanc[i], { top, i }), alPintar: esp => cat.cargar(esp) });
    try {
      const g = await bib.leerEstado('vista');
      if (g) { if (VISTAS.some(v => v.id === g.vista)) S.vista = g.vista; Object.assign(S.orden, g.orden || {}); S.anio = g.anio || null; S.generos = Array.isArray(g.generos) ? g.generos : []; }
    } catch { /* */ }
    for (const k in ORDENES) if (!ORDENES[k].some(([id]) => id === S.orden[k])) S.orden[k] = ORDENES[k][0][0];
    await cargarListas();
    $q('.lib-maqueta').hidden = !bib.esMaqueta;
    montarCola();
    pintarFichas(); pintarVista();
  }

  function pintar(forzar) {
    const e = bib.estado;
    const mostrarLib = e.fase === 'lista' && e.total > 0;
    if (mostrarLib) {
      if (!modoLib || forzar) {
        modoLib = true; faseVista = 'lista';
        seccion.classList.remove('p-card', 'bib'); seccion.classList.add('p-lib');
        if (seccion.firstElementChild !== lib) { seccion.textContent = ''; seccion.appendChild(lib); }
      }
      if (!libListo) iniciarBiblioteca();
      else if (bib.cache.version !== verDatos) {
        verDatos = bib.cache.version; memo = null;
        pintarFichas(); pintarVista(); if (detalle) pintarDetalle(); if (buscando) buscar();
      }
      if (verDatos < 0) verDatos = bib.cache.version;
      return;
    }
    if (modoLib) { modoLib = false; faseVista = null; seccion.classList.remove('p-lib'); seccion.classList.add('p-card', 'bib'); }
    seccion.classList.add('bib');
    if (forzar || e.fase !== faseVista) { seccion.innerHTML = htmlTarjeta(e); faseVista = e.fase; }
    if (e.fase === 'escaneando' && e.progreso) {
      const p = e.progreso;
      const t = seccion.querySelector('#bibAvance'), b = seccion.querySelector('#bibBarra');
      if (!t || !b) return;
      if (p.etapa === 'buscando') { t.textContent = `Buscando archivos… ${num(p.hecho)}`; b.parentNode.classList.add('indef'); b.style.width = ''; }
      else {
        b.parentNode.classList.remove('indef');
        const pc = p.de ? Math.round(p.hecho / p.de * 100) : 0;
        t.textContent = p.etapa === 'guardando' ? 'Guardando…' : `${num(p.hecho)} de ${num(p.de)}`;
        b.style.width = pc + '%'; b.parentNode.setAttribute('aria-valuenow', String(pc));
      }
    }
  }

  seccion.addEventListener('click', ev => {
    const b = ev.target.closest('button[data-acc]');
    if (!b) return;
    ev.stopPropagation();
    const a = b.dataset.acc;
    bib.estado.error = '';
    if (a === 'elegir') elegir();
    else if (a === 'reconectar') reconectar();
    else if (a === 'actualizar') lanzarEscaneo();
    else if (a === 'cancelar') bib.cancelarEscaneo();
    else if (a === 'reintentar') bib.iniciar();
  });
  bib.alCambiar(() => pintar(false));
  if (local) local.alCambio(marcarSonando);

  // Hoja «Ahora suena»
  const ahora = local ? crearAhoraSuena({
    local, bib, store,
    alVisuales: () => acciones.visuales && acciones.visuales(),
    alRadio: () => acciones.radio(),
    irA: (que, p) => { if (que === 'album') abrirDetalle('album', p.albumId); else abrirDetalle('artista', normalizar(claveArtista(p))); },
    alternarFavorito, esFavorito: p => p.favorito
  }) : null;

  pintar(true);
  return {
    pintar: () => pintar(true),
    abrirAhoraSuena: () => { if (ahora && local.cola.length) ahora.abrir(); },
    abrirCola: () => ahora && ahora.abrirCola(),
    alternarFavorito,
    abrirDetalle
  };
}
