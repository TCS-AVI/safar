// Safar – shared trip planner. Plain ES modules, no build step.
import { firebaseConfig } from './firebase-config.js';

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const inr = n => '₹' + Math.round(+n || 0).toLocaleString('en-IN');
const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const toDate = d => new Date(d + 'T00:00:00');
const addDays = (d, n) => { const x = toDate(d); x.setDate(x.getDate() + n); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
const fmt = d => d ? toDate(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'No date';
const fmtS = d => d ? toDate(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); };

/* ---------- constants ---------- */
const MODES = [['train', '🚆 Train'], ['bus', '🚌 Bus'], ['flight', '✈️ Flight'], ['cab', '🚗 Cab / Car'], ['other', '🧭 Other']];
const MODE_ICO = { train: '🚆', bus: '🚌', flight: '✈️', cab: '🚗', other: '🧭' };
const MODE_COLOR = { train: '#2f6fb0', bus: '#2f8f4e', flight: '#8e44ad', cab: '#d98a00', other: '#7a6a58' };
const BSTAT = [['notbooked', 'Not booked'], ['pending', 'Planned / pending'], ['waiting', 'Waitlist'], ['rac', 'RAC'], ['confirmed', 'Confirmed ✓'], ['cancelled', 'Cancelled']];
const SSTAT = [['notbooked', 'Not booked'], ['pending', 'Pending'], ['booked', 'Booked ✓'], ['cancelled', 'Cancelled']];
const VEG = [['unknown', 'Not checked'], ['pure', 'Pure veg 🌱'], ['options', 'Veg options available'], ['non', 'Mostly non-veg']];
const VEG_L = { pure: 'Pure veg 🌱', options: 'Veg options', non: 'Mostly non-veg', unknown: '' };
const CATS = [['fort', '🏰 Fort / Palace'], ['safari', '🐆 Safari'], ['dunes', '🏜️ Desert / Dunes'], ['temple', '🛕 Temple / Heritage'], ['nature', '🌅 Lake / Nature'], ['market', '🛍️ Market / Shopping'], ['food', '🍛 Food'], ['museum', '🏛️ Museum'], ['other', '📍 Other']];
const CAT_ICO = { fort: '🏰', safari: '🐆', dunes: '🏜️', temple: '🛕', nature: '🌅', market: '🛍️', food: '🍛', museum: '🏛️', other: '📍' };
const ECATS = [['food', '🍛 Food & drinks'], ['stay', '🏨 Stay'], ['transport', '🚕 Local transport'], ['tickets', '🎟️ Tickets / Safari'], ['shopping', '🛍️ Shopping'], ['other', '🧾 Other']];

const TIX = [['gate', 'Pay at gate / none needed'], ['tobook', 'Need to book ahead'], ['booked', 'Booked ✓']];
const GROUPS = [['pack', '🎒 Packing'], ['docs', '📄 Documents & IDs'], ['todo', '✅ To-do before & during']];
const COLS = ['bookings', 'stays', 'places', 'expenses', 'tasks', 'contacts'];

const CITY = {
  'sam sand dunes': [26.8333, 70.5167], 'sam dunes': [26.8333, 70.5167], 'sawai madhopur': [26.0173, 76.5026], 'ranthambore': [26.0173, 76.5026],
  'mount abu': [24.5926, 72.7156], 'dubai': [25.2532, 55.3657], 'jammu': [32.7266, 74.857], 'srinagar': [34.0837, 74.7973],
  'delhi': [28.6139, 77.209], 'jaipur': [26.9124, 75.7873], 'jodhpur': [26.2389, 73.0243], 'jaisalmer': [26.9157, 70.9083],
  'udaipur': [24.5854, 73.7125], 'pushkar': [26.4876, 74.5518], 'ajmer': [26.4499, 74.6399], 'bikaner': [28.0229, 73.3119],
  'chittorgarh': [24.8887, 74.6269], 'kumbhalgarh': [25.1528, 73.5871]
};
const CITY_KEYS = Object.keys(CITY).sort((a, b) => b.length - a.length);

/* ---------- state ---------- */
const DEFAULT = () => ({
  trip: { name: 'Rajasthan Trip', start: '', end: '', budget: 100000, aedRate: 24, people: ['Me', 'Her'] },
  bookings: [], stays: [], places: [], expenses: [], tasks: [], contacts: [], deleted: {}, updatedAt: 0
});
let S = (() => { try { return { ...DEFAULT(), ...JSON.parse(localStorage.getItem('safar.state') || '{}') }; } catch { return DEFAULT(); } })();
const UI = { tab: 'home', bookMode: 'all', placeFilter: 'all', mapDay: 'all' };
let map = null;

const localSave = () => localStorage.setItem('safar.state', JSON.stringify(S));
function save() { S.updatedAt = Date.now(); localSave(); pushCloud(); }
const touch = it => { it._u = Date.now(); return it; };

/* Merge two copies of the trip item-by-item (newest edit of each item wins; deletions are remembered),
   so two people editing different things never overwrite each other. */
function merge(a, b) {
  const out = { ...DEFAULT(), ...a };
  const del = { ...(a.deleted || {}) };
  Object.entries(b.deleted || {}).forEach(([k, t]) => { del[k] = Math.max(del[k] || 0, t); });
  COLS.forEach(c => {
    const m = new Map();
    [...(a[c] || []), ...(b[c] || [])].forEach(it => { const o = m.get(it.id); if (!o || (it._u || 0) > (o._u || 0)) m.set(it.id, it); });
    out[c] = [...m.values()].filter(it => !(del[it.id] && del[it.id] >= (it._u || 0))).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  });
  out.deleted = del;
  out.trip = ((b.trip && b.trip._u) || 0) > ((a.trip && a.trip._u) || 0) ? b.trip : (a.trip || b.trip || DEFAULT().trip);
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}
const sig = s => COLS.map(c => (s[c] || []).map(i => i.id + ':' + (i._u || 0)).sort().join(',')).join('|') + '#' + ((s.trip && s.trip._u) || 0) + '#' + Object.entries(s.deleted || {}).map(([k, v]) => k + ':' + v).sort().join(',');

/* ---------- cloud sync (optional) ---------- */
let cloud = null, unsub = null, fb = null;
const badge = t => { $('#syncBadge').textContent = t; };

async function startCloud() {
  const code = localStorage.getItem('safar.code');
  if (!firebaseConfig) return badge('Local only');
  if (!code) return badge('Set sync code');
  try {
    badge('Syncing…');
    if (!fb) {
      const v = '11.0.2', base = `https://www.gstatic.com/firebasejs/${v}/`;
      const [app, auth, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
      const a = app.initializeApp(firebaseConfig);
      await auth.signInAnonymously(auth.getAuth(a));
      fb = { db: fs.getFirestore(a), doc: fs.doc, setDoc: fs.setDoc, onSnapshot: fs.onSnapshot };
    }
    const ref = fb.doc(fb.db, 'trips', code);
    cloud = { ref };
    if (unsub) unsub();
    unsub = fb.onSnapshot(ref, snap => {
      if (!snap.exists()) { pushCloud(); return; }
      if (snap.metadata.hasPendingWrites) return;
      let remote; try { remote = JSON.parse(snap.data().state); } catch { return; }
      const merged = merge(S, remote);
      if (sig(merged) !== sig(S)) { S = merged; localSave(); render(); }
      if (sig(merged) !== sig(remote)) pushCloud();
      badge('Synced ✓');
    }, () => badge('Offline'));
  } catch (e) { console.error(e); badge('Offline'); }
}
function pushCloud() {
  if (!cloud || !fb) return;
  fb.setDoc(cloud.ref, { state: JSON.stringify(S) }).then(() => badge('Synced ✓')).catch(() => badge('Offline'));
}
function askCode() {
  if (!firebaseConfig) { toast('Add your Firebase config in firebase-config.js to sync'); return; }
  const c = prompt('Shared trip code – use the SAME code on both phones (min 8 chars), e.g. rajasthan-nov26-k7x9q2', localStorage.getItem('safar.code') || '');
  if (c && c.trim().length >= 8) { localStorage.setItem('safar.code', c.trim()); startCloud(); } else if (c) toast('Code must be at least 8 characters');
}

/* ---------- lookups ---------- */
function coordFor(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  for (const k of CITY_KEYS) if (n.includes(k)) return CITY[k];
  const p = S.places.find(p => p.lat && p.lng && ((p.city || '').toLowerCase() === n || p.name.toLowerCase().includes(n)));
  return p ? [p.lat, p.lng] : null;
}
const label = (list, v) => (list.find(x => x[0] === v) || [, v || ''])[1];
const pill = (cls, text) => text ? `<span class="pill ${cls}">${esc(text)}</span>` : '';
const people = () => S.trip.people || ['Me', 'Her'];

function events() {
  const ev = [];
  S.bookings.filter(b => b.date).forEach(b => ev.push({ date: b.date, time: b.time || '', kind: 'booking', id: b.id, ico: MODE_ICO[b.mode] || '🧭', title: `${b.from} → ${b.to}`, sub: [(b.who === '0' || b.who === '1') && '👤 ' + people()[+b.who], b.ref && 'Ref ' + b.ref, b.cost && inr(b.cost)].filter(Boolean).join(' · '), stl: label(BSTAT, b.status), pill: pill(b.status, label(BSTAT, b.status)) }));
  S.stays.forEach(h => {
    if (h.checkin) ev.push({ date: h.checkin, time: '14:00', kind: 'stay', id: h.id, ico: '🏨', title: 'Check-in: ' + h.name, sub: [h.city, VEG_L[h.veg]].filter(Boolean).join(' · '), stl: label(SSTAT, h.status), pill: pill(h.status, label(SSTAT, h.status)) });
    if (h.checkout) ev.push({ date: h.checkout, time: '11:00', kind: 'stay', id: h.id, ico: '🧳', title: 'Check-out: ' + h.name, sub: h.city || '', pill: '' });
  });
  S.places.filter(p => p.date).forEach(p => ev.push({ date: p.date, time: p.time || '12:00', kind: 'place', id: p.id, ico: CAT_ICO[p.category] || '📍', title: p.name, sub: [p.city, VEG_L[p.veg], p.cost && 'Tickets ' + inr(p.cost), p.notes].filter(Boolean).join(' · '), pill: p.visited ? pill('visited', 'Visited ✓') : '' }));
  return ev.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/* ---------- forms ---------- */
const FORMS = {
  booking: { title: 'Transport booking', list: 'bookings', fields: [
    { k: 'mode', l: 'Type', t: 'select', o: MODES, def: 'train', w: 'h' }, { k: 'status', l: 'Status', t: 'select', o: BSTAT, def: 'notbooked', w: 'h' },
    { k: 'from', l: 'From', req: 1, w: 'h' }, { k: 'to', l: 'To', req: 1, w: 'h' },
    { k: 'date', l: 'Date', t: 'date', req: 1, w: 'h' }, { k: 'time', l: 'Departure time (local)', t: 'time', w: 'h' },
    { k: 'who', l: 'Who is travelling?', t: 'select', o: () => [['both', 'Both of us'], ['0', people()[0]], ['1', people()[1]]], def: 'both', w: 'h' }, { k: 'cost', l: 'Total cost (₹)', t: 'number', w: 'h' },
    { k: 'ref', l: 'PNR / ticket / booking ref' }, { k: 'link', l: 'Booking link (optional)' },
    { k: 'notes', l: 'Notes (train no., seat, coach, who is travelling…)', t: 'textarea' }] },
  stay: { title: 'Hotel / stay', list: 'stays', fields: [
    { k: 'name', l: 'Hotel / camp name', req: 1 }, { k: 'city', l: 'City / area (e.g. Jaisalmer)' },
    { k: 'checkin', l: 'Check-in', t: 'date', req: 1, w: 'h' }, { k: 'checkout', l: 'Check-out', t: 'date', w: 'h' },
    { k: 'status', l: 'Booking status', t: 'select', o: SSTAT, def: 'notbooked', w: 'h' }, { k: 'veg', l: 'Vegetarian food?', t: 'select', o: VEG, def: 'unknown', w: 'h' },
    { k: 'cost', l: 'Total cost (₹)', t: 'number', w: 'h' }, { k: 'ref', l: 'Booking ref', w: 'h' },
    { k: 'phone', l: 'Hotel phone (tap-to-call on the day)', t: 'tel' },
    { k: 'notes', l: 'Notes (room type, breakfast, pickup…)', t: 'textarea' }] },
  place: { title: 'Place to visit', list: 'places', fields: [
    { k: 'name', l: 'Place name', req: 1 }, { k: 'city', l: 'City / area (helps the map)' },
    { k: 'date', l: 'Planned date', t: 'date', w: 'h' }, { k: 'time', l: 'Time', t: 'time', w: 'h' },
    { k: 'category', l: 'Category', t: 'select', o: CATS, def: 'fort', w: 'h' }, { k: 'veg', l: 'Vegetarian food?', t: 'select', o: VEG, def: 'unknown', w: 'h' },
    { k: 'tix', l: 'Ticket / booking needed?', t: 'select', o: TIX, def: 'gate' }, { k: 'cost', l: 'Tickets / entry cost for both (₹)', t: 'number' }, { k: 'lat', l: 'Latitude', t: 'number', w: 'h' }, { k: 'lng', l: 'Longitude', t: 'number', w: 'h' },
    { k: 'notes', l: 'Notes (timings, ticket, tips from her…)', t: 'textarea' }],
    extra: '<button type="button" class="btn ghost small" id="geo" style="margin-top:8px">📍 Find on map automatically</button>' },
  expense: { title: 'Expense', list: 'expenses', fields: [
    { k: 'title', l: 'What was it for?', req: 1 }, { k: 'date', l: 'Date', t: 'date', def: () => todayISO(), req: 1, w: 'h' },
    { k: 'category', l: 'Category', t: 'select', o: ECATS, def: 'food', w: 'h' },
    { k: 'amount', l: 'Amount', t: 'number', req: 1, w: 'h' }, { k: 'currency', l: 'Currency', t: 'select', o: [['INR', '₹ INR'], ['AED', 'AED']], def: 'INR', w: 'h' },
    { k: 'paidBy', l: 'Paid by', t: 'select', o: () => people().map((p, i) => [String(i), p]), def: '0', w: 'h' },
    { k: 'split', l: 'Split', t: 'select', o: [['equal', 'Split equally'], ['none', 'Only payer']], def: 'equal', w: 'h' }] },
  task: { title: 'Checklist item', list: 'tasks', fields: [
    { k: 'text', l: 'Item', req: 1 }, { k: 'group', l: 'List', t: 'select', o: GROUPS, def: 'todo', w: 'h' },
    { k: 'who', l: 'Whose job?', t: 'select', o: () => [['both', 'Both of us'], ['0', people()[0]], ['1', people()[1]]], def: 'both', w: 'h' },
    { k: 'due', l: 'Due date (optional – Trip health warns when close)', t: 'date' }] },
  contact: { title: 'Contact', list: 'contacts', fields: [
    { k: 'name', l: 'Name', req: 1 }, { k: 'role', l: 'Role (driver, hotel owner, family…)' },
    { k: 'phone', l: 'Phone', t: 'tel' }, { k: 'notes', l: 'Notes', t: 'textarea' }] },
  trip: { title: 'Trip settings', single: true, fields: [
    { k: 'name', l: 'Trip name', req: 1 }, { k: 'start', l: 'Start date', t: 'date', w: 'h' }, { k: 'end', l: 'End date', t: 'date', w: 'h' },
    { k: 'budget', l: 'Total budget (₹)', t: 'number', w: 'h' }, { k: 'aedRate', l: '1 AED = ₹ ?', t: 'number', w: 'h' },
    { k: 'p0', l: 'Person 1 name', w: 'h' }, { k: 'p1', l: 'Person 2 name', w: 'h' }] }
};

function fieldHTML(f, v) {
  const val = v[f.k] ?? '';
  const o = typeof f.o === 'function' ? f.o() : f.o;
  const id = `f_${f.k}`;
  let ctl;
  if (f.t === 'select') ctl = `<select name="${f.k}" id="${id}">${o.map(([a, b]) => `<option value="${esc(a)}" ${String(val) === String(a) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
  else if (f.t === 'textarea') ctl = `<textarea name="${f.k}" id="${id}">${esc(val)}</textarea>`;
  else ctl = `<input name="${f.k}" id="${id}" type="${f.t || 'text'}" ${f.t === 'number' ? 'step="any" inputmode="decimal"' : ''} value="${esc(val)}" ${f.req ? 'required' : ''}>`;
  return `<div><label for="${id}">${esc(f.l)}${f.req ? ' *' : ''}</label>${ctl}</div>`;
}

function openForm(kind, item) {
  const F = FORMS[kind], modal = $('#modal'), form = $('#modalForm');
  let v;
  if (F.single) v = { ...S.trip, p0: people()[0], p1: people()[1] };
  else if (item) v = item;
  else v = Object.fromEntries(F.fields.filter(f => f.def !== undefined).map(f => [f.k, typeof f.def === 'function' ? f.def() : f.def]));
  let html = `<h3>${item ? 'Edit' : 'Add'} · ${F.title}</h3>`, buf = [];
  const flush = () => { if (buf.length) { html += `<div class="two">${buf.join('')}</div>`; buf = []; } };
  F.fields.forEach(f => { const h = fieldHTML(f, v); if (f.w === 'h') { buf.push(h); if (buf.length === 2) flush(); } else { flush(); html += h; } });
  flush();
  html += (F.extra || '') + `<div class="actions">${item && !F.single ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}<button type="button" class="btn ghost" id="cancel">Cancel</button><button type="submit" class="btn">Save</button></div>`;
  form.innerHTML = html;
  $('#cancel').onclick = () => modal.close();
  if (item && !F.single && $('#del')) $('#del').onclick = () => { if (confirm('Delete this?')) { S[F.list] = S[F.list].filter(x => x.id !== item.id); S.deleted = S.deleted || {}; S.deleted[item.id] = Date.now(); save(); modal.close(); render(); } };
  const geo = $('#geo');
  if (geo) geo.onclick = async () => {
    const q = [form.elements['name'].value, form.elements['city'].value, 'Rajasthan India'].filter(Boolean).join(', ');
    geo.textContent = 'Searching…';
    try { const g = await geocode(q); if (g) { form.elements['lat'].value = g.lat.toFixed(5); form.elements['lng'].value = g.lng.toFixed(5); geo.textContent = '✓ Found – check the map later'; } else geo.textContent = 'Not found – enter lat/lng manually'; }
    catch { geo.textContent = 'Search failed (offline?)'; }
  };
  form.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(form), out = {};
    F.fields.forEach(f => { let x = fd.get(f.k); if (f.t === 'number') x = x === '' || x === null ? '' : Number(x); out[f.k] = x; });
    if (F.single) {
      const { p0, p1, ...rest } = out;
      S.trip = { ...S.trip, ...rest, people: [p0 || 'Me', p1 || 'Her'], _u: Date.now() };
    } else if (item) { Object.assign(item, out); touch(item); }
    else { const n = Date.now(); S[F.list].push({ id: uid(), ...out, _u: n, _o: n, ...(kind === 'task' ? { done: false } : {}) }); }
    save(); modal.close(); render(); toast('Saved');
  };
  modal.showModal();
}
async function geocode(q) {
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q));
  const j = await r.json();
  return j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
}

/* ---------- views ---------- */
const empty = (msg, btn = '') => `<div class="empty">${msg}<div style="margin-top:12px">${btn}</div></div>`;
const addBtn = (kind, text) => `<button class="btn small" data-act="add" data-kind="${kind}">＋ ${text}</button>`;
const sampleBtn = '<button class="btn ghost" data-act="sample">✨ Load Rajasthan sample trip</button>';

function totals() {
  const rate = +S.trip.aedRate || 24;
  const spent = S.expenses.reduce((a, e) => a + (+e.amount || 0) * (e.currency === 'AED' ? rate : 1), 0);
  const live = x => x.status !== 'cancelled';
  const booked = S.bookings.filter(b => b.status === 'confirmed').reduce((a, b) => a + (+b.cost || 0), 0) + S.stays.filter(h => h.status === 'booked').reduce((a, h) => a + (+h.cost || 0), 0);
  const planned = S.bookings.filter(b => live(b) && b.status !== 'confirmed').reduce((a, b) => a + (+b.cost || 0), 0) + S.stays.filter(h => live(h) && h.status !== 'booked').reduce((a, h) => a + (+h.cost || 0), 0) + S.places.filter(p => !p.visited).reduce((a, p) => a + (+p.cost || 0), 0);
  return { spent, booked, planned, budget: +S.trip.budget || 0, rate };
}

function viewHome() {
  const t = S.trip, today = todayISO();
  const nb = S.bookings.filter(b => b.status !== 'cancelled'), cb = nb.filter(b => b.status === 'confirmed').length;
  const ns = S.stays.filter(h => h.status !== 'cancelled'), bs = ns.filter(h => h.status === 'booked').length;
  const tot = totals(), used = tot.spent + tot.booked, pct = tot.budget ? Math.min(100, used / tot.budget * 100) : 0;
  let countdown = '';
  if (t.start) { const d = diffDays(today, t.start); countdown = d > 0 ? `<b>${d}</b> days to go` : (t.end && today > t.end ? 'Trip complete 🎉' : `Day <b>${1 - d}</b> of the trip`); }
  const todo = [
    ...S.bookings.filter(b => !['confirmed', 'cancelled'].includes(b.status)).map(b => ({ date: b.date, kind: 'booking', id: b.id, ico: MODE_ICO[b.mode], t: `${b.from} → ${b.to}`, st: b.status, lab: label(BSTAT, b.status) })),
    ...S.stays.filter(h => !['booked', 'cancelled'].includes(h.status)).map(h => ({ date: h.checkin, kind: 'stay', id: h.id, ico: '🏨', t: h.name, st: h.status, lab: label(SSTAT, h.status) }))
  ].sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  const next = events().filter(e => e.date >= today).slice(0, 4);
  return `
  <div class="card"><div class="row"><div><h3>${esc(t.name)}</h3><div class="muted">${t.start ? fmt(t.start) : 'Set dates'}${t.end ? ' → ' + fmt(t.end) : ''}</div></div><div style="text-align:right">${countdown}</div></div></div>
  <div class="grid2" style="margin-bottom:10px">
    <div class="stat"><span class="muted">🎫 Transport confirmed</span><b>${cb}/${nb.length}</b></div>
    <div class="stat"><span class="muted">🏨 Hotels booked</span><b>${bs}/${ns.length}</b></div>
    <div class="stat"><span class="muted">📍 Places planned</span><b>${S.places.length}</b></div>
    <div class="stat"><span class="muted">✅ Visited</span><b>${S.places.filter(p => p.visited).length}</b></div>
  </div>
  <div class="card"><div class="row"><h3>💰 Budget</h3><span class="muted">${inr(used)} of ${inr(tot.budget)}</span></div><div class="bar" style="margin-top:8px"><i class="${used > tot.budget ? 'over' : ''}" style="width:${pct}%"></i></div></div>
  ${healthCard()}${todayCard()}${weatherCard()}
  ${!S.bookings.length && !S.stays.length && !S.places.length ? empty('Nothing planned yet. Start fresh or load an editable example.', sampleBtn) : ''}
  <div class="h2">⚠️ Still to book <span>${todo.length}</span></div>
  ${todo.length ? todo.map(x => `<div class="card"><div class="row"><div class="grow" data-act="edit" data-kind="${x.kind}" data-id="${x.id}" style="cursor:pointer"><b>${x.ico} ${esc(x.t)}</b><div class="muted">${fmt(x.date)}</div></div>${pill(x.st, x.lab)}</div></div>`).join('') : '<div class="muted" style="padding:4px 2px">All booked. 🎉</div>'}
  <div class="h2">Coming up</div>
  ${next.length ? next.map(e => `<div class="card"><div class="item" data-act="edit" data-kind="${e.kind}" data-id="${e.id}" style="cursor:pointer;border:0"><div class="ico">${e.ico}</div><div class="grow"><b>${esc(e.title)}</b><div class="muted">${fmt(e.date)}${e.time && e.kind === 'booking' ? ' · ' + e.time : ''}</div></div>${e.pill}</div></div>`).join('') : '<div class="muted" style="padding:4px 2px">Nothing upcoming.</div>'}
  <div class="h2">Settings</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn ghost small" data-act="edit" data-kind="trip">⚙️ Trip settings</button>
    <button class="btn ghost small" data-act="code">🔗 Sync code</button>
    <button class="btn ghost small" data-act="ics">📅 Add to calendar</button>
    <button class="btn ghost small" data-act="share">📤 Share summary</button>
    <button class="btn ghost small" data-act="print">🖨️ Print</button>
    <button class="btn ghost small" data-act="backup">⬇️ Backup</button>
    <button class="btn ghost small" data-act="restore">⬆️ Restore</button>
    ${S.bookings.length || S.places.length ? '<button class="btn ghost small" data-act="sample">✨ Load sample</button>' : ''}
  </div>`;
}

function viewPlan() {
  const ev = events();
  if (!ev.length) return empty('Your day-by-day plan appears here once you add dated bookings, stays or places.', sampleBtn);
  const dates = ev.map(e => e.date), first = dates[0], last = dates[dates.length - 1], base = S.trip.start || first, today = todayISO();
  let html = '', d = first, guard = 0;
  while (d <= last && guard++ < 120) {
    const items = ev.filter(e => e.date === d);
    const stay = S.stays.filter(h => h.checkin && h.checkout && h.checkin < d && d < h.checkout);
    const cities = [...new Set(items.filter(e => e.kind === 'place').map(e => S.places.find(p => p.id === e.id)?.city).filter(Boolean))].join(', ');
    html += `<div class="day"><h4>${d === today ? '🟢 ' : ''}Day ${diffDays(base, d) + 1} · ${fmt(d)}${cities ? ' · ' + esc(cities) : ''}</h4>
      ${items.map(e => `<div class="item" data-act="edit" data-kind="${e.kind}" data-id="${e.id}" style="cursor:pointer"><div class="ico">${e.ico}</div><div class="grow"><b>${esc(e.title)}</b>${e.sub ? `<div class="muted">${esc(e.sub)}</div>` : ''}</div>${e.pill}</div>`).join('')}
      ${stay.map(h => `<div class="item"><div class="ico">🌙</div><div class="grow muted">Staying at ${esc(h.name)}</div></div>`).join('')}
      ${!items.length && !stay.length ? '<div class="muted">Free day – add something 🙂</div>' : ''}</div>`;
    d = addDays(d, 1);
  }
  return `<div class="h2">Day-by-day <span>${addBtn('place', 'Place')}</span></div>${html}`;
}

function viewBook() {
  const modes = [['all', 'All'], ...MODES.map(m => [m[0], m[1]])];
  const list = S.bookings.filter(b => UI.bookMode === 'all' || b.mode === UI.bookMode).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const sel = (kind, id, cur, opts) => `<select data-act="setstat" data-kind="${kind}" data-id="${id}" style="width:auto;max-width:140px;font-size:12px;padding:5px">${opts.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `
  <div class="h2">Transport <span>${addBtn('booking', 'Add')}</span></div>
  <div class="chips">${modes.map(([v, l]) => `<button class="chip ${UI.bookMode === v ? 'on' : ''}" data-act="bookmode" data-v="${v}">${l}</button>`).join('')}</div>
  ${list.length ? list.map(b => `<div class="card"><div class="row" style="align-items:flex-start"><div class="grow" data-act="edit" data-kind="booking" data-id="${b.id}" style="cursor:pointer"><h3>${MODE_ICO[b.mode]} ${esc(b.from)} → ${esc(b.to)} ${whoPill(b.who)}</h3><div class="muted">${fmt(b.date)}${b.time ? ' · ' + esc(b.time) : ''}${b.ref ? ' · Ref ' + esc(b.ref) : ''}${b.cost ? ' · ' + inr(b.cost) : ''}</div>${b.notes ? `<div class="muted">${esc(b.notes)}</div>` : ''}${b.link ? `<div style="margin-top:4px"><a href="${esc(b.link)}" target="_blank" rel="noopener">Open booking site ↗</a></div>` : ''}</div><div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">${pill(b.status, label(BSTAT, b.status))}${sel('booking', b.id, b.status, BSTAT)}</div></div></div>`).join('') : empty('No transport yet. Add trains, buses, flights and cabs.')}
  <div class="h2">Hotels & stays <span>${addBtn('stay', 'Add')}</span></div>
  ${S.stays.length ? [...S.stays].sort((a, b) => (a.checkin || '').localeCompare(b.checkin || '')).map(h => `<div class="card"><div class="row" style="align-items:flex-start"><div class="grow" data-act="edit" data-kind="stay" data-id="${h.id}" style="cursor:pointer"><h3>🏨 ${esc(h.name)}</h3><div class="muted">${esc(h.city || '')} · ${fmtS(h.checkin)}${h.checkout ? ' → ' + fmtS(h.checkout) : ''}${h.cost ? ' · ' + inr(h.cost) : ''}</div><div style="margin-top:4px">${pill(h.veg === 'non' ? 'bad' : 'veg', VEG_L[h.veg])}${h.phone ? ` <a href="tel:${esc(h.phone)}">📞 ${esc(h.phone)}</a>` : ''}</div>${h.notes ? `<div class="muted">${esc(h.notes)}</div>` : ''}</div><div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">${pill(h.status, label(SSTAT, h.status))}${sel('stay', h.id, h.status, SSTAT)}</div></div></div>`).join('') : empty('No hotels yet.')}`;
}

function viewPlaces() {
  const f = UI.placeFilter;
  const filters = [['all', 'All'], ['veg', '🌱 Veg-friendly'], ['todo', 'Not visited'], ['nodate', 'No date yet'], ...CATS.slice(0, 5)];
  const ok = p => f === 'all' || (f === 'veg' && ['pure', 'options'].includes(p.veg)) || (f === 'todo' && !p.visited) || (f === 'nodate' && !p.date) || p.category === f;
  const list = S.places.filter(ok).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const card = p => `<div class="card"><div class="row" style="align-items:flex-start"><div class="grow" data-act="edit" data-kind="place" data-id="${p.id}" style="cursor:pointer"><h3>${CAT_ICO[p.category] || '📍'} ${esc(p.name)}</h3><div class="muted">${p.date ? fmt(p.date) : 'No date yet'}${p.time ? ' · ' + esc(p.time) : ''}${p.city ? ' · ' + esc(p.city) : ''}${p.cost ? ' · 🎟️ ' + inr(p.cost) : ''}</div><div style="margin:4px 0">${pill(p.veg === 'non' ? 'bad' : 'veg', VEG_L[p.veg])} ${p.tix === 'tobook' ? pill('pending', 'Book ahead') : p.tix === 'booked' ? pill('booked', 'Ticket booked ✓') : ''} ${p.visited ? pill('visited', 'Visited ✓') : ''}</div>${p.notes ? `<div class="muted">${esc(p.notes)}</div>` : ''}</div>
    <div style="display:flex;flex-direction:column;gap:6px"><button class="btn small ${p.visited ? 'ghost' : ''}" data-act="visit" data-id="${p.id}">${p.visited ? 'Undo' : '✓ Visited'}</button>${p.lat && p.lng ? `<a class="btn ghost small" style="text-decoration:none;text-align:center" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}">Open map</a>` : ''}</div></div></div>`;
  return `<div class="h2">Places to visit <span>${S.places.length}</span></div>
  <div class="chips">${filters.map(([v, l]) => `<button class="chip ${f === v ? 'on' : ''}" data-act="placefilter" data-v="${v}">${l}</button>`).join('')}</div>
  ${list.length ? list.map(card).join('') : empty('No places here yet.', sampleBtn)}
  <button class="btn fab" data-act="add" data-kind="place">＋</button>`;
}

function viewMap() {
  const dates = [...new Set(events().map(e => e.date))].sort();
  const base = S.trip.start || dates[0];
  return `<div class="chips"><button class="chip ${UI.mapDay === 'all' ? 'on' : ''}" data-act="mapday" data-v="all">Whole trip</button>${dates.map(d => `<button class="chip ${UI.mapDay === d ? 'on' : ''}" data-act="mapday" data-v="${d}">Day ${diffDays(base, d) + 1} · ${fmtS(d)}</button>`).join('')}</div>
  <div id="map"></div>
  <div class="legend">${MODES.slice(0, 4).map(([k, l]) => `<span><i style="border-color:${MODE_COLOR[k]};border-top-style:dashed"></i>${l.slice(3)}</span>`).join('')}<span>🔢 Places in order</span><span>🏨 Stays</span></div>
  <div class="muted">Tip: places need coordinates – use “Find on map automatically” when adding a place.</div>`;
}

function drawMap() {
  const el = $('#map'); if (!el) return;
  if (typeof L === 'undefined') { el.innerHTML = empty('The map needs an internet connection to load.'); return; }
  map = L.map(el).setView([26.5, 73.5], 6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map);
  const day = UI.mapDay, all = day === 'all', pts = [];
  // transport routes
  S.bookings.filter(b => b.status !== 'cancelled' && (all || b.date === day)).forEach(b => {
    const a = coordFor(b.from), c = coordFor(b.to); if (!a || !c) return;
    L.polyline([a, c], { color: MODE_COLOR[b.mode] || '#777', weight: 3, dashArray: '8 8', opacity: .85 }).addTo(map)
      .bindPopup(`<b>${MODE_ICO[b.mode]} ${esc(b.from)} → ${esc(b.to)}</b><br>${fmt(b.date)} ${esc(b.time || '')}<br>${esc(label(BSTAT, b.status))}`);
    [[a, b.from], [c, b.to]].forEach(([p, n]) => { L.circleMarker(p, { radius: 5, color: '#fff', weight: 2, fillColor: '#2b2118', fillOpacity: 1 }).addTo(map).bindTooltip(esc(n)); pts.push(p); });
  });
  // stays
  S.stays.filter(h => h.status !== 'cancelled' && (all || (h.checkin <= day && (h.checkout ? day < h.checkout : day === h.checkin)))).forEach(h => {
    const p = coordFor(h.city || h.name); if (!p) return;
    L.marker([p[0] + .012, p[1] + .012], { icon: L.divIcon({ className: '', html: '<div class="cityPin">🏨</div>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(map)
      .bindPopup(`<b>🏨 ${esc(h.name)}</b><br>${fmtS(h.checkin)}${h.checkout ? ' → ' + fmtS(h.checkout) : ''}<br>${esc(label(SSTAT, h.status))}`);
    pts.push(p);
  });
  // places (numbered in date order, joined by a line)
  const dated = S.places.filter(p => p.lat && p.lng && p.date && (all || p.date === day)).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  const line = [];
  dated.forEach((p, i) => {
    const ll = [p.lat, p.lng]; line.push(ll); pts.push(ll);
    L.marker(ll, { icon: L.divIcon({ className: '', html: `<div class="numpin">${i + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(map)
      .bindPopup(`<b>${CAT_ICO[p.category] || '📍'} ${esc(p.name)}</b><br>${fmt(p.date)}${p.veg && VEG_L[p.veg] ? '<br>' + esc(VEG_L[p.veg]) : ''}${p.notes ? '<br>' + esc(p.notes) : ''}`);
  });
  if (line.length > 1) L.polyline(line, { color: '#b4531e', weight: 3, opacity: .8 }).addTo(map);
  if (all) S.places.filter(p => p.lat && p.lng && !p.date).forEach(p => {
    L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#999', fillOpacity: 1 }).addTo(map).bindPopup(`<b>${esc(p.name)}</b><br>No date yet`); pts.push([p.lat, p.lng]);
  });
  if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 11 });
}

