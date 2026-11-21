// Mobilsidan: ansluter till TV:n och skickar svar
(function () {
  'use strict';
  const app = $('#app'), netEl = $('#net');
  const qp = new URLSearchParams(location.search);
  // ?t=1 = testspelare: egen identitet per flik
  const store = qp.has('t') ? sessionStorage : localStorage;
  const get = k => { try { return store.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { store.setItem(k, v); } catch (e) { } };

  let room = (qp.get('r') || '').toUpperCase().replace(/[^A-Z]/g, '');
  let pid = get('nq-pid');
  if (!pid) {
    pid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    set('nq-pid', pid);
  }
  let name = get('nq-name') || '';
  let team = get('nq-team') === null ? null : +get('nq-team');

  let hello = null, st = null, peer = null, conn = null, connecting = false, retry = 0, retryTimer = null;
  let editing = false, lastKey = '', deadline = 0, pmap = null, pendingAt = 0;

  // ---------- Skärmar ----------
  function screenCode(msg) {
    editing = false;
    app.innerHTML = `<div class="pcard"><h1>🎆 Quiz</h1>${msg ? `<p class="err">${esc(msg)}</p>` : ''}
      <label>Koden som står på TV:n</label>
      <input id="code" maxlength="4" autocapitalize="characters" autocomplete="off" value="${esc(room)}" placeholder="ABCD">
      <button class="btn" id="ok">Fortsätt</button></div>`;
    const inp = $('#code');
    $('#ok').onclick = () => {
      const v = inp.value.toUpperCase().replace(/[^A-Z]/g, '');
      if (v.length !== 4) return;
      room = v; history.replaceState(null, '', '?r=' + room + (qp.has('t') ? '&t=1' : ''));
      hello = st = null; lastKey = ''; retry = 0; teardown(); connect();
    };
    inp.onkeydown = e => { if (e.key === 'Enter') $('#ok').click(); };
  }
  function screenWait(text) {
    lastKey = '';
    app.innerHTML = `<div class="pcard center"><div class="spinner"></div><p>${esc(text)}</p></div>`;
  }
  function screenJoin() {
    editing = true; lastKey = '';
    app.innerHTML = `<div class="pcard"><h1>${esc(hello.title || 'Quiz')}</h1>
      <label>Ditt namn</label><input id="nm" maxlength="24" value="${esc(name)}" placeholder="t.ex. Kalle" autocomplete="off">
      <label>Välj lag</label>
      <div class="teampick">${hello.teams.map((t, i) => `<button class="tbtn ${team === i ? 'sel' : ''}" data-i="${i}" style="--c:${TEAM_COLORS[i % 4]}">${esc(t)}</button>`).join('')}</div>
      <button class="btn" id="ok">Gå med!</button><p class="err" id="err"></p></div>`;
    document.querySelectorAll('.tbtn').forEach(b => b.onclick = () => {
      team = +b.dataset.i;
      document.querySelectorAll('.tbtn').forEach(x => x.classList.toggle('sel', x === b));
    });
    $('#ok').onclick = () => {
      const n = $('#nm').value.trim();
      if (!n) { $('#err').textContent = 'Skriv ett namn'; return; }
      if (team === null || team >= hello.teams.length) { $('#err').textContent = 'Välj ett lag'; return; }
      name = n; set('nq-name', name); set('nq-team', team); set('nq-room', room);
      if (send({ t: 'join', pid, name, team })) { editing = false; screenWait('Går med…'); }
    };
  }

  function render() {
    const s = st;
    if (s.phase === 'question') deadline = Date.now() + s.remaining;
    const key = [s.phase, s.qi, s.answered ? 1 : 0, s.result ? JSON.stringify(s.result) : '', s.phase === 'scores' || s.phase === 'end' ? s.me.score + '/' + s.rank : ''].join('|');
    if (key === lastKey) { tick(); return; }
    lastKey = key;
    if (pmap) { pmap.remove(); pmap = null; }
    pendingAt = 0;
    const top = `<div class="ptop" style="--c:${TEAM_COLORS[s.me.team % 4]}"><span>${esc(s.me.name)} · ${esc(s.teams[s.me.team])}</span><b>${s.me.score} p</b></div>`;
    let html = '';
    if (s.phase === 'lobby') html = `<div class="pcard center"><div class="big">🥂</div><h2>Du är med!</h2>
      <p>Titta på TV:n – quizet börjar snart.</p><button class="link" id="edit">Byt namn eller lag</button></div>`;
    else if (s.phase === 'question') html = questionView(s);
    else if (s.phase === 'reveal') html = revealView(s);
    else html = scoreView(s);
    app.innerHTML = top + html;
    bind(s);
    tick();
  }

  function myAnswerText(s) {
    if (s.q.type === 'choice') return s.q.options[s.my];
    if (s.q.type === 'text') return '”' + s.my + '”';
    return 'Nålen är satt 📍';
  }

  function questionView(s) {
    const q = s.q;
    const head = `<div class="pq"><div class="pmeta"><span>Fråga ${s.qi + 1}/${s.total} · ${TYPE_LABEL[q.type]}</span><span id="ptimer" class="ptimer"></span></div>
      <p class="ptext">${esc(q.text)}</p></div>`;
    if (s.answered) return head + `<div class="pcard center"><div class="big">✅</div><h2>Svar inskickat</h2>
      <p>${esc(myAnswerText(s))}</p><p class="muted">Titta på TV:n!</p></div>`;
    if (q.type === 'choice') return head + `<div class="pchoices">${q.options.map((o, i) =>
      `<button class="pchoice" data-i="${i}" style="--c:${OPT_COLORS[i % 4]}"><span class="shape">${OPT_SHAPES[i % 4]}</span>${esc(o)}</button>`).join('')}</div>`;
    if (q.type === 'text') return head + `<div class="pcard"><input id="ans" maxlength="60" autocomplete="off" placeholder="Ditt svar">
      <button class="btn" id="send">Skicka</button></div>`;
    return head + `<div class="pmapwrap"><div id="pmap"></div><button class="btn" id="send" disabled>Tryck på kartan för att sätta nålen</button></div>`;
  }

  function revealView(s) {
    const r = s.result || {}, q = s.q;
    const ok = q.type === 'map' ? r.points > 0 : r.correct;
    let icon, title;
    if (!s.answered) { icon = '⌛'; title = 'Inget svar'; }
    else if (q.type === 'map') { icon = r.points >= 800 ? '🎯' : r.points > 0 ? '👍' : '🙈'; title = r.points >= 800 ? 'Prickskytt!' : r.points > 0 ? 'Inte illa!' : 'Långt bort…'; }
    else { icon = ok ? '🎉' : '😬'; title = ok ? 'Rätt!' : 'Fel'; }
    return `<div class="pcard center ${ok ? 'good' : 'bad'}"><div class="big">${icon}</div><h2>${title}</h2>
      ${q.type === 'map' && r.km != null ? `<p>Du var ${fmtKm(r.km)} ifrån</p>` : ''}
      <p class="pts">+${r.points || 0} p</p><p class="muted">Rätt svar: <b>${esc(r.answerText)}</b></p></div>`;
  }

  function scoreView(s) {
    const order = s.teams.map((t, i) => ({ t, i, s: s.teamScores[i] })).sort((a, b) => b.s - a.s);
    const tie = order.length > 1 && order[0].s === order[1].s;
    const h = s.phase === 'end' ? (tie ? 'Oavgjort!' : '🏆 ' + esc(order[0].t) + ' vinner!') : 'Ställning';
    return `<div class="pcard center"><h2>${h}</h2>
      ${order.map(o => `<div class="prow" style="--c:${TEAM_COLORS[o.i % 4]}"><span>${esc(o.t)}</span><b>${o.s}</b></div>`).join('')}
      <p class="muted">Du: ${s.me.score} p · plats ${s.rank} av ${s.nPlayers}</p></div>`;
  }

  function bind(s) {
    const e = $('#edit');
    if (e) e.onclick = screenJoin;
    if (s.phase !== 'question' || s.answered) return;
    const q = s.q;
    if (q.type === 'choice') {
      document.querySelectorAll('.pchoice').forEach(b => b.onclick = () => answer(+b.dataset.i, b));
    } else if (q.type === 'text') {
      const inp = $('#ans');
      $('#send').onclick = () => { const v = inp.value.trim(); if (v) answer(v); };
      inp.onkeydown = ev => { if (ev.key === 'Enter') $('#send').click(); };
    } else if (typeof L !== 'undefined') {
      pmap = L.map('pmap', { worldCopyJump: true }).setView(q.center || [20, 0], q.zoom || 2);
      L.tileLayer(OSM_URL, { attribution: OSM_ATTR, maxZoom: 18 }).addTo(pmap);
      const icon = L.divIcon({ className: 'pin', html: '📍', iconSize: [40, 40], iconAnchor: [20, 38] });
      let mk = null;
      const btn = $('#send');
      pmap.on('click', ev => {
        if (mk) mk.setLatLng(ev.latlng); else mk = L.marker(ev.latlng, { draggable: true, icon }).addTo(pmap);
        btn.disabled = false; btn.textContent = 'Lås svar 📍';
      });
      btn.onclick = () => { if (!mk) return; const ll = mk.getLatLng().wrap(); answer({ lat: ll.lat, lng: ll.lng }); };
      setTimeout(() => pmap && pmap.invalidateSize(), 150);
    }
  }

  function answer(v, el) {
    if (pendingAt) return;
    if (Date.now() > deadline + 500) { toast('Tiden är ute!'); return; }
    if (!send({ t: 'answer', qi: st.qi, value: v })) return;
    pendingAt = Date.now();
    if (el) el.classList.add('picked');
    document.querySelectorAll('.pchoice, #send').forEach(b => b.disabled = true);
  }

  function tick() {
    const t = $('#ptimer');
    if (!t || !st || st.phase !== 'question' || st.answered) return;
    const rem = Math.ceil((deadline - Date.now()) / 1000);
    t.textContent = rem > 0 ? '⏱ ' + rem : 'Tiden är ute';
    t.classList.toggle('low', rem <= 5);
    if (rem <= 0) document.querySelectorAll('.pchoice, #send').forEach(b => b.disabled = true);
    // Om svaret aldrig bekräftades (tappad anslutning): lås upp igen
    if (pendingAt && Date.now() - pendingAt > 4000) { pendingAt = 0; lastKey = ''; render(); }
  }
  setInterval(tick, 250);

  let toastTimer;
  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.className = 'show';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = '', 2500);
  }

  // ---------- Nätverk ----------
  function onData(d) {
    if (!d) return;
    if (d.t === 'hello') {
      hello = d;
      if (editing) return;
      if (name && team !== null && team < d.teams.length && get('nq-room') === room) send({ t: 'join', pid, name, team });
      else screenJoin();
    } else if (d.t === 'state') {
      st = d;
      if (!editing) render();
    }
  }
  function send(o) {
    if (conn && conn.open) { try { conn.send(o); return true; } catch (e) { } }
    toast('Inte ansluten – försöker igen…');
    connect();
    return false;
  }
  function setNet(ok) { netEl.className = 'net ' + (ok ? 'ok' : 'bad'); netEl.textContent = ok ? '' : 'Återansluter…'; }
  function teardown() {
    clearTimeout(retryTimer);
    if (conn) { try { conn.close(); } catch (e) { } conn = null; }
    if (peer) { try { peer.destroy(); } catch (e) { } peer = null; }
    connecting = false;
  }
  function later() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, Math.min(8000, 800 * Math.pow(1.6, retry++)));
  }
  function connect() {
    if (!room) { screenCode(); return; }
    if (typeof Peer === 'undefined') { app.innerHTML = '<div class="pcard"><p class="err">Kunde inte ladda PeerJS. Har du internet?</p></div>'; return; }
    if (connecting || (conn && conn.open)) return;
    connecting = true; clearTimeout(retryTimer);
    if (!st && !hello) screenWait('Ansluter till ' + room + '…');
    if (!peer || peer.destroyed || peer.disconnected) {
      if (peer) { try { peer.destroy(); } catch (e) { } }
      peer = new Peer();
      peer.on('error', onPeerError);
    }
    const p = peer;
    const go = () => {
      if (p !== peer) return;
      const c = peer.connect(PEER_PREFIX + room, { reliable: true });
      conn = c;
      const to = setTimeout(() => {
        if (!c.open && conn === c) { try { c.close(); } catch (e) { } conn = null; connecting = false; later(); }
      }, 10000);
      c.on('open', () => { clearTimeout(to); connecting = false; retry = 0; setNet(true); });
      c.on('data', onData);
      c.on('close', () => { clearTimeout(to); if (conn === c) { conn = null; connecting = false; setNet(false); later(); } });
      c.on('error', () => { });
    };
    if (peer.open) go(); else peer.once('open', go);
  }
  function onPeerError(e) {
    console.warn('peer error', e.type, e);
    connecting = false;
    if (e.type === 'peer-unavailable') {
      conn = null;
      if (!st && !hello && retry >= 2) { retry = 0; screenCode('Hittar inget quiz med koden ' + room + '. Kolla koden på TV:n.'); return; }
    } else if (peer) { try { peer.destroy(); } catch (_) { } peer = null; }
    setNet(false); later();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !(conn && conn.open)) { retry = 0; connecting = false; connect(); }
  });

  if (!room) screenCode(); else connect();
})();
