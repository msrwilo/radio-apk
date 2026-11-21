// Piezas compartidas de las pantallas del reproductor: íconos, hojas que suben desde abajo,
// lista virtual, arrastrar para reordenar, deslizar para quitar y carátulas con carga perezosa.
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = n => Number(n || 0).toLocaleString('es-MX');
export function tiempo(s) {
  if (s == null || !isFinite(s)) return '';
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}
export function duracionLarga(s) {
  s = Math.round(s || 0);
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

// ---------- Íconos (24 × 24, trazo 1.8, puntas redondas) ----------
const IC = {
  cancion: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  album: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.4"/>',
  artista: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>',
  genero: '<path d="M3.5 12.5V5A1.5 1.5 0 0 1 5 3.5h7.5l8 8a1.5 1.5 0 0 1 0 2.1l-6.4 6.4a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8.3" cy="8.3" r="1.2"/>',
  anio: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  lista: '<path d="M4 7h16M4 12h16M4 17h9"/>',
  corazon: '<path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.4 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  orden: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  mas: '<circle cx="5.5" cy="12" r="1.3" class="fill"/><circle cx="12" cy="12" r="1.3" class="fill"/><circle cx="18.5" cy="12" r="1.3" class="fill"/>',
  atras: '<path d="M15 5l-7 7 7 7"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  abajo: '<path d="M5 9l7 7 7-7"/>',
  derecha: '<path d="M9 5l7 7-7 7"/>',
  play: '<path d="M8 5.5v13l11-6.5z" class="fill"/>',
  pausa: '<path d="M8 5v14M16 5v14"/>',
  ant: '<path d="M7 5v14M18 5.5v13l-9-6.5z"/>',
  sig: '<path d="M17 5v14M6 5.5v13l9-6.5z"/>',
  aleatorio: '<path d="M4 7h3.5c5 0 5 10 10 10H20M4 17h3.5c1.8 0 3-1 4-2.4M13.5 9.4C14.5 8 15.7 7 17.5 7H20M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5"/>',
  repetir: '<path d="M17 3l3 3-3 3M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M7 21l-3-3 3-3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4"/>',
  atras10: '<path d="M5 12a7 7 0 1 0 2.2-5.1M5 4.5V8h3.5"/><text x="12" y="15.4" text-anchor="middle" font-size="7.4" font-family="Lato,sans-serif" font-weight="700" fill="currentColor" stroke="none">10</text>',
  adelante10: '<path d="M19 12a7 7 0 1 1-2.2-5.1M19 4.5V8h-3.5"/><text x="12" y="15.4" text-anchor="middle" font-size="7.4" font-family="Lato,sans-serif" font-weight="700" fill="currentColor" stroke="none">10</text>',
  cola: '<path d="M4 7h12M4 12h12M4 17h6M17 14.5v6l4.5-3z"/>',
  carpeta: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z"/>',
  nuevo: '<path d="M12 5v14M5 12h14"/>',
  papelera: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7M10.5 11v5M13.5 11v5"/>',
  asa: '<path d="M5 9h14M5 15h14"/>',
  radio: '<circle cx="12" cy="12" r="2.2"/><path d="M7.7 7.7a6 6 0 0 0 0 8.6M16.3 7.7a6 6 0 0 1 0 8.6M4.8 4.8a10.2 10.2 0 0 0 0 14.4M19.2 4.8a10.2 10.2 0 0 1 0 14.4"/>',
  visual: '<circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  video: '<rect x="3.5" y="6" width="12" height="12" rx="2.5"/><path d="M15.5 10.5l5-3v9l-5-3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  exportar: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14"/>',
  importar: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14"/>',
  actualizar: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5V8h-3.5"/>',
  ajustes: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  sig_lista: '<path d="M4 12h9M4 7h9M4 17h5M17 8v8M13.5 12h7"/>',
  inicio: '<path d="M5 12.5l7-6.5 7 6.5M7 11v8h10v-8"/>'
};
export const ic = (n, cls = '') => `<svg viewBox="0 0 24 24" class="ic ${cls}" aria-hidden="true">${IC[n] || ''}</svg>`;

// ---------- Atrás del sistema: cada hoja o detalle abierto se cierra con «atrás» ----------
const pila = [];
export function empujar(item) { pila.push(item); try { history.pushState({ rf: pila.length }, ''); } catch { /* */ } }
export function cerrarItem(item) {
  const i = pila.indexOf(item);
  if (i < 0) return;
  if (i === pila.length - 1) { try { history.back(); } catch { pila.pop(); item.cerrar(); } }
  else { pila.splice(i, 1); item.cerrar(); }
}
window.addEventListener('popstate', () => { const it = pila.pop(); if (it) it.cerrar(); });

// ---------- Hojas ----------
// crearHoja({ titulo, clase, html, alCerrar }) → { el, cuerpo, cerrar() }. Sube desde abajo; se cierra deslizando hacia abajo,
// tocando fuera o con Escape.
export function crearHoja({ titulo = '', clase = '', html = '', alCerrar = null, sinCabecera = false } = {}) {
  const fondo = document.createElement('div');
  fondo.className = 'hoja-fondo ui-sheet';
  fondo.innerHTML = `<div class="hoja ${clase}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <div class="hoja-asa" aria-hidden="true"><i></i></div>
    ${sinCabecera ? '' : `<header class="hoja-cab"><b>${esc(titulo)}</b><button type="button" class="hoja-x" aria-label="Cerrar">${ic('cerrar')}</button></header>`}
    <div class="hoja-cuerpo">${html}</div></div>`;
  const hoja = fondo.querySelector('.hoja'), cuerpo = fondo.querySelector('.hoja-cuerpo');
  document.body.appendChild(fondo);
  let cerrada = false;
  const item = {
    cerrar() {
      if (cerrada) return; cerrada = true;
      document.removeEventListener('keydown', tecla, true);
      fondo.classList.remove('abierta');
      hoja.style.transform = '';
      const quitar = () => fondo.remove();
      fondo.addEventListener('transitionend', quitar, { once: true });
      setTimeout(quitar, 450);
      if (alCerrar) alCerrar();
    }
  };
  const api = { el: fondo, hoja, cuerpo, cerrar: () => cerrarItem(item), get cerrada() { return cerrada; } };
  const tecla = e => { if (e.key === 'Escape' && pila[pila.length - 1] === item) { e.stopPropagation(); api.cerrar(); } };
  document.addEventListener('keydown', tecla, true);
  fondo.addEventListener('click', e => { if (e.target === fondo) api.cerrar(); });
  const x = fondo.querySelector('.hoja-x'); if (x) x.addEventListener('click', () => api.cerrar());
  // Deslizar hacia abajo desde el asa o la cabecera.
  const zona = [fondo.querySelector('.hoja-asa'), fondo.querySelector('.hoja-cab')].filter(Boolean);
  for (const z of zona) z.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const y0 = e.clientY, t0 = performance.now(); let dy = 0;
    hoja.classList.add('arrastrando');
    z.setPointerCapture(e.pointerId);
    const mover = ev => { dy = Math.max(0, ev.clientY - y0); hoja.style.transform = `translateY(${dy}px)`; };
    const fin = () => {
      z.removeEventListener('pointermove', mover); z.removeEventListener('pointerup', fin); z.removeEventListener('pointercancel', fin);
      hoja.classList.remove('arrastrando');
      const v = dy / Math.max(1, performance.now() - t0);
      if (dy > 110 || (dy > 40 && v > 0.5)) api.cerrar(); else hoja.style.transform = '';
    };
    z.addEventListener('pointermove', mover); z.addEventListener('pointerup', fin); z.addEventListener('pointercancel', fin);
  });
  empujar(item);
  requestAnimationFrame(() => requestAnimationFrame(() => fondo.classList.add('abierta')));
  return api;
}

