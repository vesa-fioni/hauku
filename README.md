# Hauku 🐾 (web-versio)

Kaksi HTML-sivua: `dog.html` (koiramoodi) ja `hunter.html` (metsästäjämoodi).
Molemmat sekä lähettävät oman sijainnin että näyttävät kaikkien ryhmän jäsenten
sijainnin ja jäljen kartalla. Ryhmä muodostuu ryhmäkoodin perusteella.

Ei vaadi Android-sovellusta, asennusta tai omaa palvelinta - toimii suoraan
puhelimen selaimessa, ja koko sivusto voidaan julkaista ilmaiseksi GitHub Pagesin
kautta.

## Tärkeää: jokainen käyttäjä tarvitsee OMAN Firebase-projektin

Koodissa ei ole mitään Firebase-avaimia kovakoodattuna. Kun sivu ladataan
ensimmäistä kertaa, se kysyy lomakkeella:
- Ryhmäkoodi
- Nimi
- Firebase-projektin `apiKey`, `authDomain`, `projectId`, `appId`

Nämä tallennetaan **vain kyseiseen selaimeen** (`localStorage`), ei mihinkään
palvelimelle tai GitHubiin. Näin voit julkaista tämän koodin täysin julkisesti -
kukaan testaaja ei vahingossa kirjoita sinun Firestoreesi, koska jokainen syöttää
omat avaimensa.

## Firebase-projektin perustaminen (jokainen käyttäjä tekee tämän itse)

1. [Firebase Console](https://console.firebase.google.com/) -> "Add project" -> anna projektille nimi
2. **Authentication** -> Sign-in method -> ota käyttöön **Anonymous**
3. **Firestore Database** -> Create database (valitse sopiva alue, esim. `eur3`)
4. **Firestore -> Rules** -välilehdelle: kopioi tämän repon `firestore.rules`-tiedoston
   sisältö ja julkaise (Publish)
5. **Project settings** (rataskuvake) -> "Your apps" -> Add app -> **Web** (`</>`-kuvake)
   - Ei tarvitse Firebase Hostingia, riittää että saat config-objektin
   - Kopioi sieltä `apiKey`, `authDomain`, `projectId`, `appId` sivun lomakkeeseen

Firebasen ilmainen Spark-taso riittää tähän käyttöön mainiosti (pieni datamäärä,
harrastekäyttö).

## GitHub Pagesin käyttöönotto

1. Luo uusi GitHub-repositorio ja työnnä (`push`) tämän kansion sisältö sinne
2. Repositoriossa: **Settings -> Pages**
3. "Build and deployment" -> Source: **Deploy from a branch**
4. Branch: `main` (tai mikä oletushaarasi on), kansio: `/ (root)`
5. Tallenna - GitHub antaa muutaman minuutin päästä osoitteen muotoa
   `https://KAYTTAJANIMI.github.io/hauku/`
6. Koiran puhelimella avataan `.../dog.html`, metsästäjän puhelimella `.../hunter.html`

## Tunnetut rajoitteet (tässä web-versiossa)

- **Ei toimi luotettavasti taustalla.** Kun puhelimen näyttö sammuu tai selain
  siirtyy taustalle, mobiiliselaimet pysäyttävät `watchPosition`-kutsun ajan myötä.
  Tämä versio toimii hyvin **testaukseen ja lyhyisiin käyttöihin ruutu päällä**,
  mutta ei vielä ratkaise "koira selässä, ruutu pimeänä tunteja" -tilannetta.
  Tämä oli tarkoituksella jätetty seuraavaan vaiheeseen (natiivi Android-kääre).
- **Jäljen (`track`-kokoelma) koko kasvaa rajattomasti.** Pidemmillä testeillä
  kannattaa käydä välillä tyhjentämässä Firestoresta testidataa.
- **Pääsynhallinta on jaettu ryhmäkoodi**, ei käyttäjätilipohjainen - kuka tahansa
  koodin tietävä pääsee ryhmään.
- **HTTPS vaaditaan** selaimen sijaintirajapinnalle - GitHub Pages tarjoaa tämän
  automaattisesti, joten tämä ei ole ongelma.

## Seuraavat vaiheet (kun web-versio on testattu ja toimii halutusti)

- Natiivi Android-kääre foreground service -taustatoiminnolla luotettavaan
  taustalla-toimintaan (tästä keskusteltiin aiemmin, ei toteutettu vielä tässä
  vaiheessa tarkoituksella)
- Jäljen siivouslogiikka (esim. "tyhjennä ryhmä" -nappi tai automaattinen
  vanhenemisaika Firestoressa)
