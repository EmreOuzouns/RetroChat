/* RetroChat WebRTC Gerçek Sesli & Görüntülü Arama Modülü (Faz 3)
 * Sinyalleşme: Railway WebSocket (call_offer, call_answer, call_ice, call_end, call_reject, call_busy, call_offline)
 */
(function (global) {
  const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];

  let ctx = null;
  let pc = null;
  let localStream = null;
  let remoteStream = null;
  let pendingOffer = null;
  let pendingIce = [];
  let state = null; // { pin, friend, type: 'voice'|'video', dir: 'out'|'in', phase: 'ringing'|'active', start: 0, timer: null, muted: false, camOff: false, facing: 'user', minimized: false }

  function $(id) {
    return document.getElementById(id);
  }

  function fmtT(ms) {
    const q = Math.floor(ms / 1000);
    return String(Math.floor(q / 60)).padStart(2, "0") + ":" + String(q % 60).padStart(2, "0");
  }

  async function getMedia(type, facing) {
    const constraints = {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: type === "video" ? { facingMode: facing || "user", width: { ideal: 720 }, height: { ideal: 1280 } } : false,
    };
    return await navigator.mediaDevices.getUserMedia(constraints);
  }

  function createPeer(targetPin) {
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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
        e.streams[0].getTracks().forEach((tr) => remoteStream.addTrack(tr));
      } else if (e.track) {
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

    peer.onconnectionstatechange = () => {
      if (!state) return;
      if (peer.connectionState === "connected") {
        onConnected();
      } else if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
        setTimeout(() => {
          if (pc === peer && (peer.connectionState === "failed" || peer.connectionState === "disconnected")) {
            cleanup(true, "Bağlantı koptu");
          }
        }, 4000);
      }
    };

    return peer;
  }

  function onConnected() {
    if (!state || state.phase === "active") return;
    ctx.ringStop();
    state.phase = "active";
    state.start = Date.now();
    clearInterval(state.timer);
    state.timer = setInterval(updateUI, 1000);
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

    // Üst sohbet barı (küçültüldüğünde veya aktifken)
    if (mini) {
      mini.style.display = "flex";
      mini.className = state.type;
      const statusTxt =
        state.phase === "active"
          ? `${f.n} ile ${isVid ? "görüntülü" : "sesli"} görüşme · ${dur}`
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
    $("callSub").textContent =
      state.phase === "active"
        ? (isVid ? "Görüntülü görüşme · " : "Sesli görüşme · ") + dur
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

    pc = createPeer(friend.pin);
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

    pc = createPeer(state.pin);
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

    onConnected();
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
        video: { facingMode: state.facing },
      });
      const newTrack = ns.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) await sender.replaceTrack(newTrack);
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
        await pc.setRemoteDescription(new RTCSessionDescription(ev.sdp));
        for (const c of pendingIce) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
        }
        pendingIce = [];
        onConnected();
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
  }

  function isActive() {
    return !!state;
  }

  global.RetroCalls = {
    init,
    start,
    accept,
    reject,
    hangup,
    minimize,
    maximize,
    handleEvent,
    isActive,
  };
})(window);
