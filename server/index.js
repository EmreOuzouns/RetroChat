const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
let webpush = null;
try { webpush = require("web-push"); } catch (e) {}

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const MEDIA_DIR = path.join(DATA_DIR, "media");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const WWW_DIR = path.resolve(__dirname, "..", "www");
const MAX_PAYLOAD = 35 * 1024 * 1024; // 35 MB (WS mesaj/medya için)
const MAX_UPLOAD = 30 * 1024 * 1024; // 30 MB (HTTP medya/dosya/ses yükleme)
const MEDIA_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

fs.mkdirSync(MEDIA_DIR, { recursive: true });

// Kalıcı depo: kullanıcı PIN + token + profil + çevrimdışı kuyruk + push + native token + medya indeksi
let store = {
  users: {}, // pin -> { token, profile, pubKey, lastSeen }
  queue: {}, // toPin -> [ { ...event, queuedAt } ]
  pushSubs: {}, // pin -> [ subscription, ... ]
  nativeTokens: {}, // pin -> { token, platform, updatedAt }
  media: {}, // id -> { name, mime, size, owner, createdAt }
  groups: {}, // groupId -> { id, name, icon, owner, members: [], createdAt }
  requests: {}, // toPin -> [ { id, from, to, createdAt } ]
  vapid: null, // { publicKey, privateKey }
};

try {
  if (fs.existsSync(STORE_PATH)) {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    if (raw && typeof raw === "object") {
      store.users = raw.users || {};
      store.queue = raw.queue || {};
      store.pushSubs = raw.pushSubs || {};
      store.nativeTokens = raw.nativeTokens || {};
      store.media = raw.media || {};
      store.groups = raw.groups || {};
      store.requests = raw.requests || {};
      store.vapid = raw.vapid || null;
    }
  }
} catch (e) {
  console.error("Store load error:", e.message);
}

// Kalıcı VAPID anahtarları (Web Push için)
if (webpush) {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    store.vapid = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  } else if (!store.vapid || !store.vapid.publicKey || !store.vapid.privateKey) {
    store.vapid = webpush.generateVAPIDKeys();
    try { fs.writeFileSync(STORE_PATH, JSON.stringify(store), "utf8"); } catch (e) {}
  }
  webpush.setVapidDetails(
    "mailto:retrochat@retrochat.app",
    store.vapid.publicKey,
    store.vapid.privateKey
  );
}

// Çevrimdışı kullanıcıya arama geldiğinde 35 sn beklet (bildirime tıklayıp açınca yakalasın)
const pendingCalls = new Map(); // toPin -> { offer, ice: [], expiresAt }

// Native Android/iOS FCM HTTP v1 (Service Account JWT) + Legacy Server Key desteği (sıfır ek bağımlılık)
let fcmSA = null;
try {
  if (process.env.FCM_SERVICE_ACCOUNT_JSON) {
    fcmSA = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON);
  }
} catch (e) {
  console.error("FCM_SERVICE_ACCOUNT_JSON parse error:", e.message);
}
let fcmTokenCache = { token: null, exp: 0 };

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function httpsJson(urlStr, method, headers, bodyStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      { hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function getFcmAccessToken() {
  if (!fcmSA || !fcmSA.client_email || !fcmSA.private_key) return null;
  const now = Math.floor(Date.now() / 1000);
  if (fcmTokenCache.token && fcmTokenCache.exp > now + 60) return fcmTokenCache.token;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: fcmSA.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(header + "." + claim);
  const sig = signer.sign(fcmSA.private_key).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const form = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${claim}.${sig}`;
  const res = await httpsJson(
    "https://oauth2.googleapis.com/token",
    "POST",
    { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(form) },
    form
  );
  if (res.status !== 200) return null;
  const j = JSON.parse(res.body);
  fcmTokenCache = { token: j.access_token, exp: now + (j.expires_in || 3500) };
  return fcmTokenCache.token;
}

async function sendNativePushToPin(pin, payload) {
  const entry = store.nativeTokens && store.nativeTokens[pin];
  if (!entry || !entry.token) return;
  try {
    if (fcmSA && fcmSA.project_id) {
      const accessToken = await getFcmAccessToken();
      if (!accessToken) return;
      const body = JSON.stringify({
        message: {
          token: entry.token,
          notification: { title: payload.title || "RetroChat", body: payload.body || "Yeni bildirim" },
          data: { kind: String(payload.kind || "msg"), from: String(payload.from || "") },
          android: { priority: "HIGH" },
        },
      });
      const res = await httpsJson(
        `https://fcm.googleapis.com/v1/projects/${fcmSA.project_id}/messages:send`,
        "POST",
        {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        body
      );
      if (res.status === 404 || res.body.includes("UNREGISTERED")) {
        delete store.nativeTokens[pin];
        scheduleSave();
      }
    } else if (process.env.FCM_SERVER_KEY) {
      const body = JSON.stringify({
        to: entry.token,
        priority: "high",
        notification: { title: payload.title || "RetroChat", body: payload.body || "Yeni bildirim" },
        data: { kind: String(payload.kind || "msg"), from: String(payload.from || "") },
      });
      await httpsJson(
        "https://fcm.googleapis.com/fcm/send",
        "POST",
        {
          Authorization: "key=" + process.env.FCM_SERVER_KEY,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        body
      );
    }
  } catch (e) {}
}

function sendPushToPin(pin, payload) {
  sendNativePushToPin(pin, payload);
  if (!webpush || !store.vapid) return;
  const subs = store.pushSubs[pin];
  if (!subs || !subs.length) return;
  const body = JSON.stringify(payload);
  const ttl = payload.kind === "call" ? 45 : payload.kind === "call_cancel" ? 60 : 86400;
  subs.forEach((sub) => {
    webpush.sendNotification(sub, body, { TTL: ttl, urgency: "high" }).catch((err) => {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        store.pushSubs[pin] = (store.pushSubs[pin] || []).filter((s) => s.endpoint !== sub.endpoint);
        scheduleSave();
      } else if (err) {
        console.warn("WebPush send error:", err.statusCode || err.message || err);
      }
    });
  });
}

// Kilitli/kapalı telefonda gelen aramanın sürekli çalması için tekrarlayan push nabzı
const activeRingPulses = new Map(); // toPin -> { timer, from, callType }

function stopCallRingPulses(pin, sendCancel) {
  const rp = activeRingPulses.get(pin);
  if (rp) {
    clearInterval(rp.timer);
    activeRingPulses.delete(pin);
    if (sendCancel) {
      sendPushToPin(pin, {
        kind: "call_cancel",
        from: rp.from,
        title: senderName(rp.from),
        body: "📵 Cevapsız arama",
      });
    }
  }
}

