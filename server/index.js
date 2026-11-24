const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const WWW_DIR = path.resolve(__dirname, "..", "www");
const MAX_PAYLOAD = 35 * 1024 * 1024; // 35 MB (video/dosya için)

fs.mkdirSync(DATA_DIR, { recursive: true });

// Kalıcı depo: kullanıcı PIN + token + profil + çevrimdışı kuyruk
let store = {
  users: {}, // pin -> { token, profile: { name, status, stx, song, mus, emo, anim, photo, stxVis }, lastSeen }
  queue: {}, // toPin -> [ { ...event, queuedAt } ]
};

try {
  if (fs.existsSync(STORE_PATH)) {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    if (raw && typeof raw === "object") {
      store.users = raw.users || {};
      store.queue = raw.queue || {};
    }
  }
} catch (e) {
  console.error("Store load error:", e.message);
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(STORE_PATH, JSON.stringify(store), "utf8");
    } catch (e) {
      console.error("Store save error:", e.message);
    }
  }, 500);
}

// 24 saatten eski kuyruğa alınmış süreli mesajları temizle
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let changed = false;
  for (const pin of Object.keys(store.queue)) {
    const before = store.queue[pin].length;
    store.queue[pin] = store.queue[pin].filter(
      (ev) => !ev.timed || (ev.queuedAt || 0) > cutoff
    );
    if (store.queue[pin].length !== before) changed = true;
    if (!store.queue[pin].length) delete store.queue[pin];
  }
  if (changed) scheduleSave();
}, 60 * 1000);

// Aktif WebSocket bağlantıları: pin -> Set<ws>
const clients = new Map();

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
    lastSeen: u.lastSeen || Date.now(),
  };
}

function broadcastPresence(pin) {
  const prof = publicProfile(pin);
  if (!prof) return;
  const payload = { type: "presence", user: prof };
  // Tüm bağlı istemcilere bildir (küçük arkadaş grubu için hızlı ve basit)
  for (const [otherPin, set] of clients.entries()) {
    if (otherPin === pin) continue;
    for (const ws of set) sendJSON(ws, payload);
  }
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
};

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
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
        onlineUsers: clients.size,
        registeredPins: Object.keys(store.users).length,
        uptimeSec: Math.floor(process.uptime()),
      })
    );
  }

  // Statik www/ dosyalarını sun (hem tarayıcıdan test hem PWA için)
  let rel = urlPath === "/" ? "/index.html" : urlPath;
  const safePath = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(WWW_DIR, safePath);

  if (fullPath.startsWith(WWW_DIR) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    return fs.createReadStream(fullPath).pipe(res);
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD });

wss.on("connection", (ws) => {
  ws.pin = null;
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
        lastSeen: Date.now(),
      };
      scheduleSave();

      // Eski bağlantı varsa ayır
      if (ws.pin && clients.has(ws.pin)) {
        clients.get(ws.pin).delete(ws);
      }

      ws.pin = pin;
      if (!clients.has(pin)) clients.set(pin, new Set());
      clients.get(pin).add(ws);

      // Arkadaş listesinin güncel durumlarını döndür
      const friendPins = Array.isArray(data.friends) ? data.friends : [];
      const presences = friendPins
        .map((fp) => publicProfile(String(fp || "").toUpperCase()))
        .filter(Boolean);

      sendJSON(ws, { type: "auth_ok", pin, presences });
      broadcastPresence(pin);

      // Çevrimdışı kuyrukta bekleyen mesaj/olayları teslim et
      const pending = store.queue[pin];
      if (pending && pending.length) {
        delete store.queue[pin];
        scheduleSave();
        for (const ev of pending) {
          sendJSON(ws, ev);
          // Gönderene iletildi (st: 1) bildirimi
          if (ev.type === "msg" && ev.from && ev.msg && ev.msg.id) {
            sendToPin(ev.from, { type: "delivered", from: pin, msgId: ev.msg.id }, false);
          }
        }
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
          store.users[from].lastSeen = Date.now();
          scheduleSave();
          broadcastPresence(from);
        }
        break;
      }

      case "lookup_pin": {
        const target = String(data.pin || "").trim().toUpperCase();
        const prof = publicProfile(target);
        sendJSON(ws, { type: "lookup_result", pin: target, user: prof });
        break;
      }

      case "msg": {
        if (!to || !data.msg) break;
        const delivered = sendToPin(
          to,
          { type: "msg", from, msg: data.msg, timed: !!data.timed },
          true
        );
        if (delivered && data.msg.id) {
          sendJSON(ws, { type: "delivered", from: to, msgId: data.msg.id });
        }
        break;
      }

      case "nudge": {
        if (!to) break;
        sendToPin(to, { type: "nudge", from, at: Date.now() }, true);
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
        sendToPin(to, { type: "delete_for_all", from, msgId: data.msgId }, true);
        break;
      }

      case "media_opened": {
        if (!to || !data.msgId) break;
        sendToPin(to, { type: "media_opened", from, msgId: data.msgId }, true);
        break;
      }

      // Canlı Mini Oyunlar (XOX, Taş Kağıt Makas, Dört Bağla)
      case "game_invite":
      case "game_accept":
      case "game_decline":
      case "game_move":
      case "game_end": {
        if (!to) break;
        sendToPin(to, { ...data, from }, false);
        break;
      }

      // Sesli & Görüntülü Arama Sinyalleşmesi (WebRTC - Faz 3)
      case "call_offer":
      case "call_answer":
      case "call_ice":
      case "call_end":
      case "call_reject":
      case "call_busy": {
        if (!to) break;
        const ok = sendToPin(to, { ...data, from }, false);
        if (!ok && data.type === "call_offer") {
          sendJSON(ws, { type: "call_offline", from: to });
        }
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
