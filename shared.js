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

// Lukee Firebase-avaimet, ryhmäkoodin ja (valinnaisesti) roolin URL-parametreista.
// Esim. index.html?group=HIRVI24&apiKey=...&authDomain=...&projectId=...&appId=...&role=dog
function getUrlConfig() {
  const p = new URLSearchParams(window.location.search);
  const result = {};

  const group = p.get("group");
  if (group) result.groupCode = group;

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

function buildShareLink(cfg) {
  const url = new URL(window.location.origin + window.location.pathname);
  if (cfg.groupCode) url.searchParams.set("group", cfg.groupCode);
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

  const groupFromUrl = !!urlCfg.groupCode;
  const firebaseFromUrl = !!urlCfg.firebase;

  const groupValue = existing?.groupCode || urlCfg.groupCode || "";
  const fbValue = (key) => existing?.firebase?.[key] || urlCfg.firebase?.[key] || "";
  const roleValue = existing?.role || urlCfg.role || "hunter";
  const mapStyleValue = existing?.mapStyle || urlCfg.mapStyle || "osm";

  const groupField = groupFromUrl
    ? `<p class="hint">Ryhmä: <strong>${groupValue}</strong> (linkistä)</p>
       <input type="hidden" id="cfg_group" value="${groupValue}">`
    : `<label>Ryhmäkoodi</label>
       <input id="cfg_group" placeholder="esim. HIRVI24" value="${groupValue}">`;

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
      <p class="onboard-tagline">Ryhmäpohjainen sijainninjako koiralle ja metsästäjille</p>

      <div class="form-block">
        ${groupField}

        <label>Nimi</label>
        <input id="cfg_name" placeholder="esim. Rekku tai Matti" value="${existing?.name || ""}">

        <label>Rooli</label>
        <div class="role-toggle">
          <label class="role-option">
            <input type="radio" name="cfg_role" value="dog" ${roleValue === "dog" ? "checked" : ""}>
            Koira
          </label>
          <label class="role-option">
            <input type="radio" name="cfg_role" value="hunter" ${roleValue === "hunter" ? "checked" : ""}>
            Metsästäjä
          </label>
        </div>

        <label>Karttatyyli</label>
        <div class="role-toggle">
          <label class="role-option">
            <input type="radio" name="cfg_mapStyle" value="osm" ${mapStyleValue !== "topo" ? "checked" : ""}>
            Nopea (oletus)
          </label>
          <label class="role-option">
            <input type="radio" name="cfg_mapStyle" value="topo" ${mapStyleValue === "topo" ? "checked" : ""}>
            Maasto
          </label>
        </div>

        ${firebaseFields}

        <button id="cfg_save" class="btn btn-primary">Tallenna ja aloita</button>
        <button id="cfg_share" class="btn btn-secondary">Kopioi jakolinkki</button>
        <p id="cfg_share_status" class="hint hint-ok"></p>
      </div>

      <p class="footnote">
        Tämä on harrasteprojekti kokeiluversiona. Pääsynhallinta perustuu
        ryhmäkoodiin (jaettu salasana), ei käyttäjätileihin - älä käytä
        arkaluontoiseen tietoon.
      </p>
    </div>
  `;
}

function attachConfigFormHandlers(container, onSave) {
  container.querySelector("#cfg_save").addEventListener("click", () => {
    const role = container.querySelector('input[name="cfg_role"]:checked')?.value || "hunter";
    const mapStyle = container.querySelector('input[name="cfg_mapStyle"]:checked')?.value || "osm";
    const cfg = {
      groupCode: container.querySelector("#cfg_group").value.trim(),
      name: container.querySelector("#cfg_name").value.trim() || "Tuntematon",
      role,
      mapStyle,
      firebase: {
        apiKey: container.querySelector("#cfg_apiKey").value.trim(),
        authDomain: container.querySelector("#cfg_authDomain").value.trim(),
        projectId: container.querySelector("#cfg_projectId").value.trim(),
        appId: container.querySelector("#cfg_appId").value.trim(),
      }
    };
    if (!cfg.groupCode || !cfg.firebase.apiKey || !cfg.firebase.projectId) {
      alert("Ryhmäkoodi, apiKey ja projectId ovat pakollisia.");
      return;
    }
    saveConfig(cfg);
    onSave(cfg);
  });

  container.querySelector("#cfg_share").addEventListener("click", () => {
    const cfg = {
      groupCode: container.querySelector("#cfg_group").value.trim(),
      firebase: {
        apiKey: container.querySelector("#cfg_apiKey").value.trim(),
        authDomain: container.querySelector("#cfg_authDomain").value.trim(),
        projectId: container.querySelector("#cfg_projectId").value.trim(),
        appId: container.querySelector("#cfg_appId").value.trim(),
      }
    };
    if (!cfg.groupCode || !cfg.firebase.apiKey) {
      alert("Täytä ryhmäkoodi ja Firebase-tiedot ennen linkin jakamista.");
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
  document.body.appendChild(overlay);
  attachConfigFormHandlers(overlay, (cfg) => {
    document.body.removeChild(overlay);
    onSave(cfg);
  });
}

function addSettingsButton(onReopen) {
  const btn = document.createElement("button");
  btn.id = "settingsBtn";
  btn.textContent = "Asetukset";
  btn.addEventListener("click", onReopen);
  document.body.appendChild(btn);
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
    map = L.map("map").setView([61.9241, 25.7482], 13);
  }
  setMapStyle(style || "osm");
}

function setMapStyle(style) {
  const conf = MAP_STYLES[style] || MAP_STYLES.osm;
  if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(conf.url, conf.options).addTo(map);
}

function iconFor(role) {
  const color = role === "dog" ? "#f97316" : "#1b4332";
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>`,
    iconSize: [16, 16]
  });
}

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

