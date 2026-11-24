/* RetroChat QR Kod Oluşturma & Tarama Modülü
 * Klasik sürümden yeni mobil tasarıma entegre edilmiştir.
 * - PIN / QR Tara (Kamera + Görselden oku) / QR'ım sekmeleri
 * - Arkadaş ve kendi profilin için QR modalı
 */
(function (global) {
  function initQR(ctx) {
    const { $, getState, addFriend, showToast } = ctx;

    if (typeof qrcode !== "undefined" && qrcode.stringToBytesFuncs) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
    }

    function qrHTML(pin, name) {
      if (typeof qrcode === "undefined") {
        return '<div style="padding:16px;opacity:.7;font-size:13px">QR kütüphanesi çevrimdışı (internet bağlantısı gerekir)</div>';
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
    let raf = 0;

    function stopCam() {
      cancelAnimationFrame(raf);
      if (stream) {
        stream.getTracks().forEach((k) => k.stop());
        stream = null;
      }
    }

    function setMsg(text, ok) {
      $("aE").style.color = ok ? "#00e676" : "#ff6b8f";
      $("aE").textContent = text;
    }

    function onQR(txt) {
      const m = /^RC1\|([0-9A-Fa-f]{8})\|(.*)$/.exec((txt || "").trim());
      if (!m) return false;
      const nm = m[2] || "Yeni kişi";
      const err = addFriend(nm, m[1]);
      tab("P");
      if (err) {
        setMsg(err, false);
      } else {
        setMsg("✓ Kişi eklendi: " + nm, true);
        if (showToast) showToast("✓ Kişi eklendi: " + nm);
      }
      return true;
    }

    async function startCam() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        const v = $("vid");
        v.srcObject = stream;
        await v.play();
        const c = document.createElement("canvas");
        const x = c.getContext("2d", { willReadFrequently: true });
        const loop = () => {
          if (!stream) return;
          if (v.videoWidth && typeof jsQR !== "undefined") {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            x.drawImage(v, 0, 0);
            const r = jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
            if (r && onQR(r.data)) {
              stopCam();
              return;
            }
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        setMsg("Kamera açılamadı. 'Görselden oku' seçeneğini kullanabilirsin.", false);
      }
    }

    function tab(k) {
      ["P", "Q", "M", "G"].forEach((x) => {
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
    }

    $("tP").onclick = () => tab("P");
    $("tQ").onclick = () => tab("Q");
    $("tM").onclick = () => tab("M");
    if ($("tG")) $("tG").onclick = () => tab("G");
    $("qx").onclick = closeQR;
    $("qrm").onclick = (e) => {
      if (e.target.id === "qrm") closeQR();
    };
    $("aImg").onclick = () => $("qf").click();
    $("qf").onchange = (e) => {
      const fl = e.target.files[0];
      if (!fl) return;
      const im = new Image();
      im.onload = () => {
        const c = document.createElement("canvas");
        c.width = im.width;
        c.height = im.height;
        const x = c.getContext("2d");
        x.drawImage(im, 0, 0);
        const r =
          typeof jsQR !== "undefined" &&
          jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        if (!r || !onQR(r.data)) setMsg("QR kod okunamadı.", false);
      };
      im.src = URL.createObjectURL(fl);
      e.target.value = "";
    };

    return { showQR, closeQR, tab, stopCam, setMsg };
  }

  global.RetroQR = { initQR };
})(window);
