/* RetroChat İstemci Web Push & Uygulama İkonu Rozeti Modülü (Faz 6)
 * Uygulama kapalıyken mesaj, titreşim (Nudge) ve sesli/görüntülü arama bildirimleri.
 */
(function (global) {
  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const out = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
    return out;
  }

  function uint8Equal(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  let ctx = null;
  let subscribed = false;

  function isSupported() {
    return (
      typeof Notification !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in global &&
      /^https?:$/.test(location.protocol)
    );
  }

  function updateUI() {
    const bar = document.getElementById("pushBar");
    const btn = document.getElementById("sPushBtn");
    const note = document.getElementById("sPushNote");
    const testRow = document.getElementById("sPushTestRow");

    if (!isSupported()) {
      if (bar) bar.style.display = "none";
      if (btn) btn.style.display = "none";
      if (testRow) testRow.style.display = "none";
      const isCapNative = !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
      if (note) {
        note.textContent = isCapNative
          ? "Yerel uygulama bildirimleri cihaz ayarları üzerinden yönetilir. (Kapalı ekran push için PWA kurulumu veya Firebase FCM gerekir.)"
          : "iPhone'da arka plan bildirimleri için uygulamayı Safari → Paylaş → Ana Ekrana Ekle ile açman gerekir.";
      }
      return;
    }

    const perm = Notification.permission;
    if (perm === "granted" && subscribed) {
      if (bar) bar.style.display = "none";
      if (btn) btn.textContent = "🔔 Bildirimler Aktif";
      if (testRow) testRow.style.display = "flex";
      if (note) note.textContent = "Uygulama kapalıyken mesaj, titreşim ve gelen aramalar bildirim + titreşimle çalar.";
    } else if (perm === "denied") {
      if (bar) bar.style.display = "none";
      if (btn) btn.textContent = "🔕 İzin Engellendi";
      if (testRow) testRow.style.display = "none";
      if (note) note.textContent = "Tarayıcı/telefon ayarlarından RetroChat bildirim iznini açabilirsin.";
    } else {
      if (bar) bar.style.display = "flex";
      if (btn) btn.textContent = "🔔 Bildirimleri Aç";
      if (testRow) testRow.style.display = "none";
      if (note) note.textContent = "Uygulama kapalıyken mesaj ve aramaların çalması için izin ver.";
    }
  }

  async function subscribe(askPermission) {
    if (!isSupported()) {
      if (askPermission && ctx) ctx.toast("Bu tarayıcıda push bildirimi için Ana Ekrana Ekle gerekir");
      updateUI();
      return false;
    }

    let perm = Notification.permission;
    if (perm === "default" && askPermission) {
      perm = await Notification.requestPermission();
    }
    if (perm !== "granted") {
      updateUI();
      return false;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const r = await fetch("/push/vapid-public-key", { cache: "no-store" });
      if (!r.ok) return false;
      const { publicKey } = await r.json();
      if (!publicKey) return false;
      const expectedKey = urlBase64ToUint8Array(publicKey);

      let sub = await reg.pushManager.getSubscription();
      // VAPID anahtarı değiştiyse eski aboneliği temizleyip yenile
      if (sub && sub.options && sub.options.applicationServerKey) {
        const curKey = new Uint8Array(sub.options.applicationServerKey);
        if (!uint8Equal(curKey, expectedKey)) {
          try { await sub.unsubscribe(); } catch (e) {}
          sub = null;
        }
      }
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: expectedKey,
        });
      }

      if (global.RetroTransport && global.RetroTransport.isLive()) {
        global.RetroTransport.sendRaw({
          type: "push_subscribe",
          subscription: sub.toJSON ? sub.toJSON() : sub,
        });
      }
      subscribed = true;
      updateUI();
      if (askPermission && ctx) ctx.toast("🔔 Arka plan bildirimleri açıldı!");
      return true;
    } catch (e) {
      if (askPermission && ctx) ctx.toast("Bildirim aboneliği kurulamadı");
      updateUI();
      return false;
    }
  }

  async function sendTest() {
    const ok = await subscribe(true);
    if (!ok) return;
    if (global.RetroTransport && global.RetroTransport.isLive()) {
      global.RetroTransport.sendRaw({ type: "push_test" });
      if (ctx) ctx.toast("📨 3 sn içinde test bildirimi gelecek — ekranı kilitleyebilirsin!");
    } else if (ctx) {
      ctx.toast("Sunucuya bağlanılıyor, tekrar dene");
    }
  }

  function updateBadge(totalUnread) {
    try {
      if (navigator.setAppBadge) {
        if (totalUnread > 0) navigator.setAppBadge(totalUnread);
        else if (navigator.clearAppBadge) navigator.clearAppBadge();
      }
    } catch (e) {}
  }

  function handleCallLaunch(fromPin, autoAns) {
    if (!fromPin) return;
    if (ctx && ctx.openByPin) ctx.openByPin(fromPin);
    if (global.RetroCalls && global.RetroCalls.prepareIncoming) {
      global.RetroCalls.prepareIncoming(fromPin, !!autoAns);
    }
  }

  function init(options) {
    ctx = options;
    const bar = document.getElementById("pushBar");
    const btn = document.getElementById("sPushBtn");
    const testBtn = document.getElementById("sPushTest");
    if (bar) bar.onclick = () => subscribe(true);
    if (btn) btn.onclick = () => subscribe(true);
    if (testBtn) testBtn.onclick = () => sendTest();

    // Service Worker'dan gelen "open_chat" ve "open_call" mesajlarını yakala
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (ev) => {
        if (!ev.data) return;
        if (ev.data.type === "open_chat" && ev.data.from && ctx && ctx.openByPin) {
          ctx.openByPin(ev.data.from);
        } else if (ev.data.type === "open_call" && ev.data.from) {
          handleCallLaunch(ev.data.from, !!ev.data.auto);
        }
      });
    }

    // URL'de ?call=PIN&auto=1 veya ?chat=PIN varsa doğrudan aç
    try {
      const sp = new URLSearchParams(location.search);
      const callPin = sp.get("call");
      const autoAns = sp.get("auto") === "1";
      const chatPin = sp.get("chat");
      if (callPin) {
        setTimeout(() => handleCallLaunch(callPin, autoAns), 300);
        history.replaceState(null, "", location.pathname);
      } else if (chatPin && ctx && ctx.openByPin) {
        setTimeout(() => ctx.openByPin(chatPin), 400);
        history.replaceState(null, "", location.pathname);
      }
    } catch (e) {}

    updateUI();
  }

  global.RetroPush = {
    init,
    sync: () => subscribe(false),
    enable: () => subscribe(true),
    sendTest,
    updateBadge,
    updateUI,
  };
})(window);