function clearPendingCall(pin, sendCancel) {
  pendingCalls.delete(pin);
  stopCallRingPulses(pin, sendCancel);
}

function startCallRingPulses(toPin, fromPin, callType) {
  stopCallRingPulses(toPin, false);
  const hasPush = !!(store.pushSubs[toPin] && store.pushSubs[toPin].length);
  const hasNative = !!(store.nativeTokens[toPin] && store.nativeTokens[toPin].length);
  if (!hasPush && !hasNative) return;
  const isVid = callType === "video";
  let pulses = 0;
  const timer = setInterval(() => {
    pulses++;
    if (pulses > 6) {
      stopCallRingPulses(toPin, true);
      pendingCalls.delete(toPin);
      return;
    }
    sendPushToPin(toPin, {
      kind: "call",
      from: fromPin,
      callType: isVid ? "video" : "voice",
      title: senderName(fromPin),
      body: isVid ? "🎥 Görüntülü arıyor…" : "📞 Sesli arıyor…",
      pulse: pulses,
    });
  }, 5500);
  activeRingPulses.set(toPin, { timer, from: fromPin, callType: isVid ? "video" : "voice" });
}

function senderName(pin) {
  const u = store.users[pin];
  return (u && u.profile && u.profile.name) || ("Kişi " + pin.slice(-4));
}

// Asenkron atomik kayıt (event loop bloklanmaz, çökmede store.json bozulmaz)
let saveTimer = null;
let saving = false;
let saveQueued = false;

async function flushSave() {
  if (saving) {
    saveQueued = true;
    return;
  }
  saving = true;
  try {
    const tmp = STORE_PATH + ".tmp";
    await fs.promises.writeFile(tmp, JSON.stringify(store), "utf8");
    await fs.promises.rename(tmp, STORE_PATH);
  } catch (e) {
    console.error("Store save error:", e.message);
  } finally {
    saving = false;
    if (saveQueued) {
      saveQueued = false;
      scheduleSave();
    }
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushSave();
  }, 500);
}

function deleteMediaById(mediaId) {
  if (!mediaId || !/^[0-9a-f]{24}$/.test(mediaId)) return;
  if (store.media[mediaId]) {
    delete store.media[mediaId];
    scheduleSave();
  }
  const fp = path.join(MEDIA_DIR, mediaId);
  fs.promises.unlink(fp).catch(() => {});
}

// 24 saatten eski süreli mesaj kuyruğunu ve 7 günden eski medya dosyalarını temizle
setInterval(() => {
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;
  let changed = false;
  for (const pin of Object.keys(store.queue)) {
    const before = store.queue[pin].length;
    store.queue[pin] = store.queue[pin].filter(
      (ev) => !ev.timed || (ev.queuedAt || 0) > cutoff
    );
    if (store.queue[pin].length !== before) changed = true;
    if (!store.queue[pin].length) delete store.queue[pin];
  }
  const mediaCutoff = now - MEDIA_TTL_MS;
  for (const id of Object.keys(store.media)) {
    if ((store.media[id].createdAt || 0) < mediaCutoff) {
      delete store.media[id];
      fs.promises.unlink(path.join(MEDIA_DIR, id)).catch(() => {});
      changed = true;
    }
  }
  for (const [pin, pc] of pendingCalls.entries()) {
    if (pc.expiresAt <= now) clearPendingCall(pin, true);
  }
  if (changed) scheduleSave();
}, 60 * 1000);

// Aktif WebSocket bağlantıları: pin -> Set<ws>
const clients = new Map();
// Titreşim spam koruması: "from:target" -> son gönderim zamanı (10 sn bekleme)
const nudgeCooldown = new Map();

function sendJSON(ws, payload) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

function sendToPin(pin, payload, queueIfOffline = false) {
  const set = clients.get(pin);
  let delivered = false;
  if (set && set.size > 0) {
    for (const ws of set) {
      if (sendJSON(ws, payload)) delivered = true;
    }
  }
  if (!delivered && queueIfOffline) {
    if (!store.queue[pin]) store.queue[pin] = [];
    store.queue[pin].push({ ...payload, queuedAt: Date.now() });
    if (store.queue[pin].length > 500) store.queue[pin].shift();
    scheduleSave();
  }
  return delivered;
}

function rememberPeerRelation(pinA, pinB) {
  if (!pinA || !pinB || pinA === pinB) return;
  const setA = clients.get(pinA);
  if (setA) for (const w of setA) if (w.friends) w.friends.add(pinB);
  const setB = clients.get(pinB);
  if (setB) for (const w of setB) if (w.friends) w.friends.add(pinA);
}

function validPubKey(k) {
  return !!(
    k &&
    typeof k === "object" &&
    k.kty === "EC" &&
    k.crv === "P-256" &&
    typeof k.x === "string" &&
    typeof k.y === "string" &&
    k.x.length > 20 &&
    k.x.length < 120 &&
    k.y.length > 20 &&
    k.y.length < 120
  );
}

function publicProfile(pin) {
  const u = store.users[pin];
  const isOnline = clients.has(pin) && clients.get(pin).size > 0;
  if (!u) return null;
  const p = u.profile || {};
  return {
    pin,
    name: p.name || "Kişi " + pin.slice(-4),
    status: isOnline ? p.status || "on" : "off",
    stx: p.stxVis === "none" ? "" : p.stx || "",
    song: p.mus ? p.song || "" : "",
    emo: p.emo || "",
    anim: p.anim || "none",
    photo: p.photo || null,
    pubKey: u.pubKey || null,
    lastSeen: u.lastSeen || Date.now(),
  };
}

function groupPayload(g) {
  if (!g) return null;
  return {
    id: g.id,
    name: g.name,
    icon: g.icon || "👥",
    owner: g.owner,
    pinned: g.pinned || null,
    members: g.members.map((mp) => {
      const p = publicProfile(mp);
      return {
        pin: mp,
        name: p ? p.name : "Kişi " + mp.slice(-4),
        status: p ? p.status : "off",
        emo: p ? p.emo : "",
        photo: p ? p.photo : null,
      };
    }),
    createdAt: g.createdAt || Date.now(),
  };
}

function listUserGroups(pin) {
  const out = [];
  for (const g of Object.values(store.groups)) {
    if (g && Array.isArray(g.members) && g.members.includes(pin)) {
      out.push(groupPayload(g));
    }
  }
  return out;
}

function maskPin(pin) {
  const s = String(pin || "");
  if (s.length < 8) return "••••••••";
  return s.slice(0, 2) + "••••" + s.slice(-2);
}

function incomingReqView(req) {
  const u = store.users[req.from];
  const p = (u && u.profile) || {};
  return {
    id: req.id,
    fromName: p.name || "Kullanıcı",
    fromEmo: p.emo || "🧑",
    fromPhoto: p.photo || null,
    hint: maskPin(req.from),
    createdAt: req.createdAt || Date.now(),
  };
}

