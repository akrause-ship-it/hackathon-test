/* ParkBack — SpotHero → Gusto reimbursement automation (prototype)
 *
 * Real receipt ingest (paste / file / photo-OCR via parseReceipt); the demo
 * `mockSpotHero` poller just fabricates charges. Gusto has no public submit
 * API, so "submit" is an honest handoff: download the receipt + open Gusto's
 * upload page (handoffToGusto). Everything else is real workflow: ingest →
 * draft → notify → approve → send, plus a $200/calendar-month allowance
 * ($100 employer + $100 employee pre-tax) with pause/resume. State persists
 * per user in localStorage (spec: multi-user).
 */

'use strict';

/* Monthly parking allowance = employer contribution + employee pre-tax. */
const EMPLOYER_CONTRIBUTION = 100;  // employer-funded portion, $/user/month
const EMPLOYEE_CONTRIBUTION = 100;  // employee pre-tax portion, $/user/month
const MONTHLY_ALLOWANCE = EMPLOYER_CONTRIBUTION + EMPLOYEE_CONTRIBUTION; // $200 total
const STORE_KEY = 'parkback.v1';

/* ----- Users (each connects their own SpotHero + Gusto) ----- */
const USERS = [
  { id: 'andre',  name: 'André Krause' },
  { id: 'sam',    name: 'Sam Rivera' },
  { id: 'priya',  name: 'Priya Patel' },
];

/* SpotHero venues used to fabricate realistic transactions. */
const VENUES = [
  { name: 'Millennium Park Garage',        city: 'Chicago, IL',       lo: 14, hi: 28 },
  { name: 'SP+ — 200 N LaSalle',           city: 'Chicago, IL',       lo: 18, hi: 34 },
  { name: 'Impark — Financial District',   city: 'San Francisco, CA', lo: 22, hi: 45 },
  { name: 'LAZ Parking — Midtown',         city: 'New York, NY',      lo: 28, hi: 55 },
  { name: 'Premier — Fenway Lot B',        city: 'Boston, MA',        lo: 16, hi: 30 },
  { name: 'ABM — Pioneer Square',          city: 'Seattle, WA',       lo: 12, hi: 24 },
];

/* =========================================================================
 * Mock external services
 * ===================================================================== */

let txnSeq = Date.now() % 100000; // monotonic-ish id source for the demo

const mockSpotHero = {
  /* Pretend to hit GET /v1/transactions and return `n` brand-new charges. */
  fetchNewTransactions(n = 1) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = VENUES[Math.floor(Math.random() * VENUES.length)];
      const amount = round2(v.lo + Math.random() * (v.hi - v.lo));
      const when = new Date();
      when.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0);
      const id = `SH-${++txnSeq}`;
      out.push({
        id,
        date: when.toISOString(),
        venue: v.name,
        city: v.city,
        amount,
        confirmation: id.replace('SH-', 'CONF'),
        receiptUrl: `https://spothero.com/receipts/${id}`, // simulated
      });
    }
    return out;
  },
};

/* Gusto exposes no public reimbursement-submit API. The real flow is a manual
 * upload at Gusto's reimbursement page, which OCRs the receipt itself. So our
 * "submit" is an honest handoff: download the receipt + open that page. The URL
 * is configurable (point it at your org's Gusto reimbursement upload screen). */
const GUSTO_UPLOAD_URL = 'https://app.gusto.com/';

/* =========================================================================
 * Persistent state (per user)
 * ===================================================================== */

function blankUserState() {
  return {
    connections: { spothero: false, gusto: false },
    drafts: [],      // awaiting approval
    held: [],        // arrived while capped — eligible next month
    submitted: [],   // sent to Gusto
    notifications: [],
    seenTxnIds: [],   // idempotency: never draft the same SpotHero txn twice
  };
}

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (raw && raw.users) return raw;
  } catch { /* ignore corrupt store */ }
  const fresh = { activeUser: USERS[0].id, users: {} };
  USERS.forEach(u => { fresh.users[u.id] = blankUserState(); });
  return fresh;
}

