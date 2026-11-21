// Gemensamma hjälpfunktioner för TV- och mobilsidan
const PEER_PREFIX = 'nyarsquiz-v1-';
const TEAM_COLORS = ['#ff4d6d', '#3fa7ff', '#ffd23f', '#5ee08a'];
const OPT_COLORS = ['#e63950', '#2f7de1', '#d99a0b', '#2fae5f'];
const OPT_SHAPES = ['▲', '◆', '●', '■'];
const TYPE_LABEL = { choice: 'Flerval', text: 'Fritext', map: 'Kartnål' };
const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '© OpenStreetMap';

function $(s) { return document.querySelector(s); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[.,!?;:'"()\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function lev(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Godkänner små stavfel: 1 fel för ord ≥5 tecken, 2 fel för ≥9 tecken
function textMatch(value, q) {
  const x = norm(value);
  if (!x) return false;
  return [q.answer].concat(q.accept || []).map(norm).some(c => {
    if (c === x) return true;
    const tol = c.length >= 9 ? 2 : c.length >= 5 ? 1 : 0;
    return lev(c, x) <= tol;
  });
}

function haversine(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function fmtKm(km) {
  if (km == null) return '';
  if (km < 1) return Math.round(km * 1000) + ' m';
  if (km < 10) return km.toFixed(1).replace('.', ',') + ' km';
  return Math.round(km).toLocaleString('sv-SE') + ' km';
}
