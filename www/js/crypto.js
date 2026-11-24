/* RetroChat Uçtan Uca Şifreleme (E2EE) Modülü — Faz 9
 * Web Crypto API: ECDH (P-256) anahtar anlaşması + SHA-256 KDF + AES-256-GCM şifreleme.
 * Sunucu mesaj metnini, yanıtı, konumu, dosya veya ses URL'sini göremez.
 */
(function (global) {
  const KDF_TAG = new TextEncoder().encode("RetroChat-E2EE-v1");
  const SAFETY_EMOJI = ["🔒", "🛡️", "⚡", "🌙", "🔥", "💎", "🚀", "🎯", "🌈", "🎵", "🦊", "🌊", "🍀", "⭐", "🧩", "🔮"];

  let myPrivKey = null;
  let myPubJwk = null;
  const keyCache = new Map(); // pubKeyId -> CryptoKey

  function isSupported() {
    return !!(global.crypto && global.crypto.subtle && global.crypto.getRandomValues);
  }

  function validPubJwk(jwk) {
    return !!(jwk && typeof jwk === "object" && jwk.kty === "EC" && jwk.crv === "P-256" && typeof jwk.x === "string" && typeof jwk.y === "string");
  }

  function pubId(jwk) {
    return jwk.x + "." + jwk.y;
  }

  function bytesToB64(bytes) {
    let bin = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(bin);
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function ensureKeyPair(state) {
    if (!isSupported()) return null;
    if (myPrivKey && myPubJwk && state && state.e2ee && state.e2ee.pub && pubId(state.e2ee.pub) === pubId(myPubJwk)) {
      return myPubJwk;
    }

    if (state && state.e2ee && validPubJwk(state.e2ee.pub) && state.e2ee.priv && state.e2ee.priv.d) {
      try {
        myPrivKey = await crypto.subtle.importKey(
          "jwk",
          state.e2ee.priv,
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveBits"]
        );
        myPubJwk = { kty: "EC", crv: "P-256", x: state.e2ee.pub.x, y: state.e2ee.pub.y };
        return myPubJwk;
      } catch (e) {
        myPrivKey = null;
        myPubJwk = null;
      }
    }

    const pair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );
    const pubRaw = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const privRaw = await crypto.subtle.exportKey("jwk", pair.privateKey);
    myPrivKey = pair.privateKey;
    myPubJwk = { kty: "EC", crv: "P-256", x: pubRaw.x, y: pubRaw.y };
    keyCache.clear();
    if (state) {
      state.e2ee = { pub: myPubJwk, priv: privRaw };
    }
    return myPubJwk;
  }

  async function rotateKeyPair(state) {
    myPrivKey = null;
    myPubJwk = null;
    keyCache.clear();
    if (state) delete state.e2ee;
    return await ensureKeyPair(state);
  }

  function getPublicKey() {
    return myPubJwk;
  }

  async function deriveSharedKey(peerPubJwk) {
    if (!isSupported() || !myPrivKey || !validPubJwk(peerPubJwk)) return null;
    const id = pubId(peerPubJwk);
    if (keyCache.has(id)) return keyCache.get(id);

    const peerKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: peerPubJwk.x, y: peerPubJwk.y },
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerKey }, myPrivKey, 256);
    const secret = new Uint8Array(bits);
    const combined = new Uint8Array(secret.length + KDF_TAG.length);
    combined.set(secret, 0);
    combined.set(KDF_TAG, secret.length);
    const aesRaw = await crypto.subtle.digest("SHA-256", combined);
    const aesKey = await crypto.subtle.importKey(
      "raw",
      aesRaw,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    keyCache.set(id, aesKey);
    return aesKey;
  }

  async function encryptPayload(peerPubJwk, obj) {
    const key = await deriveSharedKey(peerPubJwk);
    if (!key) return null;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(obj));
    const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
    return {
      v: 1,
      iv: bytesToB64(iv),
      ct: bytesToB64(new Uint8Array(cipherBuf)),
    };
  }

  async function decryptPayload(peerPubJwk, enc) {
    if (!enc || enc.v !== 1 || !enc.iv || !enc.ct) return null;
    const key = await deriveSharedKey(peerPubJwk);
    if (!key) return null;
    try {
      const iv = b64ToBytes(enc.iv);
      const ct = b64ToBytes(enc.ct);
      const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
      return JSON.parse(new TextDecoder().decode(plainBuf));
    } catch (e) {
      return null;
    }
  }

  async function safetyCode(peerPubJwk) {
    if (!isSupported() || !validPubJwk(myPubJwk) || !validPubJwk(peerPubJwk)) return null;
    const pair = [pubId(myPubJwk), pubId(peerPubJwk)].sort().join("|");
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pair)));
    const digits = [];
    for (let i = 0; i < 6; i += 2) {
      const n = ((hash[i] << 8) | hash[i + 1]) % 10000;
      digits.push(String(n).padStart(4, "0"));
    }
    const emojis = [
      SAFETY_EMOJI[hash[6] & 15],
      SAFETY_EMOJI[hash[7] & 15],
      SAFETY_EMOJI[hash[8] & 15],
      SAFETY_EMOJI[hash[9] & 15],
    ].join(" ");
    return { code: digits.join(" · "), emojis };
  }

  global.RetroCrypto = {
    isSupported,
    validPubJwk,
    ensureKeyPair,
    rotateKeyPair,
    getPublicKey,
    encryptPayload,
    decryptPayload,
    safetyCode,
  };
})(window);
