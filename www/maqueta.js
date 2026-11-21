// Maqueta navegable del reproductor (etapa 3): abre `/radio/beta/?maqueta=1`.
// Misma interfaz que la biblioteca real, pero con datos inventados y en memoria: no toca IndexedDB, no pide carpeta
// y el audio es un tono suave generado al vuelo. Sirve para ver y aprobar las pantallas en cualquier dispositivo.
//   ?maqueta=1        biblioteca llena
//   ?maqueta=vacia    primera vez (elegir carpeta → escaneo de mentira → biblioteca)
//   ?maqueta=permiso  carpeta guardada pero sin permiso
import { normalizar } from './biblioteca.js?v=2';

const ARTISTAS = [
  { n: 'Marea Alta', g: 'Rock', a: [['Salitre', 1998], ['Muelle viejo', 2003], ['Faro', 2011]] },
  { n: 'Lucía Almazán', g: 'Pop', a: [['Cartas sin sobre', 2015], ['Domingo largo', 2019]] },
  { n: 'Los Cántaros', g: 'Folk', a: [['Barro y viento', 1984], ['Cosecha', 1989], ['Fiesta de agua', 1996]] },
  { n: 'Tierra Quemada', g: 'Rock', a: [['Cenizas', 2001], ['Brasa', 2006]] },
  { n: 'Noche de Neón', g: 'Electrónica', a: [['Autopista', 2017], ['Luces largas', 2021]] },
  { n: 'Sol de Piedra', g: 'Cumbia', a: [['Bailongo', 1992], ['Verbena', 1999], ['Sábado', 2008]] },
  { n: 'Ágata Rivas', g: 'Jazz', a: [['Café y humo', 1976], ['Última mesa', 1981]] },
  { n: 'El Ñandú', g: 'Indie', a: [['Plumas', 2012], ['Corre', 2014]] },
  { n: 'Orquesta del Valle', g: 'Clásica', a: [['Estaciones del valle', 1971]] },
  { n: 'Dani Quiroga', g: 'Hip-Hop', a: [['Barrio alto', 2018], ['Calle abajo', 2022]] }
];
const NOMBRES = [['noche', 'f'], ['casa', 'f'], ['lluvia', 'f'], ['ciudad', 'f'], ['sombra', 'f'], ['ventana', 'f'], ['carretera', 'f'], ['fiesta', 'f'], ['memoria', 'f'], ['tierra', 'f'], ['luz', 'f'], ['canción', 'f'], ['puerta', 'f'], ['tarde', 'f'],
  ['mar', 'm'], ['sol', 'm'], ['camino', 'm'], ['río', 'm'], ['viento', 'm'], ['muelle', 'm'], ['barrio', 'm'], ['humo', 'm']];
const ARTS = { f: ['La', 'Mi', 'Tu', 'Esta', 'Aquella'], m: ['El', 'Mi', 'Tu', 'Este', 'Aquel'] };
const FIN = ['de abril', 'sin nombre', 'de papel', 'del sur', 'que vuelve', 'en llamas', 'de sal', 'otra vez', 'de barro', 'de vidrio'];
const tituloAzar = rnd => { const [n, g] = NOMBRES[Math.floor(rnd() * NOMBRES.length)]; const a = ARTS[g]; return `${a[Math.floor(rnd() * a.length)]} ${n}${rnd() < 0.45 ? ' ' + FIN[Math.floor(rnd() * FIN.length)] : ''}`; };