let store = loadStore();

/* Persist; if the quota is hit (receipt images add up), shed stored images
 * oldest-first and retry so the rest of the state still saves. */
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    let shed = false;
    for (const u of Object.values(store.users)) {
      for (const s of u.submitted) {
        if (s.txn && s.txn.receiptImage) {
          s.txn.receiptImage = '';
          shed = true;
          try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); return; } catch { /* keep shedding */ }
        }
      }
    }
    if (shed) toast('Storage was full — some older receipt images were dropped.');
  }
}
function state() { return store.users[store.activeUser]; }

/* =========================================================================
 * Helpers
 * ===================================================================== */

const $ = sel => document.querySelector(sel);
const round2 = n => Math.round(n * 100) / 100;
const money = n => `$${n.toFixed(2)}`;
const monthKey = iso => iso.slice(0, 7);            // "2026-06"
const thisMonth = () => new Date().toISOString().slice(0, 7);

function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/* Sum of reimbursements that COUNT against the cap this month.
 * Decision (spec Q5): the cap counts submitted reimbursements only. */
function submittedThisMonth() {
  const m = thisMonth();
  return round2(state().submitted
    .filter(r => monthKey(r.txn.date) === m)
    .reduce((s, r) => s + r.txn.amount, 0));
}

function remainingThisMonth() { return round2(MONTHLY_ALLOWANCE - submittedThisMonth()); }
function isCapped() { return submittedThisMonth() >= MONTHLY_ALLOWANCE; }

/* =========================================================================
 * Notifications (push/text are simulated as in-app + toast)
 * ===================================================================== */

