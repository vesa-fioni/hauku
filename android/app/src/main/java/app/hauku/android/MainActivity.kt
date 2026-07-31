package app.hauku.android

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
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
        // Jatketaan riippumatta tuloksesta - palvelu käynnistetään joka
        // tapauksessa vaiheen 1 luvilla, tausta-sijainti on paras yritys
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            HaukuTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    Column(modifier = Modifier.padding(innerPadding).padding(16.dp)) {
                        Greeting(name = "Android")
                        Text(text = "Tausta-seurannan tila: $permissionStatus")
                        Button(onClick = { beginPermissionFlow() }) {
                            Text("Käynnistä tausta-seuranta (testi)")
                        }
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
            // Alle Android 10: ACCESS_FINE_LOCATION riittää myös taustalla
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
