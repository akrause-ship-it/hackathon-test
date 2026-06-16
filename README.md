# 🅿️ ParkBack — SpotHero → Gusto Reimbursements

Turn SpotHero parking charges into Gusto reimbursement drafts automatically.
You review and approve each draft before anything is submitted, and a hard
**$100 / calendar-month cap** pauses everything once you hit the limit.

This is a **prototype**: the SpotHero poller and the Gusto submission API are
**simulated** in the browser (see `mockSpotHero` / `mockGusto` in `script.js`).
Everything else — the ingest → draft → notify → approve → submit workflow, the
monthly cap with pause/resume, notifications, and per-user separation — is the
real logic, and the mock layer is isolated so it can be swapped for the live
APIs later. It's a zero-dependency static site (HTML/CSS/vanilla JS).

## ✨ What it does

- **Ingest** — a simulated background poller pulls new SpotHero parking
  transactions (date, venue, city, amount, confirmation, receipt link).
- **Draft** — each new transaction becomes a Gusto reimbursement draft with the
  receipt + structured fields attached. Idempotent: a transaction is never
  drafted twice.
- **Notify** — bell feed + toast when a draft is ready or the cap is reached
  (stand-ins for push/text).
- **Approve** — review each draft and **Approve & submit** or **Reject**.
- **Submit** — approval pushes the reimbursement to Gusto (mocked) and records
  the returned Gusto id. Nothing is ever auto-submitted.
- **$100 monthly cap** — counts submitted reimbursements per calendar month.
  Crossing $100 submits the crossing transaction in full (no partials), then
  **pauses**: new transactions are **held** (not dropped) and resume next month.
- **Multi-user** — switch between users in the header; each keeps its own
  connections, drafts, cap, and history (persisted in `localStorage`).

## 🧪 Try the demo flow

1. Connect **SpotHero** and **Gusto** (mock OAuth toggles).
2. Click **Check for new transactions** (or **Drop a busy week**) to pull charges.
3. On the **Drafts** tab, **Approve & submit** a few — watch the cap meter fill.
4. Keep going past $100 to see the cap pause and transactions land in **Held**.

## 🧑‍💻 Run locally

Any static server works:

```bash
npx serve .
# or
python -m http.server 8000
```

## 🚀 Deploy to Vercel

Push to GitHub and import on [vercel.com/new](https://vercel.com/new) — no build
step, no env vars. Vercel serves `index.html` as a static site.

## 📁 Structure

```
index.html    markup (connections, cap meter, tabs, notifications)
styles.css    dark UI, cap meter, responsive layout
script.js     mock SpotHero/Gusto + workflow, cap logic, persistence
vercel.json   static hosting config (clean URLs + security headers)
```

## 🔌 Decisions made for the prototype

Resolved from the spec's open questions (all easy to revisit):

- **Attachments** — receipt link **plus** structured fields (date/location/amount).
- **Cap counting** — counts **submitted** reimbursements (not drafts).
- **Paused transactions** — **held** for next month, never dropped.
- **No partials** — a transaction crossing $100 is submitted in full, then pause.

## 🔭 Wiring up the real APIs

Replace `mockSpotHero.fetchNewTransactions` and `mockGusto.submitReimbursement`
with real calls, and the mock OAuth toggles with real per-user OAuth (tokens
encrypted at rest). The workflow, cap, and UI stay as-is.
