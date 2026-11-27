/* RetroChat QR Kod Oluşturma & Tarama Modülü (v29)
 * - Yerel qrcode.min.js & jsQR.min.js (CDN 404/çevrimdışı sorunu sıfır)
 * - Çift tarama motoru: Android Chrome yerleşik BarcodeDetector + 640px ölçekli jsQR (iOS & tüm tarayıcılar)
 * - Esnek format: RC1|PIN|AD, ham 8 haneli PIN veya metin içi PIN
 */
(function (global) {
  function initQR(ctx) {
    const { $, getState, addFriend, showToast } = ctx;

    if (typeof qrcode !== "undefined" && qrcode.stringToBytesFuncs) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
    }

    function qrHTML(pin, name) {
      if (typeof qrcode === "undefined") {
        return '<div style="padding:16px;opacity:.7;font-size:13px">QR kütüphanesi yüklenemedi</div>';
      }
      const q = qrcode(0, "M");
      q.addData("RC1|" + pin + "|" + (name || ""));
      q.make();
      const n = q.getModuleCount();
      let d = "";
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
        }
      }
      return `<svg viewBox="0 0 ${n + 4} ${n + 4}" width="220" height="220" style="background:#fff;border-radius:16px;padding:4px"><path d="${d}" fill="#000"/></svg>`;
    }

    function showQR(name, pin) {
      $("qt").textContent = name;
      $("qb").innerHTML = qrHTML(pin, name);
      $("qp").textContent = pin;
      $("qrm").style.display = "flex";
    }

    function closeQR() {
      $("qrm").style.display = "none";
    }

    let stream = null;
    let scanTimer = 0;
    let scanning = false;
    let detector = null;

    if (typeof global.BarcodeDetector !== "undefined") {
      try {
        detector = new global.BarcodeDetector({ formats: ["qr_code"] });
      } catch (e) {
        detector = null;
      }
    }

    function stopCam() {
      scanning = false;
      clearTimeout(scanTimer);
      scanTimer = 0;
      const v = $("vid");
      if (v) {
        try { v.pause(); } catch (e) {}
        v.srcObject = null;
      }
      if (stream) {
        stream.getTracks().forEach((k) => {
          try { k.stop(); } catch (e) {}
        });
        stream = null;
      }
    }

    function setMsg(text, ok) {
      $("aE").style.color = ok ? "#00e676" : "#ff6b8f";
      $("aE").textContent = text;
    }

    function parseQRText(txt) {
      const s = String(txt || "").trim();
      if (!s) return null;
      const m1 = /^RC1\|([0-9A-Fa-f]{8})\|(.*)$/.exec(s);
      if (m1) return { pin: m1[1].toUpperCase(), name: (m1[2] || "").trim() };
      const m2 = /^([0-9A-Fa-f]{8})$/.exec(s);
      if (m2) return { pin: m2[1].toUpperCase(), name: "" };
      const m3 = /(?:pin[=:\s]+)([0-9A-Fa-f]{8})\b/i.exec(s);
      if (m3) return { pin: m3[1].toUpperCase(), name: "" };
      return null;
    }

    function onQR(txt) {
      const parsed = parseQRText(txt);
      if (!parsed) return false;
      const nm = parsed.name || "Kişi " + parsed.pin.slice(-4);
      if (global.RetroHaptics) global.RetroHaptics.tap(getState().set.vib);
      stopCam();
      tab("P");
      if ($("aP")) $("aP").value = parsed.pin;
      const err = addFriend(nm, parsed.pin);
      if (err) {
        setMsg(err, false);
      } else {
        setMsg("✓ Ekleniyor: " + nm + " (" + parsed.pin + ")", true);
        if (showToast) showToast("📷 QR okundu: " + parsed.pin);
      }
      return true;
    }

    function decodeCanvasWithJsQR(canvas, ctx2d) {
      if (typeof jsQR === "undefined") return null;
      try {
        const img = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
        const r = jsQR(img.data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" });
        return r && r.data ? r.data : null;
      } catch (e) {
        return null;
      }
    }

    async function startCam() {
      stopCam();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMsg("Bu tarayıcıda kamera desteklenmiyor. 'Görselden oku' seçeneğini kullan.", false);
        return;
      }
      setMsg("Kamera açılıyor… QR kodu çerçeveye tut", true);

      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch (firstErr) {
          // Arka kamera constraint'i reddedilirse herhangi bir kamerayı aç
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        // Sürekli otomatik odaklama (destekleyen Android cihazlarda okuma hızını ciddi artırır)
        try {
          const track = stream.getVideoTracks()[0];
          const caps = track && track.getCapabilities ? track.getCapabilities() : null;
          if (caps && Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
            await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
          }
        } catch (e) {}

        const v = $("vid");
        v.setAttribute("playsinline", "");
        v.setAttribute("autoplay", "");
        v.muted = true;
        v.srcObject = stream;
        await v.play();

        setMsg("QR kodu kameraya göster…", true);
        scanning = true;

        const c = document.createElement("canvas");
        const x = c.getContext("2d", { willReadFrequently: true });

        const tick = async () => {
          if (!scanning || !stream) return;
          if (v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) {
            // 1) Yerleşik donanım hızlandırmalı BarcodeDetector (Android Chrome)
            if (detector) {
              try {
                const codes = await detector.detect(v);
                if (codes && codes.length) {
                  for (const item of codes) {
                    if (item.rawValue && onQR(item.rawValue)) return;
                  }
                }
              } catch (e) {}
            }

            // 2) jsQR yedek motoru (en fazla 640px genişliğe ölçekli — hızlı ve net)
            if (typeof jsQR !== "undefined") {
              const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
              c.width = Math.max(1, Math.round(v.videoWidth * scale));
              c.height = Math.max(1, Math.round(v.videoHeight * scale));
              x.drawImage(v, 0, 0, c.width, c.height);
              const val = decodeCanvasWithJsQR(c, x);
              if (val && onQR(val)) return;
            }
          }
          if (scanning) {
            scanTimer = setTimeout(tick, 140);
          }
        };

        tick();
      } catch (e) {
        stopCam();
        setMsg("Kamera izni verilmedi veya açılamadı. 'Görselden oku' seçeneğini kullanabilirsin.", false);
      }
    }

    function tab(k) {
      ["P", "Q", "M", "G", "R"].forEach((x) => {
        const vw = $("v" + x);
        if (vw) vw.style.display = x === k ? "block" : "none";
        const btn = $("t" + x);
        if (btn) btn.classList.toggle("on", x === k);
      });
      $("aOk").style.display = k === "P" ? "" : "none";
      $("aE").textContent = "";
      if (k !== "Q") stopCam();
      if (k === "Q") startCam();
      if (k === "M") {
        const st = getState();
        $("myqr").innerHTML = qrHTML(st.pin, st.set.name);
        $("myqp").textContent = st.pin;
      }
      if (k === "G" && global.RetroGroups) {
        global.RetroGroups.renderCreateUI();
      }
      if (k === "R" && global.RetroRequests) {
        global.RetroRequests.renderRequestsTab();
      }
      if (k === "P" && $("aMyPin")) {
        $("aMyPin").textContent = getState().pin;
      }
    }

    $("tP").onclick = () => tab("P");
    $("tQ").onclick = () => tab("Q");
    $("tM").onclick = () => tab("M");
    if ($("tG")) $("tG").onclick = () => tab("G");
    if ($("tR")) $("tR").onclick = () => tab("R");
    $("qx").onclick = closeQR;
    $("qrm").onclick = (e) => {
      if (e.target.id === "qrm") closeQR();
    };
    $("aImg").onclick = () => $("qf").click();
    $("qf").onchange = (e) => {
      const fl = e.target.files[0];
      if (!fl) return;
      const objUrl = URL.createObjectURL(fl);
      const im = new Image();
      im.onload = async () => {
        try {
          if (detector) {
            try {
              const codes = await detector.detect(im);
              if (codes && codes.length) {
                for (const item of codes) {
                  if (item.rawValue && onQR(item.rawValue)) return;
                }
              }
            } catch (err) {}
          }
          const scale = Math.min(1, 1000 / Math.max(im.width, im.height));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(im.width * scale));
          c.height = Math.max(1, Math.round(im.height * scale));
          const x = c.getContext("2d", { willReadFrequently: true });
          x.drawImage(im, 0, 0, c.width, c.height);
          const val = decodeCanvasWithJsQR(c, x);
          if (!val || !onQR(val)) {
            setMsg("Görselde geçerli bir RetroChat QR kodu bulunamadı.", false);
          }
        } finally {
          URL.revokeObjectURL(objUrl);
        }
      };
      im.onerror = () => {
        URL.revokeObjectURL(objUrl);
        setMsg("Görsel yüklenemedi.", false);
      };
      im.src = objUrl;
      e.target.value = "";
    };

    return { showQR, closeQR, tab, stopCam, setMsg };
  }

  global.RetroQR = { initQR };
})(window);
