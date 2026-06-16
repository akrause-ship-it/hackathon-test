# 🎰 キモかわ Creature Slots — Kimo-Kawaii Creature Generator

A **3-reel slot machine** that mashes the **top (head)**, **middle (body)**, and
**bottom (tail/undercarriage)** of cute-creepy animals into one regrettable
little guy, gives it a **K-name**, and stashes it in your collection.

Zero-dependency static site — HTML/CSS/vanilla JS, no build step, no API keys.

## 🎰 How it works

Instead of rendering a single creature with an image model, every animal is drawn
as a **parametric SVG split into three horizontal slices** (head / body / bottom).
The stage is a slot machine: three reels stacked vertically, each spinning
independently and landing on a chosen slice. **The three landed slices stacked
together _are_ the creature** — a patchwork gremlin like cat ears + pufferfish
spiky torso + octopus tentacles. No AI render required.

Each slice is generated from compact per-animal data (color, accent, ear type,
body texture, bottom type), so all 18 animals exist as interchangeable top/middle/
bottom parts.

## ✨ Features

- **Part selection** — three reels (TOP / MID / BTM) over a pool of 18
  kimo-kawaii animals. Two input modes per the spec:
  - **Pick** — the dropdowns spin the matching reel to your chosen animal.
  - **Randomize** — pull the lever / knob / **Shuffle all** spins all three; the
    🎲 buttons re-spin a single reel. Reels stagger their durations for the
    cascading slot feel, and the UI locks mid-spin so reels can't desync.
- **K-name suggestion** — auto-suggests a portmanteau-flavored name starting with
  **K**, spliced from the chosen animals; editable (the field forces a leading K).
- **Local-first collection** — saved creatures persist in `localStorage` (no
  login). Each card shows a **composite SVG thumbnail** of the actual creature,
  plus name, parts, date, and public flag; delete with ✕.
- **Download PNG** — real export: rasterizes the composite SVG to a 400×600
  canvas and downloads it, named after the creature.
- **Private link** — encodes the combo in the URL (`#c=2-16-17&k=Name`) and
  rebuilds that exact creature on load.
- **Public gallery** — opt-in post is wired as a stub (saves with `isPublic:true`).

## 🧬 Data model

Each saved creature matches the spec sketch, so it can later be tied to a user:

```js
{ id, name,
  head, body, tail,                 // reel indices → rebuild the composite SVG
  headAnimal, bodyAnimal, tailAnimal, parts,
  createdAt, isPublic, userId:null }
```

## 🔌 Wiring up real generation (optional, later)

The slot approach already produces a final creature with no image API. If richer
art is wanted later, the spec's stack still drops in: swap each SVG slice for a
hosted text-to-image call using a locked kimo-kawaii style block + the
`{head}/{body}/{tail}` template, cache by the `(head, body, tail)` key, and store
the URL. `suggestName()` can likewise be swapped for an Anthropic API text call,
and the gallery backed with a real feed.

## ▶️ Run locally

It's a static file — open `index.html`, or serve the folder:

```bash
npx serve kimo
```