function setTopbar(role) {
  const el = document.getElementById("topbar");
  if (!el) return;
  el.textContent = role === "dog" ? "Koiramoodi" : "Metsästäjämoodi";
  el.className = role === "dog" ? "topbar topbar-dog" : "topbar topbar-hunter";
}

function startPackTracker(cfg) {
  document.getElementById("app").style.display = "block";
  initMap(cfg.mapStyle);
  setTopbar(cfg.role);

  firebase.initializeApp(cfg.firebase);
  const auth = firebase.auth();
  const db = firebase.firestore();

  setStatus("Kirjaudutaan sisään...");

  auth.signInAnonymously().then(() => {
    setStatus("Yhdistetty ryhmään: " + cfg.groupCode);
    startSendingLocation(db, auth, cfg);
    startListeningToGroup(db, cfg);
  }).catch(err => {
    setStatus("Kirjautumisvirhe: " + err.message);
  });
}

function startSendingLocation(db, auth, cfg) {
  if (!("geolocation" in navigator)) {
    setStatus("Selain ei tue sijaintia.");
    return;
  }
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);

  watchId = navigator.geolocation.watchPosition((pos) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    const memberRef = db.collection("groups").doc(cfg.groupCode)
      .collection("members").doc(uid);

    memberRef.set({
      lat, lng,
      accuracy: pos.coords.accuracy,
      role: cfg.role,
      name: cfg.name,
      updatedAt: firebase.firestore.Timestamp.now()
    }, { merge: true });

    // Jälki (track) tallennetaan vain koiramoodissa - metsästäjän reittiä ei ole tarpeen seurata
    if (cfg.role === "dog") {
      memberRef.collection("track").add({
        lat, lng,
        timestamp: firebase.firestore.Timestamp.now()
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

function startListeningToGroup(db, cfg) {
  db.collection("groups").doc(cfg.groupCode).collection("members")
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const uid = change.doc.id;
        const data = change.doc.data();
        if (!data.lat || !data.lng) return;

        const latlng = [data.lat, data.lng];
        const name = data.name || "Tuntematon";
        const label = `${name} (${data.role === "dog" ? "koira" : "metsästäjä"})`;

        if (change.type === "removed") {
          if (markers[uid]) { map.removeLayer(markers[uid]); delete markers[uid]; }
          return;
        }

        if (markers[uid]) {
          markers[uid].setLatLng(latlng).setPopupContent(label).setTooltipContent(name);
        } else {
          markers[uid] = L.marker(latlng, { icon: iconFor(data.role) })
            .addTo(map)
            .bindPopup(label)
            .bindTooltip(name, {
              permanent: true,
              direction: "top",
              offset: [0, -10],
              className: "marker-label"
            });
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
            trails[uid].setLatLngs(trackSnap.docs.map(d => [d.data().lat, d.data().lng]));
          });
      });
    });
}

// ---- Käynnistys ----

function boot() {
  const urlCfg = getUrlConfig();
  const existing = loadConfig();

  const merged = existing ? { ...existing } : {};
  if (!merged.firebase && urlCfg.firebase) merged.firebase = urlCfg.firebase;
  if (!merged.groupCode && urlCfg.groupCode) merged.groupCode = urlCfg.groupCode;
  if (!merged.role && urlCfg.role) merged.role = urlCfg.role;
  if (!merged.mapStyle) merged.mapStyle = urlCfg.mapStyle || "osm";

  const hasFirebase = merged.firebase && merged.firebase.apiKey && merged.firebase.projectId;
  const hasGroup = !!merged.groupCode;
  const hasName = !!merged.name;
  const hasRole = !!merged.role;

  addSettingsButton(() => {
    showSettingsOverlay((cfg) => startPackTracker(cfg));
  });

  if (hasFirebase && hasGroup && hasName && hasRole) {
    saveConfig(merged);
    startPackTracker(merged);
  } else {
    showOnboarding(merged, urlCfg, (cfg) => startPackTracker(cfg));
  }
}

window.addEventListener("DOMContentLoaded", boot);
