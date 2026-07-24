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
  if (mapStyle === "osm" || mapStyle === "topo") result.mapStyle = mapStyle;

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
            <input type="radio" name="cfg_mapStyle" value="osm" ${mapStyleValue !== "topo" ? "checked" : ""}>
            <span class="role-dot"></span>
            Nopea (oletus)
          </label>
          <label class="role-option">
            <input type="radio" name="cfg_mapStyle" value="topo" ${mapStyleValue === "topo" ? "checked" : ""}>
            <span class="role-dot"></span>
            Maasto
          </label>
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
  }
};

function initMap(style) {
  if (!map) {
    map = L.map("map", { zoomControl: false }).setView([61.9241, 25.7482], 13);
    L.control.zoom({ position: "bottomleft" }).addTo(map);
    addLocateControl();
  }
  setMapStyle(style || "osm");
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

function setMapStyle(style) {
  const conf = MAP_STYLES[style] || MAP_STYLES.osm;
  if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(conf.url, conf.options).addTo(map);
}

// Akkuvaroituksen kynnys - badge näkyy vain tämän alapuolella eikä silloin
// kun puhelin on laturissa (ks. keskustelu: exception-based näyttö, ei
// jatkuvaa akkulukemaa kartalla).
const LOW_BATTERY_THRESHOLD = 20;

function iconFor(role, alertActive, lowBattery) {
  const SIZE = 37; // 80% aiemmasta 46px:stä
  // Omat brändi-ikonit (koira/ihminen) - väritetty roolin mukaisesti
  // (koira=oranssi, ihminen=vihreä, ks. whitepaper kohta 12).
  // Cache-bustataan samaan tapaan kuin muutkin kuva-assetit (logo.png?v=N).
  const src = role === "dog" ? "icon-dog.png?v=1" : "icon-human.png?v=1";
  const ring = alertActive ? `<div class="alert-ring"></div>` : "";
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
        <img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain;
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
  initMap(cfg.mapStyle);
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
  // Sama logiikka kuin kirjoitusvaiheessa: hylätään pisteet joihin siirtyminen
  // edellisestä hyväksytystä pisteestä vaatisi epärealistisen nopeuden, sekä
  // pisteet joiden GPS-tarkkuus on liian huono (ks. MAX_ACCURACY_METERS).
  const MAX_SPEED_MPS = 55; // ~200 km/h
  const filtered = [];
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
      filtered.push(p);
      last = p;
      continue;
    }
    const distance = haversineMeters(last.lat, last.lng, p.lat, p.lng);
    const elapsedSec = (p.timeMs - last.timeMs) / 1000;
    const speed = elapsedSec > 0 ? distance / elapsedSec : 0;

    if (distance > 50 && speed > MAX_SPEED_MPS) {
      continue; // ohitetaan epäuskottava hyppy, ei päivitetä 'last':ia
    }
    filtered.push(p);
    last = p;
  }
  return filtered;
}

let alertTimers = {};    // uid -> timeoutId (visuaalisen renkaan sammutus)
let lastAlertSeen = {};  // uid -> alertAt (ms) - viimeksi reagoitu hälytysaikaleima
let memberData = {};     // uid -> viimeisin Firestore-data, popupin ja vanhentumislaskennan pohjaksi

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
          return;
        }

        // Hälytyksen aktiivisuus lasketaan aikaleimasta paikallisesti (ei erillistä
        // kuittausta) - ks. hauku-haukkuhalytys-valmistusohje.md kohta 3.
        const alertAtMs = data.alertAt && data.alertAt.toMillis ? data.alertAt.toMillis() : null;
        const now = Date.now();
        const isAlertActive = !!alertAtMs && (now - alertAtMs < ALERT_DURATION_MS);
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
    }, err => setStatus("Virhe kuunnellessa ryhmää: " + err.message));

  db.collection("groups").doc(cfg.groupCode).collection("members")
    .onSnapshot((snapshot) => {
      snapshot.docs.forEach((doc) => {
        const uid = doc.id;
        if (trails[uid]) return;
        if (doc.data().role !== "dog") return; // vain koiran jälki piirretään

        trails[uid] = L.polyline([], { color: "#f97316", weight: 3 }).addTo(map);

        db.collection("groups").doc(cfg.groupCode).collection("members").doc(uid)
          .collection("track").orderBy("timestamp").limitToLast(500)
          .onSnapshot((trackSnap) => {
            const rawPoints = trackSnap.docs.map(d => ({
              lat: d.data().lat,
              lng: d.data().lng,
              accuracy: d.data().accuracy,
              timeMs: d.data().timestamp?.toMillis ? d.data().timestamp.toMillis() : 0
            }));
            const cleaned = filterImplausibleJumps(rawPoints);
            trails[uid].setLatLngs(cleaned.map(p => [p.lat, p.lng]));
          });
      });
    });
}

// ---- Haukkuhälytys (vaihe 1: äänenvoimakkuustunnistus) ----
// Ks. hauku-haukkuhalytys-valmistusohje.md - pluggable detectSound-rajapinta,
// jotta vaihe 2 (ML-luokittelu) voidaan liittää myöhemmin korvaamalla vain
// tämä yksi funktio muun koodin pysyessä koskemattomana.

const LISTEN_KEY = "hauku_listening_v1";
const ALERT_DURATION_MS = 60 * 1000; // hälytys näkyy tämän ajan viimeisimmästä laukeamisesta
const ALERT_WRITE_MIN_INTERVAL_MS = 10 * 1000; // ei kirjoiteta Firestoreen useammin kuin tämän välein
const SOUND_VOLUME_THRESHOLD = 0.35; // 0..1, kiinteä kynnysarvo (päätös: ei asetuksissa säädettävä)

let audioContext = null, analyserNode = null, micStream = null, detectionRafId = null;
let isListening = false;
let lastAlertWriteTime = 0;

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

    isListening = true;
    setListeningEnabled(true);
    setListenButtonLabel(true);

    const loop = () => {
      if (!isListening) return;
      if (detectSound(analyserNode)) {
        const now = Date.now();
        if (now - lastAlertWriteTime > ALERT_WRITE_MIN_INTERVAL_MS) {
          lastAlertWriteTime = now;
          writeAlert(db, cfg);
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
const APP_VERSION = "v38";

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