function notify(kind, text) {
  state().notifications.unshift({
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind, text, at: new Date().toISOString(), read: false,
  });
  save();
  renderNotifications();
  toast(text);
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* =========================================================================
 * Core workflow
 * ===================================================================== */

/* Run one SpotHero transaction (mock-polled OR imported from a real receipt)
 * through the pipeline. Returns 'dup' | 'held' | 'drafted'; the caller owns
 * notifications so it can phrase them for batch polls vs. single imports. */
function intake(txn) {
  const st = state();
  if (st.seenTxnIds.includes(txn.id)) return 'dup';   // idempotency
  st.seenTxnIds.push(txn.id);

  if (isCapped()) {
    // Cap reached: hold the transaction for next month (spec: held, not dropped).
    st.held.push({ txn, heldAt: new Date().toISOString() });
    return 'held';
  }

  st.drafts.push({
    id: `d-${txn.id}`,
    txn,
    attachments: [
      txn.receiptImage ? 'Receipt photo (OCR)'
        : txn.source === 'import' ? 'Imported SpotHero receipt'
        : 'SpotHero receipt (PDF)',
      'Date · Location · Amount',
    ],
    createdAt: new Date().toISOString(),
    status: 'draft',
  });
  return 'drafted';
}

/* Mock poller — fabricate `n` new SpotHero charges and run them through intake. */
function ingest(n) {
  const st = state();
  if (!st.connections.spothero) { toast('Connect SpotHero first.'); return; }
  if (!st.connections.gusto)   { toast('Connect Gusto first.');   return; }

  let drafted = 0, held = 0;
  mockSpotHero.fetchNewTransactions(n).forEach(txn => {
    const r = intake(txn);
    if (r === 'drafted') drafted++;
    else if (r === 'held') held++;
  });

  save();

  if (drafted) notify('draft', `${drafted} reimbursement draft${drafted > 1 ? 's' : ''} ready to review.`);
  if (held)    notify('cap', `Allowance used up — ${held} transaction${held > 1 ? 's' : ''} held for next month.`);
  if (!drafted && !held) toast('No new transactions found.');

  render();
}

/* Importer — one transaction parsed from a real SpotHero receipt.
 * Unlike the mock poller this needs only Gusto (the destination) connected;
 * the receipt itself IS the SpotHero data source. */
function importReceipt(txn) {
  const st = state();
  if (!st.connections.gusto) { toast('Connect Gusto first to create a draft.'); return false; }

  const r = intake(txn);
  save();

  if (r === 'dup')       { toast('That receipt looks like it was already imported.'); render(); return false; }
  if (r === 'held')      notify('cap', `Allowance used up — ${money(txn.amount)} receipt held for next month.`);
  else                   notify('draft', `Imported receipt: ${money(txn.amount)} at ${txn.venue}. Draft ready.`);

  render();
  return true;
}

/* ----- Gusto handoff (no API — download the receipt + open the upload page) ----- */
function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = (meta.match(/data:([^;]+)/) || [, 'image/jpeg'])[1];
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function downloadFile(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildSummaryText(txn) {
  return [
    'ParkBack — parking reimbursement',
    '',
    `Venue:        ${txn.venue}`,
    `Location:     ${txn.city || '—'}`,
    `Date:         ${fmtDate(txn.date)}`,
    `Amount:       ${money(txn.amount)}`,
    `Confirmation: ${txn.confirmation || '—'}`,
    txn.receiptUrl ? `Receipt:      ${txn.receiptUrl}` : '',
    '',
    "Upload the receipt to your Gusto reimbursement page — Gusto extracts the rest.",
  ].filter(Boolean).join('\n');
}

/* Download the receipt (or a summary if there's no image) and open Gusto's
 * reimbursement upload page in a new tab. */
function handoffToGusto(txn) {
  const safe = (txn.confirmation || txn.id).replace(/[^A-Za-z0-9_-]/g, '');
  if (txn.receiptImage) downloadFile(`receipt-${safe}.jpg`, dataUrlToBlob(txn.receiptImage));
  else downloadFile(`parkback-${safe}.txt`, buildSummaryText(txn), 'text/plain');
  window.open(GUSTO_UPLOAD_URL, '_blank', 'noopener');
}

function approveDraft(id) {
  const st = state();
  const i = st.drafts.findIndex(d => d.id === id);
  if (i === -1) return;
  const draft = st.drafts[i];

  // Re-check the allowance at approval time — earlier approvals may have hit it.
  // Spec: no partials, so a transaction that crosses the allowance is still sent
  // in full; the allowance pauses everything *after* the line is crossed.
  if (isCapped()) {
    st.drafts.splice(i, 1);
    st.held.push({ txn: draft.txn, heldAt: new Date().toISOString() });
    save();
    notify('cap', `Allowance used up — ${money(draft.txn.amount)} draft held for next month.`);
    render();
    return;
  }

  handoffToGusto(draft.txn);
  st.drafts.splice(i, 1);
  st.submitted.push({ ...draft, status: 'submitted', sentAt: new Date().toISOString() });
  save();

  notify('submit', `Receipt for ${money(draft.txn.amount)} downloaded & Gusto opened — drop it in to finish.`);

  if (isCapped()) {
    notify('cap', `Monthly allowance of ${money(MONTHLY_ALLOWANCE)} used up. Reimbursements paused until next month.`);
  }
  render();
}

function rejectDraft(id) {
  const st = state();
  const i = st.drafts.findIndex(d => d.id === id);
  if (i === -1) return;
  st.drafts.splice(i, 1);
  save();
  toast('Draft rejected.');
  render();
}

/* Held transaction → re-draft now (only valid once the month rolls / room frees). */
function resumeHeld(txnId) {
  const st = state();
  const i = st.held.findIndex(h => h.txn.id === txnId);
  if (i === -1) return;
  if (isCapped()) { toast('No allowance left this month.'); return; }
  const { txn } = st.held.splice(i, 1)[0];
  st.drafts.push({
    id: `d-${txn.id}`, txn,
    attachments: ['SpotHero receipt (PDF)', 'Date · Location · Amount'],
    createdAt: new Date().toISOString(), status: 'draft',
  });
  save();
  notify('draft', `Held transaction re-drafted: ${money(txn.amount)} at ${txn.venue}.`);
  render();
}

/* =========================================================================
 * Rendering
 * ===================================================================== */

function render() {
  renderUser();
  renderConnections();
  renderCap();
  renderLists();
  renderNotifications();
}

function renderUser() {
  const sel = $('#user-select');
  if (!sel.options.length) {
    USERS.forEach(u => {
      const o = document.createElement('option');
      o.value = u.id; o.textContent = u.name;
      sel.appendChild(o);
    });
  }
  sel.value = store.activeUser;
  const active = USERS.find(u => u.id === store.activeUser);
  $('#user-avatar').textContent = active.name[0];
}

function renderConnections() {
  const c = state().connections;
  [['spothero', '#conn-spothero'], ['gusto', '#conn-gusto']].forEach(([svc, sel]) => {
    const btn = $(sel);
    const on = c[svc];
    btn.classList.toggle('connected', on);
    btn.querySelector('.conn-state').textContent = on ? 'Connected' : 'Not connected';
  });
}

function renderCap() {
  const used = submittedThisMonth();
  const pct = Math.min(100, (used / MONTHLY_ALLOWANCE) * 100);
  const fill = $('#cap-fill');
  fill.style.width = `${pct}%`;
  fill.classList.toggle('warn', pct >= 80 && pct < 100);
  fill.classList.toggle('over', pct >= 100);

  $('#cap-used').textContent = money(used);
  $('#cap-limit').textContent = money(MONTHLY_ALLOWANCE);
  $('#cap-split').textContent = `${money(EMPLOYER_CONTRIBUTION)} employer + ${money(EMPLOYEE_CONTRIBUTION)} pre-tax (you)`;
  $('#cap-month').textContent = new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const status = $('#cap-status');
  if (isCapped()) {
    status.textContent = '⛔ Allowance used up — paused until next month. New transactions are held.';
    status.className = 'cap-status capped';
  } else {
    status.textContent = `${money(remainingThisMonth())} of room left this month.`;
    status.className = 'cap-status ok';
  }
}

function renderLists() {
  const st = state();
  $('#count-drafts').textContent = st.drafts.length;
  $('#count-held').textContent = st.held.length;
  $('#count-submitted').textContent = st.submitted.length;

  // Drafts
  $('#panel-drafts').innerHTML = st.drafts.length
    ? st.drafts.map(draftCard).join('')
    : empty('No drafts right now.', 'Run the SpotHero poller to pull new parking charges.');

  // Held
  $('#panel-held').innerHTML = st.held.length
    ? st.held.map(heldCard).join('')
    : empty('Nothing held.', `Transactions land here once your ${money(MONTHLY_ALLOWANCE)} monthly allowance is used up.`);

  // Submitted (newest first)
  const subs = [...st.submitted].reverse();
  $('#panel-submitted').innerHTML = subs.length
    ? subs.map(submittedCard).join('')
    : empty('Nothing sent yet.', 'Approved receipts you hand off to Gusto are tracked here.');
}

function txnMeta(txn) {
  const bits = [`<span>${fmtDate(txn.date)}</span>`];
  if (txn.receiptUrl) {
    bits.push(`<a href="${esc(txn.receiptUrl)}" target="_blank" rel="noopener">Receipt</a>`);
  }
  if (txn.confirmation && txn.confirmation !== 'N/A') {
    bits.push(`<span>${esc(txn.confirmation)}</span>`);
  }
  const thumb = txn.receiptImage
    ? `<a class="receipt-thumb" href="${txn.receiptImage}" target="_blank" rel="noopener" title="View receipt photo"><img src="${txn.receiptImage}" alt="Receipt photo" /></a>`
    : '';
  return `
    <div class="txn">
      <div class="txn-main">
        ${thumb}
        <span class="txn-venue">${esc(txn.venue)}</span>
        <span class="txn-city">${esc(txn.city)}</span>
      </div>
      <div class="txn-sub">${bits.join('<span>·</span>')}</div>
    </div>`;
}

function draftCard(d) {
  return `
  <article class="row">
    <div class="row-amt">${money(d.txn.amount)}</div>
    ${txnMeta(d.txn)}
    <div class="row-tags">
      ${d.attachments.map(a => `<span class="tag">📎 ${esc(a)}</span>`).join('')}
    </div>
    <div class="row-actions">
      <button class="approve" data-approve="${d.id}">Approve &amp; send to Gusto</button>
      <button class="reject" data-reject="${d.id}">Reject</button>
    </div>
  </article>`;
}

function heldCard(h) {
  return `
  <article class="row held">
    <div class="row-amt">${money(h.txn.amount)}</div>
    ${txnMeta(h.txn)}
    <div class="row-actions">
      <span class="held-note">Held — allowance used up</span>
      <button class="ghost-btn small" data-resume="${h.txn.id}">Re-draft</button>
    </div>
  </article>`;
}

function submittedCard(s) {
  return `
  <article class="row done">
    <div class="row-amt">${money(s.txn.amount)}</div>
    ${txnMeta(s.txn)}
    <div class="row-actions">
      <span class="gusto-id">✓ Sent to Gusto</span>
      <span class="muted small">${fmtDate(s.sentAt || s.submittedAt)}</span>
      <button class="ghost-btn small" data-resend="${s.id}">Re-open Gusto</button>
    </div>
  </article>`;
}

function empty(title, sub) {
  return `<div class="empty"><p class="empty-title">${esc(title)}</p><p class="muted">${esc(sub)}</p></div>`;
}

function renderNotifications() {
  const list = state().notifications;
  const unread = list.filter(n => !n.read).length;
  const badge = $('#bell-badge');
  badge.textContent = unread;
  badge.hidden = unread === 0;

  const icons = { draft: '📝', cap: '⛔', submit: '✅' };
  $('#notif-list').innerHTML = list.length
    ? list.slice(0, 30).map(n => `
        <div class="notif ${n.read ? '' : 'unread'}">
          <span class="notif-icon" aria-hidden="true">${icons[n.kind] || '🔔'}</span>
          <div>
            <p>${esc(n.text)}</p>
            <time>${fmtDate(n.at)}</time>
          </div>
        </div>`).join('')
    : `<p class="muted" style="padding:12px">No notifications yet.</p>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* =========================================================================
 * Events
 * ===================================================================== */

// Connections (mock OAuth toggle)
['#conn-spothero', '#conn-gusto'].forEach(sel => {
  $(sel).addEventListener('click', () => {
    const svc = $(sel).dataset.svc;
    const c = state().connections;
    c[svc] = !c[svc];
    save();
    renderConnections();
    toast(c[svc]
      ? `${svc === 'spothero' ? 'SpotHero' : 'Gusto'} connected.`
      : `${svc === 'spothero' ? 'SpotHero' : 'Gusto'} disconnected.`);
  });
});

$('#poll-btn').addEventListener('click', () => ingest(1));
$('#poll-many').addEventListener('click', () => ingest(3 + Math.floor(Math.random() * 2)));

// User switch
$('#user-select').addEventListener('change', e => {
  store.activeUser = e.target.value;
  save();
  render();
});

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('is-active'); tab.setAttribute('aria-selected', 'true');
    ['drafts', 'held', 'submitted'].forEach(name => {
      $(`#panel-${name}`).hidden = name !== tab.dataset.tab;
    });
  });
});

