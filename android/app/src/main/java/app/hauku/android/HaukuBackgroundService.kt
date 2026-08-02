package app.hauku.android

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
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
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlin.concurrent.thread
import kotlin.math.sqrt

class HaukuBackgroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "hauku_tracking_channel"
        private const val NOTIFICATION_ID = 1

        // PoC 1 -väli (headless WebView -ping)
        private const val PING_INTERVAL_MS = 30_000L

        // PoC 2 -asetukset (GPS + mikrofoni) - EI enää oletusarkkitehtuuri,
        // ks. valmistusohjeen kohta 18.3. Koodi säilytetty kommentoituna
        // dokumentaationa, ei poistettu.
        private const val LOCATION_INTERVAL_MS = 10_000L // sama kuin shared.js:n kynnys
        private const val AUDIO_SAMPLE_RATE = 16_000
        private const val AUDIO_LOG_INTERVAL_MS = 2_000L

        // Headless-instanssin lataama URL. Kohta 18.3 (31.7.2026) totesi
        // ettei natiivi tarvitse syöttää GPS-/äänidataa headlessille -
        // riittää että sama shared.js ajaa itsenäisesti, joten headless
        // ladataan täsmälleen samaan tapaan kuin näkyväkin WebView, vain
        // ?mode=headless-parametrilla varustettuna (ks. hauku-android-
        // kaare-valmistusohje.md kohta 19.1, getRunMode()-varasuunnitelma
        // URL-parametrista). Ei group=/groupName=/apiKey=-parametrejä -
        // headless lukee saman cfg:n jaetusta localStoragesta (ks. kohta
        // 13.2.5, sama origin), ei URL:sta.
        private const val HEADLESS_URL = "https://hauku.app/?mode=headless"
    }

    // --- PoC 1: Headless WebView ---
    private var headlessWebView: WebView? = null
    private val pingHandler = Handler(Looper.getMainLooper())
    private val pingRunnable = object : Runnable {
        override fun run() {
            val timestamp = System.currentTimeMillis()
            headlessWebView?.evaluateJavascript("document.title") { result ->
                Log.d("HaukuHeadlessPoC", "Ping klo $timestamp - sivun otsikko: $result")
            }
            pingHandler.postDelayed(this, PING_INTERVAL_MS)
        }
    }

    // --- PoC 2: GPS (ei käytössä, ks. kohta 18.3 - jätetty koodiin
    // dokumentaationa mahdollista tulevaa hienosäätötarvetta varten) ---
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private var locationCallback: LocationCallback? = null

    // --- PoC 2: Mikrofoni (RMS-taso, ei käytössä, ks. kohta 18.3) ---
    private var audioRecordingThread: Thread? = null
    @Volatile private var isAudioRecording = false

    private fun hasPermission(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(applicationContext, permission) ==
            PackageManager.PERMISSION_GRANTED
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        setupHeadlessWebView()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())
        pingHandler.post(pingRunnable)
        // PÄÄTÖS 31.7.2026 (valmistusohjeen kohta 18.3): headless-
        // instanssin oma shared.js hoitaa GPS:n ja äänen itsenäisesti,
        // molemmat PoC:t (GPS + audio) läpäisty myös ruudun ollessa
        // lukittuna. Natiivi capture jätetään koodiin dokumentaationa
        // mahdollista tulevaa hienosäätötarvetta varten, ei aktiivinen
        // oletusarkkitehtuuri.
        // startLocationUpdates()
        // VÄLIAIKAISESTI POIS PÄÄLTÄ (audio-PoC, kohta 18.2, 31.7.2026):
        // epäily että tämä kilpailee mikrofonista JS:n getUserMedia-kutsun
        // kanssa ("Could not start audio source" -virhe). Palauta kun
        // testi on tehty, tai jätä pois jos kohta 18.2 päättää natiivin
        // AudioRecordin olevan tarpeeton.
        // startAudioRecording()
        return START_STICKY
    }

    private fun startLocationUpdates() {
        if (!hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) {
            Log.w("HaukuLocationPoC", "Ei sijaintilupaa - GPS-seuranta ei käynnisty")
            return
        }
        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            LOCATION_INTERVAL_MS
        ).build()

        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val location = result.lastLocation ?: return
                Log.d(
                    "HaukuLocationPoC",
                    "GPS-fiksi klo ${System.currentTimeMillis()}: " +
                        "lat=${location.latitude}, lng=${location.longitude}, " +
                        "accuracy=${location.accuracy}m"
                )
            }
        }
        locationCallback = callback
        fusedLocationClient.requestLocationUpdates(request, callback, Looper.getMainLooper())
    }

    private fun startAudioRecording() {
        if (!hasPermission(Manifest.permission.RECORD_AUDIO)) {
            Log.w("HaukuAudioPoC", "Ei mikrofonilupaa - äänenseuranta ei käynnisty")
            return
        }
        val minBufferSize = AudioRecord.getMinBufferSize(
            AUDIO_SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBufferSize <= 0) {
            Log.w("HaukuAudioPoC", "AudioRecord.getMinBufferSize epäonnistui, ei käynnistetä")
            return
        }

        val audioRecord = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            AUDIO_SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            minBufferSize * 2
        )
        if (audioRecord.state != AudioRecord.STATE_INITIALIZED) {
            Log.w("HaukuAudioPoC", "AudioRecord ei alustunut oikein")
            return
        }

        isAudioRecording = true
        audioRecord.startRecording()

        // Erillinen taustasäie, koska AudioRecord.read() on lukkiutuva
        // kutsu - ei saa ajaa pääsäikeessä (jossa headless WebView ja
        // GPS-callbackit pyörivät).
        audioRecordingThread = thread(start = true, name = "HaukuAudioPoCThread") {
            val buffer = ShortArray(minBufferSize)
            var lastLogTime = 0L
            while (isAudioRecording) {
                val readCount = audioRecord.read(buffer, 0, buffer.size)
                if (readCount > 0) {
                    var sumOfSquares = 0.0
                    for (i in 0 until readCount) {
                        sumOfSquares += buffer[i].toDouble() * buffer[i].toDouble()
                    }
                    val rms = sqrt(sumOfSquares / readCount)
                    val now = System.currentTimeMillis()
                    if (now - lastLogTime >= AUDIO_LOG_INTERVAL_MS) {
                        Log.d("HaukuAudioPoC", "RMS-taso klo $now: ${rms.toInt()}")
                        lastLogTime = now
                    }
                }
            }
            audioRecord.stop()
            audioRecord.release()
        }
    }

    private fun stopAudioRecording() {
        isAudioRecording = false
        audioRecordingThread?.join(500)
        audioRecordingThread = null
    }

    private fun setupHeadlessWebView() {
        val webView = WebView(applicationContext)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            // Ajotila (ks. hauku-android-kaare-valmistusohje.md kohta
            // 13.1/19.1): tämä on foreground servicen omistama HEADLESS-
            // instanssi, ei koskaan kiinnitetty näkymähierarkiaan eikä
            // koskaan onPause/onResume-kutsuttu (ks. kohta 4.4/10.1).
            // Asetetaan window.__HAUKU_MODE__ = "headless" jo
            // onPageStarted-vaiheessa, ennen kuin shared.js:n
            // DOMContentLoaded-kuuntelija (boot()) ehtii ajaa - shared.js
            // lukee tämän getRunMode()-funktiolla (kohta 19.1) ja jättää
            // sen perusteella kartan/UI:n/onboarding-lomakkeen alustamatta,
            // koska headless-instanssilla ei ole ketään katsomassa niitä.
            //
            // Varasuunnitelma jos ajoitus jostain syystä pettäisi: HEADLESS_URL
            // sisältää myös ?mode=headless-parametrin, jonka getRunMode()
            // lukee URL:sta jos globaalia lippua ei ehditty asettaa - kaksi
            // riippumatonta reittiä samaan lopputulokseen.
            override fun onPageStarted(
                view: WebView?,
                url: String?,
                favicon: android.graphics.Bitmap?
            ) {
                view?.evaluateJavascript(
                    "window.__HAUKU_MODE__ = 'headless';",
                    null
                )
            }

            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url?.toString() ?: ""
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

            override fun onConsoleMessage(
                consoleMessage: android.webkit.ConsoleMessage?
            ): Boolean {
                // Sama debug-lokitus kuin näkyvässä WebView'ssä (ks.
                // valmistusohjeen kohta 17.3) - puuttui headlessistä tähän
                // asti. Tarpeen audio-PoC:n (kohta 18.2) diagnosointiin.
                if (BuildConfig.DEBUG) {
                    Log.d(
                        "HaukuHeadlessConsole",
                        "${consoleMessage?.message()} " +
                            "(${consoleMessage?.sourceId()}:" +
                            "${consoleMessage?.lineNumber()})"
                    )
                }
                return true
            }
        }

        // Ladataan sama shared.js:ää käyttävä sivu, ?mode=headless-
        // parametrilla varustettuna (ks. yllä HEADLESS_URL ja kohta 19.1).
        // Aiemmin (PoC 3, kohta 12) tämä osoitettiin suoraan ryhmälinkkiin
        // testausta varten - tuotannossa tätä ei enää tarvita, koska
        // shared.js lukee jo tallennetun cfg:n localStoragesta ja käynnistää
        // itsensä sen perusteella (ks. boot(), kohta 13.2.5) heti kun
        // näkyvä wrapper-instanssi on kerran tallentanut sen.
        webView.loadUrl(HEADLESS_URL)
        headlessWebView = webView
    }

    override fun onDestroy() {
        pingHandler.removeCallbacks(pingRunnable)
        headlessWebView?.destroy()
        headlessWebView = null
        locationCallback?.let { fusedLocationClient.removeLocationUpdates(it) }
        stopAudioRecording()
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
