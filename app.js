// Safar – shared trip planner. Plain ES modules, no build step.
import { firebaseConfig } from './firebase-config.js';

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let seedN = 0, seeding = false;
const uid = () => seeding ? 'r27-' + (++seedN) : Math.random().toString(36).slice(2, 10);
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
const BSTAT = [['notbooked', 'Not booked'], ['pending', 'Planned / pending'], ['waiting', 'Waitlist'], ['rac', 'RAC'], ['confirmed', 'Confirmed ✓'], ['cancelled', 'Cancelled'], ['option', 'Alternative (not in plan)']];
const SSTAT = [['shortlist', 'Shortlisted option'], ['notbooked', 'Not booked'], ['pending', 'Pending'], ['booked', 'Booked ✓'], ['cancelled', 'Cancelled']];
const VEG = [['unknown', 'Not checked'], ['pure', 'Pure veg 🌱'], ['options', 'Veg options available'], ['non', 'Mostly non-veg']];
const VEG_L = { pure: 'Pure veg 🌱', options: 'Veg options', non: 'Mostly non-veg', unknown: '' };
const CATS = [['fort', '🏰 Fort / Palace'], ['safari', '🐆 Safari'], ['dunes', '🏜️ Desert / Dunes'], ['temple', '🛕 Temple / Heritage'], ['nature', '🌅 Lake / Nature'], ['market', '🛍️ Market / Shopping'], ['food', '🍛 Food'], ['museum', '🏛️ Museum'], ['other', '📍 Other']];
const CAT_ICO = { fort: '🏰', safari: '🐆', dunes: '🏜️', temple: '🛕', nature: '🌅', market: '🛍️', food: '🍛', museum: '🏛️', other: '📍' };
const ECATS = [['food', '🍛 Food & drinks'], ['stay', '🏨 Stay'], ['transport', '🚕 Local transport'], ['tickets', '🎟️ Tickets / Safari'], ['shopping', '🛍️ Shopping'], ['other', '🧾 Other']];

const TIX = [['gate', 'Pay at gate / none needed'], ['tobook', 'Need to book ahead'], ['booked', 'Booked ✓']];
const GROUPS = [['pack', '🎒 Packing'], ['docs', '📄 Documents & IDs'], ['todo', '✅ To-do before & during']];
const COLS = ['bookings', 'stays', 'places', 'expenses', 'tasks', 'contacts'];
const TZS = [['+05:30', 'India time (IST)'], ['+04:00', 'Dubai time (GST)']];
const PLANS = [['yes', 'Planned'], ['idea', '💡 Idea / maybe']];