// Row actions (event delegation across panels)
$('.board').addEventListener('click', e => {
  const a = e.target.closest('[data-approve]');
  const r = e.target.closest('[data-reject]');
  const h = e.target.closest('[data-resume]');
  const re = e.target.closest('[data-resend]');
  if (a) approveDraft(a.dataset.approve);
  if (r) rejectDraft(r.dataset.reject);
  if (h) resumeHeld(h.dataset.resume);
  if (re) {
    const s = state().submitted.find(x => x.id === re.dataset.resend);
    if (s) { handoffToGusto(s.txn); toast('Receipt re-downloaded — Gusto opened.'); }
  }
});

// Notifications panel
$('#bell').addEventListener('click', () => {
  const panel = $('#notif-panel');
  const open = panel.hidden;
  panel.hidden = !open;
  $('#bell').setAttribute('aria-expanded', String(open));
  if (open) {
    state().notifications.forEach(n => { n.read = true; });
    save();
    renderNotifications();
  }
});
$('#notif-clear').addEventListener('click', () => {
  state().notifications.forEach(n => { n.read = true; });
  save();
  renderNotifications();
});

/* =========================================================================
 * Receipt import — parse a real SpotHero receipt (pasted text or a file)
 * into a transaction, with an editable review step before it enters the
 * pipeline. This is the real ingest path (no consumer SpotHero API exists).
 * ===================================================================== */