function viewMoney() {
  const t = totals(), left = t.budget - t.spent - t.booked, rate = t.rate, pp = people();
  const inrOf = e => (+e.amount || 0) * (e.currency === 'AED' ? rate : 1);
  const bal = [0, 0], paid = [0, 0];
  S.expenses.forEach(e => { const a = inrOf(e), p = +e.paidBy || 0; paid[p] += a; if (e.split === 'equal') { bal[p] += a; bal[0] -= a / 2; bal[1] -= a / 2; } });
  // bal[0] > 0 means person 2 owes person 1
  const settle = Math.abs(bal[0]) < 1 ? 'All settled 🤝' : bal[0] > 0 ? `${esc(pp[1])} owes ${esc(pp[0])} <b>${inr(bal[0])}</b>` : `${esc(pp[0])} owes ${esc(pp[1])} <b>${inr(-bal[0])}</b>`;
  const byCat = {}; S.expenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + inrOf(e); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]), maxC = cats[0]?.[1] || 1;
  const days = new Set(S.expenses.map(e => e.date)).size || 1;
  const list = [...S.expenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `
  <div class="card"><div class="row"><h3>Budget ${inr(t.budget)}</h3><span class="muted" style="${left < 0 ? 'color:#c0392b;font-weight:600' : ''}">${left >= 0 ? inr(left) + ' left' : inr(-left) + ' over'}</span></div>
    <div class="bar" style="margin:8px 0"><i class="${left < 0 ? 'over' : ''}" style="width:${t.budget ? Math.min(100, (t.spent + t.booked) / t.budget * 100) : 0}%"></i></div>
    <div class="grid2"><div><span class="muted">Spent on trip</span><br><b>${inr(t.spent)}</b></div><div><span class="muted">Booked (tickets + hotels)</span><br><b>${inr(t.booked)}</b></div>
    <div><span class="muted">Planned: unbooked travel, hotels &amp; tickets</span><br><b>${inr(t.planned)}</b></div><div><span class="muted">Avg / spending day</span><br><b>${inr(t.spent / days)}</b></div></div>
    <div class="muted" style="margin-top:6px">Enter ticket & hotel prices under Bookings; use this tab for day-to-day spending so nothing is counted twice.</div></div>
  <div class="card"><h3>🤝 Who owes whom</h3><div>${settle}</div><div class="muted">${esc(pp[0])} paid ${inr(paid[0])} · ${esc(pp[1])} paid ${inr(paid[1])} (equal-split items only settle)</div></div>
  ${cats.length ? `<div class="h2">By category</div><div class="card">${cats.map(([k, v]) => `<div style="margin:6px 0"><div class="row"><span>${esc(label(ECATS, k))}</span><b>${inr(v)}</b></div><div class="bar"><i style="width:${v / maxC * 100}%"></i></div></div>`).join('')}</div>` : ''}
  <div class="h2">Expenses <span>${addBtn('expense', 'Add')}</span></div>
  ${list.length ? list.map(e => `<div class="card" data-act="edit" data-kind="expense" data-id="${e.id}" style="cursor:pointer"><div class="row"><div class="grow"><b>${esc(e.title)}</b><div class="muted">${fmt(e.date)} · ${esc(label(ECATS, e.category))} · paid by ${esc(pp[+e.paidBy || 0])}${e.split === 'none' ? ' · not split' : ''}</div></div><div style="text-align:right"><b>${e.currency === 'AED' ? 'AED ' + e.amount : inr(e.amount)}</b>${e.currency === 'AED' ? `<div class="muted">${inr(inrOf(e))}</div>` : ''}</div></div></div>`).join('') : empty('No spending logged yet.')}
  <button class="btn fab" data-act="add" data-kind="expense">＋</button>`;
}

