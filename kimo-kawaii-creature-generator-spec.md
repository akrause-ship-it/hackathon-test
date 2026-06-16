# Kimo-Kawaii Creature Generator — Product Spec

## Concept
A web app that generates fantasy animals by mashing up the **head of animal A**, **body of animal B**, and **tail of animal C**. Each creature is rendered as an AI-generated image in a **kimo-kawaii** (creepy-cute) Japanese art style and given a name starting with the letter **K**. Users can save creatures to a personal collection and share them.

## Core Loop
1. User picks (or randomizes) a head, body, and tail from a pool of ~15–20 animals.
2. The app generates an AI image of the combined creature in kimo-kawaii style.
3. The app suggests a K-name; the user can edit it.
4. User saves the creature to their collection and/or shares it.

## Features

### Part selection
- Pool of **~15–20 animals**, each usable as head, body, or tail.
- Three independent selectors: **Head / Body / Tail**.
- Two input modes:
  - **Pick** — choose each part manually (dropdown or visual picker).
  - **Randomize** — a shuffle button rolls all three (or re-rolls individually).

### Image generation
- Output is an **AI-generated image** in **kimo-kawaii** style — cute but slightly unsettling/grotesque, soft Japanese character aesthetic with off-kilter charm (think bulgy eyes, weird proportions, pastel-meets-eerie).
- Each generation composes the three chosen parts into a single coherent creature.
- **Recommended technical approach:** see below.

### Naming
- App **auto-suggests** a name starting with **K** (e.g. blends/portmanteaus of the chosen animals, or a K-themed cute-creepy invented word).
- Name field is **editable** by the user.

### Collection
- **Local-first** storage (saves persist on the user's device, no login required).
- Accounts/cloud sync are a **later phase** — design data model so a creature can later be tied to a user ID.
- Collection view: grid of saved creatures with name, parts used, and date.

### Sharing
Support all three:
- **Image download** (PNG of the creature).
- **Private link sharing** (shareable URL to a single creature).
- **Public gallery** (opt-in; creatures appear in a browsable feed everyone can see).

## Recommended Generation Approach
Direct, raw image generation of a freeform "head A + body B + tail C" creature is hard to keep consistent and on-style. Recommended stack:

- **Prompt-templated generation.** Build the image prompt from the three selected parts plus a fixed kimo-kawaii style block. Example template:
  > "A single fantasy creature with the head of a {head}, body of a {body}, and tail of a {tail}. Kimo-kawaii Japanese character art: cute but unsettling, soft pastel palette, slightly grotesque proportions, big glossy eyes, clean flat shading, centered on a plain background."
- **Model:** start with a hosted text-to-image API (e.g. an image model accessible via API). Keep the style block locked so all creatures feel like one set.
- **Consistency tactics:** fixed background, fixed framing ("centered, full body, plain background"), consistent style descriptors every time, and a seed strategy if the chosen model supports seeds.
- **Caching:** cache generated images by the (head, body, tail, name?) combination so re-viewing or sharing doesn't re-bill a generation.
- **Note:** the in-app Anthropic API path is best for *text* (e.g. generating clever K-names), not for the creature imagery — route imagery to a dedicated image model.

## Suggested Animal Pool (placeholder, ~18)
Cat, frog, axolotl, rabbit, octopus, deer, fox, snail, bat, jellyfish, hedgehog, seal, owl, salamander, moth, capybara, pufferfish, ferret. (Tweak for max kimo-kawaii potential — slimy/squishy/wide-eyed animals shine here.)

## Data Model (sketch)
```
Creature {
  id
  headAnimal
  bodyAnimal
  tailAnimal
  name            // K-name, editable
  imageUrl        // generated/cached
  createdAt
  isPublic        // for gallery
  userId?         // null until accounts added
}
```

## Phasing
- **Phase 1 (MVP):** part selection (pick + randomize), AI generation, K-name suggest/edit, local-first collection, image download, clickable prototype.
- **Phase 2:** private link sharing, public gallery.
- **Phase 3:** accounts + cloud sync, social features (likes, etc.).

## Deliverables
- This spec.
- A **clickable prototype** (frontend mockup of the core loop — selectors, randomize, generated-creature display with placeholder art, name field, save/share buttons).