const SAMPLE_RECEIPT = `SpotHero
Your parking receipt

Thanks for parking with SpotHero!

Confirmation #: SH7K2P9Q
Rental ID: 884213107

Facility: Millennium Park Garage
200 N Columbus Dr
Chicago, IL 60601

Check-in:  Jun 12, 2026 8:30 AM
Check-out: Jun 12, 2026 6:00 PM

Parking            $24.00
Service Fee         $2.50
Total Charged      $26.50

View your receipt: https://spothero.com/receipts/884213107
Questions? help@spothero.com`;

/* Best-effort field extraction. Misses are expected and corrected by the
 * user in the review form, so we favor recall over precision. */
function parseReceipt(text) {
  const raw = text.replace(/\r/g, '');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const joined = lines.join('\n');

  // Amount — prefer a labeled total, else the largest dollar figure present.
  let amount = null;
  const totalM = joined.match(/(?:total\s*(?:charged|amount|paid)?|amount\s*(?:charged|paid)|grand\s*total)\s*[:\-]?\s*\$?\s*(\d{1,4}(?:\.\d{2})?)/i);
  if (totalM) amount = parseFloat(totalM[1]);
  if (amount == null) {
    const all = [...joined.matchAll(/\$\s*(\d{1,4}(?:\.\d{2})?)/g)].map(m => parseFloat(m[1]));
    if (all.length) amount = Math.max(...all);
  }
  if (amount != null) amount = round2(amount);

  // Confirmation — confirmation-specific first, then rental/reservation/order.
  const cM = joined.match(/confirmation\s*(?:#|no\.?|number|code|id)?\s*[:#]?\s*([A-Z0-9\-]{4,})/i)
          || joined.match(/(?:rental|reservation|order)\s*(?:#|no\.?|number|id)?\s*[:#]?\s*([A-Z0-9\-]{4,})/i);
  const confirmation = cM ? cM[1].toUpperCase() : '';

  // Receipt URL — first SpotHero link in the body.
  const urlM = joined.match(/https?:\/\/[^\s)]*spothero[^\s)]*/i);
  const receiptUrl = urlM ? urlM[0] : '';

  // City, ST — from an address line that carries a ZIP.
  let city = '';
  const cityM = joined.match(/([A-Za-z .'\-]+),\s*([A-Z]{2})\s*\d{5}/);
  if (cityM) city = `${cityM[1].trim()}, ${cityM[2]}`;

  // Venue — a labeled facility line, else a line with a parking keyword.
  let venue = '';
  const vLabel = lines.find(l => /^(facility|location|lot|garage|parking)\s*[:\-]/i.test(l));
  if (vLabel) {
    venue = vLabel.replace(/^[^:\-]*[:\-]\s*/, '').trim();
  } else {
    const vKey = lines.find(l =>
      /\b(garage|lot|parking|plaza|deck)\b/i.test(l) &&
      !/\$|total|service|fee|receipt|spothero\.com/i.test(l));
    if (vKey) venue = vKey;
  }

  // Date/time — a labeled check-in/start line, else the first parseable date.
  const tryParse = s => { const d = new Date(s); return isNaN(d) ? null : d; };
  let d = null;
  const dateLine = lines.find(l => /(check\s*-?in|start|begins?|^date|arriv)/i.test(l));
  if (dateLine) d = tryParse(dateLine.replace(/^[^:]*:?\s*/, ''));
  if (!d) {
    const m = joined.match(/[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*[AP]M)?/);
    if (m) d = tryParse(m[0]);
  }
  if (!d) {
    const m = joined.match(/\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+\d{1,2}:\d{2}\s*[AP]M)?/);
    if (m) d = tryParse(m[0]);
  }

  return { venue, city, amount, confirmation, receiptUrl, dateIso: d ? d.toISOString() : '' };
}

/* Stable id so re-importing the same receipt is deduped by intake(). */
function txnIdFrom(f) {
  if (f.confirmation) return `SH-${f.confirmation}`;
  let h = 0;
  for (const c of `${f.venue}|${f.dateIso}|${f.amount}`) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `SH-IMP${Math.abs(h)}`;
}

/* ----- File reading (text/eml/html inline; PDF via lazy-loaded pdf.js) ----- */
function cleanupRaw(raw, ext) {
  if (ext === 'html' || /<[a-z][\s\S]*>/i.test(raw)) {
    return raw
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#36;/g, '$')
      .replace(/&[a-z]+;/g, ' ');
  }
  return raw;
}

let pdfjsReady;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsReady) return pdfjsReady;
  pdfjsReady = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      res(window.pdfjsLib);
    };
    s.onerror = () => rej(new Error('Could not load the PDF reader (offline?). Paste the receipt text instead.'));
    document.head.appendChild(s);
  });
  return pdfjsReady;
}

