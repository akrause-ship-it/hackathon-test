# Baseball Stat Workshop & Explainer — Build Spec

> A spec written for **Claude Code** to build from. It describes the product, the data source, the screen layout, and the behavior in enough detail to implement without further clarification. A clickable prototype (`baseball-stat-workshop-prototype.html`) accompanies this spec and demonstrates the intended layout, animation, and interaction with mock data.

## 1. What it is
An interactive, educational baseball workshop. The user picks a **stat category group** (Offense / Pitching / Fielding), picks one of the **top 5 stats** in that group, then picks one of the **top 10 current-season MLB players** for that stat. The app then:

- Explains in plain English **what the stat means**.
- Plays an **X's & O's diagram on a baseball field** that animates the play the stat measures, synced to the explanation.
- Shows an **8-bit player sprite** on the left third doing an idle loop plus a **signature action** (swing / pitch / catch) matched to the category.
- Shows **where the player ranks** in the top 10 and **why they're elite** (their value vs. the field).

Audience: casual-to-intermediate fans who know the game but want stats demystified. The page's single job: *make one stat click, for one real player, right now.*

## 2. Data source (live, real, current season)
Use the **free official MLB Stats API** at `https://statsapi.mlb.com` — no API key required.

- **League leaders endpoint:**
  `GET https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories={cat}&season={year}&sportId=1&limit=10&statGroup={group}`
  - `statGroup` is one of `hitting`, `pitching`, `fielding`.
  - `leaderCategories` is the per-stat key (e.g. `homeRuns`, `era`, `fielding`).
  - `sportId=1` = MLB. Returns AL+NL combined; split by league if needed via the `leagueId` param (`103` = AL, `104` = NL).
- **Stat metadata / valid keys:** `GET https://statsapi.mlb.com/api/v1/leagueLeaderTypes` and `.../api/v1/meta?type=statGroups` to confirm category keys at build time.
- **Player headshot (optional):** `https://midfield.mlbstatic.com/v1/people/{personId}/spots/120` — used only as a reference thumbnail; the main visual is the 8-bit sprite, not the photo.

Implementation notes:
- Determine current season dynamically (current calendar year; if preseason, fall back to last completed season).
- Cache leader responses client-side per (group, stat, season) for the session to avoid refetching on re-selection.
- Handle empty/early-season results gracefully (see section 9, Empty & error states).
- Respect the MLB data copyright notice; this is an educational, non-commercial project.

## 3. Stat category groups (3 groups x 5 stats)
Each group exposes exactly 5 stats. Each stat needs: a display name, the API `leaderCategories` key, a one-line plain-English definition, a "why it's elite" framing, and which **field animation** + **sprite action** it triggers.

### Offense (statGroup = `hitting`) — mix of classic + advanced
1. **Batting Average (AVG)** — `battingAverage` — classic
2. **Home Runs (HR)** — `homeRuns` — classic
3. **On-Base Percentage (OBP)** — `onBasePercentage` — classic/advanced bridge
4. **OPS** — `onBasePlusSlugging` — advanced
5. **Stolen Bases (SB)** — `stolenBases` — classic (great for animation)

### Pitching (statGroup = `pitching`)
1. **ERA** — `earnedRunAverage`
2. **Strikeouts (K)** — `strikeouts`
3. **WHIP** — `walksAndHitsPerInningPitched`
4. **Wins (W)** — `wins`
5. **Saves (SV)** — `saves`

### Fielding (statGroup = `fielding`)
1. **Fielding % (FPCT)** — `fielding`
2. **Putouts (PO)** — `putOuts`
3. **Assists (A)** — `assists`
4. **Double Plays (DP)** — `doublePlays`
5. **Errors (E)** — `errors` *(lower is better — invert the "elite" framing)*

> Confirm each `leaderCategories` key against `/leagueLeaderTypes` during build; some keys differ slightly from the display abbreviation. Keep a single config map (`STAT_CONFIG`) as the source of truth so stats can be added/swapped without touching UI code.

## 4. Layout
Three-zone layout. On wide screens it is a left **1/3 sprite column** and a right **2/3 workshop area**; the field diagram sits within the workshop area.

```
+----------------+--------------------------------------+
|                |   [ Offense | Pitching | Fielding ]  |  <- group tabs
|   8-BIT        |   [ stat chips: 5 in active group ]  |
|   PLAYER       |--------------------------------------|
|   SPRITE       |   BASEBALL FIELD  (X's & O's,        |
|   (idle +      |   animated, synced to stat demo)     |
|   signature    |                                      |
|   action)      |--------------------------------------|
|                |   EXPLAINER: what it means /         |
|   player name  |   the play / rank #N & why elite     |
|   team - stat  |   [ player picker: top 10 list ]     |
+----------------+--------------------------------------+
```

