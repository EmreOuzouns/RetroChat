/* RetroChat Native Köprü Modülü (Capacitor iOS & Android)
 * - Android fiziksel geri tuşu yönetimi
 * - Uygulama ön/arka plan WebSocket yeniden bağlanma
 * - Push bildirim izni hazırlığı
 */
(function (global) {
  function initNative() {
    const Cap = global.Capacitor;
    if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;
    const Plugins = Cap.Plugins || {};

    // Android donanım geri tuşu
    if (Plugins.App && Plugins.App.addListener) {
      Plugins.App.addListener("backButton", () => {
        if (global.RetroCalls && global.RetroCalls.isActive()) {
          global.RetroCalls.minimize();
          return;
        }
        if (typeof global.androidBack === "function" && global.androidBack()) {
          return;
        }
        Plugins.App.minimizeApp ? Plugins.App.minimizeApp() : Plugins.App.exitApp();
      });

      // Uygulama arka plandan dönünce WebSocket bağlantısını tazele
      Plugins.App.addListener("appStateChange", ({ isActive }) => {
        if (isActive && global.RetroTransport && global.RetroTransport.isLive()) {
          global.RetroTransport.connect();
        }
      });
    }

    // Push bildirim izni & FCM/APNs token kaydı (Native Android/iOS VoIP hazır)
    if (Plugins.PushNotifications) {
      try {
        Plugins.PushNotifications.addListener("registration", (token) => {
          if (token && token.value && global.RetroTransport) {
            const plat = Cap.getPlatform ? Cap.getPlatform() : "native";
            global.RetroTransport.sendRaw({
              type: "native_push_register",
              token: token.value,
              platform: plat,
            });
          }
        });
        Plugins.PushNotifications.checkPermissions().then((res) => {
          if (res.receive === "prompt") {
            Plugins.PushNotifications.requestPermissions().then((r) => {
              if (r.receive === "granted") Plugins.PushNotifications.register();
            });
          } else if (res.receive === "granted") {
            Plugins.PushNotifications.register();
          }
        });
      } catch (e) {}
    }
  }

  /* ===== Uygulama İçi Güncelleme Kontrolü & İlerleme Çubuğu ===== */
  const VER_KEY = "rc_app_ver";
  let swReg = null;
  let latestInfo = null;
  let updating = false;

  function $(id) {
    return document.getElementById(id);
  }

  function setProgress(pct, stepText) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    if ($("updProg")) $("updProg").style.display = "block";
    if ($("updFill")) $("updFill").style.width = p + "%";
    if ($("updPct")) $("updPct").textContent = p + "%";
    if ($("updStep") && stepText) $("updStep").textContent = stepText;
  }

  function showUpdateBar(info) {
    latestInfo = info;
    const bar = $("updBar");
    if (!bar) return;
    const lbl = (info && info.label) ? " (" + info.label + ")" : "";
    if ($("updTxt")) $("updTxt").textContent = "✨ Yeni güncelleme hazır" + lbl + "!";
    if ($("updGo")) {
      $("updGo").disabled = false;
      $("updGo").textContent = "⬇ Güncelle";
    }
    bar.style.display = "block";
  }

  async function applyUpdate() {
    if (updating) return;
    updating = true;
    const btn = $("updGo");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Yükleniyor…";
    }
    setProgress(5, "Güncelleme paketi hazırlanıyor…");

    try {
      let info = latestInfo;
      if (!info) {
        const r = await fetch("/version?t=" + Date.now(), { cache: "no-store" });
        if (r.ok) info = await r.json();
      }
      const assets = (info && Array.isArray(info.assets) && info.assets.length)
        ? info.assets
        : ["/", "/index.html", "/css/style.css", "/js/app.js", "/js/transport.js", "/js/webrtc.js", "/js/push.js", "/js/requests.js", "/js/native.js"];

      const total = assets.length;
      let done = 0;
      for (const a of assets) {
        setProgress(8 + (done / total) * 76, `Güncel dosyalar indiriliyor (${done + 1}/${total})…`);
        try {
          await fetch(a + (a.includes("?") ? "&" : "?") + "_u=" + Date.now(), { cache: "reload" });
        } catch (e) {}
        done++;
      }

      setProgress(88, "Önbellek temizleniyor…");
      if ("caches" in global) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch (e) {}
      }

      setProgress(94, "Yeni sürüm etkinleştiriliyor…");
      if (swReg) {
        try { await swReg.update(); } catch (e) {}
        if (swReg.waiting) {
          try { swReg.waiting.postMessage({ type: "SKIP_WAITING" }); } catch (e) {}
        }
      }

      if (info && info.version) {
        try { localStorage.setItem(VER_KEY, info.version); } catch (e) {}
      }
      setProgress(100, "✓ Güncelleme tamamlandı! Yenileniyor…");
      setTimeout(() => location.reload(), 450);
    } catch (e) {
      updating = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Tekrar Dene";
      }
      setProgress(0, "Güncelleme indirilemedi, internetini kontrol et.");
    }
  }

  async function checkUpdate(manual) {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const r = await fetch("/version?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const info = await r.json();
      if (!info || !info.version) return;

      const sub = $("sUpdSub");
      if (sub) sub.textContent = "Mevcut sürüm: " + (info.label || info.version);

      let saved = null;
      try { saved = localStorage.getItem(VER_KEY); } catch (e) {}

      if (!saved) {
        // İlk kez bu güncelleyiciyle açılıyorsa mevcut sürümü kaydet
        try { localStorage.setItem(VER_KEY, info.version); } catch (e) {}
        if (manual) {
          if ($("set")) $("set").classList.remove("show");
          showUpdateBar(info);
          applyUpdate();
        }
        return;
      }

      if (saved !== info.version || (swReg && swReg.waiting)) {
        showUpdateBar(info);
        if (manual) {
          if ($("set")) $("set").classList.remove("show");
          applyUpdate();
        }
      } else if (manual) {
        if (typeof global.toast === "function") {
          global.toast("✓ Uygulaman en güncel sürümde (" + (info.label || info.version) + ")");
        }
      }
    } catch (e) {
      if (manual && typeof global.toast === "function") {
        global.toast("Güncelleme kontrol edilemedi");
      }
    }
  }

  function initUpdaterUI() {
    if ($("updGo")) $("updGo").onclick = applyUpdate;
    if ($("sUpdRow")) $("sUpdRow").onclick = () => checkUpdate(true);
    setTimeout(() => checkUpdate(false), 700);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !updating) checkUpdate(false);
    });
  }

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((reg) => {
      swReg = reg;
      try { reg.update(); } catch (e) {}
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            checkUpdate(false);
          }
        });
      });
    }).catch(() => {});
  }

  global.RetroUpdater = { check: checkUpdate, applyUpdate };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initNative();
      initUpdaterUI();
    });
  } else {
    initNative();
    initUpdaterUI();
  }
})(window);
