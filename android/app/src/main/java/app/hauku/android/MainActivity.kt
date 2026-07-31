package app.hauku.android

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
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
        setContent {
            HaukuTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    Column(modifier = Modifier.padding(innerPadding)) {
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
                            modifier = Modifier.fillMaxWidth().fillMaxSize(),
                            factory = { context ->
                                WebView(context).apply {
                                    settings.javaScriptEnabled = true
                                    settings.domStorageEnabled = true

                                    // Firebase Authin auth-iframe (eri domain,
                                    // hauku-3b13a.firebaseapp.com) tarvitsee
                                    // kolmannen osapuolen evästepääsyn - WebView
                                    // estää tämän oletuksena (ks. keskustelu
                                    // 31.7.2026, valmistusohjeen kohta 13).
                                    val cookieManager = android.webkit.CookieManager.getInstance()
                                    cookieManager.setAcceptCookie(true)
                                    cookieManager.setAcceptThirdPartyCookies(this, true)
                                    webViewClient = object : WebViewClient() {
                                        override fun shouldInterceptRequest(
                                            view: WebView?,
                                            request: android.webkit.WebResourceRequest?
                                        ): android.webkit.WebResourceResponse? {
                                            val url = request?.url?.toString() ?: ""
                                            // Hauku käyttää vain signInAnonymously():a,
                                            // joten Firebase Authin OAuth-apuiframe
                                            // (popup/redirect-kirjautumisia varten)
                                            // on tarpeeton - estetään sen lataus,
                                            // jotta epäonnistunut iframe-navigointi
                                            // ei peitä koko näkyvää WebView'ta
                                            // (ks. keskustelu 31.7.2026).
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
                                            android.util.Log.e(
                                                "HaukuWebViewError",
                                                "URL: ${request?.url} - " +
                                                    "Virhe: ${error?.description} " +
                                                    "(koodi ${error?.errorCode})"
                                            )
                                        }

                                        override fun onReceivedHttpError(
                                            view: WebView?,
                                            request: android.webkit.WebResourceRequest?,
                                            errorResponse: android.webkit.WebResourceResponse?
                                        ) {
                                            android.util.Log.e(
                                                "HaukuWebViewError",
                                                "URL: ${request?.url} - " +
                                                    "HTTP-status: ${errorResponse?.statusCode}"
                                            )
                                        }
                                    }

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
                                            android.util.Log.d(
                                                "HaukuWebView",
                                                "${consoleMessage?.message()} " +
                                                    "(${consoleMessage?.sourceId()}:" +
                                                    "${consoleMessage?.lineNumber()})"
                                            )
                                            return true
                                        }
                                    }

                                    loadUrl("https://hauku.app")
                                }
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
            startTrackingService()
        }
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
