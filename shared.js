// shared.js
// Yksi sovellus: aloitusnäkymä kysyy ryhmäkoodin, nimen ja roolin (koira/metsästäjä).
// Rooli on käyttäjän asetus (cfg.role), ei enää erillinen sivu.

const CONFIG_KEY = "hauku_config_v1";

// GPS-tarkkuussuodatin: pos.coords.accuracy (metriä) tätä huonompi piste
// hylätään suoraan, ennen nopeuslaskentaa. Kiinni erityisesti solutorni-/
// WiFi-paikannukseen puiden katveessa (paljon suurempi accuracy-arvo kuin
// oikea GPS-lukema). Sama varaventtiili-periaate kuin nopeussuodattimessa:
// jos useampi peräkkäinen piste hylätään pelkän tarkkuuden takia, seuraava
// hyväksytään pakolla ettei jälki/sijainti jää pysyvästi jumiin jos oikea
// signaali on aidosti pysyvästi huono (esim. koko retki syvässä metsässä).
const MAX_ACCURACY_METERS = 100;
const MAX_CONSECUTIVE_ACCURACY_REJECTS = 3;

// Jäljen katkaisu pitkän aikavälin jälkeen (v48): nopeussuodatin (ks. alla)
// katsoo vain matka/aika-suhdetta, ei koskaan sitä onko aikaväli itsessään
// järjetön. Jos kirjoitusten välissä on pitkä tauko (sovellus pysäytetty,
// puhelin taustalla, tai siirrytty autolla toiselle paikkakunnalle kahden
// kirjoituksen välissä), laskettu nopeus voi näyttää täysin uskottavalta
// vaikka etäisyys olisi satoja kilometrejä - koska aikaakin oli paljon.
// Tästä syystä pitkän tauon jälkeinen piste ei koskaan yhdisty viivalla
// edelliseen, riippumatta lasketusta nopeudesta - emme tiedä mitä reittiä
// pitkin siirtymä todellisuudessa tapahtui.
const MAX_GAP_MS = 20 * 60 * 1000; // 20 min

// ---- Config: lataus, tallennus, URL-oletukset ----

function loadConfig() {
  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

// Lukee Firebase-avaimet, liittymiskoodin, ryhmän nimen ja (valinnaisesti) roolin URL-parametreista.
// Esim. index.html?group=X7K2P9QM&groupName=Syyshirvijahti&apiKey=...&role=dog
function getUrlConfig() {
  const p = new URLSearchParams(window.location.search);
  const result = {};

  const group = p.get("group");
  if (group) result.groupCode = group;

  const groupName = p.get("groupName");
  if (groupName) result.groupName = groupName;

  const role = p.get("role");
  if (role === "dog" || role === "hunter") result.role = role;

  const mapStyle = p.get("mapStyle");
  if (mapStyle === "osm" || mapStyle === "topo" || mapStyle === "mml") result.mapStyle = mapStyle;

  // Huom: mmlApiKey luetaan URL:sta jos sellainen sattuu olemaan (esim.
  // käyttäjä rakentaa linkin itse käsin), mutta sovelluksen oma "Kopioi
  // jakolinkki" / "Jaa..." ei enää laita tätä linkkiin - ks. buildShareLink.
  const mmlApiKey = p.get("mmlApiKey");
  if (mmlApiKey) result.mmlApiKey = mmlApiKey;

  const fb = {};
  ["apiKey", "authDomain", "projectId", "appId"].forEach((key) => {
    const val = p.get(key);
    if (val) fb[key] = val;
  });
  if (Object.keys(fb).length > 0) result.firebase = fb;

  return result;
}

// Generoi satunnaisen, ei-arvattavan liittymiskoodin. Käyttäjä ei koskaan näe/kirjoita tätä -
// se kulkee vain jakolinkin mukana. Merkistöstä on jätetty pois helposti sekoittuvat merkit (0/O, 1/I).
function generateGroupCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function buildShareLink(cfg) {
  const url = new URL(window.location.origin + window.location.pathname);
  if (cfg.groupCode) url.searchParams.set("group", cfg.groupCode);
  if (cfg.groupName) url.searchParams.set("groupName", cfg.groupName);
  // Huom: mmlApiKey EI kulje jakolinkin mukana tarkoituksella - se on
  // henkilökohtainen, MML:n OmaTili-tilaan sidottu avain, eikä sen leviäminen
  // esim. WhatsApp-viestien tai kuvakaappausten kautta ole toivottavaa.
  // Koska "Maastokartta (MML)" -valinta defaulttaa automaattisesti OSM:ään
  // jos avainta ei ole, jokainen syöttää oman avaimensa itse omalle
  // laitteelleen - ks. keskustelu 24.7.2026.
  if (cfg.firebase) {
    Object.entries(cfg.firebase).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }
  return url.toString();
}

// ---- Onboarding-/asetuslomake ----

function renderConfigForm(existing, urlCfg) {
  urlCfg = urlCfg || {};

  const firebaseFromUrl = !!urlCfg.firebase;

  // Liittymiskoodi on aina piilossa käyttäjältä - se kulkee vain jakolinkin mukana.
  // Jos mikään ei vielä anna koodia (täysin uusi käyttäjä), generoidaan uusi satunnaiskoodi tässä,
  // ja se pysyy samana koko lomakkeen elinkaaren ajan (talteen otettu piilokenttään).
  const groupCodeValue = existing?.groupCode || urlCfg.groupCode || generateGroupCode();
  const groupNameValue = existing?.groupName || urlCfg.groupName || "";
  const isNewGroup = !existing?.groupCode && !urlCfg.groupCode;

  const fbValue = (key) => existing?.firebase?.[key] || urlCfg.firebase?.[key] || "";
  const roleValue = existing?.role || urlCfg.role || "hunter";
  const mapStyleValue = existing?.mapStyle || urlCfg.mapStyle || "osm";
  const mmlApiKeyValue = existing?.mmlApiKey || urlCfg.mmlApiKey || "";
  const autoStopValue = existing?.autoStopMinutes ?? urlCfg.autoStopMinutes ?? 15;

  const groupField = `
    <label>Ryhmän nimi</label>
    <input id="cfg_groupName" placeholder="esim. Syyshirvijahti" value="${groupNameValue}">
    <input type="hidden" id="cfg_group" value="${groupCodeValue}">
    ${isNewGroup
      ? `<p class="hint">Uusi ryhmä luodaan tallennettaessa - jaa linkki tallennuksen jälkeen kutsuaksesi muut.</p>`
      : `<p class="hint">
           <a href="#" id="cfg_new_group_link">Luo uusi ryhmä tämän sijaan</a>
         </p>`}
  `;

  const firebaseFields = firebaseFromUrl
    ? `<p class="hint hint-ok">Firebase-yhteys jo asetettu linkin kautta</p>
       <input type="hidden" id="cfg_apiKey" value="${fbValue("apiKey")}">
       <input type="hidden" id="cfg_authDomain" value="${fbValue("authDomain")}">
       <input type="hidden" id="cfg_projectId" value="${fbValue("projectId")}">
       <input type="hidden" id="cfg_appId" value="${fbValue("appId")}">`
    : `<p class="hint">
         <a href="#" id="cfg_advanced_toggle">Lisäasetukset (Firebase-yhteys)</a>
       </p>
       <div id="cfg_advanced" class="advanced-section" style="display:none;">
         <label>Firebase apiKey</label>
         <input id="cfg_apiKey" value="${fbValue("apiKey")}">

         <label>Firebase authDomain</label>
         <input id="cfg_authDomain" value="${fbValue("authDomain")}">

         <label>Firebase projectId</label>
         <input id="cfg_projectId" value="${fbValue("projectId")}">

         <label>Firebase appId</label>
         <input id="cfg_appId" value="${fbValue("appId")}">
       </div>`;

  return `
    <div class="onboard-card">
      <img class="onboard-logo" src="logo.png?v=2" alt="Hauku">
      <p class="onboard-tagline">Ryhmäpohjainen sijainninjako koirille ja ihmisille</p>

      <div class="form-block">
        ${groupField}

        <label>Nimi</label>
        <input id="cfg_name" placeholder="esim. Rekku tai Matti" value="${existing?.name || ""}">

        <label>Rooli</label>
        <div class="role-toggle">
          <label class="role-option role-option-dog">
            <input type="radio" name="cfg_role" value="dog" ${roleValue === "dog" ? "checked" : ""}>
            <span class="role-dot"></span>
            Koira
          </label>
          <label class="role-option role-option-hunter">
            <input type="radio" name="cfg_role" value="hunter" ${roleValue === "hunter" ? "checked" : ""}>
            <span class="role-dot"></span>
            Ihminen
          </label>
        </div>
        <p class="hint">Koira: sijainti ja kuljettu reitti näkyvät kartalla kaikille. Ihminen: vain nykyinen sijainti näkyy, reittiä ei tallenneta.</p>
        <p class="hint">Koira-roolissa voi lisäksi ottaa käyttöön äänenkuuntelun (haukkuhälytys) erillisellä kytkimellä kartalla - pyytää tällöin erikseen mikrofoniluvan.</p>

        <label>Karttatyyli</label>
        <div class="role-toggle">
          <label class="role-option">
            <input type="radio" name="cfg_mapStyle" value="osm" ${mapStyleValue === "osm" ? "checked" : ""}>
            <span class="role-dot"></span>
            Nopea (oletus)
          </label>
          <label class="role-option">
            <input type="radio" name="cfg_mapStyle" value="topo" ${mapStyleValue === "topo" ? "checked" : ""}>
            <span class="role-dot"></span>
            Maasto
          </label>
          <label class="role-option">
            <input type="radio" name="cfg_mapStyle" value="mml" ${mapStyleValue === "mml" ? "checked" : ""}>
            <span class="role-dot"></span>
            Maastokartta (MML)
          </label>
        </div>
        <p class="hint">
          <a href="#" id="cfg_mml_toggle">Lisäasetukset (MML-maastokartan API-avain)</a>
        </p>
        <div id="cfg_mml_advanced" class="advanced-section" style="display:none;">
          <label>Maanmittauslaitoksen API-avain</label>
          <input id="cfg_mmlApiKey" placeholder="OmaTili-palvelusta luotu API-avain" value="${mmlApiKeyValue}">
          <p class="hint">Vaaditaan vain jos "Maastokartta (MML)" on valittuna. Jos avainta ei ole annettu, tämä valinta palaa automaattisesti OpenStreetMapiin.</p>
        </div>

        <label>Automaattinen pysäytys (min)</label>
        <input id="cfg_autoStop" type="number" min="0" step="1" value="${autoStopValue}">
        <p class="hint">Lähetys pysähtyy automaattisesti tämän ajan jälkeen käynnistyksestä. 0 = ei koskaan.</p>

        ${firebaseFields}

        <button id="cfg_save" class="btn btn-primary">Tallenna ja aloita</button>
        <button id="cfg_share" class="btn btn-secondary">Kopioi jakolinkki</button>
        <button id="cfg_share_app" class="btn btn-secondary">Jaa... (esim. WhatsApp)</button>
        <p id="cfg_share_status" class="hint hint-ok"></p>
      </div>

      <p class="footnote">
        Tämä on harrasteprojekti kokeiluversiona. Pääsynhallinta perustuu
        liittymiskoodiin (jaettu salasana), ei käyttäjätileihin - älä käytä
        arkaluontoiseen tietoon.
      </p>
    </div>
  `;
}

function attachConfigFormHandlers(container, onSave) {
  container.querySelector("#cfg_save").addEventListener("click", () => {
    const role = container.querySelector('input[name="cfg_role"]:checked')?.value || "hunter";
    const mapStyle = container.querySelector('input[name="cfg_mapStyle"]:checked')?.value || "osm";
    const autoStopRaw = parseInt(container.querySelector("#cfg_autoStop").value, 10);
    const autoStopMinutes = Number.isFinite(autoStopRaw) && autoStopRaw >= 0 ? autoStopRaw : 15;
    const groupCode = container.querySelector("#cfg_group").value.trim();
    const groupName = container.querySelector("#cfg_groupName").value.trim() || groupCode;
    const cfg = {
      groupCode,
      groupName,
      name: container.querySelector("#cfg_name").value.trim() || "Tuntematon",
      role,
      mapStyle,
      mmlApiKey: container.querySelector("#cfg_mmlApiKey").value.trim(),
      autoStopMinutes,
      firebase: {
        apiKey: container.querySelector("#cfg_apiKey").value.trim(),
        authDomain: container.querySelector("#cfg_authDomain").value.trim(),
        projectId: container.querySelector("#cfg_projectId").value.trim(),
        appId: container.querySelector("#cfg_appId").value.trim(),
      }
    };
    if (!cfg.groupCode || !cfg.firebase.apiKey || !cfg.firebase.projectId) {
      alert("Ryhmän nimi, apiKey ja projectId ovat pakollisia.");
      return;
    }
    saveConfig(cfg);
    onSave(cfg);
  });

  // Kerää jakolinkin rakentamiseen tarvittavat kentät lomakkeesta. Käytetään
  // sekä "Kopioi jakolinkki"- että "Jaa..."-napin käsittelijässä, jotta
  // kenttien luku ei ole kahdessa paikassa.
  function collectShareCfg() {
    return {
      groupCode: container.querySelector("#cfg_group").value.trim(),
      groupName: container.querySelector("#cfg_groupName").value.trim(),
      firebase: {
        apiKey: container.querySelector("#cfg_apiKey").value.trim(),
        authDomain: container.querySelector("#cfg_authDomain").value.trim(),
        projectId: container.querySelector("#cfg_projectId").value.trim(),
        appId: container.querySelector("#cfg_appId").value.trim(),
      }
    };
  }

  container.querySelector("#cfg_share").addEventListener("click", () => {
    const cfg = collectShareCfg();
    if (!cfg.groupCode || !cfg.firebase.apiKey) {
      alert("Täytä ryhmän nimi ja Firebase-tiedot ennen linkin jakamista.");
      return;
    }
    const link = buildShareLink(cfg);
    const statusEl = container.querySelector("#cfg_share_status");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => {
        statusEl.textContent = "Linkki kopioitu leikepöydälle!";
      }).catch(() => { statusEl.textContent = link; });
    } else {
      statusEl.textContent = link;
    }
  });

  // "Jaa..." - avaa laitteen oman jakovalikon (Web Share API), jossa
  // WhatsApp on yleensä yksi vaihtoehto muiden joukossa. Ei vaadi
  // WhatsApp-tiliä/API-avainta eikä omaa palvelinta - käyttäjä valitsee itse
  // kanavan, sovellus ei koskaan jaa mitään automaattisesti.
  // Jos Web Share API ei ole tuettu (esim. työpöytäselain), pudotaan suoraan
  // wa.me-syväliinkkiin, koska se oli alkuperäinen käytännön tarve.
  container.querySelector("#cfg_share_app").addEventListener("click", () => {
    const cfg = collectShareCfg();
    if (!cfg.groupCode || !cfg.firebase.apiKey) {
      alert("Täytä ryhmän nimi ja Firebase-tiedot ennen linkin jakamista.");
      return;
    }
    const link = buildShareLink(cfg);
    const label = cfg.groupName || cfg.groupCode;
    const message = `Liity Hauku-ryhmään "${label}": ${link}`;

    if (navigator.share) {
      navigator.share({
        title: "Hauku - liity ryhmään",
        text: `Liity Hauku-ryhmään "${label}":`,
        url: link,
      }).catch(() => {
        // Käyttäjä perui jakamisen tai selain esti sen hiljaa - ei tehdä mitään,
        // linkki on silti "Kopioi jakolinkki" -napin takana.
      });
    } else {
      // Ei Web Share API -tukea: avataan wa.me suoraan valmiiksi täytetyllä
      // viestillä, käyttäjä valitsee vastaanottajan WhatsAppissa itse.
      window.open("https://wa.me/?text=" + encodeURIComponent(message), "_blank");
    }
  });

  // "Luo uusi ryhmä" - generoi uuden piilokoodin ja tyhjentää nimikentän,
  // ilman että koko lomaketta tarvitsee renderöidä uudelleen.
  const newGroupLink = container.querySelector("#cfg_new_group_link");
  if (newGroupLink) {
    newGroupLink.addEventListener("click", (e) => {
      e.preventDefault();
      container.querySelector("#cfg_group").value = generateGroupCode();
      const nameInput = container.querySelector("#cfg_groupName");
      nameInput.value = "";
      nameInput.placeholder = "esim. Syyshirvijahti";
      nameInput.focus();
      const hint = newGroupLink.closest("p");
      if (hint) hint.textContent = "Uusi ryhmä luodaan tallennettaessa - jaa linkki tallennuksen jälkeen kutsuaksesi muut.";
    });
  }

  // "Lisäasetukset" - näyttää/piilottaa tekniset Firebase-kentät, jotta ne
  // eivät ole oletuksena näkyvissä tavallisessa käytössä.
  const advancedToggle = container.querySelector("#cfg_advanced_toggle");
  const advancedSection = container.querySelector("#cfg_advanced");
  if (advancedToggle && advancedSection) {
    advancedToggle.addEventListener("click", (e) => {
      e.preventDefault();
      const isHidden = advancedSection.style.display === "none";
      advancedSection.style.display = isHidden ? "block" : "none";
      advancedToggle.textContent = isHidden
        ? "Piilota lisäasetukset"
        : "Lisäasetukset (Firebase-yhteys)";
    });
  }

  // Sama piilotusperiaate MML-maastokartan API-avaimelle - oma erillinen
  // kytkin, koska tämä on riippumaton Firebase-yhteydestä eikä useimmat
  // käyttäjät tarvitse sitä ollenkaan (ks. keskustelu MML-integraatiosta).
  const mmlToggle = container.querySelector("#cfg_mml_toggle");
  const mmlSection = container.querySelector("#cfg_mml_advanced");
  if (mmlToggle && mmlSection) {
    mmlToggle.addEventListener("click", (e) => {
      e.preventDefault();
      const isHidden = mmlSection.style.display === "none";
      mmlSection.style.display = isHidden ? "block" : "none";
      mmlToggle.textContent = isHidden
        ? "Piilota MML-asetukset"
        : "Lisäasetukset (MML-maastokartan API-avain)";
    });
  }
}

