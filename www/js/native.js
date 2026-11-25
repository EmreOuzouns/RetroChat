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

  /* ===== Uygulama İçi Güncelleme Kontrolü & Gerçek Delta İlerleme Çubuğu ===== */
  const VER_KEY = "rc_app_ver";
  const HASH_KEY = "rc_file_hashes";
  let swReg = null;
  let latestInfo = null;
  let updating = false;

  function $(id) {
    return document.getElementById(id);
  }

  function fmtKB(bytes) {
    if (!bytes || bytes < 1024) return Math.max(1, bytes || 0) + " B";
    if (bytes < 1048576) return Math.round(bytes / 1024) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function loadHashes() {
    try { return JSON.parse(localStorage.getItem(HASH_KEY) || "{}") || {}; } catch (e) { return {}; }
  }

  function getChangedFiles(info) {
    const all = (info && Array.isArray(info.files)) ? info.files : [];
    const prev = loadHashes();
    const hasPrev = Object.keys(prev).length > 0;
    if (!hasPrev) return all;
    const diff = all.filter((f) => prev[f.path] !== f.hash);
    return diff.length ? diff : all.slice(0, 1);
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
    const changed = getChangedFiles(info);
    const totalBytes = changed.reduce((n, f) => n + (f.size || 0), 0);
    const lbl = (info && info.label) ? info.label : "yeni";
    const detail = changed.length ? ` · ${changed.length} bileşen, ${fmtKB(totalBytes)}` : "";
    if ($("updTxt")) $("updTxt").textContent = `✨ Güncelleme hazır (${lbl}${detail})`;
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
      btn.textContent = "İndiriliyor…";
    }
    setProgress(4, "Değişen dosyalar kontrol ediliyor…");

    try {
      let info = latestInfo;
      if (!info) {
        const r = await fetch("/version?t=" + Date.now(), { cache: "no-store" });
        if (r.ok) info = await r.json();
      }
      const files = getChangedFiles(info);
      const totalBytes = Math.max(1, files.reduce((n, f) => n + (f.size || 1024), 0));
      let loadedBytes = 0;

      for (const f of files) {
        const pct = 6 + (loadedBytes / totalBytes) * 78;
        setProgress(pct, `${f.name} indiriliyor · ${fmtKB(loadedBytes)} / ${fmtKB(totalBytes)}`);
        try {
          await fetch(f.url || f.path, { cache: "reload" });
        } catch (e) {}
        loadedBytes += (f.size || 1024);
      }

      setProgress(88, "Eski önbellek temizleniyor…");
      if ("caches" in global) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch (e) {}
      }

      setProgress(94, "Yeni sürüm kuruluyor…");
      if ("serviceWorker" in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        } catch (e) {}
      }

      if (info && info.version) {
        try {
          localStorage.setItem(VER_KEY, info.version);
          if (Array.isArray(info.files)) {
            const map = {};
            info.files.forEach((f) => { map[f.path] = f.hash; });
            localStorage.setItem(HASH_KEY, JSON.stringify(map));
          }
        } catch (e) {}
      }
      setProgress(100, `✓ ${fmtKB(totalBytes)} yüklendi! Uygulama yenileniyor…`);
      setTimeout(() => {
        location.replace(location.pathname + "?v=" + Date.now());
      }, 450);
    } catch (e) {
      updating = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Tekrar Dene";
      }
      setProgress(0, "Güncelleme indirilemedi, internetini kontrol et.");
    }
  }

  function getRunningVersion() {
    const m = document.querySelector('meta[name="rc-ver"]');
    return (m && m.getAttribute("content")) || "";
  }

  async function checkUpdate(manual) {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const r = await fetch("/version?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const info = await r.json();
      if (!info || !info.version) return;

      const running = getRunningVersion();
      const runLabel = running ? running.replace(/^retrochat-/, "") : "eski";
      const sub = $("sUpdSub");
      if (sub) {
        sub.textContent = running === info.version
          ? "Güncel sürüm: " + (info.label || info.version) + " ✓"
          : "Mevcut: " + runLabel + " → Yeni: " + (info.label || info.version);
      }

      if (running !== info.version) {
        showUpdateBar(info);
        if (manual) {
          if ($("set")) $("set").classList.remove("show");
          applyUpdate();
        }
      } else {
        if ($("updBar")) $("updBar").style.display = "none";
        // Güncel sürümdeyse dosya hash haritasını bir kez kaydet (sonraki sürümde sadece değişenler insin)
        if (Array.isArray(info.files) && Object.keys(loadHashes()).length === 0) {
          try {
            const map = {};
            info.files.forEach((f) => { map[f.path] = f.hash; });
            localStorage.setItem(HASH_KEY, JSON.stringify(map));
          } catch (e) {}
        }
        if (manual && typeof global.toast === "function") {
          global.toast("✓ Uygulaman zaten en güncel sürümde (" + (info.label || info.version) + ")");
        }
      }
    } catch (e) {
      if (manual && typeof global.toast === "function") {
        global.toast("Güncelleme kontrol edilemedi");
      }
    }
  }

  function initUpdaterUI() {
    try {
      const sp = new URLSearchParams(location.search);
      if (sp.has("v")) {
        sp.delete("v");
        const qs = sp.toString();
        history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
      }
    } catch (e) {}
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
