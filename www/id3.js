// Lector propio de etiquetas ID3 (sin librería). Lee ID3v2.2, 2.3 y 2.4 al inicio del archivo y ID3v1 al final.
// Solo toca los bytes de la etiqueta (file.slice), nunca el archivo entero.
// leerEtiquetas(file) -> { titulo, artista, artistaAlbum, album, anio, pista, disco, genero, caratula, version }
//   caratula: { datos: Uint8Array, tipo: 'image/jpeg' | 'image/png' | ... } o null
//   version: '2.3', '2.4', '1'… o null si el archivo no trae etiquetas
const GENEROS = ['Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop', 'Jazz', 'Metal', 'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap', 'Reggae', 'Rock', 'Techno', 'Industrial', 'Alternative', 'Ska', 'Death Metal', 'Pranks', 'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk', 'Fusion', 'Trance', 'Classical', 'Instrumental', 'Acid', 'House', 'Game', 'Sound Clip', 'Gospel', 'Noise', 'AlternRock', 'Bass', 'Soul', 'Punk', 'Space', 'Meditative', 'Instrumental Pop', 'Instrumental Rock', 'Ethnic', 'Gothic', 'Darkwave', 'Techno-Industrial', 'Electronic', 'Pop-Folk', 'Eurodance', 'Dream', 'Southern Rock', 'Comedy', 'Cult', 'Gangsta', 'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle', 'Native American', 'Cabaret', 'New Wave', 'Psychedelic', 'Rave', 'Showtunes', 'Trailer', 'Lo-Fi', 'Tribal', 'Acid Punk', 'Acid Jazz', 'Polka', 'Retro', 'Musical', 'Rock & Roll', 'Hard Rock',
  'Folk', 'Folk-Rock', 'National Folk', 'Swing', 'Fast Fusion', 'Bebop', 'Latin', 'Revival', 'Celtic', 'Bluegrass', 'Avantgarde', 'Gothic Rock', 'Progressive Rock', 'Psychedelic Rock', 'Symphonic Rock', 'Slow Rock', 'Big Band', 'Chorus', 'Easy Listening', 'Acoustic', 'Humour', 'Speech', 'Chanson', 'Opera', 'Chamber Music', 'Sonata', 'Symphony', 'Booty Bass', 'Primus', 'Porn Groove', 'Satire', 'Slow Jam', 'Club', 'Tango', 'Samba', 'Folklore', 'Ballad', 'Power Ballad', 'Rhythmic Soul', 'Freestyle', 'Duet', 'Punk Rock', 'Drum Solo', 'A Cappella', 'Euro-House', 'Dance Hall', 'Goa', 'Drum & Bass', 'Club-House', 'Hardcore', 'Terror', 'Indie', 'BritPop', 'Negerpunk', 'Polsk Punk', 'Beat', 'Christian Gangsta Rap', 'Heavy Metal', 'Black Metal', 'Crossover', 'Contemporary Christian', 'Christian Rock', 'Merengue', 'Salsa', 'Thrash Metal', 'Anime', 'JPop', 'Synthpop'];

// Equivalencias de los marcos de ID3v2.2 (3 letras) con los de 2.3 y 2.4 (4 letras).
const V22 = { TT2: 'TIT2', TP1: 'TPE1', TP2: 'TPE2', TAL: 'TALB', TRK: 'TRCK', TPA: 'TPOS', TYE: 'TYER', TCO: 'TCON', PIC: 'APIC' };
const MARCOS_TEXTO = new Set(['TIT2', 'TPE1', 'TPE2', 'TALB', 'TRCK', 'TPOS', 'TYER', 'TDRC', 'TCON']);
const MAX_ETIQUETA = 48 * 1024 * 1024; // protección contra tamaños absurdos

const sincro = (b, i) => ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);
const entero = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

// ID3 desincronizado: cada 0xFF 0x00 vale 0xFF.
function quitarDesincronizacion(b) {
  const out = new Uint8Array(b.length);
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    out[n++] = b[i];
    if (b[i] === 0xff && i + 1 < b.length && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, n);
}

function decodificar(b, enc) {
  if (!b.length) return '';
  try {
    if (enc === 0) return new TextDecoder('windows-1252').decode(b);
    if (enc === 3) return new TextDecoder('utf-8').decode(b);
    if (enc === 1 || enc === 2) {
      let marca = enc === 2 ? 'utf-16be' : 'utf-16le';
      if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) { marca = 'utf-16le'; b = b.subarray(2); }
      else if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) { marca = 'utf-16be'; b = b.subarray(2); }
      return new TextDecoder(marca).decode(b);
    }
  } catch { /* cae al final */ }
  return new TextDecoder('windows-1252').decode(b);
}