/* ---------- render + events ---------- */
function render() {
  if (map) { try { map.remove(); } catch { } map = null; }
  $('#tripTitle').textContent = S.trip.name || 'Safar';
  const ds = [...S.bookings.map(b => b.date), ...S.stays.map(h => h.checkin), ...S.places.map(p => p.date)].filter(Boolean).sort();
  $('#tripSub').textContent = S.trip.start ? `${fmtS(S.trip.start)}${S.trip.end ? ' – ' + fmtS(S.trip.end) : ''}` : (ds.length ? `${fmtS(ds[0])} – ${fmtS(ds[ds.length - 1])}` : 'Plan together, travel easy');
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  const views = { home: viewHome, plan: viewPlan, book: viewBook, places: viewPlaces, map: viewMap, money: viewMoney, lists: viewLists };
  $('#view').innerHTML = views[UI.tab]();
  if (UI.tab === 'map') setTimeout(drawMap, 30);
  if (UI.tab === 'home') loadWeather();
}

const findItem = (kind, id) => kind === 'trip' ? S.trip : S[FORMS[kind].list].find(x => x.id === id);

document.addEventListener('click', e => {
  const tb = e.target.closest('#tabs button');
  if (tb) { UI.tab = tb.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const t = e.target.closest('[data-act]'); if (!t || t.dataset.act === 'setstat') return;
  const { act, kind, id, v } = t.dataset;
  if (e.target.closest('a')) return;
  if (act === 'add') openForm(kind);
  else if (act === 'edit') openForm(kind, findItem(kind, id));
  else if (act === 'bookmode') { UI.bookMode = v; render(); }
  else if (act === 'placefilter') { UI.placeFilter = v; render(); }
  else if (act === 'mapday') { UI.mapDay = v; render(); }
  else if (act === 'visit') { const p = S.places.find(x => x.id === id); p.visited = !p.visited; touch(p); save(); render(); }
  else if (act === 'toggle') { const tk = S.tasks.find(x => x.id === id); if (tk) { tk.done = !tk.done; touch(tk); save(); render(); } }
  else if (act === 'loadlists') { const L = defaultLists(S.trip.start); S.tasks.push(...L.tasks); S.contacts.push(...L.contacts); save(); render(); toast('Checklists added – tick, edit or delete anything'); }
  else if (act === 'ics') exportICS();
  else if (act === 'share') shareSummary();
  else if (act === 'print') window.print();
  else if (act === 'sample') loadSample();
  else if (act === 'code') askCode();
  else if (act === 'backup') backup();
  else if (act === 'restore') restore();
});
document.addEventListener('change', e => {
  const t = e.target.closest('[data-act="setstat"]'); if (!t) return;
  const it = findItem(t.dataset.kind, t.dataset.id); if (it) { it.status = t.value; touch(it); save(); render(); toast('Status updated'); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.matches || !e.target.matches('input[data-quick]')) return;
  const v = e.target.value.trim(), g = e.target.dataset.quick; if (!v) return;
  const n = Date.now(); S.tasks.push({ id: uid(), group: g, text: v, who: 'both', due: '', done: false, _u: n, _o: n });
  save(); render();
  const nx = document.querySelector(`input[data-quick="${g}"]`); if (nx) nx.focus();
});
$('#syncBadge').onclick = askCode;

/* ---------- backup / restore / sample ---------- */
function backup() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
  a.download = `safar-backup-${todayISO()}.json`; a.click();
}
function restore() {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json';
  i.onchange = async () => { try { const j = JSON.parse(await i.files[0].text()); const now = Date.now(), keep = new Set(COLS.flatMap(c => (j[c] || []).map(x => x.id))), del = { ...(j.deleted || {}) }; COLS.forEach(c => (S[c] || []).forEach(it => { if (!keep.has(it.id)) del[it.id] = now; })); S = { ...DEFAULT(), ...j }; S.deleted = del; COLS.forEach(c => S[c].forEach(it => { it._u = now + 1; })); S.trip = { ...S.trip, _u: now + 1 }; save(); render(); toast('Restored'); } catch { toast('Not a valid backup file'); } };
  i.click();
}
/* =====================================================================
   Upgrade block: trip health, lists, today, weather, calendar, share
   ===================================================================== */