function showOnboarding(existing, urlCfg, onSave) {
  const el = document.getElementById("onboarding");
  el.innerHTML = renderConfigForm(existing, urlCfg);
  el.style.display = "flex";
  attachConfigFormHandlers(el, (cfg) => {
    el.style.display = "none";
    onSave(cfg);
  });
}

function showSettingsOverlay(onSave) {
  const overlay = document.createElement("div");
  overlay.id = "settingsOverlay";
  overlay.className = "overlay";
  overlay.style.display = "flex";
  overlay.innerHTML = renderConfigForm(loadConfig(), {});

  // Sulje-ikoni - mahdollistaa asetusten tarkastelun/sulkemisen ilman että
  // lomake pitää tallentaa ja startPackTracker käynnistyy uudelleen.
  const closeBtn = document.createElement("button");
  closeBtn.id = "settingsCloseBtn";
  closeBtn.className = "overlay-close";
  closeBtn.setAttribute("aria-label", "Sulje asetukset");
  closeBtn.innerHTML = "&times;";
  overlay.appendChild(closeBtn);

  document.body.appendChild(overlay);

  const closeOverlay = () => {
    if (overlay.parentNode) document.body.removeChild(overlay);
  };

  closeBtn.addEventListener("click", closeOverlay);

  // Klikkaus taustan tummalle alueelle sulkee myös - mutta ei jos klikataan
  // itse lomakekorttia (e.target === overlay tarkoittaa taustaa, ei korttia).
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay();
  });

  attachConfigFormHandlers(overlay, (cfg) => {
    closeOverlay();
    onSave(cfg);
  });
}

function addSettingsButton(onReopen) {
  const btn = document.getElementById("settingsBtn");
  if (btn) btn.addEventListener("click", onReopen);
}

// ---- Kartta + Firebase ----

let map, tileLayer, markers = {}, trails = {}, firstFix = true;
// Varaventtiili: jos oma sijainti ei ehdi ensimmäisenä (esim. GPS-lupa vielä
// kesken), sallitaan zoomaus kenen tahansa ensimmäiseen sijaintiin muutaman
// sekunnin jälkeen - ettei kartta jää jumiin oletusnäkymään. Ks.
// startListeningToGroup.
let fallbackZoomAllowed = false;
let watchId = null;