// Parte unos bytes en valores separados por nulo (1 byte, o 2 si es UTF-16).
function partirNulos(b, enc) {
  const ancho = enc === 1 || enc === 2 ? 2 : 1;
  const partes = [];
  let ini = 0;
  for (let i = 0; i + ancho <= b.length; i += ancho) {
    if (ancho === 1 ? b[i] === 0 : (b[i] === 0 && b[i + 1] === 0)) { partes.push(b.subarray(ini, i)); ini = i + ancho; }
  }
  if (ini < b.length) partes.push(b.subarray(ini));
  return partes;
}

function textoDeMarco(datos) {
  if (!datos.length) return '';
  const enc = datos[0];
  const valores = partirNulos(datos.subarray(1), enc).map(p => decodificar(p, enc).trim()).filter(Boolean);
  return valores.join(' / ');
}

function detectarTipoImagen(d, declarado) {
  if (d.length > 3 && d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff) return 'image/jpeg';
  if (d.length > 7 && d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47) return 'image/png';
  if (d.length > 5 && d[0] === 0x47 && d[1] === 0x49 && d[2] === 0x46) return 'image/gif';
  if (d.length > 12 && d[0] === 0x52 && d[1] === 0x49 && d[8] === 0x57 && d[9] === 0x45) return 'image/webp';
  if (declarado && /^image\//i.test(declarado)) return declarado.toLowerCase();
  return 'image/jpeg';
}

// Marco de imagen. En 2.2 el formato son 3 letras («JPG», «PNG»); en 2.3 y 2.4, un tipo MIME terminado en nulo.
function leerImagen(datos, v22) {
  if (datos.length < 8) return null;
  const enc = datos[0];
  let i = 1, declarado = '';
  if (v22) {
    const f = decodificar(datos.subarray(1, 4), 0).toUpperCase();
    declarado = f === 'PNG' ? 'image/png' : f === 'JPG' ? 'image/jpeg' : '';
    i = 4;
  } else {
    let fin = i;
    while (fin < datos.length && datos[fin] !== 0) fin++;
    declarado = decodificar(datos.subarray(i, fin), 0);
    i = fin + 1;
  }
  const tipoImagen = datos[i++];
  // La descripción termina en nulo (de 1 byte, o de 2 si es UTF-16, alineado).
  if (enc === 1 || enc === 2) {
    while (i + 1 < datos.length && !(datos[i] === 0 && datos[i + 1] === 0)) i += 2;
    i += 2;
  } else {
    while (i < datos.length && datos[i] !== 0) i++;
    i += 1;
  }
  if (i >= datos.length) return null;
  const bytes = datos.slice(i); // copia: no retiene el búfer de toda la etiqueta
  return { datos: bytes, tipo: detectarTipoImagen(bytes, declarado), tipoImagen };
}

function generoLegible(t) {
  if (!t) return '';
  // «(17)», «(17)Rock», «17» o «(RX)»: se cambia el número por su nombre.
  const m = /^\s*\((\d{1,3})\)\s*(.*)$/.exec(t) || /^\s*(\d{1,3})\s*$/.exec(t);
  if (m) {
    const resto = (m[2] || '').trim();
    if (resto) return resto;
    return GENEROS[+m[1]] || '';
  }
  if (/^\(?(RX|CR)\)?$/.test(t.trim())) return t.trim() === 'RX' ? 'Remix' : 'Cover';
  return t.trim();
}

const aEntero = t => { const m = /^\s*(\d+)/.exec(t || ''); return m ? parseInt(m[1], 10) : null; };
const aAnio = t => { const m = /(\d{4})/.exec(t || ''); return m ? parseInt(m[1], 10) : null; };

async function leerV2(file) {
  if (file.size < 10) return null;
  const cab = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  if (cab[0] !== 0x49 || cab[1] !== 0x44 || cab[2] !== 0x33) return null; // «ID3»
  const mayor = cab[3];
  if (mayor < 2 || mayor > 4 || cab[4] === 0xff) return null;
  if ((cab[6] | cab[7] | cab[8] | cab[9]) & 0x80) return null;
  const banderas = cab[5];
  const tam = sincro(cab, 6);
  if (tam <= 0 || tam > MAX_ETIQUETA) return null;
  const hasta = Math.min(file.size, 10 + tam);
  let cuerpo = new Uint8Array(await file.slice(10, hasta).arrayBuffer());
  const desincronizadoTodo = (banderas & 0x80) !== 0 && mayor < 4;
  if (desincronizadoTodo) cuerpo = quitarDesincronizacion(cuerpo);
  else if ((banderas & 0x80) !== 0 && mayor === 4) { /* en 2.4 la marca va por marco: se atiende abajo */ }

  let pos = 0;
  if (banderas & 0x40 && mayor >= 3) { // cabecera extendida
    if (cuerpo.length < 4) return null;
    pos = mayor === 4 ? sincro(cuerpo, 0) : entero(cuerpo, 0) + 4;
  }

  const marcos = {};
  let caratula = null, caratulaPreferida = false;
  const v22 = mayor === 2;
  const cab_ = v22 ? 6 : 10;
  while (pos + cab_ <= cuerpo.length) {
    if (cuerpo[pos] === 0) break; // relleno
    const id0 = decodificar(cuerpo.subarray(pos, pos + (v22 ? 3 : 4)), 0);
    if (!/^[A-Z0-9]{3,4}$/.test(id0)) break;
    const tamMarco = v22 ? (cuerpo[pos + 3] << 16) | (cuerpo[pos + 4] << 8) | cuerpo[pos + 5]
      : mayor === 4 ? sincro(cuerpo, pos + 4) : entero(cuerpo, pos + 4);
    const fl = v22 ? 0 : (cuerpo[pos + 8] << 8) | cuerpo[pos + 9];
    const ini = pos + cab_;
    const fin = ini + tamMarco;
    if (tamMarco < 0 || fin > cuerpo.length) break;
    pos = fin;
    const id = v22 ? (V22[id0] || id0) : id0;
    if (id !== 'APIC' && !MARCOS_TEXTO.has(id)) continue;
    // Marcos comprimidos o cifrados: se saltan.
    const comprimido = mayor === 4 ? (fl & 0x0008) : (fl & 0x0080);
    const cifrado = mayor === 4 ? (fl & 0x0004) : (fl & 0x0040);
    if (comprimido || cifrado) continue;
    let datos = cuerpo.subarray(ini, fin);
    if (mayor === 4) {
      if (fl & 0x0001) datos = datos.subarray(4); // indicador de longitud de datos
      if ((fl & 0x0002) || (banderas & 0x80)) datos = quitarDesincronizacion(datos);
    } else if (mayor === 3 && (fl & 0x0020)) datos = datos.subarray(1); // byte de grupo
    if (id === 'APIC') {
      const img = leerImagen(datos, v22);
      // Se prefiere la portada de frente (tipo 3); si no hay, la primera.
      if (img && (!caratula || (!caratulaPreferida && img.tipoImagen === 3))) {
        caratula = { datos: img.datos, tipo: img.tipo };
        caratulaPreferida = img.tipoImagen === 3;
      }
    } else if (!(id in marcos)) {
      marcos[id] = textoDeMarco(datos);
    }
  }
  return {
    version: '2.' + mayor,
    titulo: marcos.TIT2 || '',
    artista: marcos.TPE1 || '',
    artistaAlbum: marcos.TPE2 || '',
    album: marcos.TALB || '',
    anio: aAnio(marcos.TDRC || marcos.TYER),
    pista: aEntero(marcos.TRCK),
    disco: aEntero(marcos.TPOS),
    genero: generoLegible(marcos.TCON),
    caratula
  };
}

// ID3v1: los últimos 128 bytes. Campos de 30 caracteres en Latin-1.
async function leerV1(file) {
  if (file.size < 128) return null;
  const b = new Uint8Array(await file.slice(file.size - 128).arrayBuffer());
  if (b[0] !== 0x54 || b[1] !== 0x41 || b[2] !== 0x47) return null; // «TAG»
  const campo = (a, z) => {
    let fin = z;
    while (fin > a && (b[fin - 1] === 0 || b[fin - 1] === 0x20)) fin--;
    let n = a;
    while (n < fin && b[n] !== 0) n++; // corta en el primer nulo
    return decodificar(b.subarray(a, n), 0).trim();
  };
  const v11 = b[125] === 0 && b[126] !== 0;
  return {
    version: v11 ? '1.1' : '1',
    titulo: campo(3, 33), artista: campo(33, 63), artistaAlbum: '', album: campo(63, 93),
    anio: aAnio(campo(93, 97)), pista: v11 ? b[126] : null, disco: null,
    genero: GENEROS[b[127]] || '', caratula: null
  };
}

export async function leerEtiquetas(file) {
  const vacio = { version: null, titulo: '', artista: '', artistaAlbum: '', album: '', anio: null, pista: null, disco: null, genero: '', caratula: null };
  let v2 = null, v1 = null;
  try { v2 = await leerV2(file); } catch { v2 = null; }
  try { v1 = await leerV1(file); } catch { v1 = null; }
  if (!v2 && !v1) return vacio;
  if (!v2) return { ...vacio, ...v1 };
  if (!v1) return { ...vacio, ...v2 };
  // Si el v2 no trae un campo, se completa con el v1.
  const r = { ...vacio, ...v2 };
  for (const k of ['titulo', 'artista', 'album', 'genero']) if (!r[k]) r[k] = v1[k];
  for (const k of ['anio', 'pista']) if (r[k] == null) r[k] = v1[k];
  return r;
}
