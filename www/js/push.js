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

    if (!isSupported()) {
      if (bar) bar.style.display = "none";
      if (btn) btn.style.display = "none";
      const isCapNative = !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
      if (note) {
        note.textContent = isCapNative
          ? "Yerel uygulama bildirimleri cihaz ayarları üzerinden yönetilir."
          : "iPhone'da arka plan bildirimleri için uygulamayı Safari → Paylaş → Ana Ekrana Ekle ile açman gerekir.";
      }
      return;
    }

    const perm = Notification.permission;
    if (perm === "granted" && subscribed) {
      if (bar) bar.style.display = "none";
      if (btn) btn.textContent = "🔔 Bildirimler Aktif";
      if (note) note.textContent = "Uygulama kapalıyken mesaj, titreşim ve aramalar bildirim olarak gelir.";
    } else if (perm === "denied") {
      if (bar) bar.style.display = "none";
      if (btn) btn.textContent = "🔕 İzin Engellendi";
      if (note) note.textContent = "Tarayıcı/telefon ayarlarından RetroChat bildirim iznini açabilirsin.";
    } else {
      if (bar) bar.style.display = "flex";
      if (btn) btn.textContent = "🔔 Bildirimleri Aç";
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
      const r = await fetch("/push/vapid-public-key");
      if (!r.ok) return false;
      const { publicKey } = await r.json();
      if (!publicKey) return false;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
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

  function updateBadge(totalUnread) {
    try {
      if (navigator.setAppBadge) {
        if (totalUnread > 0) navigator.setAppBadge(totalUnread);
        else if (navigator.clearAppBadge) navigator.clearAppBadge();
      }
    } catch (e) {}
  }

  function init(options) {
    ctx = options;
    const bar = document.getElementById("pushBar");
    const btn = document.getElementById("sPushBtn");
    if (bar) bar.onclick = () => subscribe(true);
    if (btn) btn.onclick = () => subscribe(true);

    // Service Worker'dan gelen "open_chat" mesajını yakala
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (ev) => {
        if (ev.data && ev.data.type === "open_chat" && ev.data.from && ctx && ctx.openByPin) {
          ctx.openByPin(ev.data.from);
        }
      });
    }

    // URL'de ?chat=PIN varsa doğrudan o sohbeti aç
    try {
      const chatPin = new URLSearchParams(location.search).get("chat");
      if (chatPin && ctx && ctx.openByPin) {
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
    updateBadge,
    updateUI,
  };
})(window);