const MAP_STYLES = {
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: { attribution: "&copy; OpenStreetMap contributors" }
  },
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    options: {
      attribution: "&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap (CC-BY-SA)",
      maxZoom: 17
    }
  },
  // Maanmittauslaitoksen avoin Karttakuvapalvelu (WMTS), maastokartta-taso.
  // Ei kiinteää url-kenttää tässä, koska osoite sisältää käyttäjän oman
  // API-avaimen - rakennetaan dynaamisesti buildMmlTileUrl():lla setMapStyle:ssä.
  mml: {
    options: {
      attribution: "&copy; Maanmittauslaitos (CC BY 4.0)",
      maxZoom: 15
    }
  }
};

// MML:n avoimen WMTS-palvelun REST-osoitemalli, WGS84_Pseudo-Mercator-
// projektiossa (sama kuin Leafletin/OSM:n oletus, ei vaadi CRS-muunnosta).
// Huom: MML:n tilematriisijärjestys on TileMatrix/TileRow/TileCol eli
// z/y/x - {z}/{y}/{x}-paikkamerkit toimivat Leafletissä missä tahansa
// järjestyksessä merkkijonossa, joten tämä on riittävä eikä vaadi muuta.
function buildMmlTileUrl(apiKey) {
  return "https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/maastokartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key="
    + encodeURIComponent(apiKey);
}

function initMap(cfg) {
  if (!map) {
    map = L.map("map", { zoomControl: false }).setView([61.9241, 25.7482], 13);
    L.control.zoom({ position: "bottomleft" }).addTo(map);
    addLocateControl();
  }
  setMapStyle((cfg && cfg.mapStyle) || "osm", cfg);
}

// "Keskitä minuun" -nappi (bottomright, ei törmää zoom-kontrolliin
// bottomleftissä). Nojaa tuttuun kartta-appien konventioon (paikannuskuvake)
// sen sijaan että kartalla lukisi mitään - ks. keskustelu 24.7.2026: visuaalinen
// "tässä sinä olet" -korostus koettiin liian tökeräksi, tämä ja ensimmäisen
// zoomin kohdistaminen omaan sijaintiin (ks. startListeningToGroup) valittiin
// sen sijaan.
function addLocateControl() {
  const LocateControl = L.Control.extend({
    options: { position: "bottomright" },
    onAdd: function () {
      const container = L.DomUtil.create("div", "leaflet-bar leaflet-control locate-control");
      const link = L.DomUtil.create("a", "", container);
      link.href = "#";
      link.title = "Keskitä minuun";
      link.innerHTML = "&#9678;"; // ◎
      L.DomEvent.on(link, "click", (e) => {
        L.DomEvent.stop(e);
        centerOnSelf();
      });
      return container;
    }
  });
  new LocateControl().addTo(map);
}

function centerOnSelf() {
  const uid = currentAuth?.currentUser?.uid;
  const marker = uid && markers[uid];
  if (marker) {
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15));
  } else {
    setStatus("Omaa sijaintia ei ole vielä saatavilla");
  }
}

// ---- Karttatyylikohtaiset korostusvärit ----
// MML:n avoin maastokartta (ja etenkin sen kaupunkialueiden "taustakartta"-
// tyylinen versio, ks. kuvakaappaukset 24.7.2026) on paljon kirjavampi kuin
// OSM/OpenTopoMap: ruskeat korkeuskäyrät, keltaiset/oranssit maalajialueet
// ja kaupungeissa runsaasti punaista (tiet) ja magentaa (rakennukset).
// Sama "brändipaletti" (oranssi koira, vihreä ihminen, punainen hälytys,
// harmaa mittausviiva) hukkuu tähän kokonaan. Siksi värit sidotaan karttaan:
// jokaiselle MAP_STYLES-avaimelle oma paletti, jossa värit on valittu niin
// etteivät ne esiinny kyseisen kartan omassa väripaletissa.
const MAP_THEME = {
  osm: {
    dog: "#f97316",
    human: "#1b4332",
    trail: "#f97316",
    alertRing: "#ef4444",
    distanceLine: "#444444",
    distanceLabelBg: "rgba(255,255,255,0.85)",
    distanceLabelColor: "#444",
    iconSuffix: "",
    markerHalo: false
  },
  topo: {
    dog: "#f97316",
    human: "#1b4332",
    trail: "#f97316",
    alertRing: "#ef4444",
    distanceLine: "#444444",
    distanceLabelBg: "rgba(255,255,255,0.85)",
    distanceLabelColor: "#444",
    iconSuffix: "",
    markerHalo: false
  },
  // MML: kirkas magenta (koira/jälki/hälytys) ja kylläinen syaani (ihminen/
  // mittaus) - kumpikaan ei esiinny MML:n maastokartan tai kaupunkikartan
  // omassa väripaletissa (ruskea/keltainen/vihreä/punainen/musta). Myös
  // itse merkki-ikonit on väritetty samoihin sävyihin erillisillä
  // icon-dog-mml.png/icon-human-mml.png-tiedostoilla (alkuperäisten
  // icon-dog.png/icon-human.png sävy/korostukset säilytetty, vain
  // väri/kylläisyys vaihdettu - ks. iconSuffix). Valkoinen "halo" on silti
  // mukana ylimääräisenä varmistuksena (esim. MML:n kaupunkikartan omat
  // magentan sävyiset rakennuskorttelit).
  mml: {
    dog: "#e0159c",
    human: "#0ea5b8",
    trail: "#e0159c",
    alertRing: "#e0159c",
    distanceLine: "#0ea5b8",
    distanceLabelBg: "rgba(255,255,255,0.92)",
    distanceLabelColor: "#0b3d91",
    iconSuffix: "-mml",
    markerHalo: true
  }
};

// Efektiivinen (fallbackin jälkeinen) karttatyyli - päivitetään setMapStyle:ssä.
// Värivalinnat seuraavat AINA tätä, ei cfg.mapStyle:a suoraan, koska jos MML
// putoaa OSM:ään puuttuvan API-avaimen takia, myös värien pitää pudota OSM:n
// paletille eikä jäädä MML:n kirkkaisiin sävyihin OSM:n päällä.
let currentMapStyle = "osm";

function getMapTheme() {
  return MAP_THEME[currentMapStyle] || MAP_THEME.osm;
}

// Päivittää jo piirrettyjen tasojen (jäljet, mittausviivat/-lukemat, merkit)
// värit uuden teeman mukaisiksi - tarvitaan kun käyttäjä vaihtaa karttatyyliä
// kesken session asetuksista, ei vain ensimmäisellä kartan piirrolla.
function reapplyMapTheme() {
  const theme = getMapTheme();

  Object.keys(trails).forEach((uid) => {
    trails[uid].setStyle({ color: theme.trail });
  });

  Object.keys(activeMeasurements).forEach((key) => {
    const m = activeMeasurements[key];
    m.line.setStyle({ color: theme.distanceLine });
    const el = m.labelMarker.getElement();
    const inner = el && el.querySelector(".distance-label");
    if (inner) {
      inner.style.background = theme.distanceLabelBg;
      inner.style.color = theme.distanceLabelColor;
    }
  });

  Object.keys(markers).forEach((uid) => {
    const data = memberData[uid];
    if (!data) return;
    const isAlertActive = alertActiveFor(data);
    markers[uid].setIcon(iconFor(data.role, isAlertActive, isLowBattery(data)));
  });
}

function setMapStyle(style, cfg) {
  let effectiveStyle = style;
  let url;

  if (style === "mml") {
    const apiKey = cfg && cfg.mmlApiKey;
    if (apiKey) {
      url = buildMmlTileUrl(apiKey);
    } else {
      // Ei API-avainta asetuksissa: defaulttaa hiljaisesti OpenStreetMapiin
      // sen sijaan että kartta jäisi tyhjäksi/rikkinäiseksi. Käyttäjälle
      // näytetään lyhyt selite statusrivillä, ks. keskustelu MML-
      // integraatiosta 24.7.2026.
      effectiveStyle = "osm";
      setStatus("MML-maastokartan API-avain puuttuu asetuksista - käytetään OpenStreetMapia.");
    }
  }

  const conf = MAP_STYLES[effectiveStyle] || MAP_STYLES.osm;
  if (!url) url = conf.url;

  if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(url, conf.options).addTo(map);

  // Värit on sidottu efektiiviseen (fallbackin jälkeiseen) karttatyyliin, ei
  // pyydettyyn - ks. MAP_THEME-kommentti. Jos karttatyyliä vaihdetaan kesken
  // session (asetuksista), jo piirretyt jäljet/mittaukset/merkit väritetään
  // uudelleen heti, ei vasta seuraavan Firestore-päivityksen yhteydessä.
  const themeChanged = currentMapStyle !== effectiveStyle;
  currentMapStyle = effectiveStyle;
  if (themeChanged) reapplyMapTheme();
}

// Akkuvaroituksen kynnys - badge näkyy vain tämän alapuolella eikä silloin
// kun puhelin on laturissa (ks. keskustelu: exception-based näyttö, ei
// jatkuvaa akkulukemaa kartalla).
const LOW_BATTERY_THRESHOLD = 20;

