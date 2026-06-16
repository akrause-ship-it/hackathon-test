/* ParkBack — SpotHero → Gusto reimbursement automation (prototype)
 *
 * The SpotHero poller and the Gusto submission API are MOCKED (see the
 * `mockSpotHero` and `mockGusto` objects). Everything else is the real
 * workflow: ingest → draft → notify → approve → submit, plus a hard
 * $100/calendar-month cap with pause/resume. State persists per user in
 * localStorage, so each user operates independently (spec: multi-user).
 */

'use strict';

const MONTHLY_CAP = 100;            // dollars, per user, per calendar month
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

const mockGusto = {
  /* Pretend to POST a reimbursement to Gusto. Returns an external id. */
  submitReimbursement(draft) {
    return { gustoId: `GU-${draft.txn.id.replace('SH-', '')}`, status: 'submitted' };
  },
};

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
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
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

function remainingThisMonth() { return round2(MONTHLY_CAP - submittedThisMonth()); }
function isCapped() { return submittedThisMonth() >= MONTHLY_CAP; }

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

/* Ingest new SpotHero transactions → create Gusto drafts (or hold if capped). */
function ingest(n) {
  const st = state();
  if (!st.connections.spothero) { toast('Connect SpotHero first.'); return; }
  if (!st.connections.gusto)   { toast('Connect Gusto first.');   return; }

  const txns = mockSpotHero.fetchNewTransactions(n);
  let drafted = 0, held = 0;

  txns.forEach(txn => {
    if (st.seenTxnIds.includes(txn.id)) return;   // idempotency
    st.seenTxnIds.push(txn.id);

    if (isCapped()) {
      // Cap reached: hold the transaction for next month (spec: held, not dropped).
      st.held.push({ txn, heldAt: new Date().toISOString() });
      held++;
      return;
    }

    st.drafts.push({
      id: `d-${txn.id}`,
      txn,
      attachments: ['SpotHero receipt (PDF)', 'Date · Location · Amount'],
      createdAt: new Date().toISOString(),
      status: 'draft',
    });
    drafted++;
  });

  save();

  if (drafted) notify('draft', `${drafted} reimbursement draft${drafted > 1 ? 's' : ''} ready to review.`);
  if (held)    notify('cap', `Cap reached — ${held} transaction${held > 1 ? 's' : ''} held for next month.`);
  if (!drafted && !held) toast('No new transactions found.');

  render();
}

function approveDraft(id) {
  const st = state();
  const i = st.drafts.findIndex(d => d.id === id);
  if (i === -1) return;
  const draft = st.drafts[i];

  // Re-check the cap at approval time — earlier approvals may have hit it.
  // Spec: no partials, so a transaction that crosses $100 is still submitted
  // in full; the cap pauses everything *after* the line is crossed.
  if (isCapped()) {
    st.drafts.splice(i, 1);
    st.held.push({ txn: draft.txn, heldAt: new Date().toISOString() });
    save();
    notify('cap', `Cap reached — ${money(draft.txn.amount)} draft held for next month.`);
    render();
    return;
  }

  const res = mockGusto.submitReimbursement(draft);
  st.drafts.splice(i, 1);
  st.submitted.push({
    ...draft,
    status: 'submitted',
    gustoId: res.gustoId,
    submittedAt: new Date().toISOString(),
  });
  save();

  notify('submit', `Submitted ${money(draft.txn.amount)} to Gusto (${res.gustoId}).`);

  if (isCapped()) {
    notify('cap', `Monthly cap of $100 reached. Reimbursements paused until next month.`);
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
  if (isCapped()) { toast('Still capped this month.'); return; }
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
  const pct = Math.min(100, (used / MONTHLY_CAP) * 100);
  const fill = $('#cap-fill');
  fill.style.width = `${pct}%`;
  fill.classList.toggle('warn', used >= 80 && used < 100);
  fill.classList.toggle('over', used >= 100);

  $('#cap-used').textContent = money(used);
  $('#cap-month').textContent = new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const status = $('#cap-status');
  if (isCapped()) {
    status.textContent = '⛔ Cap reached — paused until next month. New transactions are held.';
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
    : empty('Nothing held.', 'Transactions land here when the $100 cap is hit.');

  // Submitted (newest first)
  const subs = [...st.submitted].reverse();
  $('#panel-submitted').innerHTML = subs.length
    ? subs.map(submittedCard).join('')
    : empty('Nothing submitted yet.', 'Approved drafts get pushed to Gusto and listed here.');
}

function txnMeta(txn) {
  return `
    <div class="txn">
      <div class="txn-main">
        <span class="txn-venue">${esc(txn.venue)}</span>
        <span class="txn-city">${esc(txn.city)}</span>
      </div>
      <div class="txn-sub">
        <span>${fmtDate(txn.date)}</span>
        <span>·</span>
        <a href="${esc(txn.receiptUrl)}" target="_blank" rel="noopener">Receipt</a>
        <span>·</span>
        <span>${esc(txn.confirmation)}</span>
      </div>
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
      <button class="approve" data-approve="${d.id}">Approve &amp; submit</button>
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
      <span class="held-note">Held — cap reached</span>
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
      <span class="gusto-id">✓ Gusto ${esc(s.gustoId)}</span>
      <span class="muted small">${fmtDate(s.submittedAt)}</span>
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
  if (a) approveDraft(a.dataset.approve);
  if (r) rejectDraft(r.dataset.reject);
  if (h) resumeHeld(h.dataset.resume);
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

// First paint
render();
