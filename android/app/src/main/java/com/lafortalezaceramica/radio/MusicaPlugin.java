package com.lafortalezaceramica.radio;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import org.json.JSONException;

// Complemento «Musica»: carpeta de música (elegir, estado, listar) y sesión de medios del sistema (actualizar, detener).
// Del lado web lo usa biblioteca.js (crearFuenteNativa) y nativa.js (navigator.mediaSession).
@CapacitorPlugin(name = "Musica")
public class MusicaPlugin extends Plugin {
    private static volatile MusicaPlugin instancia;

    @Override
    public void load() {
        instancia = this;
    }

    // ---------- Carpeta ----------
    @PluginMethod
    public void elegirCarpeta(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, i, "alElegirCarpeta");
    }

    @ActivityCallback
    private void alElegirCarpeta(PluginCall call, ActivityResult r) {
        if (call == null) return;
        JSObject o = new JSObject();
        Uri u = r.getData() != null ? r.getData().getData() : null;
        if (r.getResultCode() != Activity.RESULT_OK || u == null) {
            o.put("cancelado", true);
            call.resolve(o);
            return;
        }
        try {
            getContext().getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException e) {
            call.reject("Android no dejó guardar el permiso de esa carpeta");
            return;
        }
        CarpetaMusica.guardar(getContext(), u);
        o.put("nombre", CarpetaMusica.nombre(getContext(), u));
        call.resolve(o);
    }

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject o = new JSObject();
        Uri u = CarpetaMusica.arbol(getContext());
        o.put("carpeta", u != null);
        if (u != null) {
            o.put("nombre", CarpetaMusica.nombre(getContext(), u));
            o.put("permiso", CarpetaMusica.tienePermiso(getContext(), u));
        }
        call.resolve(o);
    }

    @PluginMethod
    public void listar(PluginCall call) {
        final Set<String> ext = conjunto(call.getArray("ext"));
        final Set<String> ignoradas = conjunto(call.getArray("ignoradas"));
        final Set<String> caratulas = conjunto(call.getArray("caratulas"));
        new Thread(() -> {
            try {
                call.resolve(CarpetaMusica.listar(getContext(), ext, ignoradas, caratulas));
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "No pude leer la carpeta");
            }
        }, "radio-listar").start();
    }

    private static Set<String> conjunto(JSArray a) {
        Set<String> s = new HashSet<>();
        if (a == null) return s;
        for (int i = 0; i < a.length(); i++) {
            try { s.add(a.getString(i).toLowerCase(Locale.ROOT)); } catch (JSONException ignorada) { /* */ }
        }
        return s;
    }

    // ---------- Sesión de medios ----------
    // { titulo, artista, album, portada (base64, opcional), sinPortada, reproduciendo, duracion (s), posicion (s), acciones: [] }
    @PluginMethod
    public void actualizar(PluginCall call) {
        MusicaServicio.Datos d = new MusicaServicio.Datos();
        d.titulo = call.getString("titulo", "La Fortaleza Radio");
        d.artista = call.getString("artista", "");
        d.album = call.getString("album", "");
        d.reproduciendo = Boolean.TRUE.equals(call.getBoolean("reproduciendo", false));
        Double dur = call.getDouble("duracion");
        Double pos = call.getDouble("posicion");
        d.duracionMs = dur != null && dur > 0 ? (long) (dur * 1000) : -1;
        d.posicionMs = pos != null && pos >= 0 ? (long) (pos * 1000) : -1;
        d.acciones = conjunto(call.getArray("acciones"));
        String b64 = call.getString("portada");
        if (b64 != null && !b64.isEmpty()) {
            d.portada = decodificar(b64);
            d.cambiaPortada = true;
        } else if (Boolean.TRUE.equals(call.getBoolean("sinPortada", false))) {
            d.cambiaPortada = true;
        }
        MusicaServicio.actualizar(getContext(), d);
        call.resolve();
    }

    @PluginMethod
    public void detener(PluginCall call) {
        MusicaServicio.detener(getContext());
        call.resolve();
    }

    private static Bitmap decodificar(String b64) {
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
            int lado = Math.max(o.outWidth, o.outHeight), escala = 1;
            while (lado / (escala * 2) >= 512) escala *= 2;
            o = new BitmapFactory.Options();
            o.inSampleSize = escala;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
        } catch (Exception e) {
            return null;
        }
    }

    // Lo llama el servicio cuando se pulsa un control (notificación, pantalla de bloqueo, Bluetooth, volante).
    static void accion(String accion, Double posicion) {
        MusicaPlugin p = instancia;
        if (p == null) return;
        JSObject o = new JSObject();
        o.put("accion", accion);
        if (posicion != null) o.put("posicion", posicion);
        p.notifyListeners("accion", o);
    }
}
