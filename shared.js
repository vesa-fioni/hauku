// shared.js
// Yhteinen logiikka koira- ja metsästäjäsivulle.
// Sivu joka lataa tämän asettaa ensin globaalin muuttujan: window.PACK_ROLE = "dog" | "hunter"

const CONFIG_KEY = "packtracker_config_v1";

// ---- 1. Config-lomake (Firebase-avaimet + ryhmäkoodi + nimi) ----

function loadConfig() {
  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

// Lukee Firebase-avaimet ja ryhmäkoodin URL-parametreista, jos ne on annettu
// esim. dog.html?group=HIRVI24&apiKey=...&authDomain=...&projectId=...&appId=...
// Näin jaettu linkki voi sisältää kaiken paitsi käyttäjän oman nimen.
function getUrlConfig() {
  const p = new URLSearchParams(window.location.search);
  const result = {};

  const group = p.get("group");
  if (group) result.groupCode = group;

  const fb = {};
  ["apiKey", "authDomain", "projectId", "appId"].forEach((key) => {
    const val = p.get(key);
    if (val) fb[key] = val;
  });
  if (Object.keys(fb).length > 0) result.firebase = fb;

  return result;
}

function buildShareLink(cfg) {
  const url = new URL(window.location.href);
  url.search = ""; // siivoa vanhat parametrit
  if (cfg.groupCode) url.searchParams.set("group", cfg.groupCode);
  if (cfg.firebase) {
    Object.entries(cfg.firebase).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }
  return url.toString();
}

function showConfigForm(existing, onSave, urlCfg) {
  urlCfg = urlCfg || {};

  const groupFromUrl = !!urlCfg.groupCode;
  const firebaseFromUrl = !!urlCfg.firebase;

  const groupValue = existing?.groupCode || urlCfg.groupCode || "";
  const fbValue = (key) => existing?.firebase?.[key] || urlCfg.firebase?.[key] || "";

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;" +
    "display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;";

  const box = document.createElement("div");
  box.style.cssText = "background:white;padding:20px;border-radius:10px;max-width:420px;width:100%;font-family:sans-serif;";

  // Ryhmäkoodi-kenttä: jos se tuli linkistä, näytetään lukittuna tietona eikä muokattavana
  const groupField = groupFromUrl
    ? `<p style="font-size:13px;margin-bottom:8px;">Ryhmä: <strong>${groupValue}</strong> (linkistä)</p>
       <input type="hidden" id="cfg_group" value="${groupValue}">`
    : `<label style="font-size:12px;">Ryhmäkoodi</label>
       <input id="cfg_group" style="width:100%;margin-bottom:8px;padding:6px;" value="${groupValue}">`;

  // Firebase-kentät: jos ne tulivat linkistä, piilotetaan kokonaan lomakkeesta
  const firebaseFields = firebaseFromUrl
    ? `<p style="font-size:12px;color:#2563eb;margin-bottom:8px;">Firebase-yhteys jo asetettu linkin kautta ✓</p>
       <input type="hidden" id="cfg_apiKey" value="${fbValue("apiKey")}">
       <input type="hidden" id="cfg_authDomain" value="${fbValue("authDomain")}">
       <input type="hidden" id="cfg_projectId" value="${fbValue("projectId")}">
       <input type="hidden" id="cfg_appId" value="${fbValue("appId")}">`
    : `<label style="font-size:12px;">Firebase apiKey</label>
       <input id="cfg_apiKey" style="width:100%;margin-bottom:8px;padding:6px;" value="${fbValue("apiKey")}">

       <label style="font-size:12px;">Firebase authDomain</label>
       <input id="cfg_authDomain" style="width:100%;margin-bottom:8px;padding:6px;" value="${fbValue("authDomain")}">

       <label style="font-size:12px;">Firebase projectId</label>
       <input id="cfg_projectId" style="width:100%;margin-bottom:8px;padding:6px;" value="${fbValue("projectId")}">

       <label style="font-size:12px;">Firebase appId</label>
       <input id="cfg_appId" style="width:100%;margin-bottom:12px;padding:6px;" value="${fbValue("appId")}">`;

  box.innerHTML = `
    <h2 style="margin-top:0;font-size:18px;">Asetukset</h2>
    <p style="font-size:13px;color:#555;">
      Nämä tallennetaan vain TÄHÄN selaimeen (localStorage), ei minnekään palvelimelle.
    </p>

    ${groupField}

    <label style="font-size:12px;">Nimi (esim. Rekku tai Matti)</label>
    <input id="cfg_name" style="width:100%;margin-bottom:8px;padding:6px;" value="${existing?.name || ""}">

    ${firebaseFields}

    <button id="cfg_save" style="width:100%;padding:10px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:15px;">
      Tallenna ja aloita
    </button>

    <button id="cfg_share" style="width:100%;padding:10px;margin-top:8px;background:#f3f4f6;color:#222;border:1px solid #ccc;border-radius:6px;font-size:13px;">
      Kopioi jakolinkki
    </button>
    <p id="cfg_share_status" style="font-size:12px;color:#16a34a;text-align:center;margin:6px 0 0;"></p>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  box.querySelector("#cfg_save").addEventListener("click", () => {
    const cfg = {
      groupCode: box.querySelector("#cfg_group").value.trim(),
      name: box.querySelector("#cfg_name").value.trim() || "Tuntematon",
      firebase: {
        apiKey: box.querySelector("#cfg_apiKey").value.trim(),
        authDomain: box.querySelector("#cfg_authDomain").value.trim(),
        projectId: box.querySelector("#cfg_projectId").value.trim(),
        appId: box.querySelector("#cfg_appId").value.trim(),
      }
    };
    if (!cfg.groupCode || !cfg.firebase.apiKey || !cfg.firebase.projectId) {
      alert("Ryhmäkoodi, apiKey ja projectId ovat pakollisia.");
      return;
    }
    saveConfig(cfg);
    document.body.removeChild(overlay);
    onSave(cfg);
  });

  box.querySelector("#cfg_share").addEventListener("click", () => {
    const cfg = {
      groupCode: box.querySelector("#cfg_group").value.trim(),
      firebase: {
        apiKey: box.querySelector("#cfg_apiKey").value.trim(),
        authDomain: box.querySelector("#cfg_authDomain").value.trim(),
        projectId: box.querySelector("#cfg_projectId").value.trim(),
        appId: box.querySelector("#cfg_appId").value.trim(),
      }
    };
    if (!cfg.groupCode || !cfg.firebase.apiKey) {
      alert("Täytä ryhmäkoodi ja Firebase-tiedot ennen linkin jakamista.");
      return;
    }
    const link = buildShareLink(cfg);
    const statusEl = box.querySelector("#cfg_share_status");

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => {
        statusEl.textContent = "Linkki kopioitu leikepöydälle!";
      }).catch(() => {
        statusEl.textContent = link; // fallback: näytä linkki tekstinä
      });
    } else {
      statusEl.textContent = link;
    }
  });
}

// Pieni "Muuta asetuksia" -nappi, aina näkyvissä
function addSettingsButton(onReset) {
  const btn = document.createElement("button");
  btn.textContent = "Asetukset";
  btn.style.cssText = "position:fixed;bottom:8px;right:8px;z-index:1000;padding:8px 12px;" +
    "background:#fff;border:1px solid #ccc;border-radius:6px;font-family:sans-serif;font-size:12px;";
  btn.addEventListener("click", onReset);
  document.body.appendChild(btn);
}

// ---- 2. Firebase + sijainnin lähetys + kartan piirto ----

let map, markers = {}, trails = {}, firstFix = true;
let watchId = null;

function initMap() {
  map = L.map("map").setView([61.9241, 25.7482], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
}

function iconFor(role) {
  const color = role === "dog" ? "orange" : "blue";
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

function startPackTracker(cfg) {
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
      role: window.PACK_ROLE,
      name: cfg.name,
      updatedAt: firebase.firestore.Timestamp.now()
    }, { merge: true });

    memberRef.collection("track").add({
      lat, lng,
      timestamp: firebase.firestore.Timestamp.now()
    });

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
        const label = `${data.name || "Tuntematon"} (${data.role === "dog" ? "koira" : "metsästäjä"})`;

        if (change.type === "removed") {
          if (markers[uid]) { map.removeLayer(markers[uid]); delete markers[uid]; }
          return;
        }

        if (markers[uid]) {
          markers[uid].setLatLng(latlng).setPopupContent(label);
        } else {
          markers[uid] = L.marker(latlng, { icon: iconFor(data.role) }).addTo(map).bindPopup(label);
        }

        if (firstFix) { map.setView(latlng, 15); firstFix = false; }
      });
    }, err => setStatus("Virhe kuunnellessa ryhmää: " + err.message));

  db.collection("groups").doc(cfg.groupCode).collection("members")
    .onSnapshot((snapshot) => {
      snapshot.docs.forEach((doc) => {
        const uid = doc.id;
        if (trails[uid]) return;
        trails[uid] = L.polyline([], { color: doc.data().role === "dog" ? "orange" : "blue", weight: 3 }).addTo(map);

        db.collection("groups").doc(cfg.groupCode).collection("members").doc(uid)
          .collection("track").orderBy("timestamp").limitToLast(500)
          .onSnapshot((trackSnap) => {
            trails[uid].setLatLngs(trackSnap.docs.map(d => [d.data().lat, d.data().lng]));
          });
      });
    });
}

// ---- 3. Käynnistys ----

function boot() {
  initMap();

  const urlCfg = getUrlConfig();
  const existing = loadConfig();

  // Yhdistä: olemassa oleva tallennettu config + linkistä tulleet oletukset.
  // Tallennettua configia ei ylikirjoiteta linkillä, jos käyttäjä on jo asettanut
  // oman Firebase-projektinsa aiemmin (esim. projektin omistaja itse).
  const merged = existing ? { ...existing } : {};
  if (!merged.firebase && urlCfg.firebase) merged.firebase = urlCfg.firebase;
  if (!merged.groupCode && urlCfg.groupCode) merged.groupCode = urlCfg.groupCode;

  const hasFirebase = merged.firebase && merged.firebase.apiKey && merged.firebase.projectId;
  const hasGroup = !!merged.groupCode;
  const hasName = !!merged.name;

  addSettingsButton(() => {
    showConfigForm(loadConfig(), (cfg) => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      startPackTracker(cfg);
    }, urlCfg);
  });

  if (hasFirebase && hasGroup && hasName) {
    saveConfig(merged);
    startPackTracker(merged);
  } else {
    showConfigForm(merged, (cfg) => {
      saveConfig(cfg);
      startPackTracker(cfg);
    }, urlCfg);
  }
}

window.addEventListener("DOMContentLoaded", boot);
