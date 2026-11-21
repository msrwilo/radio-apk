// Pestañas (Visuales, Reproductor, Remoto) y franja «Ahora suena».
const PESTANAS = [
  { id: 'visuales', nombre: 'Visuales' },
  { id: 'reproductor', nombre: 'Reproductor' },
  { id: 'remoto', nombre: 'Remoto' }
];
const SVG = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14M18 5.5v13l-9-6.5z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 5v14M6 5.5v13l9-6.5z"/></svg>',
  play: '<svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" class="fill"/></svg><svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>'
};
const ICONO = 'icon-192.png';

export function crearPestanas({ body, store, alCambiar, alPulsarPlay, alPulsarPrev, alPulsarNext, alPulsarInfo, disponible = () => true }) {
  const visibles = PESTANAS.filter(p => p.id === 'visuales' || disponible(p.id));
  const guardada = store.get('radio.pestana');
  let actual = visibles.some(p => p.id === guardada) ? guardada : 'visuales';

  const nav = document.createElement('nav');
  nav.id = 'tabs'; nav.className = 'ui'; nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Secciones');
  nav.innerHTML = visibles.map(p => `<button type="button" role="tab" data-tab="${p.id}" aria-selected="false">${p.nombre}</button>`).join('');

  const panel = document.createElement('main');
  panel.id = 'panel'; panel.className = 'ui-sheet';
  panel.innerHTML = visibles.filter(p => p.id !== 'visuales').map(p =>
    `<section id="p-${p.id}" class="p-card" role="tabpanel" aria-label="${p.nombre}"><h2>${p.nombre}</h2><p>Próximamente</p></section>`).join('');

  const franja = document.createElement('div');
  franja.id = 'franja'; franja.className = 'ui'; franja.setAttribute('role', 'group'); franja.setAttribute('aria-label', 'Ahora suena');
  franja.innerHTML =
    `<img class="fr-art" id="frArt" src="${ICONO}" alt="" width="44" height="44" decoding="async">` +
    '<div class="fr-txt" id="frTxt"><b id="frTitulo">La Fortaleza Radio</b><span id="frSub">—</span></div>' +
    `<button type="button" id="frPrev" aria-label="Anterior" hidden>${SVG.prev}</button>` +
    `<button type="button" id="frPlay" aria-label="Reproducir o pausar">${SVG.play}</button>` +
    `<button type="button" id="frNext" aria-label="Siguiente" hidden>${SVG.next}</button>` +
    '<i class="fr-prog" hidden><b id="frBar"></b></i>';

  body.append(nav, panel, franja);
  const $ = id => document.getElementById(id);
  let conInfo = false;
  const click = (id, f) => $(id).addEventListener('click', e => { e.stopPropagation(); if (f) f(); });
  click('frPlay', alPulsarPlay); click('frPrev', alPulsarPrev); click('frNext', alPulsarNext);
  // Tocar la carátula o el título abre la hoja «Ahora suena» (solo con música propia).
  for (const id of ['frArt', 'frTxt']) $(id).addEventListener('click', e => { if (conInfo && alPulsarInfo) { e.stopPropagation(); alPulsarInfo(); } });

  function elegir(id, avisar = true) {
    if (!visibles.some(p => p.id === id)) id = 'visuales';
    actual = id;
    body.dataset.tab = id;
    body.classList.toggle('t-otra', id !== 'visuales');
    nav.querySelectorAll('button').forEach(b => {
      const on = b.dataset.tab === id;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    });
    panel.querySelectorAll('section').forEach(s => { s.hidden = s.id !== 'p-' + id; });
    store.set('radio.pestana', id);
    if (avisar && alCambiar) alCambiar(id);
  }
  nav.addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (b) { e.stopPropagation(); elegir(b.dataset.tab); }
  });
  elegir(actual, false);

  return {
    get actual() { return actual; },
    elegir,
    // datos: { titulo, sub, anterior, siguiente, progreso (0 a 1, o null si es en vivo), imagen, abre }
    franja(d) {
      $('frTitulo').textContent = d.titulo;
      $('frSub').textContent = d.sub;
      $('frPrev').hidden = !d.anterior; $('frNext').hidden = !d.siguiente;
      const img = $('frArt'), src = d.imagen || ICONO;
      if (img.getAttribute('src') !== src) img.src = src;
      conInfo = !!d.abre;
      franja.classList.toggle('con-info', conInfo);
      const prog = franja.querySelector('.fr-prog');
      prog.hidden = d.progreso == null;
      if (d.progreso != null) $('frBar').style.width = Math.max(0, Math.min(1, d.progreso)) * 100 + '%';
    }
  };
}
