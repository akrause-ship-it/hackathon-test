# SpotHero → Gusto Reimbursement Automation — Spec

## Overview
A web app that watches a user's SpotHero account for new parking transactions and automatically prepares reimbursement drafts for submission to Gusto. The user reviews and approves each draft before it is submitted. Designed for a small group (the user plus a few coworkers).

## Goal
Eliminate manual expense entry for work parking by pulling transactions from SpotHero, building reimbursement drafts, and pushing them to Gusto after one-tap user approval — while enforcing a monthly spending cap.

## Users
- Primary user plus a few coworkers.
- Each user connects their own SpotHero and Gusto accounts.
- No admin/team-management tier required at launch; each user operates independently.

## Core Workflow
1. **Ingest** — System polls the official SpotHero API for new parking transactions per connected user.
2. **Trigger** — Each new parking transaction triggers a reimbursement run for that user.
3. **Eligibility** — All parking transactions are reimbursable, subject to the monthly cap (below).
4. **Draft** — System creates a reimbursement draft in/for Gusto with transaction details and attachment(s).
5. **Notify** — User receives a push/text notification that a draft is ready.
6. **Approve** — User reviews and approves (or rejects) the draft.
7. **Submit** — On approval, system submits the reimbursement to Gusto.

## Data Source
- **Source:** Official SpotHero API.
- **Pulled per transaction (assumed; confirm against API):** date/time, location/venue, amount, confirmation/receipt ID, receipt document or URL.
- Each user authenticates their own SpotHero account (OAuth or API credentials per SpotHero's supported method).

## Submission Target
- **Destination:** Gusto (reimbursements).
- **Mode:** Draft + approve. System never auto-submits; submission happens only after explicit user approval.
- Each user authenticates their own Gusto account.

## Monthly Cap Logic
- **Limit:** $100 of reimbursable parking per calendar month, per user.
- **On exceeding $100 in a month:**
  - Send the user a notice that the cap has been reached.
  - **Pause all reimbursement actions** for that user for the remainder of the month (no new drafts, no submissions).
  - Resume automatically on the **first qualifying action of the next month** (new transaction after the month rolls over).
- Transactions that arrive while paused are held/skipped per pause rule — see Open Questions on whether paused transactions are queued or dropped.

## Notifications
- **Channel:** Push / text.
- **Triggers:**
  - Draft ready for approval.
  - Monthly cap reached / actions paused.

## Attachments (Undecided)
- User has not yet decided what attaches to each reimbursement (PDF receipt vs. itemized data fields vs. both).
- **Default assumption pending decision:** attach the SpotHero receipt (PDF or link) plus structured fields (date, location, amount), since Gusto reimbursements typically benefit from a receipt. Confirm before build.

## Out of Scope (v1)
- Fully automated (no-approval) submission.
- Team/admin dashboards, shared approval chains, manager review.
- Non-parking expense types.
- Overage handling beyond pause/resume (no partials, no rollover).

## Open Questions
1. **Attachment format** — PDF receipt, data fields only, or both? (blocks Gusto draft format)
2. **Gusto API** — Confirm Gusto supports programmatic reimbursement draft creation/submission via API; if not, define fallback (e.g., generate a file the user uploads to Gusto).
3. **SpotHero API access** — Confirm the official API exposes per-transaction receipts and is available for individual user accounts.
4. **Paused transactions** — When actions are paused after hitting $100, are mid-month transactions queued for next month or simply ignored?
5. **Cap counting** — Does the $100 count against draft creation, approval, or successful Gusto submission?
6. **Multi-user auth** — How are per-user SpotHero/Gusto credentials stored and secured?
7. **Duplicate/edge handling** — Refunds, cancellations, or amended SpotHero transactions.

## Suggested Tech Notes (non-binding)
- Per-user OAuth token storage with encryption at rest.
- Background poller or webhook listener for SpotHero transactions.
- Idempotency keys per transaction to avoid duplicate drafts.
- Monthly cap tracked per user per calendar month, reset on month boundary.
