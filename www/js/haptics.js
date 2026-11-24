/* RetroChat Gerçek Titreşim (Haptics) Modülü
 * Öncelik sırası:
 * 1) Capacitor Native Haptics (iOS Taptic Engine & Android Vibrator)
 * 2) ReactNativeWebView köprüsü
 * 3) Web Vibration API (Android tarayıcılar)
 * 4) iOS Safari 18+ gizli switch dokunsal geri bildirim yedeği
 */
(function (global) {
  const NUDGE_PATTERN = [300, 100, 300, 100, 300, 100, 500];
  let hsw = null;

  function ensureIosSwitch() {
    if (hsw || !document.body) return hsw;
    hsw = document.createElement("label");
    hsw.style.cssText = "position:fixed;left:-99px;top:0;opacity:0;pointer-events:none";
    hsw.innerHTML = '<input type="checkbox" switch>';
    document.body.appendChild(hsw);
    return hsw;
  }

  function getCapHaptics() {
    return (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Haptics) || null;
  }

  function isNative() {
    return !!(
      (global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform()) ||
      global.ReactNativeWebView
    );
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function nudge(enabled) {
    if (!enabled) return;

    // 1. Capacitor Native (iOS + Android gerçek donanım titreşimi)
    const H = getCapHaptics();
    if (H) {
      try {
        for (let i = 0; i < 3; i++) {
          if (H.impact) H.impact({ style: "HEAVY" });
          if (H.vibrate) H.vibrate({ duration: 280 });
          await sleep(360);
        }
        if (H.notification) H.notification({ type: "WARNING" });
        if (H.vibrate) H.vibrate({ duration: 480 });
        return;
      } catch (e) {}
    }

    // 2. ReactNativeWebView köprüsü
    if (global.ReactNativeWebView) {
      try {
        global.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "vibrate", kind: "nudge", pattern: NUDGE_PATTERN })
        );
        return;
      } catch (e) {}
    }

    // 3. Web Vibration API (Android Chrome / WebView)
    if (navigator.vibrate) {
      try {
        navigator.vibrate(NUDGE_PATTERN);
        return;
      } catch (e) {}
    }

    // 4. iOS Safari 18+ switch haptic fallback
    const sw = ensureIosSwitch();
    if (sw) {
      let n = 0;
      const iv = setInterval(() => {
        try { sw.click(); } catch (e) {}
        if (++n >= 8) clearInterval(iv);
      }, 90);
    }
  }

  function notify(enabled) {
    if (!enabled) return;
    const H = getCapHaptics();
    if (H && H.notification) {
      try { H.notification({ type: "SUCCESS" }); return; } catch (e) {}
    }
    if (global.ReactNativeWebView) {
      try {
        global.ReactNativeWebView.postMessage(JSON.stringify({ type: "vibrate", kind: "notify", pattern: [120] }));
        return;
      } catch (e) {}
    }
    if (navigator.vibrate) {
      try { navigator.vibrate(120); } catch (e) {}
    }
  }

  function tap(enabled) {
    if (!enabled) return;
    const H = getCapHaptics();
    if (H && H.impact) {
      try { H.impact({ style: "LIGHT" }); return; } catch (e) {}
    }
    if (navigator.vibrate) {
      try { navigator.vibrate(25); } catch (e) {}
    }
  }

  function describeSupport() {
    if (getCapHaptics()) {
      return "Yerel donanım titreşimi aktif (iOS/Android Haptics). Titreşimler gerçek fiziksel olarak hissedilir.";
    }
    if (global.ReactNativeWebView) {
      return "Yerel uygulama titreşim köprüsü aktif.";
    }
    if (navigator.vibrate) {
      return "Bu cihaz titreşimi destekliyor. Sayfaya en az bir kez dokunmuş olman gerekir.";
    }
    return "Tarayıcı titreşim API'sini kısıtlıyor (iOS Safari). iOS 18+ hafif dokunsal geri bildirim denenir; iOS/Android uygulama paketinde tam donanım titreşimi çalışır.";
  }

  global.RetroHaptics = { nudge, notify, tap, describeSupport, isNative };
})(window);
