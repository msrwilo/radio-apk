// Hoja «Ahora suena» y cola de reproducción (etapa 3).
import { esc, ic, tiempo, crearHoja, ordenable, crearCaratulas, confirmar } from './ui-comun.js?v=1';

// Fila de la cola. `dato` = { i (posición en la cola), p (pista), actual }
function filaCola(cat, { i, p, actual }) {
  const art = cat.html({ albumId: p.albumId, tieneCaratula: !p.faltante, inicial: p.titulo });
  return `<div class="fila fila-cola${actual ? ' suena' : ''}${p.faltante ? ' falta' : ''}" data-i="${i}" data-r="${esc(p.ruta)}">
    <button type="button" class="fila-asa" data-asa aria-label="Arrastrar para mover">${ic('asa')}</button>
    <span class="fila-art">${art}</span>
    <span class="fila-txt"><b>${esc(p.titulo)}</b><small>${p.faltante ? 'No encontrada' : esc([p.artista, p.album].filter(Boolean).join(' · ') || 'Artista desconocido')}</small></span>
    <span class="fila-t">${esc(tiempo(p.duracion))}</span>
  </div>`;
}

// Dibuja la cola dentro de `cont` (hoja o columna). Devuelve { pintar }.
export function crearCola({ cont, local, bib }) {
  const cat = crearCaratulas(bib);
  cont.classList.add('cola');
  cont.innerHTML = `<div class="cola-cab"><b>Cola</b><button type="button" class="boton chico" data-vaciar>Vaciar</button></div>
    <div class="cola-scroll"><h4 class="cola-tit">Sonando</h4><div class="cola-ahora"></div><h4 class="cola-tit">A continuación</h4><div class="cola-sig"></div></div>`;
  const aqui = cont.querySelector('.cola-ahora'), sig = cont.querySelector('.cola-sig');
  const scroll = cont.querySelector('.cola-scroll');
  let ultima = '';

  function pintar() {
    const c = local.cola, k = local.indice;
    const clave = c.join('\n') + '#' + k + '#' + bib.cache.version;
    if (clave === ultima) return;
    ultima = clave;
    cont.classList.toggle('vacia', !c.length);
    aqui.innerHTML = c.length ? filaCola(cat, { i: k, p: local.infoDe(c[k]), actual: true }) : '<p class="vacio-txt">No hay nada en la cola.</p>';
    sig.innerHTML = c.slice(k + 1).map((r, j) => filaCola(cat, { i: k + 1 + j, p: local.infoDe(r), actual: false })).join('') ||
      (c.length ? '<p class="vacio-txt">Nada más después de esta.</p>' : '');
    cat.cargar(cont);
  }
  ordenable(sig, {
    alMover: (de, a) => local.mover(local.indice + 1 + de, local.indice + 1 + a),
    alQuitar: i => local.quitar(local.indice + 1 + i)
  });
  cont.addEventListener('click', async e => {
    if (e.target.closest('[data-vaciar]')) {
      if (local.cola.length > 1 && await confirmar({ titulo: 'Vaciar la cola', texto: 'Se quita lo que viene después. Lo que suena sigue sonando.', boton: 'Vaciar', peligro: true })) local.vaciar();
      return;
    }
    const f = e.target.closest('.fila-cola');
    if (f && !e.target.closest('[data-asa]') && !f.classList.contains('suena')) local.saltarA(+f.dataset.i);
  });
  const baja = local.alCambio(pintar);
  pintar();
  return { pintar, cont, scroll, destruir: baja };
}

