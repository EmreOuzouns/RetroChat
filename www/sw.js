/* RetroChat Service Worker — PWA + Arka Plan Web Push Bildirimleri (Mesaj, Nudge, Arama) */
const CACHE = "retrochat-v18";
const ASSETS = [
  "/",
  "/index.html",
  "/indir.html",
  "/manifest.json",
  "/css/style.css",
  "/js/haptics.js",
  "/js/crypto.js",
  "/js/transport.js",
  "/js/qr.js",
  "/js/webrtc.js",
  "/js/games.js",
  "/js/push.js",
  "/js/voice.js",
  "/js/groups.js",
  "/js/extras.js",
  "/js/requests.js",
  "/js/native.js",
  "/js/app.js",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/push/") || url.pathname.startsWith("/rtc/") || url.pathname.startsWith("/media/") || url.pathname === "/health" || url.pathname === "/version") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

/* ===== Arka Plan Push Bildirimleri (Uygulama Kapalıyken) ===== */
self.addEventListener("push", (e) => {
  let data = { kind: "msg", title: "RetroChat", body: "Yeni bildirim", from: "" };
  try {
    if (e.data) data = Object.assign(data, e.data.json());
  } catch (err) {
    if (e.data) data.body = e.data.text();
  }

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((winList) => {
      // Arama iptal edildiyse veya cevapsız kaldıysa çalan bildirimi kapat, cevapsız arama göster
      if (data.kind === "call_cancel") {
        return self.registration.getNotifications({ tag: "rc-call-" + data.from }).then((list) => {
          list.forEach((n) => n.close());
          const focused = winList.some((w) => w.focused && w.visibilityState === "visible");
          if (focused) return;
          return self.registration.showNotification(data.title || "RetroChat", {
            body: data.body || "📵 Cevapsız arama",
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            tag: "rc-miss-" + data.from,
            renotify: true,
            requireInteraction: false,
            vibrate: [140, 80, 140],
            data: { from: data.from || "", kind: "msg" },
          });
        });
      }

      // Uygulama şu an kullanıcı tarafından aktif/odaklı görüntüleniyorsa push spam'i yapma
      const focused = winList.some((w) => w.focused && w.visibilityState === "visible");
      if (focused && (data.kind !== "call" || (data.pulse && data.pulse > 0))) return;

      const isCall = data.kind === "call";
      const isNudge = data.kind === "nudge";

      const opts = {
        body: data.body || "Yeni mesaj",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: isCall ? "rc-call-" + data.from : isNudge ? "rc-nudge-" + data.from : data.kind === "friend_req" ? "rc-req" : "rc-msg-" + data.from,
        renotify: true,
        requireInteraction: isCall,
        silent: false,
        vibrate: isCall
          ? [600, 250, 600, 250, 600, 250, 600]
          : isNudge
          ? [300, 100, 300, 100, 300, 100, 500]
          : [180, 80, 180],
        data: { from: data.from || "", kind: data.kind || "msg", callType: data.callType || "voice" },
      };

      if (isCall) {
        opts.actions = [
          { action: "answer", title: "📞 Cevapla" },
          { action: "dismiss", title: "Reddet" },
        ];
      }

      return self.registration.showNotification(data.title || "RetroChat", opts);
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  if (e.action === "dismiss") return;

  const from = (e.notification.data && e.notification.data.from) || "";
  const kind = (e.notification.data && e.notification.data.kind) || "msg";
  const isReq = kind === "friend_req";
  const isCall = kind === "call";
  const autoAns = isCall && e.action === "answer";
  const targetUrl = isReq
    ? "/?requests=1"
    : isCall && from
    ? "/?call=" + encodeURIComponent(from) + "&auto=" + (autoAns ? "1" : "0")
    : from
    ? "/?chat=" + encodeURIComponent(from)
    : "/";

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((winList) => {
      for (const w of winList) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          w.postMessage(
            isReq
              ? { type: "open_requests" }
              : isCall
              ? { type: "open_call", from, auto: autoAns }
              : { type: "open_chat", from }
          );
          return w.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
