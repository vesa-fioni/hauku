// shared.js
// Yksi sovellus: aloitusnäkymä kysyy ryhmäkoodin, nimen ja roolin (koira/metsästäjä).
// Rooli on käyttäjän asetus (cfg.role), ei enää erillinen sivu.

const CONFIG_KEY = "hauku_config_v1";

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
    : `<label>Firebase apiKey</label>
       <input id="cfg_apiKey" value="${fbValue("apiKey")}">

       <label>Firebase authDomain</label>
       <input id="cfg_authDomain" value="${fbValue("authDomain")}">

       <label>Firebase projectId</label>
       <input id="cfg_projectId" value="${fbValue("projectId")}">

       <label>Firebase appId</label>
       <input id="cfg_appId" value="${fbValue("appId")}">`;

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

  container.querySelector("#cfg_share").addEventListener("click", () => {
    const cfg = {
      groupCode: container.querySelector("#cfg_group").value.trim(),
      groupName: container.querySelector("#cfg_groupName").value.trim(),
      firebase: {
        apiKey: container.querySelector("#cfg_apiKey").value.trim(),
        authDomain: container.querySelector("#cfg_authDomain").value.trim(),
        projectId: container.querySelector("#cfg_projectId").value.trim(),
        appId: container.querySelector("#cfg_appId").value.trim(),
      }
    };
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
  }
  setMapStyle(style || "osm");
}

function setMapStyle(style) {
  const conf = MAP_STYLES[style] || MAP_STYLES.osm;
  if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(conf.url, conf.options).addTo(map);
}

function iconFor(role, alertActive) {
  const SIZE = 46;
  const color = role === "dog" ? "#f97316" : "#1b4332";
  const emoji = role === "dog" ? "🐕" : "🧍";
  const ring = alertActive ? `<div class="alert-ring"></div>` : "";
  const badge = alertActive
    ? `<div class="alert-badge" title="Haukkuu">🔊</div>`
    : "";
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:${SIZE}px;height:${SIZE}px;">
        ${ring}
        <div style="background:${color};width:${SIZE}px;height:${SIZE}px;border-radius:50%;
                    border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5);
                    display:flex;align-items:center;justify-content:center;
                    font-size:26px;line-height:1;">${emoji}</div>
        ${badge}
      </div>`,
    iconSize: [SIZE, SIZE],
    iconAnchor: [SIZE / 2, SIZE / 2]
  });
}

let currentDb = null, currentAuth = null, currentCfg = null;
let isSending = false;
let autoStopTimerId = null;

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
      expiresAt
    }, { merge: true });

    // Jälki (track) tallennetaan vain koiramoodissa - metsästäjän reittiä ei ole tarpeen seurata
    if (cfg.role === "dog") {
      memberRef.collection("track").add({
        lat, lng,
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
  // points: [{lat, lng, timeMs}, ...] aikajärjestyksessä.
  // Sama logiikka kuin kirjoitusvaiheessa: hylätään pisteet joihin siirtyminen
  // edellisestä hyväksytystä pisteestä vaatisi epärealistisen nopeuden.
  const MAX_SPEED_MPS = 55; // ~200 km/h
  const filtered = [];
  let last = null;

  for (const p of points) {
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

function startListeningToGroup(db, cfg) {
  db.collection("groups").doc(cfg.groupCode).collection("members")
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const uid = change.doc.id;
        const data = change.doc.data();
        if (!data.lat || !data.lng) return;

        const latlng = [data.lat, data.lng];
        const name = data.name || "Tuntematon";
        const label = `${name} (${data.role === "dog" ? "koira" : "ihminen"})`;

        if (change.type === "removed") {
          if (markers[uid]) { map.removeLayer(markers[uid]); delete markers[uid]; }
          if (alertTimers[uid]) { clearTimeout(alertTimers[uid]); delete alertTimers[uid]; }
          delete lastAlertSeen[uid];
          return;
        }

        // Hälytyksen aktiivisuus lasketaan aikaleimasta paikallisesti (ei erillistä
        // kuittausta) - ks. hauku-haukkuhalytys-valmistusohje.md kohta 3.
        const alertAtMs = data.alertAt && data.alertAt.toMillis ? data.alertAt.toMillis() : null;
        const now = Date.now();
        const isAlertActive = !!alertAtMs && (now - alertAtMs < ALERT_DURATION_MS);

        // Tooltip kertoo hälytyksen sanallisesti ("haukkuu!") - rengas/badge ei jää
        // arvailun varaan siitä mitä se tarkoittaa.
        const tooltipText = isAlertActive ? `${name} 🐕 haukkuu!` : name;

        if (markers[uid]) {
          markers[uid].setLatLng(latlng).setPopupContent(label).setTooltipContent(tooltipText);
          markers[uid].setIcon(iconFor(data.role, isAlertActive));
        } else {
          markers[uid] = L.marker(latlng, { icon: iconFor(data.role, isAlertActive) })
            .addTo(map)
            .bindPopup(label)
            .bindTooltip(tooltipText, {
              permanent: true,
              direction: "top",
              offset: [0, -28],
              className: "marker-label"
            });
        }

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
              markers[uid].setIcon(iconFor(data.role, false));
              markers[uid].setTooltipContent(name);
            }
          }, Math.max(remaining, 0));
        }

        if (firstFix) { map.setView(latlng, 15); firstFix = false; }
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
const APP_VERSION = "v31";

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
