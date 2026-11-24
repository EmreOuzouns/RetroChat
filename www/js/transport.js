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
  let retryDelay = 1500;
  let outbox = [];
  let getStateFn = null;

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
    }
    return false;
  }

  function flushOutbox() {
    while (outbox.length && ws && ws.readyState === 1 && authed) {
      ws.send(JSON.stringify(outbox.shift()));
    }
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
    if (ws) {
      try { ws.close(); } catch (e) {}
    }

    if (handlers.onStatus) handlers.onStatus("connecting", "Bağlanıyor…");

    try {
      ws = new WebSocket(url);
    } catch (e) {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      connected = true;
      retryDelay = 1500;
      const st = getStateFn();
      ensureIdentity(st);
      ws.send(
        JSON.stringify({
          type: "auth",
          pin: st.pin,
          token: st.authToken,
          profile: buildProfile(st),
          friends: (st.friends || []).map((f) => f.pin),
        })
      );
    };

    ws.onmessage = (ev) => {
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
          if (handlers.onStatus) handlers.onStatus("online", "Bağlı · PIN " + data.pin);
          if (handlers.onAuthOk) handlers.onAuthOk(data.presences || []);
          flushOutbox();
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
        case "msg":
          if (handlers.onMessage) handlers.onMessage(data.from, data.msg);
          break;
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
        case "media_opened":
          if (handlers.onMediaOpened) handlers.onMediaOpened(data.from, data.msgId);
          break;
        case "reaction":
          if (handlers.onReaction) handlers.onReaction(data.from, data.msgId, data.emoji || "");
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
          if (handlers.onCallEvent) handlers.onCallEvent(data);
          break;
      }
    };

    ws.onclose = () => {
      connected = false;
      authed = false;
      if (handlers.onStatus) handlers.onStatus("offline", "Yeniden bağlanıyor…");
      scheduleReconnect();
    };

    ws.onerror = () => {
      try { ws.close(); } catch (e) {}
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
    // Wi-Fi <-> 4G/5G geçişinde beklemeden anında yeniden bağlan
    global.addEventListener("online", () => {
      if (config.mode === "ws" && (!ws || ws.readyState !== 1)) {
        retryDelay = 1500;
        connect();
      }
    });
  }

  function isLive() {
    return config.mode === "ws";
  }

  function sendProfile(state) {
    if (config.mode !== "ws") return;
    rawSend({ type: "profile_update", profile: buildProfile(state) });
  }

  function lookupPin(pin) {
    if (config.mode !== "ws") return;
    rawSend({ type: "lookup_pin", pin });
  }

  function sendMessage(friend, msg) {
    if (config.mode === "ws") {
      const st = getStateFn ? getStateFn() : null;
      const clean = Object.assign({}, msg);
      rawSend({
        type: "msg",
        to: friend.pin,
        msg: clean,
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
      rawSend({ type: "nudge", to: friend.pin });
      return;
    }
    if (handlers.onLocalDeliver) {
      handlers.onLocalDeliver(friend, {}, true);
    }
  }

  function sendTyping(friend, isTyping) {
    if (config.mode !== "ws" || !friend) return;
    rawSend({ type: "typing", to: friend.pin, isTyping: !!isTyping });
  }

  function sendRead(friend, msgIds) {
    if (config.mode !== "ws" || !friend || !msgIds || !msgIds.length) return;
    rawSend({ type: "read", to: friend.pin, msgIds });
  }

  function deleteForAll(friend, msgId) {
    if (config.mode !== "ws" || !friend) return;
    rawSend({ type: "delete_for_all", to: friend.pin, msgId });
  }

  function sendMediaOpened(friend, msgId) {
    if (config.mode !== "ws" || !friend) return;
    rawSend({ type: "media_opened", to: friend.pin, msgId });
  }

  function sendReaction(friend, msgId, emoji) {
    if (config.mode !== "ws" || !friend) return;
    rawSend({ type: "reaction", to: friend.pin, msgId, emoji: emoji || "" });
  }

  function sendRaw(obj) {
    return rawSend(obj);
  }

  global.RetroTransport = {
    config,
    init,
    connect,
    isLive,
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
    sendMediaOpened,
    sendReaction,
    sendRaw,
  };
})(window);
