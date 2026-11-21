// Biblioteca de música: acceso a la carpeta (FuenteArchivos), índice en IndexedDB y escaneo por lotes.
// Esquema: ver «Radio — Esquema del backend» §2 (base `radio-fortaleza`, versión 1).
import { leerEtiquetas } from './id3.js?v=1';

const BD = 'radio-fortaleza';
const VERSION = 1;
const EXT_AUDIO = ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'wav'];
const EXT_VIDEO = ['mp4', 'm4v', 'webm'];
const NOMBRES_CARATULA = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.jpeg', 'folder.png'];
const CARPETAS_IGNORADAS = new Set(['$recycle.bin', 'system volume information', 'lost+found']);
const LOTE = 50;
const ARTICULOS = /^(el|la|los|las|un|una|unos|unas|the|a|an)\s+/;

// ---------- Utilidades de texto ----------
export const normalizar = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const sinArticulo = t => { const n = normalizar(t); return n.replace(ARTICULOS, '') || n; };
const inicialDe = t => { const c = sinArticulo(t).replace(/^[^a-z0-9]+/, '').charAt(0).toUpperCase(); return c >= 'A' && c <= 'Z' ? c : '#'; };
const extension = n => { const i = n.lastIndexOf('.'); return i < 0 ? '' : n.slice(i + 1).toLowerCase(); };
const nombreSinExt = n => { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(0, i) : n; };
const esperar = ms => new Promise(r => setTimeout(r, ms));

