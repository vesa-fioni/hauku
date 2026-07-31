# Hauku — Android-kääre

Tämä kansio sisältää Hauku-sovelluksen Android-natiivin kääreen
(Android Studio -projekti), joka ratkaisee whitepaperin tunnetun rajoitteen
14.1: selain pysäyttää GPS-seurannan ja äänitunnistuksen kun ruutu sammuu.

**Arkkitehtuuri ja suunnittelupäätökset:** ks. `hauku-android-kaare-valmistusohje.md`
(repon juuressa/dokumentaatiokansiossa) — kaikki tässä kansiossa tehtävät
ratkaisut noudattavat kyseistä valmistusohjetta. Päivitä valmistusohjetta
kun arkkitehtuuripäätöksiä tarkennetaan koodauksen edetessä.

**Tila: aloitettu, ei vielä toimiva versio.**

## Rakenne (täydentyy)

- `app/` — Android Studio -sovellusmoduuli (Kotlin)
- Ei vielä muuta

## Suhde `shared.js`/`index.html`-koodiin

Android-kääre lataa ja ajaa samaa web-koodia kuin repon juuren `shared.js`/
`index.html` (headless WebView + näkyvä WebView, ks. valmistusohjeen
kohdat 3–4 ja 13). Tämä kansio ei sisällä kopiota web-koodista — se
viittaa/lataa sen olemassa olevasta lähteestä kehityksen edetessä
tarkemmin suunniteltavalla tavalla (ks. valmistusohjeen kohta 13.3).
