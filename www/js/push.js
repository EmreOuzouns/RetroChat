/* RetroChat İstemci Web Push & Uygulama İkonu Rozeti Modülü (Faz 6 + v29 iOS Görünürlük Düzeltmesi)
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

  function isIOSDevice() {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isStandaloneMode() {
    return (
      (global.matchMedia && global.matchMedia("(display-mode: standalone)").matches) ||
      navigator.standalone === true
    );
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

  function openIOSGuide() {
    const m = document.getElementById("iosPushMod");
    if (m) {
      m.style.display = "flex";
    } else if (ctx) {
      ctx.toast("iPhone'da Safari → Paylaş (⬆️) → Ana Ekrana Ekle ile kurup aç!");
    }
  }

  function closeIOSGuide() {
    const m = document.getElementById("iosPushMod");
    if (m) m.style.display = "none";
  }

  function updateUI() {
    const bar = document.getElementById("pushBar");
    const btn = document.getElementById("sPushBtn");
    const note = document.getElementById("sPushNote");
    const testRow = document.getElementById("sPushTestRow");
    const ios = isIOSDevice();
    const standalone = isStandaloneMode();

    if (!isSupported()) {
      const isCapNative = !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
      if (testRow) testRow.style.display = "none";
      if (ios && !standalone && !isCapNative) {
        // iOS normal Safari sekmesi: Bildirimler kısmını GİZLEME, iPhone kurulum rehberi olarak göster!
        if (bar) {
          bar.style.display = "flex";
          bar.textContent = "🔔 iPhone Bildirimlerini Aç — Ana Ekrana Ekle (10 sn)";
        }
        if (btn) {
          btn.style.display = "";
          btn.textContent = "🔔 iPhone'da Nasıl Açılır?";
        }
        if (note) {
          note.textContent = "iPhone (iOS 16.4+) bildirimleri için Safari → Paylaş (⬆️) → Ana Ekrana Ekle ile ekleyip ana ekrandaki RetroChat ikonundan açman gerekir.";
        }
        return;
      }
      if (bar) bar.style.display = "none";
      if (btn) {
        btn.style.display = isCapNative ? "" : "none";
        if (isCapNative) btn.textContent = "🔔 Cihaz Bildirimleri";
      }
      if (note) {
        note.textContent = isCapNative
          ? "Yerel uygulama bildirimleri cihaz ayarları üzerinden yönetilir."
          : "Bu tarayıcı arka plan bildirimlerini desteklemiyor. Chrome veya Safari (Ana Ekrana Ekle) ile açabilirsin.";
      }
      return;
    }

    const perm = Notification.permission;
    if (bar) bar.textContent = "🔔 Bildirimleri Aç — kapalıyken mesaj, istek & arama gelsin";
    if (btn) btn.style.display = "";

    if (perm === "granted" && subscribed) {
      if (bar) bar.style.display = "none";
      if (btn) btn.textContent = "🔔 Bildirimler Aktif";
      if (testRow) testRow.style.display = "flex";
      if (note) note.textContent = "Uygulama kapalıyken mesaj, titreşim ve gelen aramalar bildirim + titreşimle çalar.";
    } else if (perm === "denied") {
      if (bar) bar.style.display = "none";
      if (btn) btn.textContent = "🔕 İzin Engellendi";
      if (testRow) testRow.style.display = "none";
      if (note) {
        note.textContent = ios
          ? "iPhone Ayarlar → Bildirimler → RetroChat bölümünden bildirimlere izin verebilirsin."
          : "Tarayıcı/telefon ayarlarından RetroChat bildirim iznini açabilirsin.";
      }
    } else {
      if (bar) bar.style.display = "flex";
      if (btn) btn.textContent = "🔔 Bildirimleri Aç";
      if (testRow) testRow.style.display = "none";
      if (note) note.textContent = "Uygulama kapalıyken mesaj ve aramaların çalması için izin ver.";
    }
  }

  async function subscribe(askPermission) {
    if (!isSupported()) {
      if (askPermission) {
        if (isIOSDevice() && !isStandaloneMode()) {
          openIOSGuide();
        } else if (ctx) {
          ctx.toast("Bu tarayıcıda push bildirimi için Ana Ekrana Ekle gerekir");
        }
      }
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
    const iosClose = document.getElementById("iosPushX");
    const iosMod = document.getElementById("iosPushMod");
    if (bar) bar.onclick = () => subscribe(true);
    if (btn) btn.onclick = () => subscribe(true);
    if (testBtn) testBtn.onclick = () => sendTest();
    if (iosClose) iosClose.onclick = closeIOSGuide;
    if (iosMod) iosMod.onclick = (e) => { if (e.target.id === "iosPushMod") closeIOSGuide(); };

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
    openIOSGuide,
    closeIOSGuide,
  };
})(window);