function prng(semilla) { let s = semilla >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hash(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const ARTICULOS = /^(el|la|los|las|un|una|unos|unas|the|a|an)\s+/;
const sinArticulo = t => { const n = normalizar(t); return n.replace(ARTICULOS, '') || n; };
const inicialDe = t => { const c = sinArticulo(t).replace(/^[^a-z0-9]+/, '').charAt(0).toUpperCase(); return c >= 'A' && c <= 'Z' ? c : '#'; };

function generar() {
  const pistas = [], albumes = new Map(), ahora = Date.now();
  let id = 0;
  const poner = (artista, artistaAlbum, album, anio, genero, n, rnd) => {
    const albumId = normalizar(artistaAlbum || artista) + '|' + normalizar(album);
    const usados = new Set();
    for (let i = 1; i <= n; i++) {
      let titulo; do { titulo = tituloAzar(rnd); } while (usados.has(titulo));
      usados.add(titulo);
      const art = artistaAlbum === 'Varios' ? ARTISTAS[Math.floor(rnd() * ARTISTAS.length)].n : artista;
      const ruta = `${artistaAlbum || artista}/${album}/${String(i).padStart(2, '0')} ${titulo}.mp3`;
      pistas.push({
        id: ++id, ruta, archivo: ruta.split('/').pop(), carpeta: `${artistaAlbum || artista}/${album}`, tipo: 'audio',
        titulo, artista: art, artistaAlbum: artistaAlbum || '', album, genero, anio, pista: i, disco: 1, albumId,
        duracion: Math.round(140 + rnd() * 190), tamano: 3e6 + Math.floor(rnd() * 4e6), modificado: ahora - Math.floor(rnd() * 4e10),
        inicial: inicialDe(titulo), orden: sinArticulo(titulo), favorito: rnd() < 0.06 ? 1 : 0,
        agregado: ahora - Math.floor(rnd() * 90) * 864e5, ultimaVez: null, reproducciones: Math.floor(rnd() * 20)
      });
    }
    albumes.set(albumId, { id: albumId, nombre: album, artista: artistaAlbum || artista, anio, numPistas: n, tieneCaratula: album !== 'Corre' && album !== 'Brasa' });
  };
  for (const a of ARTISTAS) for (const [album, anio] of a.a) { const rnd = prng(hash(a.n + album)); poner(a.n, '', album, anio, a.g, 7 + Math.floor(rnd() * 5), rnd); }
  poner('Varios', 'Varios', 'Compilado raro', 2003, 'Electrónica', 6, prng(7));
  return { pistas, albumes };
}

function portadaSvg(id) {
  const h = hash(id) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 42% 40%)"/><stop offset="1" stop-color="hsl(${(h + 55) % 360} 38% 20%)"/></linearGradient></defs><rect width="120" height="120" fill="url(#g)"/><circle cx="60" cy="60" r="32" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="3"/><circle cx="60" cy="60" r="9" fill="rgba(255,255,255,.45)"/><path d="M0 100 Q40 80 80 98 T120 90 V120 H0Z" fill="rgba(0,0,0,.25)"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// Tono suave con un pulso grave cada medio segundo, para que los visualizadores tengan algo que seguir.
function crearWav(dur, semilla) {
  const sr = 8000, n = Math.floor(sr * Math.min(dur, 420)), buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const txt = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  txt(0, 'RIFF'); v.setUint32(4, 36 + n, true); txt(8, 'WAVE'); txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); txt(36, 'data'); v.setUint32(40, n, true);
  const base = 110 * Math.pow(2, (semilla % 12) / 12), TAU = Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = i / sr, f = (t * 2) % 1;
    const kick = Math.exp(-f * 8) * Math.sin(TAU * (50 + 90 * Math.exp(-f * 25)) * f);
    const pad = 0.10 * Math.sin(TAU * base * t) + 0.07 * Math.sin(TAU * base * 1.5 * t) * (0.6 + 0.4 * Math.sin(TAU * 0.25 * t));
    const hat = ((t * 4 + 0.5) % 1) < 0.03 ? (Math.random() - 0.5) * 0.12 : 0;
    const s = Math.max(-1, Math.min(1, 0.32 * kick + pad + hat));
    v.setUint8(44 + i, 128 + Math.round(s * 100));
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export function crearBibliotecaMaqueta({ modo = '1' } = {}) {
  const oyentes = new Set(), mem = new Map();
  const base = generar();
  const cache = { pistas: [], porRuta: new Map(), albumes: new Map(), version: 0 };
  const estado = { fase: 'inicio', carpeta: 'Música (maqueta)', total: 0, albumes: 0, ultimoEscaneo: null, progreso: null, error: '' };
  let listas = [], sigId = 1, cancelado = false, cargada = false;
  const avisar = () => oyentes.forEach(f => { try { f(estado); } catch (e) { console.warn(e); } });
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  function cargarDatos() {
    cache.pistas = cargada ? base.pistas : [];
    cache.porRuta = new Map(cache.pistas.map(p => [p.ruta, p]));
    cache.albumes = cargada ? base.albumes : new Map();
    cache.version++;
    estado.total = cache.pistas.length; estado.albumes = cache.albumes.size;
    return Promise.resolve(cache);
  }
  const fuente = {
    conectada: true, nombre: 'Música (maqueta)', disponible: () => true,
    abrir: ruta => { const p = cache.porRuta.get(ruta); if (!p) return Promise.reject(new Error('no está')); return Promise.resolve(crearWav(p.duracion || 180, hash(ruta))); }
  };

  return {
    esMaqueta: true, estado, fuente, cache,
    disponible: () => true,
    async iniciar() {
      if (modo === 'vacia') { estado.fase = 'sin-carpeta'; }
      else if (modo === 'permiso') { estado.fase = 'permiso'; }
      else { cargada = true; await cargarDatos(); estado.fase = 'lista'; estado.ultimoEscaneo = { fecha: Date.now() - 36e5, total: estado.total, nuevas: 0, cambiadas: 0, quitadas: 0, errores: 0, duracionMs: 3400 }; }
      avisar(); return estado;
    },
    async elegirCarpeta() { estado.fase = 'lista'; estado.error = ''; avisar(); return true; },
    async volverAConectar() { estado.fase = 'lista'; avisar(); return true; },
    async escanear() {
      if (estado.fase === 'escaneando') return null;
      cancelado = false; estado.fase = 'escaneando'; estado.error = '';
      const t0 = performance.now(), total = base.pistas.length;
      estado.progreso = { etapa: 'buscando', hecho: 0, de: 0 }; avisar();
      for (let i = 0; i <= 20 && !cancelado; i++) { estado.progreso = { etapa: 'buscando', hecho: i * 21, de: 0 }; avisar(); await esperar(50); }
      for (let i = 0; i <= 40 && !cancelado; i++) { estado.progreso = { etapa: 'leyendo', hecho: Math.round(total * i / 40), de: total }; avisar(); await esperar(50); }
      if (!cancelado) { cargada = true; await cargarDatos(); estado.ultimoEscaneo = { fecha: Date.now(), total, nuevas: total, cambiadas: 0, quitadas: 0, errores: 0, duracionMs: Math.round(performance.now() - t0) }; }
      estado.progreso = null; estado.fase = 'lista'; avisar();
      return estado.ultimoEscaneo;
    },
    cancelarEscaneo() { cancelado = true; },
    alCambiar(f) { oyentes.add(f); return () => oyentes.delete(f); },
    cargarDatos, pista: ruta => cache.porRuta.get(ruta) || null,
    urlCaratula: (albumId) => { const a = cache.albumes.get(albumId); return Promise.resolve(a && a.tieneCaratula ? portadaSvg(albumId) : null); },
    leerEstado: async k => mem.get(k) || null,
    guardarEstado: async (k, v) => { mem.set(k, JSON.parse(JSON.stringify(v))); },
    guardarPistas: async () => {},
    listas: async () => listas.map(l => ({ ...l, rutas: l.rutas.slice() })),
    async guardarLista(l) { if (!l.id) l.id = sigId++; const i = listas.findIndex(x => x.id === l.id); const c = { ...l, rutas: l.rutas.slice() }; if (i < 0) listas.push(c); else listas[i] = c; return l.id; },
    async borrarLista(id) { listas = listas.filter(l => l.id !== id); },
    async exportar() { return { app: 'radio-fortaleza', version: 1, fecha: Date.now(), favoritos: cache.pistas.filter(p => p.favorito).map(p => p.ruta), listas: listas.map(l => ({ nombre: l.nombre, creada: l.creada, modificada: l.modificada, rutas: l.rutas })) }; },
    async importar(o) {
      if (!o || o.app !== 'radio-fortaleza') throw new Error('Este archivo no es una copia de la radio');
      let f = 0; for (const r of o.favoritos || []) { const p = cache.porRuta.get(r); if (p && !p.favorito) { p.favorito = 1; f++; } }
      for (const l of o.listas || []) listas.push({ id: sigId++, nombre: l.nombre, creada: l.creada, modificada: Date.now(), rutas: l.rutas.slice() });
      return { favoritos: f, favoritosSinPista: 0, listasNuevas: (o.listas || []).length, listasUnidas: 0 };
    }
  };
}
