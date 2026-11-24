/* RetroChat Canlı İki Kişilik Mini Oyunlar Modülü (Faz 5)
 * XOX, Taş Kağıt Makas ve Dört Bağla — Railway WebSocket üzerinden anlık senkronizasyon.
 */
(function (global) {
  const GN = { xox: "XOX", rps: "Taş Kağıt Makas", c4: "Dört Bağla" };
  const L3 = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const RPS_E = ["✊", "✋", "✌️"];

  let ctx = null;
  let G = null; // { k, f, host, sc:[me,opp,draw], r, b, turn, over, win, myPick, oppPick, res }
  let pendingInvite = null; // { fromPin, friend, k }
  let inviteTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function w3(b) {
    for (const l of L3) {
      if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return l;
    }
    return null;
  }

  function w4(b, p) {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 7; c++) {
        for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
          let ok = 1;
          const cl = [];
          for (let k = 0; k < 4; k++) {
            const rr = r + dr * k;
            const cc = c + dc * k;
            if (rr < 0 || rr > 5 || cc < 0 || cc > 6 || b[rr * 7 + cc] !== p) {
              ok = 0;
              break;
            }
            cl.push(rr * 7 + cc);
          }
          if (ok) return cl;
        }
      }
    }
    return null;
  }

  function drop(b, c, p) {
    for (let r = 5; r >= 0; r--) {
      if (!b[r * 7 + c]) {
        b[r * 7 + c] = p;
        return r * 7 + c;
      }
    }
    return -1;
  }

  function mySymbol() {
    if (!G) return "";
    if (G.k === "xox") return G.host ? "X" : "O";
    if (G.k === "c4") return G.host ? "R" : "Y";
    return "";
  }

  function oppSymbol() {
    if (!G) return "";
    if (G.k === "xox") return G.host ? "O" : "X";
    if (G.k === "c4") return G.host ? "Y" : "R";
    return "";
  }

  function newRound() {
    if (!G) return;
    G.r++;
    G.over = false;
    G.win = null;
    G.myPick = null;
    G.oppPick = null;
    G.res = null;
    if (G.k === "xox") G.b = Array(9).fill("");
    if (G.k === "c4") G.b = Array(42).fill("");
    const hostStarts = G.r % 2 === 1;
    G.turn = (G.host ? hostStarts : !hostStarts) ? "me" : "opp";
    render();
  }

  function checkEnd3() {
    const w = w3(G.b);
    if (w) {
      G.over = true;
      G.win = w;
      const winSym = G.b[w[0]];
      if (winSym === mySymbol()) {
        G.sc[0]++;
        G.msg = "🎉 Kazandın!";
      } else {
        G.sc[1]++;
        G.msg = "😎 " + G.f.n + " kazandı";
      }
      return true;
    }
    if (G.b.every((v) => v)) {
      G.over = true;
      G.sc[2]++;
      G.msg = "🤝 Berabere";
      return true;
    }
    return false;
  }

  function checkEnd4(sym) {
    const w = w4(G.b, sym);
    if (w) {
      G.over = true;
      G.win = w;
      if (sym === mySymbol()) {
        G.sc[0]++;
        G.msg = "🎉 Kazandın!";
      } else {
        G.sc[1]++;
        G.msg = "😎 " + G.f.n + " kazandı";
      }
      return true;
    }
    if (G.b.every((v) => v)) {
      G.over = true;
      G.sc[2]++;
      G.msg = "🤝 Berabere";
      return true;
    }
    return false;
  }

  function resolveRps() {
    if (G.myPick == null || G.oppPick == null) return;
    const p = G.myPick;
    const o = G.oppPick;
    const d = (p - o + 3) % 3;
    if (d === 0) {
      G.sc[2]++;
      G.res = { a: RPS_E[p], b: RPS_E[o], txt: "🤝 Berabere" };
    } else if (d === 1) {
      G.sc[0]++;
      G.res = { a: RPS_E[p], b: RPS_E[o], txt: "🎉 Kazandın!" };
    } else {
      G.sc[1]++;
      G.res = { a: RPS_E[p], b: RPS_E[o], txt: "😎 " + G.f.n + " kazandı" };
    }
    G.myPick = null;
    G.oppPick = null;
  }

  function render() {
    if (!G) return;
    const f = G.f;
    const st = ctx.getState();
    $("gt").textContent = GN[G.k] + " (Canlı)";
    $("gsc").innerHTML =
      `${ctx.esc(st.set.name)} <b>${G.sc[0]}</b> – <b>${G.sc[1]}</b> ${ctx.esc(f.n)}` +
      (G.sc[2] ? ` · Berabere ${G.sc[2]}` : "");

    let h = "";
    if (G.k === "xox") {
      h = `<div class="g3">${G.b
        .map(
          (v, i) =>
            `<button class="gc ${v === "X" ? "x" : v === "O" ? "o" : ""} ${G.win && G.win.includes(i) ? "w" : ""}" data-i="${i}">${v}</button>`
        )
        .join("")}</div>`;
    } else if (G.k === "c4") {
      h = `<div class="g7">${G.b
        .map(
          (v, i) =>
            `<div class="c4 ${v} ${G.win && G.win.includes(i) ? "w" : ""}" data-c="${i % 7}"></div>`
        )
        .join("")}</div>`;
    } else {
      const top = G.res
        ? G.res.a + " vs " + G.res.b
        : (G.myPick != null ? RPS_E[G.myPick] : "❔") + " vs " + (G.oppPick != null ? "✔" : "❔");
      h = `<div class="rv">${top}</div><div class="rp">${RPS_E.map(
        (x, i) => `<button data-p="${i}">${x}</button>`
      ).join("")}</div>`;
    }

    $("gb").innerHTML = h;
    if (G.k === "rps") {
      $("gs").textContent = G.res
        ? G.res.txt + " · Yeni tur için seç!"
        : G.myPick != null
        ? f.n + " seçimi bekleniyor…"
        : G.oppPick != null
        ? f.n + " seçti! Sıra sende"
        : "Seçimini yap!";
    } else {
      $("gs").textContent = G.over
        ? G.msg
        : G.turn === "me"
        ? "Sıra sende"
        : f.n + " hamle yapıyor…";
    }
    $("gAgain").style.display = G.k !== "rps" && G.over ? "" : "none";
  }

  function onBoardClick(e) {
    if (!G) return false;
    const T = e.target;
    if (G.k === "xox") {
      const i = T.dataset.i;
      if (i == null || G.over || G.turn !== "me" || G.b[i]) return true;
      G.b[i] = mySymbol();
      if (!checkEnd3()) G.turn = "opp";
      global.RetroTransport.sendRaw({ type: "game_move", to: G.f.pin, kind: "xox", index: +i });
      render();
      return true;
    }
    if (G.k === "c4") {
      const c = T.closest("[data-c]");
      if (!c || G.over || G.turn !== "me") return true;
      const col = +c.dataset.c;
      if (drop(G.b, col, mySymbol()) < 0) return true;
      if (!checkEnd4(mySymbol())) G.turn = "opp";
      global.RetroTransport.sendRaw({ type: "game_move", to: G.f.pin, kind: "c4", col });
      render();
      return true;
    }
    const p = T.dataset.p;
    if (p == null || G.myPick != null) return true;
    G.res = null;
    G.myPick = +p;
    global.RetroTransport.sendRaw({ type: "game_move", to: G.f.pin, kind: "rps", pick: +p });
    resolveRps();
    render();
    return true;
  }

  function invite(friend, k) {
    $("gp").style.display = "none";
    clearTimeout(inviteTimer);
    friend.h.push({ k: "c", id: ctx.uid(), txt: "🎮 " + GN[k] + " oyununa davet ettin", ts: Date.now() });
    ctx.save();
    ctx.renderMsgs();
    ctx.toast(friend.n + " daveti bekliyor…");
    G = { k, f: friend, host: true, sc: [0, 0, 0], r: 0, waiting: true };
    global.RetroTransport.sendRaw({ type: "game_invite", to: friend.pin, game: k });
    inviteTimer = setTimeout(() => {
      if (G && G.waiting && G.f.pin === friend.pin) {
        G = null;
        ctx.toast(friend.n + " oyun davetine yanıt vermedi");
      }
    }, 30000);
  }

  function showInviteBanner(inv) {
    pendingInvite = inv;
    const box = $("gInv");
    if (!box) return;
    $("gInvTxt").textContent = `🎮 ${inv.friend.n} seni ${GN[inv.k]} oyununa davet ediyor`;
    box.classList.add("show");
    if (global.RetroHaptics) global.RetroHaptics.notify(ctx.getState().set.vib);
  }

  function hideInviteBanner() {
    pendingInvite = null;
    const box = $("gInv");
    if (box) box.classList.remove("show");
  }

  function acceptInvite() {
    if (!pendingInvite) return;
    const { friend, k } = pendingInvite;
    hideInviteBanner();
    G = { k, f: friend, host: false, sc: [0, 0, 0], r: 0, waiting: false };
    friend.h.push({ k: "c", id: ctx.uid(), txt: "🎮 " + GN[k] + " davetini kabul ettin", ts: Date.now() });
    ctx.save();
    ctx.renderMsgs();
    global.RetroTransport.sendRaw({ type: "game_accept", to: friend.pin, game: k });
    $("gm").style.display = "flex";
    newRound();
  }

  function declineInvite() {
    if (!pendingInvite) return;
    const { friend, k } = pendingInvite;
    hideInviteBanner();
    global.RetroTransport.sendRaw({ type: "game_decline", to: friend.pin, game: k });
  }

  function rematch() {
    if (!G) return false;
    global.RetroTransport.sendRaw({ type: "game_move", to: G.f.pin, kind: "rematch" });
    newRound();
    return true;
  }

  function end(sendSignal) {
    clearTimeout(inviteTimer);
    inviteTimer = null;
    if (!G) return false;
    const g = G;
    G = null;
    $("gm").style.display = "none";
    if (sendSignal) {
      global.RetroTransport.sendRaw({ type: "game_end", to: g.f.pin });
    }
    if (g.sc[0] + g.sc[1] + g.sc[2] > 0) {
      g.f.h.push({
        k: "c",
        id: ctx.uid(),
        txt: `🎮 ${GN[g.k]}: ${ctx.getState().set.name} ${g.sc[0]}–${g.sc[1]} ${g.f.n}`,
        ts: Date.now(),
      });
      ctx.save();
    }
    ctx.renderMsgs();
    return true;
  }

  function handleEvent(ev) {
    const fromPin = ev.from;
    switch (ev.type) {
      case "game_invite": {
        const f = ctx.ensureFriendByPin(fromPin);
        if (!GN[ev.game]) return;
        showInviteBanner({ fromPin, friend: f, k: ev.game });
        break;
      }
      case "game_accept": {
        if (!G || !G.waiting || G.f.pin !== fromPin) return;
        clearTimeout(inviteTimer);
        inviteTimer = null;
        G.waiting = false;
        G.f.h.push({ k: "c", id: ctx.uid(), txt: "🎮 " + G.f.n + " daveti kabul etti", ts: Date.now() });
        ctx.save();
        ctx.renderMsgs();
        $("gm").style.display = "flex";
        newRound();
        break;
      }
      case "game_decline": {
        if (G && G.waiting && G.f.pin === fromPin) {
          clearTimeout(inviteTimer);
          inviteTimer = null;
          ctx.toast(G.f.n + " oyun davetini reddetti");
          G = null;
        }
        break;
      }
      case "game_move": {
        if (!G || G.f.pin !== fromPin) return;
        if (ev.kind === "rematch") {
          newRound();
          return;
        }
        if (ev.kind === "xox" && G.k === "xox" && !G.over) {
          if (!G.b[ev.index]) {
            G.b[ev.index] = oppSymbol();
            if (!checkEnd3()) G.turn = "me";
            render();
          }
        } else if (ev.kind === "c4" && G.k === "c4" && !G.over) {
          if (drop(G.b, ev.col, oppSymbol()) >= 0) {
            if (!checkEnd4(oppSymbol())) G.turn = "me";
            render();
          }
        } else if (ev.kind === "rps" && G.k === "rps") {
          G.oppPick = ev.pick;
          resolveRps();
          render();
        }
        break;
      }
      case "game_end": {
        if (G && G.f.pin === fromPin) {
          ctx.toast(G.f.n + " oyunu sonlandırdı");
          end(false);
        }
        break;
      }
    }
  }

  function init(options) {
    ctx = options;
    $("gInvOk").onclick = acceptInvite;
    $("gInvNo").onclick = declineInvite;
  }

  function isActive() {
    return !!(G && !G.waiting);
  }

  global.RetroGames = {
    init,
    invite,
    onBoardClick,
    rematch,
    end,
    handleEvent,
    isActive,
  };
})(window);
