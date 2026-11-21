package com.lafortalezaceramica.radio;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.FileNotFoundException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

// La carpeta de música elegida con el selector de Android (Storage Access Framework).
// Guarda el permiso de forma persistente, recorre la carpeta y traduce una ruta relativa («Artista/Álbum/01.mp3») a su documento.
final class CarpetaMusica {
    private static final String PREFS = "radio_musica";
    private static final String K_ARBOL = "arbol";
    private static final String[] COLUMNAS = {
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE,
        DocumentsContract.Document.COLUMN_SIZE,
        DocumentsContract.Document.COLUMN_LAST_MODIFIED
    };
    // ruta relativa -> documentId (se llena al recorrer y al buscar).
    private static final Map<String, String> rutas = new ConcurrentHashMap<>();

    private CarpetaMusica() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static Uri arbol(Context c) {
        String s = prefs(c).getString(K_ARBOL, null);
        return s == null ? null : Uri.parse(s);
    }

    static void guardar(Context c, Uri arbol) {
        Uri anterior = arbol(c);
        prefs(c).edit().putString(K_ARBOL, arbol.toString()).apply();
        rutas.clear();
        if (anterior != null && !anterior.equals(arbol)) {
            try {
                c.getContentResolver().releasePersistableUriPermission(anterior, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (SecurityException ignorada) { /* ya no lo tenía */ }
        }
    }

    static boolean tienePermiso(Context c, Uri arbol) {
        for (UriPermission p : c.getContentResolver().getPersistedUriPermissions()) {
            if (p.getUri().equals(arbol) && p.isReadPermission()) return true;
        }
        return false;
    }

    static String nombre(Context c, Uri arbol) {
        Uri raiz = DocumentsContract.buildDocumentUriUsingTree(arbol, DocumentsContract.getTreeDocumentId(arbol));
        try (Cursor cur = c.getContentResolver().query(raiz, new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            if (cur != null && cur.moveToFirst()) return cur.getString(0);
        } catch (Exception ignorada) { /* sin nombre */ }
        String id = DocumentsContract.getTreeDocumentId(arbol);
        int i = Math.max(id.lastIndexOf('/'), id.lastIndexOf(':'));
        return i >= 0 ? id.substring(i + 1) : id;
    }

    // Documento de una ruta relativa. Lanza FileNotFoundException si no existe.
    static Uri documento(Context c, String ruta) throws FileNotFoundException {
        Uri arbol = arbol(c);
        if (arbol == null) throw new FileNotFoundException("No hay carpeta");
        String conocido = rutas.get(ruta);
        if (conocido != null) return DocumentsContract.buildDocumentUriUsingTree(arbol, conocido);
        String actual = DocumentsContract.getTreeDocumentId(arbol);
        String prefijo = "";
        for (String parte : ruta.split("/")) {
            if (parte.isEmpty()) continue;
            String clave = prefijo.isEmpty() ? parte : prefijo + "/" + parte;
            String hijo = rutas.get(clave);
            if (hijo == null) {
                hijos(c, arbol, actual, prefijo);
                hijo = rutas.get(clave);
            }
            if (hijo == null) throw new FileNotFoundException(ruta);
            actual = hijo;
            prefijo = clave;
        }
        return DocumentsContract.buildDocumentUriUsingTree(arbol, actual);
    }

    // Anota en el caché los hijos de una carpeta.
    private static void hijos(Context c, Uri arbol, String docId, String prefijo) {
        Uri u = DocumentsContract.buildChildDocumentsUriUsingTree(arbol, docId);
        try (Cursor cur = c.getContentResolver().query(u, COLUMNAS, null, null, null)) {
            if (cur == null) return;
            while (cur.moveToNext()) {
                String n = cur.getString(1);
                if (n != null) rutas.put(prefijo.isEmpty() ? n : prefijo + "/" + n, cur.getString(0));
            }
        } catch (Exception ignorada) { /* carpeta ilegible */ }
    }

    // Recorre toda la carpeta. Devuelve { archivos: [{ruta, nombre, carpeta, tamano, modificado}], portadas: {carpeta: ruta} }.
    static JSObject listar(Context c, Set<String> extensiones, Set<String> ignoradas, Set<String> caratulas) throws FileNotFoundException {
        Uri arbol = arbol(c);
        if (arbol == null) throw new FileNotFoundException("No hay carpeta");
        JSArray archivos = new JSArray();
        JSObject portadas = new JSObject();
        List<String[]> pendientes = new ArrayList<>(); // {docId, prefijo}
        pendientes.add(new String[] { DocumentsContract.getTreeDocumentId(arbol), "" });
        while (!pendientes.isEmpty()) {
            String[] dir = pendientes.remove(pendientes.size() - 1);
            String prefijo = dir[1];
            String carpeta = prefijo.isEmpty() ? "" : prefijo.substring(0, prefijo.length() - 1);
            Uri u = DocumentsContract.buildChildDocumentsUriUsingTree(arbol, dir[0]);
            try (Cursor cur = c.getContentResolver().query(u, COLUMNAS, null, null, null)) {
                if (cur == null) continue;
                String portada = null;
                while (cur.moveToNext()) {
                    String id = cur.getString(0);
                    String n = cur.getString(1);
                    if (n == null || n.startsWith(".")) continue;
                    String ruta = prefijo + n;
                    rutas.put(ruta, id);
                    String nl = n.toLowerCase(Locale.ROOT);
                    if (DocumentsContract.Document.MIME_TYPE_DIR.equals(cur.getString(2))) {
                        if (!ignoradas.contains(nl)) pendientes.add(new String[] { id, ruta + "/" });
                        continue;
                    }
                    if (extensiones.contains(extension(nl))) {
                        JSObject a = new JSObject();
                        a.put("ruta", ruta);
                        a.put("nombre", n);
                        a.put("carpeta", carpeta);
                        a.put("tamano", cur.isNull(3) ? 0 : cur.getLong(3));
                        a.put("modificado", cur.isNull(4) ? 0 : cur.getLong(4));
                        archivos.put(a);
                    } else if (caratulas.contains(nl) && (portada == null || nl.compareTo(portada.toLowerCase(Locale.ROOT)) < 0)) {
                        portada = n;
                    }
                }
                if (portada != null) portadas.put(carpeta, prefijo + portada);
            }
        }
        JSObject r = new JSObject();
        r.put("archivos", archivos);
        r.put("portadas", portadas);
        return r;
    }

    static String extension(String n) {
        int i = n.lastIndexOf('.');
        return i < 0 ? "" : n.substring(i + 1).toLowerCase(Locale.ROOT);
    }

    static String mime(String ruta) {
        switch (extension(ruta)) {
            case "mp3": return "audio/mpeg";
            case "m4a": return "audio/mp4";
            case "aac": return "audio/aac";
            case "ogg": case "opus": return "audio/ogg";
            case "flac": return "audio/flac";
            case "wav": return "audio/wav";
            case "mp4": case "m4v": return "video/mp4";
            case "webm": return "video/webm";
            case "jpg": case "jpeg": return "image/jpeg";
            case "png": return "image/png";
            default: return "application/octet-stream";
        }
    }
}
