/* RetroChat WebRTC Gerçek Sesli & Görüntülü Arama Modülü (v30 — Çift Yönlü Ses & Unified Plan Düzeltmesi)
 * - Unified Plan doğru sıra: cevaplayan tarafta önce setRemoteDescription, sonra mevcut transceiver'lara track bağlama (recvonly/tek yönlü ses hatasını tamamen çözer)
 * - Uzak ses her zaman #callScr dışındaki bağımsız <audio id="remAud"> üzerinden çalar (video gizliyken/küçültülünce ses kesilmez), #remVid sessiz (muted) çalışır
 * - Kullanıcı dokunuşu anında (await öncesi) ses kilidi açma + autoplay engellenirse ekranda tek dokunuş "Sesi Aç" kurtarma
 * - ICE aday sıralama tamponu (call_ice asla call_offer'dan önce silinmez) + asimetrik ICE Restart + getStats ses bekçisi
 */
(function (global) {
  const FALLBACK_ICE = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.relay.metered.ca:80" },
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

  // 1 sample sessiz WAV — kullanıcı dokunuşu anında iOS/Android <audio> autoplay kilidini açmak için
  const SILENT_WAV =
    "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

  let cachedIce = null;
  let ctx = null;
  let pc = null;
  let localStream = null;
  let remoteAudioStream = null;
  let remoteVideoStream = null;
  let pendingOffer = null;
  let pendingIceByPin = {};
  let outboundIce = [];
  let signalingSent = false;
  let iceRestarting = false;
  let calleeRestartTimer = null;
  let statsTimer = null;
  let statsZeroInCount = 0;
  let statsZeroOutCount = 0;
  let lastInBytes = -1;
  let lastOutBytes = -1;
  let audioBlocked = false;
  let ringTimer = null;
  let incVibTimer = null;
  let autoAnswerPin = null;
  let autoAnswerUntil = 0;
  let state = null; // { pin, friend, type, dir, phase, reconnecting, start, timer, muted, camOff, speaker, facing, minimized }

  function $(id) {
    return document.getElementById(id);
  }

  function fmtT(ms) {
    const q = Math.floor(ms / 1000);
    return String(Math.floor(q / 60)).padStart(2, "0") + ":" + String(q % 60).padStart(2, "0");
  }

  // Kullanıcı tıklama anında (HERHANGİ BİR await'ten ÖNCE!) <audio> elementini uyandır
  function primeAudioGesture() {
    const ra = $("remAud");
    if (!ra) return;
    try {
      ra.muted = false;
      ra.volume = 1.0;
      if (!ra.srcObject) {
        ra.src = SILENT_WAV;
        const p = ra.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            if (!ra.srcObject) {
              try { ra.pause(); } catch (e) {}
              ra.removeAttribute("src");
            }
          }).catch(() => {});
        }
      } else {
        ra.play().catch(() => {});
      }
    } catch (e) {}
  }

  function showUnlockBanner(show) {
    audioBlocked = !!show;
    const btn = $("cUnlockAud");
    if (btn) btn.style.display = audioBlocked && state ? "inline-flex" : "none";
  }

  function playRemoteMedia() {
    const ra = $("remAud");
    const rv = $("remVid");

    if (ra && remoteAudioStream && remoteAudioStream.getAudioTracks().length > 0) {
      ra.muted = false;
      ra.volume = state && state.speaker === false ? 0.55 : 1.0;
      if (ra.srcObject !== remoteAudioStream) {
        ra.removeAttribute("src");
        ra.srcObject = remoteAudioStream;
      }
      const tryPlay = () => {
        const p = ra.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            showUnlockBanner(false);
          }).catch((err) => {
            if (err && err.name === "NotAllowedError") {
              showUnlockBanner(true);
            } else {
              // Geçici kesinti (AbortError vb.) — kısa süre sonra tekrar dene
              setTimeout(() => {
                if (state && ra.srcObject === remoteAudioStream && ra.paused) {
                  ra.play().then(() => showUnlockBanner(false)).catch(() => showUnlockBanner(true));
                }
              }, 350);
            }
          });
        }
      };
      tryPlay();
    }

    if (rv && state && state.type === "video" && remoteVideoStream && remoteVideoStream.getVideoTracks().length > 0) {
      rv.muted = true; // Ses yalnızca #remAud'dan gelir (çift ses/yankı ve display:none kesilmesi önlenir)
      if (rv.srcObject !== remoteVideoStream) {
        rv.srcObject = remoteVideoStream;
      }
      rv.play().catch(() => {});
    }
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
      params.encodings[0].maxBitrate = 2500000;
      params.encodings[0].maxFramerate = 30;
      params.degradationPreference = "maintain-resolution";
      await sender.setParameters(params);
    } catch (e) {}
  }

  async function getMedia(type, facing) {
    const audioIdeal = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    const videoIdeal =
      type === "video"
        ? {
            facingMode: facing || "user",
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 },
          }
        : false;

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioIdeal, video: videoIdeal });
    } catch (e1) {
      // Kısıtlamalar desteklenmezse temel ses/video ile geri düş
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === "video" ? { facingMode: facing || "user" } : false,
        });
      } catch (e2) {
        if (type === "video") {
          // Kamera açılamazsa en azından sesli devam etmeyi dene
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          ctx.toast("Kamera açılamadı, sesli bağlanılıyor");
        } else {
          throw e2;
        }
      }
    }
    if (stream) {
      stream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
      if (type === "video") await resetCameraZoom(stream);
    }
    return stream;
  }

  // Birleştirilmiş (Unified Plan) güvenli track bağlama:
  // Answerer'da setRemoteDescription SONRASINDA mevcut transceiver'lara replaceTrack + direction="sendrecv" yapar.
  async function attachLocalTracks(peer, stream, isAnswerer) {
    if (!peer || !stream) return;
    const tracks = stream.getTracks();
    const transceivers = peer.getTransceivers ? peer.getTransceivers() : [];

    for (const tr of tracks) {
      tr.enabled = tr.kind === "audio" ? !(state && state.muted) : !(state && state.camOff);
      if (isAnswerer && transceivers.length) {
        const match = transceivers.find(
          (tc) =>
            tc &&
            tc.receiver &&
            tc.receiver.track &&
            tc.receiver.track.kind === tr.kind &&
            (!tc.sender || !tc.sender.track)
        );
        if (match && match.sender && match.sender.replaceTrack) {
          await match.sender.replaceTrack(tr);
          try {
            match.direction = "sendrecv";
          } catch (e) {}
          continue;
        }
      }
      peer.addTrack(tr, stream);
    }

    // Her ses/video transceiver'ının yanlışlıkla recvonly/inactive kalmadığından emin ol
    if (peer.getTransceivers) {
      peer.getTransceivers().forEach((tc) => {
        if (!tc || !tc.sender || !tc.sender.track) return;
        if (tc.direction === "recvonly" || tc.direction === "inactive") {
          try {
            tc.direction = "sendrecv";
          } catch (e) {}
        }
      });
    }
  }

  function flushOutboundIce(targetPin) {
    signalingSent = true;
    while (outboundIce.length) {
      const cand = outboundIce.shift();
      global.RetroTransport.sendRaw({
        type: "call_ice",
        to: targetPin,
        candidate: cand,
      });
    }
  }

  async function drainPendingIce(peer, fromPin) {
    const list = pendingIceByPin[fromPin] || [];
    delete pendingIceByPin[fromPin];
    for (const c of list) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {}
    }
  }

  async function tryIceRestart(force) {
    if (!pc || !state || iceRestarting || state.phase === "ringing") return;
    if (pc.signalingState !== "stable") return;
    // Glare önleme: arayan hemen başlatır, aranan kısa süre bekler (force değilse)
    if (!force && state.dir === "in") {
      clearTimeout(calleeRestartTimer);
      calleeRestartTimer = setTimeout(() => {
        if (
          pc &&
          state &&
          state.phase !== "ringing" &&
          (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed")
        ) {
          tryIceRestart(true);
        }
      }, 2500);
      return;
    }
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
    }, 3500);
  }

  // Canlı ses akışı bekçisi: Tek yönlü ses (0 inbound veya 0 outbound) olursa otomatik kurtarır
  function startStatsWatchdog() {
    stopStatsWatchdog();
    statsZeroInCount = 0;
    statsZeroOutCount = 0;
    lastInBytes = -1;
    lastOutBytes = -1;

    statsTimer = setInterval(async () => {
      if (!pc || !state || state.phase !== "active") return;
      try {
        const stats = await pc.getStats();
        let inBytes = 0;
        let outBytes = 0;
        stats.forEach((rep) => {
          if (rep.type === "inbound-rtp" && (rep.kind === "audio" || rep.mediaType === "audio")) {
            inBytes += rep.bytesReceived || 0;
          }
          if (rep.type === "outbound-rtp" && (rep.kind === "audio" || rep.mediaType === "audio")) {
            outBytes += rep.bytesSent || 0;
          }
        });

        // 1) Karşıdan ses paketi geliyor ama <audio> duraklamışsa yeniden başlat
        const ra = $("remAud");
        if (inBytes > 0 && ra && ra.paused && remoteAudioStream && remoteAudioStream.getAudioTracks().length) {
          playRemoteMedia();
        }

        // 2) Karşıdan hiç ses paketi gelmiyorsa -> 2 döngü (8sn) sonra tek seferlik ICE restart dene
        if (lastInBytes >= 0 && inBytes <= lastInBytes) {
          statsZeroInCount++;
          if (statsZeroInCount === 2) {
            playRemoteMedia();
            tryIceRestart(state.dir === "out");
          }
        } else {
          statsZeroInCount = 0;
        }
        lastInBytes = inBytes;

        // 3) Kendi mikrofonumuz açık olmasına rağmen 0 byte gidiyorsa -> track ölmüş mü kontrol et ve yenile
        if (!state.muted && lastOutBytes >= 0 && outBytes <= lastOutBytes) {
          statsZeroOutCount++;
          if (statsZeroOutCount === 2) {
            const curAud = localStream && localStream.getAudioTracks()[0];
            if (!curAud || curAud.readyState === "ended") {
              try {
                const fresh = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                const newTr = fresh.getAudioTracks()[0];
                if (newTr && pc) {
                  newTr.enabled = !state.muted;
                  const sender = pc.getSenders().find((s) => s.track && s.track.kind === "audio") ||
                    (pc.getTransceivers().find((tc) => tc.receiver && tc.receiver.track && tc.receiver.track.kind === "audio") || {}).sender;
                  if (sender && sender.replaceTrack) {
                    await sender.replaceTrack(newTr);
                    if (localStream) {
                      localStream.getAudioTracks().forEach((old) => localStream.removeTrack(old));
                      localStream.addTrack(newTr);
                    }
                  }
                }
              } catch (e) {}
            } else if (!curAud.enabled) {
              curAud.enabled = true;
            }
          }
        } else {
          statsZeroOutCount = 0;
        }
        lastOutBytes = outBytes;
      } catch (e) {}
    }, 4000);
  }

  function stopStatsWatchdog() {
    clearInterval(statsTimer);
    statsTimer = null;
  }

  async function createPeer(targetPin) {
    const iceServers = await loadIceServers();
    const peer = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 4,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });
    remoteAudioStream = new MediaStream();
    remoteVideoStream = new MediaStream();
    outboundIce = [];
    signalingSent = false;

    peer.onicecandidate = (e) => {
      if (!e.candidate) return;
      if (signalingSent) {
        global.RetroTransport.sendRaw({
          type: "call_ice",
          to: targetPin,
          candidate: e.candidate,
        });
      } else {
        outboundIce.push(e.candidate);
      }
    };

    peer.ontrack = (e) => {
      const tracks = [];
      if (e.track) tracks.push(e.track);
      if (e.streams && e.streams[0]) {
        e.streams[0].getTracks().forEach((tr) => {
          if (!tracks.includes(tr)) tracks.push(tr);
        });
      }

      let audioAdded = false;
      let videoAdded = false;

      tracks.forEach((tr) => {
        if (tr.kind === "audio") {
          if (!remoteAudioStream.getTrackById(tr.id)) {
            remoteAudioStream.addTrack(tr);
            audioAdded = true;
          }
          // WebKit/Safari track onunmute olunca sesi hemen tetikle
          tr.onunmute = () => {
            if (pc === peer) playRemoteMedia();
          };
        } else if (tr.kind === "video") {
          if (!remoteVideoStream.getTrackById(tr.id)) {
            remoteVideoStream.addTrack(tr);
            videoAdded = true;
          }
          tr.onunmute = () => {
            if (pc === peer) playRemoteMedia();
          };
        }
      });

      // iOS Safari'de mevcut MediaStream'e yeni audio track eklendiğinde yeni referans oluştur ki playRemoteMedia() tazelemiş olsun
      if (audioAdded) {
        remoteAudioStream = new MediaStream(remoteAudioStream.getAudioTracks());
      }
      if (videoAdded) {
        remoteVideoStream = new MediaStream(remoteVideoStream.getVideoTracks());
      }

      playRemoteMedia();
    };

    peer.oniceconnectionstatechange = () => {
      if (!state || pc !== peer) return;
      if (peer.iceConnectionState === "connected" || peer.iceConnectionState === "completed") {
        clearTimeout(calleeRestartTimer);
        state.reconnecting = false;
        onConnected();
      } else if (peer.iceConnectionState === "disconnected") {
        state.reconnecting = true;
        updateUI();
        tryIceRestart(false);
      } else if (peer.iceConnectionState === "failed") {
        tryIceRestart(true);
      }
    };

    peer.onconnectionstatechange = () => {
      if (!state || pc !== peer) return;
      if (peer.connectionState === "connected") {
        clearTimeout(calleeRestartTimer);
        state.reconnecting = false;
        onConnected();
      } else if (peer.connectionState === "disconnected") {
        state.reconnecting = true;
        updateUI();
        tryIceRestart(false);
        setTimeout(() => {
          if (pc === peer && (peer.connectionState === "failed" || peer.connectionState === "disconnected")) {
            cleanup(true, "Bağlantı koptu");
          }
        }, 14000);
      } else if (peer.connectionState === "failed") {
        tryIceRestart(true);
        setTimeout(() => {
          if (pc === peer && peer.connectionState === "failed") {
            cleanup(true, "Arama bağlantısı kurulamadı");
          }
        }, 8000);
      }
    };

    return peer;
  }

  function onConnected() {
    if (!state) return;
    clearTimeout(ringTimer);
    ringTimer = null;
    clearInterval(incVibTimer);
    incVibTimer = null;
    if (state.phase !== "active") {
      ctx.ringStop(true);
      state.phase = "active";
      state.start = Date.now();
      clearInterval(state.timer);
      state.timer = setInterval(updateUI, 1000);
      startStatsWatchdog();
    }
    state.reconnecting = false;
    if (state.type === "video" && pc) boostVideoQuality(pc);
    updateUI();
    // Bağlantı aktif olduğunda (#remVid görünür olduğunda) ses & video oynatmayı garantiye al
    playRemoteMedia();
  }

  function updateUI() {
    if (!ctx) return;
    const scr = $("callScr");
    const mini = $("cbar");
    if (!state) {
      if (scr) {
        scr.classList.remove("show", "video", "voice", "incoming", "active");
        scr.style.display = "none";
      }
      if (mini) mini.style.display = "none";
      showUnlockBanner(false);
      return;
    }

    const f = state.friend;
    const isVid = state.type === "video";
    const dur = state.phase === "active" ? fmtT(Date.now() - state.start) : "";

    if (mini) {
      if (state.minimized) {
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
      } else {
        mini.style.display = "none";
      }
    }

    if (!scr) return;
    scr.classList.toggle("show", !state.minimized);
    scr.style.display = state.minimized ? "none" : "flex";
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
      : state.noPush
      ? "Çevrimdışı · Karşı tarafın bildirimi kapalı (açınca çalar)"
      : isVid
      ? "Görüntülü aranıyor…"
      : "Sesli aranıyor…";

    $("cMute").classList.toggle("off", state.muted);
    $("cCam").classList.toggle("off", state.camOff);
    if ($("cSpk")) $("cSpk").classList.toggle("off", state.speaker !== false);
    $("cCam").style.display = isVid ? "" : "none";
    $("cFlip").style.display = isVid ? "" : "none";
    if ($("cChat")) $("cChat").style.display = isVid ? "none" : "";
    if ($("cFit")) $("cFit").style.display = isVid && state.phase === "active" ? "" : "none";
    $("locVid").style.display = isVid && !state.camOff ? "block" : "none";
    $("locVid").classList.toggle("back", state.facing === "environment");
    $("remVid").style.display = isVid && state.phase === "active" ? "block" : "none";
    showUnlockBanner(audioBlocked);
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

    // KRİTİK: Kullanıcı tıklama jesti içindeyken (await'ten önce!) ses elementinin kilidini aç
    primeAudioGesture();

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
      speaker: true,
      facing: "user",
      minimized: false,
    };
    delete pendingIceByPin[friend.pin];
    updateUI();

    try {
      localStream = await getMedia(type, "user");
    } catch (e) {
      cleanup(false, type === "video" ? "Kamera veya mikrofon izni gerekli" : "Mikrofon izni gerekli");
      return;
    }
    if (!state || state.pin !== friend.pin) {
      if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
      return;
    }

    const lv = $("locVid");
    if (lv && type === "video") {
      lv.muted = true;
      lv.srcObject = localStream;
      lv.play().catch(() => {});
    }

    pc = await createPeer(friend.pin);
    await attachLocalTracks(pc, localStream, false);

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: type === "video",
    });
    await pc.setLocalDescription(offer);

    const st = ctx.getState();
    if (st.set.sound) ctx.ringPlay(type === "video" ? st.set.ringG : st.set.ringV, 12);

    // Önce call_offer gönder, SONRA tamponlanmış ICE adaylarını boşalt (sıra garantisi!)
    global.RetroTransport.sendRaw({
      type: "call_offer",
      to: friend.pin,
      callType: type,
      sdp: offer,
    });
    flushOutboundIce(friend.pin);

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

    // KRİTİK: Kullanıcı tıklama jesti içindeyken (await'ten önce!) ses elementini aç ve zil sesini durdur
    primeAudioGesture();
    ctx.ringStop(true);
    clearInterval(incVibTimer);
    incVibTimer = null;

    const targetPin = state.pin;
    const offerSdp = pendingOffer;
    pendingOffer = null;

    try {
      localStream = await getMedia(state.type, "user");
    } catch (e) {
      ctx.toast("Mikrofon/kamera izni reddedildi");
      reject();
      return;
    }
    if (!state || state.pin !== targetPin) {
      if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
      return;
    }

    const lv = $("locVid");
    if (lv && state.type === "video") {
      lv.muted = true;
      lv.srcObject = localStream;
      lv.play().catch(() => {});
    }

    pc = await createPeer(targetPin);

    // UNIFIED PLAN ALTIN KURALI (Tek yönlü ses çözümünün kalbi):
    // 1) ÖNCE setRemoteDescription(offer) -> m-line & transceiver sırası offer ile birebir oluşur
    await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
    // 2) SONRA yerel mikrofon/kamera mevcut sendrecv transceiver'lara bağlanır
    await attachLocalTracks(pc, localStream, true);
    // 3) Bekleyen uzak ICE adaylarını ekle
    await drainPendingIce(pc, targetPin);

    // 4) Answer oluştur, yerel olarak uygula, önce call_answer sonra kendi ICE adaylarını gönder
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    global.RetroTransport.sendRaw({
      type: "call_answer",
      to: targetPin,
      sdp: answer,
    });
    flushOutboundIce(targetPin);

    state.phase = "connecting";
    updateUI();
    playRemoteMedia();
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
    ctx.ringStop(false);
    clearTimeout(ringTimer);
    ringTimer = null;
    clearInterval(incVibTimer);
    incVibTimer = null;
    clearTimeout(calleeRestartTimer);
    calleeRestartTimer = null;
    stopStatsWatchdog();

    const oldPin = state ? state.pin : null;
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
    remoteAudioStream = null;
    remoteVideoStream = null;
    pendingOffer = null;
    outboundIce = [];
    signalingSent = false;
    if (oldPin) delete pendingIceByPin[oldPin];
    iceRestarting = false;
    audioBlocked = false;
    state = null;

    if ($("locVid")) $("locVid").srcObject = null;
    if ($("remVid")) {
      $("remVid").srcObject = null;
      $("remVid").muted = true;
    }
    if ($("remAud")) {
      $("remAud").srcObject = null;
      $("remAud").removeAttribute("src");
      $("remAud").muted = false;
      $("remAud").volume = 1.0;
    }

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

  function toggleSpeaker() {
    if (!state) return;
    state.speaker = state.speaker === false ? true : false;
    const ra = $("remAud");
    const vol = state.speaker ? 1.0 : 0.55;
    if (ra) {
      ra.muted = false;
      ra.volume = vol;
    }
    playRemoteMedia();
    updateUI();
    ctx.toast(state.speaker ? "🔊 Yüksek ses açık" : "🔈 Kısık ses");
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
      if ($("locVid")) {
        $("locVid").srcObject = localStream;
        $("locVid").classList.toggle("back", state.facing === "environment");
      }
      // Bazı Android cihazlarda kamera değişimi sonrası ses oynatmayı tazele
      playRemoteMedia();
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
    playRemoteMedia();
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
          speaker: true,
          facing: "user",
          minimized: false,
        };
        pendingOffer = ev.sdp;
        // Önemli: call_offer'dan milisaniyeler önce gelmiş geçerli call_ice adaylarını SİLME!
        if (!Array.isArray(pendingIceByPin[fromPin])) pendingIceByPin[fromPin] = [];

        const st = ctx.getState();
        if (st.set.sound) ctx.ringPlay(ty === "video" ? st.set.ringG : st.set.ringV, 16);
        if (global.RetroHaptics) global.RetroHaptics.nudge(st.set.vib);
        clearInterval(incVibTimer);
        incVibTimer = setInterval(() => {
          if (!state || state.phase !== "ringing" || state.dir !== "in") {
            clearInterval(incVibTimer);
            incVibTimer = null;
            return;
          }
          if (global.RetroHaptics) global.RetroHaptics.nudge(ctx.getState().set.vib);
        }, 3800);
        updateUI();
        if (autoAnswerPin === fromPin && Date.now() < autoAnswerUntil) {
          autoAnswerPin = null;
          autoAnswerUntil = 0;
          setTimeout(() => accept(), 250);
        }
        break;
      }

      case "call_answer": {
        if (!state || !pc || state.pin !== fromPin) return;
        clearTimeout(ringTimer);
        ringTimer = null;
        ctx.ringStop(true);
        await pc.setRemoteDescription(new RTCSessionDescription(ev.sdp));
        await drainPendingIce(pc, fromPin);
        if (state.phase === "ringing") {
          state.phase = "connecting";
          updateUI();
        }
        playRemoteMedia();
        if (pc.connectionState === "connected" || pc.iceConnectionState === "connected") {
          onConnected();
        }
        break;
      }

      case "call_renegotiate": {
        if (!state || !pc || state.pin !== fromPin) return;
        try {
          if (pc.signalingState !== "stable") {
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
          playRemoteMedia();
        } catch (e) {}
        break;
      }

      case "call_renegotiate_answer": {
        if (!state || !pc || state.pin !== fromPin) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(ev.sdp));
          playRemoteMedia();
        } catch (e) {}
        break;
      }

      case "call_ice": {
        if (!ev.candidate || !fromPin) return;
        if (pc && state && state.pin === fromPin && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(ev.candidate));
          } catch (e) {}
        } else {
          if (!Array.isArray(pendingIceByPin[fromPin])) pendingIceByPin[fromPin] = [];
          pendingIceByPin[fromPin].push(ev.candidate);
          if (pendingIceByPin[fromPin].length > 60) pendingIceByPin[fromPin].shift();
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

      case "call_ringing_no_push": {
        if (state && state.pin === fromPin && state.phase === "ringing") {
          state.noPush = true;
          updateUI();
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
    if ($("cSpk")) $("cSpk").onclick = toggleSpeaker;
    if ($("cChat")) $("cChat").onclick = minimize;
    if ($("cUnlockAud")) {
      $("cUnlockAud").onclick = () => {
        primeAudioGesture();
        playRemoteMedia();
      };
    }
    // Arama ekranına yapılan herhangi bir dokunuşta tarayıcı ses engelini otomatik kaldır
    if ($("callScr")) {
      $("callScr").addEventListener(
        "pointerdown",
        () => {
          if (state && (audioBlocked || ($("remAud") && $("remAud").paused && remoteAudioStream && remoteAudioStream.getAudioTracks().length))) {
            playRemoteMedia();
          }
        },
        { passive: true }
      );
    }
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
      if (state && state.phase === "active") tryIceRestart(false);
    });
    // Ekran kilidinden / arka plandan dönünce ses oynatmayı tazele
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && state && state.phase === "active") {
        playRemoteMedia();
      }
    });
    loadIceServers();
  }

  function prepareIncoming(fromPin, autoAns) {
    if (!fromPin) return;
    const pin = String(fromPin).trim().toUpperCase();
    if (state && state.pin === pin && state.dir === "in" && state.phase === "ringing") {
      maximize();
      if (autoAns) accept();
      return;
    }
    if (autoAns) {
      autoAnswerPin = pin;
      autoAnswerUntil = Date.now() + 15000;
    }
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
    prepareIncoming,
    syncBar: updateUI,
    getCallInfo,
    handleEvent,
    isActive,
  };
})(window);
