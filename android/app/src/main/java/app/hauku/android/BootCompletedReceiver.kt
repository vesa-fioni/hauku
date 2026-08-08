package app.hauku.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

// Käynnistää HaukuBackgroundServicen uudelleen laitteen käynnistyksen
// jälkeen, jos tausta-seuranta oli käynnissä ennen sammumista (ks.
// valmistusohjeen kohta 9.2).
//
// Tila luetaan natiivista SharedPreferencesista
// (HaukuBackgroundService.PREFS_NAME/PREF_TRACKING_ACTIVE), EI shared.js:n
// omasta localStoragesta (hauku_paused_v1) - jälkimmäinen kertoisi vain
// "oliko SIJAINTI pysäytetty", mikä on eri asia kuin "oliko TAUSTAPALVELU
// käynnissä". Nämä kaksi tilaa voivat olla ristiriidassa (esim. palvelu
// käynnissä mutta käyttäjä on manuaalisesti pysäyttänyt lähetyksen) -
// tämä vastaanotin välittää vain palvelun, ei sijaintilähetyksen, tilasta.
//
// HUOM (ks. myös HaukuBackgroundService.onStartCommand-kommentti):
// PREF_TRACKING_ACTIVE nollautuu vain onDestroy()ssa, joka ei laukea
// Force Stopista - jos käyttäjä pysäyttää sovelluksen väkisin
// Asetuksista, lippu voi jäädä "true"-tilaan ja palvelu käynnistyisi
// rebootin jälkeen vaikka käyttäjä nimenomaan halusi sen pysäytetyksi.
// Tunnettu, ei vielä ratkaistu rajoitus (ks. valmistusohjeen kohta 9.2).
class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val prefs = context.getSharedPreferences(
            HaukuBackgroundService.PREFS_NAME,
            Context.MODE_PRIVATE
        )
        val wasTracking = prefs.getBoolean(HaukuBackgroundService.PREF_TRACKING_ACTIVE, false)
        if (!wasTracking) return

        val serviceIntent = Intent(context, HaukuBackgroundService::class.java)
        ContextCompat.startForegroundService(context, serviceIntent)
    }
}