On narrow screens, stack: group tabs -> stat chips -> field -> sprite -> explainer -> player picker.

## 5. The 8-bit sprite (left 1/3)
- Pixel-art player, rendered with `image-rendering: pixelated` (sprite sheet or CSS/SVG pixel grid; prototype uses CSS pixel art).
- **Always-on idle loop** (subtle bob/breathing).
- **Signature action keyed to the active group:**
  - Offense -> batting swing
  - Pitching -> wind-up + throw
  - Fielding -> glove catch / dive
- The signature action **fires on player select and on "Run the play."**
- Below the sprite: selected player name, team abbreviation, and their value in the active stat.

## 6. The field diagram (X's & O's, animated)
- Top-down (or 3/4) baseball diamond with bases, mound, foul lines.
- **X's, O's, and arrows** drawn over the field; movement is **synced to the stat demo**, e.g.:
  - HR: ball arcs over the fence, runner O circles all four bases.
  - SB: runner O dashes 1B->2B ahead of a throw arrow.
  - ERA / K: pitch path mound->plate, batter X swings and misses.
  - DP: ball O goes fielder->2B->1B with two outs marked.
- A **"Run the play"** button replays the animation. Animation duration ~2-4s, then settles to the static diagram.
- Respect `prefers-reduced-motion`: show the final static diagram with no motion.

## 7. Explainer content (the teaching)
For the selected stat + player, render three short blocks:
1. **What it means** — one or two plain sentences. Pulled from `STAT_CONFIG` definitions.
2. **The play** — a caption describing what the field animation is showing.
3. **Rank & why elite** — "#{rank} in MLB this season at {value}. {framing}." The framing compares the player's value to the #10 value or league context (e.g. "his {stat} is {x} higher than the 10th-ranked hitter"). For inverted stats (ERA, WHIP, Errors), elite = lowest.

## 8. Selection flow & state
- **Group tabs** (Offense / Pitching / Fielding) — switching loads that group's 5 stat chips and swaps the sprite's signature action.
- **Stat chips** — selecting one fetches the live top-10 leaders and auto-selects the #1 player.
- **Player picker** — top-10 list (rank, name, team, value); selecting re-renders explainer, sprite value, and the field demo for that player.
- Default on load: Offense -> Home Runs -> #1 leader.

## 9. Empty & error states
- **Early/offseason, no leaders yet:** message — "No {season} leaders yet. Showing {lastSeason}." and refetch with the prior season.
- **API/network failure:** message — "Couldn't reach the MLB stat feed. Check your connection and retry." with a Retry button. Never show a blank field.
- **Fewer than 10 qualified players:** render the list that exists; rank framing adapts to the count.

## 10. Tech notes for the build
- Single-page app. Vanilla JS + Canvas/SVG is sufficient; the prototype is dependency-free. A small framework is acceptable if it stays lightweight.
- Keep `STAT_CONFIG` (groups, stats, definitions, animation + action keys, inverted flag) as one declarative object — the entire UI is driven from it.
- Separate concerns: `data.js` (API fetch + cache), `field.js` (diagram animation), `sprite.js` (8-bit render + actions), `app.js` (state + wiring).
- Visual vibe: **clean modern broadcast/stat-graphics shell** (the chrome, type, scoreboard feel) wrapped around a **retro 8-bit field + sprite** core. The contrast is intentional and is the product's signature.
- Quality floor: responsive to mobile, keyboard-focusable controls, reduced-motion respected.

## 11. Build phases
- **Phase 1 (MVP):** STAT_CONFIG, live fetch for all three groups, group/stat/player selection, static field diagram, idle+signature sprite, full explainer with rank framing.
- **Phase 2:** animated field plays synced per stat, "Run the play" replay, polished sprite actions.
- **Phase 3:** AL/NL split toggle, season toggle (incl. recent past seasons), shareable deep links to a specific player+stat.

## 12. Deliverables
- This spec.
- A clickable prototype (`baseball-stat-workshop-prototype.html`) showing the full layout, group/stat/player selection, animated 8-bit sprite with signature actions, an animated X's & O's field demo, and the explainer — running on mock data shaped like the real API so the live swap is a drop-in.
