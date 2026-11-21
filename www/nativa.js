// Solo dentro de la APK (Capacitor). En el navegador no hace nada.
// Reemplaza navigator.mediaSession por una que habla con el servicio nativo (MusicaServicio): notificación con carátula,
// pantalla de bloqueo, Bluetooth y botones del volante. fuentes.js la usa igual que la del navegador.
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var M = window.radioMusica || (window.radioMusica = C.registerPlugin('Musica'));

  var manejadores = {}, meta = null, estado = 'none', pos = null;
  var portadaSrc = null, temporizador = 0, enviando = false, otraVez = false;

  function MediaMetadataNativa(o) {
    o = o || {};
    this.title = o.title || ''; this.artist = o.artist || ''; this.album = o.album || '';
    this.artwork = o.artwork || [];
  }
  window.MediaMetadata = MediaMetadataNativa;

  function aBase64(src) {
    return fetch(src).then(function (r) { if (!r.ok) throw new Error('portada'); return r.blob(); }).then(function (b) {
      return new Promise(function (ok, mal) {
        var f = new FileReader();
        f.onload = function () { var s = String(f.result); ok(s.slice(s.indexOf(',') + 1)); };
        f.onerror = mal;
        f.readAsDataURL(b);
      });
    });
  }

  function enviar() {
    if (enviando) { otraVez = true; return; }
    enviando = true;
    var m = meta || {};
    var arte = m.artwork && m.artwork.length ? m.artwork[m.artwork.length - 1].src : null;
    var datos = {
      titulo: m.title || 'La Fortaleza Radio', artista: m.artist || '', album: m.album || '',
      reproduciendo: estado === 'playing',
      duracion: pos && pos.duration > 0 ? pos.duration : -1,
      posicion: pos && pos.duration > 0 ? (pos.position || 0) : -1,
      acciones: Object.keys(manejadores).filter(function (k) { return !!manejadores[k]; })
    };
    var portada = Promise.resolve();
    if (arte !== portadaSrc) {
      portadaSrc = arte;
      if (arte) portada = aBase64(arte).then(function (b) { datos.portada = b; }).catch(function () { datos.sinPortada = true; });
      else datos.sinPortada = true;
    }
    portada.then(function () { return M.actualizar(datos); }).catch(function (e) { console.warn('Sesión nativa', e); })
      .then(function () { enviando = false; if (otraVez) { otraVez = false; enviar(); } });
  }
  function programar() { clearTimeout(temporizador); temporizador = setTimeout(enviar, 60); }

  var sesion = {
    get metadata() { return meta; },
    set metadata(v) { meta = v; programar(); },
    get playbackState() { return estado; },
    set playbackState(v) { if (v !== estado) { estado = v; programar(); } },
    setActionHandler: function (accion, f) {
      var antes = !!manejadores[accion];
      manejadores[accion] = f || null;
      if (antes !== !!f) programar();
    },
    setPositionState: function (p) {
      pos = p && p.duration > 0 ? { duration: p.duration, position: p.position || 0 } : null;
      programar();
    }
  };
  try { Object.defineProperty(navigator, 'mediaSession', { value: sesion, configurable: true }); }
  catch (e) { console.warn('No pude poner la sesión nativa', e); }

  M.addListener('accion', function (e) {
    var f = manejadores[e.accion];
    if (!f) return;
    try { f({ action: e.accion, seekTime: e.posicion, seekOffset: 10 }); } catch (err) { console.warn(err); }
  });
})();
