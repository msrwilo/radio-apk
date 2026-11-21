# La Fortaleza Radio — APK (Capacitor)

Etapa 5B del plan de la radio (vault: `WIKI/sistemas/radio-plan.md`). Reactivada el 21 nov 2026. Solo la toca el chat de la radio.

## Qué hay
- `www/`: la web que va dentro de la APK. Es copia de `/radio/beta/` del 21 nov 2026 (`app.js?v=27`) con estos cambios, todos compatibles con el navegador:
  - `vendor/capacitor.js` (Capacitor 8.6.2) y `nativa.js`: dentro de la APK reemplazan `navigator.mediaSession` por la del servicio nativo.
  - `biblioteca.js`: `crearFuenteNativa()` (misma forma que la del navegador); se usa sola si corre dentro de la APK.
  - `local.js`: si el archivo trae `url`, se reproduce de ahí (sin leerlo entero).
  - `app.js`: sin service worker dentro de la APK.
  - `index.html`: carga `vendor/capacitor.js` y `nativa.js` antes de `app.js`.
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
- Cambios de la web: hacerlos primero en `/radio/beta/` y copiarlos aquí, o anotarlos arriba para pasarlos a la beta.
- Nada se borra: a `papelera/`.
- El agente de Prometeo acepta el origen `https://localhost` desde la versión 0.1.2.