const CITY = {
  'sam sand dunes': [26.8333, 70.5167], 'sam dunes': [26.8333, 70.5167], 'sawai madhopur': [26.0173, 76.5026], 'ranthambore': [26.0173, 76.5026],
  'mount abu': [24.5926, 72.7156], 'dubai': [25.2532, 55.3657], 'jammu': [32.7266, 74.857], 'srinagar': [34.0837, 74.7973],
  'delhi': [28.6139, 77.209], 'jaipur': [26.9124, 75.7873], 'jodhpur': [26.2389, 73.0243], 'jaisalmer': [26.9157, 70.9083],
  'bharatpur': [27.2152, 77.503], 'phulera': [26.8739, 75.2405], 'falna': [25.2333, 73.2333], 'jawai': [25.12, 73.15], 'surat': [21.1702, 72.8311], 'mumbai': [19.076, 72.8777],
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
let syncTimer = null;
const badge = (t, why) => { const b = $('#syncBadge'); b.textContent = t; b.title = why || 'Tap to sync now'; };
const syncFail = e => { console.error(e); const c = (e && e.code) || ''; badge(c === 'permission-denied' ? 'No access' : 'Offline', c ? c + ' – ' + (e.message || '') + (c === 'permission-denied' ? ' (publish firestore.rules, enable Anonymous sign-in)' : '') : 'Cannot reach the cloud – changes are saved on this device and will sync later'); };

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
      let db; try { db = fs.initializeFirestore(a, { experimentalAutoDetectLongPolling: true }); } catch { db = fs.getFirestore(a); }
      fb = { db, doc: fs.doc, getDocFromServer: fs.getDocFromServer, runTransaction: fs.runTransaction, onSnapshot: fs.onSnapshot };
    }
    const ref = fb.doc(fb.db, 'trips', code);
    cloud = { ref };
    if (unsub) unsub();
    unsub = fb.onSnapshot(ref, snap => {
      if (!snap.exists()) { pushCloud(); return; }
      applyRemote(snap);
    }, e => { syncFail(e); clearTimeout(syncTimer); syncTimer = setTimeout(startCloud, 15000); });
  } catch (e) { syncFail(e); clearTimeout(syncTimer); syncTimer = setTimeout(startCloud, 15000); }
}
function applyRemote(snap) {
  let remote; try { remote = JSON.parse(snap.data().state); } catch { return; }
  const merged = merge(S, remote);
  if (sig(merged) !== sig(S)) { S = merged; localSave(); render(); }
  if (sig(merged) !== sig(remote)) pushCloud();
  badge('Synced ✓', 'Last synced ' + new Date().toLocaleTimeString() + ' – tap to sync now');
}
async function pullCloud() {
  if (!cloud || !fb) return startCloud();
  try { badge('Syncing…'); const snap = await fb.getDocFromServer(cloud.ref); if (snap.exists()) applyRemote(snap); else pushCloud(); } catch (e) { syncFail(e); }
}
let pushing = false, again = false;
async function pushCloud() {
  if (!cloud || !fb) return;
  if (pushing) { again = true; return; }
  pushing = true; let m = null;
  try {
    // read-merge-write in one transaction so we never overwrite what the other person just saved
    await fb.runTransaction(fb.db, async tx => {
      const snap = await tx.get(cloud.ref); m = S;
      if (snap.exists()) { try { m = merge(S, JSON.parse(snap.data().state)); } catch { } }
      tx.set(cloud.ref, { state: JSON.stringify(m) });
    });
    const nm = merge(S, m); if (sig(nm) !== sig(S)) { S = nm; localSave(); render(); }
    badge('Synced ✓', 'Last synced ' + new Date().toLocaleTimeString() + ' – tap to sync now');
  } catch (e) { syncFail(e); } finally { pushing = false; if (again) { again = false; pushCloud(); } }
}
['online', 'focus'].forEach(ev => window.addEventListener(ev, () => { if (cloud) pullCloud(); }));
document.addEventListener('visibilitychange', () => { if (!document.hidden && cloud) pullCloud(); });
setInterval(() => { if (cloud && !document.hidden) pullCloud(); }, 60000);
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
  S.bookings.filter(b => b.date && b.status !== 'option').forEach(b => {
    const arrT = b.arrTime ? (b.arrDate && b.arrDate !== b.date ? fmtS(b.arrDate) + ' ' : '') + b.arrTime : '';
    ev.push({ date: b.date, time: b.time || '', kind: 'booking', id: b.id, ico: MODE_ICO[b.mode] || '🧭', title: `${b.from} → ${b.to}`, sub: [(b.who === '0' || b.who === '1') && '👤 ' + people()[+b.who], arrT && 'arrives ' + arrT, b.ref && 'Ref ' + b.ref, b.cost && inr(b.cost)].filter(Boolean).join(' · '), stl: label(BSTAT, b.status), pill: pill(b.status, label(BSTAT, b.status)), timer: timerHTML(b) });
    if (b.arrDate && b.arrDate !== b.date && b.status !== 'cancelled') ev.push({ date: b.arrDate, time: b.arrTime || '', kind: 'booking', id: b.id, ico: '🏁', title: 'Arrive ' + b.to, sub: 'from ' + b.from + (b.arrTime ? '' : ''), stl: label(BSTAT, b.status), pill: '' });
  });
  S.stays.filter(h => h.status !== 'shortlist').forEach(h => {
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
    { k: 'arrDate', l: 'Arrival date (next day for night trains)', t: 'date', w: 'h' }, { k: 'arrTime', l: 'Arrival time – starts the timer', t: 'time', w: 'h' },
    { k: 'depTz', l: 'Departure time zone', t: 'select', o: TZS, def: '+05:30', w: 'h' }, { k: 'arrTz', l: 'Arrival time zone', t: 'select', o: TZS, def: '+05:30', w: 'h' },
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
    { k: 'plan', l: 'In the plan?', t: 'select', o: PLANS, def: 'yes', w: 'h' }, { k: 'tix', l: 'Ticket / booking needed?', t: 'select', o: TIX, def: 'gate', w: 'h' }, { k: 'cost', l: 'Tickets / entry cost for both (₹)', t: 'number' }, { k: 'lat', l: 'Latitude', t: 'number', w: 'h' }, { k: 'lng', l: 'Longitude', t: 'number', w: 'h' },
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
      if (rest.start && rest.end && rest.end < rest.start) { toast('End date is before the start date'); return; }
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
const sampleBtn = '<button class="btn ghost" data-act="sample">✨ Load our Rajasthan trip (Jan–Feb 2027)</button>';

function totals() {  // budget: skips cancelled / alternative / ideas; for shortlisted hotels counts the cheapest option
  const rate = +S.trip.aedRate || 24;
  const spent = S.expenses.reduce((a, e) => a + (+e.amount || 0) * (e.currency === 'AED' ? rate : 1), 0);
  const live = x => !['cancelled', 'shortlist', 'option'].includes(x.status);
  const booked = S.bookings.filter(b => b.status === 'confirmed').reduce((a, b) => a + (+b.cost || 0), 0) + S.stays.filter(h => h.status === 'booked').reduce((a, h) => a + (+h.cost || 0), 0);
  const planned = S.bookings.filter(b => live(b) && b.status !== 'confirmed').reduce((a, b) => a + (+b.cost || 0), 0) + S.stays.filter(h => live(h) && h.status !== 'booked').reduce((a, h) => a + (+h.cost || 0), 0) + S.places.filter(p => !p.visited && p.plan !== 'idea').reduce((a, p) => a + (+p.cost || 0), 0) + shortlistCost();
  return { spent, booked, planned, budget: +S.trip.budget || 0, rate };
}

function viewHome() {
  const t = S.trip, today = todayISO();
  const nb = S.bookings.filter(b => !['cancelled', 'option'].includes(b.status)), cb = nb.filter(b => b.status === 'confirmed').length;
  const ns = S.stays.filter(h => !['cancelled', 'shortlist'].includes(h.status)), bs = ns.filter(h => h.status === 'booked').length;
  const tot = totals(), used = tot.spent + tot.booked, pct = tot.budget ? Math.min(100, used / tot.budget * 100) : 0;
  let countdown = '';
  if (t.start) { const d = diffDays(today, t.start); countdown = d > 0 ? `<b>${d}</b> days to go` : (t.end && today > t.end ? 'Trip complete 🎉' : `Day <b>${1 - d}</b> of the trip`); }
  const todo = [
    ...S.bookings.filter(b => !['confirmed', 'cancelled', 'option'].includes(b.status)).map(b => ({ date: b.date, kind: 'booking', id: b.id, ico: MODE_ICO[b.mode], t: `${b.from} → ${b.to}`, st: b.status, lab: label(BSTAT, b.status) })),
    ...S.stays.filter(h => !['booked', 'cancelled', 'shortlist'].includes(h.status)).map(h => ({ date: h.checkin, kind: 'stay', id: h.id, ico: '🏨', t: h.name, st: h.status, lab: label(SSTAT, h.status) }))
  ].sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  const next = events().filter(e => e.date >= today).slice(0, 4);
  return `
  <div class="card"><div class="row"><div><h3>${esc(t.name)}</h3><div class="muted">${t.start ? fmt(t.start) : 'Set dates'}${t.end ? ' → ' + fmt(t.end) : ''}</div></div><div style="text-align:right">${countdown}</div></div></div>
  <div class="grid2" style="margin-bottom:10px">
    <div class="stat"><span class="muted">🎫 Transport confirmed</span><b>${cb}/${nb.length}</b></div>
    <div class="stat"><span class="muted">🏨 Hotels booked</span><b>${bs}/${ns.length}</b></div>
    <div class="stat"><span class="muted">📍 Places planned</span><b>${S.places.filter(p => p.plan !== 'idea').length}</b></div>
    <div class="stat"><span class="muted">✅ Visited</span><b>${S.places.filter(p => p.visited).length}</b></div>
  </div>
  <div class="card"><div class="row"><h3>💰 Budget</h3><span class="muted">${inr(used)} of ${inr(tot.budget)}</span></div><div class="bar" style="margin-top:8px"><i class="${used > tot.budget ? 'over' : ''}" style="width:${pct}%"></i></div></div>
  ${healthCard()}${todayCard()}${arrivalsCard()}${weatherCard()}
  ${!S.bookings.length && !S.stays.length && !S.places.length ? empty('Nothing planned yet. Start fresh or load an editable example.', sampleBtn) : ''}
  <div class="h2">⚠️ Still to book <span>${todo.length}</span></div>
  ${todo.length ? todo.map(x => `<div class="card"><div class="row"><div class="grow" data-act="edit" data-kind="${x.kind}" data-id="${x.id}" style="cursor:pointer"><b>${x.ico} ${esc(x.t)}</b><div class="muted">${fmt(x.date)}</div></div>${pill(x.st, x.lab)}</div></div>`).join('') : '<div class="muted" style="padding:4px 2px">All booked. 🎉</div>'}
  <div class="h2">Coming up</div>
  ${next.length ? next.map(e => `<div class="card"><div class="item" data-act="edit" data-kind="${e.kind}" data-id="${e.id}" style="cursor:pointer;border:0"><div class="ico">${e.ico}</div><div class="grow"><b>${esc(e.title)}</b><div class="muted">${fmt(e.date)}${e.time && e.kind === 'booking' ? ' · ' + e.time : ''}</div>${e.timer ? `<div style="margin-top:3px">${e.timer}</div>` : ''}</div>${e.pill}</div></div>`).join('') : '<div class="muted" style="padding:4px 2px">Nothing upcoming.</div>'}
  <div class="h2">Settings</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn ghost small" data-act="edit" data-kind="trip">⚙️ Trip settings</button>
    <button class="btn ghost small" data-act="code">🔗 Sync code</button>
    <button class="btn ghost small" data-act="syncnow">🔄 Sync now</button>
    <button class="btn ghost small" data-act="ics">📅 Add to calendar</button>
    <button class="btn ghost small" data-act="share">📤 Share summary</button>
    <button class="btn ghost small" data-act="print">🖨️ Print</button>
    <button class="btn ghost small" data-act="backup">⬇️ Backup</button>
    <button class="btn ghost small" data-act="restore">⬆️ Restore</button>
    ${S.bookings.length || S.places.length ? '<button class="btn ghost small" data-act="sample">✨ Reload our Rajasthan trip</button>' : ''}
  </div>`;
}

function calendarHTML(ev, first, last) {
  const t = S.trip, today = todayISO(), has = {};
  ev.forEach(e => { has[e.date] = (has[e.date] || 0) + 1; });
  let out = '', m = first.slice(0, 7) + '-01', g = 0;
  while (m <= last && g++ < 14) {
    const dt = toDate(m), lead = (dt.getDay() + 6) % 7, n = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
    let cells = '<i></i>'.repeat(lead);
    for (let k = 1; k <= n; k++) {
      const d = m.slice(0, 8) + String(k).padStart(2, '0'), inTrip = t.start && t.end ? d >= t.start && d <= t.end : (d >= first && d <= last);
      const cls = ['cal', inTrip ? 'in' : '', d === t.start || d === t.end ? 'edge' : '', d === today ? 'today' : '', has[d] ? 'has' : ''].join(' ');
      cells += `<b class="${cls}" ${inTrip || has[d] ? `data-act="caljump" data-v="${d}"` : ''}>${k}${has[d] ? '<u></u>' : ''}</b>`;
    }
    out += `<div class="card calm"><h3>${dt.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h3><div class="calg"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>${cells}</div></div>`;
    m = addDays(m.slice(0, 7) + '-28', 4).slice(0, 7) + '-01';
  }
  return `<div class="calwrap">${out}</div><div class="muted" style="margin:2px 0 8px">Shaded = trip days · dot = something planned · tap a day to jump to it</div>`;
}
function viewPlan() {
  const ev = events();
  if (!ev.length) return empty('Your day-by-day plan appears here once you add dated bookings, stays or places.', sampleBtn);
  const dates = ev.map(e => e.date), t = S.trip, base = t.start || dates[0], today = todayISO();
  // the plan covers the TRIP dates (so changing them changes the plan), and stretches to include any item outside them
  const first = [t.start, dates[0]].filter(Boolean).sort()[0], last = [t.end, dates[dates.length - 1]].filter(Boolean).sort().pop();
  let html = '', d = first, guard = 0;
  while (d <= last && guard++ < 400) {
    const items = ev.filter(e => e.date === d);
    const stay = S.stays.filter(h => h.status !== 'shortlist' && h.status !== 'cancelled' && h.checkin && h.checkout && h.checkin < d && d < h.checkout);
    const cities = [...new Set(items.filter(e => e.kind === 'place').map(e => S.places.find(p => p.id === e.id)?.city).filter(Boolean))].join(', ');
    const out = (t.start && d < t.start) || (t.end && d > t.end);
    html += `<div class="day" id="day-${d}"><h4>${d === today ? '🟢 ' : ''}${out ? 'Outside trip dates' : 'Day ' + (diffDays(base, d) + 1)} · ${fmt(d)}${cities ? ' · ' + esc(cities) : ''}</h4>
      ${items.map(e => `<div class="item" data-act="edit" data-kind="${e.kind}" data-id="${e.id}" style="cursor:pointer"><div class="ico">${e.ico}</div><div class="grow"><b>${esc(e.title)}</b>${e.sub ? `<div class="muted">${esc(e.sub)}</div>` : ''}${e.timer ? `<div style="margin-top:3px">${e.timer}</div>` : ''}</div>${e.pill}</div>`).join('')}
      ${stay.map(h => `<div class="item"><div class="ico">🌙</div><div class="grow muted">Staying at ${esc(h.name)}</div></div>`).join('')}
      ${!items.length && !stay.length ? '<div class="muted">Free day – add something 🙂</div>' : ''}</div>`;
    d = addDays(d, 1);
  }
  return `<div class="h2">Calendar <span><button class="btn ghost small" data-act="edit" data-kind="trip">Change dates</button></span></div>${calendarHTML(ev, first, last)}<div class="h2">Day-by-day <span>${addBtn('place', 'Place')}</span></div>${html}`;
}

function viewBook() {
  const modes = [['all', 'All'], ...MODES.map(m => [m[0], m[1]])];
  const list = S.bookings.filter(b => UI.bookMode === 'all' || b.mode === UI.bookMode).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const sel = (kind, id, cur, opts) => `<select data-act="setstat" data-kind="${kind}" data-id="${id}" style="width:auto;max-width:140px;font-size:12px;padding:5px">${opts.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `
  <div class="h2">Transport <span>${addBtn('booking', 'Add')}</span></div>
  <div class="chips">${modes.map(([v, l]) => `<button class="chip ${UI.bookMode === v ? 'on' : ''}" data-act="bookmode" data-v="${v}">${l}</button>`).join('')}</div>
  ${list.length ? list.map(b => `<div class="card"><div class="row" style="align-items:flex-start"><div class="grow" data-act="edit" data-kind="booking" data-id="${b.id}" style="cursor:pointer"><h3>${MODE_ICO[b.mode]} ${esc(b.from)} → ${esc(b.to)} ${whoPill(b.who)}</h3><div class="muted">${fmt(b.date)}${b.time ? ' · ' + esc(b.time) + tzNote(b.depTz) : ''}${arrText(b)}${b.ref ? ' · Ref ' + esc(b.ref) : ''}${b.cost ? ' · ' + inr(b.cost) : ''}</div>${timerHTML(b) ? `<div style="margin:5px 0">${timerHTML(b)}</div>` : ''}${b.notes ? `<div class="muted">${esc(b.notes)}</div>` : ''}${b.link ? `<div style="margin-top:4px"><a href="${esc(b.link)}" target="_blank" rel="noopener">Open booking site ↗</a></div>` : ''}</div><div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">${pill(b.status, label(BSTAT, b.status))}${sel('booking', b.id, b.status, BSTAT)}</div></div></div>`).join('') : empty('No transport yet. Add trains, buses, flights and cabs.')}
  <div class="h2">Hotels & stays <span>${addBtn('stay', 'Add')}</span></div>
  ${S.stays.length ? [...S.stays].sort((a, b) => (a.checkin || '').localeCompare(b.checkin || '')).map(h => `<div class="card"><div class="row" style="align-items:flex-start"><div class="grow" data-act="edit" data-kind="stay" data-id="${h.id}" style="cursor:pointer"><h3>🏨 ${esc(h.name)}</h3><div class="muted">${esc(h.city || '')} · ${fmtS(h.checkin)}${h.checkout ? ' → ' + fmtS(h.checkout) : ''}${h.cost ? ' · ' + inr(h.cost) : ''}</div><div style="margin-top:4px">${pill(h.veg === 'non' ? 'bad' : 'veg', VEG_L[h.veg])}${h.phone ? ` <a href="tel:${esc(h.phone)}">📞 ${esc(h.phone)}</a>` : ''}</div>${h.notes ? `<div class="muted">${esc(h.notes)}</div>` : ''}</div><div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">${pill(h.status, label(SSTAT, h.status))}${h.status === 'shortlist' ? `<button class="btn small" data-act="choose" data-id="${h.id}">✓ Choose</button>` : ''}${sel('stay', h.id, h.status, SSTAT)}</div></div></div>`).join('') : empty('No hotels yet.')}`;
}

function viewPlaces() {
  const f = UI.placeFilter;
  const filters = [['all', 'All'], ['veg', '🌱 Veg-friendly'], ['todo', 'Not visited'], ['nodate', 'No date yet'], ['ideas', '💡 Ideas'], ...CATS.slice(0, 5)];
  const ok = p => f === 'all' || (f === 'veg' && ['pure', 'options'].includes(p.veg)) || (f === 'todo' && !p.visited) || (f === 'nodate' && !p.date && p.plan !== 'idea') || (f === 'ideas' && p.plan === 'idea') || p.category === f;
  const list = S.places.filter(ok).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const card = p => `<div class="card"><div class="row" style="align-items:flex-start"><div class="grow" data-act="edit" data-kind="place" data-id="${p.id}" style="cursor:pointer"><h3>${CAT_ICO[p.category] || '📍'} ${esc(p.name)}</h3><div class="muted">${p.date ? fmt(p.date) : 'No date yet'}${p.time ? ' · ' + esc(p.time) : ''}${p.city ? ' · ' + esc(p.city) : ''}${p.cost ? ' · 🎟️ ' + inr(p.cost) : ''}</div><div style="margin:4px 0">${pill(p.veg === 'non' ? 'bad' : 'veg', VEG_L[p.veg])} ${p.plan === 'idea' ? pill('maybe', '💡 Idea') : ''} ${p.tix === 'tobook' ? pill('pending', 'Book ahead') : p.tix === 'booked' ? pill('booked', 'Ticket booked ✓') : ''} ${p.visited ? pill('visited', 'Visited ✓') : ''}</div>${p.notes ? `<div class="muted">${esc(p.notes)}</div>` : ''}</div>
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
  S.bookings.filter(b => b.status !== 'cancelled' && b.status !== 'option' && (all || b.date === day)).forEach(b => {
    const a = coordFor(b.from), c = coordFor(b.to); if (!a || !c) return;
    L.polyline([a, c], { color: MODE_COLOR[b.mode] || '#777', weight: 3, dashArray: '8 8', opacity: .85 }).addTo(map)
      .bindPopup(`<b>${MODE_ICO[b.mode]} ${esc(b.from)} → ${esc(b.to)}</b><br>${fmt(b.date)} ${esc(b.time || '')}<br>${esc(label(BSTAT, b.status))}`);
    [[a, b.from], [c, b.to]].forEach(([p, n]) => { L.circleMarker(p, { radius: 5, color: '#fff', weight: 2, fillColor: '#2b2118', fillOpacity: 1 }).addTo(map).bindTooltip(esc(n)); pts.push(p); });
  });
  // stays
  S.stays.filter(h => h.status !== 'cancelled' && h.status !== 'shortlist' && (all || (h.checkin <= day && (h.checkout ? day < h.checkout : day === h.checkin)))).forEach(h => {
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
  tickTimers();
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
  else if (act === 'choose') {
    const h = S.stays.find(x => x.id === id);
    if (h) {
      S.stays.filter(x => x.id !== h.id && x.status === 'shortlist' && x.city === h.city && x.checkin === h.checkin && x.checkout === h.checkout).forEach(x => { x.status = 'cancelled'; touch(x); });
      h.status = 'pending'; touch(h); save(); render(); toast('Chosen – the other options were marked cancelled');
    }
  }
  else if (act === 'ics') exportICS();
  else if (act === 'share') shareSummary();
  else if (act === 'print') window.print();
  else if (act === 'sample') loadSample();
  else if (act === 'code') askCode();
  else if (act === 'syncnow') { if (cloud) { pullCloud(); toast('Syncing…'); } else askCode(); }
  else if (act === 'caljump') { const el = document.getElementById('day-' + v); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1500); } }
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
$('#syncBadge').onclick = () => { if (cloud) pullCloud(); else askCode(); };

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
  const bk = S.bookings.filter(b => !['cancelled', 'option'].includes(b.status)), stays = S.stays.filter(h => !['cancelled', 'shortlist'].includes(h.status));

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

  // 1b. anything dated outside the trip dates (e.g. after you changed them)
  if (S.trip.start && S.trip.end) {
    const outs = [...bk.map(b => [b.date, `${b.from} → ${b.to}`, 'booking', b.id]), ...S.stays.filter(h => h.status !== 'shortlist' && h.status !== 'cancelled').map(h => [h.checkin, h.name, 'stay', h.id]), ...S.places.filter(p => p.plan !== 'idea').map(p => [p.date, p.name, 'place', p.id])].filter(([d]) => d && (d < S.trip.start || d > S.trip.end));
    if (outs.length) add('warn', `${outs.length} item${outs.length > 1 ? 's are' : ' is'} dated outside your trip dates`, outs.slice(0, 3).map(o => `${o[1]} (${fmtS(o[0])})`).join(', ') + (outs.length > 3 ? '…' : '') + ' – move it or change the trip dates.', outs[0][2], outs[0][3]);
  }

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

  // 2b. leaving a city while its stay is still running, arriving where you have no stay, impossible times
  bk.filter(b => ['train', 'bus', 'flight'].includes(b.mode) && b.date).forEach(b => {
    const still = stays.find(h => sameCity(h.city, b.from) && h.checkin && h.checkin <= b.date && h.checkout && b.date < h.checkout);
    if (still) add('warn', `You leave ${b.from} on ${fmt(b.date)} but ${still.name} is booked until ${fmt(still.checkout)}`, 'Two of your plans disagree, or you would pay for a night you do not use. Check the dates.', 'booking', b.id);
    const arr = b.arrDate || b.date, there = stays.filter(h => h.checkin && sameCity(h.city, b.to));
    if (there.length && !there.some(h => h.checkin <= arr && (h.checkout ? arr < h.checkout : arr === h.checkin))) {
      const nxt = there.filter(h => h.checkin > arr).sort((x, y) => x.checkin.localeCompare(y.checkin))[0];
      add('warn', `You arrive in ${b.to} on ${fmt(arr)} but have no stay there that night`, nxt ? `Your next stay there starts ${fmt(nxt.checkin)} (${nxt.name}).` : 'Your stays there have all ended.', 'booking', b.id);
    }
    const d0 = depOf(b), a0 = arrOf(b);
    if (d0 && a0 && a0 <= d0) add('warn', `${b.from} → ${b.to}: arrival is before departure`, 'Check the arrival date, time and time zones.', 'booking', b.id);
  });
  const noArr = bk.filter(b => !b.arrTime).length;
  if (noArr) add('info', `${noArr} transport leg${noArr === 1 ? ' has' : 's have'} no arrival time`, 'Add it to get an arrival timer.', '');

  // 3. nights with no hotel / double-booked nights
  if (S.trip.start && S.trip.end) {
    const missing = [], picks = new Map();
    for (let d = S.trip.start, g = 0; d < S.trip.end && g < 120; d = addDays(d, 1), g++) {
      const hs = stays.filter(h => h.checkin && h.checkin <= d && (h.checkout ? d < h.checkout : d === h.checkin));
      const overnight = bk.some(b => b.date === d && ['train', 'bus'].includes(b.mode) && (b.time || '') >= '17:00');
      if (!hs.length && !overnight) {
        const opts = S.stays.filter(h => h.status === 'shortlist' && h.checkin && h.checkin <= d && (h.checkout ? d < h.checkout : d === h.checkin));
        if (opts.length) picks.set(opts[0].city || opts[0].name, opts); else missing.push(d);
      }
      if (hs.length > 1) add('warn', `Two stays overlap on the night of ${fmt(d)}`, hs.map(h => h.name).join(' & '), 'stay', hs[0].id);
    }
    picks.forEach((opts, city) => add('warn', `Choose a hotel in ${city} – ${opts.length} option${opts.length === 1 ? '' : 's'} shortlisted`, `${fmtS(opts[0].checkin)} – ${fmtS(opts[0].checkout)} · tap Bookings → ✓ Choose`, 'stay', opts[0].id));
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
  S.places.filter(p => p.tix === 'tobook' && p.plan !== 'idea').forEach(p => {
    const n = p.date ? dleft(p.date) : null;
    add(n !== null && n <= 30 ? 'bad' : 'warn', `Book tickets for ${p.name}`, (p.date ? `${fmt(p.date)} (${days(n)}). ` : 'No date yet. ') + 'Popular slots sell out – book early.', 'place', p.id);
  });
  const clash = {};
  S.places.filter(p => p.date && p.time).forEach(p => { (clash[p.date + ' ' + p.time] = clash[p.date + ' ' + p.time] || []).push(p); });
  Object.values(clash).filter(l => l.length > 1).forEach(l => add('warn', `${l.length} places at the same time: ${l.map(p => p.name).join(' & ')}`, `${fmt(l[0].date)} ${l[0].time}`, 'place', l[0].id));
  const undated = S.places.filter(p => !p.date && p.plan !== 'idea').length;
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
  const row = e => `<div class="item" data-act="edit" data-kind="${e.kind}" data-id="${e.id}" style="cursor:pointer"><div class="ico">${e.ico}</div><div class="grow"><b>${esc(e.title)}</b>${e.sub ? `<div class="muted">${esc(e.sub)}</div>` : ''}${e.timer ? `<div style="margin-top:3px">${e.timer}</div>` : ''}</div>${e.pill}</div>`;
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
/* =====================================================================
   Arrival timers, shortlist helpers
   ===================================================================== */
const instant = (d, t, tz) => {
  if (!d || !/^\d\d:\d\d$/.test(t || '')) return null;
  const x = new Date(`${d}T${t}:00${tz || '+05:30'}`);
  return isNaN(x) ? null : x;
};
const arrOf = b => instant(b.arrDate || b.date, b.arrTime, b.arrTz);
const depOf = b => instant(b.date, b.time, b.depTz);
function fmtLeft(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
// dep/arr are epoch milliseconds (dep may be null). Returns the text and style for the timer pill.
function timerInfo(dep, arr, now) {
  if (arr === null || arr === undefined) return null;
  if (now >= arr) return { cls: 'done', text: now - arr < 48 * 36e5 ? `✓ Arrived ${fmtLeft(now - arr)} ago` : '✓ Arrived' };
  if (dep !== null && dep !== undefined && now >= dep) return { cls: 'live', text: `🚆 On the way · arrives in ${fmtLeft(arr - now)}` };
  return { cls: 'wait', text: `⏱ Arrives in ${fmtLeft(arr - now)}` };
}
function timerHTML(b) {
  if (!b || b.status === 'cancelled') return '';
  const a = arrOf(b); if (!a) return '';
  const d = depOf(b);
  return `<span class="timer wait" data-arr="${a.getTime()}" data-dep="${d ? d.getTime() : ''}">…</span>`;
}
function tickTimers(now = Date.now()) {
  document.querySelectorAll('.timer[data-arr]').forEach(el => {
    const i = timerInfo(el.dataset.dep ? +el.dataset.dep : null, +el.dataset.arr, now);
    if (i) { el.textContent = i.text; el.className = 'timer ' + i.cls; }
  });
}
setInterval(tickTimers, 1000);

const tzNote = z => z === '+04:00' ? ' (Dubai time)' : '';
const arrText = b => b.arrTime ? ` → ${b.arrDate && b.arrDate !== b.date ? fmtS(b.arrDate) + ' ' : ''}${esc(b.arrTime)}${tzNote(b.arrTz)}` : '';

function arrivalsCard() {
  const now = Date.now();
  const list = S.bookings.filter(b => b.status !== 'cancelled' && b.status !== 'option').map(b => ({ b, a: arrOf(b) })).filter(x => x.a && x.a.getTime() > now - 6 * 36e5).sort((x, y) => x.a - y.a).slice(0, 4);
  if (!list.length) return '';
  return `<div class="card wide"><h3>⏱ Next arrivals</h3>${list.map(({ b }) => `<div class="item" data-act="edit" data-kind="booking" data-id="${b.id}" style="cursor:pointer"><div class="ico">${MODE_ICO[b.mode]}</div><div class="grow"><b>${esc(b.from)} → ${esc(b.to)}</b> ${whoPill(b.who)}<div class="muted">${fmt(b.date)}${b.time ? ' ' + esc(b.time) : ''}${arrText(b)}</div><div style="margin-top:3px">${timerHTML(b)}</div></div></div>`).join('')}<div class="muted" style="margin-top:6px">Every leg has its own timer under Bookings.</div></div>`;
}
function shortlistCost() {
  const g = {};
  S.stays.filter(h => h.status === 'shortlist' && +h.cost > 0).forEach(h => { const k = [h.city, h.checkin, h.checkout].join('|'); g[k] = Math.min(g[k] ?? Infinity, +h.cost); });
  return Object.values(g).reduce((a, x) => a + x, 0);
}

function defaultLists(start) {
  const n = Date.now(); let i = 0;
  const D = k => start ? addDays(start, k) : '';
  const T = (group, text, who = 'both', due = '') => ({ id: uid(), group, text, who, due, done: false, _u: n, _o: n + (i++) });
  const tasks = [
    T('pack', 'Warm layers – Rajasthan nights in January are cold, desert camps colder'), T('pack', 'Thermals, woollen cap, gloves and socks (night trains + dunes)'),
    T('pack', 'Scarf / mask for dust and sun'), T('pack', 'Modest clothes for temples & forts (cover shoulders and knees)'),
    T('pack', 'Comfortable walking shoes – lots of steps in forts'), T('pack', 'Sunglasses, sunscreen, lip balm'),
    T('pack', 'Power bank + chargers (night trains, long days)'), T('pack', 'Plug adapter for her devices (UAE → India)', '1'),
    T('pack', 'Binoculars & camera for the raptor, bird and leopard safaris'), T('pack', 'Small notes & coins for tips, rickshaws, entry'),
    T('pack', 'Reusable water bottle'), T('pack', 'Basic medicines: motion-sickness, ORS, stomach, pain relief, plasters'),
    T('pack', 'Hand sanitiser & wet wipes'), T('pack', 'Snacks for long train rides (veg)'), T('pack', 'Small padlock/chain for luggage on night trains'),
    T('docs', 'Photo ID for both – Aadhaar / passport (needed on trains, hotels, safaris)'), T('docs', 'Her passport + UAE residence ID; check Indian visa / OCI status', '1'),
    T('docs', 'IRCTC e-tickets for all 8 train legs saved offline (PDF/screenshots)'), T('docs', 'Flight tickets for 7 Feb saved offline'),
    T('docs', 'Hotel confirmations saved offline'), T('docs', 'Safari booking confirmations (Jorbeer, Phulera, Jawai)'),
    T('docs', 'Travel insurance papers'), T('docs', 'Copies of IDs kept separately (photo in phone + paper)'),
    T('todo', 'Book the 8 trains on IRCTC as each 60-day window opens – first one (19 Jan) opens about ' + (start ? fmtS(D(-60)) : '60 days before'), 'both', D(-60)),
    T('todo', 'Add HER flight Dubai → Jaipur (not in your documents; the first hotel night is 20 Jan)', '1', D(-45)),
    T('todo', 'Decide the Jodhpur → Jawai → Jaipur dates: the train list and the itinerary disagree (see Bookings: the “Alternative” legs)', 'both', D(-45)),
    T('todo', 'Pick one hotel each in Jaipur, Bikaner and Bharatpur (Bookings → ✓ Choose)', 'both', D(-30)),
    T('todo', 'Check the Jorbeer raptor safari with Dr Solanki (link in Places)', 'both', D(-30)),
    T('todo', 'Fill in the Phulera safari details (your notes only say “SAFARI -”)', 'both', D(-30)),
    T('todo', 'Arrange the transfer between Falna station / Jodhpur and Jawai (not in your documents)', 'both', D(-30)),
    T('todo', 'Ask each hotel and camp about vegetarian food', 'both', D(-21)),
    T('todo', 'Ask the Bikaner hotel about early check-in (train arrives 06:15)', 'both', D(-14)),
    T('todo', 'Buy travel insurance', 'both', D(-21)), T('todo', 'Tell her bank/card she is travelling to India', '1', D(-7)),
    T('todo', 'Download offline maps (Jaipur, Bikaner, Bharatpur, Jaisalmer, Jodhpur, Jawai)', 'both', D(-2)),
    T('todo', 'Withdraw cash – camps and small shops often take cash only', 'both', D(-1)),
    T('todo', 'Share live location with family on travel days'), T('todo', 'Add this trip to your phone calendar (Home → Add to calendar)')
  ];
  const C = (name, role, phone, notes = '') => ({ id: uid(), name, role, phone, notes, _u: n, _o: n + (i++) });
  const contacts = [
    C('Emergency (police, fire, ambulance)', 'India', '112', 'Verify numbers before travel'), C('Ambulance', 'India', '108'),
    C('Tourist helpline (24x7)', 'Ministry of Tourism', '1363'), C('Railway enquiry / help', 'Indian Railways', '139'),
    C('Dr Solanki', 'Jorbeer raptor safari (from your notes)', '', 'Booking page: https://jorbeer.com/vinayak-guest-house/ – add his phone number')
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

function loadSample(auto) {
  if (!auto && (S.bookings.length || S.places.length || S.stays.length) && !confirm('This replaces what you have now with your Rajasthan Jan–Feb 2027 plan. Continue?')) return;
  seeding = true; seedN = 0;
  const IRCTC = 'https://www.irctc.co.in', id = uid;
  S.deleted = S.deleted || {};
  const t0 = Date.now();
  COLS.forEach(c => (S[c] || []).forEach(it => { S.deleted[it.id] = t0; }));
  S.trip = { ...S.trip, name: 'Rajasthan – Jan/Feb 2027', start: '2027-01-19', end: '2027-02-07' };

  // B(mode, from, to, depDate, depTime, arrDate, arrTime, cost, notes, who, extra)
  const B = (mode, from, to, date, time, arrDate, arrTime, cost, notes, who = 'both', extra = {}) =>
    ({ id: id(), mode, from, to, date, time, arrDate, arrTime, depTz: '+05:30', arrTz: '+05:30', status: 'notbooked', ref: '', cost, notes, link: mode === 'train' ? IRCTC : '', who, ...extra });
  S.bookings = [
    B('train', 'Jammu Tawi', 'Jaipur', '2027-01-19', '18:35', '2027-01-20', '09:35', 1810, 'Option A from your notes (“Jammu Tawai Train”). AC 2 Tier ₹1,810 · First Class ₹3,020 – cost shown is AC 2 Tier for one person. Arrival 9:35 AM next day (implied by the overnight journey). I assumed this one is YOUR train from Jammu. Option B – Surat → Jaipur: BDTS Jaipur SF, departs 20:43, arrives Jaipur 10:05 next day, AC 2 Tier ₹1,825.', '0'),
    B('train', 'Jaipur', 'Bikaner', '2027-01-22', '23:45', '2027-01-23', '06:15', 1960, 'HWH BKN Express. Fares per person: First Class ₹1,620 · 2nd AC (2 Tier) ₹980. Cost shown = 2 × ₹980 (2 Tier AC). Arrives Bikaner Sat 06:15 – ask the hotel about early check-in.'),
    B('train', 'Bikaner', 'Bharatpur', '2027-01-24', '22:30', '2027-01-25', '07:25', 2700, 'BKN SF Express. Per person: 2A ₹1,350 · 1A ₹2,230. Cost shown = 2 × ₹1,350.'),
    B('train', 'Bharatpur', 'Phulera', '2027-01-27', '08:10', '2027-01-27', '13:18', 1450, 'Maudhar Express. AC 2 Tier ₹725 per person. Cost shown = 2 × ₹725.'),
    B('train', 'Phulera', 'Jaisalmer', '2027-01-28', '23:25', '2027-01-29', '09:00', 2660, 'Swarn Nagri Express. AC 2 Tier ₹1,330 per person. Cost shown = 2 × ₹1,330.'),
    B('train', 'Jaisalmer', 'Jodhpur', '2027-01-31', '06:30', '2027-01-31', '11:30', 1130, 'JSM SBIB SF Express. AC 3 Tier ₹565 per person. Cost shown = 2 × ₹565.'),
    B('train', 'Jodhpur', 'Falna', '2027-02-01', '06:00', '2027-02-01', '08:00', 1140, '⚠️ CONFLICT with your itinerary. Train list: Vande Bharat Exp, AC Chair Car ₹570 (assumed per person), leaves Jodhpur 1 Feb 6:00 AM. Itinerary: you stay in Jodhpur 31 Jan – 2 Feb and leave at 12 PM on 2 Feb (see the Alternative leg below). Decide which is right.'),
    B('train', 'Falna', 'Jaipur', '2027-02-03', '09:17', '2027-02-03', '14:40', 1350, '⚠️ CONFLICT with your itinerary. Train list: SBIB BSB Express, AC 3 Tier ₹675 (assumed per person), 3 Feb 9:17 → 14:40. Itinerary: you are at Jawai until 5 Feb, leaving at 10:13 AM and reaching Jaipur at 17:45 on 5 Feb (see the Alternative leg below).'),
    B('cab', 'Jodhpur', 'Jawai', '2027-02-02', '12:00', '2027-02-02', '15:00', 0, 'ALTERNATIVE, from your itinerary: leave Jodhpur 12 PM, reach Jawai 3 PM on 2 Feb. Mode not stated – assumed a road transfer. Change the status from “Alternative” to “Not booked” if this is the real plan (and delete the Jodhpur → Falna train).', 'both', { status: 'option' }),
    B('train', 'Jawai', 'Jaipur', '2027-02-05', '10:13', '2027-02-05', '17:45', 0, 'ALTERNATIVE, from your itinerary: leave Jawai 10:13 AM, reach Jaipur 17:45 on 5 Feb (hotel Rameshwaram that night). Train from Falna assumed – add the train name/fare. Make it “Not booked” if this is the real plan (and delete the Falna → Jaipur 3 Feb train).', 'both', { status: 'option' }),
    B('flight', 'Jaipur', 'Jammu', '2027-02-07', '15:15', '2027-02-07', '20:00', 5784, 'YOUR flight home, Sun 7 Feb (your notes say “7th Jan (Sun)” – a Sunday only fits 7 Feb). 3:15 PM → 8 PM. Prices in your notes: AED 248 (Skyscanner) · AED 241 (MakeMyTrip). Cost shown = AED 241 × 24 = ₹5,784, assumed for one person. 4h45 is long for this route – check if it connects.', '0'),
    B('flight', 'Jaipur', 'Mumbai', '2027-02-07', '08:30', '2027-02-07', '10:30', 0, 'HER flight home, leg 1. Your notes say “08:3AM – 10:30AM” – I read it as 08:30; please confirm. Add the fare.', '1'),
    B('flight', 'Mumbai', 'Dubai', '2027-02-07', '15:50', '2027-02-07', '17:55', 0, 'HER flight home, leg 2. Two options in your notes: 15:50 → 17:55 (shown here) or 16:25 → 18:35 (see the Alternative below). Arrival is Dubai time. Add the fare.', '1', { arrTz: '+04:00' }),
    B('flight', 'Mumbai', 'Dubai', '2027-02-07', '16:25', '2027-02-07', '18:35', 0, 'ALTERNATIVE for her: 16:25 → 18:35 (Dubai time). Make it “Not booked” if you prefer this flight and delete the 15:50 one.', '1', { arrTz: '+04:00', status: 'option' })
  ];

  const H = (name, city, ci, co, status, cost, notes) => ({ id: id(), name, city, checkin: ci, checkout: co, status, veg: 'unknown', cost, ref: '', phone: '', notes });
  const sh = 'Shortlisted. Price from your notes – I assumed it is the total for the stay, not per night. ';
  S.stays = [
    H('Fab Hotel Pink Cozzy', 'Jaipur', '2027-01-20', '2027-01-22', 'shortlist', 2372, sh),
    H('Vinayak Guest House', 'Jaipur', '2027-01-20', '2027-01-22', 'shortlist', 2321, sh),
    H('Hotel Rameshwaram', 'Jaipur', '2027-01-20', '2027-01-22', 'shortlist', 2268, sh + 'You also listed this hotel for 5 Feb.'),
    H('Hotel Hanumat Palace', 'Jaipur', '2027-01-20', '2027-01-22', 'shortlist', 2463, sh),
    H('Hotel Vivo International', 'Bikaner', '2027-01-23', '2027-01-24', 'shortlist', 1160, sh + 'Train arrives 06:15 – ask about early check-in.'),
    H('Little Prince Guest House and Homestay', 'Bikaner', '2027-01-23', '2027-01-24', 'shortlist', 1044, sh + 'Train arrives 06:15 – ask about early check-in.'),
    H('Hotel Jaswant Bhawan', 'Bikaner', '2027-01-23', '2027-01-24', 'shortlist', 1890, sh + 'Your notes spell it “Jaswant Bahwan”. Train arrives 06:15 – ask about early check-in.'),
    H('Rose Merry Guesthouse', 'Bikaner', '2027-01-23', '2027-01-24', 'shortlist', 536, sh + 'Train arrives 06:15 – ask about early check-in.'),
    H('Karina Art Home Stay', 'Bikaner', '2027-01-23', '2027-01-24', 'shortlist', 1318, sh + 'Train arrives 06:15 – ask about early check-in.'),
    H('Iora Guest House', 'Bharatpur', '2027-01-25', '2027-01-27', 'shortlist', 2982, sh + 'Train arrives 07:25 on 25 Jan; you leave at 08:10 on 27 Jan.'),
    H('Royal House', 'Bharatpur', '2027-01-25', '2027-01-27', 'shortlist', 1254, sh + 'Train arrives 07:25 on 25 Jan; you leave at 08:10 on 27 Jan.'),
    H('Jungle Lodge', 'Bharatpur', '2027-01-25', '2027-01-27', 'shortlist', 2520, sh + 'Train arrives 07:25 on 25 Jan; you leave at 08:10 on 27 Jan.'),
    H('Heaven Café and Hotel', 'Phulera', '2027-01-27', '2027-01-28', 'pending', 1200, '₹1,200 per night (your notes). Arrive 13:18 on 27 Jan, night train 23:25 on 28 Jan. A cab to see the salt lake and nearby sights is ₹2,000 (added under Places).'),
    H('Magic Heritage Camp', 'Jaisalmer', '2027-01-29', '2027-01-30', 'pending', 1262, '29 Jan, 1 night, ₹1,262 (your notes). Train arrives 09:00.'),
    H('Sonar Bhumi Hotel', 'Jaisalmer', '2027-01-30', '2027-01-31', 'pending', 840, '30 Jan, 1 night, ₹840 (your notes). You leave on the 06:30 train on 31 Jan.'),
    H('House of Raghunath', 'Jodhpur', '2027-01-31', '2027-02-02', 'pending', 2876, '31 Jan – 2 Feb, 2 nights, ₹2,876 (assumed total). Train arrives 11:30. Itinerary says you leave at 12 PM on 2 Feb – but the train list has a Jodhpur → Falna train on 1 Feb at 6 AM.'),
    H('Jawai Backpackers Hotel', 'Jawai', '2027-02-02', '2027-02-05', 'pending', 5355, '2–5 Feb, 3 nights, ₹5,355 (assumed total). Itinerary: reach 3 PM on 2 Feb, leave 10:13 AM on 5 Feb. Your notes spell it “Backpacerks”.'),
    H('Hotel Rameshwaram', 'Jaipur', '2027-02-05', '2027-02-07', 'pending', 1260, '5–7 Feb (Fri–Sun). ₹1,260 is what your notes list – the same hotel was ₹2,268 for 2 nights earlier, so this may be one night only. Check. Reach Jaipur 17:45 on 5 Feb. Flights leave on 7 Feb.')
  ];

  const P = (name, category, city, lat, lng, veg, notes, o = {}) => ({ id: id(), name, category, city, lat, lng, date: '', time: '', veg, notes, cost: 0, tix: 'gate', plan: 'idea', visited: false, ...o });
  const IDEA = '💡 Idea (not in your documents). ';
  S.places = [
    P('Raptor Safari – Jorbeer Conservation Reserve', 'safari', 'Bikaner', '', '', 'unknown', 'From your notes: “CHECK” – https://jorbeer.com/vinayak-guest-house/ – DR SOLANKI. About 14.5 km south-east of Bikaner. Best day: 24 Jan (you arrive 23 Jan 06:15 and leave on the 22:30 train on 24 Jan). Pin not set – tap Edit → Find on map.', { plan: 'yes', tix: 'tobook' }),
    P('Sambhar Salt Lake – cab trip from Phulera', 'nature', 'Phulera', 26.9086, 75.1887, 'unknown', 'From your notes: ₹2,000 for a cab to see the salt lake and nearby sights. Best day: 28 Jan (you arrive 27 Jan 13:18, night train 23:25 on 28 Jan). Pin is approximate.', { plan: 'yes', cost: 2000 }),
    P('Safari at Phulera (details missing)', 'safari', 'Phulera', '', '', 'unknown', 'Your notes just say “SAFARI -”. Add the name, price and date when you know.', { plan: 'yes' }),
    P('Amber Fort', 'fort', 'Jaipur', 26.9855, 75.8513, 'unknown', IDEA + 'Go early to beat crowds. Indian adults about ₹200 each (some sources say ₹100) – confirm.', { cost: 400 }),
    P('City Palace, Jaipur', 'museum', 'Jaipur', 26.9258, 75.8237, 'unknown', IDEA + 'Run by the royal family trust, so confirm the price at the counter (reported about ₹200–400 pp).', { cost: 400 }),
    P('Hawa Mahal', 'fort', 'Jaipur', 26.9239, 75.8267, 'unknown', IDEA + 'The outside is free to view from the street (great at sunset); interior about ₹100 pp.', { cost: 200 }),
    P('Jantar Mantar', 'museum', 'Jaipur', 26.9247, 75.8246, 'unknown', IDEA + 'About ₹100 pp (older listings ₹50).', { cost: 200 }),
    P('LMB – Laxmi Misthan Bhandar (Johari Bazaar)', 'food', 'Jaipur', 26.9188, 75.8268, 'pure', IDEA + 'Pure-veg Rajasthani thali & sweets (please confirm hours).'),
    P('Junagarh Fort', 'fort', 'Bikaner', 28.0179, 73.3153, 'unknown', IDEA + 'Bikaner’s main fort. Entry fee and timings not checked.'),
    P('Karni Mata Temple, Deshnok', 'temple', 'Bikaner', 27.7907, 73.3419, 'unknown', IDEA + 'Famous temple of the rats, a short trip from Bikaner. Timings and any fees not checked.'),
    P('Keoladeo National Park', 'nature', 'Bharatpur', 27.1667, 77.5167, 'unknown', IDEA + 'Bird sanctuary right by Bharatpur – good for the 25–26 Jan days. Entry fee, cycle/rickshaw hire and timings not checked.'),
    P('Jawai leopard safari', 'safari', 'Jawai', 25.12, 73.15, 'unknown', IDEA + 'Jawai is known for leopards living on the granite hills; safaris and prices are arranged through lodges. Not checked. Pin is approximate.'),
    P('Mehrangarh Fort', 'fort', 'Jodhpur', 26.2979, 73.0184, 'unknown', IDEA + 'One listing: ₹100 pp for Indian adults, 9:00–17:00 (foreign adults ₹600 incl. audio guide). Confirm at the gate.', { cost: 200 }),
    P('Jaswant Thada', 'temple', 'Jodhpur', 26.3044, 73.021, 'unknown', IDEA + 'Small fee at the counter (price not confirmed).'),
    P('Clock Tower & Sardar Market', 'market', 'Jodhpur', 26.294, 73.0187, 'options', IDEA + 'Spices, sweets, handicrafts, local lassi and snacks. Check veg status of each stall.'),
    P('Jaisalmer Fort', 'fort', 'Jaisalmer', 26.9127, 70.9128, 'unknown', IDEA + 'About ₹50 pp for Indian visitors, Palace Museum included; roughly 9:00–18:00. Tickets at the gate.', { cost: 100 }),
    P('Gadisar Lake', 'nature', 'Jaisalmer', 26.9101, 70.914, 'unknown', IDEA + 'Sunset walk.'),
    P('Kuldhara Abandoned Village', 'temple', 'Jaisalmer', 26.8137, 70.7889, 'unknown', IDEA + 'Small entry fee at the gate (not confirmed).'),
    P('Sam Sand Dunes – camel & jeep safari', 'dunes', 'Jaisalmer', 26.8333, 70.5167, 'unknown', IDEA + 'Arrive for sunset. Camel ride and jeep safari prices are agreed locally – ask your camp (Magic Heritage Camp may arrange it).')
  ];
  S.expenses = [];
  const L = defaultLists(S.trip.start); S.tasks = L.tasks; S.contacts = L.contacts;
  const stamp = auto ? 1 : Date.now() + 1; // first-run copy is stamped 'oldest' so anything either of you edits always wins on sync
  COLS.forEach(c => S[c].forEach(it => { it._u = stamp; }));
  S.trip._u = stamp;
  seeding = false;
  save(); UI.tab = 'home'; render(); if (!auto) toast('Your Rajasthan trip is loaded');
}

/* ---------- boot ---------- */
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (map) map.invalidateSize(); }, 150); });
if (!localStorage.getItem('safar.state')) loadSample(true); // first open: start with the Rajasthan trip, ready to edit
else render();
if (firebaseConfig && !localStorage.getItem('safar.code')) setTimeout(askCode, 600);
startCloud();
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { });
