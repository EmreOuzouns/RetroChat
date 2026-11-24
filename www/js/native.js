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

    // Push bildirim izni (FCM / APNs yapılandırıldığında otomatik kayıt)
    if (Plugins.PushNotifications) {
      try {
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

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNative);
  } else {
    initNative();
  }
})(window);
