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

function showConfigForm(existing, onSave) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;" +
    "display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;";

  const box = document.createElement("div");
  box.style.cssText = "background:white;padding:20px;border-radius:10px;max-width:420px;width:100%;font-family:sans-serif;";

  box.innerHTML = `
    <h2 style="margin-top:0;font-size:18px;">Asetukset</h2>
    <p style="font-size:13px;color:#555;">
      Nämä tallennetaan vain TÄHÄN selaimeen (localStorage), ei minnekään palvelimelle.
      Käytä omaa Firebase-projektiasi (Firestore + Anonymous Auth käytössä).
    </p>
    <label style="font-size:12px;">Ryhmäkoodi</label>
    <input id="cfg_group" style="width:100%;margin-bottom:8px;padding:6px;" value="${existing?.groupCode || ""}">

    <label style="font-size:12px;">Nimi (esim. Rekku tai Matti)</label>
    <input id="cfg_name" style="width:100%;margin-bottom:8px;padding:6px;" value="${existing?.name || ""}">

    <label style="font-size:12px;">Firebase apiKey</label>
    <input id="cfg_apiKey" style="width:100%;margin-bottom:8px;padding:6px;" value="${existing?.firebase?.apiKey || ""}">

    <label style="font-size:12px;">Firebase authDomain</label>
    <input id="cfg_authDomain" style="width:100%;margin-bottom:8px;padding:6px;" value="${existing?.firebase?.authDomain || ""}">

    <label style="font-size:12px;">Firebase projectId</label>
    <input id="cfg_projectId" style="width:100%;margin-bottom:8px;padding:6px;" value="${existing?.firebase?.projectId || ""}">

    <label style="font-size:12px;">Firebase appId</label>
    <input id="cfg_appId" style="width:100%;margin-bottom:12px;padding:6px;" value="${existing?.firebase?.appId || ""}">

    <button id="cfg_save" style="width:100%;padding:10px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:15px;">
      Tallenna ja aloita
    </button>
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

  const existing = loadConfig();

  addSettingsButton(() => {
    showConfigForm(loadConfig(), (cfg) => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      startPackTracker(cfg);
    });
  });

  if (existing) {
    startPackTracker(existing);
  } else {
    showConfigForm(null, startPackTracker);
  }
}

window.addEventListener("DOMContentLoaded", boot);
