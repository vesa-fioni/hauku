package app.hauku.android

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class HaukuBackgroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "hauku_tracking_channel"
        private const val NOTIFICATION_ID = 1

        // PoC-testiväli (kohta 12, PoC 1) - todistaa headless-instanssin
        // pysyvän hengissä ja vastaavan evaluateJavascript-kutsuihin ruudun
        // ollessa pois päältä / sovelluksen ollessa taustalla. Poistetaan
        // tai muutetaan harvemmaksi kun PoC on validoitu.
        private const val PING_INTERVAL_MS = 30_000L
    }

    // Headless WebView - EI KOSKAAN liitetä mihinkään näkymähierarkiaan,
    // EI KOSKAAN kutsuta onPause()/onResume()/pauseTimers() -metodeja.
    // Tämä on nimenomaan se ehto jonka varaan koko PoC nojaa (ks.
    // valmistusohjeen kohta 10.1 - kiinnittämätön WebView pysyy pysyvästi
    // "visible"-tilassa, jolloin Chromiumin ajastinkuristus ei laukea).
    private var headlessWebView: WebView? = null

    private val pingHandler = Handler(Looper.getMainLooper())
    private val pingRunnable = object : Runnable {
        override fun run() {
            val timestamp = System.currentTimeMillis()
            headlessWebView?.evaluateJavascript("document.title") { result ->
                Log.d(
                    "HaukuHeadlessPoC",
                    "Ping klo $timestamp - sivun otsikko: $result"
                )
            }
            pingHandler.postDelayed(this, PING_INTERVAL_MS)
        }
    }

    private fun hasPermission(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(applicationContext, permission) ==
            PackageManager.PERMISSION_GRANTED
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        setupHeadlessWebView()
    }

    private fun setupHeadlessWebView() {
        val webView = WebView(applicationContext)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url?.toString() ?: ""
                // Sama Firebase Auth -iframe-esto kuin näkyvässä WebView'ssä
                // (ks. valmistusohjeen kohta 17.1) - tarpeeton koska Hauku
                // käyttää vain signInAnonymously():a.
                if (url.contains("/__/auth/iframe")) {
                    return WebResourceResponse("text/plain", "utf-8", null)
                }
                return super.shouldInterceptRequest(view, request)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                val granted = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                callback?.invoke(origin, granted, false)
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                val resources = request?.resources ?: return
                val toGrant = resources.filter { resource ->
                    resource == PermissionRequest.RESOURCE_AUDIO_CAPTURE &&
                        hasPermission(Manifest.permission.RECORD_AUDIO)
                }
                if (toGrant.isNotEmpty()) {
                    request.grant(toGrant.toTypedArray())
                } else {
                    request.deny()
                }
            }
        }

        // HUOM: PoC-vaiheessa ladataan vain teaser-sivu, ei oikeaa ryhmä-
        // linkkiä - PoC 1 todistaa vain "pysyykö WebView hengissä", ei
        // vielä koko kirjoitusputkea (se on PoC 3, kohta 12).
        webView.loadUrl("https://hauku.app")

        headlessWebView = webView
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())
        pingHandler.post(pingRunnable)
        return START_STICKY
    }

    override fun onDestroy() {
        pingHandler.removeCallbacks(pingRunnable)
        headlessWebView?.destroy()
        headlessWebView = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Hauku")
            .setContentText("Hauku seuraa sijaintia ja ääntä")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Hauku-seuranta",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }
}