const whoPill = w => (w === '0' || w === '1') ? pill('info', '👤 ' + people()[+w]) : '';

/* ---------- Trip health: finds what is missing or clashing ---------- */
const sameCity = (a, b) => {
  a = (a || '').toLowerCase().trim(); b = (b || '').toLowerCase().trim();
  return !!a && !!b && (a.includes(b) || b.includes(a) || a.split(/\s+/)[0] === b.split(/\s+/)[0]);
};
function audit() {
  const out = [], today = todayISO();
  const add = (sev, t, d, kind, id) => out.push({ sev, t, d, kind, id });
  const dleft = d => diffDays(today, d), days = n => `${n} day${n === 1 ? '' : 's'}`;
  const bk = S.bookings.filter(b => b.status !== 'cancelled'), stays = S.stays.filter(h => h.status !== 'cancelled');

  // 1. transport that is not confirmed
  bk.filter(b => b.status !== 'confirmed' && b.date).forEach(b => {
    const n = dleft(b.date), name = `${b.from} → ${b.to}`, st = label(BSTAT, b.status);
    if (n < 0) add('bad', `${name}: date has passed but status is “${st}”`, 'Update the status or delete it.', 'booking', b.id);
    else if (n <= 14 && b.status === 'notbooked') add('bad', `${name} is in ${days(n)} and NOT booked`, 'Fares and seats go fast this close – book or arrange a cab.', 'booking', b.id);
    else if (n <= 14) add('warn', `${name} in ${days(n)} is still “${st}”`, 'Confirm it or line up a backup.', 'booking', b.id);
    else if (b.mode === 'train' && b.status === 'notbooked') {
      const opens = addDays(b.date, -60);
      if (today < opens) add('info', `${name}: train booking opens about ${fmt(opens)}`, 'IRCTC advance window is roughly 60 days – confirm on IRCTC and set a reminder.', 'booking', b.id);
      else add('warn', `${name}: booking window is open now`, `Book early – ${days(n)} to go.`, 'booking', b.id);
    } else if (b.status === 'notbooked') add('info', `${name} not booked yet`, `${days(n)} to go. Booking early is usually cheaper.`, 'booking', b.id);
  });
  bk.filter(b => b.status === 'confirmed' && !b.ref).forEach(b => add('warn', `${b.from} → ${b.to} is confirmed but has no PNR / ticket number`, 'Add it so you can find it quickly at the station.', 'booking', b.id));

  // 2. journey continuity per person: every leg should start where the last one ended
  const pairs = new Map();
  [0, 1].forEach(p => {
    // order legs by date; legs on the same day follow the chain (next leg starts where the last one ended), unknown times go last
    const mine = bk.filter(b => b.date && (!b.who || b.who === 'both' || b.who === String(p))).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99'));
    const seq = [];
    [...new Set(mine.map(b => b.date))].forEach(d => {
      const pool = mine.filter(b => b.date === d);
      while (pool.length) { const prev = seq[seq.length - 1]; let i = prev ? pool.findIndex(x => sameCity(prev.to, x.from)) : -1; if (i < 0) i = 0; seq.push(pool.splice(i, 1)[0]); }
    });
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1], b = seq[i];
      if (!sameCity(a.to, b.from)) { const k = a.id + '>' + b.id; if (!pairs.has(k)) pairs.set(k, { a, b, who: [] }); pairs.get(k).who.push(p); }
    }
  });
  pairs.forEach(({ a, b, who }) => add('warn', `${who.length === 2 ? 'You both' : people()[who[0]]}: arrive in ${a.to} but the next leg starts from ${b.from}`, `Is a leg missing between ${fmtS(a.date)} and ${fmtS(b.date)}? (a cab, bus or return trip)`, 'booking', b.id));

  // 3. nights with no hotel / double-booked nights
  if (S.trip.start && S.trip.end) {
    const missing = [];
    for (let d = S.trip.start, g = 0; d < S.trip.end && g < 120; d = addDays(d, 1), g++) {
      const hs = stays.filter(h => h.checkin && h.checkin <= d && (h.checkout ? d < h.checkout : d === h.checkin));
      const overnight = bk.some(b => b.date === d && ['train', 'bus'].includes(b.mode) && (b.time || '') >= '17:00');
      if (!hs.length && !overnight) missing.push(d);
      if (hs.length > 1) add('warn', `Two stays overlap on the night of ${fmt(d)}`, hs.map(h => h.name).join(' & '), 'stay', hs[0].id);
    }
    if (missing.length) add('bad', `No hotel for ${missing.length} night${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).map(fmtS).join(', ')}${missing.length > 5 ? '…' : ''}`, 'Add a stay (or mark an overnight train/bus).', 'stay');
  } else if (S.bookings.length || S.stays.length) add('info', 'Set your trip start and end dates', 'Then Safar can check every night has a bed. Home → Trip settings.', 'trip');

  // 4. hotels
  stays.forEach(h => {
    if (!h.checkin) return;
    const n = dleft(h.checkin);
    if (h.status !== 'booked') {
      if (n < 0) add('bad', `${h.name}: check-in date has passed but it is not booked`, '', 'stay', h.id);
      else if (n <= 30) add(n <= 7 ? 'bad' : 'warn', `${h.name} (${h.city || 'stay'}) not booked – check-in in ${days(n)}`, 'Book or pick an alternative.', 'stay', h.id);
    } else if (!h.ref) add('info', `${h.name} is booked but has no confirmation number`, '', 'stay', h.id);
    if (h.veg === 'non') add('warn', `${h.name} is mostly non-veg`, 'Check there are real vegetarian meals.', 'stay', h.id);
  });
  const vegUnknown = stays.filter(h => !h.veg || h.veg === 'unknown').map(h => h.name);
  if (vegUnknown.length) add('info', `Veg food not confirmed at ${vegUnknown.length} stay${vegUnknown.length === 1 ? '' : 's'}`, vegUnknown.join(', '), 'stay');
  const noPhone = stays.filter(h => !h.phone).length;
  if (noPhone) add('info', `${noPhone} stay${noPhone === 1 ? ' has' : 's have'} no phone number`, 'Add it so you can call from the road (late arrival, pickup).', 'stay');

  // 5. places and tickets
  S.places.filter(p => p.tix === 'tobook').forEach(p => {
    const n = p.date ? dleft(p.date) : null;
    add(n !== null && n <= 30 ? 'bad' : 'warn', `Book tickets for ${p.name}`, (p.date ? `${fmt(p.date)} (${days(n)}). ` : 'No date yet. ') + 'Popular slots sell out – book early.', 'place', p.id);
  });
  const clash = {};
  S.places.filter(p => p.date && p.time).forEach(p => { (clash[p.date + ' ' + p.time] = clash[p.date + ' ' + p.time] || []).push(p); });
  Object.values(clash).filter(l => l.length > 1).forEach(l => add('warn', `${l.length} places at the same time: ${l.map(p => p.name).join(' & ')}`, `${fmt(l[0].date)} ${l[0].time}`, 'place', l[0].id));
  const undated = S.places.filter(p => !p.date).length;
  if (undated) add('info', `${undated} place${undated === 1 ? ' has' : 's have'} no date yet`, 'Give them a day so they show on the plan and map.', 'place');
  const missed = S.places.filter(p => p.date && p.date < today && !p.visited).length;
  if (missed) add('info', `${missed} past place${missed === 1 ? '' : 's'} not marked visited`, 'Tick the ones you saw; the rest may still be worth a revisit.', 'place');

  // 6. money
  const t = totals(), committed = t.spent + t.booked + t.planned;
  if (t.budget && committed > t.budget) add('bad', `Over budget by ${inr(committed - t.budget)}`, 'Spent + booked + planned costs exceed your budget.', 'trip');
  else if (t.budget && committed > t.budget * 0.9) add('warn', `Budget almost used: ${inr(committed)} of ${inr(t.budget)}`, 'Spent + booked + planned.', 'trip');
  const zero = bk.filter(b => !(+b.cost)).length + stays.filter(h => !(+h.cost)).length;
  if (zero) add('info', `${zero} booking${zero === 1 ? '' : 's'}/stay${zero === 1 ? '' : 's'} ${zero === 1 ? 'has' : 'have'} no cost entered`, 'The budget may be understated.', '');

  // 7. checklist deadlines
  S.tasks.filter(x => !x.done && x.due).forEach(x => {
    const n = dleft(x.due);
    if (n < 0) add('bad', `Overdue: ${x.text}`, `Was due ${fmt(x.due)}.`, 'task', x.id);
    else if (n <= 7) add('warn', `Due in ${days(n)}: ${x.text}`, '', 'task', x.id);
  });
  const rank = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.sev] - rank[b.sev]);
}
function healthCard() {
  if (!S.bookings.length && !S.stays.length && !S.places.length) return '';
  const hs = audit(), n = k => hs.filter(x => x.sev === k).length;
  const attr = x => x.id ? `data-act="edit" data-kind="${x.kind}" data-id="${x.id}"` : x.kind ? `data-act="add" data-kind="${x.kind === 'trip' ? 'booking' : x.kind}"` : '';
  const row = x => { const a = x.kind === 'trip' && !x.id ? 'data-act="edit" data-kind="trip"' : attr(x); return `<div class="item hl ${x.sev}" ${a} ${a ? 'style="cursor:pointer"' : ''}><div class="ico">${{ bad: '🔴', warn: '🟠', info: '🔵' }[x.sev]}</div><div class="grow"><b>${esc(x.t)}</b>${x.d ? `<div class="muted">${esc(x.d)}</div>` : ''}</div></div>`; };
  const main = hs.filter(x => x.sev !== 'info'), info = hs.filter(x => x.sev === 'info');
  return `<div class="card wide"><div class="row"><h3>🩺 Trip health</h3><span>${n('bad') ? pill('bad', n('bad') + ' urgent') : ''} ${n('warn') ? pill('pending', n('warn') + ' to fix') : ''} ${!main.length ? pill('good', 'All clear') : ''}</span></div>
    ${main.length ? main.slice(0, 6).map(row).join('') : '<div class="muted">No gaps found in bookings, nights, tickets, budget or deadlines. 🎉</div>'}
    ${main.length > 6 ? `<details style="margin-top:6px"><summary class="muted" style="cursor:pointer">${main.length - 6} more to fix</summary>${main.slice(6).map(row).join('')}</details>` : ''}
    ${info.length ? `<details style="margin-top:6px"><summary class="muted" style="cursor:pointer">${info.length} reminders & tips</summary>${info.map(row).join('')}</details>` : ''}</div>`;
}