async function extractPdfText(file) {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    out += content.items.map(i => i.str).join(' ') + '\n';
  }
  return out;
}

/* ----- Image OCR (photos / screenshots) via lazy-loaded Tesseract.js ----- */
let tesseractReady;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractReady) return tesseractReady;
  tesseractReady = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = () => res(window.Tesseract);
    s.onerror = () => rej(new Error('Could not load the image reader (offline?). Paste the receipt text instead.'));
    document.head.appendChild(s);
  });
  return tesseractReady;
}

async function ocrImage(file, onProgress) {
  const T = await loadTesseract();
  const { data } = await T.recognize(file, 'eng', {
    logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); },
  });
  return data.text || '';
}

/* Downscale a photo to a bounded JPEG data URL so the receipt can be attached to
 * the draft and handed to Gusto. Kept large enough to stay legible for Gusto's
 * own OCR, but bounded so localStorage doesn't overflow. Returns '' on failure. */
function downscaleImage(file, max = 1600, quality = 0.85) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      try { resolve(c.toDataURL('image/jpeg', quality)); } catch { resolve(''); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
    img.src = url;
  });
}

function isImageFile(file) {
  return /^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(file.name);
}

async function readReceiptFile(file, onProgress) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return extractPdfText(file);
  if (isImageFile(file)) return ocrImage(file, onProgress);
  return cleanupRaw(await file.text(), ext);
}