function iconFor(role, alertActive, lowBattery) {
  const SIZE = 37; // 80% aiemmasta 46px:stä
  const theme = getMapTheme();
  // Omat brändi-ikonit (koira/ihminen) - väritetty roolin JA karttatyylin
  // mukaan (ks. MAP_THEME/iconSuffix). Perusväritykset (koira=oranssi,
  // ihminen=vihreä) OSM/Topolle, magenta/syaani-versiot MML:lle - eri
  // tiedostot samasta kuvasta, sama muoto/sävytys, vain väri vaihdettu.
  // Cache-bustataan samaan tapaan kuin muutkin kuva-assetit (logo.png?v=N).
  const src = (role === "dog" ? "icon-dog" : "icon-human") + theme.iconSuffix + ".png?v=1";
  // Valkoinen "halo" merkin taakse ylimääräisenä kontrastivarmistuksena -
  // pääasiallinen värikorjaus tulee nyt oikeasta väritetystä ikonitiedostosta
  // (ks. src yllä), mutta halo auttaa vielä esim. MML:n kaupunkikartan omia
  // magentan sävyisiä rakennuskortteleita vasten. Ei käytössä OSM/
  // OpenTopoMapilla, joissa ikonit erottuvat jo ilman sitä.
  const halo = theme.markerHalo
    ? `<div style="position:absolute;inset:3px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.45);"></div>`
    : "";
  const ring = alertActive ? `<div class="alert-ring" style="border-color:${theme.alertRing};"></div>` : "";
  const badge = alertActive
    ? `<div class="alert-badge" title="Haukkuu">🔊</div>`
    : "";
  // Akkubadge piilotetaan haukkuhälytyksen ajaksi, ettei kaksi badgea
  // kilpaile huomiosta samanaikaisesti - hälytys on aina tärkeämpi.
  const batteryBadge = (!alertActive && lowBattery)
    ? `<div class="battery-badge" title="Akku vähissä">🔋</div>`
    : "";
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:${SIZE}px;height:${SIZE}px;">
        ${ring}
        ${halo}
        <img src="${src}" alt="" style="position:relative;width:100%;height:100%;object-fit:contain;
                    filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6));">
        ${badge}
        ${batteryBadge}
      </div>`,
    iconSize: [SIZE, SIZE],
    iconAnchor: [SIZE / 2, SIZE / 2]
  });
}

function isLowBattery(data) {
  return typeof data.battery === "number" && data.battery <= LOW_BATTERY_THRESHOLD && !data.charging;
}

// Sama hälytyksen aktiivisuuslogiikka kuin startListeningToGroup:ssa (aikaleimapohjainen,
// ei erillistä kuittausta - ks. hauku-haukkuhalytys-valmistusohje.md kohta 3).
// Omaksi funktioksi eriytetty, jotta reapplyMapTheme voi laskea saman tuloksen
// karttatyylin vaihtuessa ilman että logiikkaa on kahdessa paikassa.
function alertActiveFor(data) {
  const alertAtMs = data.alertAt && data.alertAt.toMillis ? data.alertAt.toMillis() : null;
  return !!alertAtMs && (Date.now() - alertAtMs < ALERT_DURATION_MS);
}

let currentDb = null, currentAuth = null, currentCfg = null;
let isSending = false;
let autoStopTimerId = null;

// Akkutaso luetaan Battery Status API:sta (navigator.getBattery) jos selain
// tukee sitä - käytännössä Chrome/Samsung Internet Androidilla, ei Safari/iOS.
// Ei kirjoiteta Firestoreen omana erillisenä kirjoituksenaan, vaan sisällytetään
// samaan memberRef.set()-kutsuun kuin sijainti (startSendingLocation), koska
// Firestore-säännöt vaativat lat/lng/updatedAt-kentät jokaisessa kirjoituksessa
// (ks. whitepaper kohta 9) - erillinen pelkkä akkukirjoitus hylättäisiin.
// batteryManager-oliota luetaan synkronisesti jokaisen GPS-kirjoituksen
// yhteydessä, joten arvo pysyy ajan tasalla ilman erillisiä event-kuuntelijoita.
let batteryManager = null;

function initBatteryManager() {
  if (!navigator.getBattery) return; // ei tuettu (esim. iOS/Safari) - ei kriittistä
  navigator.getBattery().then((battery) => {
    batteryManager = battery;
  }).catch(() => {
    // Ei kriittistä - popup vain ei näytä akkuriviä tällä laitteella.
  });
}

function currentBatteryFields() {
  if (!batteryManager) return {};
  return {
    battery: Math.round(batteryManager.level * 100),
    charging: !!batteryManager.charging
  };
}

const PAUSE_KEY = "hauku_paused_v1";

function isManuallyPaused() {
  return localStorage.getItem(PAUSE_KEY) === "true";
}

function setManuallyPaused(paused) {
  localStorage.setItem(PAUSE_KEY, paused ? "true" : "false");
}

function setStatus(text) {
  const el = document.getElementById("statusText");
  if (el) el.textContent = text;
}

function setPauseButtonLabel(sending) {
  const btn = document.getElementById("pauseBtn");
  if (btn) btn.textContent = sending ? "Pysäytä" : "Jatka";
}

function togglePauseResume() {
  if (isSending) {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (autoStopTimerId !== null) { clearTimeout(autoStopTimerId); autoStopTimerId = null; }
    watchId = null;
    isSending = false;
    setManuallyPaused(true);
    setStatus("Lähetys pysäytetty");
    setPauseButtonLabel(false);
  } else {
    if (!currentDb || !currentAuth || !currentCfg) {
      setStatus("Odota hetki, yhteys ei ole vielä valmis...");
      return;
    }
    setManuallyPaused(false);
    startSendingLocation(currentDb, currentAuth, currentCfg);
    setPauseButtonLabel(true);
  }
}

function addPauseButton() {
  const btn = document.getElementById("pauseBtn");
  if (btn) btn.addEventListener("click", togglePauseResume);
}

function setTopbar(role, groupName) {
  const dot = document.getElementById("headerRoleDot");
  const text = document.getElementById("headerGroupText");
  if (dot) dot.style.background = role === "dog" ? "#f97316" : "#1b4332";
  if (text) text.textContent = groupName || "";
}

function startPackTracker(cfg) {
  document.getElementById("app").style.display = "flex";
  initMap(cfg);
  setTopbar(cfg.role, cfg.groupName || cfg.groupCode);

  // Haukkuhälytyksen kytkin näkyy vain koiramoodissa (oma erillinen kytkin,
  // ei automaattisesti päällä pelkän roolin perusteella).
  const listenBtn = document.getElementById("listenBtn");
  if (listenBtn) listenBtn.style.display = cfg.role === "dog" ? "inline-block" : "none";
  if (cfg.role !== "dog" && isListening) stopSoundDetection();

  firebase.initializeApp(cfg.firebase);
  const auth = firebase.auth();
  const db = firebase.firestore();

  currentAuth = auth;
  currentDb = db;
  currentCfg = cfg;

  setStatus("Kirjaudutaan sisään...");

  initBatteryManager();

  auth.signInAnonymously().then(() => {
    setStatus("Yhdistetty ryhmään: " + cfg.groupCode);
    startListeningToGroup(db, cfg);

    if (isManuallyPaused()) {
      isSending = false;
      setStatus("Lähetys pysäytetty");
      setPauseButtonLabel(false);
    } else {
      startSendingLocation(db, auth, cfg);
      setPauseButtonLabel(true);
    }

    // Jatketaan äänenkuuntelua automaattisesti jos se oli päällä ennen
    // sivun uudelleenlatausta (sama periaate kuin hauku_paused_v1:lla).
    if (cfg.role === "dog" && isListeningEnabled()) {
      startSoundDetection(db, cfg);
    }
  }).catch(err => {
    setStatus("Kirjautumisvirhe: " + err.message);
  });
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // maapallon säde metreinä
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function startSendingLocation(db, auth, cfg) {
  if (!("geolocation" in navigator)) {
    setStatus("Selain ei tue sijaintia.");
    return;
  }
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (autoStopTimerId !== null) { clearTimeout(autoStopTimerId); autoStopTimerId = null; }
  isSending = true;

  const autoStopMinutes = cfg.autoStopMinutes ?? 15;
  if (autoStopMinutes > 0) {
    autoStopTimerId = setTimeout(() => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      isSending = false;
      autoStopTimerId = null;
      setManuallyPaused(true);
      setStatus("Lähetys pysäytetty automaattisesti (" + autoStopMinutes + " min)");
      setPauseButtonLabel(false);
    }, autoStopMinutes * 60 * 1000);
  }

  const MIN_INTERVAL_MS = 10000; // päivitä Firestoreen korkeintaan kerran 10 sekunnissa
  let lastWriteTime = 0;
  let lastGoodFix = null; // { lat, lng, time } - viimeisin hyväksytty sijainti hyppysuodatinta varten
  let consecutiveRejects = 0;
  let consecutiveAccuracyRejects = 0;

  // Jos laskettu nopeus edelliseen hyväksyttyyn pisteeseen on tätä suurempi, pistettä pidetään
  // GPS-häiriönä ("teleporttauksena") ja se hylätään. 55 m/s ≈ 200 km/h - sallii myös autokyydin,
  // mutta suodattaa selvät GPS-virhepiikit.
  const MAX_PLAUSIBLE_SPEED_MPS = 55;
  const MAX_CONSECUTIVE_REJECTS = 3; // useampi samankaltainen "hyppy" peräkkäin = oikeasti liikuttu

  watchId = navigator.geolocation.watchPosition((pos) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const now = Date.now();
    if (now - lastWriteTime < MIN_INTERVAL_MS) return; // liian aikaisin, ohitetaan
    lastWriteTime = now;

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;

    // GPS-tarkkuussuodatin: hylätään epätarkat lukemat (esim. solutorni-/WiFi-
    // paikannus puiden katveessa) ennen nopeuslaskentaa - ks. MAX_ACCURACY_METERS.
    if (typeof accuracy === "number" && accuracy > MAX_ACCURACY_METERS) {
      if (consecutiveAccuracyRejects < MAX_CONSECUTIVE_ACCURACY_REJECTS) {
        consecutiveAccuracyRejects++;
        setStatus("Ohitettu epätarkka sijainti (tarkkuus ~" + Math.round(accuracy) + " m)");
        return;
      }
      // Varaventtiili lauennut - hyväksytään pakolla, ettei lähetys jää jumiin
      // jos signaali on aidosti pysyvästi huono.
    }
    consecutiveAccuracyRejects = 0;

    if (lastGoodFix) {
      const distance = haversineMeters(lastGoodFix.lat, lastGoodFix.lng, lat, lng);
      const elapsedSec = (now - lastGoodFix.time) / 1000;
      const speed = elapsedSec > 0 ? distance / elapsedSec : 0;

      // Pieni etäisyys ohitetaan aina suodattimesta (GPS-huojunta paikallaan ollessa
      // voi muuten laskea keinotekoisen suuren nopeuden hyvin lyhyellä aikavälillä).
      const looksLikeError = distance > 50 && speed > MAX_PLAUSIBLE_SPEED_MPS;

      if (looksLikeError && consecutiveRejects < MAX_CONSECUTIVE_REJECTS) {
        consecutiveRejects++;
        setStatus("Ohitettu epärealistinen GPS-hyppy (" + Math.round(speed * 3.6) + " km/h)");
        return;
      }
    }
    consecutiveRejects = 0;
    lastGoodFix = { lat, lng, time: now };

    const memberRef = db.collection("groups").doc(cfg.groupCode)
      .collection("members").doc(uid);

    // expiresAt: Firestoren TTL-käytäntö poistaa dokumentin automaattisesti tämän ajan jälkeen.
    // 24h riittää yhdelle metsästyspäivälle - kasvata tarvittaessa (esim. useamman päivän reissu).
    const expiresAt = firebase.firestore.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

    memberRef.set({
      lat, lng,
      accuracy: pos.coords.accuracy,
      role: cfg.role,
      name: cfg.name,
      updatedAt: firebase.firestore.Timestamp.now(),
      expiresAt,
      ...currentBatteryFields()
    }, { merge: true });

    // Jälki (track) tallennetaan vain koiramoodissa - metsästäjän reittiä ei ole tarpeen seurata.
    // accuracy tallennetaan myös tänne, jotta näyttöpuolen tarkkuussuodatin (filterImplausibleJumps)
    // voi hylätä epätarkat pisteet jo tallennetusta jäljestä, ei vain uusia kirjoitettaessa.
    if (cfg.role === "dog") {
      memberRef.collection("track").add({
        lat, lng,
        accuracy,
        timestamp: firebase.firestore.Timestamp.now(),
        expiresAt
      });
    }

    setStatus("Lähetetään sijaintia... (" + new Date().toLocaleTimeString() + ")");
  }, (err) => {
    setStatus("Sijaintivirhe: " + err.message);
  }, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 20000
  });
}

function filterImplausibleJumps(points) {
  // points: [{lat, lng, timeMs, accuracy}, ...] aikajärjestyksessä.
  // Palauttaa TAULUKON SEGMENTTEJÄ (array of point-array), ei enää yhtä
  // yhtenäistä pistelistaa - ks. MAX_GAP_MS-vakion selitys yllä. Kutsuvan
  // koodin (trails[uid].setLatLngs) pitää käyttää Leafletin multi-polyline-
  // muotoa, jotta segmenttien väliin ei piirry viivaa.
  //
  // Kaksi erillistä, riippumatonta syytä katkaista/hylätä piste:
  // 1) GPS-tarkkuus liian huono (MAX_ACCURACY_METERS) - piste ohitetaan
  //    kokonaan, ei aloiteta uutta segmenttiä (odotetaan parempaa pistettä).
  // 2) Aikaväli edelliseen hyväksyttyyn pisteeseen ylittää MAX_GAP_MS -
  //    pistettä EI hylätä, mutta se aloittaa UUDEN segmentin sen sijaan
  //    että yhdistyisi viivalla edelliseen (emme tiedä reittiä pitkin
  //    siirtymä tapahtui). Tämä on eri tarkistus kuin nopeussuodatin, ja
  //    ajetaan AINA ennen nopeuslaskentaa, koska nopeuslaskenta itsessään
  //    ei ole luotettava enää tarpeeksi pitkän aikavälin jälkeen.
  const MAX_SPEED_MPS = 55; // ~200 km/h
  const segments = [[]];
  let last = null;
  let consecutiveAccuracyRejects = 0;

  for (const p of points) {
    if (typeof p.accuracy === "number" && p.accuracy > MAX_ACCURACY_METERS) {
      if (consecutiveAccuracyRejects < MAX_CONSECUTIVE_ACCURACY_REJECTS) {
        consecutiveAccuracyRejects++;
        continue; // ohitetaan epätarkka piste, ei päivitetä 'last':ia
      }
      // Varaventtiili lauennut - hyväksytään pakolla jäljen jatkumiseksi.
    }
    consecutiveAccuracyRejects = 0;

    if (!last) {
      segments[segments.length - 1].push(p);
      last = p;
      continue;
    }

    const gapMs = p.timeMs - last.timeMs;
    if (gapMs > MAX_GAP_MS) {
      // Liian pitkä tauko - ei yhdistetä viivalla, aloitetaan uusi segmentti.
      segments.push([p]);
      last = p;
      continue;
    }

    const distance = haversineMeters(last.lat, last.lng, p.lat, p.lng);
    const elapsedSec = gapMs / 1000;
    const speed = elapsedSec > 0 ? distance / elapsedSec : 0;

    if (distance > 50 && speed > MAX_SPEED_MPS) {
      continue; // ohitetaan epäuskottava hyppy, ei päivitetä 'last':ia
    }
    segments[segments.length - 1].push(p);
    last = p;
  }
  return segments.filter(seg => seg.length > 0);
}

let alertTimers = {};    // uid -> timeoutId (visuaalisen renkaan sammutus)
let lastAlertSeen = {};  // uid -> alertAt (ms) - viimeksi reagoitu hälytysaikaleima
let memberData = {};     // uid -> viimeisin Firestore-data, popupin ja vanhentumislaskennan pohjaksi

// pairKey(uidA,uidB) -> { a, b, line: L.Polyline, labelMarker: L.Marker } -
// käynnissä olevat etäisyysmittaukset. Alun perin vain "minusta jäseneen",
// yleistetty tukemaan mielivaltaista kahden jäsenen väliä (ks.
// hauku-etaisyysmittaus-valmistusohje.md, vaihe 2). Puhtaasti näyttöpuolen
// tila - ei Firestore-kirjoitusta, hyödyntää jo olemassa olevaa markers-dataa.
let activeMeasurements = {};

// Kun tämä on asetettu jäsenen uid:ksi, ollaan "Mittaa toiseen jäseneen"
// -valinnan kesken: seuraava toisen jäsenen popupista painettu "Valitse tämä
// pisteeksi" -nappi täydentää parin. Vain yksi valinta voi olla kesken
// kerrallaan koko sovelluksessa - yksinkertaisin malli, riittää tähän
// käyttötarkoitukseen.
let pendingMeasureFrom = null;

// Kynnys, jonka jälkeen merkki himmennetään merkiksi vanhentuneesta datasta
// (esim. koira taustalla / ruutu sammunut, ks. whitepaper kohta 14.1). Ei
// tekstiä pysyvään tooltippiin - pelkkä visuaalinen himmennys riittää
// viestimään "tämä ei ole enää tuoretta" ilman jatkuvaa piperrystä kartalla.
const STALE_AFTER_MS = 3 * 60 * 1000; // 3 min
const STALE_OPACITY = 0.55;

function formatAge(timestamp) {
  if (!timestamp || !timestamp.toMillis) return "ei tiedossa";
  const ms = Date.now() - timestamp.toMillis();
  if (ms < 60 * 1000) return Math.max(0, Math.round(ms / 1000)) + " s sitten";
  if (ms < 60 * 60 * 1000) return Math.round(ms / (60 * 1000)) + " min sitten";
  return Math.round(ms / (60 * 60 * 1000)) + " h sitten";
}

// Päivittää yhden merkin opasiteetin sen datan tuoreuden perusteella. Kutsutaan
// sekä datan saapuessa että säännöllisesti ajastimella (ks. alempana), koska
// vanhentuminen tapahtuu ajan kulumisen myötä, ei vain uuden datan myötä.
function updateMarkerFreshness(uid) {
  const marker = markers[uid];
  const data = memberData[uid];
  if (!marker || !data || !data.updatedAt || !data.updatedAt.toMillis) return;
  const age = Date.now() - data.updatedAt.toMillis();
  marker.setOpacity(age > STALE_AFTER_MS ? STALE_OPACITY : 1);
}

// Popupin sisältö rakennetaan funktiona (Leaflet kutsuu tämän joka kerta kun
// popup avataan), jotta "X sitten" -teksti on aina tuore eikä vaadi erillistä
// päivityslogiikkaa taustalla pyörimään koko ajan.
function buildPopupHtml(uid) {
  const data = memberData[uid];
  if (!data) return "";
  const name = data.name || "Tuntematon";
  const roleLabel = data.role === "dog" ? "koira" : "ihminen";
  const accuracyText = typeof data.accuracy === "number"
    ? "~" + Math.round(data.accuracy) + " m"
    : "ei tiedossa";

  let html = `<div class="popup-info"><strong>${name} (${roleLabel})</strong><br>` +
    `Päivitetty: ${formatAge(data.updatedAt)}<br>` +
    `Tarkkuus: ${accuracyText}`;

  // Akkurivi näkyy vain jos tieto on saatavilla (esim. iOS/Safari ei tue
  // Battery Status API:a - silloin rivi jää kokonaan pois, ei tyhjää kenttää).
  if (typeof data.battery === "number") {
    html += `<br>Akku: ${data.battery} %` + (data.charging ? " (laturissa)" : "");
  }

  html += `</div>`;

  // Popupin toimintorivi (ks. hauku-etaisyysmittaus-valmistusohje.md).
  // Yksi yhtenäinen mittaustoiminto: valitaan kaksi jäsentä (oma sijainti
  // kelpaa yhdeksi niistä), ei erillistä "Etäisyys minuun" -pikanäppäintä -
  // se aiheutti kaksi päällekkäistä "Lopeta mittaus" -nappia samaan popupiin
  // kun sama jäsenpari oli mitattu myös yleisen valinnan kautta (korjattu).
  const actionButtons = [];

  // Kahden mielivaltaisen jäsenen välinen mittaus (vaihe 2, ks.
  // hauku-etaisyysmittaus-valmistusohje.md) - näkyy kaikilla jäsenillä,
  // myös omalla merkillä, koska tässä ei mitata etäisyyttä itseensä vaan
  // valitaan molemmat päätepisteet erikseen kahdessa vaiheessa.
  let pairLabel, pairClass;
  if (pendingMeasureFrom === uid) {
    pairLabel = "Peruuta valinta";
    pairClass = "popup-btn popup-btn-active";
  } else if (pendingMeasureFrom === null) {
    // Jos tällä jäsenellä on jo aktiivinen mittaus toiseen jäseneen, näytetään
    // suoraan "Lopeta mittaus" - ei pakoteta käyttäjää muistamaan kumman
    // jäsenen kanssa mittaus on käynnissä ja toistamaan koko valintaa.
    const existingPair = findPairInvolving(uid);
    if (existingPair) {
      pairLabel = "Lopeta mittaus";
      pairClass = "popup-btn popup-btn-active";
    } else {
      pairLabel = "Mittaa toiseen jäseneen";
      pairClass = "popup-btn";
    }
  } else {
    pairLabel = "Valitse tämä pisteeksi";
    pairClass = "popup-btn popup-btn-active";
  }
  actionButtons.push(`<button type="button" class="${pairClass}" data-action="pair">${pairLabel}</button>`);

  if (actionButtons.length > 0) {
    html += `<div class="popup-actions">${actionButtons.join("")}</div>`;
  }

  return html;
}

let freshnessIntervalId = null;

// Merkkien himmennys pitää päivittyä myös ilman uutta Firestore-dataa (esim.
// koira on kuuluvuuskuolleella alueella eikä kirjoita mitään pitkään aikaan) -
// siksi tarkistus ajetaan säännöllisesti eikä vain onSnapshot-tapahtumissa.
function startFreshnessTicker() {
  if (freshnessIntervalId !== null) return;
  freshnessIntervalId = setInterval(() => {
    Object.keys(markers).forEach(updateMarkerFreshness);
  }, 30 * 1000);
}

function startListeningToGroup(db, cfg) {
  startFreshnessTicker();

  // Jos oma sijainti ei ole vielä saapunut 4 sekunnin kuluttua (esim.
  // GPS-lupadialogi vielä kesken), sallitaan zoomaus kenen tahansa
  // ensimmäiseen sijaintiin - ks. fallbackZoomAllowed-kommentti yllä.
  setTimeout(() => { fallbackZoomAllowed = true; }, 4000);

  db.collection("groups").doc(cfg.groupCode).collection("members")
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const uid = change.doc.id;
        const data = change.doc.data();
        if (!data.lat || !data.lng) return;

        memberData[uid] = data;

        const latlng = [data.lat, data.lng];
        const name = data.name || "Tuntematon";

        if (change.type === "removed") {
          if (markers[uid]) { map.removeLayer(markers[uid]); delete markers[uid]; }
          if (alertTimers[uid]) { clearTimeout(alertTimers[uid]); delete alertTimers[uid]; }
          delete lastAlertSeen[uid];
          delete memberData[uid];
          // Jäsen poistui - mahdolliset kesken olleet mittaukset (kumpaankin
          // suuntaan) pitää siivota, ettei kartalle jää "orpoa" viivaa
          // osoittamaan tyhjää. Jos jäsen oli juuri pending-valinnan
          // ensimmäinen piste, myös se pitää nollata.
          stopAllMeasurementsInvolving(uid);
          if (pendingMeasureFrom === uid) pendingMeasureFrom = null;
          return;
        }

        // Hälytyksen aktiivisuus lasketaan aikaleimasta paikallisesti (ei erillistä
        // kuittausta) - ks. hauku-haukkuhalytys-valmistusohje.md kohta 3.
        const alertAtMs = data.alertAt && data.alertAt.toMillis ? data.alertAt.toMillis() : null;
        const now = Date.now();
        const isAlertActive = alertActiveFor(data);
        const lowBattery = isLowBattery(data);

        // Tooltip kertoo hälytyksen sanallisesti ("haukkuu!") - rengas/badge ei jää
        // arvailun varaan siitä mitä se tarkoittaa.
        const tooltipText = isAlertActive ? `${name} 🐕 haukkuu!` : name;

        if (markers[uid]) {
          markers[uid].setLatLng(latlng).setTooltipContent(tooltipText);
          markers[uid].setIcon(iconFor(data.role, isAlertActive, lowBattery));
        } else {
          markers[uid] = L.marker(latlng, { icon: iconFor(data.role, isAlertActive, lowBattery) })
            .addTo(map)
            .bindPopup(() => buildPopupHtml(uid))
            .bindTooltip(tooltipText, {
              permanent: true,
              direction: "top",
              offset: [0, -22],
              className: "marker-label"
            })
            // Popupin sisältö rakennetaan funktiona (buildPopupHtml), joten
            // toimintorivin nappi pitää sitoa aina kun popup avataan uudelleen -
            // sama käsittelijä pysyy voimassa koko merkin elinkaaren ajan.
            .on("popupopen", (e) => {
              const el = e.popup.getElement();
              const pairBtn = el && el.querySelector('.popup-btn[data-action="pair"]');
              if (pairBtn) pairBtn.addEventListener("click", () => handlePairMeasureClick(uid));
            });
        }

        updateMarkerFreshness(uid);

        // Uusi hälytys (aikaleima ei ole sama kuin viimeksi käsitelty) - soitetaan
        // äänimerkki (ei omalle laitteelle) ja ajastetaan visuaalisen renkaan/tooltipin
        // palautus ennalleen.
        if (alertAtMs && isAlertActive && lastAlertSeen[uid] !== alertAtMs) {
          lastAlertSeen[uid] = alertAtMs;
          const isSelf = currentAuth?.currentUser?.uid === uid;
          if (!isSelf) playAlertBeep();

          if (alertTimers[uid]) clearTimeout(alertTimers[uid]);
          const remaining = ALERT_DURATION_MS - (now - alertAtMs);
          alertTimers[uid] = setTimeout(() => {
            if (markers[uid]) {
              markers[uid].setIcon(iconFor(data.role, false, isLowBattery(memberData[uid] || data)));
              markers[uid].setTooltipContent(name);
            }
          }, Math.max(remaining, 0));
        }

        // Ensimmäinen zoom kohdistetaan omaan sijaintiin (ei kenen tahansa
        // ensimmäiseen) - ks. keskustelu 24.7.2026. fallbackZoomAllowed
        // varmistaa ettei kartta jää jumiin jos oma sijainti viipyy.
        const isSelfFix = currentAuth?.currentUser?.uid === uid;
        if (firstFix && (isSelfFix || fallbackZoomAllowed)) {
          map.setView(latlng, 15);
          firstFix = false;
        }
      });

      // Mikä tahansa sijaintipäivitys (oma tai kohde) voi vaikuttaa käynnissä
      // oleviin mittauksiin - päivitetään kaikki kerralla erän lopuksi, ei
      // jokaisen yksittäisen docChange-tapahtuman kohdalla erikseen.
      updateAllActiveMeasurements();
    }, err => setStatus("Virhe kuunnellessa ryhmää: " + err.message));

  db.collection("groups").doc(cfg.groupCode).collection("members")
    .onSnapshot((snapshot) => {
      snapshot.docs.forEach((doc) => {
        const uid = doc.id;
        if (trails[uid]) return;
        if (doc.data().role !== "dog") return; // vain koiran jälki piirretään

        trails[uid] = L.polyline([], { color: getMapTheme().trail, weight: 3 }).addTo(map);

        db.collection("groups").doc(cfg.groupCode).collection("members").doc(uid)
          .collection("track").orderBy("timestamp").limitToLast(500)
          .onSnapshot((trackSnap) => {
            const rawPoints = trackSnap.docs.map(d => ({
              lat: d.data().lat,
              lng: d.data().lng,
              accuracy: d.data().accuracy,
              timeMs: d.data().timestamp?.toMillis ? d.data().timestamp.toMillis() : 0
            }));
            // filterImplausibleJumps palauttaa nyt segmenttien taulukon
            // (ks. MAX_GAP_MS) - Leafletin multi-polyline-muoto piirtää
            // jokaisen segmentin erillisenä viivana ilman että segmenttien
            // väliin (pitkän tauon yli) piirtyy yhdistävää viivaa.
            const segments = filterImplausibleJumps(rawPoints);
            trails[uid].setLatLngs(segments.map(seg => seg.map(p => [p.lat, p.lng])));
          });
      });
    });
}

// ---- Etäisyysmittaus omasta sijainnista jäseneen ----
// Ks. hauku-etaisyysmittaus-valmistusohje.md. Puhtaasti näyttöpuolen
// ominaisuus - ei Firestore-kirjoitusta/-lukua, hyödyntää dataa joka on jo
// muutenkin saatavilla (oma ja kohdejäsenen sijainti, molemmat markers-
// oliossa Firestoren onSnapshot-synkronoituna).

function formatDistance(meters) {
  if (meters >= 1000) return (meters / 1000).toFixed(1).replace(".", ",") + " km";
  return Math.round(meters) + " m";
}

function midpoint(latlng1, latlng2) {
  return [(latlng1.lat + latlng2.lat) / 2, (latlng1.lng + latlng2.lng) / 2];
}

function pairKey(uidA, uidB) {
  return [uidA, uidB].sort().join("__");
}

function isMeasuringPair(uidA, uidB) {
  if (!uidA || !uidB || uidA === uidB) return false;
  return !!activeMeasurements[pairKey(uidA, uidB)];
}

// Etsii jäsenen uid mahdollisen aktiivisen mittauksen (kumpaan tahansa
// toiseen jäseneen, oma sijainti mukaan lukien - ei enää erillistä
// poikkeusta, koska erillinen "Etäisyys minuun" -pikanäppäin poistettiin).
// Palauttaa mittausolion tai null. Yksi jäsen voi olla mukana vain yhdessä
// mittauksessa kerrallaan (ks. handlePairMeasureClick), joten haku voi
// pysähtyä ensimmäiseen osumaan.
function findPairInvolving(uid) {
  for (const key in activeMeasurements) {
    const m = activeMeasurements[key];
    if (m.a === uid || m.b === uid) return m;
  }
  return null;
}

// Viiva: katkoviiva, lähes läpinäkyvä, neutraali väri (ei koira/ihminen-
// brändiväri, ettei sekoitu rooliväritykseen) - antaa visuaalisen
// kontekstin sille mitä lukema tarkoittaa, ks. valmistusohjeen kohta 4.
// Yleinen kahden mielivaltaisen jäsenen välinen mittaus - "Etäisyys minuun"
// on tämän erikoistapaus jossa toinen päätepiste on aina oma sijainti.
function startMeasurementBetween(uidA, uidB) {
  if (!uidA || !uidB || uidA === uidB) return;
  if (!markers[uidA] || !markers[uidB]) return;
  const key = pairKey(uidA, uidB);
  if (activeMeasurements[key]) return;

  const line = L.polyline(
    [markers[uidA].getLatLng(), markers[uidB].getLatLng()],
    { color: getMapTheme().distanceLine, weight: 2, opacity: 0.35, dashArray: "6,8" }
  ).addTo(map);

  const theme = getMapTheme();
  const labelMarker = L.marker(
    midpoint(markers[uidA].getLatLng(), markers[uidB].getLatLng()),
    {
      icon: L.divIcon({
        className: "",
        html: `<div style="display:flex;justify-content:center;width:100%;"><span class="distance-label" style="background:${theme.distanceLabelBg};color:${theme.distanceLabelColor};"></span></div>`,
        iconSize: [60, 20],
        iconAnchor: [30, 10]
      }),
      interactive: false
    }
  ).addTo(map);

  activeMeasurements[key] = { a: uidA, b: uidB, line, labelMarker };
  updateMeasurementByKey(key);
}

// Kutsutaan aina kun jonkun jäsenen sijainti päivittyy - ks.
// startListeningToGroup. Näin viiva ja lukema pysyvät ajan tasalla ilman
// erillistä ajastinta. Toimii kummankin päätepisteen suhteen, ei vain omaan
// sijaintiin sidottuna.
function updateMeasurementByKey(key) {
  const m = activeMeasurements[key];
  if (!m) return;
  if (!markers[m.a] || !markers[m.b]) {
    stopMeasurementByKey(key);
    return;
  }
  const aLatLng = markers[m.a].getLatLng();
  const bLatLng = markers[m.b].getLatLng();
  m.line.setLatLngs([aLatLng, bLatLng]);
  m.labelMarker.setLatLng(midpoint(aLatLng, bLatLng));

  const meters = haversineMeters(aLatLng.lat, aLatLng.lng, bLatLng.lat, bLatLng.lng);
  const el = m.labelMarker.getElement();
  const inner = el && el.querySelector(".distance-label");
  if (inner) inner.textContent = formatDistance(meters);
}

function updateAllActiveMeasurements() {
  Object.keys(activeMeasurements).forEach(updateMeasurementByKey);
}

function stopMeasurementByKey(key) {
  const m = activeMeasurements[key];
  if (!m) return;
  map.removeLayer(m.line);
  map.removeLayer(m.labelMarker);
  delete activeMeasurements[key];
}

function stopMeasurementBetween(uidA, uidB) {
  stopMeasurementByKey(pairKey(uidA, uidB));
}

// Kaikki jäseneen uid liittyvät mittaukset (kumpikin päätepiste voi olla
// tämä jäsen) - käytetään kun jäsen poistuu ryhmästä, ettei kartalle jää
// "orpoja" viivoja osoittamaan tyhjää.
function stopAllMeasurementsInvolving(uid) {
  Object.keys(activeMeasurements).forEach((key) => {
    const m = activeMeasurements[key];
    if (m.a === uid || m.b === uid) stopMeasurementByKey(key);
  });
}

function reopenPopupIfOpen(uid) {
  const marker = markers[uid];
  if (marker && marker.isPopupOpen()) {
    marker.closePopup().openPopup();
  }
}

// "Etäisyys minuun" -nappi: pikakutsu yleiseen pari-mittaukseen, jossa
// toinen päätepiste on aina oma sijainti.
// (Aiempi "Etäisyys minuun" -pikanäppäinfunktio poistettu - ks. huomio
// buildPopupHtml:ssa. Oma sijainti mitataan nyt samalla yleisellä
// kahden jäsenen valinnalla kuin mikä tahansa muukin pari.)

// Kahden mielivaltaisen jäsenen välinen mittaus (vaihe 2, ks.
// hauku-etaisyysmittaus-valmistusohje.md). Valinta tehdään kahdessa
// vaiheessa popupin kautta: ensin painetaan "Mittaa toiseen jäseneen"
// jommankumman jäsenen popupista (asettaa pending-tilan), sitten toisen
// jäsenen popupista "Valitse tämä pisteeksi" (täydentää parin). Sama nappi
// toimii myös perumiseen (jos painetaan uudelleen kesken valinnan) ja
// olemassa olevan mittauksen lopettamiseen (jos pari on jo mitattu).
// Huom: ei käytetä setStatus():ia tässä - se kirjoittaisi GPS-lähetyksen
// tilarivin päälle. Napin oma teksti ("Peruuta valinta" / "Valitse tämä
// pisteeksi") riittää kertomaan tilan.
function handlePairMeasureClick(uid) {
  if (pendingMeasureFrom === uid) {
    pendingMeasureFrom = null;
  } else if (pendingMeasureFrom === null) {
    // Jos jäsenellä on jo aktiivinen mittaus (napin teksti oli "Lopeta
    // mittaus"), sammutetaan se suoraan sen sijaan että aloitettaisiin uusi
    // valinta - ks. findPairInvolving ja buildPopupHtml.
    const existingPair = findPairInvolving(uid);
    if (existingPair) {
      stopMeasurementBetween(existingPair.a, existingPair.b);
    } else {
      pendingMeasureFrom = uid;
    }
  } else {
    const fromUid = pendingMeasureFrom;
    pendingMeasureFrom = null;
    if (isMeasuringPair(fromUid, uid)) {
      stopMeasurementBetween(fromUid, uid);
    } else {
      startMeasurementBetween(fromUid, uid);
    }
    reopenPopupIfOpen(fromUid);
  }
  reopenPopupIfOpen(uid);
}

// ---- Haukkuhälytys ----
// Vaihe 1: äänenvoimakkuustunnistus (RMS), laukaisee tarkistuksen.
// Vaihe 2 (v47): YAMNet binäärisenä vahvistuksena RMS-laukaisulle - vahvistaa
// vain onko ääni ylipäätään koiran ääntä, EI luokittele äänityyppiä UI:hin.
// Ks. hauku-haukkuhalytys-valmistusohje.md kohta 7 - tunnetilan/hätätilan
// erottelu testattiin ja hylättiin (arousal/valenssi-ongelma), joten YAMNet
// toimii tässä puhtaana väärien positiivien suodattimena, ei luokittelijana.

const LISTEN_KEY = "hauku_listening_v1";
const ALERT_DURATION_MS = 60 * 1000; // hälytys näkyy tämän ajan viimeisimmästä laukeamisesta
const ALERT_WRITE_MIN_INTERVAL_MS = 10 * 1000; // ei kirjoiteta Firestoreen useammin kuin tämän välein
const SOUND_VOLUME_THRESHOLD = 0.35; // 0..1, kiinteä kynnysarvo (päätös: ei asetuksissa säädettävä)

// Vaihe 2 (YAMNet) -vakiot. Kynnysarvo ja indeksit validoitu barkdetection-
// proto.html-työkalulla kenttätestissä 24.7.2026, ks. valmistusohjeen kohta 7.
const YAMNET_MODEL_URL = "https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1";
const YAMNET_SAMPLE_RATE = 16000;
const YAMNET_WINDOW_SAMPLES = 16000; // ~1s ikkuna
const YAMNET_DOG_CLASS_INDICES = [70, 71, 72, 73, 74, 75]; // Bark, Yip, Howl, Bow-wow, Growling, Whimper
const YAMNET_CONFIRM_THRESHOLD = 0.10; // kiinteä, ei asetuksissa säädettävä (sama periaate kuin SOUND_VOLUME_THRESHOLD)

let audioContext = null, analyserNode = null, micStream = null, detectionRafId = null;
let isListening = false;
let lastAlertWriteTime = 0;

// Vaihe 2: erillinen ScriptProcessor rakentaa rinnakkaisen 16kHz liukuvan
// puskurin YAMNet-vahvistusta varten. Ei vaikuta olemassa olevaan RMS-
// laukaisuun (analyserNode) mitenkään - täysin rinnakkainen putki.
let yamnetProcessorNode = null, yamnetSilentGain = null;
let yamnetRollingBuffer = [];
let yamnetModel = null;
let yamnetLoadPromise = null;
let yamnetConfirmInProgress = false;

// Vaihe 1: palauttaa true/false äänenvoimakkuuden (RMS) perusteella.
// Vaihe 2 (myöhemmin): sama signatuuri, mutta ML-luokittelu sisällä.
function detectSound(analyser) {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const normalized = (data[i] - 128) / 128;
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / data.length);
  return rms > SOUND_VOLUME_THRESHOLD;
}

function isListeningEnabled() {
  return localStorage.getItem(LISTEN_KEY) === "true";
}

// Lineaarinen interpolointi-alinäytteistys laitteen natiivista taajuudesta
// 16kHz:iin YAMNetiä varten. Sama periaate kuin barkdetection-proto.html:ssä
// validoitu - ei alipäästösuodatusta, mutta riittää tähän tarkoitukseen.
function downsampleTo16k(buffer, inRate) {
  if (inRate === YAMNET_SAMPLE_RATE) return buffer;
  const ratio = inRate / YAMNET_SAMPLE_RATE;
  const newLen = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const pos = i * ratio;
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, buffer.length - 1);
    const frac = pos - lo;
    result[i] = buffer[lo] * (1 - frac) + buffer[hi] * frac;
  }
  return result;
}

// Lataa YAMNet-mallin taustalla vain kerran (myös useampi samanaikainen
// kutsu odottaa samaa promisea). Kutsutaan heti kun kuuntelu käynnistetään,
// ei vasta ensimmäisen RMS-laukaisun yhteydessä (ks. valmistusohje kohta 4/7).
function ensureYamnetLoaded() {
  if (yamnetModel) return Promise.resolve(yamnetModel);
  if (yamnetLoadPromise) return yamnetLoadPromise;
  if (typeof tf === "undefined") {
    return Promise.reject(new Error("TensorFlow.js ei ole ladattu (tarkista index.html-skriptit)"));
  }
  yamnetLoadPromise = tf.loadGraphModel(YAMNET_MODEL_URL, { fromTFHub: true })
    .then((model) => { yamnetModel = model; return model; })
    .catch((err) => { yamnetLoadPromise = null; throw err; });
  return yamnetLoadPromise;
}

// Vaihe 2: YAMNet binäärisenä vahvistuksena RMS-laukaisulle. Palauttaa vain
// true/false - EI äänityyppiä (ks. valmistusohje päätös 6.7: tunnetilan
// erottelu testattu ja hylätty, joten luokkatietoa ei koskaan viedä UI:hin
// eikä Firestoreen).
//
// Tietoinen turvallisuuspäätös: jos malli ei ole vielä latautunut, puskuri
// on liian lyhyt, tai inferenssi epäonnistuu (esim. verkkokatko metsässä),
// funktio palauttaa TRUE (hälytys sallitaan siitä huolimatta) - vaihe 1:n
// RMS-hälytys ei koskaan saa jäädä tulematta YAMNet-vian takia. Parempi
// ylimääräinen väärä hälytys kuin puuttuva oikea.
async function confirmDogSound() {
  if (yamnetRollingBuffer.length < YAMNET_WINDOW_SAMPLES) return true;
  try {
    const model = await ensureYamnetLoaded();
    const windowArr = new Float32Array(yamnetRollingBuffer.slice(-YAMNET_WINDOW_SAMPLES));
    let maxDogScore = 0;
    tf.tidy(() => {
      const waveform = tf.tensor1d(windowArr, "float32");
      const output = model.predict(waveform); // [scores, embeddings, spectrogram]
      const scores = Array.isArray(output) ? output[0] : output;
      const meanScores = scores.mean(0); // keskiarvo kehysten yli -> [521]
      const data = Array.from(meanScores.dataSync());
      maxDogScore = Math.max(...YAMNET_DOG_CLASS_INDICES.map((idx) => data[idx] || 0));
    });
    return maxDogScore >= YAMNET_CONFIRM_THRESHOLD;
  } catch (err) {
    console.error("YAMNet-vahvistus epäonnistui, hälytys sallitaan silti (fail-open):", err);
    return true;
  }
}

function setListeningEnabled(enabled) {
  localStorage.setItem(LISTEN_KEY, enabled ? "true" : "false");
}

function setListenButtonLabel(listening) {
  const btn = document.getElementById("listenBtn");
  if (btn) btn.textContent = listening ? "Pysäytä kuuntelu" : "Kuuntele ääntä";
}

// Lyhyt synteettinen piippaussarja - ei vaadi erillistä äänitiedostoa.
function playAlertBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.2, t);
      osc.start(t);
      osc.stop(t + 0.15);
      t += 0.23;
    }
  } catch (e) {
    // Selain ei tue tai AudioContext estetty (esim. ei käyttäjän gesturea) - ei kriittistä.
  }
}

function writeAlert(db, cfg) {
  const uid = currentAuth?.currentUser?.uid;
  if (!uid) return;
  db.collection("groups").doc(cfg.groupCode).collection("members").doc(uid)
    .set({ alertAt: firebase.firestore.Timestamp.now() }, { merge: true });
}

function startSoundDetection(db, cfg) {
  if (isListening) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("Selain ei tue mikrofonia.");
    return;
  }

  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    micStream = stream;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    source.connect(analyserNode);

    // Vaihe 2: rinnakkainen putki joka kerää 16kHz liukuvan puskurin YAMNet-
    // vahvistusta varten. ScriptProcessorNode on deprecated mutta yksinkertaisin
    // laajasti tuettu ratkaisu - ei kuulu kaiuttimeen (gain=0), ei vaikuta RMS-
    // laukaisuun (analyserNode) mitenkään.
    yamnetProcessorNode = audioContext.createScriptProcessor(4096, 1, 1);
    yamnetSilentGain = audioContext.createGain();
    yamnetSilentGain.gain.value = 0;
    const nativeRate = audioContext.sampleRate;
    yamnetProcessorNode.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const resampled = downsampleTo16k(input, nativeRate);
      for (let i = 0; i < resampled.length; i++) yamnetRollingBuffer.push(resampled[i]);
      const maxKeep = Math.round(YAMNET_WINDOW_SAMPLES * 1.5);
      if (yamnetRollingBuffer.length > maxKeep) {
        yamnetRollingBuffer.splice(0, yamnetRollingBuffer.length - maxKeep);
      }
    };
    source.connect(yamnetProcessorNode);
    yamnetProcessorNode.connect(yamnetSilentGain);
    yamnetSilentGain.connect(audioContext.destination);

    // Käynnistä mallin lataus taustalla heti, ei vasta ensimmäisen laukaisun
    // yhteydessä (päätös, ks. valmistusohje kohta 4/7) - jos lataus epäonnistuu
    // (esim. ei verkkoa metsässä), confirmDogSound() epäonnistuu myöhemmin
    // hallitusti ja sallii hälytyksen silti (fail-open).
    ensureYamnetLoaded().catch((err) => {
      console.error("YAMNetin ennakkolataus epäonnistui (jatketaan silti, fail-open):", err);
    });

    isListening = true;
    setListeningEnabled(true);
    setListenButtonLabel(true);

    const loop = () => {
      if (!isListening) return;
      if (detectSound(analyserNode)) {
        const now = Date.now();
        if (now - lastAlertWriteTime > ALERT_WRITE_MIN_INTERVAL_MS && !yamnetConfirmInProgress) {
          // Asetetaan heti, jottei toistuva RMS-laukaisu (esim. jatkuva tuuli)
          // käynnistä useita päällekkäisiä/toistuvia YAMNet-tarkistuksia.
          lastAlertWriteTime = now;
          yamnetConfirmInProgress = true;
          confirmDogSound().then((confirmed) => {
            yamnetConfirmInProgress = false;
            if (confirmed) {
              writeAlert(db, cfg);
            }
            // else: YAMNet arvioi RMS-laukaisun vääräksi positiiviksi (esim.
            // tuuli/kohina) - ei kirjoiteta, ei muuta UI:ta.
          });
        }
      }
      detectionRafId = requestAnimationFrame(loop);
    };
    loop();
  }).catch((err) => {
    setStatus("Mikrofonilupa evätty tai virhe: " + err.message);
  });
}

function stopSoundDetection() {
  isListening = false;
  setListeningEnabled(false);
  if (detectionRafId !== null) cancelAnimationFrame(detectionRafId);
  detectionRafId = null;
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  if (yamnetProcessorNode) { yamnetProcessorNode.disconnect(); yamnetProcessorNode.onaudioprocess = null; yamnetProcessorNode = null; }
  if (yamnetSilentGain) { yamnetSilentGain.disconnect(); yamnetSilentGain = null; }
  yamnetRollingBuffer = [];
  yamnetConfirmInProgress = false;
  if (audioContext) { audioContext.close(); audioContext = null; }
  analyserNode = null;
  setListenButtonLabel(false);
}

function toggleListening() {
  if (isListening) {
    stopSoundDetection();
  } else {
    if (!currentDb || !currentCfg) {
      setStatus("Odota hetki, yhteys ei ole vielä valmis...");
      return;
    }
    startSoundDetection(currentDb, currentCfg);
  }
}

function addListenButton() {
  const btn = document.getElementById("listenBtn");
  if (btn) btn.addEventListener("click", toggleListening);
}

// ---- Käynnistys ----

// Näytetään ylärivillä, jotta näet onko selaimessa uusin versio.
// Kasvata tätä JA index.html:n shared.js?v=N -numeroa aina kun tiedostoa muutetaan.
const APP_VERSION = "v51";

// Jos laitteella on jo tallennettu ryhmä JA avattu linkki osoittaa eri ryhmään,
// kysytään käyttäjältä kumpaa käytetään sen sijaan että linkki hiljaa ohitetaan
// (aiempi käytös) tai ylikirjoitetaan automaattisesti ilman kysymystä.
// Palauttaa configin josta jatketaan (joko alkuperäinen tai linkiltä vaihdettu).
function resolveGroupConflict(existing, urlCfg) {
  if (!existing || !existing.groupCode || !urlCfg.groupCode) return existing;
  if (urlCfg.groupCode === existing.groupCode) return existing;

  const currentLabel = existing.groupName || existing.groupCode;
  const linkLabel = urlCfg.groupName || urlCfg.groupCode;

  const switchToLink = confirm(
    `Tällä laitteella on jo käytössä ryhmä "${currentLabel}".\n\n` +
    `Avattu linkki vie ryhmään "${linkLabel}".\n\n` +
    `Vaihdetaanko ryhmään "${linkLabel}"?\n` +
    `(Peruuta = jatketaan ryhmässä "${currentLabel}")`
  );

  if (!switchToLink) return existing;

  // Vaihdetaan ryhmä - ryhmäkoodi, -nimi, Firebase-konfiguraatio ja mahdollinen
  // linkiltä tuleva rooli otetaan käyttöön. Oma nimi ja muut henkilökohtaiset
  // asetukset (karttatyyli, automaattipysäytys) säilytetään ennallaan.
  return {
    ...existing,
    groupCode: urlCfg.groupCode,
    groupName: urlCfg.groupName || urlCfg.groupCode,
    firebase: urlCfg.firebase || existing.firebase,
    role: urlCfg.role || existing.role
  };
}

function boot() {
  const versionEl = document.getElementById("appVersion");
  if (versionEl) versionEl.textContent = APP_VERSION;

  const urlCfg = getUrlConfig();
  const existing = resolveGroupConflict(loadConfig(), urlCfg);

  const merged = existing ? { ...existing } : {};
  if (!merged.firebase && urlCfg.firebase) merged.firebase = urlCfg.firebase;
  if (!merged.groupCode && urlCfg.groupCode) merged.groupCode = urlCfg.groupCode;
  if (!merged.groupName && urlCfg.groupName) merged.groupName = urlCfg.groupName;
  if (!merged.role && urlCfg.role) merged.role = urlCfg.role;
  if (!merged.mapStyle) merged.mapStyle = urlCfg.mapStyle || "osm";
  if (!merged.mmlApiKey && urlCfg.mmlApiKey) merged.mmlApiKey = urlCfg.mmlApiKey;
  if (merged.autoStopMinutes === undefined) merged.autoStopMinutes = urlCfg.autoStopMinutes ?? 15;

  const hasFirebase = merged.firebase && merged.firebase.apiKey && merged.firebase.projectId;
  const hasGroup = !!merged.groupCode;
  const hasName = !!merged.name;
  const hasRole = !!merged.role;

  addSettingsButton(() => {
    showSettingsOverlay((cfg) => startPackTracker(cfg));
  });
  addPauseButton();
  addListenButton();

  if (hasFirebase && hasGroup && hasName && hasRole) {
    saveConfig(merged);
    startPackTracker(merged);
  } else {
    showOnboarding(merged, urlCfg, (cfg) => startPackTracker(cfg));
  }
}

window.addEventListener("DOMContentLoaded", boot);