// Hoja con una lista de opciones: opciones = [{ id, texto, icono?, sub?, peligro?, activo? }] → promesa con el id elegido (o null).
export function elegirOpcion({ titulo, opciones, clase = '' }) {
  return new Promise(ok => {
    let elegido = null;
    const h = crearHoja({
      titulo, clase: 'hoja-menu ' + clase, alCerrar: () => ok(elegido),
      html: `<ul class="menu">${opciones.map((o, i) => `<li><button type="button" class="menu-op${o.peligro ? ' peligro' : ''}${o.activo ? ' on' : ''}" data-i="${i}">
        ${o.icono ? ic(o.icono) : '<span class="menu-sin"></span>'}<span class="menu-txt"><b>${esc(o.texto)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>${o.activo ? ic('check', 'menu-ok') : ''}</button></li>`).join('')}</ul>`
    });
    h.cuerpo.addEventListener('click', e => {
      const b = e.target.closest('.menu-op'); if (!b) return;
      elegido = opciones[+b.dataset.i].id; h.cerrar();
    });
  });
}

export function pedirTexto({ titulo, valor = '', boton = 'Guardar', marca = '' }) {
  return new Promise(ok => {
    let res = null;
    const h = crearHoja({
      titulo, clase: 'hoja-texto', alCerrar: () => ok(res),
      html: `<form class="campo-form"><label class="campo">${ic('lista')}<input type="text" maxlength="80" value="${esc(valor)}" placeholder="${esc(marca)}" autocomplete="off" spellcheck="false"></label>
        <button type="submit" class="boton principal">${esc(boton)}</button></form>`
    });
    const inp = h.cuerpo.querySelector('input');
    h.cuerpo.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const t = inp.value.trim(); if (!t) return; res = t; h.cerrar(); });
    setTimeout(() => { inp.focus(); inp.select(); }, 320);
  });
}