/* ---------- Today / tonight card (shows during the trip) ---------- */
function todayCard() {
  const t = S.trip, today = todayISO();
  if (!t.start || today < t.start || (t.end && today > t.end)) return '';
  const all = events(), ev = all.filter(e => e.date === today), tom = all.filter(e => e.date === addDays(today, 1));
  const tonight = S.stays.find(h => h.status !== 'cancelled' && h.checkin && h.checkin <= today && (h.checkout ? today < h.checkout : today === h.checkin));
  const row = e => `<div class="item" data-act="edit" data-kind="${e.kind}" data-id="${e.id}" style="cursor:pointer"><div class="ico">${e.ico}</div><div class="grow"><b>${esc(e.title)}</b>${e.sub ? `<div class="muted">${esc(e.sub)}</div>` : ''}</div>${e.pill}</div>`;
  return `<div class="card wide" style="border-color:var(--brand)"><h3>📍 Today · Day ${diffDays(t.start, today) + 1}</h3>
    ${ev.length ? ev.map(row).join('') : '<div class="muted">Nothing planned today.</div>'}
    ${tonight ? `<div class="item"><div class="ico">🌙</div><div class="grow">Tonight: <b>${esc(tonight.name)}</b>${tonight.city ? ' · ' + esc(tonight.city) : ''}${tonight.phone ? ` · <a href="tel:${esc(tonight.phone)}">📞 ${esc(tonight.phone)}</a>` : ''}</div></div>` : ''}
    ${tom.length ? `<div class="muted" style="margin-top:6px">Tomorrow: ${esc(tom.slice(0, 3).map(e => (e.time ? e.time + ' ' : '') + e.title).join(' · '))}</div>` : ''}</div>`;
}

