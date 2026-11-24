/* RetroChat Grup Sohbetleri Modülü (Faz 10)
 * - PIN tabanlı çoklu grup odaları oluşturma (GRP-XXXXXXXX)
 * - Üye listesi, yeni üye ekleme, gruptan ayrılma
 * - Grup mesajı, grup titreşimi (Nudge), yazıyor göstergesi, emoji tepkisi, herkesten sil
 */
(function (global) {
  const ICONS = ["👥", "🔥", "🎮", "🎵", "🚀", "🌙", "💎", "🍕", "⚽", "🎉"];
  let ctx = null;
  let pickedIcon = "👥";
  let openGroupId = null;

  function $(id) {
    return document.getElementById(id);
  }

  function findGroup(gid) {
    const st = ctx.getState();
    return st.friends.find((x) => x.isGroup && x.pin === gid) || null;
  }

  function syncGroup(g) {
    if (!g || !g.id) return null;
    const st = ctx.getState();
    let f = findGroup(g.id);
    if (!f) {
      f = {
        n: g.name || "Grup",
        s: "on",
        e: g.icon || "👥",
        pin: g.id,
        np: "",
        bio: "",
        isGroup: true,
        owner: g.owner || "",
        members: g.members || [],
        h: [{ k: "c", id: ctx.uid(), txt: `👥 "${g.name}" grubu oluşturuldu`, ts: Date.now() }],
        u: 0,
      };
      st.friends.unshift(f);
    } else {
      f.n = g.name || f.n;
      f.e = g.icon || f.e;
      f.owner = g.owner || f.owner;
      f.members = g.members || f.members;
      f.s = "on";
    }
    ctx.save();
    ctx.renderList();
    if (ctx.getSelectedFriend() === f) ctx.renderMsgs();
    if (openGroupId === g.id && $("grpInfo") && $("grpInfo").style.display === "flex") {
      renderGroupInfo(f);
    }
    return f;
  }

  function removeGroupLocal(gid) {
    const st = ctx.getState();
    const idx = st.friends.findIndex((x) => x.isGroup && x.pin === gid);
    if (idx >= 0) {
      st.friends.splice(idx, 1);
      ctx.onGroupRemoved(idx);
      ctx.save();
      ctx.renderList();
    }
    closeInfo();
  }

  function renderCreateUI() {
    const iconBox = $("gIcons");
    if (iconBox) {
      iconBox.innerHTML = ICONS.map(
        (ic) => `<button type="button" class="gic-b${ic === pickedIcon ? " on" : ""}" data-ic="${ic}">${ic}</button>`
      ).join("");
    }
    const listBox = $("gPickList");
    if (!listBox) return;
    const st = ctx.getState();
    const people = st.friends.filter((f) => !f.isGroup);
    if (!people.length) {
      listBox.innerHTML = '<div style="opacity:.65;font-size:12px;padding:6px 0">Henüz arkadaş eklemedin. Aşağıya PIN yazarak ekleyebilirsin.</div>';
      return;
    }
    listBox.innerHTML = people
      .map(
        (f) =>
          `<label class="gp-row"><input type="checkbox" value="${ctx.esc(f.pin)}"><span>${ctx.esc(f.n)} <small>(${ctx.esc(f.pin)})</small></span></label>`
      )
      .join("");
  }

  function createFromModal() {
    const nameEl = $("gName");
    const pinEl = $("gExtraPin");
    const name = ((nameEl && nameEl.value) || "").trim();
    if (!name) {
      ctx.setAddError("Grup adı girmelisin.");
      return;
    }
    const checked = Array.from(document.querySelectorAll("#gPickList input:checked")).map((i) => i.value);
    const extraRaw = ((pinEl && pinEl.value) || "").trim();
    if (extraRaw) {
      extraRaw
        .split(/[\s,;]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[0-9A-F]{8}$/.test(s))
        .forEach((p) => checked.push(p));
    }

    if (global.RetroTransport && global.RetroTransport.isLive()) {
      global.RetroTransport.sendRaw({
        type: "group_create",
        name,
        icon: pickedIcon,
        members: checked,
      });
      ctx.toast("👥 Grup oluşturuluyor…");
    } else {
      // Yerel/çevrimdışı modda anında oluştur
      const st = ctx.getState();
      const id = "GRP-" + global.RetroTransport.randomHex(8);
      const members = [{ pin: st.pin, name: st.set.name, status: "on" }].concat(
        checked.map((p) => {
          const fr = st.friends.find((x) => x.pin === p);
          return { pin: p, name: fr ? fr.n : "Kişi " + p.slice(-4), status: fr ? fr.s : "on" };
        })
      );
      const grp = syncGroup({ id, name, icon: pickedIcon, owner: st.pin, members });
      if (grp) {
        const idx = st.friends.indexOf(grp);
        if (idx >= 0) ctx.pick(idx);
      }
    }

    if (nameEl) nameEl.value = "";
    if (pinEl) pinEl.value = "";
    $("add").style.display = "none";
  }

  function renderGroupInfo(f) {
    if (!f || !f.isGroup) return;
    openGroupId = f.pin;
    const st = ctx.getState();
    $("giTitle").textContent = (f.e || "👥") + " " + f.n;
    $("giCode").textContent = f.pin;
    const members = f.members || [];
    $("giCount").textContent = `Üyeler (${members.length})`;
    $("giMembers").innerHTML = members
      .map((m) => {
        const isMe = m.pin === st.pin;
        const isOwner = m.pin === f.owner;
        const dot = m.status === "on" ? "#00e676" : m.status === "busy" ? "#ff3d71" : "#8b90b5";
        return `<div class="gm-row"><span class="gm-dot" style="background:${dot}"></span><b>${ctx.esc(isMe ? st.set.name + " (Sen)" : m.name || m.pin)}</b>${isOwner ? '<span class="gm-tag">Kurucu</span>' : ""}<code>${ctx.esc(m.pin)}</code></div>`;
      })
      .join("");
    const addSel = $("giAddPick");
    if (addSel) {
      const mSet = new Set(members.map((m) => m.pin));
      const candidates = st.friends.filter((x) => !x.isGroup && !mSet.has(x.pin));
      addSel.innerHTML =
        '<option value="">Kişilerinden seç…</option>' +
        candidates.map((c) => `<option value="${ctx.esc(c.pin)}">${ctx.esc(c.n)} (${ctx.esc(c.pin)})</option>`).join("");
    }
  }

  function openInfo(f) {
    if (!f || !f.isGroup) return;
    renderGroupInfo(f);
    $("grpInfo").style.display = "flex";
  }

  function closeInfo() {
    openGroupId = null;
    if ($("grpInfo")) $("grpInfo").style.display = "none";
  }

  function addMemberFromInfo() {
    const f = findGroup(openGroupId);
    if (!f) return;
    const pin = (($("giAddPin").value || $("giAddPick").value || "").trim()).toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(pin)) {
      ctx.toast("Geçerli bir 8 haneli PIN seç veya yaz");
      return;
    }
    if (global.RetroTransport && global.RetroTransport.isLive()) {
      global.RetroTransport.sendRaw({ type: "group_add_member", groupId: f.pin, pin });
      ctx.toast("Üye ekleniyor…");
    } else {
      const st = ctx.getState();
      const fr = st.friends.find((x) => x.pin === pin);
      f.members = f.members || [];
      if (!f.members.some((m) => m.pin === pin)) {
        f.members.push({ pin, name: fr ? fr.n : "Kişi " + pin.slice(-4), status: fr ? fr.s : "on" });
        ctx.save();
        renderGroupInfo(f);
      }
    }
    $("giAddPin").value = "";
    $("giAddPick").value = "";
  }

  function leaveCurrent() {
    const f = findGroup(openGroupId);
    if (!f) return;
    const btn = $("giLeave");
    if (!btn.dataset.ok) {
      btn.dataset.ok = "1";
      btn.textContent = "Emin misin? Tekrar bas";
      setTimeout(() => {
        if (btn.dataset.ok) {
          delete btn.dataset.ok;
          btn.textContent = "Gruptan ayrıl";
        }
      }, 4000);
      return;
    }
    delete btn.dataset.ok;
    btn.textContent = "Gruptan ayrıl";
    if (global.RetroTransport && global.RetroTransport.isLive()) {
      global.RetroTransport.sendRaw({ type: "group_leave", groupId: f.pin });
    }
    removeGroupLocal(f.pin);
    ctx.toast("Gruptan ayrıldın");
  }

  function handleEvent(ev) {
    const st = ctx.getState();
    switch (ev.type) {
      case "group_sync": {
        const f = syncGroup(ev.group);
        if (f && ev.createdBy && ev.createdBy === st.pin) {
          const idx = st.friends.indexOf(f);
          if (idx >= 0) ctx.pick(idx);
          ctx.toast(`👥 "${f.n}" grubu oluşturuldu!`);
        }
        break;
      }
      case "group_removed": {
        removeGroupLocal(ev.groupId);
        break;
      }
      case "group_msg": {
        const f = findGroup(ev.groupId);
        if (!f || !ev.msg) break;
        const incoming = Object.assign({}, ev.msg, {
          me: 0,
          sn: ev.senderName || ("Kişi " + String(ev.from || "").slice(-4)),
          at: ev.msg.at || ctx.nowTime(),
          ts: Date.now(),
        });
        f.h.push(incoming);
        const viewing = ctx.getSelectedFriend() === f && $("app").classList.contains("open");
        if (!viewing) {
          f.u = (f.u || 0) + 1;
          ctx.notify(f, incoming);
        }
        ctx.save();
        ctx.renderMsgs();
        break;
      }
      case "group_nudge": {
        const f = findGroup(ev.groupId);
        if (!f) break;
        const who = ev.senderName || "Bir üye";
        const item = { k: "c", id: ctx.uid(), txt: `🫨 ${who} gruba titreşim gönderdi!`, ts: Date.now() };
        f.h.push(item);
        const viewing = ctx.getSelectedFriend() === f && $("app").classList.contains("open");
        if (!viewing) {
          f.u = (f.u || 0) + 1;
          ctx.notify(f, { k: "n", t: `${who} titreşim gönderdi` });
        }
        ctx.shake();
        ctx.save();
        ctx.renderMsgs();
        break;
      }
      case "group_typing": {
        ctx.setGroupTyping(ev.groupId, ev.isTyping ? ev.senderName || "Biri" : "");
        break;
      }
      case "group_reaction": {
        const f = findGroup(ev.groupId);
        if (!f) break;
        const m = f.h.find((x) => x.id === ev.msgId);
        if (m) {
          m.rx = ev.emoji || "";
          ctx.save();
          ctx.renderMsgs();
        }
        break;
      }
      case "group_delete": {
        const f = findGroup(ev.groupId);
        if (!f) break;
        const m = f.h.find((x) => x.id === ev.msgId);
        if (m) {
          m.del = true;
          m.img = null;
          m.med = null;
          m.aud = null;
          m.file = null;
          ctx.clearVmem(ev.msgId);
          ctx.save();
          ctx.renderMsgs();
        }
        break;
      }
    }
  }

  function init(options) {
    ctx = options;
    const iconBox = $("gIcons");
    if (iconBox) {
      iconBox.onclick = (e) => {
        const b = e.target.closest("[data-ic]");
        if (!b) return;
        pickedIcon = b.dataset.ic;
        renderCreateUI();
      };
    }
    if ($("gCreateBtn")) $("gCreateBtn").onclick = createFromModal;
    if ($("giX")) $("giX").onclick = closeInfo;
    if ($("grpInfo")) {
      $("grpInfo").onclick = (e) => {
        if (e.target.id === "grpInfo") closeInfo();
      };
    }
    if ($("giAddBtn")) $("giAddBtn").onclick = addMemberFromInfo;
    if ($("giLeave")) $("giLeave").onclick = leaveCurrent;
  }

  global.RetroGroups = {
    init,
    syncGroup,
    renderCreateUI,
    openInfo,
    closeInfo,
    handleEvent,
  };
})(window);