function outgoingReqView(req) {
  const u = store.users[req.to];
  const p = (u && u.profile) || {};
  return {
    id: req.id,
    toPin: req.to,
    toName: p.name || ("Kişi " + req.to.slice(-4)),
    toEmo: p.emo || "🧑",
    createdAt: req.createdAt || Date.now(),
  };
}

function listIncomingRequests(pin) {
  return (store.requests[pin] || []).map(incomingReqView);
}

function listOutgoingRequests(pin) {
  const out = [];
  for (const list of Object.values(store.requests)) {
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      if (r && r.from === pin) out.push(outgoingReqView(r));
    }
  }
  return out;
}

// Yalnızca ilgili PIN'i kişi listesinde barındıran istemcilere presence yayınla (gizlilik & performans)
function broadcastPresence(pin) {
  const prof = publicProfile(pin);
  if (!prof) return;
  const payload = { type: "presence", user: prof };
  for (const [otherPin, set] of clients.entries()) {
    if (otherPin === pin) continue;
    for (const ws of set) {
      if (ws.friends && ws.friends.has(pin)) {
        sendJSON(ws, payload);
      }
    }
  }
}

function authHttpPin(req) {
  const pin = String(req.headers["x-pin"] || "").trim().toUpperCase();
  const token = String(req.headers["x-token"] || "").trim();
  if (!/^[0-9A-F]{8}$/.test(pin) || token.length < 16) return null;
  const u = store.users[pin];
  if (u && u.token !== token) return null;
  return pin;
}

function sanitizeFileName(raw) {
  const base = String(raw || "dosya").replace(/[\r\n"\\/]+/g, "_").slice(0, 120);
  return base || "dosya";
}

const ASSET_LABELS = {
  "/index.html": "Ana ekran",
  "/css/style.css": "Arayüz tasarımı",
  "/js/app.js": "Uygulama çekirdeği",
  "/js/transport.js": "Canlı bağlantı motoru",
  "/js/webrtc.js": "Sesli & görüntülü arama",
  "/js/crypto.js": "Uçtan uca şifreleme",
  "/js/push.js": "Arka plan bildirimleri",
  "/js/native.js": "Güncelleme & cihaz köprüsü",
  "/js/requests.js": "Kişi ekleme & kurulum",
  "/js/groups.js": "Grup sohbetleri",
  "/js/extras.js": "Arama & yedekleme",
  "/js/games.js": "Mini oyunlar",
  "/js/voice.js": "Sesli mesaj",
  "/js/qr.js": "QR kod modülü",
  "/js/vendor/qrcode.min.js": "QR oluşturucu motoru",
  "/js/vendor/jsQR.min.js": "QR tarayıcı motoru",
  "/js/haptics.js": "Titreşim motoru",
  "/manifest.json": "Uygulama ayarları",
};

let _cachedAppMeta = null;
function getAppVersionMeta() {
  if (_cachedAppMeta) return _cachedAppMeta;
  let version = "retrochat-v24";
  let assets = [];
  try {
    const swSrc = fs.readFileSync(path.join(WWW_DIR, "sw.js"), "utf8");
    const m = /const\s+CACHE\s*=\s*"([^"]+)"/.exec(swSrc);
    if (m) version = m[1];
    const am = /const\s+ASSETS\s*=\s*\[([\s\S]*?)\];/.exec(swSrc);
    if (am) assets = Array.from(am[1].matchAll(/"([^"]+)"/g), (x) => x[1]);
  } catch (e) {}
  const files = [];
  for (const a of assets) {
    if (a === "/" || a === "/indir.html" || a.startsWith("/icons/")) continue;
    const fp = path.join(WWW_DIR, a.replace(/^\//, ""));
    try {
      const buf = fs.readFileSync(fp);
      const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 8);
      files.push({
        path: a,
        url: /\.(js|css)$/.test(a) ? `${a}?v=${encodeURIComponent(version)}` : a,
        name: ASSET_LABELS[a] || path.basename(a),
        size: buf.length,
        hash,
      });
    } catch (e) {}
  }
  _cachedAppMeta = { version, label: version.replace(/^retrochat-/, ""), assets, files };
  return _cachedAppMeta;
}

// MIME tipleri (www statik servisi için)
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".apk": "application/vnd.android.package-archive",
};

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Pin, X-Token, X-File-Name, X-File-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const urlPath = (req.url || "/").split("?")[0];

  if (urlPath === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        ok: true,
        service: "retrochat-server",
        version: "1.2.0",
        onlineUsers: clients.size,
        registeredPins: Object.keys(store.users).length,
        groupsCount: Object.keys(store.groups).length,
        mediaCount: Object.keys(store.media).length,
        pushReady: !!(webpush && store.vapid && store.vapid.publicKey),
        pushSubsCount: Object.values(store.pushSubs).reduce((a, b) => a + (Array.isArray(b) ? b.length : 0), 0),
        nativePushReady: !!(fcmSA || process.env.FCM_SERVER_KEY),
        turnReady: true,
        e2eeReady: true,
        uptimeSec: Math.floor(process.uptime()),
      })
    );
  }

  if (urlPath === "/client-err" && req.method === "POST") {
    let raw = "";
    req.on("data", (c) => { if (raw.length < 2048) raw += c; });
    req.on("end", () => {
      console.warn("[CLIENT_ERR]", raw.slice(0, 500));
      res.writeHead(204);
      res.end();
    });
    return;
  }

  if (urlPath === "/version") {
    const meta = getAppVersionMeta();
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    return res.end(JSON.stringify({ ok: true, version: meta.version, label: meta.label, files: meta.files }));
  }

  if (urlPath === "/rtc/ice-servers") {
    const iceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "stun:stun.relay.metered.ca:80" },
    ];
    if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      iceServers.push({
        urls: process.env.TURN_URL.split(",").map((u) => u.trim()).filter(Boolean),
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    } else {
      // Varsayılan ücretsiz OpenRelay TURN yedekleri (4G/5G katı NAT için)
      iceServers.push({
        urls: [
          "turn:openrelay.metered.ca:80",
          "turn:openrelay.metered.ca:443",
          "turn:openrelay.metered.ca:443?transport=tcp",
          "turns:openrelay.metered.ca:443?transport=tcp",
        ],
        username: "openrelayproject",
        credential: "openrelayproject",
      });
    }
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ iceServers }));
  }

  if (urlPath === "/push/vapid-public-key") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({ publicKey: store.vapid ? store.vapid.publicKey : null })
    );
  }

  // Medya / Sesli Mesaj / Video / Dosya Yükleme (HTTP streaming — WS & localStorage şişmesini önler)
  if (urlPath === "/media/upload" && req.method === "POST") {
    const owner = authHttpPin(req);
    if (!owner) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Yetkisiz yükleme" }));
    }

    const contentLen = parseInt(req.headers["content-length"] || "0", 10);
    if (contentLen > MAX_UPLOAD) {
      res.writeHead(413, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Dosya en fazla 30 MB olabilir" }));
    }

    const id = crypto.randomBytes(12).toString("hex");
    const targetPath = path.join(MEDIA_DIR, id);
    const mime = String(req.headers["x-file-type"] || req.headers["content-type"] || "application/octet-stream")
      .split("\r")[0].split("\n")[0].slice(0, 120);
    let rawName = "dosya";
    try {
      rawName = decodeURIComponent(String(req.headers["x-file-name"] || "dosya"));
    } catch (e) {
      rawName = String(req.headers["x-file-name"] || "dosya");
    }
    const name = sanitizeFileName(rawName);

    const out = fs.createWriteStream(targetPath);
    let size = 0;
    let aborted = false;

    req.on("data", (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_UPLOAD) {
        aborted = true;
        out.destroy();
        fs.promises.unlink(targetPath).catch(() => {});
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Dosya en fazla 30 MB olabilir" }));
        req.destroy();
        return;
      }
      if (!out.write(chunk)) {
        req.pause();
        out.once("drain", () => req.resume());
      }
    });

    req.on("end", () => {
      if (aborted) return;
      out.end(() => {
        if (size === 0) {
          fs.promises.unlink(targetPath).catch(() => {});
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Boş dosya" }));
        }
        store.media[id] = { name, mime, size, owner, createdAt: Date.now() };
        scheduleSave();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, id, url: "/media/" + id, size }));
      });
    });

    req.on("error", () => {
      aborted = true;
      out.destroy();
      fs.promises.unlink(targetPath).catch(() => {});
    });
    return;
  }

  // Medya indirme / akış (Range destekli — iOS Safari & Android Chrome video/ses uyumlu)
  if (urlPath.startsWith("/media/")) {
    const id = urlPath.slice("/media/".length);
    if (!/^[0-9a-f]{24}$/.test(id)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Medya bulunamadı" }));
    }

    if (req.method === "DELETE") {
      const owner = authHttpPin(req);
      if (!owner) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Yetkisiz" }));
      }
      deleteMediaById(id);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }

    const filePath = path.join(MEDIA_DIR, id);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Medya artık mevcut değil" }));
    }

    const stat = fs.statSync(filePath);
    const meta = store.media[id] || { name: "dosya", mime: "application/octet-stream" };
    const isInline = /^(image|video|audio)\//.test(meta.mime);
    const disp = (isInline ? "inline" : "attachment") + `; filename="${sanitizeFileName(meta.name)}"`;
    const range = req.headers.range;

    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
        if (start <= end && start < stat.size) {
          res.writeHead(206, {
            "Content-Type": meta.mime,
            "Content-Length": end - start + 1,
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Accept-Ranges": "bytes",
            "Content-Disposition": disp,
            "Cache-Control": "private, max-age=604800",
          });
          return fs.createReadStream(filePath, { start, end }).pipe(res);
        }
      }
    }

    res.writeHead(200, {
      "Content-Type": meta.mime,
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
      "Content-Disposition": disp,
      "Cache-Control": "private, max-age=604800",
    });
    return fs.createReadStream(filePath).pipe(res);
  }

  // Statik www/ dosyalarını sun (hem tarayıcıdan test hem PWA için)
  let rel = urlPath === "/" ? "/index.html" : urlPath === "/indir" ? "/indir.html" : urlPath;
  const safePath = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(WWW_DIR, safePath);

  if (fullPath.startsWith(WWW_DIR) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath).toLowerCase();
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
    // index.html'e otomatik sürüm etiketi ve ?v=... cache-buster enjekte et (eski JS/CSS kalmasını %100 önler)
    if (rel === "/index.html") {
      const meta = getAppVersionMeta();
      const vq = encodeURIComponent(meta.version);
      let html = fs.readFileSync(fullPath, "utf8");
      html = html
        .replace("</head>", `<meta name="rc-ver" content="${meta.version}"></head>`)
        .replace(/(href="css\/[^"?]+)(")/g, `$1?v=${vq}$2`)
        .replace(/(src="js\/[^"?]+)(")/g, `$1?v=${vq}$2`);
      headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
      res.writeHead(200, headers);
      return res.end(html);
    }
    if (ext === ".html" || ext === ".js" || ext === ".css" || ext === ".json") {
      headers["Cache-Control"] = "no-cache, must-revalidate";
    }
    res.writeHead(200, headers);
    return fs.createReadStream(fullPath).pipe(res);
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD });

