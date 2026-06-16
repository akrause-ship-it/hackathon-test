# Outfit Builder — Build Spec

A spec for Claude Code to build an interactive outfit-styling tool that assembles a look from three elements — **top, bottom, shoes** — and shows it both on an editorial model and as a flat-lay.

## Goal

Let a user build an outfit from three slots — **1) top, 2) bottom, 3) shoes** — by pulling items from a clothing catalog or capturing them from anywhere on the web, then preview the assembled look **side-by-side: editorial model + flat-lay**. The tool should feel like styling a magazine spread.

## The Three Slots

Every outfit is exactly three elements:

1. **Top**
2. **Bottom**
3. **Shoes**

Each slot is independently fillable, swappable, and clearable. The UI should make the three-slot structure obvious.

## Item Sources (both)

Each slot can be filled from either source:

- **Catalog** — browse/pick from the connected shop site. **Start with yoox.com** as the first integrated source. Build a source adapter so additional sites can be added later. Pull product image, name, price, and product URL (for the shopping link).
- **Screen capture** — grab an item from any site. Support **all three capture methods**:
  - **Crop region of a screenshot** — user selects a rectangle.
  - **Auto-detect / cut out the garment** — background removal / subject isolation on the captured image.
  - **Paste an image URL** — fetch and use directly.

Captured/catalog items should be normalized into a common item object (image, optional cutout/transparent version, source URL, slot type).

## Display — Side-by-Side

Always show **two views together**:

- **Editorial model** — the outfit shown as worn.
- **Flat-lay / combined layout** — top + bottom + shoes arranged in a styled composition.

### Editorial model — approach is a build experiment

The user wants Claude Code to **try multiple approaches and compare** which produces the best result. Implement as switchable strategies behind a common interface so they can be evaluated:

- **AI-generated try-on** — realistic worn look via an image model.
- **Layer item cutouts onto a fixed model image** — composite transparent garment cutouts at defined zones.
- **Composite into a styled silhouette** — stylized placement.

Pick the strongest after testing; keep the others swappable.

### Model setup (stub for now)

- Ship **one stubbed editorial model** for v1.
- Leave a seam for future options: multiple poses/body types, or user-uploaded model photo.

## v1 Features (beyond assembling)

- **Save / share outfit looks** — persist an assembled look (the three items + both views) and produce a shareable output (link or exportable image of the side-by-side).
- **Shopping links per item** — each slot surfaces a "where to buy" link using the item's source product URL.

## Visual Aesthetic — Test Options

The user wants to **test a few aesthetics**, **leaning toward editorial/magazine (YOOX-like, high fashion)**. Build with editorial as the default theme but make styling themeable so alternates (minimal/clean, bold/playful) can be toggled and compared.

- Default: editorial/magazine — refined typography, lots of whitespace, high-fashion feel.
- Make the theme a switchable layer, not hardcoded.

## Tech Stack

**Claude Code decides.** Considerations that should inform the choice:
- Needs a backend for screen-capture handling, background removal/cutout, fetching catalog data from yoox.com, and (if used) AI try-on generation.
- Image compositing for the flat-lay and the cutout-layering model approach.
- Persistence for saved looks + shareable exports.

## Suggested Build Order

1. Three-slot outfit data model + empty UI shell (top / bottom / shoes).
2. Catalog source adapter — yoox.com integration to pick items into slots.
3. Screen-capture intake — all three methods (crop, auto-cutout, paste URL), normalized into the item object.
4. Flat-lay composition view.
5. Editorial model view — implement the swappable strategies, test, pick the best.
6. Side-by-side layout combining model + flat-lay.
7. Save / share looks + per-item shopping links.
8. Themeable aesthetics (editorial default + alternates to compare).

## Open Questions / Decide-Later

- Final editorial-model rendering approach (after the build experiment).
- Final model setup (fixed vs multiple vs user-uploaded).
- Additional catalog sources beyond yoox.com.
- Final aesthetic after theme testing.