// ---------- IndexedDB ----------
let _bd = null;
function abrirBD() {
  if (_bd) return _bd;
  _bd = new Promise((ok, mal) => {
    const req = indexedDB.open(BD, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const pistas = db.createObjectStore('pistas', { keyPath: 'id', autoIncrement: true });
      pistas.createIndex('ruta', 'ruta', { unique: true });
      for (const k of ['albumId', 'artista', 'genero', 'anio', 'inicial', 'favorito', 'agregado']) pistas.createIndex(k, k);
      const albumes = db.createObjectStore('albumes', { keyPath: 'id' });
      albumes.createIndex('artista', 'artista');
      albumes.createIndex('anio', 'anio');
      db.createObjectStore('caratulas', { keyPath: 'albumId' });
      db.createObjectStore('listas', { keyPath: 'id', autoIncrement: true });
      db.createObjectStore('estado'); // clave de texto: carpeta, cola, ultimoEscaneo, vista
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => { req.result.close(); _bd = null; };
      ok(req.result);
    };
    req.onerror = () => { _bd = null; mal(req.error); };
    req.onblocked = () => { _bd = null; mal(new Error('La base de la biblioteca está bloqueada por otra pestaña')); };
  });
  return _bd;
}
const pedir = r => new Promise((ok, mal) => { r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
const terminar = tx => new Promise((ok, mal) => { tx.oncomplete = () => ok(); tx.onerror = () => mal(tx.error); tx.onabort = () => mal(tx.error || new Error('transacción cancelada')); });

async function leer(almacen, clave) {
  const db = await abrirBD();
  return pedir(db.transaction(almacen).objectStore(almacen).get(clave));
}
async function escribirEstado(clave, valor) {
  const db = await abrirBD();
  const tx = db.transaction('estado', 'readwrite');
  tx.objectStore('estado').put(valor, clave);
  return terminar(tx);
}
async function todo(almacen) {
  const db = await abrirBD();
  return pedir(db.transaction(almacen).objectStore(almacen).getAll());
}
async function contar(almacen) {
  const db = await abrirBD();
  return pedir(db.transaction(almacen).objectStore(almacen).count());
}

// ---------- FuenteArchivos del navegador (File System Access) ----------
// Una interfaz, dos implementaciones: esta es la del navegador. La envoltura nativa (etapa 5B) usaría la misma forma.
//   disponible() · elegirCarpeta() · reconectar() · recorrer() · abrir(ruta)
export function crearFuenteNavegador({ elegir } = {}) {
  let raiz = null;          // FileSystemDirectoryHandle
  let nombreCarpeta = '';

  async function permiso(h, pedirSiHaceFalta) {
    const op = { mode: 'read' };
    try {
      if ((await h.queryPermission(op)) === 'granted') return true;
      if (!pedirSiHaceFalta) return false;
      return (await h.requestPermission(op)) === 'granted';
    } catch { return false; }
  }

  async function* recorrerDir(dir, prefijo) {
    const archivos = [], carpetas = [];
    let portada = null;
    for await (const h of dir.values()) {
      if (h.kind === 'directory') {
        const n = h.name.toLowerCase();
        if (!CARPETAS_IGNORADAS.has(n) && !h.name.startsWith('.')) carpetas.push(h);
      } else {
        if (h.name.startsWith('._') || h.name.startsWith('.')) continue;
        const ext = extension(h.name);
        if (EXT_AUDIO.includes(ext) || EXT_VIDEO.includes(ext)) archivos.push(h);
        else if (NOMBRES_CARATULA.includes(h.name.toLowerCase()) && (!portada || h.name.toLowerCase() < portada.name.toLowerCase())) portada = h;
      }
    }
    // La portada de la carpeta se lee una sola vez y solo si hace falta.
    let portadaCache;
    const carpetaCaratula = async () => {
      if (portadaCache !== undefined) return portadaCache;
      try { portadaCache = portada ? await portada.getFile() : null; } catch { portadaCache = null; }
      return portadaCache;
    };
    archivos.sort((a, b) => a.name.localeCompare(b.name));
    for (const h of archivos) {
      let f;
      try { f = await h.getFile(); } catch { continue; } // archivo que desapareció o está bloqueado
      yield { ruta: prefijo + h.name, nombre: h.name, carpeta: prefijo.replace(/\/$/, ''), tamano: f.size, modificado: f.lastModified, abrir: async () => f, carpetaCaratula };
    }
    carpetas.sort((a, b) => a.name.localeCompare(b.name));
    for (const c of carpetas) yield* recorrerDir(c, prefijo + c.name + '/');
  }

  return {
    disponible: () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function',
    get nombre() { return nombreCarpeta; },
    get conectada() { return !!raiz; },
    // Con gesto del usuario.
    async elegirCarpeta() {
      const h = elegir ? await elegir() : await window.showDirectoryPicker({ id: 'radio-musica', mode: 'read' });
      if (!h) throw new DOMException('Cancelado', 'AbortError');
      raiz = h; nombreCarpeta = h.name;
      await escribirEstado('carpeta', h);
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* mejor esfuerzo */ }
    },
    // Recupera la carpeta guardada. Con `pedirPermiso` (y un toque del usuario) vuelve a pedir el permiso.
    // Devuelve: 'sin-carpeta' | 'permiso' (hay carpeta pero falta el permiso) | 'lista'
    async reconectar(pedirPermiso = false) {
      const h = await leer('estado', 'carpeta');
      if (!h) { raiz = null; nombreCarpeta = ''; return 'sin-carpeta'; }
      nombreCarpeta = h.name;
      if (await permiso(h, pedirPermiso)) { raiz = h; return 'lista'; }
      raiz = null;
      return 'permiso';
    },
    recorrer() {
      if (!raiz) throw new Error('No hay carpeta conectada');
      return recorrerDir(raiz, '');
    },
    async abrir(ruta) {
      if (!raiz) throw new Error('No hay carpeta conectada');
      const partes = ruta.split('/');
      let dir = raiz;
      for (let i = 0; i < partes.length - 1; i++) dir = await dir.getDirectoryHandle(partes[i]);
      return (await dir.getFileHandle(partes[partes.length - 1])).getFile();
    }
  };
}

// ---------- FuenteArchivos nativa (APK con Capacitor, etapa 5B) ----------
// Misma forma que la del navegador. La carpeta la elige el selector de Android y el permiso queda guardado.
// Los archivos se leen de https://localhost/_musica_/<ruta> (MusicaWebViewClient), con Range.
const esNativa = () => typeof window !== 'undefined' && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const urlMusica = ruta => '/_musica_/' + ruta.split('/').map(encodeURIComponent).join('/');

// Archivo que no se lee entero: slice().arrayBuffer() pide solo esos bytes (para las etiquetas) y `url` sirve para reproducir.
class ArchivoNativo {
  constructor(ruta, nombre, tamano, modificado) {
    this.ruta = ruta; this.name = nombre; this.size = tamano; this.lastModified = modificado; this.url = urlMusica(ruta);
  }
  slice(desde = 0, hasta = this.size) {
    const url = this.url, total = this.size;
    const a = Math.max(0, Math.min(desde, total)), b = Math.max(a, Math.min(hasta, total));
    return {
      size: b - a,
      async arrayBuffer() {
        if (b <= a) return new ArrayBuffer(0);
        const r = await fetch(url, { headers: { Range: `bytes=${a}-${b - 1}` } });
        if (!r.ok) throw new Error('No se pudo leer ' + url);
        const buf = await r.arrayBuffer();
        return r.status === 206 ? buf : buf.slice(a, b); // si no respetó el Range, se recorta aquí
      }
    };
  }
  async arrayBuffer() { const r = await fetch(this.url); if (!r.ok) throw new Error('No se pudo leer ' + this.url); return r.arrayBuffer(); }
}

export function crearFuenteNativa() {
  const M = window.radioMusica || (window.radioMusica = window.Capacitor.registerPlugin('Musica'));
  let nombreCarpeta = '', conectada = false;
  const tamanos = new Map(); // ruta -> [tamaño, fecha], del último recorrido

  async function elegir() {
    const r = await M.elegirCarpeta();
    if (!r || r.cancelado) throw new DOMException('Cancelado', 'AbortError');
    nombreCarpeta = r.nombre || 'Música'; conectada = true;
  }

  return {
    disponible: () => true,
    get nombre() { return nombreCarpeta; },
    get conectada() { return conectada; },
    elegirCarpeta: elegir,
    async reconectar(pedirPermiso = false) {
      const e = await M.estado();
      if (!e.carpeta) { conectada = false; nombreCarpeta = ''; return 'sin-carpeta'; }
      nombreCarpeta = e.nombre || 'Música';
      if (e.permiso) { conectada = true; return 'lista'; }
      conectada = false;
      if (pedirPermiso) { try { await elegir(); return 'lista'; } catch { /* canceló */ } }
      return 'permiso';
    },
    async *recorrer() {
      if (!conectada) throw new Error('No hay carpeta conectada');
      const r = await M.listar({ ext: [...EXT_AUDIO, ...EXT_VIDEO], ignoradas: [...CARPETAS_IGNORADAS], caratulas: NOMBRES_CARATULA });
      const archivos = (r.archivos || []).slice().sort((x, y) => x.ruta.localeCompare(y.ruta));
      const portadas = r.portadas || {};
      const cache = new Map();
      const caratulaDe = carpeta => () => {
        if (!cache.has(carpeta)) {
          const ruta = portadas[carpeta];
          cache.set(carpeta, ruta ? fetch(urlMusica(ruta)).then(x => (x.ok ? x.blob() : null)).catch(() => null) : Promise.resolve(null));
        }
        return cache.get(carpeta);
      };
      tamanos.clear();
      for (const a of archivos) {
        tamanos.set(a.ruta, [a.tamano, a.modificado]);
        const archivo = new ArchivoNativo(a.ruta, a.nombre, a.tamano, a.modificado);
        yield { ruta: a.ruta, nombre: a.nombre, carpeta: a.carpeta, tamano: a.tamano, modificado: a.modificado, abrir: async () => archivo, carpetaCaratula: caratulaDe(a.carpeta) };
      }
    },
    async abrir(ruta) {
      if (!conectada) throw new Error('No hay carpeta conectada');
      const t = tamanos.get(ruta) || [NaN, 0];
      const nombre = ruta.slice(ruta.lastIndexOf('/') + 1);
      return new ArchivoNativo(ruta, nombre, t[0], t[1]);
    }
  };
}

// ---------- Carátulas ----------
async function reducir(blob, lado) {
  const img = await createImageBitmap(blob);
  try {
    const esc = Math.min(1, lado / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * esc)), h = Math.max(1, Math.round(img.height * esc));
    const lienzo = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const c = lienzo.getContext('2d');
    c.fillStyle = '#0d0b0a'; c.fillRect(0, 0, w, h); // fondo para PNG con transparencia
    c.drawImage(img, 0, 0, w, h);
    return lienzo.convertToBlob ? lienzo.convertToBlob({ type: 'image/jpeg', quality: 0.85 }) : new Promise((ok, mal) => lienzo.toBlob(b => b ? ok(b) : mal(new Error('sin imagen')), 'image/jpeg', 0.85));
  } finally { img.close && img.close(); }
}