wss.on("connection", (ws) => {
  ws.pin = null;
  ws.friends = new Set();
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }
    if (!data || typeof data.type !== "string") return;

    // 1. PIN + Cihaz Token ile kimlik doğrulama (e-posta/telefon yok)
    if (data.type === "auth") {
      const pin = String(data.pin || "").trim().toUpperCase();
      const token = String(data.token || "").trim();
      if (!/^[0-9A-F]{8}$/.test(pin) || token.length < 16) {
        return sendJSON(ws, { type: "auth_error", error: "Geçersiz PIN veya token" });
      }

      const existing = store.users[pin];
      if (existing && existing.token !== token) {
        return sendJSON(ws, {
          type: "auth_error",
          code: "PIN_TAKEN",
          error: "Bu PIN başka bir cihaza kayıtlı. Yeni PIN üretiliyor.",
        });
      }

      store.users[pin] = {
        token,
        profile: Object.assign(existing ? existing.profile || {} : {}, data.profile || {}),
        pubKey: validPubKey(data.pubKey)
          ? { kty: "EC", crv: "P-256", x: data.pubKey.x, y: data.pubKey.y }
          : (existing && existing.pubKey) || null,
        lastSeen: Date.now(),
      };
      scheduleSave();

      // Eski bağlantı varsa ayır
      if (ws.pin && clients.has(ws.pin)) {
        clients.get(ws.pin).delete(ws);
      }

      ws.pin = pin;
      const friendPins = Array.isArray(data.friends)
        ? data.friends.map((fp) => String(fp || "").trim().toUpperCase()).filter((fp) => /^[0-9A-F]{8}$/.test(fp))
        : [];
      ws.friends = new Set(friendPins);

      if (!clients.has(pin)) clients.set(pin, new Set());
      clients.get(pin).add(ws);

      // Arkadaş listesindeki çevrimiçi kişilerle karşılıklı presence aboneliği kur
      for (const fp of friendPins) rememberPeerRelation(pin, fp);

      // Arkadaş listesinin güncel durumlarını, üye olunan grupları ve bekleyen istekleri döndür
      const presences = friendPins.map((fp) => publicProfile(fp)).filter(Boolean);
      const groups = listUserGroups(pin);
      const requests = listIncomingRequests(pin);
      const sentRequests = listOutgoingRequests(pin);

      sendJSON(ws, { type: "auth_ok", pin, presences, groups, requests, sentRequests });
      broadcastPresence(pin);
      console.log(`[WS] AUTH ${pin} friends=${friendPins.length} online=${clients.size}`);

      // Çevrimdışı kuyrukta bekleyen mesaj/olayları teslim et
      const pending = store.queue[pin];
      if (pending && pending.length) {
        delete store.queue[pin];
        scheduleSave();
        for (const ev of pending) {
          if (ev.from) ws.friends.add(ev.from);
          sendJSON(ws, ev);
          // Gönderene iletildi (st: 1) bildirimi
          if (ev.type === "msg" && ev.from && ev.msg && ev.msg.id) {
            sendToPin(ev.from, { type: "delivered", from: pin, msgId: ev.msg.id }, false);
          }
        }
      }

      // Bekleyen gelen arama varsa (bildirimle açıldıysa) hemen ilet
      const pc = pendingCalls.get(pin);
      if (pc && pc.expiresAt > Date.now()) {
        clearPendingCall(pin, false);
        if (pc.offer && pc.offer.from) ws.friends.add(pc.offer.from);
        sendJSON(ws, pc.offer);
        for (const ice of pc.ice) sendJSON(ws, ice);
      }
      return;
    }

    if (!ws.pin) {
      return sendJSON(ws, { type: "error", error: "Önce PIN ile bağlanmalısın" });
    }

    const from = ws.pin;
    const to = data.to ? String(data.to).trim().toUpperCase() : "";

    switch (data.type) {
      case "profile_update": {
        if (store.users[from]) {
          store.users[from].profile = Object.assign(
            store.users[from].profile || {},
            data.profile || {}
          );
          if (validPubKey(data.pubKey)) {
            store.users[from].pubKey = { kty: "EC", crv: "P-256", x: data.pubKey.x, y: data.pubKey.y };
          }
          store.users[from].lastSeen = Date.now();
          scheduleSave();
          broadcastPresence(from);
        }
        break;
      }

      case "lookup_pin": {
        const target = String(data.pin || "").trim().toUpperCase();
        if (/^[0-9A-F]{8}$/.test(target)) {
          ws.friends.add(target);
          rememberPeerRelation(from, target);
        }
        const prof = publicProfile(target);
        sendJSON(ws, { type: "lookup_result", pin: target, user: prof });
        break;
      }

      // Tek Taraflı Anında PIN ile Kişi Ekleme (sadece ekleyen kişinin PIN yazması yeterli)
      case "add_friend_pin": {
        const target = String(data.pin || "").trim().toUpperCase();
        if (!/^[0-9A-F]{8}$/.test(target)) {
          sendJSON(ws, { type: "add_friend_result", ok: false, error: "PIN 8 haneli olmalı (0-9, A-F)." });
          break;
        }
        if (target === from) {
          sendJSON(ws, { type: "add_friend_result", ok: false, error: "Kendi PIN kodunu ekleyemezsin." });
          break;
        }
        if (!store.users[target]) {
          sendJSON(ws, {
            type: "add_friend_result",
            ok: false,
            error: "Bu PIN ile kayıtlı kullanıcı bulunamadı. Arkadaşının uygulamayı açıp güncel PIN kodunu paylaştığından emin ol.",
          });
          break;
        }
        rememberPeerRelation(from, target);
        const targetProf = publicProfile(target);
        const myProf = publicProfile(from);
        sendJSON(ws, { type: "add_friend_result", ok: true, user: targetProf });
        sendToPin(target, { type: "friend_linked", user: myProf }, true);
        sendPushToPin(target, {
          kind: "msg",
          from,
          title: "👋 " + senderName(from),
          body: "Seni RetroChat'e ekledi! Hemen mesajlaşmaya başlayabilirsin.",
        });
        break;
      }

      // Karşılıklı PIN Doğrulamalı Arkadaşlık İstekleri
      case "friend_req_send": {
        const target = String(data.toPin || "").trim().toUpperCase();
        if (!/^[0-9A-F]{8}$/.test(target)) {
          sendJSON(ws, { type: "friend_req_result", ok: false, error: "PIN 8 haneli olmalı (0-9, A-F)." });
          break;
        }
        if (target === from) {
          sendJSON(ws, { type: "friend_req_result", ok: false, error: "Kendi PIN koduna istek gönderemezsin." });
          break;
        }
        if (!store.users[target]) {
          sendJSON(ws, {
            type: "friend_req_result",
            ok: false,
            error: "Bu PIN ile kayıtlı bir kullanıcı bulunamadı.",
          });
          break;
        }

        // Eğer karşı taraf zaten bize istek göndermişse ve biz de onun PIN'ini yazdıysak -> otomatik karşılıklı onay!
        const myInc = store.requests[from] || [];
        const revIdx = myInc.findIndex((r) => r.from === target);
        if (revIdx >= 0) {
          const rev = myInc.splice(revIdx, 1)[0];
          if (!myInc.length) delete store.requests[from];
          scheduleSave();
          rememberPeerRelation(from, target);
          sendJSON(ws, { type: "friend_req_accepted", reqId: rev.id, user: publicProfile(target), mutual: true });
          sendToPin(target, { type: "friend_req_accepted", reqId: rev.id, user: publicProfile(from), mutual: true }, true);
          sendPushToPin(target, {
            kind: "msg",
            from,
            title: "🎉 Arkadaşlık İsteği Onaylandı!",
            body: `${senderName(from)} PIN kodunu doğruladı ve arkadaş oldunuz!`,
          });
          break;
        }

        if (!store.requests[target]) store.requests[target] = [];
        let req = store.requests[target].find((r) => r.from === from);
        if (req) {
          req.createdAt = Date.now();
        } else {
          req = {
            id: "REQ-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
            from,
            to: target,
            createdAt: Date.now(),
          };
          store.requests[target].unshift(req);
          if (store.requests[target].length > 50) store.requests[target].pop();
        }
        scheduleSave();

        sendJSON(ws, { type: "friend_req_result", ok: true, status: "sent", sent: outgoingReqView(req) });
        sendToPin(target, { type: "friend_req_incoming", req: incomingReqView(req) }, false);
        sendPushToPin(target, {
          kind: "friend_req",
          from: "",
          title: "👋 Yeni Arkadaşlık İsteği",
          body: `${senderName(from)} sana arkadaşlık isteği gönderdi! PIN doğrulaması için dokun.`,
        });
        break;
      }

      case "friend_req_accept": {
        const reqId = String(data.reqId || "");
        const enteredPin = String(data.pin || "").trim().toUpperCase();
        const list = store.requests[from] || [];
        const idx = list.findIndex((r) => r.id === reqId);
        if (idx < 0) {
          sendJSON(ws, { type: "friend_req_accept_result", ok: false, reqId, error: "İstek bulunamadı veya iptal edildi." });
          break;
        }
        const req = list[idx];
        if (enteredPin !== req.from) {
          sendJSON(ws, {
            type: "friend_req_accept_result",
            ok: false,
            reqId,
            error: "Girdiğin PIN kodu istek gönderenin PIN koduyla eşleşmedi!",
          });
          break;
        }

        list.splice(idx, 1);
        if (!list.length) delete store.requests[from];
        scheduleSave();
        rememberPeerRelation(from, req.from);

        sendJSON(ws, { type: "friend_req_accepted", reqId: req.id, user: publicProfile(req.from) });
        sendToPin(req.from, { type: "friend_req_accepted", reqId: req.id, user: publicProfile(from) }, true);
        sendPushToPin(req.from, {
          kind: "msg",
          from,
          title: "🎉 Arkadaşlık İsteğin Kabul Edildi!",
          body: `${senderName(from)} PIN kodunu doğruladı, artık mesajlaşabilirsiniz!`,
        });
        break;
      }

      case "friend_req_reject": {
        const reqId = String(data.reqId || "");
        const list = store.requests[from] || [];
        const idx = list.findIndex((r) => r.id === reqId);
        if (idx >= 0) {
          const req = list.splice(idx, 1)[0];
          if (!list.length) delete store.requests[from];
          scheduleSave();
          sendJSON(ws, { type: "friend_req_removed", reqId });
          sendToPin(req.from, { type: "friend_req_rejected", reqId }, true);
        }
        break;
      }

      case "friend_req_cancel": {
        const reqId = String(data.reqId || "");
        for (const [toPin, list] of Object.entries(store.requests)) {
          const idx = Array.isArray(list) ? list.findIndex((r) => r.id === reqId && r.from === from) : -1;
          if (idx >= 0) {
            list.splice(idx, 1);
            if (!list.length) delete store.requests[toPin];
            scheduleSave();
            sendJSON(ws, { type: "friend_req_cancelled", reqId });
            sendToPin(toPin, { type: "friend_req_removed", reqId }, false);
            break;
          }
        }
        break;
      }

      case "push_subscribe": {
        const sub = data.subscription;
        if (sub && sub.endpoint) {
          const list = (store.pushSubs[from] || []).filter((s) => s.endpoint !== sub.endpoint);
          list.push(sub);
          store.pushSubs[from] = list.slice(-5);
          scheduleSave();
          sendJSON(ws, { type: "push_ok" });
        }
        break;
      }

      case "push_unsubscribe": {
        if (data.endpoint && store.pushSubs[from]) {
          store.pushSubs[from] = store.pushSubs[from].filter((s) => s.endpoint !== data.endpoint);
          scheduleSave();
        }
        break;
      }

      case "msg": {
        if (!to || !data.msg) break;
        rememberPeerRelation(from, to);
        const senderPubKey = (store.users[from] && store.users[from].pubKey) || null;
        const senderProfile = publicProfile(from);
        const delivered = sendToPin(
          to,
          { type: "msg", from, msg: data.msg, senderPubKey, senderProfile, timed: !!data.timed },
          true
        );
        console.log(`[WS] MSG ${from}->${to} delivered=${delivered} e2ee=${!!data.msg.e2ee}`);
        if (delivered && data.msg.id) {
          sendJSON(ws, { type: "delivered", from: to, msgId: data.msg.id });
        }
        const m = data.msg;
        const preview = m.e2ee
          ? "🔒 Yeni şifreli mesaj"
          : m.aud
          ? "🎤 Sesli mesaj (" + (m.aud.dur || "0:01") + ")"
          : m.med
          ? (m.med.mode === "once" ? "👁 Tek seferlik medya" : m.med.k === "vid" ? "🎞 Video" : "📷 Fotoğraf")
          : m.img ? "📷 Fotoğraf"
          : m.file ? "📄 " + (m.file.name || "Dosya")
          : m.loc ? "📍 Konum"
          : String(m.t || "Yeni mesaj").slice(0, 120);
        sendPushToPin(to, { kind: "msg", from, title: senderName(from), body: preview });
        break;
      }

      case "nudge": {
        if (!to) break;
        const nk = `${from}:${to}`;
        const now = Date.now();
        if (now - (nudgeCooldown.get(nk) || 0) < 9500) break;
        nudgeCooldown.set(nk, now);
        rememberPeerRelation(from, to);
        sendToPin(to, { type: "nudge", from, at: now }, true);
        sendPushToPin(to, {
          kind: "nudge",
          from,
          title: senderName(from),
          body: "🫨 Sana titreşim gönderdi!",
        });
        break;
      }

      case "typing": {
        if (!to) break;
        sendToPin(to, { type: "typing", from, isTyping: !!data.isTyping }, false);
        break;
      }

      case "read": {
        if (!to) break;
        sendToPin(to, { type: "read", from, msgIds: data.msgIds || [] }, true);
        break;
      }

      case "delete_for_all": {
        if (!to || !data.msgId) break;
        if (data.mediaId) deleteMediaById(data.mediaId);
        sendToPin(to, { type: "delete_for_all", from, msgId: data.msgId }, true);
        break;
      }

      case "edit_msg": {
        if (!to || !data.msgId) break;
        const senderPubKey = (store.users[from] && store.users[from].pubKey) || null;
        sendToPin(
          to,
          {
            type: "edit_msg",
            from,
            msgId: data.msgId,
            text: data.text != null ? String(data.text).slice(0, 4000) : undefined,
            e2ee: data.e2ee || undefined,
            senderPubKey,
          },
          true
        );
        break;
      }

      case "pin_msg": {
        if (!to) break;
        sendToPin(
          to,
          {
            type: "pin_msg",
            from,
            msgId: data.msgId || "",
            preview: String(data.preview || "").slice(0, 120),
          },
          true
        );
        break;
      }

      case "media_opened": {
        if (!to || !data.msgId) break;
        if (data.mediaId) deleteMediaById(data.mediaId);
        sendToPin(to, { type: "media_opened", from, msgId: data.msgId }, true);
        break;
      }

      case "reaction": {
        if (!to || !data.msgId) break;
        sendToPin(to, { type: "reaction", from, msgId: data.msgId, emoji: data.emoji || "" }, true);
        if (data.emoji) {
          sendPushToPin(to, {
            kind: "msg",
            from,
            title: senderName(from),
            body: `Mesajına ${data.emoji} tepkisi verdi`,
          });
        }
        break;
      }

      case "native_push_register": {
        if (data.token && data.platform) {
          store.nativeTokens = store.nativeTokens || {};
          store.nativeTokens[from] = { token: String(data.token), platform: String(data.platform), updatedAt: Date.now() };
          scheduleSave();
        }
        break;
      }

      // Grup Sohbetleri (Faz 10: Çoklu PIN Odaları)
      case "group_create": {
        const gName = String(data.name || "").trim().slice(0, 40);
        if (!gName) break;
        const gIcon = String(data.icon || "👥").slice(0, 8);
        const rawMembers = Array.isArray(data.members) ? data.members : [];
        const uniq = new Set([from]);
        for (const mp of rawMembers) {
          const clean = String(mp || "").trim().toUpperCase();
          if (/^[0-9A-F]{8}$/.test(clean)) uniq.add(clean);
        }
        const members = Array.from(uniq).slice(0, 30);
        const id = "GRP-" + crypto.randomBytes(4).toString("hex").toUpperCase();
        const grp = { id, name: gName, icon: gIcon, owner: from, members, createdAt: Date.now() };
        store.groups[id] = grp;
        scheduleSave();
        const payload = groupPayload(grp);
        for (const mp of members) {
          sendToPin(mp, { type: "group_sync", group: payload, createdBy: from }, true);
          if (mp !== from) {
            sendPushToPin(mp, {
              kind: "msg",
              from: id,
              title: gName,
              body: `👥 ${senderName(from)} seni "${gName}" grubuna ekledi`,
            });
          }
        }
        break;
      }

      case "group_add_member": {
        const gid = String(data.groupId || "").trim().toUpperCase();
        const newPin = String(data.pin || "").trim().toUpperCase();
        const grp = store.groups[gid];
        if (!grp || !grp.members.includes(from) || !/^[0-9A-F]{8}$/.test(newPin)) break;
        if (!grp.members.includes(newPin) && grp.members.length < 30) {
          grp.members.push(newPin);
          scheduleSave();
          const payload = groupPayload(grp);
          const sysMsg = {
            k: "c",
            id: crypto.randomBytes(4).toString("hex"),
            txt: `👥 ${senderName(from)}, ${senderName(newPin)} kişisini gruba ekledi`,
            ts: Date.now(),
          };
          for (const mp of grp.members) {
            sendToPin(mp, { type: "group_sync", group: payload }, true);
            sendToPin(mp, { type: "group_msg", groupId: gid, from, senderName: senderName(from), msg: sysMsg }, true);
          }
          sendPushToPin(newPin, {
            kind: "msg",
            from: gid,
            title: grp.name,
            body: `👥 ${senderName(from)} seni "${grp.name}" grubuna ekledi`,
          });
        }
        break;
      }

      case "group_leave": {
        const gid = String(data.groupId || "").trim().toUpperCase();
        const grp = store.groups[gid];
        if (!grp || !grp.members.includes(from)) break;
        grp.members = grp.members.filter((mp) => mp !== from);
        if (grp.members.length === 0) {
          delete store.groups[gid];
        } else {
          if (grp.owner === from) grp.owner = grp.members[0];
          const payload = groupPayload(grp);
          const sysMsg = {
            k: "c",
            id: crypto.randomBytes(4).toString("hex"),
            txt: `👋 ${senderName(from)} gruptan ayrıldı`,
            ts: Date.now(),
          };
          for (const mp of grp.members) {
            sendToPin(mp, { type: "group_sync", group: payload }, true);
            sendToPin(mp, { type: "group_msg", groupId: gid, from, senderName: senderName(from), msg: sysMsg }, true);
          }
        }
        scheduleSave();
        sendJSON(ws, { type: "group_removed", groupId: gid });
        break;
      }

      case "group_msg": {
        const gid = String(data.groupId || "").trim().toUpperCase();
        const grp = store.groups[gid];
        if (!grp || !grp.members.includes(from) || !data.msg) break;
        const sName = senderName(from);
        const m = data.msg;
        let anyDelivered = false;
        for (const mp of grp.members) {
          if (mp === from) continue;
          const ok = sendToPin(
            mp,
            { type: "group_msg", groupId: gid, from, senderName: sName, msg: m, timed: !!data.timed },
            true
          );
          if (ok) anyDelivered = true;
          const preview = m.aud
            ? "🎤 Sesli mesaj"
            : m.med
            ? (m.med.mode === "once" ? "👁 Tek seferlik medya" : m.med.k === "vid" ? "🎞 Video" : "📷 Fotoğraf")
            : m.img ? "📷 Fotoğraf"
            : m.file ? "📄 " + (m.file.name || "Dosya")
            : m.loc ? "📍 Konum"
            : String(m.t || "Yeni mesaj").slice(0, 100);
          sendPushToPin(mp, {
            kind: "msg",
            from: gid,
            title: `${grp.icon || "👥"} ${grp.name}`,
            body: `${sName}: ${preview}`,
          });
        }
        if (anyDelivered && m.id) {
          sendJSON(ws, { type: "delivered", from: gid, msgId: m.id });
        }
        break;
      }

      case "group_nudge": {
        const gid = String(data.groupId || "").trim().toUpperCase();
        const grp = store.groups[gid];
        if (!grp || !grp.members.includes(from)) break;
        const nk = `${from}:${gid}`;
        const now = Date.now();
        if (now - (nudgeCooldown.get(nk) || 0) < 9500) break;
        nudgeCooldown.set(nk, now);
        const sName = senderName(from);
        for (const mp of grp.members) {
          if (mp === from) continue;
          sendToPin(mp, { type: "group_nudge", groupId: gid, from, senderName: sName, at: Date.now() }, true);
          sendPushToPin(mp, {
            kind: "nudge",
            from: gid,
            title: `${grp.icon || "👥"} ${grp.name}`,
            body: `🫨 ${sName} gruba titreşim gönderdi!`,
          });
        }
        break;
      }

      case "group_typing": {
        const gid = String(data.groupId || "").trim().toUpperCase();
        const grp = store.groups[gid];
        if (!grp || !grp.members.includes(from)) break;
        const sName = senderName(from);
        for (const mp of grp.members) {
          if (mp === from) continue;
          sendToPin(mp, { type: "group_typing", groupId: gid, from, senderName: sName, isTyping: !!data.isTyping }, false);
        }
        break;
      }

      case "group_reaction": {
        const gid = String(data.groupId || "").trim().toUpperCase();
        const grp = store.groups[gid];
        if (!grp || !grp.members.includes(from) || !data.msgId) break;
        for (const mp of grp.members) {
          if (mp === from) continue;
          sendToPin(mp, { type: "group_reaction", groupId: gid, from, msgId: data.msgId, emoji: data.emoji || "" }, true);
        }
        break;
      }

      case "group_delete": {
        const gid = String(data.groupId || "").trim().toUpperCase();
        const grp = store.groups[gid];
        if (!grp || !grp.members.includes(from) || !data.msgId) break;
        if (data.mediaId) deleteMediaById(data.mediaId);
        for (const mp of grp.members) {
          if (mp === from) continue;
          sendToPin(mp, { type: "group_delete", groupId: gid, from, msgId: data.msgId }, true);
        }
        break;
      }

      case "group_edit": {
        const gid = String(data.groupId || "").trim().toUpperCase();
        const grp = store.groups[gid];
        if (!grp || !grp.members.includes(from) || !data.msgId) break;
        const text = String(data.text || "").slice(0, 4000);
        for (const mp of grp.members) {
          if (mp === from) continue;
          sendToPin(mp, { type: "group_edit", groupId: gid, from, msgId: data.msgId, text }, true);
        }
        break;
      }

      case "group_pin": {
        const gid = String(data.groupId || "").trim().toUpperCase();
        const grp = store.groups[gid];
        if (!grp || !grp.members.includes(from)) break;
        const msgId = String(data.msgId || "");
        const preview = String(data.preview || "").slice(0, 120);
        grp.pinned = msgId ? { id: msgId, preview } : null;
        scheduleSave();
        for (const mp of grp.members) {
          if (mp === from) continue;
          sendToPin(mp, { type: "group_pin", groupId: gid, from, msgId, preview }, true);
        }
        break;
      }

      // Canlı Mini Oyunlar (XOX, Taş Kağıt Makas, Dört Bağla)
      case "game_invite":
      case "game_accept":
      case "game_decline":
      case "game_move":
      case "game_end": {
        if (!to) break;
        rememberPeerRelation(from, to);
        sendToPin(to, { ...data, from }, false);
        if (data.type === "game_invite") {
          const gNames = { xox: "XOX", rps: "Taş Kağıt Makas", c4: "Dört Bağla" };
          sendPushToPin(to, {
            kind: "msg",
            from,
            title: senderName(from),
            body: `🎮 Seni ${gNames[data.game] || "mini oyun"} oyununa davet etti!`,
          });
        }
        break;
      }

      // Sesli & Görüntülü Arama Sinyalleşmesi (WebRTC - Faz 3 + Push - Faz 6 + ICE Restart - Faz 7)
      case "call_offer":
      case "call_answer":
      case "call_ice":
      case "call_renegotiate":
      case "call_renegotiate_answer":
      case "call_end":
      case "call_reject":
      case "call_busy": {
        if (!to) break;
        rememberPeerRelation(from, to);
        const evPayload = data.type === "call_offer"
          ? { ...data, from, callerProfile: publicProfile(from) }
          : { ...data, from };
        const ok = sendToPin(to, evPayload, false);
        if (data.type === "call_offer") {
          console.log(`[WS] CALL_OFFER ${from}->${to} type=${data.callType} online=${ok}`);
          const isVid = data.callType === "video";
          const hasPush = !!(store.pushSubs[to] && store.pushSubs[to].length);
          const hasNative = !!(store.nativeTokens[to] && store.nativeTokens[to].length);
          sendPushToPin(to, {
            kind: "call",
            from,
            callType: isVid ? "video" : "voice",
            title: senderName(from),
            body: isVid ? "🎥 Görüntülü arıyor…" : "📞 Sesli arıyor…",
            pulse: 0,
          });
          if (!ok) {
            // Karşı taraf çevrimdışı olsa bile aramayı hemen kesme: 45 sn boyunca beklet, açarsa anında çalsın!
            pendingCalls.set(to, {
              offer: evPayload,
              ice: [],
              from,
              callType: isVid ? "video" : "voice",
              expiresAt: Date.now() + 45000,
            });
            if (hasPush || hasNative) {
              startCallRingPulses(to, from, isVid ? "video" : "voice");
            } else {
              sendJSON(ws, { type: "call_ringing_no_push", from: to });
            }
          } else if (hasPush || hasNative) {
            // Telefon ekranı kilitliyken WS geçici açık kalsa bile bildirim çalmaya devam etsin
            startCallRingPulses(to, from, isVid ? "video" : "voice");
          }
        } else if (data.type === "call_ice" && !ok && pendingCalls.has(to)) {
          pendingCalls.get(to).ice.push(evPayload);
        } else if (data.type === "call_end") {
          const pc = pendingCalls.get(to);
          if (pc) {
            // Karşı taraf açmadan kapandıysa çevrimdışı kuyruğuna cevapsız arama kaydı bırak
            sendToPin(
              to,
              {
                type: "msg",
                from,
                senderProfile: publicProfile(from),
                msg: {
                  id: "mc_" + Date.now().toString(36),
                  k: "c",
                  txt: pc.callType === "video" ? "📵 Cevapsız görüntülü arama" : "📵 Cevapsız sesli arama",
                },
              },
              true
            );
          }
          if (pc || activeRingPulses.has(to)) {
            clearPendingCall(to, true);
          }
          stopCallRingPulses(from, false);
        } else if (data.type === "call_answer" || data.type === "call_reject" || data.type === "call_busy") {
          clearPendingCall(from, false);
          stopCallRingPulses(to, false);
        }
        break;
      }

      case "push_test": {
        const subs = store.pushSubs[from] || [];
        const ntok = store.nativeTokens[from] || [];
        const count = subs.length + ntok.length;
        if (count > 0) {
          setTimeout(() => {
            sendPushToPin(from, {
              kind: "msg",
              from,
              title: "RetroChat Bildirim Testi 🔔",
              body: "Harika! Uygulama kapalıyken de mesaj ve aramalar bu şekilde gelecek.",
            });
          }, 2500);
        }
        sendJSON(ws, { type: "push_test_result", ok: count > 0, count });
        break;
      }

      case "ping": {
        sendJSON(ws, { type: "pong", ts: Date.now() });
        break;
      }
    }
  });

  ws.on("close", () => {
    if (ws.pin && clients.has(ws.pin)) {
      const set = clients.get(ws.pin);
      set.delete(ws);
      if (set.size === 0) {
        clients.delete(ws.pin);
        if (store.users[ws.pin]) {
          store.users[ws.pin].lastSeen = Date.now();
          scheduleSave();
        }
        broadcastPresence(ws.pin);
      }
    }
  });
});

// Bağlantı canlılık kontrolü (30 sn heartbeat)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`RetroChat server listening on port ${PORT}`);
});
