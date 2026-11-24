# La Fortaleza Radio — APK (Capacitor)

Etapa 5B del plan de la radio (vault: `WIKI/sistemas/radio-plan.md`). Reactivada el 21 nov 2026. Solo la toca el chat de la radio.

## Qué hay
- `www/`: la web que va dentro de la APK. Es copia de `/radio/beta/` del 21 nov 2026 (`app.js?v=27`) con estos cambios, todos compatibles con el navegador:
  - `vendor/capacitor.js` (Capacitor 8.6.2) y `nativa.js`: dentro de la APK reemplazan `navigator.mediaSession` por la del servicio nativo.
  - `biblioteca.js`: `crearFuenteNativa()` (misma forma que la del navegador); se usa sola si corre dentro de la APK.
  - `local.js`: si el archivo trae `url`, se reproduce de ahí (sin leerlo entero).
  - `app.js`: sin service worker dentro de la APK.
  - `index.html`: carga `vendor/capacitor.js` y `nativa.js` antes de `app.js`.
  - `ui-remoto.js` (Y3, 23 nov 2026, `app.js?v=29`): pantalla de YouTube en tres bloques (Sonando, A continuación, Recomendados); fuentes en orden YouTube, Radio Garden, SoundCloud. Pasar a la beta en Y6.
  - Y5a (23 nov 2026, `app.js?v=31`, `ui-remoto.js?v=5`, `remoto.css?v=5`): fichas Inicio | Listas, «Mis listas» (propias, en el agente 0.1.9), vista de la lista, «Agregar a una lista…» y «Guardar como lista». El selector del Inicio arranca siempre en YouTube (ya no se guarda). Pasar a la beta en Y6.
  - Y5b (23 nov 2026, `app.js?v=32`, `ui-remoto.js?v=6`, `remoto.css?v=6`): grupo «De mi cuenta de YouTube» en Listas (agente 0.1.10), vista de la lista sin edición (Reproducir, Aleatorio, Al final de la cola; ⋯ con «Copiar a mis listas» y «Actualizar»). Con un agente anterior a 0.1.10 el grupo dice que hace falta esa versión. Pasar a la beta en Y6.
  - Y7 (24 nov 2026, `app.js?v=33`, `ui-remoto.js?v=7`, caché `radio-fortaleza-v3`): sin YouTube Music (el Inicio sale siempre de youtube.com, sin selector) y la pestaña **Reproductor solo dentro de la APK** (en el navegador no se crea la biblioteca; con `?maqueta=` sí, para probar). Ya está en `/radio/beta/` y en `/radio/`. Lo anterior en `papelera/www-antes-y7-*`.
  - Y8 (24 nov 2026, `app.js?v=34`, `style.css?v=6`, caché `radio-fortaleza-v4`): **sin portada**, la app arranca sola (si el navegador no deja sonar sin un toque, la radio empieza con el primer toque en cualquier parte y el estado dice «Toca para escuchar»); **logo** de La Fortaleza (el toro, vectorial, color del texto) junto a «La Fortaleza Radio»; **barra de desplazamiento** según la guía §16. `MainActivity.java`: `setMediaPlaybackRequiresUserGesture(false)` para que en la APK suene sin toque. Ya está en `/radio/beta/` y `/radio/`. Lo anterior en `papelera/www-antes-y8-*`.
  - Y9 (24 nov 2026, `app.js?v=35`, `ui-remoto.js?v=8`, `remoto.css?v=7`, caché `radio-fortaleza-v5`): **listas de reproducción en la búsqueda** (agente 0.1.14): tarjeta propia (miniatura apilada con banda de lista y número de canciones, «Lista · canal»), intercaladas donde YouTube las pone; al tocarla, la vista de la lista reemplaza los resultados («‹ Resultados»), solo leer, con Reproducir, Aleatorio, Al final de la cola y ⋯ Copiar a mis listas / Actualizar. **«Reproducir desde aquí»** en la hoja de una canción de cualquier lista (no en la última). Publicado en `/radio/`. Lo anterior en `papelera/www-antes-y9-*`.
  - `sw.js` (23 nov 2026): copia del de `/radio/beta/` (caché `radio-fortaleza-v2`, `app.js?v=32`); dentro de la APK no se usa. El anterior (v1) en `papelera/sw-v1.js`.
  - `vendor/three.module.min.js`: three.js r170 (mismo tamaño que el de producción, 691,648 bytes); en la copia local de `/radio` no estaba.
- `android/`: proyecto nativo. Lo propio está en `app/src/main/java/com/lafortalezaceramica/radio/`:
  - `MusicaPlugin.java`: complemento «Musica» (elegirCarpeta, estado, listar, actualizar, detener; evento «accion»).
  - `CarpetaMusica.java`: carpeta elegida con el selector de Android, permiso persistente, recorrido y rutas.
  - `MusicaWebViewClient.java`: sirve `https://localhost/_musica_/<ruta>` con Range (mismo origen: los visualizadores funcionan).
  - `MusicaServicio.java`: servicio en primer plano con sesión de medios (notificación, bloqueo, Bluetooth, volante). En pausa 15 min se quita solo.
- Sin complementos de terceros para lo clave. Dependencia agregada: `androidx.media:media:1.7.0`.

## Compilar (en ATLAS)
1. Android Studio instalado y abierto una vez (su asistente instala el SDK). Node.js LTS.
2. `1-preparar.cmd` (una vez) y `2-compilar.cmd` (cada vez). Sale `La-Fortaleza-Radio.apk`; si falla, `compilar.log`.
- Es APK de depuración, firmada con la llave de depuración de ATLAS (`%USERPROFILE%\.android\debug.keystore`). Las actualizaciones se compilan en ATLAS; si esa llave se pierde, hay que desinstalar la app (se pierden sus datos) para instalar la nueva.

## Reglas
- **Beta descartada (Wilo, 24 nov 2026):** los cambios de la web se hacen en la copia local de `/radio` (`D:\proyectos\radio`), se publican en `/radio` y se copian aquí. No se sube nada a `/radio/beta/`.
- Nada se borra: a `papelera/`.
- El agente de Prometeo acepta el origen `https://localhost` desde la versión 0.1.2.
