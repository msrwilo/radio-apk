package com.lafortalezaceramica.radio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// Actividad principal: registra el complemento Musica y pone el cliente de WebView que sirve la música de la carpeta.
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(MusicaPlugin.class);
        super.onCreate(savedInstanceState);
        bridge.setWebViewClient(new MusicaWebViewClient(bridge));
        // 24 nov 2026 (Wilo): la app arranca directo y la radio suena sin esperar un toque.
        bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }

    @Override
    public void onDestroy() {
        // Si la app se cierra de verdad, se quita la notificación de reproducción.
        if (isFinishing()) MusicaServicio.detener(this);
        super.onDestroy();
    }
}