/* ----- datetime-local <-> ISO ----- */
function toLocalInputValue(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInputValue(v) {
  const d = new Date(v);
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
}

/* ----- Modal controller ----- */
const importModal = $('#import-modal');
const DROP_LABEL = '📄 Drop a receipt — PDF, photo/screenshot, .eml or .txt — or browse';
let pendingReceiptImage = '';   // downscaled data URL of an imported photo, if any

function resetImport() {
  $('#import-step-input').hidden = false;
  $('#import-step-review').hidden = true;
  $('#import-text').value = '';
  $('#import-file').value = '';
  $('#import-error').hidden = true;
  $('#import-error2').hidden = true;
  $('#import-status').hidden = true;
  $('#import-drop-label').textContent = DROP_LABEL;
  pendingReceiptImage = '';
}
function openImport() { resetImport(); importModal.hidden = false; }
function closeImport() { importModal.hidden = true; }

function showParsed(f) {
  $('#f-venue').value = f.venue || '';
  $('#f-city').value = f.city || '';
  $('#f-amount').value = f.amount != null ? f.amount : '';
  $('#f-date').value = toLocalInputValue(f.dateIso);
  $('#f-conf').value = f.confirmation || '';
  $('#f-url').value = f.receiptUrl || '';
  $('#import-step-input').hidden = true;
  $('#import-step-review').hidden = false;
}

async function handleParse() {
  const err = $('#import-error');
  const status = $('#import-status');
  const btn = $('#import-parse');
  err.hidden = true;
  pendingReceiptImage = '';
  try {
    let text = $('#import-text').value.trim();
    const file = $('#import-file').files[0];

    if (!text && file) {
      const img = isImageFile(file);
      if (img) {
        btn.disabled = true;
        status.hidden = false;
        status.textContent = 'Reading image…';
        // Keep a small copy of the photo to attach to the draft.
        downscaleImage(file).then(d => { pendingReceiptImage = d; });
      }
      text = await readReceiptFile(file, p => {
        status.textContent = `Reading image… ${Math.round(p * 100)}%`;
      });
    }

    if (!text || !text.trim()) {
      err.textContent = file && isImageFile(file)
        ? 'Couldn’t read any text from that image. Try a clearer, straight-on photo — or paste the text.'
        : 'Paste the receipt text or choose a file first.';
      err.hidden = false;
      return;
    }
    showParsed(parseReceipt(text));
  } catch (e) {
    err.textContent = e.message || 'Could not read that file.';
    err.hidden = false;
  } finally {
    btn.disabled = false;
    status.hidden = true;
  }
}

$('#import-btn').addEventListener('click', openImport);
$('#import-close').addEventListener('click', closeImport);
importModal.addEventListener('click', e => { if (e.target === importModal) closeImport(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !importModal.hidden) closeImport(); });
$('#import-parse').addEventListener('click', handleParse);
$('#import-back').addEventListener('click', resetImport);
$('#import-sample').addEventListener('click', () => { $('#import-text').value = SAMPLE_RECEIPT; });

const drop = $('#import-drop');
function noteFile(f) { if (f) $('#import-drop-label').textContent = `📄 ${f.name}`; }
$('#import-file').addEventListener('change', () => noteFile($('#import-file').files[0]));
['dragover', 'dragenter'].forEach(ev =>
  drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev =>
  drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', e => {
  const f = e.dataTransfer.files[0];
  if (f) { $('#import-file').files = e.dataTransfer.files; noteFile(f); }
});

$('#import-step-review').addEventListener('submit', e => {
  e.preventDefault();
  const err = $('#import-error2');
  err.hidden = true;
  const venue = $('#f-venue').value.trim();
  const amount = round2(parseFloat($('#f-amount').value));
  const dateVal = $('#f-date').value;
  if (!venue)        { err.textContent = 'Add a facility / venue name.'; err.hidden = false; return; }
  if (!(amount > 0)) { err.textContent = 'Enter a valid amount.';        err.hidden = false; return; }
  if (!dateVal)      { err.textContent = 'Enter the parking date.';      err.hidden = false; return; }

  const fields = {
    venue, amount,
    city: $('#f-city').value.trim(),
    dateIso: fromLocalInputValue(dateVal),
    confirmation: $('#f-conf').value.trim().toUpperCase(),
    receiptUrl: $('#f-url').value.trim(),
  };
  const txn = {
    id: txnIdFrom(fields), source: 'import',
    date: fields.dateIso, venue: fields.venue, city: fields.city,
    amount: fields.amount, confirmation: fields.confirmation, receiptUrl: fields.receiptUrl,
    receiptImage: pendingReceiptImage || '',
  };
  if (importReceipt(txn)) closeImport();
});

// First paint
render();
