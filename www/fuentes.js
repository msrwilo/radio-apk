// Fuentes de audio de la radio: radio, local y dispositivo.
// Un solo lugar decide cuál suena y mantiene al día la sesión de medios del sistema.
const NOMBRES = ['radio', 'local', 'device'];

export function crearFuentes({ defs, inicial = 'radio' }) {
  let actual = inicial;
  let cambiando = false;
  const oyentes = new Set();
  const avisar = previa => oyentes.forEach(f => { try { f(actual, previa); } catch (e) { console.warn(e); } });

  // setSource(s, { iniciar: false }) cambia la fuente sin arrancarla.
  // Si la fuente nueva no puede prepararse (por ejemplo, el usuario cancela el permiso), no cambia nada y lanza el error.
  async function setSource(s, opciones = {}) {
    if (!NOMBRES.includes(s) || !defs[s]) return false;
    if (s === actual) return true;
    if (cambiando) return false;
    cambiando = true;
    try {
      const sig = defs[s], prev = defs[actual], previa = actual;
      if (sig.preparar) await sig.preparar();
      try { if (prev && prev.parar) prev.parar(); } catch (e) { console.warn(e); }
      actual = s;
      if (opciones.iniciar !== false && sig.iniciar) sig.iniciar();
      avisar(previa);
      return true;
    } finally { cambiando = false; }
  }

  return {
    get source() { return actual; },
    setSource,
    onChange(f) { oyentes.add(f); return () => oyentes.delete(f); }
  };
}

// Sesión de medios del sistema (notificación, pantalla de bloqueo, Bluetooth, botones del coche).
//   acciones.radio: play y pausa.  acciones.local: play, pausa, anterior, siguiente, avance y retroceso.
// actualizar({ fuente, reproduciendo, titulo, artista, album, portada, portadaTipo, duracion, posicion })
const ACCIONES = ['play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward'];
export function crearSesionMedios({ acciones, icono }) {
  const ms = 'mediaSession' in navigator ? navigator.mediaSession : null;
  let modo = null, claveMeta = '', posT = 0, posClave = '';
  const iconos = () => [
    { src: new URL('icon-192.png', location.href).href, sizes: '192x192', type: 'image/png' },
    { src: new URL(icono || 'icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' }
  ];
  function manejadores(m) {
    if (m === modo) return;
    modo = m;
    const set = acciones[m] || {};
    for (const n of ACCIONES) { try { ms.setActionHandler(n, set[n] || null); } catch { /* este navegador no la tiene */ } }
  }
  return function actualizar(d) {
    if (!ms) return;
    try {
      const m = d.fuente === 'local' ? 'local' : d.fuente === 'remoto' ? 'remoto' : 'radio';
      manejadores(m);
      const clave = [d.fuente, d.titulo, d.artista, d.album, d.portada].join('|');
      if (window.MediaMetadata && clave !== claveMeta) {
        claveMeta = clave;
        ms.metadata = new MediaMetadata({
          title: d.titulo, artist: d.artista || '', album: d.album || '',
          artwork: d.portada ? [{ src: d.portada, sizes: '600x600', type: d.portadaTipo || 'image/jpeg' }] : iconos()
        });
      }
      ms.playbackState = d.reproduciendo ? 'playing' : 'paused';
      if (ms.setPositionState) {
        if (m === 'local' && isFinite(d.duracion) && d.duracion > 0) {
          const pos = Math.max(0, Math.min(d.posicion || 0, d.duracion));
          const k = [d.duracion, d.reproduciendo].join('|'), t = performance.now();
          if (k !== posClave || t - posT > 1000) {
            posClave = k; posT = t;
            ms.setPositionState({ duration: d.duracion, playbackRate: 1, position: pos });
          }
        } else if (posClave) { posClave = ''; ms.setPositionState(); }
      }
    } catch { /* */ }
  };
}