/* ---------- Weather (free Open-Meteo forecast, only within ~15 days) ---------- */
const WX = {};
function wxPoint(list) {
  const rank = { place: 0, stay: 1, booking: 2 };
  for (const e of [...list].sort((a, b) => rank[a.kind] - rank[b.kind])) {
    if (e.kind === 'place') { const p = S.places.find(x => x.id === e.id); if (p && p.lat && p.lng) return { ll: [p.lat, p.lng], name: p.city || p.name }; const c = p && coordFor(p.city); if (c) return { ll: c, name: p.city }; }
    else if (e.kind === 'stay') { const h = S.stays.find(x => x.id === e.id), c = h && coordFor(h.city || h.name); if (c) return { ll: c, name: h.city || h.name }; }
    else { const b = S.bookings.find(x => x.id === e.id), c = b && coordFor(b.to); if (c) return { ll: c, name: b.to }; }
  }
  return null;
}
function weatherPicks() {
  const today = todayISO(), byDate = {};
  events().filter(e => e.date >= today && diffDays(today, e.date) <= 15).forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });
  return Object.entries(byDate).map(([d, l]) => [d, wxPoint(l)]).filter(x => x[1]).slice(0, 4);
}
function weatherCard() {
  if (!S.trip.start && !S.bookings.length) return '';
  if (weatherPicks().length) return '<div class="card wide"><h3>🌤️ Forecast</h3><div id="wx"><div class="muted">Loading…</div></div></div>';
  const n = S.trip.start ? diffDays(todayISO(), S.trip.start) : 0;
  return n > 15 ? '<div class="card wide"><h3>🌤️ Weather</h3><div class="muted">The live forecast appears here 15 days before you travel. Meanwhile: Rajasthan winters are usually pleasant by day but the desert gets properly cold at night, so pack warm layers.</div></div>' : '';
}
async function loadWeather() {
  const el = $('#wx'); if (!el) return;
  const picks = weatherPicks();
  try {
    const rows = await Promise.all(picks.map(async ([d, pt]) => {
      const k = d + pt.ll.join(',');
      if (!WX[k]) {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pt.ll[0]}&longitude=${pt.ll[1]}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${d}&end_date=${d}`);
        if (!r.ok) throw new Error('wx');
        WX[k] = (await r.json()).daily;
      }
      const w = WX[k];
      return `<div class="item"><div class="ico">🌡️</div><div class="grow"><b>${fmt(d)} · ${esc(pt.name)}</b><div class="muted">${Math.round(w.temperature_2m_min[0])}° to ${Math.round(w.temperature_2m_max[0])}°C · ${w.precipitation_probability_max[0] ?? 0}% chance of rain</div></div></div>`;
    }));
    if (el.isConnected) el.innerHTML = rows.join('');
  } catch { if (el.isConnected) el.innerHTML = '<div class="muted">Forecast not available right now (offline?).</div>'; }
}

/* ---------- Lists: packing, documents, to-do, contacts ---------- */
const taskRow = t => `<div class="item"><input type="checkbox" class="chk" data-act="toggle" data-id="${t.id}" ${t.done ? 'checked' : ''} aria-label="Done"><div class="grow" data-act="edit" data-kind="task" data-id="${t.id}" style="cursor:pointer;${t.done ? 'text-decoration:line-through;opacity:.55' : ''}">${esc(t.text)}<div class="muted">${[t.who === '0' || t.who === '1' ? '👤 ' + people()[+t.who] : '', t.due ? 'Due ' + fmtS(t.due) : ''].filter(Boolean).join(' · ')}</div></div></div>`;
function viewLists() {
  const tasks = [...S.tasks].sort((a, b) => (a._o || 0) - (b._o || 0));
  const sections = GROUPS.map(([g, title]) => {
    const list = tasks.filter(t => t.group === g), done = list.filter(t => t.done).length;
    return `<div class="card"><div class="row"><h3>${title}</h3><span class="muted">${done}/${list.length}</span></div>
      <div class="bar" style="margin:6px 0 8px"><i style="width:${list.length ? done / list.length * 100 : 0}%"></i></div>
      ${list.length ? list.map(taskRow).join('') : '<div class="muted">Nothing yet.</div>'}
      <input data-quick="${g}" placeholder="Add an item, press Enter" aria-label="Add to ${esc(title)}" style="margin-top:8px"></div>`;
  }).join('');
  const cs = [...S.contacts].sort((a, b) => (a._o || 0) - (b._o || 0));
  const contacts = `<div class="card"><div class="row"><h3>📞 Contacts & emergency</h3>${addBtn('contact', 'Add')}</div>
    ${cs.length ? cs.map(c => `<div class="item"><div class="ico">📞</div><div class="grow" data-act="edit" data-kind="contact" data-id="${c.id}" style="cursor:pointer"><b>${esc(c.name)}</b><div class="muted">${[c.role, c.phone, c.notes].filter(Boolean).map(esc).join(' · ')}</div></div>${c.phone ? `<a class="btn small" href="tel:${esc(c.phone)}" style="text-decoration:none">Call</a>` : ''}</div>`).join('') : '<div class="muted">Add hotel owners, drivers, her family back home…</div>'}</div>`;
  return `<div class="h2">Checklists <span>${!S.tasks.length ? '<button class="btn small" data-act="loadlists">✨ Load Rajasthan checklists</button>' : ''}</span></div>${sections}${contacts}`;
}
function defaultLists(start) {
  const n = Date.now(); let i = 0;
  const D = k => start ? addDays(start, k) : '';
  const T = (group, text, who = 'both', due = '') => ({ id: uid(), group, text, who, due, done: false, _u: n, _o: n + (i++) });
  const tasks = [
    T('pack', 'Warm layers – jacket, sweater, cap (desert nights get cold)'), T('pack', 'Light cotton clothes for the day'),
    T('pack', 'Scarf / dupatta / mask for dust and sun'), T('pack', 'Modest clothes for temples & forts (cover shoulders and knees)'),
    T('pack', 'Comfortable walking shoes – lots of steps and stairs in forts'), T('pack', 'Sunglasses, sunscreen, lip balm'),
    T('pack', 'Power bank + chargers'), T('pack', 'Plug adapter for her devices (UAE → India)', '1'),
    T('pack', 'Small notes & coins for tips, camel ride, parking, entry'), T('pack', 'Reusable water bottle'),
    T('pack', 'Basic medicines: motion-sickness, ORS, stomach, pain relief, plasters'), T('pack', 'Hand sanitiser & wet wipes'),
    T('pack', 'Snacks for long drives (veg)'), T('pack', 'Small day-bag + a bag for laundry'),
    T('docs', 'Photo ID for both – Aadhaar / passport (needed for safari & hotels)'), T('docs', 'Her passport + UAE residence ID; check Indian visa / OCI status', '1'),
    T('docs', 'Train / flight tickets saved offline (screenshots or PDF)'), T('docs', 'Hotel confirmations saved offline'),
    T('docs', 'Ranthambore safari booking confirmation + ID used to book'), T('docs', 'Travel insurance papers'),
    T('docs', 'Copies of IDs kept separately (photo in phone + paper)'),
    T('todo', 'Book the Ranthambore safari (check the official forest-dept site)', 'both', D(-14)), T('todo', 'Check the Jodhpur → Jaisalmer train is actually running (14810) or book a cab', 'both', D(-14)),
    T('todo', 'Ask the Sam desert camp for a vegetarian dinner, pickup and what the price includes', 'both', D(-10)),
    T('todo', 'Buy travel insurance', 'both', D(-10)), T('todo', 'Tell her bank/card she is travelling to India', '1', D(-7)),
    T('todo', 'Download offline maps (Jaipur, Jodhpur, Jaisalmer, Udaipur)', 'both', D(-2)), T('todo', 'Withdraw cash – desert camps and small shops often take cash only', 'both', D(-1)),
    T('todo', 'Share live location with family on travel days'), T('todo', 'Add this trip to your phone calendar (Home → Add to calendar)')
  ];
  const C = (name, role, phone, notes = '') => ({ id: uid(), name, role, phone, notes, _u: n, _o: n + (i++) });
  const contacts = [
    C('Emergency (police, fire, ambulance)', 'India', '112', 'Verify numbers before travel'), C('Ambulance', 'India', '108'),
    C('Tourist helpline (24x7)', 'Ministry of Tourism', '1363'), C('Railway enquiry / help', 'Indian Railways', '139')
  ];
  return { tasks, contacts };
}

/* ---------- Calendar export + share ---------- */
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const icsFold = l => { let o = ''; while (l.length > 74) { o += l.slice(0, 74) + '\r\n '; l = l.slice(74); } return o + l; };
function exportICS() {
  const pad = n => String(n).padStart(2, '0'), stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const dt = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Safar//Trip Planner//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + icsEsc(S.trip.name)];
  events().forEach(e => {
    L.push('BEGIN:VEVENT', `UID:${e.kind}-${e.id}-${e.date}-${e.title.replace(/\W/g, '').slice(0, 12)}@safar`, `DTSTAMP:${stamp}`);
    if (/^\d\d:\d\d$/.test(e.time || '')) { const s = new Date(`${e.date}T${e.time}:00`); L.push('DTSTART:' + dt(s), 'DTEND:' + dt(new Date(s.getTime() + 3600000))); }
    else L.push('DTSTART;VALUE=DATE:' + e.date.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + addDays(e.date, 1).replace(/-/g, ''));
    L.push('SUMMARY:' + icsEsc(e.title), 'DESCRIPTION:' + icsEsc([e.stl, e.sub].filter(Boolean).join(' · ')), 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([L.map(icsFold).join('\r\n')], { type: 'text/calendar' }));
  a.download = 'safar-trip.ics'; a.click();
  toast('Calendar file saved – open it to add to Google/Apple Calendar');
}
function summaryText() {
  const t = S.trip, L = [`*${t.name}*`];
  if (t.start) L.push(`${fmt(t.start)}${t.end ? ' → ' + fmt(t.end) : ''}`);
  let cur = '';
  events().forEach(e => {
    if (e.date !== cur) { cur = e.date; L.push('', `📅 *${fmt(e.date)}*`); }
    L.push(`${e.ico} ${e.kind === 'booking' && e.time ? e.time + ' ' : ''}${e.title}${e.stl ? ' [' + e.stl + ']' : ''}`);
  });
  return L.join('\n');
}
async function shareSummary() {
  const text = summaryText();
  if (navigator.share) { try { await navigator.share({ title: S.trip.name, text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast('Summary copied – paste it into WhatsApp'); } catch { prompt('Copy this summary:', text); }
}

function loadSample() {
  if ((S.bookings.length || S.places.length) && !confirm('This will replace what you have now. Continue?')) return;
  const start = prompt('Trip start date = the day you leave Jammu (YYYY-MM-DD)?', S.trip.start || addDays(todayISO(), 30));
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return;
  const D = n => addDays(start, n), id = uid, IRCTC = 'https://www.irctc.co.in';
  // tombstone everything currently here so a second device drops it too instead of merging it back
  S.deleted = S.deleted || {};
  const t0 = Date.now();
  COLS.forEach(c => (S[c] || []).forEach(it => { S.deleted[it.id] = t0; }));
  S.trip = { ...S.trip, name: 'Rajasthan – Forts, Dunes & Safari', start, end: D(10), budget: 150000 };

  const B = (mode, from, to, d, time, status, ref, cost, notes, link = '', who = 'both') => ({ id: id(), mode, from, to, date: D(d), time, status, ref, cost, notes, link, who });
  S.bookings = [
    B('train', 'Jammu Tawi', 'Jaipur', 0, '18:15', 'confirmed', 'SAMPLE-PNR', 1900, 'YOUR train. 12414 Pooja SF Express, daily: reported 18:15 → 09:35 next day (~15h20m). Fare is a rough per-person estimate – check class and price on IRCTC. Backup: 14662 Malani Express, 22:25 → 17:35.', IRCTC, '0'),
    B('flight', 'Dubai', 'Jaipur', 1, '12:15', 'notbooked', '', 14000, 'HER flight (times are Dubai time). Direct flights reported on Air India Express (~7/week) and SpiceJet (~2/week), about 3h10m. 12:15 is a SpiceJet sample departure. One-way fares seen about $111–251 (₹9k–21k). Compare on the airline sites; she lands in the afternoon, you arrive in the morning.', '', '1'),
    B('cab', 'Jaipur', 'Ranthambore', 3, '09:30', 'pending', '', 7000, 'Day trip: about 3 hrs each way. Price is a rough estimate for the round trip – get 2–3 quotes. Option: stay a night in Sawai Madhopur instead.'),
    B('cab', 'Ranthambore', 'Jaipur', 3, '18:00', 'pending', '', 0, 'Return leg of the same cab (included in the price above). The afternoon safari ends around 17:30.'),
    B('train', 'Jaipur', 'Jodhpur', 4, '06:00', 'waiting', 'WL 5 (sample)', 1600, 'Train 22478 Jaipur–Jodhpur SF Intercity Express: 06:00 → 10:55 (4h55m), daily; classes CC / 2S / GN. Fare is a rough estimate. If waitlisted, a cab takes about 5.5 hrs.', IRCTC),
    B('train', 'Jodhpur', 'Jaisalmer', 5, '07:05', 'rac', '', 1200, 'Train 14810 reported as 07:05 → 12:40 (5h35m), but the source marks it as possibly cancelled/outdated. Confirm on IRCTC; otherwise take a cab (about 5 hrs).', IRCTC),
    B('cab', 'Jaisalmer', 'Sam Sand Dunes', 6, '15:00', 'notbooked', '', 1500, 'About an hour. Many camps include pickup – ask when you book. Rough estimate.'),
    B('cab', 'Sam Sand Dunes', 'Udaipur', 7, '07:30', 'notbooked', '', 12000, 'Long drive – roughly 9–10 hrs with stops. Rough estimate. Easier: split the journey with a night in Jodhpur, or take an early train/flight.'),
    B('flight', 'Udaipur', 'Delhi', 10, '12:35', 'pending', '', 11000, 'Direct options seen for one sample day: Air India AI-1820 12:35 → 14:05; IndiGo 6E-2228 13:00; also 08:20, 08:55, 11:10, 17:55, 18:10, 19:55. Fare for 2 is a rough estimate. Check your actual date.'),
    B('flight', 'Delhi', 'Dubai', 10, '', 'notbooked', '', 15000, 'HER flight home. Choose a departure at least 3 hrs after the Udaipur flight lands.', '', '1'),
    B('flight', 'Delhi', 'Jammu', 10, '', 'notbooked', '', 3500, 'YOUR trip home (flight or train). Rough estimate.', '', '0')
  ];

  const H = (name, city, ci, co, status, veg, cost, ref, notes) => ({ id: id(), name, city, checkin: D(ci), checkout: D(co), status, veg, cost, ref, phone: '', notes });
  S.stays = [
    H('Ratnawali – A Vegetarian Heritage Hotel', 'Jaipur', 1, 4, 'booked', 'pure', 10500, 'SAMPLE-BOOKING', 'MI Road, near Panch Batti. Pure-veg restaurant, Jain food available, breakfast included. Listing price: AC Super Deluxe from ₹2,841/night + taxes (about ₹3,500). Rated about 3.9–4.2/5. Paid airport/station transfers.'),
    H('Mandore Guest House (listed as pure vegetarian)', 'Jodhpur', 4, 5, 'pending', 'pure', 2000, '', 'Listed on a booking site as a pure vegetarian guest house; I could not load price details, so the cost is a rough guess. Check location vs. the Clock Tower / fort side.'),
    H('Hotel Jaisal Inn – Pure Veg', 'Jaisalmer', 5, 6, 'notbooked', 'pure', 3000, '', 'Gadisar Rd near Hanuman Circle. Reviewers say it is close to the fort and the rooftop has a fort view. 8.1/10 from 24 reviews, free breakfast, pool, check-in 14:00. Rate is a rough estimate – check your dates.'),
    H('Sam Sand Dunes desert camp (e.g. Oasis Camp Sam)', 'Sam Sand Dunes', 6, 7, 'notbooked', 'unknown', 5400, '', 'Listings run about ₹1,900–2,700 per adult; some include a camel ride and Kalbeliya folk dance. None of the listings said whether dinner is vegetarian – ask for a veg dinner before booking. Price shown is ₹2,700 × 2.'),
    H('Hotel Mewari Villa – Pure Veg', 'Udaipur', 7, 10, 'notbooked', 'pure', 15000, '', 'Chand Pole, steps from Imli Ghat and the lake; rooftop restaurant, 8.1/10 from 51 reviews. Breakfast about ₹200 pp extra. Listing showed roughly "from NZD 112/night" (about ₹5,000+). The description also mentions halal options – confirm the kitchen is fully veg.')
  ];

  const P = (d, name, category, city, lat, lng, veg, notes, time = '', cost = 0, tix = 'gate') => ({ id: id(), name, category, city, lat, lng, date: d === null ? '' : D(d), time, veg, notes, cost, tix, visited: false });
  S.places = [
    P(1, 'LMB – Laxmi Misthan Bhandar (Johari Bazaar)', 'food', 'Jaipur', 26.9188, 75.8268, 'pure', 'Pure-veg Rajasthani thali & sweets (please confirm hours). Easy first dinner after arriving.', '20:00'),
    P(2, 'Amber Fort', 'fort', 'Jaipur', 26.9855, 75.8513, 'unknown', 'Go early to beat crowds. Indian adults about ₹200 each (some sources say ₹100) – confirm.', '09:00', 400),
    P(2, 'Jantar Mantar', 'museum', 'Jaipur', 26.9247, 75.8246, 'unknown', 'About ₹100 pp (older listings ₹50).', '12:00', 200),
    P(2, 'City Palace, Jaipur', 'museum', 'Jaipur', 26.9258, 75.8237, 'unknown', 'Run by the royal family trust, so confirm the price at the counter (reported about ₹200–400 pp).', '14:00', 400),
    P(2, 'Hawa Mahal', 'fort', 'Jaipur', 26.9239, 75.8267, 'unknown', 'The outside is free to view from the street (great at sunset); interior about ₹100 pp.', '17:00', 200),
    P(3, 'Ranthambore National Park – tiger safari', 'safari', 'Ranthambore', 26.0173, 76.5026, 'unknown', 'Afternoon safari usually starts 2:00–3:30 pm. Agent-quoted prices for Indian adults: canter about ₹1,200–1,800 pp, jeep about ₹1,800–2,500 pp (estimates – check the forest department notice). Book as early as possible, ID needed. Zones 1–5 are core tiger zones.', '14:30', 3000, 'tobook'),
    P(4, 'Mehrangarh Fort', 'fort', 'Jodhpur', 26.2979, 73.0184, 'unknown', 'One listing: ₹100 pp for Indian adults, 9:00–17:00 (foreign adults ₹600 incl. audio guide). Confirm at the gate.', '13:00', 200),
    P(4, 'Jaswant Thada', 'temple', 'Jodhpur', 26.3044, 73.021, 'unknown', 'Small fee at the counter (price not confirmed). Check the closing time.', '16:00'),
    P(4, 'Clock Tower & Sardar Market', 'market', 'Jodhpur', 26.294, 73.0187, 'options', 'Spices, sweets, handicrafts, local lassi and snacks. Check veg status of each stall.', '17:30'),
    P(5, 'Jaisalmer Fort', 'fort', 'Jaisalmer', 26.9127, 70.9128, 'unknown', 'About ₹50 pp for Indian visitors, Palace Museum included; roughly 9:00–18:00. Tickets bought at the gate. Lanes and temples are free to walk.', '15:30', 100),
    P(5, 'Gadisar Lake', 'nature', 'Jaisalmer', 26.9101, 70.914, 'unknown', 'Sunset walk.', '17:45'),
    P(6, 'Kuldhara Abandoned Village', 'temple', 'Jaisalmer', 26.8137, 70.7889, 'unknown', 'Small entry fee at the gate (not confirmed). Go in the morning, then head to the dunes.', '10:30'),
    P(6, 'Sam Sand Dunes – camel & jeep safari, camp night', 'dunes', 'Sam Sand Dunes', 26.8333, 70.5167, 'unknown', 'Arrive for sunset. Some camps include a camel ride and folk dance. Jeep safari is usually extra – ask the camp.', '16:30'),
    P(8, 'Udaipur City Palace', 'fort', 'Udaipur', 24.5764, 73.6835, 'unknown', 'About ₹400 pp, 9:00–21:00, ticket counter closes 20:00. Crystal Gallery is a separate ₹500 ticket.', '10:00', 800),
    P(8, 'Jagdish Temple & thali lanes', 'temple', 'Udaipur', 24.58, 73.683, 'options', 'Cheaper thali places in the lanes behind the temple – check which are fully veg.', '13:30'),
    P(8, 'Lake Pichola boat ride (sunset)', 'nature', 'Udaipur', 24.5724, 73.6806, 'unknown', 'About ₹800 pp for the sunset slot (₹600 regular); from Rameshwar Ghat, run by HRH Hotels. Confirm at the counter.', '17:00', 1600),
    P(8, 'Lake-view rooftop dinner – Lal Ghat / Gangaur Ghat', 'food', 'Udaipur', 24.5815, 73.6812, 'options', 'Ask which rooftops serve pure-veg menus.', '20:00'),
    P(9, 'Saheliyon ki Bari', 'nature', 'Udaipur', 24.5963, 73.6905, 'unknown', 'About ₹10 pp, 9:00–19:00.', '10:00', 20),
    P(9, 'Sajjangarh (Monsoon Palace)', 'fort', 'Udaipur', 24.5936, 73.6355, 'unknown', 'About ₹120 pp plus about ₹340 for a car; 9:00–18:00, last entry 17:30. Great sunset view.', '16:30', 580),
    P(null, 'Pushkar Lake & Brahma Temple (idea)', 'temple', 'Pushkar', 26.4876, 74.5518, 'pure', 'Pushkar is strictly vegetarian. Could fit on the Jaipur → Jodhpur leg if you break the journey (would need a different train/cab).')
  ];

  const E = (d, title, category, amount, currency, paidBy, split = 'equal') => ({ id: id(), title: title + ' (sample)', date: D(d), category, amount, currency, paidBy: String(paidBy), split });
  S.expenses = [
    E(1, 'Taxi from Jaipur station to hotel', 'transport', 350, 'INR', 0),
    E(1, 'Airport coffee in Dubai', 'food', 25, 'AED', 1),
    E(2, 'Veg thali lunch near Amber', 'food', 700, 'INR', 1),
    E(2, 'Hawa Mahal chai & snacks', 'food', 180, 'INR', 0),
    E(2, 'Souvenirs – blue pottery', 'shopping', 1200, 'INR', 1, 'none')
  ];
  const L = defaultLists(start); S.tasks = L.tasks; S.contacts = L.contacts;
  const stamp = Date.now() + 1;
  COLS.forEach(c => S[c].forEach(it => { it._u = stamp; }));
  S.trip._u = stamp;
  save(); UI.tab = 'home'; render(); toast('Sample loaded – edit anything!');
}

/* ---------- boot ---------- */
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (map) map.invalidateSize(); }, 150); });
render();
if (firebaseConfig && !localStorage.getItem('safar.code')) setTimeout(askCode, 600);
startCloud();
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { });
