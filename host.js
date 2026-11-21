// TV-sidan: håller spelet, tar emot svar och räknar poäng
(function () {
  'use strict';
  const Q = window.QUIZ, QS = Q.questions, STORE = 'nyarsquiz-host-v1';
  const app = $('#app');

  // ---------- Tillstånd ----------
  function newCode() {
    const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let c = '';
    for (let i = 0; i < 4; i++) c += L[Math.floor(Math.random() * L.length)];
    return c;
  }
  function newState(room) {
    return { room: room || newCode(), phase: 'lobby', qi: -1, players: {}, answers: {}, qStart: 0, created: Date.now() };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      if (s && Date.now() - s.created < 12 * 3600e3) return s;
    } catch (e) { }
    return null;
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { } }

  let S = load() || newState();
  const conns = new Map();          // pid -> DataConnection
  let peer = null, peerOk = false, idRetries = 0;

  // ---------- Nätverk (PeerJS) ----------
  function startPeer() {
    if (typeof Peer === 'undefined') { peerOk = false; live(); return; }
    if (peer) { try { peer.destroy(); } catch (e) { } }
    peer = new Peer(PEER_PREFIX + S.room);
    peer.on('open', () => { peerOk = true; idRetries = 0; render(true); });
    peer.on('connection', c => {
      c.on('open', () => send(c, { t: 'hello', title: Q.title, teams: Q.teams }));
      c.on('data', d => onData(c, d));
      c.on('close', () => { if (c.pid && conns.get(c.pid) === c) { conns.delete(c.pid); live(); } });
      c.on('error', () => { });
    });
    peer.on('disconnected', () => {
      peerOk = false; live();
      setTimeout(() => { if (peer && !peer.destroyed && peer.disconnected) peer.reconnect(); }, 2000);
    });
    peer.on('error', err => {
      console.warn('peer error', err.type, err);
      if (err.type === 'unavailable-id') {
        // Koden hålls kvar en stund efter omladdning – försök igen, annars ny kod
        if (++idRetries < 6) setTimeout(startPeer, 3000);
        else { S.room = newCode(); save(); idRetries = 0; startPeer(); render(true); }
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
        peerOk = false; live(); setTimeout(startPeer, 4000);
      }
    });
  }
  function send(c, o) { try { if (c.open) c.send(o); } catch (e) { } }
  function sendState(pid) { const c = conns.get(pid); if (c && S.players[pid]) send(c, viewFor(pid)); }
  function broadcast() { for (const pid of conns.keys()) sendState(pid); }

  function onData(c, d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'join') {
      const pid = String(d.pid || '').slice(0, 64);
      if (!pid) return;
      const p = S.players[pid] || (S.players[pid] = { joined: Date.now() });
      p.name = String(d.name || '').trim().slice(0, 24) || 'Anonym';
      p.team = Math.max(0, Math.min(Q.teams.length - 1, d.team | 0));
      c.pid = pid;
      const old = conns.get(pid);
      conns.set(pid, c);
      if (old && old !== c) { try { old.close(); } catch (e) { } }
      save(); live(); sendState(pid);
    } else if (d.t === 'answer') {
      const pid = c.pid;
      if (!pid || !S.players[pid] || S.phase !== 'question' || d.qi !== S.qi) return;
      const q = QS[S.qi];
      const A = S.answers[S.qi] || (S.answers[S.qi] = {});
      if (A[pid]) { sendState(pid); return; }
      if (Date.now() - S.qStart > q.time * 1000 + 1500) return;   // för sent
      const v = clean(q, d.value);
      if (v === null) return;
      A[pid] = { value: v, ms: Date.now() - S.qStart };
      save(); sendState(pid); live();
      if (allAnswered()) setTimeout(() => { if (S.phase === 'question' && allAnswered()) reveal(); }, 1500);
    }
  }
  function clean(q, v) {
    if (q.type === 'choice') { v = v | 0; return v >= 0 && v < q.options.length ? v : null; }
    if (q.type === 'text') { v = String(v || '').trim().slice(0, 60); return v || null; }
    if (q.type === 'map') {
      if (!v || !isFinite(v.lat) || !isFinite(v.lng)) return null;
      return { lat: +v.lat, lng: +v.lng };
    }
    return null;
  }
  function allAnswered() {
    const A = S.answers[S.qi] || {};
    const active = [...conns.keys()].filter(pid => S.players[pid]);
    return active.length > 0 && active.every(pid => A[pid]);
  }

  // ---------- Poäng ----------
  function grade(qi) {
    const q = QS[qi], A = S.answers[qi] || {};
    for (const pid in A) {
      const a = A[pid];
      if (q.type === 'choice') {
        a.correct = a.value === q.answer;
        a.points = a.correct ? Math.round(500 + 500 * Math.max(0, 1 - a.ms / (q.time * 1000))) : 0;
      } else if (q.type === 'text') {
        a.correct = a.override !== undefined ? a.override : textMatch(a.value, q);
        a.points = a.correct ? 1000 : 0;
      } else if (q.type === 'map') {
        a.km = haversine(a.value, q.target);
        a.points = Math.round(1000 * Math.max(0, 1 - a.km / (q.maxKm || 1000)));
        a.correct = a.points > 0;
      }
    }
  }
  function score(pid) {
    let s = 0;
    for (const qi in S.answers) { const a = S.answers[qi][pid]; if (a && a.points) s += a.points; }
    return s;
  }
  function teamScores() {
    const sum = Q.teams.map(() => 0), n = Q.teams.map(() => 0);
    for (const pid in S.players) { const t = S.players[pid].team; sum[t] += score(pid); n[t]++; }
    return Q.teamScoring === 'average' ? sum.map((s, i) => n[i] ? Math.round(s / n[i]) : 0) : sum;
  }
  function ranking() {
    return Object.keys(S.players).map(pid => Object.assign({ pid, score: score(pid) }, S.players[pid]))
      .sort((a, b) => b.score - a.score);
  }
  function answerText(q) {
    return q.type === 'choice' ? q.options[q.answer] : q.type === 'text' ? q.answer : q.target.name;
  }

  // Det som skickas till en mobil (aldrig rätt svar under pågående fråga)
  function viewFor(pid) {
    const p = S.players[pid], q = QS[S.qi];
    const v = {
      t: 'state', phase: S.phase, qi: S.qi, total: QS.length, title: Q.title, teams: Q.teams,
      me: { name: p.name, team: p.team, score: score(pid) }, teamScores: teamScores()
    };
    if (q && (S.phase === 'question' || S.phase === 'reveal')) {
      v.q = { type: q.type, text: q.text, options: q.options, center: q.center, zoom: q.zoom, time: q.time };
      const a = (S.answers[S.qi] || {})[pid];
      v.answered = !!a;
      v.my = a ? a.value : null;
      if (S.phase === 'question') v.remaining = Math.max(0, q.time * 1000 - (Date.now() - S.qStart));
      else v.result = { points: a ? a.points : 0, correct: a ? !!a.correct : false, km: a ? a.km : null, answerText: answerText(q) };
    }
    if (S.phase === 'scores' || S.phase === 'end') {
      const r = ranking();
      v.rank = r.findIndex(x => x.pid === pid) + 1;
      v.nPlayers = r.length;
    }
    return v;
  }

  // ---------- Spelflöde ----------
  function setPhase(p) { S.phase = p; save(); render(); broadcast(); }
  function startQuestion(i) {
    S.qi = i; S.qStart = Date.now(); S.answers[i] = S.answers[i] || {};
    setPhase('question');
  }
  function reveal() {
    if (S.phase !== 'question') return;
    grade(S.qi); setPhase('reveal');
  }
  function next() {
    if (S.phase === 'lobby') { if (QS.length) startQuestion(0); }
    else if (S.phase === 'question') reveal();
    else if (S.phase === 'reveal') setPhase('scores');
    else if (S.phase === 'scores') { if (S.qi + 1 < QS.length) startQuestion(S.qi + 1); else setPhase('end'); }
  }
  function resetGame() {
    if (!confirm('Starta om från början? Alla poäng nollställs (spelarna är kvar).')) return;
    const players = S.players;
    S = newState(S.room);
    S.players = players;
    save(); render(true); broadcast();
  }
  function toggleText(pid) {
    const a = (S.answers[S.qi] || {})[pid];
    if (!a) return;
    a.override = !a.correct;
    grade(S.qi); save(); render(true); broadcast();
  }

  // ---------- Rendering ----------
  let lastKey = '', map = null;
  function render(force) {
    const key = S.phase + ':' + S.qi;
    if (force || key !== lastKey) { lastKey = key; full(); }
    live();
  }

  function full() {
    if (map) { map.remove(); map = null; }
    const q = QS[S.qi];
    if (S.phase === 'lobby') app.innerHTML = lobbyHTML();
    else if (S.phase === 'question') app.innerHTML = questionHTML(q);
    else if (S.phase === 'reveal') { app.innerHTML = revealHTML(q); if (q.type === 'map') drawMap(q); }
    else app.innerHTML = scoresHTML(S.phase === 'end');
    const go = $('#go');
    if (go) go.onclick = () => { go.blur(); next(); };
    const rs = $('#reset');
    if (rs) rs.onclick = resetGame;
    document.querySelectorAll('[data-toggle]').forEach(el => el.onclick = () => toggleText(el.dataset.toggle));
  }

  function joinUrl() { return new URL('play.html?r=' + S.room, location.href).href; }
  function qrImg(text) {
    try { const qr = qrcode(0, 'M'); qr.addData(text); qr.make(); return qr.createImgTag(8, 8, 'QR-kod'); }
    catch (e) { return '<p class="hint">(QR-koden kunde inte skapas)</p>'; }
  }
  function head(q) {
    return `<div class="qtop"><span class="badge">Fråga ${S.qi + 1} / ${QS.length}</span>
      <span class="badge alt">${TYPE_LABEL[q.type]}</span></div>`;
  }

  function lobbyHTML() {
    const url = joinUrl();
    return `<div class="lobby">
      <div class="card join">
        <h1 class="title">${esc(Q.title)}</h1>
        <p class="lead">Skanna med mobilen för att vara med</p>
        <div class="qr">${qrImg(url)}</div>
        <div class="code">Kod <b>${S.room}</b></div>
        <div class="url">${esc(url.replace(/^https?:\/\//, ''))}</div>
      </div>
      <div class="side">
        <div id="teams" class="teams"></div>
        <button class="btn big" id="go">Starta quizet ▶</button>
        <p class="hint">Mellanslag = nästa steg ·
          <a href="${esc(url)}&t=1" target="_blank">öppna testspelare</a> ·
          <button class="link" id="reset">nollställ</button></p>
      </div></div>`;
  }

  function questionHTML(q) {
    let body;
    if (q.type === 'choice') {
      body = `<div class="opts">${q.options.map((o, i) =>
        `<div class="opt" style="--c:${OPT_COLORS[i % 4]}"><span class="shape">${OPT_SHAPES[i % 4]}</span><span class="otext">${esc(o)}</span></div>`).join('')}</div>`;
    } else if (q.type === 'text') body = `<p class="hint big">✍️ Skriv ditt svar på mobilen</p>`;
    else body = `<p class="hint big">📍 Sätt ut en kartnål på mobilen</p>`;
    return `<div class="qwrap">${head(q)}
      <div class="timer"><div class="bar" id="bar"></div><span id="secs"></span></div>
      <h2 class="qtext">${esc(q.text)}</h2>
      ${q.image ? `<img class="qimg" src="${esc(q.image)}" alt="">` : ''}
      ${body}
      <div id="answered" class="answered"></div>
      <div class="ctrl"><button class="btn" id="go">Visa svar</button></div></div>`;
  }

  function revealHTML(q) {
    const A = S.answers[S.qi] || {}, P = S.players;
    const pl = pid => P[pid] || { name: '?', team: 0 };
    let body;
    if (q.type === 'choice') {
      body = `<div class="opts">${q.options.map((o, i) => {
        const who = Object.keys(A).filter(pid => A[pid].value === i).map(pid => esc(pl(pid).name));
        return `<div class="opt ${i === q.answer ? 'right' : 'wrong'}" style="--c:${OPT_COLORS[i % 4]}">
          <span class="shape">${i === q.answer ? '✓' : OPT_SHAPES[i % 4]}</span>
          <span class="otext">${esc(o)}<small>${who.join(', ')}</small></span>
          <span class="cnt">${who.length}</span></div>`;
      }).join('')}</div>`;
    } else if (q.type === 'text') {
      const ids = Object.keys(A).sort((a, b) => (A[b].correct ? 1 : 0) - (A[a].correct ? 1 : 0));
      body = `<div class="answer">Rätt svar: <b>${esc(q.answer)}</b></div>
        <div class="cards">${ids.map(pid => `<button class="acard ${A[pid].correct ? 'ok' : 'no'}" data-toggle="${esc(pid)}" style="--c:${TEAM_COLORS[pl(pid).team % 4]}">
          <span class="aname">${esc(pl(pid).name)}</span><span class="aval">${esc(A[pid].value)}</span>
          <span class="amark">${A[pid].correct ? '✓' : '✗'}</span></button>`).join('') || '<p class="hint">Inga svar</p>'}</div>
        <p class="hint">Klicka på ett svar för att ändra rätt/fel</p>`;
    } else {
      const ids = Object.keys(A).sort((a, b) => A[a].km - A[b].km);
      body = `<div class="mapwrap"><div id="map"></div>
        <ol class="maplist">${ids.map(pid => `<li style="--c:${TEAM_COLORS[pl(pid).team % 4]}">
          <b>${esc(pl(pid).name)}</b><span>${fmtKm(A[pid].km)}</span><span class="pts">+${A[pid].points}</span></li>`).join('') || '<li>Inga nålar</li>'}</ol></div>`;
    }
    return `<div class="qwrap reveal">${head(q)}
      <h2 class="qtext small">${esc(q.text)}</h2>
      ${q.type === 'map' ? `<div class="answer">⭐ ${esc(q.target.name)}</div>` : ''}
      ${body}
      <div class="ctrl"><button class="btn" id="go">Visa ställning</button></div></div>`;
  }

  function drawMap(q) {
    if (typeof L === 'undefined') return;
    const A = S.answers[S.qi] || {};
    map = L.map('map', { zoomControl: false, attributionControl: true });
    L.tileLayer(OSM_URL, { attribution: OSM_ATTR, maxZoom: 18 }).addTo(map);
    const t = [q.target.lat, q.target.lng], pts = [t];
    for (const pid in A) {
      const p = S.players[pid] || { name: '?', team: 0 }, a = A[pid], ll = [a.value.lat, a.value.lng];
      const col = TEAM_COLORS[p.team % 4];
      L.polyline([t, ll], { color: col, weight: 3, dashArray: '6 8' }).addTo(map);
      L.circleMarker(ll, { radius: 10, color: '#fff', weight: 3, fillColor: col, fillOpacity: 1 }).addTo(map)
        .bindTooltip(esc(p.name), { permanent: true, direction: 'right', className: 'tip' });
      pts.push(ll);
    }
    L.marker(t, { icon: L.divIcon({ className: 'star', html: '⭐', iconSize: [44, 44], iconAnchor: [22, 22] }) }).addTo(map);
    if (pts.length > 1) map.fitBounds(pts, { padding: [70, 70], maxZoom: 13 });
    else map.setView(t, 6);
  }

  function scoresHTML(end) {
    const ts = teamScores(), max = Math.max(1, ...ts);
    const order = Q.teams.map((n, i) => ({ n, i, s: ts[i] })).sort((a, b) => b.s - a.s);
    const tie = order.length > 1 && order[0].s === order[1].s;
    const title = end ? (tie ? '🎆 Oavgjort! 🎆' : `🎆 ${esc(order[0].n)} vinner! 🎆`) : `Ställning efter fråga ${S.qi + 1}`;
    const bars = Q.teams.map((n, i) => `<div class="tbar" style="--c:${TEAM_COLORS[i % 4]}">
      <span class="tname">${esc(n)}</span><div class="track"><div class="fill" style="width:${ts[i] / max * 100}%"></div></div>
      <span class="tscore">${ts[i]}</span></div>`).join('');
    const pl = ranking().map(p => `<li style="--c:${TEAM_COLORS[p.team % 4]}"><span>${esc(p.name)}</span><b>${p.score}</b></li>`).join('');
    const btn = end ? `<button class="btn" id="reset">Spela igen</button>`
      : `<button class="btn" id="go">${S.qi + 1 < QS.length ? 'Nästa fråga ▶' : 'Visa vinnaren 🏆'}</button>`;
    return `<div class="scores ${end ? 'end' : ''}"><h1 class="title">${title}</h1>
      <div class="bars">${bars}</div><ol class="plist">${pl}</ol><div class="ctrl">${btn}</div></div>`;
  }

  // Delar som uppdateras utan att hela skärmen ritas om
  function live() {
    const st = $('#status');
    if (st) st.innerHTML = `<span class="dot ${peerOk ? 'ok' : 'bad'}"></span>${typeof Peer === 'undefined' ? 'PeerJS saknas (internet?)' : peerOk ? 'Online' : 'Ansluter…'}
      · Kod <b>${S.room}</b> · ${conns.size} anslutna`;
    const t = $('#teams');
    if (t) t.innerHTML = Q.teams.map((name, i) => {
      const chips = Object.keys(S.players).filter(pid => S.players[pid].team === i)
        .map(pid => `<span class="chip ${conns.has(pid) ? '' : 'off'}">${esc(S.players[pid].name)}</span>`).join('');
      return `<div class="team" style="--c:${TEAM_COLORS[i % 4]}"><h3>${esc(name)}</h3>${chips || '<span class="empty">Inga spelare än</span>'}</div>`;
    }).join('');
    const an = $('#answered');
    if (an && S.phase === 'question') {
      const A = S.answers[S.qi] || {};
      const ids = Object.keys(S.players).filter(pid => conns.has(pid) || A[pid]);
      an.innerHTML = `<div class="count">${Object.keys(A).length} / ${ids.length} har svarat</div>` +
        ids.map(pid => `<span class="chip ${A[pid] ? 'done' : ''}" style="--c:${TEAM_COLORS[S.players[pid].team % 4]}">${A[pid] ? '✓ ' : ''}${esc(S.players[pid].name)}</span>`).join('');
    }
    tick();
  }
  function tick() {
    if (S.phase !== 'question') return;
    const q = QS[S.qi], rem = q.time * 1000 - (Date.now() - S.qStart);
    const bar = $('#bar'), secs = $('#secs');
    if (bar) bar.style.width = Math.max(0, rem / (q.time * 1000) * 100) + '%';
    if (secs) secs.textContent = Math.max(0, Math.ceil(rem / 1000));
    if (rem <= 0) reveal();
  }

  // ---------- Start ----------
  document.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.code === 'Space' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
  });
  $('#fs').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => { });
  };
  setInterval(tick, 200);
  render(true);
  startPeer();
  window.__quizHost = { get S() { return S; }, next };   // för felsökning i konsolen
})();
