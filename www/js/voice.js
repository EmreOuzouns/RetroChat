/* RetroChat Sesli Mesaj (Voice Note) Modülü (Faz 8)
 * Android Chrome (audio/webm;codecs=opus) & iOS Safari (audio/mp4) tam uyumlu kayıt ve oynatma.
 */
(function (global) {
  let ctx = null;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startTs = 0;
  let timer = null;
  let recording = false;

  function $(id) {
    return document.getElementById(id);
  }

  function fmtSec(ms) {
    const s = Math.max(1, Math.round(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function pickMime() {
    if (typeof MediaRecorder === "undefined") return "";
    const list = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/aac",
      "audio/ogg;codecs=opus",
    ];
    for (const m of list) {
      try {
        if (MediaRecorder.isTypeSupported(m)) return m;
      } catch (e) {}
    }
    return "";
  }

  function updateRecUI() {
    const bar = $("vrec");
    const btn = $("micBtn");
    if (bar) bar.classList.toggle("show", recording);
    if (btn) btn.classList.toggle("rec", recording);
    if (recording && $("vrecT")) {
      $("vrecT").textContent = fmtSec(Date.now() - startTs);
    }
  }

  function stopTracks() {
    clearInterval(timer);
    timer = null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    recording = false;
    updateRecUI();
  }

  async function startRec() {
    if (recording) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      ctx.toast("Bu cihaz sesli mesaj kaydını desteklemiyor");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      ctx.toast("Sesli mesaj için mikrofon izni gerekli");
      return;
    }

    chunks = [];
    const mime = pickMime();
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) {
      recorder = new MediaRecorder(stream);
    }

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    startTs = Date.now();
    recording = true;
    if (global.RetroHaptics) global.RetroHaptics.tap(ctx.getState().set.vib);
    recorder.start(250);
    timer = setInterval(updateRecUI, 300);
    updateRecUI();
  }

  function cancelRec() {
    if (!recording) return;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      try { recorder.stop(); } catch (e) {}
    }
    chunks = [];
    stopTracks();
  }

  function finishRec() {
    if (!recording || !recorder) return;
    const dur = fmtSec(Date.now() - startTs);
    const mime = recorder.mimeType || "audio/webm";
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      chunks = [];
      stopTracks();
      if (blob.size < 400) return;
      if (blob.size > 8 * 1024 * 1024) {
        ctx.toast("Ses kaydı çok uzun (en fazla 8 MB)");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        ctx.onVoiceReady({ src: reader.result, dur, mime });
      };
      reader.readAsDataURL(blob);
    };
    try { recorder.stop(); } catch (e) { stopTracks(); }
  }

  function renderHTML(m) {
    const a = m.aud;
    if (!a || !a.src) return '<em style="opacity:.6">🎤 Sesli mesaj artık mevcut değil</em>';
    return `<div class="vmsg" onclick="event.stopPropagation()"><span>🎤</span><audio controls playsinline preload="metadata" src="${a.src}"></audio><small>${ctx.esc(a.dur || "")}</small></div>`;
  }

  function init(options) {
    ctx = options;
    const mic = $("micBtn");
    const ok = $("vrecOk");
    const no = $("vrecNo");
    if (mic) {
      mic.onclick = () => {
        if (recording) finishRec();
        else startRec();
      };
    }
    if (ok) ok.onclick = finishRec;
    if (no) no.onclick = cancelRec;
  }

  global.RetroVoice = { init, startRec, finishRec, cancelRec, renderHTML };
})(window);
