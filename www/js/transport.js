/* RetroChat İletişim (Transport) Katmanı — Faz 2 (Gerçek Zamanlı Railway WebSocket)
 * Kimlik doğrulama: Yalnızca 8 haneli random PIN + cihazda saklanan gizli deviceToken (e-posta/telefon yok).
 */
(function (global) {
  function randomHex(len) {
    const chars = "0123456789ABCDEF";
    const arr = new Uint8Array(len);
    if (global.crypto && global.crypto.getRandomValues) {
      global.crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(arr, (b) => chars[b % 16]).join("");
  }

  // Railway canlı WebSocket adresi
  const DEFAULT_SERVER_URL = "wss://retrochat-server-production.up.railway.app";

  const config = {
    mode: "local", // "ws" | "local"
    serverUrl: DEFAULT_SERVER_URL,
  };

  let handlers = {};
  let ws = null;
  let connected = false;
  let authed = false;
  let reconnectTimer = null;
  let pingTimer = null;
  let pongTimer = null;
  let retryDelay = 1500;
  const OUTBOX_KEY = "rc_outbox";
  const PERSIST_TYPES = new Set([
    "msg", "group_msg", "nudge", "group_nudge", "reaction", "group_reaction",
    "delete_for_all", "group_delete", "edit_msg", "group_edit", "pin_msg",
    "group_pin", "read", "add_friend_pin",
  ]);
  let outbox = [];
  try {
    const savedOb = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]");
    if (Array.isArray(savedOb)) outbox = savedOb.slice(-200);
  } catch (e) {}

  function saveOutbox() {
    try {
      const durable = outbox.filter((x) => x && PERSIST_TYPES.has(x.type)).slice(-200);
      if (durable.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(durable));
      else localStorage.removeItem(OUTBOX_KEY);
    } catch (e) {}
  }
  let getStateFn = null;

  function stopHeartbeat() {
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
    pingTimer = null;
    pongTimer = null;
  }

  function probeAlive(timeoutMs) {
    if (config.mode !== "ws") return;
    // Zaten bağlanıyor (CONNECTING = 0) ise soketi öldürme, bekle!
    if (ws && ws.readyState === 0) return;
    if (!ws || ws.readyState !== 1 || !authed) {
      retryDelay = 1000;
      connect();
      return;
    }
    if (pongTimer) return;
    try {
      ws.send(JSON.stringify({ type: "ping" }));
    } catch (e) {
      connect();
      return;
    }
    const targetSock = ws;
    pongTimer = setTimeout(() => {
      pongTimer = null;
      if (targetSock !== ws) return;
      // Zombie soket tespit edildi — anında yeniden bağlan
      retryDelay = 1000;
      connect();
    }, timeoutMs || 4500);
  }

  function startHeartbeat() {
    stopHeartbeat();
    pingTimer = setInterval(() => {
      if (!document.hidden) probeAlive(5000);
    }, 15000);
  }

  function resolveServerUrl(state) {
    const custom = (state && state.set && state.set.serverUrl) || global.RETROCHAT_SERVER_URL || config.serverUrl;
    if (custom) return custom.replace(/^http/, "ws");
    if (location && /^https?:$/.test(location.protocol) && location.host) {
      return (location.protocol === "https:" ? "wss://" : "ws://") + location.host;
    }
    return "";
  }

  function ensureIdentity(state) {
    if (!/^[0-9A-F]{8}$/.test(state.pin || "")) {
      state.pin = randomHex(8);
    }
    if (!state.authToken || state.authToken.length < 32) {
      state.authToken = randomHex(32);
    }
    return { pin: state.pin, token: state.authToken };
  }

  function regeneratePin(state) {
    state.pin = randomHex(8);
    state.authToken = randomHex(32);
    if (global.RetroCrypto && global.RetroCrypto.rotateKeyPair) {
      global.RetroCrypto.rotateKeyPair(state).then(() => {
        if (handlers.onIdentityUpdated) handlers.onIdentityUpdated();
      }).catch(() => {});
    }
    if (ws && ws.readyState === 1) {
      ws.close();
    }
    return { pin: state.pin, token: state.authToken };
  }

  function buildProfile(state) {
    const c = (state && state.set) || {};
    return {
      name: c.name || "Kullanıcı",
      status: c.status || "on",
      stx: c.stx || "",
      stxVis: c.stxVis || "all",
      song: c.song || "",
      mus: !!c.mus,
      emo: c.emo || "",
      anim: c.anim || "none",
      photo: c.photo || null,
    };
  }

  function rawSend(obj) {
    if (ws && ws.readyState === 1 && authed) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    if (config.mode === "ws") {
      outbox.push(obj);
      if (outbox.length > 200) outbox.shift();
      saveOutbox();
    }
    return false;
  }

  function flushOutbox() {
    let sent = false;
    while (outbox.length && ws && ws.readyState === 1 && authed) {
      ws.send(JSON.stringify(outbox.shift()));
      sent = true;
    }
    if (sent) saveOutbox();
  }

  function connect() {
    const state = getStateFn ? getStateFn() : null;
    const url = resolveServerUrl(state);
    if (!url) {
      config.mode = "local";
      if (handlers.onStatus) handlers.onStatus("local", "Yerel Mod");
      return;
    }

    config.mode = "ws";
    clearTimeout(reconnectTimer);
    stopHeartbeat();
    connected = false;
    authed = false;
    if (ws) {
      const old = ws;
      ws = null;
      old.onopen = old.onmessage = old.onclose = old.onerror = null;
      try { old.close(); } catch (e) {}
    }

    if (handlers.onStatus) handlers.onStatus("connecting", "Bağlanıyor…");

    let sock;
    try {
      sock = new WebSocket(url);
      ws = sock;
    } catch (e) {
      scheduleReconnect();
      return;
    }

    sock.onopen = async () => {
      if (sock !== ws) return;
      connected = true;
      retryDelay = 1500;
      const st = getStateFn();
      ensureIdentity(st);
      let pubKey = null;
      if (global.RetroCrypto && global.RetroCrypto.ensureKeyPair) {
        try {
          pubKey = await global.RetroCrypto.ensureKeyPair(st);
          if (handlers.onIdentityUpdated) handlers.onIdentityUpdated();
        } catch (e) {}
      }
      if (sock !== ws || sock.readyState !== 1) return;
      sock.send(
        JSON.stringify({
          type: "auth",
          pin: st.pin,
          token: st.authToken,
          pubKey,
          profile: buildProfile(st),
          friends: (st.friends || []).map((f) => f.pin),
        })
      );
    };

    sock.onmessage = async (ev) => {
      if (sock !== ws) return;
      let data;
      try {
        data = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (!data || !data.type) return;

      switch (data.type) {
        case "auth_ok":
          authed = true;
          startHeartbeat();
          if (handlers.onStatus) handlers.onStatus("online", "Bağlı · PIN " + data.pin + " · v20");
          if (handlers.onAuthOk) handlers.onAuthOk(data.presences || [], data.groups || [], data.requests || [], data.sentRequests || []);
          flushOutbox();
          break;
        case "pong":
          clearTimeout(pongTimer);
          pongTimer = null;
          break;
        case "auth_error":
          if (data.code === "PIN_TAKEN" && handlers.onPinTaken) {
            handlers.onPinTaken();
          }
          break;
        case "presence":
          if (handlers.onPresence) handlers.onPresence(data.user);
          break;
        case "lookup_result":
          if (handlers.onLookupResult) handlers.onLookupResult(data.pin, data.user);
          break;
        case "msg": {
          let incoming = data.msg;
          const st = getStateFn ? getStateFn() : null;
          const fMatch = st && st.friends ? st.friends.find((x) => x.pin === data.from) : null;
          const peerPub =
            (incoming && incoming.pubKey) ||
            data.senderPubKey ||
            (fMatch && fMatch.pubKey) ||
            null;
          if (incoming && incoming.e2ee && global.RetroCrypto) {
            try {
              if (st) await global.RetroCrypto.ensureKeyPair(st);
              const dec = peerPub
                ? await global.RetroCrypto.decryptPayload(peerPub, incoming.e2ee)
                : null;
              if (dec && typeof dec === "object") {
                incoming = Object.assign(
                  { id: incoming.id, at: incoming.at, e2ee: true },
                  dec
                );
              } else {
                incoming = {
                  id: incoming.id,
                  at: incoming.at,
                  t: "🔒 Şifreli mesaj çözülemedi (cihaz anahtarı değişmiş olabilir)",
                  e2ee: true,
                };
              }
            } catch (e) {
              incoming = {
                id: incoming.id,
                at: incoming.at,
                t: "🔒 Şifreli mesaj çözülemedi",
                e2ee: true,
              };
            }
          }
          if (handlers.onMessage) handlers.onMessage(data.from, incoming, peerPub, data.senderProfile || null);
          break;
        }
        case "nudge":
          if (handlers.onNudge) handlers.onNudge(data.from);
          break;
        case "delivered":
          if (handlers.onDelivered) handlers.onDelivered(data.from, data.msgId);
          break;
        case "read":
          if (handlers.onRead) handlers.onRead(data.from, data.msgIds || []);
          break;
        case "typing":
          if (handlers.onTyping) handlers.onTyping(data.from, !!data.isTyping);
          break;
        case "delete_for_all":
          if (handlers.onDeleteForAll) handlers.onDeleteForAll(data.from, data.msgId);
          break;
        case "edit_msg": {
          let newText = data.text;
          if (data.e2ee && global.RetroCrypto) {
            try {
              const st = getStateFn ? getStateFn() : null;
              const fMatch = st && st.friends ? st.friends.find((x) => x.pin === data.from) : null;
              const peerPub = data.senderPubKey || (fMatch && fMatch.pubKey) || null;
              if (st) await global.RetroCrypto.ensureKeyPair(st);
              const dec = peerPub ? await global.RetroCrypto.decryptPayload(peerPub, data.e2ee) : null;
              if (dec && typeof dec.t === "string") newText = dec.t;
            } catch (e) {}
          }
          if (handlers.onEditMessage && newText != null) {
            handlers.onEditMessage(data.from, data.msgId, newText);
          }
          break;
        }
        case "pin_msg":
          if (handlers.onPinMessage) handlers.onPinMessage(data.from, data.msgId || "", data.preview || "");
          break;
        case "media_opened":
          if (handlers.onMediaOpened) handlers.onMediaOpened(data.from, data.msgId);
          break;
        case "reaction":
          if (handlers.onReaction) handlers.onReaction(data.from, data.msgId, data.emoji || "");
          break;
        case "add_friend_result":
        case "friend_linked":
        case "friend_req_result":
        case "friend_req_incoming":
        case "friend_req_accept_result":
        case "friend_req_accepted":
        case "friend_req_removed":
        case "friend_req_rejected":
        case "friend_req_cancelled":
          if (handlers.onRequestEvent) handlers.onRequestEvent(data);
          break;
        case "group_sync":
        case "group_removed":
        case "group_msg":
        case "group_nudge":
        case "group_typing":
        case "group_reaction":
        case "group_delete":
        case "group_edit":
        case "group_pin":
          if (handlers.onGroupEvent) handlers.onGroupEvent(data);
          break;
        case "game_invite":
        case "game_accept":
        case "game_decline":
        case "game_move":
        case "game_end":
          if (handlers.onGameEvent) handlers.onGameEvent(data);
          break;
        case "call_offer":
        case "call_answer":
        case "call_ice":
        case "call_renegotiate":
        case "call_renegotiate_answer":
        case "call_end":
        case "call_reject":
        case "call_busy":
        case "call_offline":
        case "call_ringing_no_push":
          if (handlers.onCallEvent) handlers.onCallEvent(data);
          break;
      }
    };

    sock.onclose = () => {
      if (sock !== ws) return;
      stopHeartbeat();
      connected = false;
      authed = false;
      const offLabel = navigator.onLine === false ? "Çevrimdışı Mod · Mesajlar kuyruğa alınır" : "Yeniden bağlanıyor…";
      if (handlers.onStatus) handlers.onStatus("offline", offLabel);
      scheduleReconnect();
    };

    sock.onerror = () => {
      if (sock !== ws) return;
      try { sock.close(); } catch (e) {}
    };
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      retryDelay = Math.min(retryDelay * 1.5, 10000);
      connect();
    }, retryDelay);
  }

  function init(opts) {
    handlers = opts || {};
    getStateFn = opts.getState || null;
    connect();
    // Wi-Fi <-> 4G/5G geçişinde veya kilitli ekrandan dönünce canlı bağlantıyı doğrula
    global.addEventListener("online", () => {
      if (config.mode === "ws") probeAlive(3000);
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && config.mode === "ws") probeAlive(3000);
    });
    global.addEventListener("pageshow", (ev) => {
      if (ev && ev.persisted && config.mode === "ws") probeAlive(3000);
    });
  }

  function isLive() {
    return config.mode === "ws";
  }

  function sendProfile(state) {
    if (config.mode !== "ws") return;
    const pubKey = global.RetroCrypto ? global.RetroCrypto.getPublicKey() : null;
    rawSend({ type: "profile_update", profile: buildProfile(state), pubKey });
  }

  function lookupPin(pin) {
    if (config.mode !== "ws") return;
    rawSend({ type: "lookup_pin", pin });
  }

  async function sendMessage(friend, msg) {
    if (config.mode === "ws") {
      const st = getStateFn ? getStateFn() : null;
      if (friend && friend.isGroup) {
        rawSend({
          type: "group_msg",
          groupId: friend.pin,
          msg: Object.assign({}, msg),
          timed: !!(st && st.set && st.set.timed),
        });
        return;
      }
      let wireMsg = Object.assign({}, msg);
      if (global.RetroCrypto && friend && friend.pubKey && global.RetroCrypto.validPubJwk(friend.pubKey)) {
        try {
          if (st) await global.RetroCrypto.ensureKeyPair(st);
          const secretFields = {
            t: msg.t || "",
            r: msg.r || null,
            img: msg.img || null,
            med: msg.med || null,
            aud: msg.aud || null,
            file: msg.file || null,
            loc: msg.loc || null,
          };
          const enc = await global.RetroCrypto.encryptPayload(friend.pubKey, secretFields);
          if (enc) {
            msg.e2ee = true;
            wireMsg = {
              id: msg.id,
              at: msg.at,
              e2ee: enc,
              pubKey: global.RetroCrypto.getPublicKey(),
            };
            if (handlers.onEncryptedSent) handlers.onEncryptedSent();
          }
        } catch (e) {}
      }
      rawSend({
        type: "msg",
        to: friend.pin,
        msg: wireMsg,
        timed: !!(st && st.set && st.set.timed),
      });
      return;
    }
    if (handlers.onLocalDeliver) {
      handlers.onLocalDeliver(friend, msg, false);
    }
  }

  function sendNudge(friend) {
    if (config.mode === "ws") {
      if (friend && friend.isGroup) {
        rawSend({ type: "group_nudge", groupId: friend.pin });
      } else {
        rawSend({ type: "nudge", to: friend.pin });
      }
      return;
    }
    if (handlers.onLocalDeliver) {
      handlers.onLocalDeliver(friend, {}, true);
    }
  }

  function sendTyping(friend, isTyping) {
    if (config.mode !== "ws" || !friend) return;
    if (friend.isGroup) {
      rawSend({ type: "group_typing", groupId: friend.pin, isTyping: !!isTyping });
      return;
    }
    rawSend({ type: "typing", to: friend.pin, isTyping: !!isTyping });
  }

  function sendRead(friend, msgIds) {
    if (config.mode !== "ws" || !friend || friend.isGroup || !msgIds || !msgIds.length) return;
    rawSend({ type: "read", to: friend.pin, msgIds });
  }

  function getHttpBase() {
    const state = getStateFn ? getStateFn() : null;
    const wsUrl = resolveServerUrl(state);
    if (wsUrl) {
      return wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/$/, "");
    }
    if (location && /^https?:$/.test(location.protocol) && location.origin) {
      return location.origin;
    }
    return "https://retrochat-server-production.up.railway.app";
  }

  async function uploadMedia(blob, fileName, mimeType) {
    const st = getStateFn ? getStateFn() : null;
    if (!st) throw new Error("Durum bulunamadı");
    ensureIdentity(st);
    const base = getHttpBase();
    const res = await fetch(base + "/media/upload", {
      method: "POST",
      headers: {
        "Content-Type": mimeType || (blob && blob.type) || "application/octet-stream",
        "X-Pin": st.pin,
        "X-Token": st.authToken,
        "X-File-Name": encodeURIComponent(fileName || "dosya"),
        "X-File-Type": mimeType || (blob && blob.type) || "application/octet-stream",
      },
      body: blob,
    });
    if (!res.ok) {
      let msg = "Yükleme başarısız";
      try {
        const j = await res.json();
        if (j && j.error) msg = j.error;
      } catch (e) {}
      throw new Error(msg);
    }
    const data = await res.json();
    const absUrl = /^https?:/.test(data.url) ? data.url : base + data.url;
    return { id: data.id, url: absUrl, size: data.size };
  }

  function deleteForAll(friend, msgId, mediaId) {
    if (config.mode !== "ws" || !friend) return;
    if (friend.isGroup) {
      rawSend({ type: "group_delete", groupId: friend.pin, msgId, mediaId: mediaId || undefined });
      return;
    }
    rawSend({ type: "delete_for_all", to: friend.pin, msgId, mediaId: mediaId || undefined });
  }

  function sendMediaOpened(friend, msgId, mediaId) {
    if (config.mode !== "ws" || !friend || friend.isGroup) return;
    rawSend({ type: "media_opened", to: friend.pin, msgId, mediaId: mediaId || undefined });
  }

  function sendReaction(friend, msgId, emoji) {
    if (config.mode !== "ws" || !friend) return;
    if (friend.isGroup) {
      rawSend({ type: "group_reaction", groupId: friend.pin, msgId, emoji: emoji || "" });
      return;
    }
    rawSend({ type: "reaction", to: friend.pin, msgId, emoji: emoji || "" });
  }

  async function sendEdit(friend, msgId, text) {
    if (config.mode !== "ws" || !friend || !msgId) return;
    if (friend.isGroup) {
      rawSend({ type: "group_edit", groupId: friend.pin, msgId, text });
      return;
    }
    const st = getStateFn ? getStateFn() : null;
    if (global.RetroCrypto && friend.pubKey && global.RetroCrypto.validPubJwk(friend.pubKey)) {
      try {
        if (st) await global.RetroCrypto.ensureKeyPair(st);
        const enc = await global.RetroCrypto.encryptPayload(friend.pubKey, { t: text });
        if (enc) {
          rawSend({ type: "edit_msg", to: friend.pin, msgId, e2ee: enc });
          return;
        }
      } catch (e) {}
    }
    rawSend({ type: "edit_msg", to: friend.pin, msgId, text });
  }

  function sendPin(friend, msgId, preview) {
    if (config.mode !== "ws" || !friend) return;
    if (friend.isGroup) {
      rawSend({ type: "group_pin", groupId: friend.pin, msgId: msgId || "", preview: preview || "" });
      return;
    }
    rawSend({ type: "pin_msg", to: friend.pin, msgId: msgId || "", preview: preview || "" });
  }

  function sendRaw(obj) {
    return rawSend(obj);
  }

  global.RetroTransport = {
    config,
    init,
    connect,
    isLive,
    getHttpBase,
    uploadMedia,
    randomHex,
    ensureIdentity,
    regeneratePin,
    sendProfile,
    lookupPin,
    sendMessage,
    sendNudge,
    sendTyping,
    sendRead,
    deleteForAll,
    sendEdit,
    sendPin,
    sendMediaOpened,
    sendReaction,
    sendRaw,
  };
})(window);