export function confirmar({ titulo, texto, boton = 'Aceptar', peligro = false }) {
  return new Promise(ok => {
    let res = false;
    const h = crearHoja({
      titulo, clase: 'hoja-texto', alCerrar: () => ok(res),
      html: `${texto ? `<p class="hoja-parrafo">${esc(texto)}</p>` : ''}<div class="botones"><button type="button" class="boton" data-no>Cancelar</button><button type="button" class="boton principal${peligro ? ' peligro' : ''}" data-si>${esc(boton)}</button></div>`
    });
    h.cuerpo.querySelector('[data-si]').addEventListener('click', () => { res = true; h.cerrar(); });
    h.cuerpo.querySelector('[data-no]').addEventListener('click', () => h.cerrar());
  });
}

// ---------- Carátulas ----------
// `sync` guarda las URLs ya resueltas para pintarlas de inmediato al volver a dibujar una fila.
export function crearCaratulas(bib) {
  const sync = new Map();
  let version = -1;
  const revisar = () => { if (bib.cache.version !== version) { version = bib.cache.version; sync.clear(); } };
  const src = (albumId, tam = 'chica') => { revisar(); return sync.get(albumId + '#' + tam) || null; };
  // Pone la carátula en todos los <img data-alb> de `raiz` que aún no la tengan.
  function cargar(raiz) {
    revisar();
    raiz.querySelectorAll('img[data-alb]:not([src])').forEach(img => {
      const id = img.dataset.alb, tam = img.dataset.tam || 'chica', k = id + '#' + tam;
      if (sync.has(k)) { img.src = sync.get(k); return; }
      bib.urlCaratula(id, tam).then(u => {
        if (!u) { const f = img.closest('[data-ficha]'); if (f) f.classList.add('sin'); img.remove(); return; }
        sync.set(k, u); if (img.isConnected) img.src = u;
      });
    });
  }
  // HTML de una carátula cuadrada: la imagen si el álbum tiene, o la ficha con la inicial.
  function html({ albumId, tieneCaratula, inicial = '', tam = 'chica', clase = '' }) {
    const letra = esc(String(inicial || '').trim().charAt(0).toUpperCase() || '♪');
    const tono = (hash(albumId || inicial) % 360);
    if (!albumId || !tieneCaratula) return `<span class="ficha ${clase}" style="--h:${tono}"><b>${letra}</b></span>`;
    const u = src(albumId, tam);
    return `<span class="ficha ${clase}" data-ficha style="--h:${tono}"><b>${letra}</b><img data-alb="${esc(albumId)}" data-tam="${tam}" alt=""${u ? ` src="${u}"` : ''}></span>`;
  }
  return { cargar, html, src };
}
export function hash(s) { let h = 0; s = String(s || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

// ---------- Lista virtual (filas de alto fijo) ----------
// cont: contenedor con scroll. fila(i, top) → HTML de la fila i.
export function crearVirtual(cont, { alto, fila, alPintar = null, margen = 6 }) {
  const esp = document.createElement('div'); esp.className = 'v-esp'; cont.appendChild(esp);
  const tmp = document.createElement('div');
  const vivos = new Map();
  let n = 0, a0 = -1, b0 = -1, pend = false;
  function pintar(forzar) {
    pend = false;
    const top = cont.scrollTop, h = cont.clientHeight || 600;
    const a = Math.max(0, Math.floor(top / alto) - margen), b = Math.min(n, Math.ceil((top + h) / alto) + margen);
    if (!forzar && a === a0 && b === b0) return;
    a0 = a; b0 = b;
    if (forzar) { esp.textContent = ''; vivos.clear(); }
    for (const [i, el] of vivos) if (i < a || i >= b) { el.remove(); vivos.delete(i); }
    let html = ''; const nuevos = [];
    for (let i = a; i < b; i++) if (!vivos.has(i)) { html += fila(i, i * alto); nuevos.push(i); }
    if (html) {
      tmp.innerHTML = html;
      [...tmp.children].forEach((el, k) => { vivos.set(nuevos[k], el); esp.appendChild(el); });
    }
    if (alPintar) alPintar(esp);
  }
  cont.addEventListener('scroll', () => { if (!pend) { pend = true; requestAnimationFrame(() => pintar(false)); } }, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (n) pintar(true); }).observe(cont);
  return {
    esp,
    poner(total) { n = total; esp.style.height = n * alto + 'px'; pintar(true); },
    refrescar() { pintar(true); },
    irA(i, suave = false) { cont.scrollTo({ top: Math.max(0, i * alto), behavior: suave ? 'smooth' : 'auto' }); },
    get total() { return n; }
  };
}

// ---------- Arrastrar para reordenar y deslizar para quitar ----------
// cont: contenedor cuyas filas directas son `.fila`; cada una con un `[data-asa]` para arrastrar.
export function ordenable(cont, { alMover, alQuitar = null }) {
  const filas = () => [...cont.querySelectorAll(':scope > .fila')];
  cont.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    const fila = e.target.closest('.fila'); if (!fila || fila.parentElement !== cont) return;
    if (e.target.closest('[data-asa]')) arrastrar(e, fila);
    else if (alQuitar && !e.target.closest('button')) deslizar(e, fila);
  });

  function arrastrar(e, fila) {
    e.preventDefault();
    const lista = filas(), desde = lista.indexOf(fila), alto = fila.offsetHeight, y0 = e.clientY;
    let hasta = desde;
    fila.classList.add('arrastrando'); cont.classList.add('ordenando');
    const mover = ev => {
      const dy = ev.clientY - y0;
      hasta = Math.max(0, Math.min(lista.length - 1, Math.round(desde + dy / alto)));
      fila.style.transform = `translateY(${dy}px)`;
      lista.forEach((f, i) => {
        if (f === fila) return;
        let d = 0;
        if (desde < hasta && i > desde && i <= hasta) d = -alto; else if (desde > hasta && i < desde && i >= hasta) d = alto;
        f.style.transform = d ? `translateY(${d}px)` : '';
      });
    };
    const fin = () => {
      window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin);
      lista.forEach(f => { f.style.transform = ''; });
      fila.classList.remove('arrastrando'); cont.classList.remove('ordenando');
      if (hasta !== desde) alMover(desde, hasta);
    };
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', fin); window.addEventListener('pointercancel', fin);
  }

  function deslizar(e, fila) {
    const x0 = e.clientX, y0 = e.clientY, idx = filas().indexOf(fila);
    let activo = false, dx = 0;
    const limpiar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin); };
    const mover = ev => {
      const ddx = ev.clientX - x0, ddy = ev.clientY - y0;
      if (!activo) {
        if (Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy) * 1.5) { activo = true; fila.classList.add('deslizando'); }
        else if (Math.abs(ddy) > 12) { limpiar(); return; }
      }
      if (activo) { dx = Math.min(0, ddx); fila.style.transform = `translateX(${dx}px)`; fila.style.opacity = String(Math.max(0.3, 1 + dx / 320)); }
    };
    const fin = () => {
      limpiar();
      if (!activo) return;
      const bloquear = ev => { ev.stopPropagation(); ev.preventDefault(); };
      cont.addEventListener('click', bloquear, true);
      setTimeout(() => cont.removeEventListener('click', bloquear, true), 120); // el clic que sigue al soltar no debe tocar la fila
      fila.classList.remove('deslizando');
      if (dx < -90) { fila.style.transform = 'translateX(-110%)'; fila.style.opacity = '0'; setTimeout(() => alQuitar(idx), 170); }
      else { fila.style.transform = ''; fila.style.opacity = ''; }
    };
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', fin); window.addEventListener('pointercancel', fin);
  }
}

// Pulsación larga sobre elementos `selector` de `cont`: llama a alLarga(elemento, evento) y evita el clic que sigue.
export function pulsacionLarga(cont, selector, alLarga, ms = 480) {
  let t = 0, x0 = 0, y0 = 0, disparada = false;
  const cancelar = () => { clearTimeout(t); t = 0; };
  cont.addEventListener('pointerdown', e => {
    const el = e.target.closest(selector); if (!el || e.target.closest('button')) return;
    disparada = false; x0 = e.clientX; y0 = e.clientY; cancelar();
    t = setTimeout(() => { disparada = true; alLarga(el, e); }, ms);
  });
  cont.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - x0, e.clientY - y0) > 9) cancelar(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) cont.addEventListener(ev, cancelar);
  cont.addEventListener('click', e => { if (disparada) { e.stopPropagation(); e.preventDefault(); disparada = false; } }, true);
  cont.addEventListener('contextmenu', e => { if (e.target.closest(selector)) e.preventDefault(); });
}
