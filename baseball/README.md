# ⚾ Stat Workshop — MLB Explainer

An interactive, educational baseball workshop. Pick a **stat group**
(Offense / Pitching / Fielding), pick one of its **top 5 stats**, then pick one
of the **top 10 current-season MLB leaders** — and the app explains what the
stat means, **animates the play it measures in a side-view 8-bit ballpark**, and
tells you **where the player ranks and why they're elite**.

The ballpark is the centerpiece: a retro pixel-art scene (recreated in the
spirit of Fraser Davidson's "8-bit Baseball", as original art) with a pixel
batter, pitcher, catcher, outfield fence, crowd and scoreboard. Each stat's play
is reinterpreted side-on — a HR arcs over the fence, a strikeout is a
swing-and-miss, a stolen base is a baserunner dash, fielding plays show a
fielder, and so on. The active player rides as a broadcast lower-third.

Live data comes from the **free official MLB Stats API** (`statsapi.mlb.com`),
no key required. The visual signature is a clean broadcast/stat-graphics shell
wrapped around the retro 8-bit core.

## Live data

- Leaders: `GET /api/v1/stats/leaders?leaderCategories={key}&season={year}&sportId=1&limit=10&statGroup={group}`
- Team abbreviations: `/api/v1/teams?sportId=1` (the leaders feed returns only
  team id + name, so we map id → abbreviation once and cache it).
- **Season** is resolved automatically: it tries the current calendar year and
  falls back to last season if there are no leaders yet (early/offseason),
  showing a "No {year} leaders yet. Showing {prev}." notice.
- Responses are cached per (group, stat, season) for the session.
- The list is capped to 10: the API returns *all* players tied at the cutoff
  (e.g. dozens at a 1.000 fielding %), so we trim to a true top 10.

## Files (separation of concerns, per spec)

```
index.html   markup — scoreboard header, tabs, ballpark canvas, explainer, picker
styles.css   broadcast shell + 8-bit core, lower-third, responsive, focus styles
config.js    STAT_CONFIG — the single declarative source of truth (3 groups × 5 stats)
data.js      live API fetch, season fallback, team map, session cache, error handling
scene.js     <canvas> side-view 8-bit ballpark + per-stat plays (respects prefers-reduced-motion)
app.js       state + wiring (group → stat → player), loading / empty / error states
```

`STAT_CONFIG` is the source of truth — add or swap a stat there (key = the API's
`leaderCategories` value) and the UI follows, no other code changes.

## Notes & decisions

- **Stat keys** were verified live: WHIP is `walksAndHitsPerInningPitched`.
- **Fielding %** was dropped from the fielding group in favor of
  `rangeFactorPerGame` (Range Factor/Game) — fielding-% leaders all sit at a
  flat 1.000, which has no spread to teach or chart; range factor (plays made
  per game) actually differentiates fielders.
- **Inverted stats** (lower is better): ERA and WHIP come back best-first from
  the API, so their framing reads naturally. **Errors** is the exception — it's
  a counting stat the API ranks *most-first*, so the "leader" has the **most**
  errors; its framing is written honestly ("a list you'd rather not top")
  rather than calling it elite.
- **Accessibility:** keyboard-focusable tabs/chips/rows, `prefers-reduced-motion`
  shows the static final diagram, never a blank field on error (with Retry).

## Run locally

From the repo root (the included `serve.ps1` resolves `/baseball/` to this
folder's `index.html`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 -Port 5050
# then open http://localhost:5050/baseball/
```

Or any static server: `npx serve .` then open `/baseball/`.

## Build phases (from the spec)

- **Phase 1 (MVP) ✅** — STAT_CONFIG, live fetch for all 3 groups,
  group/stat/player selection, field diagram, idle + signature sprite, full
  explainer with rank framing, empty/error states.
- **Phase 2 ✅** — animated field plays synced per stat, "Run the play" replay.
- **Phase 3 (todo)** — AL/NL split toggle, season toggle, shareable deep links.
