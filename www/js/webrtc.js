/* RetroChat WebRTC Gerçek Sesli & Görüntülü Arama Modülü (Faz 3 + Faz 7 TURN & ICE Restart)
 * - Sunucudan dinamik STUN + TURN listesi (/rtc/ice-servers) — 4G/5G katı NAT arkasında %100 bağlantı
 * - Wi-Fi <-> 4G/5G ağ geçişlerinde otomatik ICE Restart (kopmadan devam)
 */
(function (global) {
  const FALLBACK_ICE = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
        "turns:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];

  let cachedIce = null;
  let ctx = null;
  let pc = null;
  let localStream = null;
  let remoteStream = null;
  let pendingOffer = null;
  let pendingIce = [];
  let iceRestarting = false;
  let ringTimer = null;
  let state = null; // { pin, friend, type, dir, phase, reconnecting, start, timer, muted, camOff, facing, minimized }

  function $(id) {
    return document.getElementById(id);
  }

  function fmtT(ms) {
    const q = Math.floor(ms / 1000);
    return String(Math.floor(q / 60)).padStart(2, "0") + ":" + String(q % 60).padStart(2, "0");
  }

  async function loadIceServers() {
    if (cachedIce) return cachedIce;
    try {
      const base =
        global.RetroTransport && global.RetroTransport.getHttpBase
          ? global.RetroTransport.getHttpBase()
          : /^https?:$/.test(location.protocol)
          ? ""
          : "https://retrochat-server-production.up.railway.app";
      const r = await fetch(base + "/rtc/ice-servers", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.iceServers) && j.iceServers.length) {
          cachedIce = j.iceServers;
          return cachedIce;
        }
      }
    } catch (e) {}
    return FALLBACK_ICE;
  }

  async function resetCameraZoom(stream) {
    try {
      const vt = stream && stream.getVideoTracks && stream.getVideoTracks()[0];
      if (!vt || !vt.getCapabilities || !vt.applyConstraints) return;
      const caps = vt.getCapabilities();
      if (caps && caps.zoom && typeof caps.zoom.min === "number") {
        await vt.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
      }
    } catch (e) {}
  }

  async function boostVideoQuality(peer) {
    try {
      if (!peer || !peer.getSenders) return;
      const sender = peer.getSenders().find((s) => s.track && s.track.kind === "video");
      if (!sender || !sender.getParameters || !sender.setParameters) return;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = 2500000; // 2.5 Mbps HD
      params.encodings[0].maxFramerate = 30;
      params.degradationPreference = "maintain-resolution";
      await sender.setParameters(params);
    } catch (e) {}
  }

  async function getMedia(type, facing) {
    const constraints = {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video:
        type === "video"
          ? {
              facingMode: facing || "user",
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              frameRate: { ideal: 30, max: 30 },
            }
          : false,
    };
    const s = await navigator.mediaDevices.getUserMedia(constraints);
    if (type === "video") await resetCameraZoom(s);
    return s;
  }

  async function tryIceRestart() {
    if (!pc || !state || iceRestarting || state.phase === "ringing") return;
    if (pc.signalingState !== "stable") return;
    iceRestarting = true;
    state.reconnecting = true;
    updateUI();
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      global.RetroTransport.sendRaw({
        type: "call_renegotiate",
        to: state.pin,
        sdp: offer,
      });
    } catch (e) {}
    setTimeout(() => {
      iceRestarting = false;
    }, 3000);
  }

  async function createPeer(targetPin) {
    const iceServers = await loadIceServers();
    const peer = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 4,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });
    remoteStream = new MediaStream();

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        global.RetroTransport.sendRaw({
          type: "call_ice",
          to: targetPin,
          candidate: e.candidate,
        });
      }
    };

    peer.ontrack = (e) => {
      if (e.streams && e.streams[0]) {
        e.streams[0].getTracks().forEach((tr) => {
          if (!remoteStream.getTrackById(tr.id)) remoteStream.addTrack(tr);
        });
      } else if (e.track && !remoteStream.getTrackById(e.track.id)) {
        remoteStream.addTrack(e.track);
      }
      const rv = $("remVid");
      const ra = $("remAud");
      if (state && state.type === "video" && rv) {
        rv.srcObject = remoteStream;
        rv.play().catch(() => {});
      } else if (ra) {
        ra.srcObject = remoteStream;
        ra.play().catch(() => {});
      }
    };

    peer.oniceconnectionstatechange = () => {
      if (!state || pc !== peer) return;
      if (peer.iceConnectionState === "connected" || peer.iceConnectionState === "completed") {
        state.reconnecting = false;
        onConnected();
      } else if (peer.iceConnectionState === "disconnected") {
        state.reconnecting = true;
        updateUI();
        tryIceRestart();
      } else if (peer.iceConnectionState === "failed") {
        tryIceRestart();
      }
    };

    peer.onconnectionstatechange = () => {
      if (!state || pc !== peer) return;
      if (peer.connectionState === "connected") {
        state.reconnecting = false;
        onConnected();
      } else if (peer.connectionState === "disconnected") {
        state.reconnecting = true;
        updateUI();
        tryIceRestart();
        setTimeout(() => {
          if (pc === peer && (peer.connectionState === "failed" || peer.connectionState === "disconnected")) {
            cleanup(true, "Bağlantı koptu");
          }
        }, 12000);
      } else if (peer.connectionState === "failed") {
        tryIceRestart();
        setTimeout(() => {
          if (pc === peer && peer.connectionState === "failed") {
            cleanup(true, "Arama bağlantısı kurulamadı");
          }
        }, 7000);
      }
    };

    return peer;
  }

  function onConnected() {
    if (!state) return;
    clearTimeout(ringTimer);
    ringTimer = null;
    if (state.phase !== "active") {
      ctx.ringStop();
      state.phase = "active";
      state.start = Date.now();
      clearInterval(state.timer);
      state.timer = setInterval(updateUI, 1000);
    }
    state.reconnecting = false;
    if (state.type === "video" && pc) boostVideoQuality(pc);
    updateUI();
  }

  function updateUI() {
    const scr = $("callScr");
    const mini = $("cbar");
    if (!state) {
      if (scr) scr.classList.remove("show", "video", "voice", "incoming", "active");
      if (mini) mini.style.display = "none";
      return;
    }

    const f = state.friend;
    const isVid = state.type === "video";
    const dur = state.phase === "active" ? fmtT(Date.now() - state.start) : "";

    if (mini) {
      mini.style.display = "flex";
      mini.className = state.type;
      const statusTxt = state.reconnecting
        ? `${f.n} · Yeniden bağlanıyor…`
        : state.phase === "active"
        ? `${f.n} ile ${isVid ? "görüntülü" : "sesli"} görüşme · ${dur}`
        : state.phase === "connecting"
        ? `${f.n} · Bağlanıyor…`
        : state.dir === "in"
        ? `${f.n} arıyor…`
        : `${f.n} aranıyor…`;
      mini.innerHTML = `<span style="cursor:pointer" onclick="RetroCalls.maximize()">${isVid ? "🎥" : "📞"} ${ctx.esc(statusTxt)}</span><button onclick="RetroCalls.hangup()">Bitir</button>`;
    }

    if (!scr) return;
    scr.classList.toggle("show", !state.minimized);
    scr.classList.toggle("video", isVid);
    scr.classList.toggle("voice", !isVid);
    scr.classList.toggle("incoming", state.dir === "in" && state.phase === "ringing");
    scr.classList.toggle("active", state.phase === "active");

    $("callAv").innerHTML = ctx.avH(f);
    $("callName").textContent = f.n;
    $("callSub").textContent = state.reconnecting
      ? "Ağ değişti, yeniden bağlanıyor…"
      : state.phase === "active"
      ? (isVid ? "Görüntülü görüşme · " : "Sesli görüşme · ") + dur
      : state.phase === "connecting"
      ? "Bağlantı kuruluyor…"
      : state.dir === "in"
      ? isVid
        ? "Gelen görüntülü arama…"
        : "Gelen sesli arama…"
      : isVid
      ? "Görüntülü aranıyor…"
      : "Sesli aranıyor…";

    $("cMute").classList.toggle("off", state.muted);
    $("cCam").classList.toggle("off", state.camOff);
    $("cCam").style.display = isVid ? "" : "none";
    $("cFlip").style.display = isVid ? "" : "none";
    if ($("cFit")) $("cFit").style.display = isVid && state.phase === "active" ? "" : "none";
    $("locVid").style.display = isVid && !state.camOff ? "block" : "none";
    $("remVid").style.display = isVid && state.phase === "active" ? "block" : "none";
  }

  async function start(friend, type) {
    if (!friend) return;
    if (state) {
      if (state.pin === friend.pin && state.type === type) {
        maximize();
        return;
      }
      ctx.toast("Zaten aktif bir görüşmedesin");
      return;
    }

    try {
      localStream = await getMedia(type, "user");
    } catch (e) {
      ctx.toast(type === "video" ? "Kamera veya mikrofon izni gerekli" : "Mikrofon izni gerekli");
      return;
    }

    state = {
      pin: friend.pin,
      friend,
      type,
      dir: "out",
      phase: "ringing",
      reconnecting: false,
      start: 0,
      timer: null,
      muted: false,
      camOff: false,
      facing: "user",
      minimized: false,
    };
    pendingIce = [];

    const lv = $("locVid");
    if (lv && type === "video") {
      lv.srcObject = localStream;
      lv.play().catch(() => {});
    }

    pc = await createPeer(friend.pin);
    localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const st = ctx.getState();
    if (st.set.sound) ctx.ringPlay(type === "video" ? st.set.ringG : st.set.ringV, 12);

    global.RetroTransport.sendRaw({
      type: "call_offer",
      to: friend.pin,
      callType: type,
      sdp: offer,
    });

    clearTimeout(ringTimer);
    ringTimer = setTimeout(() => {
      if (state && state.pin === friend.pin && state.phase === "ringing") {
        global.RetroTransport.sendRaw({ type: "call_end", to: friend.pin });
        cleanup(true, friend.n + " cevap vermedi");
      }
    }, 40000);

    updateUI();
  }

  async function accept() {
    if (!state || state.dir !== "in" || !pendingOffer) return;
    ctx.ringStop();

    try {
      localStream = await getMedia(state.type, "user");
    } catch (e) {
      ctx.toast("Mikrofon/kamera izni reddedildi");
      reject();
      return;
    }

    const lv = $("locVid");
    if (lv && state.type === "video") {
      lv.srcObject = localStream;
      lv.play().catch(() => {});
    }

    pc = await createPeer(state.pin);
    localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));

    await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
    for (const c of pendingIce) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
    }
    pendingIce = [];
    pendingOffer = null;

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    global.RetroTransport.sendRaw({
      type: "call_answer",
      to: state.pin,
      sdp: answer,
    });

    state.phase = "connecting";
    updateUI();
    if (pc.connectionState === "connected" || pc.iceConnectionState === "connected") {
      onConnected();
    }
  }

  function reject() {
    if (!state) return;
    const pin = state.pin;
    const f = state.friend;
    const ty = state.type;
    global.RetroTransport.sendRaw({ type: "call_reject", to: pin });
    ctx.logCall(f, ty, "miss", 0, Date.now());
    cleanup(false);
  }

  function hangup() {
    if (!state) return;
    const pin = state.pin;
    global.RetroTransport.sendRaw({ type: "call_end", to: pin });
    cleanup(true);
  }

  function cleanup(recordLog, reasonMsg) {
    ctx.ringStop();
    clearTimeout(ringTimer);
    ringTimer = null;
    if (state) {
      clearInterval(state.timer);
      const dur = state.phase === "active" && state.start ? Date.now() - state.start : 0;
      if (recordLog) {
        if (dur > 0) {
          state.friend.h.push({
            k: "c",
            id: ctx.uid(),
            txt: `${state.type === "video" ? "🎥 Görüntülü" : "📞 Sesli"} görüşme sona erdi · ${fmtT(dur)}`,
            ts: Date.now(),
          });
          ctx.logCall(state.friend, state.type, state.dir, dur, state.start);
        } else {
          ctx.logCall(state.friend, state.type, state.dir === "out" ? "noans" : "miss", 0, Date.now());
        }
        ctx.save();
      }
    }

    if (pc) {
      try { pc.close(); } catch (e) {}
      pc = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    remoteStream = null;
    pendingOffer = null;
    pendingIce = [];
    iceRestarting = false;
    state = null;

    if ($("locVid")) $("locVid").srcObject = null;
    if ($("remVid")) $("remVid").srcObject = null;
    if ($("remAud")) $("remAud").srcObject = null;

    updateUI();
    ctx.renderMsgs();
    if (reasonMsg) ctx.toast(reasonMsg);
  }

  function toggleMute() {
    if (!state || !localStream) return;
    state.muted = !state.muted;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !state.muted));
    updateUI();
  }

  function toggleCam() {
    if (!state || !localStream || state.type !== "video") return;
    state.camOff = !state.camOff;
    localStream.getVideoTracks().forEach((t) => (t.enabled = !state.camOff));
    updateUI();
  }

  async function flipCam() {
    if (!state || !localStream || state.type !== "video" || !pc) return;
    state.facing = state.facing === "user" ? "environment" : "user";
    try {
      const ns = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: state.facing,
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      await resetCameraZoom(ns);
      const newTrack = ns.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) await sender.replaceTrack(newTrack);
      boostVideoQuality(pc);
      localStream.getVideoTracks().forEach((t) => {
        t.stop();
        localStream.removeTrack(t);
      });
      localStream.addTrack(newTrack);
      if ($("locVid")) $("locVid").srcObject = localStream;
    } catch (e) {
      ctx.toast("Kamera değiştirilemedi");
    }
  }

  function minimize() {
    if (!state) return;
    state.minimized = true;
    updateUI();
  }

  function maximize() {
    if (!state) return;
    state.minimized = false;
    updateUI();
  }

  async function handleEvent(ev) {
    const fromPin = ev.from;

    switch (ev.type) {
      case "call_offer": {
        if (state) {
          global.RetroTransport.sendRaw({ type: "call_busy", to: fromPin });
          return;
        }
        const f = ctx.ensureFriendByPin(fromPin);
        const ty = ev.callType === "video" ? "video" : "voice";
        state = {
          pin: fromPin,
          friend: f,
          type: ty,
          dir: "in",
          phase: "ringing",
          reconnecting: false,
          start: 0,
          timer: null,
          muted: false,
          camOff: false,
          facing: "user",
          minimized: false,
        };
        pendingOffer = ev.sdp;
        pendingIce = [];

        const st = ctx.getState();
        if (st.set.sound) ctx.ringPlay(ty === "video" ? st.set.ringG : st.set.ringV, 12);
        if (global.RetroHaptics) global.RetroHaptics.nudge(st.set.vib);
        updateUI();
        break;
      }

      case "call_answer": {
        if (!state || !pc || state.pin !== fromPin) return;
        clearTimeout(ringTimer);
        ringTimer = null;
        ctx.ringStop();
        await pc.setRemoteDescription(new RTCSessionDescription(ev.sdp));
        for (const c of pendingIce) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
        }
        pendingIce = [];
        if (state.phase === "ringing") {
          state.phase = "connecting";
          updateUI();
        }
        if (pc.connectionState === "connected" || pc.iceConnectionState === "connected") {
          onConnected();
        }
        break;
      }

      case "call_renegotiate": {
        if (!state || !pc || state.pin !== fromPin) return;
        try {
          if (pc.signalingState !== "stable") {
            // Glare çözümü: arayan (out) öncelikli, aranan (in) geri alıp kabul eder
            if (state.dir === "out") return;
            await pc.setLocalDescription({ type: "rollback" });
          }
          await pc.setRemoteDescription(new RTCSessionDescription(ev.sdp));
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          global.RetroTransport.sendRaw({
            type: "call_renegotiate_answer",
            to: fromPin,
            sdp: ans,
          });
        } catch (e) {}
        break;
      }

      case "call_renegotiate_answer": {
        if (!state || !pc || state.pin !== fromPin) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(ev.sdp));
        } catch (e) {}
        break;
      }

      case "call_ice": {
        if (!ev.candidate) return;
        if (pc && pc.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(ev.candidate)); } catch (e) {}
        } else {
          pendingIce.push(ev.candidate);
        }
        break;
      }

      case "call_end": {
        if (state && state.pin === fromPin) {
          cleanup(true, "Görüşme sonlandırıldı");
        }
        break;
      }

      case "call_reject": {
        if (state && state.pin === fromPin) {
          cleanup(true, state.friend.n + " aramayı reddetti");
        }
        break;
      }

      case "call_busy": {
        if (state && state.pin === fromPin) {
          cleanup(true, state.friend.n + " başka bir görüşmede");
        }
        break;
      }

      case "call_offline": {
        if (state && state.pin === fromPin) {
          cleanup(true, state.friend.n + " şu an çevrimdışı");
        }
        break;
      }
    }
  }

  function init(options) {
    ctx = options;
    $("cAcc").onclick = accept;
    $("cRej").onclick = reject;
    $("cEnd").onclick = hangup;
    $("cMute").onclick = toggleMute;
    $("cCam").onclick = toggleCam;
    $("cFlip").onclick = flipCam;
    $("cMin").onclick = minimize;
    if ($("cFit")) {
      $("cFit").onclick = () => {
        const rv = $("remVid");
        if (!rv) return;
        const filled = rv.classList.toggle("fill");
        $("cFit").textContent = filled ? "⊟" : "⛶";
        ctx.toast(filled ? "Ekranı doldur" : "Tam kadraj (zoom yok)");
      };
    }
    // Görüşme sırasında ağ değişirse (Wi-Fi <-> 4G/5G) ICE Restart dene
    global.addEventListener("online", () => {
      if (state && state.phase === "active") tryIceRestart();
    });
    // ICE listesini önceden önbelleğe al (arama açılışını hızlandırır)
    loadIceServers();
  }

  function isActive() {
    return !!state;
  }

  function getCallInfo() {
    if (!state) return null;
    return { pin: state.pin, type: state.type, active: state.phase === "active" };
  }

  global.RetroCalls = {
    init,
    start,
    accept,
    reject,
    hangup,
    minimize,
    maximize,
    syncBar: updateUI,
    getCallInfo,
    handleEvent,
    isActive,
  };
})(window);
