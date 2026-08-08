package app.hauku.android

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import app.hauku.android.ui.theme.HaukuTheme

class MainActivity : ComponentActivity() {

    // Tila jota näytetään ruudulla - päivittyy lupapyyntöjen tuloksen mukaan
    private var permissionStatus by mutableStateOf("Ei käynnistetty")

    // Vaihe 2: tausta-sijainti, pyydetään erikseen vaiheen 1 jälkeen
    // (Android ei salli tätä samassa pyynnössä ACCESS_FINE_LOCATIONin kanssa)
    private val backgroundLocationLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ ->
        // Käyttäjä voi kieltää tämänkin luvan - jatketaan siitä huolimatta
        // akkuoptimointipyyntöön (ks. valmistusohjeen kohta 9.1), koska
        // tausta-sijainti puuttuisi silloin jo, mutta muu lupavuo ei saa
        // jäädä siihen kiinni.
        requestBatteryOptimizationExemptionIfNeeded()
    }

    // Vaihe 3: akkuoptimointivapautus (ks. valmistusohjeen kohta 9.1) -
    // järjestelmän oma dialogi, ei tarvitse itse navigoida Asetuksiin.
    // Tuloksesta ei voi luottavaisesti päätellä hyväksyikö käyttäjä
    // pyynnön (käyttäjä voi myös peruuttaa dialogin) - tarkistetaan
    // todellinen tila erikseen isIgnoringBatteryOptimizations()-kutsulla
    // ennen pyynnön näyttämistä, ei jälkikäteen tuloksesta.
    private val batteryOptimizationLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { _ ->
        startTrackingService()
    }

    // Vaihe 1: tavallinen sijainti + mikrofoni + notifikaatiot (Android 13+)
    private val initialPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val fineLocationGranted = results[Manifest.permission.ACCESS_FINE_LOCATION] == true
        if (fineLocationGranted) {
            requestBackgroundLocationIfNeeded()
        } else {
            permissionStatus = "Sijaintilupaa ei myönnetty - taustaseuranta ei voi käynnistyä."
        }
    }

    private fun hasNativePermission(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(this, permission) ==
            PackageManager.PERMISSION_GRANTED
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Chrome DevTools -etäselaus vain debug-builgeissa (ks. keskustelu
        // 31.7.2026, valmistusohjeen kohta 17.3) - ei tuotantoon.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        setContent {
            HaukuTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    Column(modifier = Modifier.padding(innerPadding).fillMaxSize()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "Hauku Android v${BuildConfig.VERSION_NAME} " +
                                    "(build ${BuildConfig.VERSION_CODE})",
                                style = MaterialTheme.typography.labelSmall
                            )
                            Greeting(name = "Android")
                            Text(text = "Tausta-seurannan tila: $permissionStatus")
                            Button(onClick = { beginPermissionFlow() }) {
                                Text("Käynnistä tausta-seuranta (testi)")
                            }
                        }
                        AndroidView(
                            modifier = Modifier.fillMaxWidth().weight(1f),
                            factory = { context ->
                                WebView(context).apply {
                                    layoutParams = android.view.ViewGroup.LayoutParams(
                                        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                                        android.view.ViewGroup.LayoutParams.MATCH_PARENT
                                    )
                                    settings.javaScriptEnabled = true
                                    settings.domStorageEnabled = true

                                    // WebView pitää oman HTTP-välimuistinsa,
                                    // eikä sille ole "kovan päivityksen" -
                                    // eleitä kuten selaimessa (index.html ei
                                    // ole itse cache-bustattu, ks. whitepaper
                                    // kohta 11) - debug-buildissa ohitetaan
                                    // välimuisti kokonaan, jotta uusin
                                    // index.html/shared.js latautuu aina
                                    // kehityksen aikana. Ei tuotantoon (turha
                                    // verkkoliikenne joka lataukselle).
                                    if (BuildConfig.DEBUG) {
                                        settings.cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE
                                        clearCache(true)
                                    }

                                    // Firebase Authin auth-iframe (eri domain,
                                    // hauku-3b13a.firebaseapp.com) tarvitsee
                                    // kolmannen osapuolen evästepääsyn - WebView
                                    // estää tämän oletuksena (ks. keskustelu
                                    // 31.7.2026, valmistusohjeen kohta 13).
                                    val cookieManager = android.webkit.CookieManager.getInstance()
                                    cookieManager.setAcceptCookie(true)
                                    cookieManager.setAcceptThirdPartyCookies(this, true)
                                    // Silta natiivin ja WebView'n omien
                                    // lupamallien välillä (ks. keskustelu
                                    // 31.7.2026, valmistusohjeen kohta 4.5).
                                    // Myönnetään WebView'lle vain se, mitä
                                    // natiivi sovellus on JO saanut käyttö-
                                    // järjestelmältä - ei mitään lisää.
                                    webChromeClient = object : WebChromeClient() {
                                        override fun onGeolocationPermissionsShowPrompt(
                                            origin: String?,
                                            callback: android.webkit.GeolocationPermissions.Callback?
                                        ) {
                                            val granted = hasNativePermission(
                                                Manifest.permission.ACCESS_FINE_LOCATION
                                            )
                                            callback?.invoke(origin, granted, false)
                                        }

                                        override fun onPermissionRequest(
                                            request: PermissionRequest?
                                        ) {
                                            val resources = request?.resources ?: return
                                            val toGrant = resources.filter { resource ->
                                                resource == PermissionRequest.RESOURCE_AUDIO_CAPTURE &&
                                                    hasNativePermission(Manifest.permission.RECORD_AUDIO)
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
                                            if (BuildConfig.DEBUG) {
                                                android.util.Log.d(
                                                    "HaukuWebView",
                                                    "${consoleMessage?.message()} " +
                                                        "(${consoleMessage?.sourceId()}:" +
                                                        "${consoleMessage?.lineNumber()})"
                                                )
                                            }
                                            return true
                                        }
                                    }

                                    // Ajotila (ks. hauku-android-kaare-valmistusohje.md
                                    // kohta 13.1/19.1): tämä on aina NÄKYVÄ WebView,
                                    // joten tila on "wrapper-visible" - shared.js
                                    // käyttäytyy koira-roolissa puhtaana lukijana/
                                    // näyttönä eikä kirjoita sijaintia/hälytystä (se
                                    // hoituu headless-instanssin kautta, ks.
                                    // HaukuBackgroundService). Asetetaan
                                    // evaluateJavascriptilla HETI sivun latauksen
                                    // alkaessa (onPageStarted), koska loadUrl():n
                                    // JÄLKEEN asetettu arvo saattaisi hävitä sivun
                                    // uudelleennavigoinnissa - onPageStarted ajaa
                                    // jokaisella navigoinnilla, myös uudelleenlatauksilla.
                                    webViewClient = object : WebViewClient() {
                                        override fun onPageStarted(
                                            view: WebView?,
                                            url: String?,
                                            favicon: android.graphics.Bitmap?
                                        ) {
                                            view?.evaluateJavascript(
                                                "window.__HAUKU_MODE__ = 'wrapper-visible';",
                                                null
                                            )
                                        }

                                        override fun shouldInterceptRequest(
                                            view: WebView?,
                                            request: android.webkit.WebResourceRequest?
                                        ): android.webkit.WebResourceResponse? {
                                            val url = request?.url?.toString() ?: ""
                                            if (url.contains("/__/auth/iframe")) {
                                                return android.webkit.WebResourceResponse(
                                                    "text/plain", "utf-8", null
                                                )
                                            }
                                            return super.shouldInterceptRequest(view, request)
                                        }

                                        override fun onReceivedError(
                                            view: WebView?,
                                            request: android.webkit.WebResourceRequest?,
                                            error: android.webkit.WebResourceError?
                                        ) {
                                            if (BuildConfig.DEBUG) {
                                                android.util.Log.e(
                                                    "HaukuWebViewError",
                                                    "URL: ${request?.url} - " +
                                                        "Virhe: ${error?.description} " +
                                                        "(koodi ${error?.errorCode})"
                                                )
                                            }
                                        }

                                        override fun onReceivedHttpError(
                                            view: WebView?,
                                            request: android.webkit.WebResourceRequest?,
                                            errorResponse: android.webkit.WebResourceResponse?
                                        ) {
                                            if (BuildConfig.DEBUG) {
                                                android.util.Log.e(
                                                    "HaukuWebViewError",
                                                    "URL: ${request?.url} - " +
                                                        "HTTP-status: ${errorResponse?.statusCode}"
                                                )
                                            }
                                        }
                                    }

                                    loadUrl("https://hauku.app")
                                }
                            },
                            update = { webView ->
                                // Pakottaa WebView'n mittaamaan/piirtämään
                                // itsensä uudelleen Composen lopullisen koon
                                // mukaan - korjaa WebView+Compose-yhdistelmän
                                // tunnetun kokoheiton (ks. keskustelu 31.7.2026).
                                webView.requestLayout()
                            },
                            onRelease = { webView ->
                                // Havaittu 3.8.2026 (ks. valmistusohjeen kohta
                                // 19.3): ilman tätä AndroidView jättää vanhan
                                // WebView-instanssin roikkumaan muistiin
                                // "detached"-tilaan aina kun Compose luo tämän
                                // solmun uudelleen (esim. Activityn
                                // uudelleenluonti) - chrome://inspect näytti
                                // useita orpoja instansseja testien aikana.
                                // Ei vaikuttanut kirjoitusvastuuseen (orvot
                                // ovat aina "wrapper-visible", eivät koskaan
                                // headless), mutta on silti muistivuoto.
                                webView.destroy()
                            }
                        )
                    }
                }
            }
        }
    }

    private fun beginPermissionFlow() {
        val initialPermissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.RECORD_AUDIO
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            initialPermissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        initialPermissionsLauncher.launch(initialPermissions.toTypedArray())
    }

    private fun requestBackgroundLocationIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            backgroundLocationLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        } else {
            requestBatteryOptimizationExemptionIfNeeded()
        }
    }

    // Ks. valmistusohjeen kohta 9.1. HUOM Google Play -käytäntö: tämän
    // intentin käyttö vaatii erillisen "Käyttötapaus"-perustelun Play
    // Consolessa julkaisun yhteydessä (ks. kohta 15) - ei automaattinen,
    // ei saa unohtua ennen julkaisua.
    private fun requestBatteryOptimizationExemptionIfNeeded() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (powerManager.isIgnoringBatteryOptimizations(packageName)) {
            startTrackingService()
            return
        }
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:$packageName")
        }
        batteryOptimizationLauncher.launch(intent)
    }

    private fun startTrackingService() {
        val intent = Intent(this, HaukuBackgroundService::class.java)
        ContextCompat.startForegroundService(this, intent)
        permissionStatus = "Käynnissä - katso pysyvä ilmoitus"
    }
}

@Composable
fun Greeting(name: String, modifier: Modifier = Modifier) {
    Text(
        text = "Hello $name!",
        modifier = modifier
    )
}

@Preview(showBackground = true)
@Composable
fun GreetingPreview() {
    HaukuTheme {
        Greeting("Android")
    }
}
