/* RetroChat İlk Giriş Kurulum (Onboarding), İzin Önerileri & Karşılıklı PIN Doğrulamalı İstek Modülü
 * 1) İlk girişte kullanıcıdan isim/avatar ister ve TÜM bildirim/ses/titreşim ayarlarını açmayı önerir.
 * 2) Uygulamayı yükleyen her kullanıcıda bildirim izni kapalıysa akıllı kurulum önerisi sunar.
 * 3) PIN ile arkadaşlık isteği gönderme, bildirim panelinden açma ve istek atanın PIN'ini yazarak onaylama.
 */
(function (global) {
  const AVATARS = ["😎", "🧑", "👩", "🧔", "👩‍🎤", "🦊", "🚀", "🐱", "🎧", "⚡"];
  let ctx = null;
  let pickedEmo = "😎";
  let incoming = []; // [{ id, fromName, fromEmo, fromPhoto, hint, createdAt }]
  let outgoing = []; // [{ id, toPin, toName, toEmo, createdAt }]

  function $(id) {
    return document.getElementById(id);
  }

  /* ===== 1. İlk Giriş Onboarding & Bildirim/İzin Önerisi ===== */
  function isNotifGranted() {
    if (global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform()) {
      return true;
    }
    return typeof Notification !== "undefined" && Notification.permission === "granted";
  }

  function permHint() {
    if (isNotifGranted()) {
      return "Harika! Mesaj, arkadaşlık isteği, titreşim ve aramalar bildirim paneline düşecek.";
    }
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      return "Bildirim izni daha önce engellenmiş. Telefon Ayarları → Uygulamalar → RetroChat (veya tarayıcı site ayarları) → Bildirimler bölümünden açabilirsin.";
    }
    if (isIOS && !isStandalone) {
      return "İpucu: iPhone'da bildirim almak için Safari → Paylaş (⬆️) → Ana Ekrana Ekle ile kurup izin ver.";
    }
    return "İstekleri, mesajları, titreşimleri ve aramaları kaçırmamak için tüm bildirimleri açman önerilir.";
  }

  function refreshPermCard() {
    const btn = $("obPermBtn");
    const granted = isNotifGranted();
    if (btn) {
      btn.textContent = granted ? "✓ Bildirim & Titreşim İzinleri Açık" : "🔔 Tüm Bildirimleri & Titreşimi Aç (Önerilen)";
      btn.classList.toggle("ok", granted);
    }
    if ($("obPermStatus")) $("obPermStatus").textContent = permHint();
    if ($("ptStatus")) $("ptStatus").textContent = permHint();
  }

  // Uygulamayı yükleyen her kullanıcıya girişte (12 saatte bir) bildirim izinlerini açma önerisi
  function maybeAskPerms() {
    const m = $("permTip");
    if (!m || isNotifGranted()) return;
    const st = ctx.getState();
    const now = Date.now();
    if (st.permAskAt && now - st.permAskAt < 12 * 3600 * 1000) return;
    st.permAskAt = now;
    ctx.save();
    refreshPermCard();
    m.style.display = "flex";
  }

  function closePermTip() {
    if ($("permTip")) $("permTip").style.display = "none";
  }

  async function enableAllRecommendedPerms() {
    const st = ctx.getState();
    st.set.sound = true;
    st.set.vib = true;
    st.set.shake = true;
    ctx.save();
    ctx.fill();
    if (global.RetroHaptics) global.RetroHaptics.tap(true);
    if (global.RetroPush) {
      await global.RetroPush.enable();
    }
    refreshPermCard();
  }

  function renderOnboardingAvatars() {
    const box = $("obAvs");
    if (!box) return;
    box.innerHTML = AVATARS.map(
      (em) => `<button type="button" class="ob-av${em === pickedEmo ? " on" : ""}" data-em="${em}">${em}</button>`
    ).join("");
  }

  function checkOnboarding() {
    const st = ctx.getState();
    const modal = $("onb");
    if (!modal) return;
    if (!st.onboarded) {
      pickedEmo = st.set.emo || "😎";
      renderOnboardingAvatars();
      if ($("obPin")) $("obPin").textContent = st.pin;
      const nm = $("obName");
      if (nm) nm.value = st.set.name && st.set.name !== "Kullanıcı" && st.set.name !== "Ahmet" ? st.set.name : "";
      refreshPermCard();
      modal.style.display = "flex";
      setTimeout(() => { if (nm) nm.focus(); }, 150);
    } else {
      modal.style.display = "none";
      // Uygulamayı yükleyen kullanıcıda bildirimler hâlâ açık değilse öneri bandı + öneri penceresi
      if (global.RetroPush) global.RetroPush.updateUI();
      setTimeout(maybeAskPerms, 900);
    }
  }

  function finishOnboarding() {
    const nm = (($("obName") && $("obName").value) || "").trim();
    if (nm.length < 2) {
      if ($("obErr")) $("obErr").textContent = "Lütfen en az 2 karakterli ismini / kullanıcı adını yaz.";
      if ($("obName")) $("obName").focus();
      return;
    }
    const st = ctx.getState();
    st.set.name = nm.slice(0, 24);
    if (!st.set.photo) st.set.emo = pickedEmo;
    st.set.sound = true;
    st.set.vib = true;
    st.set.shake = true;
    st.onboarded = true;
    st.permAskAt = Date.now();
    ctx.applySet();
    ctx.fill();
    ctx.save();
    $("onb").style.display = "none";
    if (global.RetroPush) global.RetroPush.updateUI();
    ctx.renderList();
    ctx.toast(`Hoş geldin ${st.set.name}! PIN kodun: ${st.pin}`);
  }

  /* ===== 2. Arkadaşlık İsteği Gönderme & PIN Doğrulamalı Onay ===== */
  function updateBadges() {
    const n = incoming.length;
    const reqBar = $("reqBar");
    if (reqBar) {
      if (n > 0) {
        reqBar.style.display = "flex";
        reqBar.innerHTML = `<span>👋 <b>${n} yeni arkadaşlık isteğin</b> var — PIN doğrulayıp ekle</span><em>Aç ›</em>`;
      } else {
        reqBar.style.display = "none";
      }
    }
    const tabBtn = $("tR");
    if (tabBtn) {
      tabBtn.innerHTML = n > 0 ? `👋 İSTEKLER <span class="r-cnt">${n}</span>` : `👋 İSTEKLER`;
    }
    const pplDot = $("bnPpl");
    if (pplDot) {
      pplDot.style.display = n > 0 ? "block" : "none";
    }
  }

  function renderRequestsTab() {
    const box = $("vRList");
    if (!box) return;
    let html = "";

    if (incoming.length) {
      html += `<div class="rq-h">Gelen İstekler (${incoming.length})</div>`;
      html += incoming
        .map((r) => {
          const av = r.fromPhoto ? `<img src="${r.fromPhoto}">` : ctx.esc(r.fromEmo || "🧑");
          return `<div class="rq-card" data-rid="${ctx.esc(r.id)}">
            <div class="rq-top">
              <span class="rq-av">${av}</span>
              <div class="rq-meta">
                <b>${ctx.esc(r.fromName)}</b>
                <small>PIN ipucu: <code>${ctx.esc(r.hint)}</code></small>
              </div>
            </div>
            <div class="rq-note">Onaylamak için <b>${ctx.esc(r.fromName)}</b> kişisinin 8 haneli PIN kodunu yaz:</div>
            <div class="rq-form">
              <input type="text" class="rq-pin" maxlength="8" placeholder="Örn. 2A8F9C3B" autocomplete="off">
              <button type="button" class="rq-ok" data-act="acc" data-id="${ctx.esc(r.id)}">Onayla</button>
              <button type="button" class="danger rq-no" data-act="rej" data-id="${ctx.esc(r.id)}">Reddet</button>
            </div>
            <div class="rq-err" id="rqe-${ctx.esc(r.id)}"></div>
          </div>`;
        })
        .join("");
    } else {
      html += `<div class="rq-empty">Şu an bekleyen gelen arkadaşlık isteği yok.</div>`;
    }

    if (outgoing.length) {
      html += `<div class="rq-h" style="margin-top:12px">Gönderilen İstekler (${outgoing.length})</div>`;
      html += outgoing
        .map(
          (s) => `<div class="rq-sent">
            <span>${ctx.esc(s.toEmo || "🧑")}</span>
            <div style="flex:1;min-width:0">
              <b>${ctx.esc(s.toName)}</b> <small>(<code>${ctx.esc(s.toPin)}</code>)</small>
              <div style="font-size:11px;opacity:.72">Karşı tarafın senin PIN kodunu (<b>${ctx.esc(ctx.getState().pin)}</b>) yazıp onaylaması bekleniyor…</div>
            </div>
            <button type="button" class="danger" data-act="can" data-id="${ctx.esc(s.id)}">İptal</button>
          </div>`
        )
        .join("");
    }

    box.innerHTML = html;
  }

  function sendRequestByPin(rawPin) {
    const st = ctx.getState();
    const pin = String(rawPin || "").trim().toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(pin)) {
      return "PIN 8 haneli olmalı (0-9, A-F).";
    }
    if (pin === st.pin) {
      return "Kendi PIN kodunu ekleyemezsin.";
    }
    if (st.friends.some((f) => !f.isGroup && f.pin === pin)) {
      return "Bu kişi zaten arkadaş listende ekli.";
    }
    if (!global.RetroTransport || !global.RetroTransport.isLive()) {
      return "İstek göndermek için sunucu bağlantısı bekleniyor…";
    }
    global.RetroTransport.sendRaw({ type: "friend_req_send", toPin: pin });
    ctx.setAddMsg("İstek gönderiliyor…", true);
    return "";
  }

  function openRequestsModal() {
    $("add").style.display = "flex";
    ctx.switchAddTab("R");
    renderRequestsTab();
  }

  function syncFromAuth(reqs, sent) {
    incoming = Array.isArray(reqs) ? reqs : [];
    outgoing = Array.isArray(sent) ? sent : [];
    updateBadges();
    renderRequestsTab();
  }

  function handleEvent(ev) {
    switch (ev.type) {
      case "friend_req_result": {
        if (!ev.ok) {
          ctx.setAddMsg(ev.error || "İstek gönderilemedi", false);
          return;
        }
        if (ev.sent) {
          outgoing = [ev.sent, ...outgoing.filter((x) => x.id !== ev.sent.id)];
        }
        if ($("aP")) $("aP").value = "";
        ctx.setAddMsg(
          `✓ İstek gönderildi! Karşı tarafa bildirim gitti. Onaylaması için ona kendi PIN kodunu (${ctx.getState().pin}) iletmeyi unutma.`,
          true
        );
        ctx.toast("✉️ Arkadaşlık isteği gönderildi!");
        updateBadges();
        renderRequestsTab();
        break;
      }

      case "friend_req_incoming": {
        if (!ev.req) break;
        incoming = [ev.req, ...incoming.filter((x) => x.id !== ev.req.id)];
        updateBadges();
        renderRequestsTab();
        ctx.notifyBanner("👋 " + ev.req.fromName, "Sana arkadaşlık isteği gönderdi · PIN doğrulamak için dokun", openRequestsModal);
        break;
      }

      case "friend_req_accept_result": {
        if (!ev.ok) {
          const errEl = $("rqe-" + ev.reqId);
          if (errEl) errEl.textContent = ev.error || "PIN doğrulanamadı";
          else ctx.toast(ev.error || "PIN doğrulanamadı");
        }
        break;
      }

      case "friend_req_accepted": {
        incoming = incoming.filter((x) => x.id !== ev.reqId);
        outgoing = outgoing.filter((x) => x.id !== ev.reqId && (!ev.user || x.toPin !== ev.user.pin));
        updateBadges();
        renderRequestsTab();
        if (ev.user && ev.user.pin) {
          const f = ctx.addAcceptedFriend(ev.user);
          $("add").style.display = "none";
          ctx.toast(`🎉 ${f.n} ile artık arkadaşsınız!`);
        }
        break;
      }

      case "friend_req_removed": {
        incoming = incoming.filter((x) => x.id !== ev.reqId);
        updateBadges();
        renderRequestsTab();
        break;
      }

      case "friend_req_rejected":
      case "friend_req_cancelled": {
        outgoing = outgoing.filter((x) => x.id !== ev.reqId);
        updateBadges();
        renderRequestsTab();
        break;
      }
    }
  }

  function init(options) {
    ctx = options;

    if ($("obAvs")) {
      $("obAvs").onclick = (e) => {
        const b = e.target.closest("[data-em]");
        if (!b) return;
        pickedEmo = b.dataset.em;
        renderOnboardingAvatars();
      };
    }
    if ($("obPermBtn")) $("obPermBtn").onclick = enableAllRecommendedPerms;
    if ($("ptGo")) {
      $("ptGo").onclick = async () => {
        await enableAllRecommendedPerms();
        if (isNotifGranted()) {
          closePermTip();
          ctx.toast("🔔 Tüm bildirimler açıldı!");
        }
      };
    }
    if ($("ptLater")) $("ptLater").onclick = closePermTip;
    if ($("obGo")) $("obGo").onclick = finishOnboarding;
    if ($("obName")) {
      $("obName").onkeydown = (e) => {
        if (e.key === "Enter") finishOnboarding();
      };
    }
    if ($("obCpy")) {
      $("obCpy").onclick = () => {
        try { navigator.clipboard.writeText(ctx.getState().pin); } catch (e) {}
        ctx.toast("PIN kopyalandı");
      };
    }

    if ($("reqBar")) $("reqBar").onclick = openRequestsModal;

    const rBox = $("vRList");
    if (rBox) {
      rBox.onclick = (e) => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        const id = btn.dataset.id;
        if (act === "acc") {
          const card = btn.closest(".rq-card");
          const inp = card && card.querySelector(".rq-pin");
          const pin = ((inp && inp.value) || "").trim().toUpperCase();
          const errEl = $("rqe-" + id);
          if (!/^[0-9A-F]{8}$/.test(pin)) {
            if (errEl) errEl.textContent = "Lütfen istek atanın 8 haneli PIN kodunu eksiksiz yaz.";
            return;
          }
          if (errEl) errEl.textContent = "";
          global.RetroTransport.sendRaw({ type: "friend_req_accept", reqId: id, pin });
        } else if (act === "rej") {
          global.RetroTransport.sendRaw({ type: "friend_req_reject", reqId: id });
        } else if (act === "can") {
          global.RetroTransport.sendRaw({ type: "friend_req_cancel", reqId: id });
        }
      };
    }

    // Service Worker veya URL ?requests=1 ile açıldığında doğrudan İstekler penceresini aç
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (ev) => {
        if (ev.data && ev.data.type === "open_requests") {
          openRequestsModal();
        }
      });
    }
    try {
      const p = new URLSearchParams(location.search);
      if (p.get("requests") === "1") {
        setTimeout(openRequestsModal, 450);
        history.replaceState(null, "", location.pathname);
      }
    } catch (e) {}

    checkOnboarding();
  }

  global.RetroRequests = {
    init,
    checkOnboarding,
    sendRequestByPin,
    openRequestsModal,
    renderRequestsTab,
    syncFromAuth,
    handleEvent,
    closePermTip,
    incomingCount: () => incoming.length,
  };
})(window);
