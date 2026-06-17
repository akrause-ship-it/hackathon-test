# 🅿️ ParkBack — SpotHero → Gusto Reimbursements

Turn SpotHero parking charges into Gusto reimbursement drafts automatically.
You review and approve each draft before anything is submitted, and a
**$200 / calendar-month parking allowance** ($100 employer + $100 employee
pre-tax) pauses everything once you hit the limit.

**What ParkBack does that Gusto doesn't:** it watches SpotHero, tracks your
**$200 / calendar-month parking allowance**, batches receipts, and tracks what
you've sent. Gusto's reimbursement page already OCRs an uploaded receipt — so
ParkBack's job is everything *around* that: never forget a charge, stay within
the allowance, and make the final upload one click.

This is a **prototype**. You **import real SpotHero receipts** — paste the
confirmation email, drop the receipt PDF/`.eml`/`.txt`, or **snap a photo /
screenshot** — and ParkBack parses out the venue, date, amount, and confirmation.
Approving a draft is an **honest handoff to Gusto** (there's no public Gusto
reimbursement-submit API): it downloads the receipt and opens Gusto's upload page,
where Gusto extracts the rest. (A `mockSpotHero` poller can also generate demo
data.) The ingest → draft → notify → approve → allowance workflow, pause/resume, and
per-user separation are all real logic. Core is a zero-dependency static site
(HTML/CSS/vanilla JS); `pdf.js` (PDFs) and `tesseract.js` (image OCR) lazy-load
from a CDN only when you import that file type.

## ✨ What it does

- **Ingest (real)** — import a SpotHero receipt: paste the email, drop a
  PDF/`.eml`/`.txt`, or upload a **photo/screenshot** (OCR'd in-browser via
  Tesseract.js). A best-effort parser extracts date, venue, city, amount,
  confirmation, and receipt URL into an **editable review form** before anything
  is created; an imported photo is downscaled and attached to the draft. A
  `mockSpotHero` poller can also generate demo transactions.
- **Draft** — each new transaction becomes a Gusto reimbursement draft with the
  receipt + structured fields attached. Idempotent: a transaction is never
  drafted twice.
- **Notify** — bell feed + toast when a draft is ready or the allowance is used up
  (stand-ins for push/text).
- **Approve** — review each draft and **Approve & send to Gusto** or **Reject**.
  Nothing is ever auto-sent.
- **Send (handoff)** — approval downloads the receipt (the photo, or a summary
  for text/PDF imports) and opens Gusto's reimbursement upload page in a new tab.
  The item moves to **Submitted** with a **Re-open Gusto** action to redo the
  handoff anytime.
- **$200 monthly allowance** — counts what you've sent to Gusto per calendar month
  ($100 employer + $100 employee pre-tax). Crossing $200 sends the crossing
  transaction in full (no partials), then **pauses**: new transactions are **held**
  (not dropped) and resume next month.
- **Multi-user** — switch between users in the header; each keeps its own
  connections, drafts, allowance, and history (persisted in `localStorage`).

## 🧪 Try the demo flow

1. Connect **SpotHero** and **Gusto** (mock OAuth toggles).
2. **Import a receipt** — paste the email, drop a PDF, or upload a photo
   (or use **Load a sample receipt**). Review the parsed fields, **Add to drafts**.
3. On the **Drafts** tab, **Approve & send to Gusto** — the receipt downloads,
   Gusto's upload page opens, and the allowance meter fills.
4. Keep going past $200 to see the allowance pause and transactions land in **Held**.

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

This app lives in `parkback/`; the repo root redirects to it and holds the
shared `vercel.json`.

```
index.html    markup (connections, allowance meter, tabs, notifications, import modal)
styles.css    dark UI, allowance meter, import modal, responsive layout
script.js     receipt parse/OCR + Gusto handoff + workflow, allowance logic, persistence
```

## 🔌 Decisions made for the prototype

Resolved from the spec's open questions (all easy to revisit):

- **Attachments** — receipt link/photo **plus** structured fields (date/location/amount).
- **Allowance** — **$200/month** ($100 employer + $100 employee pre-tax), counts
  what you've **sent to Gusto** (not drafts).
- **Paused transactions** — **held** for next month, never dropped.
- **No partials** — a transaction crossing $200 is sent in full, then pause.
- **Gusto submit** — handoff (download receipt + open Gusto's upload page), since
  there's no public Gusto reimbursement-submit API. `GUSTO_UPLOAD_URL` in
  `script.js` points at the upload page.

## 🔭 On the SpotHero "API"

Worth knowing: **there is no consumer SpotHero API for pulling your own past
charges/receipts.** SpotHero's Developer Platform is a *booking* API (search
spots, reserve), gated behind an application process — and SpotHero was acquired
by Uber in 2026. The way SpotHero actually feeds expense tools (Concur, Certify,
Expensify, Emburse) is by **emailing the receipt** per purchase. So the realistic
ingest path is exactly what's built here: parse the receipt the user already has.
A future server-side version could auto-ingest by receiving forwarded receipt
emails, or detect charges via a bank/card aggregator (Plaid).

## 🔭 Wiring up the real thing

- **SpotHero ingest** — already real (receipt import). To automate, add a
  serverless endpoint that receives forwarded SpotHero receipt emails and runs
  the same `parseReceipt` logic server-side.
- **Gusto submit** — already real-ish: a **handoff** to Gusto's reimbursement
  upload page (`handoffToGusto`), which is the actual flow since Gusto exposes no
  public reimbursement-submit API and OCRs the uploaded receipt itself. Point
  `GUSTO_UPLOAD_URL` at your org's upload screen. A fuller integration would add a
  Gusto OAuth/API submit if/when one becomes available, or a browser extension
  that pre-fills the upload form.
- **Phone capture** — Gusto's page offers a QR-to-phone upload; the same pattern
  could feed ParkBack's importer via a small backend relay (QR → mobile upload
  page → desktop session).