export function crearAhoraSuena({ local, bib, store, alVisuales, alRadio, irA, alternarFavorito, esFavorito }) {
  const cat = crearCaratulas(bib);
  let hoja = null, raf = 0, fondoUrl = '', quitarOyente = () => {};
  const guardado = (() => { try { return JSON.parse(store.get('radio.reproductor') || '{}'); } catch { return {}; } })();
  let ver = ['caratula', 'video', 'visuales'].includes(guardado.ver) ? guardado.ver : 'caratula';
  if (ver === 'visuales') ver = 'caratula';

  const html = () => `
    <div class="ahora-fondo" aria-hidden="true"><img alt=""></div>
    <header class="ahora-cab">
      <button type="button" class="ic-btn" data-a="cerrar" aria-label="Cerrar">${ic('abajo')}</button>
      <div class="seg ahora-ver" role="tablist" aria-label="Qué mostrar">
        <button type="button" data-ver="caratula">Carátula</button><button type="button" data-ver="video">Video</button><button type="button" data-ver="visuales">Visuales</button>
      </div>
      <button type="button" class="ic-btn" data-a="radio" aria-label="Oír la radio en vivo" title="Oír la radio en vivo">${ic('radio')}</button>
    </header>
    <div class="ahora-cuerpo">
      <div class="ahora-arte"><div class="ahora-marco"></div></div>
      <div class="ahora-ctl">
        <div class="ahora-info"><b data-x="titulo"></b><div class="ahora-enlaces"><button type="button" data-ir="artista" data-x="artista"></button><span>·</span><button type="button" data-ir="album" data-x="album"></button></div></div>
        <div class="ahora-avance"><time data-x="t0">0:00</time><input type="range" min="0" max="1000" value="0" step="1" aria-label="Posición" data-x="rango"><time data-x="t1">0:00</time></div>
        <div class="ahora-transp">
          <button type="button" class="t-chico" data-a="aleatorio" aria-label="Aleatorio">${ic('aleatorio')}</button>
          <button type="button" class="t-medio" data-a="ant" aria-label="Anterior">${ic('ant')}</button>
          <button type="button" class="t-play" data-a="play" aria-label="Reproducir o pausar"><span class="i-play">${ic('play')}</span><span class="i-pausa">${ic('pausa')}</span></button>
          <button type="button" class="t-medio" data-a="sig" aria-label="Siguiente">${ic('sig')}</button>
          <button type="button" class="t-chico" data-a="repetir" aria-label="Repetir">${ic('repetir')}<i class="uno">1</i></button>
        </div>
        <div class="ahora-extra">
          <button type="button" data-a="fav" aria-label="Favorito">${ic('corazon')}</button>
          <button type="button" data-a="menos" aria-label="Retroceder 10 segundos">${ic('atras10')}</button>
          <button type="button" data-a="mas" aria-label="Adelantar 10 segundos">${ic('adelante10')}</button>
          <button type="button" data-a="cola" aria-label="Cola">${ic('cola')}<span>Cola</span></button>
        </div>
      </div>
    </div>`;

  function abrir() {
    if (hoja && !hoja.cerrada) return;
    hoja = crearHoja({ titulo: 'Ahora suena', clase: 'hoja-ahora', sinCabecera: true, html: html(), alCerrar: () => { cancelAnimationFrame(raf); raf = 0; quitarOyente(); hoja = null; } });
    const el = hoja.cuerpo;
    hoja.hoja.querySelector('.hoja-asa').classList.add('sobre');
    const x = k => el.querySelector(`[data-x="${k}"]`);
    const rango = x('rango');
    let arrastrando = false;
    // Mientras se arrastra solo se mueve la barra; al soltar se salta a ese punto.
    rango.addEventListener('pointerdown', () => { arrastrando = true; });
    rango.addEventListener('input', () => { arrastrando = true; const d = local.duracion(); if (d > 0) { x('t0').textContent = tiempo(rango.value / 1000 * d); x('t1').textContent = '-' + tiempo(Math.max(0, d - rango.value / 1000 * d)); pintarRango(rango.value / 1000); } });
    rango.addEventListener('change', () => { const d = local.duracion(); if (d > 0) local.buscar(rango.value / 1000 * d); arrastrando = false; });
    for (const ev of ['pointerup', 'pointercancel']) rango.addEventListener(ev, () => setTimeout(() => { arrastrando = false; }, 0));
    const pintarRango = f => rango.style.setProperty('--p', (f * 100).toFixed(2) + '%');

    function pintar() {
      const p = local.pista;
      if (!p) { hoja.cerrar(); return; }
      x('titulo').textContent = p.titulo;
      x('artista').textContent = p.artista || 'Artista desconocido'; x('artista').disabled = !p.artista;
      x('album').textContent = p.album || 'Sin álbum'; x('album').disabled = !p.album;
      const d = local.duracion(), t = local.tiempo();
      if (!arrastrando) {
        const f = d > 0 ? Math.min(1, t / d) : 0;
        rango.value = Math.round(f * 1000); pintarRango(f);
        x('t0').textContent = tiempo(t);
      }
      x('t1').textContent = d > 0 ? '-' + tiempo(Math.max(0, d - (arrastrando ? rango.value / 1000 * d : t))) : '';
      el.classList.toggle('suena-ya', local.sonando);
      el.querySelector('[data-a="aleatorio"]').classList.toggle('on', local.aleatorio);
      const rep = el.querySelector('[data-a="repetir"]');
      rep.classList.toggle('on', local.repetir !== 'no'); rep.classList.toggle('una', local.repetir === 'una');
      const fav = el.querySelector('[data-a="fav"]');
      fav.classList.toggle('on', !!esFavorito(p));
      fav.disabled = !!p.faltante;
      // video solo si el archivo lo trae
      const conVideo = local.esVideo;
      el.querySelector('[data-ver="video"]').hidden = !conVideo;
      if (ver === 'video' && !conVideo) ver = 'caratula';
      el.querySelectorAll('[data-ver]').forEach(b => b.classList.toggle('on', b.dataset.ver === ver));
      const marco = el.querySelector('.ahora-marco');
      const queVideo = ver === 'video' && conVideo && local.video;
      el.classList.toggle('modo-video', !!queVideo);
      if (queVideo) { if (local.video.parentNode !== marco) { marco.textContent = ''; marco.appendChild(local.video); local.video.classList.add('ahora-video'); } }
      else {
        const u = local.portada.grande;
        if (marco.dataset.k !== (u || p.titulo)) {
          marco.dataset.k = u || p.titulo; marco.textContent = '';
          marco.innerHTML = u ? `<img class="ahora-caratula" src="${u}" alt="Carátula de ${esc(p.album || p.titulo)}">`
            : cat.html({ albumId: '', tieneCaratula: false, inicial: p.titulo, clase: 'grande' });
        }
        if (local.video && local.video.parentNode === marco) marco.textContent = '';
      }
      const fondo = el.querySelector('.ahora-fondo img'), uf = local.portada.chica || local.portada.grande || '';
      if (uf !== fondoUrl) { fondoUrl = uf; if (uf) fondo.src = uf; else fondo.removeAttribute('src'); }
    }
    el.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.a, p = local.pista;
      if (b.dataset.ver) {
        if (b.dataset.ver === 'visuales') { alVisuales(); hoja.cerrar(); return; }
        ver = b.dataset.ver; store.set('radio.reproductor', JSON.stringify({ ver })); pintar(); return;
      }
      if (b.dataset.ir && p) { hoja.cerrar(); setTimeout(() => irA(b.dataset.ir, p), 330); return; }
      if (a === 'cerrar') hoja.cerrar();
      else if (a === 'radio') { hoja.cerrar(); alRadio(); }
      else if (a === 'play') local.alternar();
      else if (a === 'ant') local.anterior();
      else if (a === 'sig') local.siguiente();
      else if (a === 'aleatorio') local.setAleatorio(!local.aleatorio);
      else if (a === 'repetir') local.ciclarRepetir();
      else if (a === 'menos') local.saltar(-10);
      else if (a === 'mas') local.saltar(10);
      else if (a === 'fav' && p && !p.faltante) { alternarFavorito(p); pintar(); }
      else if (a === 'cola') abrirCola();
    });
    quitarOyente = local.alCambio(pintar);
    pintar();
    const ciclo = () => { if (hoja && !hoja.cerrada) { if (local.sonando && !arrastrando) pintar(); raf = requestAnimationFrame(ciclo); } };
    raf = requestAnimationFrame(ciclo);
  }

  function abrirCola() {
    let c = null;
    const h = crearHoja({ titulo: 'Cola', clase: 'hoja-cola', sinCabecera: true, html: '<div class="cola-contenedor"></div>', alCerrar: () => c && c.destruir() });
    c = crearCola({ cont: h.cuerpo.querySelector('.cola-contenedor'), local, bib });
  }

  return { abrir, abrirCola, get abierta() { return !!(hoja && !hoja.cerrada); } };
}
