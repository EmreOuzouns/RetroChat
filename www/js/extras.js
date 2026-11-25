/* RetroChat Gelişmiş Sohbet & Şifreli Yedekleme Modülü (Faz 11)
 * - Sohbet içi mesaj arama (sonuçlar arasında ileri/geri gezinme & vurgulama)
 * - Mesaj sabitleme (DM & Grup canlı senkron)
 * - Mesaj düzenleme (DM E2EE uyumlu & Grup canlı senkron)
 * - Mesaj iletme (Forward)
 * - Şifreli PIN + E2EE Anahtar + Sohbet Yedeği Dışa/İçe Aktarma (PBKDF2 120k + AES-256-GCM)
 */
(function (global) {
  let ctx = null;
  let searchHits = [];
  let searchIdx = -1;
  let editId = null;
  let fwdMsg = null;

  function $(id) {
    return document.getElementById(id);
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

  function msgPreview(m) {
    if (!m) return "";
    if (m.aud) return "🎤 Sesli mesaj (" + (m.aud.dur || "0:01") + ")";
    if (m.med) return m.med.k === "vid" ? "🎞 Video" : "📷 Fotoğraf";
    if (m.img) return "📷 Fotoğraf";
    if (m.file) return "📄 " + (m.file.name || "Dosya");
    if (m.loc) return "📍 Konum";
    return String(m.t || "").slice(0, 80);
  }

  /* ===== 1. Sohbet İçi Arama ===== */
  function openSearch() {
    const bar = $("csearch");
    if (!bar) return;
    bar.classList.add("show");
    $("csIn").value = "";
    $("csCnt").textContent = "";
    searchHits = [];
    searchIdx = -1;
    clearHighlights();
    $("csIn").focus();
  }

  function closeSearch() {
    const bar = $("csearch");
    if (bar) bar.classList.remove("show");
    searchHits = [];
    searchIdx = -1;
    clearHighlights();
  }

  function clearHighlights() {
    document.querySelectorAll("#msgs .ml.hit, #msgs .ml.hit-cur").forEach((el) => {
      el.classList.remove("hit", "hit-cur");
    });
  }

  function focusHit(idx) {
    if (!searchHits.length) return;
    searchIdx = (idx + searchHits.length) % searchHits.length;
    document.querySelectorAll("#msgs .ml.hit-cur").forEach((el) => el.classList.remove("hit-cur"));
    const el = searchHits[searchIdx];
    if (el) {
      el.classList.add("hit-cur");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    $("csCnt").textContent = `${searchIdx + 1}/${searchHits.length}`;
  }

  function runSearch() {
    clearHighlights();
    const q = (($("csIn") && $("csIn").value) || "").trim().toLowerCase();
    searchHits = [];
    searchIdx = -1;
    if (!q) {
      $("csCnt").textContent = "";
      return;
    }
    const rows = document.querySelectorAll("#msgs .ml[data-mid]");
    rows.forEach((el) => {
      const txt = (el.textContent || "").toLowerCase();
      if (txt.includes(q)) {
        el.classList.add("hit");
        searchHits.push(el);
      }
    });
    if (!searchHits.length) {
      $("csCnt").textContent = "0/0";
      return;
    }
    focusHit(searchHits.length - 1);
  }

  /* ===== 2. Mesaj Sabitleme ===== */
  function jumpToMsg(msgId) {
    if (!msgId) return;
    const el = document.querySelector(`#msgs .ml[data-mid="${CSS.escape(msgId)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("hit-cur");
      setTimeout(() => el.classList.remove("hit-cur"), 1800);
    } else {
      ctx.toast("Sabitlenen mesaj bu sohbette bulunamadı");
    }
  }

  function togglePin(msgId) {
    const f = ctx.getSelectedFriend();
    if (!f) return;
    if (f.pinned && f.pinned.id === msgId) {
      f.pinned = null;
      global.RetroTransport.sendPin(f, "", "");
      ctx.toast("Sabit mesaj kaldırıldı");
    } else {
      const m = f.h.find((x) => x.id === msgId);
      if (!m || m.del) return;
      const preview = msgPreview(m);
      f.pinned = { id: msgId, preview };
      global.RetroTransport.sendPin(f, msgId, preview);
      ctx.toast("📌 Mesaj sabitlendi");
    }
    ctx.save();
    renderPinBar();
  }

  function unpinCurrent() {
    const f = ctx.getSelectedFriend();
    if (!f || !f.pinned) return;
    f.pinned = null;
    global.RetroTransport.sendPin(f, "", "");
    ctx.save();
    renderPinBar();
  }

  function renderPinBar() {
    const bar = $("pinbar");
    if (!bar || !ctx) return;
    const f = ctx.getSelectedFriend();
    if (!f || !f.pinned || !f.pinned.id) {
      bar.style.display = "none";
      return;
    }
    $("pinTxt").textContent = "📌 " + (f.pinned.preview || "Sabitlenen mesaj");
    bar.style.display = "flex";
  }

  function applyRemotePin(targetPin, msgId, preview) {
    if (!ctx) return;
    const st = ctx.getState();
    const f = st.friends.find((x) => x.pin === targetPin);
    if (!f) return;
    f.pinned = msgId ? { id: msgId, preview: preview || "Sabitlenen mesaj" } : null;
    ctx.save();
    if (ctx.getSelectedFriend() === f) renderPinBar();
  }

  /* ===== 3. Mesaj Düzenleme ===== */
  function startEdit(msgId) {
    if (!ctx) return;
    const f = ctx.getSelectedFriend();
    if (!f) return;
    const m = f.h.find((x) => x.id === msgId);
    if (!m || !m.me || m.del) return;
    editId = msgId;
    ctx.clearReply();
    $("rep").innerHTML = `<span>✏️ Mesaj düzenleniyor…</span><span style="cursor:pointer" onclick="RetroExtras.cancelEdit()">✕</span>`;
    $("rep").classList.add("show");
    $("in").value = m.t || "";
    ctx.grow();
    $("in").focus();
  }

  function cancelEdit() {
    if (!editId) return;
    editId = null;
    $("rep").classList.remove("show");
    $("in").value = "";
    ctx.grow();
  }

  function isEditing() {
    return !!editId;
  }

  function commitEdit(newText) {
    const f = ctx.getSelectedFriend();
    if (!f || !editId) return false;
    const id = editId;
    editId = null;
    $("rep").classList.remove("show");
    $("in").value = "";
    ctx.grow();
    const m = f.h.find((x) => x.id === id);
    if (!m || m.del) return true;
    const clean = String(newText || "").trim();
    if (!clean || clean === m.t) return true;
    m.t = clean;
    m.ed = true;
    ctx.save();
    ctx.renderMsgs();
    global.RetroTransport.sendEdit(f, id, clean);
    return true;
  }

  function applyRemoteEdit(targetPin, msgId, newText) {
    const st = ctx.getState();
    const f = st.friends.find((x) => x.pin === targetPin);
    if (!f) return;
    const m = f.h.find((x) => x.id === msgId);
    if (m && !m.del) {
      m.t = newText;
      m.ed = true;
      if (f.pinned && f.pinned.id === msgId) f.pinned.preview = msgPreview(m);
      ctx.save();
      ctx.renderMsgs();
    }
  }

  /* ===== 4. Mesaj İletme (Forward) ===== */
  function openForward(msgId) {
    const f = ctx.getSelectedFriend();
    if (!f) return;
    const m = f.h.find((x) => x.id === msgId);
    if (!m || m.del) return;
    if (m.med && m.med.mode !== "normal") {
      ctx.toast("Tek seferlik / süreli medya iletilemez");
      return;
    }
    fwdMsg = m;
    const st = ctx.getState();
    const box = $("fwdList");
    box.innerHTML = st.friends
      .map(
        (target, idx) =>
          `<button type="button" class="fwd-row" data-fi="${idx}"><span class="fwd-av">${ctx.avH(target)}</span><span><b>${ctx.esc(target.n)}</b><small>${target.isGroup ? "Grup" : "PIN: " + ctx.esc(target.pin)}</small></span></button>`
      )
      .join("");
    $("fwdMod").style.display = "flex";
  }

  function closeForward() {
    fwdMsg = null;
    if ($("fwdMod")) $("fwdMod").style.display = "none";
  }

  function sendForwardTo(targetIdx) {
    if (!fwdMsg) return;
    const st = ctx.getState();
    const target = st.friends[targetIdx];
    if (!target) return;
    const copy = {
      id: ctx.uid(),
      me: 1,
      t: fwdMsg.t || "",
      at: ctx.nowTime(),
      ts: Date.now(),
      st: 0,
      fwd: true,
    };
    if (fwdMsg.img) copy.img = fwdMsg.img;
    if (fwdMsg.med && fwdMsg.med.mode === "normal") copy.med = Object.assign({}, fwdMsg.med);
    if (fwdMsg.aud) copy.aud = Object.assign({}, fwdMsg.aud);
    if (fwdMsg.file) copy.file = Object.assign({}, fwdMsg.file);
    if (fwdMsg.loc) copy.loc = Object.assign({}, fwdMsg.loc);

    target.h.push(copy);
    closeForward();
    ctx.save();
    ctx.renderMsgs();
    global.RetroTransport.sendMessage(target, copy);
    ctx.toast(`↪ "${target.n}" sohbetine iletildi`);
  }

  /* ===== 5. Şifreli PIN + Sohbet Yedeği (PBKDF2 + AES-256-GCM) ===== */
  async function deriveBackupKey(passphrase, salt) {
    const baseKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptBackup(stateObj, passphrase) {
    if (!global.crypto || !global.crypto.subtle) {
      throw new Error("Bu tarayıcı şifreli yedeklemeyi desteklemiyor");
    }
    if (!passphrase || passphrase.length < 6) {
      throw new Error("Yedekleme parolası en az 6 karakter olmalı");
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(passphrase, salt);
    const plain = new TextEncoder().encode(JSON.stringify(stateObj));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
    return JSON.stringify({
      app: "RetroChatBackup",
      v: 1,
      kdf: "PBKDF2-SHA256-120000",
      salt: bytesToB64(salt),
      iv: bytesToB64(iv),
      ct: bytesToB64(ct),
      createdAt: new Date().toISOString(),
    });
  }

  async function decryptBackup(rawJson, passphrase) {
    const env = JSON.parse(rawJson);
    if (!env || env.app !== "RetroChatBackup" || env.v !== 1 || !env.salt || !env.iv || !env.ct) {
      throw new Error("Geçersiz yedek dosyası");
    }
    const salt = b64ToBytes(env.salt);
    const iv = b64ToBytes(env.iv);
    const ct = b64ToBytes(env.ct);
    const key = await deriveBackupKey(passphrase, salt);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    const parsed = JSON.parse(new TextDecoder().decode(plainBuf));
    if (!parsed || !parsed.pin || !Array.isArray(parsed.friends)) {
      throw new Error("Yedek içeriği bozuk");
    }
    return parsed;
  }

  async function exportBackupUI() {
    const pass = (($("sBakPass") && $("sBakPass").value) || "").trim();
    if (pass.length < 6) {
      ctx.toast("En az 6 karakterlik yedek parolası gir");
      return;
    }
    try {
      const st = ctx.getState();
      const enc = await encryptBackup(st, pass);
      const blob = new Blob([enc], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `retrochat-yedek-${st.pin}.rcbak`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      $("sBakPass").value = "";
      ctx.toast("🔐 Şifreli yedek indirildi!");
    } catch (e) {
      ctx.toast("Yedek oluşturulamadı: " + (e.message || "hata"));
    }
  }

  async function importBackupFile(file) {
    const pass = (($("sBakPass") && $("sBakPass").value) || "").trim();
    if (pass.length < 6) {
      ctx.toast("Önce yedeği açacak parolayı (en az 6 karakter) yaz");
      return;
    }
    try {
      const text = await file.text();
      const restored = await decryptBackup(text, pass);
      ctx.restoreState(restored);
      $("sBakPass").value = "";
      ctx.toast("✅ PIN ve sohbetler geri yüklendi! Yeniden bağlanılıyor…");
    } catch (e) {
      ctx.toast("Parola yanlış veya yedek dosyası bozuk");
    }
  }

  function init(options) {
    ctx = options;
    if ($("kS")) {
      $("kS").onclick = () => {
        $("kmenu").classList.remove("show");
        openSearch();
      };
    }
    if ($("csIn")) $("csIn").oninput = runSearch;
    if ($("csPrev")) $("csPrev").onclick = () => focusHit(searchIdx - 1);
    if ($("csNext")) $("csNext").onclick = () => focusHit(searchIdx + 1);
    if ($("csX")) $("csX").onclick = closeSearch;
    if ($("pinTxt")) {
      $("pinTxt").onclick = () => {
        const f = ctx.getSelectedFriend();
        if (f && f.pinned) jumpToMsg(f.pinned.id);
      };
    }
    if ($("pinX")) $("pinX").onclick = unpinCurrent;
    if ($("fwdX")) $("fwdX").onclick = closeForward;
    if ($("fwdMod")) {
      $("fwdMod").onclick = (e) => {
        if (e.target.id === "fwdMod") closeForward();
      };
    }
    if ($("fwdList")) {
      $("fwdList").onclick = (e) => {
        const b = e.target.closest("[data-fi]");
        if (b) sendForwardTo(+b.dataset.fi);
      };
    }
    if ($("sBakExp")) $("sBakExp").onclick = exportBackupUI;
    if ($("sBakImp")) $("sBakImp").onclick = () => $("sBakFile").click();
    if ($("sBakFile")) {
      $("sBakFile").onchange = (e) => {
        const fl = e.target.files[0];
        e.target.value = "";
        if (fl) importBackupFile(fl);
      };
    }
  }

  global.RetroExtras = {
    init,
    openSearch,
    closeSearch,
    togglePin,
    renderPinBar,
    applyRemotePin,
    startEdit,
    cancelEdit,
    isEditing,
    commitEdit,
    applyRemoteEdit,
    openForward,
    closeForward,
    encryptBackup,
    decryptBackup,
  };
})(window);
