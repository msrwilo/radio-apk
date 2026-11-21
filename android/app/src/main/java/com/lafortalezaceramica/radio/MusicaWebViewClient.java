package com.lafortalezaceramica.radio;

import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

// Sirve la música de la carpeta en https://localhost/_musica_/<ruta>, con soporte de Range para adelantar y para leer etiquetas.
// Al ser el mismo origen que la app, el audio pasa por el AudioContext y los visualizadores sin problemas de CORS.
class MusicaWebViewClient extends BridgeWebViewClient {
    static final String PREFIJO = "/_musica_/";
    private final Context ctx;

    MusicaWebViewClient(Bridge bridge) {
        super(bridge);
        this.ctx = bridge.getContext().getApplicationContext();
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri u = request.getUrl();
        String p = u.getPath();
        if (p != null && p.startsWith(PREFIJO) && "localhost".equals(u.getHost())) {
            return servir(request, p.substring(PREFIJO.length()));
        }
        return super.shouldInterceptRequest(view, request);
    }

    private static String cabecera(WebResourceRequest r, String nombre) {
        Map<String, String> h = r.getRequestHeaders();
        if (h == null) return null;
        for (Map.Entry<String, String> e : h.entrySet()) if (nombre.equalsIgnoreCase(e.getKey())) return e.getValue();
        return null;
    }

    private static WebResourceResponse vacia(int codigo, String frase, Map<String, String> h) {
        return new WebResourceResponse("text/plain", "utf-8", codigo, frase, h, new ByteArrayInputStream(new byte[0]));
    }

    private WebResourceResponse servir(WebResourceRequest req, String ruta) {
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-store");
        ParcelFileDescriptor pfd;
        try {
            pfd = ctx.getContentResolver().openFileDescriptor(CarpetaMusica.documento(ctx, ruta), "r");
        } catch (Exception e) {
            return vacia(404, "Not Found", h);
        }
        if (pfd == null) return vacia(404, "Not Found", h);
        String mime = CarpetaMusica.mime(ruta);
        long total = pfd.getStatSize();
        FileInputStream in = new ParcelFileDescriptor.AutoCloseInputStream(pfd);
        if (total < 0) return new WebResourceResponse(mime, null, 200, "OK", h, in); // tamaño desconocido: sin Range
        h.put("Accept-Ranges", "bytes");
        long ini = 0, fin = total - 1;
        int codigo = 200;
        String frase = "OK";
        String range = cabecera(req, "Range");
        if (range != null && range.trim().startsWith("bytes=") && !range.contains(",")) {
            String[] ab = range.trim().substring(6).split("-", -1);
            try {
                if (ab[0].isEmpty()) {                      // bytes=-500: los últimos 500
                    long n = Long.parseLong(ab[1].trim());
                    ini = Math.max(0, total - n);
                } else {
                    ini = Long.parseLong(ab[0].trim());
                    if (ab.length > 1 && !ab[1].trim().isEmpty()) fin = Math.min(total - 1, Long.parseLong(ab[1].trim()));
                }
            } catch (NumberFormatException e) {
                ini = 0; fin = total - 1;
            }
            if (ini >= total || ini > fin) {
                cerrar(in);
                h.put("Content-Range", "bytes */" + total);
                return vacia(416, "Range Not Satisfiable", h);
            }
            codigo = 206;
            frase = "Partial Content";
            h.put("Content-Range", "bytes " + ini + "-" + fin + "/" + total);
        }
        try {
            if (ini > 0) in.getChannel().position(ini);
        } catch (IOException e) {
            cerrar(in);
            return vacia(500, "Internal Server Error", h);
        }
        long largo = fin - ini + 1;
        h.put("Content-Length", String.valueOf(largo));
        return new WebResourceResponse(mime, null, codigo, frase, h, new Limitado(in, largo));
    }

    private static void cerrar(InputStream in) {
        try { in.close(); } catch (IOException ignorada) { /* */ }
    }

    // Entrega solo `restante` bytes.
    private static final class Limitado extends FilterInputStream {
        private long restante;

        Limitado(InputStream in, long largo) {
            super(in);
            this.restante = largo;
        }

        @Override
        public int read() throws IOException {
            if (restante <= 0) return -1;
            int b = super.read();
            if (b >= 0) restante--;
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (restante <= 0) return -1;
            int n = super.read(b, off, (int) Math.min(len, restante));
            if (n > 0) restante -= n;
            return n;
        }

        @Override
        public long skip(long n) throws IOException {
            long s = super.skip(Math.min(n, restante));
            restante -= s;
            return s;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(super.available(), restante);
        }
    }
}