// ---------- La biblioteca ----------
export function crearBiblioteca({ fuente = esNativa() ? crearFuenteNativa() : crearFuenteNavegador() } = {}) {
  const oyentes = new Set();
  const avisar = () => oyentes.forEach(f => { try { f(estado); } catch (e) { console.warn(e); } });

  // Estado que la pantalla pinta.
  //   fase: 'inicio' (leyendo lo guardado) | 'sin-carpeta' | 'permiso' | 'lista' | 'escaneando' | 'error'
  const estado = {
    fase: 'inicio', carpeta: '', total: 0, albumes: 0, ultimoEscaneo: null,
    progreso: null,   // { etapa: 'buscando'|'leyendo'|'guardando', hecho, de }
    error: ''
  };
  let cancelar = null;

  async function refrescarCuentas() {
    estado.total = await contar('pistas');
    estado.albumes = await contar('albumes');
    estado.ultimoEscaneo = (await leer('estado', 'ultimoEscaneo')) || null;
  }

  async function iniciar() {
    try {
      const r = await fuente.reconectar(false);
      await refrescarCuentas();
      await cargarDatos();
      estado.carpeta = fuente.nombre;
      estado.fase = r === 'sin-carpeta' ? 'sin-carpeta' : r === 'lista' ? 'lista' : 'permiso';
    } catch (e) { estado.fase = 'error'; estado.error = e.message || String(e); }
    avisar();
    return estado;
  }

  async function elegirCarpeta() {
    try { await fuente.elegirCarpeta(); }
    catch (e) { if (e && e.name === 'AbortError') return false; throw e; }
    estado.carpeta = fuente.nombre; estado.fase = 'lista'; estado.error = ''; avisar();
    return true;
  }

  // Debe llamarse desde un toque (el navegador pide el permiso otra vez).
  async function volverAConectar() {
    const r = await fuente.reconectar(true);
    estado.carpeta = fuente.nombre;
    estado.fase = r === 'sin-carpeta' ? 'sin-carpeta' : r === 'lista' ? 'lista' : 'permiso';
    avisar();
    return r === 'lista';
  }

  // Escanea: recorre la carpeta, compara ruta + tamaño + fecha con el índice, lee etiquetas solo de lo nuevo o cambiado,
  // guarda en lotes de 50, quita lo que ya no está y reconstruye álbumes y carátulas.
  async function escanear() {
    if (estado.fase === 'escaneando') return null;
    if (!fuente.conectada) throw new Error('No hay carpeta conectada');
    const ctl = new AbortController();
    cancelar = () => ctl.abort();
    const t0 = performance.now();
    const fasePrevia = estado.fase;
    estado.fase = 'escaneando'; estado.error = '';
    estado.progreso = { etapa: 'buscando', hecho: 0, de: 0 }; avisar();
    const resumen = { fecha: Date.now(), total: 0, nuevas: 0, cambiadas: 0, quitadas: 0, sinEtiquetas: 0, errores: 0, cancelado: false, duracionMs: 0 };
    const fallos = [];
    try {
      // 1. Lista de archivos (para poder mostrar «312 de 2,104»).
      const archivos = [];
      for await (const a of fuente.recorrer()) {
        if (ctl.signal.aborted) break;
        archivos.push(a);
        if (archivos.length % 100 === 0) { estado.progreso = { etapa: 'buscando', hecho: archivos.length, de: 0 }; avisar(); await esperar(0); }
      }
      if (ctl.signal.aborted) { resumen.cancelado = true; return resumen; }

      // 2. Lo que ya hay en el índice.
      const db = await abrirBD();
      const previas = new Map();
      for (const p of await todo('pistas')) previas.set(p.ruta, p);
      const albumesConPortada = new Set((await pedir(db.transaction('caratulas').objectStore('caratulas').getAllKeys())));
      const vistas = new Set();
      const ahora = Date.now();
      let lote = [], hechas = 0;
      const albumesAfectados = new Set();
      estado.progreso = { etapa: 'leyendo', hecho: 0, de: archivos.length }; avisar();

      const guardarLote = async () => {
        if (!lote.length) return;
        const tx = db.transaction('pistas', 'readwrite');
        const alm = tx.objectStore('pistas');
        for (const p of lote) alm.put(p);
        lote = [];
        await terminar(tx);
      };

      for (const a of archivos) {
        if (ctl.signal.aborted) { resumen.cancelado = true; break; }
        vistas.add(a.ruta);
        const previa = previas.get(a.ruta);
        const igual = previa && previa.tamano === a.tamano && previa.modificado === a.modificado;
        if (!igual) {
          try {
            const file = await a.abrir();
            const et = await leerEtiquetas(file);
            if (!(et.titulo || et.artista || et.album)) resumen.sinEtiquetas++;
            const ext = extension(a.nombre);
            const titulo = et.titulo || nombreSinExt(a.nombre);
            const artista = et.artista || '';
            const album = et.album || '';
            const albumId = normalizar(et.artistaAlbum || artista) + '|' + normalizar(album);
            const pista = {
              ...(previa ? { id: previa.id } : {}),
              ruta: a.ruta, archivo: a.nombre, carpeta: a.carpeta,
              tipo: EXT_VIDEO.includes(ext) ? 'video' : 'audio',
              titulo, artista, artistaAlbum: et.artistaAlbum || '', album, genero: et.genero || '',
              anio: et.anio, pista: et.pista, disco: et.disco, albumId,
              duracion: previa && previa.duracion != null ? previa.duracion : null,
              tamano: a.tamano, modificado: a.modificado,
              inicial: inicialDe(titulo), orden: sinArticulo(titulo),
              favorito: previa ? previa.favorito : 0,
              agregado: previa ? previa.agregado : ahora,
              ultimaVez: previa ? previa.ultimaVez : null,
              reproducciones: previa ? previa.reproducciones : 0
            };
            lote.push(pista);
            albumesAfectados.add(albumId);
            if (previa) resumen.cambiadas++; else resumen.nuevas++;
            // Carátula: una por álbum. Embebida; si no hay, cover.jpg / folder.jpg de la carpeta.
            if (!albumesConPortada.has(albumId)) {
              let origen = et.caratula ? new Blob([et.caratula.datos], { type: et.caratula.tipo }) : null;
              if (!origen) origen = await a.carpetaCaratula();
              if (origen) {
                try {
                  const grande = await reducir(origen, 600), chica = await reducir(origen, 120);
                  const tx = db.transaction('caratulas', 'readwrite');
                  tx.objectStore('caratulas').put({ albumId, grande, chica });
                  await terminar(tx);
                  albumesConPortada.add(albumId);
                } catch (e) { console.warn('Carátula no legible:', a.ruta, e); }
              }
            }
          } catch (e) {
            resumen.errores++; fallos.push({ ruta: a.ruta, error: String(e && e.message || e) });
            console.warn('No se pudo leer', a.ruta, e);
          }
        }
        hechas++;
        if (lote.length >= LOTE) { await guardarLote(); }
        if (hechas % 25 === 0 || hechas === archivos.length) {
          estado.progreso = { etapa: 'leyendo', hecho: hechas, de: archivos.length }; avisar();
          await esperar(0); // deja respirar a la pantalla
        }
      }
      await guardarLote();

      // 3. Quitar lo que ya no está (solo si el recorrido terminó completo).
      if (!resumen.cancelado) {
        estado.progreso = { etapa: 'guardando', hecho: archivos.length, de: archivos.length }; avisar();
        const tx = db.transaction('pistas', 'readwrite');
        const alm = tx.objectStore('pistas');
        for (const [ruta, p] of previas) if (!vistas.has(ruta)) { alm.delete(p.id); resumen.quitadas++; albumesAfectados.add(p.albumId); }
        await terminar(tx);
      }

      // 4. Álbumes: se reconstruyen desde las pistas. Sin pistas, el álbum y su carátula se van.
      await reconstruirAlbumes();
      resumen.total = await contar('pistas');
      return resumen;
    } finally {
      resumen.duracionMs = Math.round(performance.now() - t0);
      if (fallos.length) resumen.detalleErrores = fallos.slice(0, 20);
      cancelar = null;
      estado.progreso = null;
      try {
        if (!resumen.cancelado || resumen.nuevas || resumen.cambiadas) { resumen.total = await contar('pistas'); await escribirEstado('ultimoEscaneo', resumen); }
        await refrescarCuentas();
        await cargarDatos();
      } catch (e) { console.warn(e); }
      estado.fase = fuente.conectada ? 'lista' : fasePrevia;
      avisar();
    }
  }

  async function reconstruirAlbumes() {
    const db = await abrirBD();
    const pistas = await todo('pistas');
    const grupos = new Map();
    for (const p of pistas) {
      let g = grupos.get(p.albumId);
      if (!g) { g = { id: p.albumId, nombre: p.album, artista: p.artistaAlbum || p.artista, anio: null, numPistas: 0 }; grupos.set(p.albumId, g); }
      g.numPistas++;
      if (p.anio && (!g.anio || p.anio < g.anio)) g.anio = p.anio;
    }
    const portadas = new Set(await pedir(db.transaction('caratulas').objectStore('caratulas').getAllKeys()));
    const tx = db.transaction(['albumes', 'caratulas'], 'readwrite');
    const alb = tx.objectStore('albumes'), car = tx.objectStore('caratulas');
    alb.clear();
    for (const g of grupos.values()) alb.put({ ...g, tieneCaratula: portadas.has(g.id) });
    for (const k of portadas) if (!grupos.has(k)) car.delete(k);
    await terminar(tx);
  }


  // ---------- Datos en memoria (para las pantallas del reproductor) ----------
  const cache = { pistas: [], porRuta: new Map(), albumes: new Map(), version: 0 };
  const urlsCaratula = new Map();
  async function cargarDatos() {
    const [pistas, albumes] = await Promise.all([todo('pistas'), todo('albumes')]);
    cache.pistas = pistas;
    cache.porRuta = new Map(pistas.map(p => [p.ruta, p]));
    cache.albumes = new Map(albumes.map(a => [a.id, a]));
    cache.version++;
    urlsCaratula.clear(); // las carátulas pueden haber cambiado
    return cache;
  }
  // URL temporal de la carátula de un álbum ('chica' 120 px o 'grande' 600 px), o null si no tiene.
  function urlCaratula(albumId, tam = 'chica') {
    const k = albumId + '#' + tam;
    if (!urlsCaratula.has(k)) {
      urlsCaratula.set(k, (async () => {
        try { const c = await leer('caratulas', albumId); const b = c && c[tam === 'grande' ? 'grande' : 'chica']; return b ? URL.createObjectURL(b) : null; }
        catch { return null; }
      })());
    }
    return urlsCaratula.get(k);
  }
  async function guardarPistas(arr) {
    if (!arr.length) return;
    const db = await abrirBD();
    const tx = db.transaction('pistas', 'readwrite');
    const fin = terminar(tx);
    for (const p of arr) tx.objectStore('pistas').put(p);
    await fin;
  }
  const listas = () => todo('listas');
  async function guardarLista(l) {
    const db = await abrirBD();
    const tx = db.transaction('listas', 'readwrite');
    const fin = terminar(tx);
    const id = await pedir(tx.objectStore('listas').put(l));
    await fin;
    return id;
  }
  async function borrarLista(id) {
    const db = await abrirBD();
    const tx = db.transaction('listas', 'readwrite');
    const fin = terminar(tx);
    tx.objectStore('listas').delete(id);
    await fin;
  }
  // Copia de seguridad de lo que no se puede reconstruir escaneando: favoritos y listas.
  async function exportar() {
    return {
      app: 'radio-fortaleza', version: 1, fecha: Date.now(),
      favoritos: cache.pistas.filter(p => p.favorito).map(p => p.ruta),
      listas: (await listas()).map(l => ({ nombre: l.nombre, creada: l.creada, modificada: l.modificada, rutas: l.rutas }))
    };
  }
  async function importar(obj) {
    if (!obj || obj.app !== 'radio-fortaleza' || !Array.isArray(obj.listas) || !Array.isArray(obj.favoritos)) throw new Error('Este archivo no es una copia de la radio');
    const cambiadas = [];
    let sinPista = 0;
    for (const r of obj.favoritos) {
      const p = cache.porRuta.get(r);
      if (!p) { sinPista++; continue; }
      if (!p.favorito) { p.favorito = 1; cambiadas.push(p); }
    }
    await guardarPistas(cambiadas);
    const existentes = await listas();
    let nuevas = 0, unidas = 0;
    for (const l of obj.listas) {
      if (!l || typeof l.nombre !== 'string' || !Array.isArray(l.rutas)) continue;
      const ex = existentes.find(e => e.nombre === l.nombre);
      if (ex) {
        const ya = new Set(ex.rutas);
        const faltan = l.rutas.filter(r => !ya.has(r));
        if (faltan.length) { ex.rutas = ex.rutas.concat(faltan); ex.modificada = Date.now(); await guardarLista(ex); }
        unidas++;
      } else {
        await guardarLista({ nombre: l.nombre, creada: l.creada || Date.now(), modificada: Date.now(), rutas: l.rutas.slice() });
        nuevas++;
      }
    }
    return { favoritos: cambiadas.length, favoritosSinPista: sinPista, listasNuevas: nuevas, listasUnidas: unidas };
  }

  return {
    estado, fuente, cache,
    disponible: () => fuente.disponible(),
    iniciar, elegirCarpeta, volverAConectar, escanear,
    cancelarEscaneo: () => { if (cancelar) cancelar(); },
    alCambiar(f) { oyentes.add(f); return () => oyentes.delete(f); },
    // Consultas (la etapa 3 agrega las de vistas, filtros y listas).
    contarPistas: () => contar('pistas'),
    pistas: () => todo('pistas'),
    albumes: () => todo('albumes'),
    caratula: albumId => leer('caratulas', albumId),
    ultimoEscaneo: () => leer('estado', 'ultimoEscaneo'),
    // Etapa 3: datos en memoria, estado, favoritos y listas.
    cargarDatos, pista: ruta => cache.porRuta.get(ruta) || null, urlCaratula,
    leerEstado: clave => leer('estado', clave), guardarEstado: escribirEstado,
    guardarPistas, listas, guardarLista, borrarLista, exportar, importar
  };
}
