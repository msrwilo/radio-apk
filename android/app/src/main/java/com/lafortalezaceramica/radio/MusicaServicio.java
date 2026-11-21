package com.lafortalezaceramica.radio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import androidx.media.session.MediaButtonReceiver;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

// Servicio en primer plano de reproducción: mantiene viva la app con la pantalla apagada y publica la sesión de medios
// (notificación con carátula, pantalla de bloqueo, Bluetooth y botones del volante). El audio lo sigue tocando la web.
public class MusicaServicio extends Service {
    static final String CANAL = "radio_reproduccion";
    static final int ID = 7301;
    private static final long APAGAR_EN_PAUSA_MS = 15 * 60 * 1000L; // en pausa 15 min, se quita la notificación

    static final class Datos {
        String titulo = "La Fortaleza Radio", artista = "", album = "";
        Bitmap portada;
        boolean cambiaPortada;
        boolean reproduciendo;
        long duracionMs = -1, posicionMs = -1;
        Set<String> acciones = new HashSet<>();
    }

    private static MusicaServicio vivo;
    private static Datos pendiente;
    private static Bitmap portadaActual;

    private MediaSessionCompat sesion;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Runnable apagar = () -> { ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE); stopSelf(); };
    private String claveMeta = "";

    static synchronized void actualizar(Context c, Datos d) {
        if (d.cambiaPortada) portadaActual = d.portada;
        pendiente = d;
        if (vivo != null) {
            final MusicaServicio s = vivo;
            s.h.post(() -> s.aplicar(d));
        } else if (d.reproduciendo) {
            ContextCompat.startForegroundService(c, new Intent(c, MusicaServicio.class));
        }
    }

    static synchronized void detener(Context c) {
        pendiente = null;
        c.stopService(new Intent(c, MusicaServicio.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        synchronized (MusicaServicio.class) { vivo = this; }
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CANAL, "Reproducción", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Controles de la radio y de la música");
            ch.setShowBadge(false);
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
        sesion = new MediaSessionCompat(this, "RadioFortaleza");
        sesion.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { MusicaPlugin.accion("play", null); }
            @Override public void onPause() { MusicaPlugin.accion("pause", null); }
            @Override public void onStop() { MusicaPlugin.accion("pause", null); }
            @Override public void onSkipToNext() { MusicaPlugin.accion("nexttrack", null); }
            @Override public void onSkipToPrevious() { MusicaPlugin.accion("previoustrack", null); }
            @Override public void onFastForward() { MusicaPlugin.accion("seekforward", null); }
            @Override public void onRewind() { MusicaPlugin.accion("seekbackward", null); }
            @Override public void onSeekTo(long pos) { MusicaPlugin.accion("seekto", pos / 1000.0); }
        });
        Intent abrir = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        sesion.setSessionActivity(PendingIntent.getActivity(this, 1, abrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        sesion.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Hay que pasar a primer plano de inmediato, aunque el servicio lo haya despertado un botón.
        aplicar(pendiente != null ? pendiente : new Datos());
        MediaButtonReceiver.handleIntent(sesion, intent);
        return START_NOT_STICKY;
    }

    private void aplicar(Datos d) {
        if (sesion == null) return;
        String clave = d.titulo + "|" + d.artista + "|" + d.album + "|" + d.duracionMs + "|" + System.identityHashCode(portadaActual);
        if (!clave.equals(claveMeta)) {
            claveMeta = clave;
            MediaMetadataCompat.Builder m = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, d.titulo)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, d.artista)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, d.album);
            if (d.duracionMs > 0) m.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, d.duracionMs);
            if (portadaActual != null) m.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, portadaActual);
            sesion.setMetadata(m.build());
        }
        long acciones = PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_STOP;
        if (d.acciones.contains("nexttrack")) acciones |= PlaybackStateCompat.ACTION_SKIP_TO_NEXT;
        if (d.acciones.contains("previoustrack")) acciones |= PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS;
        if (d.acciones.contains("seekto") && d.duracionMs > 0) acciones |= PlaybackStateCompat.ACTION_SEEK_TO;
        if (d.acciones.contains("seekforward")) acciones |= PlaybackStateCompat.ACTION_FAST_FORWARD;
        if (d.acciones.contains("seekbackward")) acciones |= PlaybackStateCompat.ACTION_REWIND;
        sesion.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(acciones)
            .setState(d.reproduciendo ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                d.posicionMs >= 0 ? d.posicionMs : PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, d.reproduciendo ? 1f : 0f)
            .build());

        Notification n = notificacion(d);
        int tipo = Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        ServiceCompat.startForeground(this, ID, n, tipo);
        h.removeCallbacks(apagar);
        if (!d.reproduciendo) h.postDelayed(apagar, APAGAR_EN_PAUSA_MS);
    }

    private Notification notificacion(Datos d) {
        List<NotificationCompat.Action> acc = new ArrayList<>();
        List<Integer> compacto = new ArrayList<>();
        if (d.acciones.contains("previoustrack")) {
            compacto.add(acc.size());
            acc.add(new NotificationCompat.Action(R.drawable.ic_notif_anterior, "Anterior",
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)));
        }
        compacto.add(acc.size());
        acc.add(d.reproduciendo
            ? new NotificationCompat.Action(R.drawable.ic_notif_pausa, "Pausa",
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_PAUSE))
            : new NotificationCompat.Action(R.drawable.ic_notif_play, "Reproducir",
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_PLAY)));
        if (d.acciones.contains("nexttrack")) {
            compacto.add(acc.size());
            acc.add(new NotificationCompat.Action(R.drawable.ic_notif_siguiente, "Siguiente",
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_NEXT)));
        }
        int[] comp = new int[compacto.size()];
        for (int i = 0; i < comp.length; i++) comp[i] = compacto.get(i);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_notif_radio)
            .setContentTitle(d.titulo)
            .setContentText(d.artista)
            .setSubText(d.album)
            .setLargeIcon(portadaActual)
            .setContentIntent(sesion.getController().getSessionActivity())
            .setDeleteIntent(MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_STOP))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(d.reproduciendo)
            .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(sesion.getSessionToken())
                .setShowActionsInCompactView(comp));
        for (NotificationCompat.Action a : acc) b.addAction(a);
        return b.build();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Si se quita la app de recientes, la web se muere: no tiene caso dejar la notificación.
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        h.removeCallbacks(apagar);
        synchronized (MusicaServicio.class) { if (vivo == this) vivo = null; }
        if (sesion != null) { sesion.setActive(false); sesion.release(); sesion = null; }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
