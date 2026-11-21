// LocalPlayer: reproduce la música de la biblioteca (etapa 3).
// Tiene la misma forma que `Radio` para los visualizadores: `nodes`, `ctx`, `active`.
// Un solo <audio> y un solo <video> para toda la sesión: se cambia el `src`, no se crean más
// (cada elemento solo puede pasar una vez por createMediaElementSource).
const GUARDAR_CADA = 5000;
const aleatorioEn = (arr, desde) => {
  for (let i = arr.length - 1; i > desde; i--) {
    const j = desde + Math.floor(Math.random() * (i - desde + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
};
const nombreDe = ruta => String(ruta).split('/').pop().replace(/\.[^.]+$/, '');

export function crearLocal({ radio, bib }) {
  const oyentes = new Set(), errores = new Set();
  let ctx = null, nodes = null, audio = null, video = null, el = null, urlObjeto = null;
  let cola = [], indice = 0, aleatorio = false, repetir = 'no';
  let cargadaRuta = null;   // ruta del archivo que está cargado en `el`
  let posGuardada = 0;      // posición a la que volver al cargar tras restaurar la cola
  let cargando = false, quiere = false, seq = 0, fallosSeguidos = 0, contada = false;
  let portada = { albumId: null, chica: null, grande: null };
  let guardarT = 0, ultimoAviso = 0, listo = false; // listo: ya se intentó restaurar la cola; antes no se guarda nada

  const avisar = () => oyentes.forEach(f => { try { f(); } catch (e) { console.warn(e); } });
  const decir = msg => errores.forEach(f => { try { f(msg); } catch (e) { console.warn(e); } });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // La pista de una ruta; si ya no está en la biblioteca, una ficha mínima marcada como faltante.
  function infoDe(ruta) {
    const p = bib.pista(ruta);
    return p || { ruta, titulo: nombreDe(ruta), artista: '', album: '', albumId: '', tipo: 'audio', duracion: null, faltante: true };
  }

  // ---------- Audio ----------
  function preparar() {
    radio.ensureCtx();
    ctx = radio.ctx;
    if (!ctx) throw new Error('Este navegador no puede reproducir audio');
    if (!nodes) {
      const bus = ctx.createGain();
      const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
      const anLow = ctx.createAnalyser(); anLow.fftSize = 8192; anLow.smoothingTimeConstant = 0;
      const sp = ctx.createChannelSplitter(2);
      const aL = ctx.createAnalyser(); aL.fftSize = 2048;
      const aR = ctx.createAnalyser(); aR.fftSize = 2048;
      bus.connect(ctx.destination); bus.connect(an); bus.connect(anLow);
      bus.connect(sp); sp.connect(aL, 0); sp.connect(aR, 1);
      nodes = { src: bus, an, anLow, sp, aL, aR };
    }
    if (!audio) audio = nuevoElemento('audio');
  }
  function nuevoElemento(tag) {
    const e = document.createElement(tag);
    e.preload = 'auto';
    if (tag === 'video') { e.playsInline = true; e.setAttribute('playsinline', ''); e.disablePictureInPicture = true; }
    ctx.createMediaElementSource(e).connect(nodes.src);
    for (const ev of ['play', 'pause', 'playing', 'waiting', 'seeked']) e.addEventListener(ev, () => { if (e === el) avisar(); });
    e.addEventListener('playing', () => { if (e === el) contarReproduccion(); });
    e.addEventListener('timeupdate', () => {
      if (e !== el) return;
      const t = performance.now();
      if (t - ultimoAviso > 250) { ultimoAviso = t; avisar(); }
    });
    for (const ev of ['loadedmetadata', 'durationchange']) e.addEventListener(ev, () => { if (e === el) alDuracion(); });
    e.addEventListener('ended', () => { if (e === el) siguiente(true); });
    e.addEventListener('error', () => { if (e === el && e.getAttribute('src')) fallo('Este archivo no se puede abrir en este dispositivo'); });
    return e;
  }
  const asegurarVideo = () => video || (video = nuevoElemento('video'));

  function alDuracion() {
    const p = bib.pista(cola[indice]);
    if (p && !p.duracion && isFinite(el.duration) && el.duration > 0) {
      p.duracion = Math.round(el.duration * 10) / 10;
      bib.guardarPistas([p]).catch(() => {});
    }
    avisar();
  }
  function contarReproduccion() {
    if (contada) return;
    contada = true; fallosSeguidos = 0;
    const p = bib.pista(cola[indice]);
    if (!p) return;
    p.reproducciones = (p.reproducciones || 0) + 1; p.ultimaVez = Date.now();
    bib.guardarPistas([p]).catch(() => {});
  }
  async function cargarPortada(p) {
    const albumId = p && p.albumId;
    if (portada.albumId === albumId) return;
    portada = { albumId, chica: null, grande: null };
    if (!albumId) { avisar(); return; }
    const [chica, grande] = await Promise.all([bib.urlCaratula(albumId, 'chica'), bib.urlCaratula(albumId, 'grande')]);
    if (portada.albumId !== albumId) return;
    portada = { albumId, chica, grande };
    avisar();
  }

  // ---------- Cargar y reproducir ----------
  function fallo(msg) {
    decir(msg);
    cargando = false;
    fallosSeguidos++;
    if (fallosSeguidos >= cola.length) { // ninguna se pudo abrir: no dar vueltas
      quiere = false; fallosSeguidos = 0;
      if (el) el.pause();
      avisar();
      return false;
    }
    siguiente(true, true);
    return false;
  }
  async function cargar(i, { posicion = 0, iniciar = true } = {}) {
    const mi = ++seq;
    indice = clamp(i, 0, cola.length - 1);
    const ruta = cola[indice];
    const p = infoDe(ruta);
    contada = false; cargando = true; quiere = iniciar;
    cargarPortada(p);
    avisar();
    let archivo;
    try {
      if (p.faltante) throw new Error('falta');
      archivo = await bib.fuente.abrir(ruta);
    } catch {
      if (mi !== seq) return false;
      return fallo(bib.fuente.conectada ? 'Este archivo no se puede abrir en este dispositivo' : 'No encuentro la carpeta de música');
    }
    if (mi !== seq) return false;
    const nuevoUrl = archivo.url || URL.createObjectURL(archivo); // en la APK, archivo.url apunta a /_musica_/
    const e = p.tipo === 'video' ? asegurarVideo() : audio;
    const otro = e === audio ? video : audio;
    if (otro && otro.getAttribute('src')) { otro.pause(); otro.removeAttribute('src'); otro.load(); }
    el = e;
    e.src = nuevoUrl;
    if (urlObjeto && urlObjeto.startsWith('blob:')) URL.revokeObjectURL(urlObjeto);
    urlObjeto = nuevoUrl;
    cargadaRuta = ruta;
    if (posicion > 0) e.addEventListener('loadedmetadata', () => { try { e.currentTime = posicion; } catch { /* */ } }, { once: true });
    if (iniciar) {
      try { await e.play(); }
      catch (err) {
        if (mi !== seq) return false;
        cargando = false;
        if (err && err.name === 'NotAllowedError') { quiere = false; avisar(); return false; }
        if (err && err.name === 'AbortError') return false; // otra carga la reemplazó
        return fallo('Este archivo no se puede abrir en este dispositivo');
      }
    }
    if (mi !== seq) return false;
    cargando = false;
    guardar(); avisar();
    return true;
  }

  async function reproducirLista(rutas, i = 0, o = {}) {
    if (!rutas.length) return false;
    preparar(); listo = true;
    cola = rutas.slice(); indice = clamp(i, 0, cola.length - 1); posGuardada = 0; fallosSeguidos = 0;
    if (o.aleatorio !== undefined) aleatorio = !!o.aleatorio;
    if (aleatorio) aleatorioEn(cola, indice);
    return cargar(indice);
  }
  // «Aleatorio»: mezcla toda la lista y empieza por una al azar.
  async function reproducirAleatorio(rutas) {
    if (!rutas.length) return false;
    preparar(); listo = true;
    const mezcla = rutas.slice();
    aleatorioEn(mezcla, -1);
    cola = mezcla; indice = 0; aleatorio = true; posGuardada = 0; fallosSeguidos = 0;
    return cargar(0);
  }
  async function reanudar() {
    if (!cola.length) return false;
    preparar();
    quiere = true;
    if (el && cargadaRuta === cola[indice] && el.getAttribute('src')) {
      try { await el.play(); avisar(); return true; } catch { quiere = false; avisar(); return false; }
    }
    const pos = posGuardada; posGuardada = 0;
    return cargar(indice, { posicion: pos });
  }
  function pausar() {
    quiere = false;
    if (el) el.pause();
    guardarYa(); avisar();
  }
  const alternar = () => (sonando() ? (pausar(), Promise.resolve(false)) : reanudar());

  function siguiente(auto = false, saltando = false) {
    if (!cola.length) return;
    if (auto && !saltando && repetir === 'una' && el) { el.currentTime = 0; el.play().catch(() => {}); return; }
    let j = indice + 1;
    if (j >= cola.length) {
      if (repetir === 'todo') j = 0;
      else {
        if (auto) { // terminó la última sin repetir: se detiene y queda en pausa
          quiere = false; cargando = false;
          if (el) { el.pause(); try { el.currentTime = 0; } catch { /* */ } }
          guardarYa(); avisar();
        }
        return;
      }
    }
    quiere = true;
    cargar(j);
  }
  function anterior() {
    if (!cola.length) return;
    if (tiempo() > 3 || !cola.length) { buscar(0); return; }
    if (indice > 0) cargar(indice - 1);
    else if (repetir === 'todo') cargar(cola.length - 1);
    else buscar(0);
  }
  function buscar(seg) {
    if (el && cargadaRuta === cola[indice]) {
      try { el.currentTime = clamp(seg, 0, isFinite(el.duration) ? el.duration : seg); } catch { /* */ }
    } else posGuardada = Math.max(0, seg);
    guardar(); avisar();
  }
  const saltar = delta => buscar(tiempo() + delta);
  function saltarA(i) { if (i >= 0 && i < cola.length) { quiere = true; cargar(i); } }

  // ---------- Cola ----------
  function agregarSiguiente(rutas) { cola.splice(indice + 1, 0, ...rutas); guardar(); avisar(); }
  function agregarAlFinal(rutas) { cola.push(...rutas); guardar(); avisar(); }
  function quitar(i) {
    if (i < 0 || i >= cola.length) return;
    const eraActual = i === indice;
    cola.splice(i, 1);
    if (i < indice) indice--;
    if (eraActual) {
      if (!cola.length) { indice = 0; quiere = false; if (el) el.pause(); cargadaRuta = null; posGuardada = 0; }
      else {
        indice = Math.min(i, cola.length - 1);
        if (quiere) cargar(indice); else { cargadaRuta = null; posGuardada = 0; }
      }
    }
    guardar(); avisar();
  }
  function mover(de, a) {
    if (de === a || de < 0 || a < 0 || de >= cola.length || a >= cola.length) return;
    const [x] = cola.splice(de, 1);
    cola.splice(a, 0, x);
    if (indice === de) indice = a;
    else if (de < indice && a >= indice) indice--;
    else if (de > indice && a <= indice) indice++;
    guardar(); avisar();
  }
  // «Vaciar»: quita lo que viene después; lo que suena sigue sonando.
  function vaciar() { cola.length = Math.min(cola.length, indice + 1); guardar(); avisar(); }
  function setAleatorio(b) {
    aleatorio = !!b;
    if (aleatorio) aleatorioEn(cola, indice);
    guardar(); avisar();
  }
  function ciclarRepetir() { repetir = repetir === 'no' ? 'todo' : repetir === 'todo' ? 'una' : 'no'; guardar(); avisar(); }

  // ---------- Estado ----------
  const tiempo = () => (el && cargadaRuta === cola[indice] ? (el.currentTime || 0) : posGuardada);
  const duracion = () => {
    if (el && cargadaRuta === cola[indice] && isFinite(el.duration) && el.duration > 0) return el.duration;
    const p = cola.length ? bib.pista(cola[indice]) : null;
    return (p && p.duracion) || 0;
  };
  const activa = () => !!(el && !el.paused && !el.ended);
  const sonando = () => activa() || (quiere && cargando);

  // ---------- Guardar y restaurar ----------
  function guardarYa() {
    clearTimeout(guardarT);
    if (!listo) return;
    bib.guardarEstado('cola', { rutas: cola, indice, posicion: tiempo(), aleatorio, repetir }).catch(() => {});
  }
  function guardar() { clearTimeout(guardarT); guardarT = setTimeout(guardarYa, 400); }
  setInterval(() => { if (activa()) guardarYa(); }, GUARDAR_CADA);
  addEventListener('pagehide', guardarYa);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') guardarYa(); });

  // Vuelve a poner la cola de la última vez, en pausa, sin abrir ningún archivo.
  async function restaurar() {
    let s = null;
    try { s = await bib.leerEstado('cola'); } catch { /* */ }
    if (cola.length) { listo = true; return false; }
    listo = true;
    if (!s || !Array.isArray(s.rutas) || !s.rutas.length) return false;
    cola = s.rutas.filter(r => typeof r === 'string');
    indice = clamp(s.indice | 0, 0, cola.length - 1);
    posGuardada = Math.max(0, +s.posicion || 0);
    aleatorio = !!s.aleatorio;
    repetir = ['no', 'todo', 'una'].includes(s.repetir) ? s.repetir : 'no';
    cargarPortada(infoDe(cola[indice]));
    avisar();
    return true;
  }

  return {
    preparar, restaurar,
    get ctx() { return ctx; },
    get nodes() { return nodes; },
    get active() { return activa(); },
    get sonando() { return sonando(); },
    get cola() { return cola; },
    get indice() { return indice; },
    get hayCola() { return cola.length > 0; },
    get pista() { return cola.length ? infoDe(cola[indice]) : null; },
    get aleatorio() { return aleatorio; },
    get repetir() { return repetir; },
    get portada() { return portada; },
    get video() { return video; },
    get esVideo() { const p = cola.length ? bib.pista(cola[indice]) : null; return !!(p && p.tipo === 'video'); },
    tiempo, duracion, infoDe,
    reproducirLista, reproducirAleatorio, reanudar, pausar, alternar, siguiente: () => siguiente(false), anterior, buscar, saltar, saltarA,
    agregarSiguiente, agregarAlFinal, quitar, mover, vaciar, setAleatorio, ciclarRepetir,
    alCambio(f) { oyentes.add(f); return () => oyentes.delete(f); },
    alError(f) { errores.add(f); return () => errores.delete(f); }
  };
}
