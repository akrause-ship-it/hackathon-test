# Photography Gallery — Build Spec

A spec for Claude Code to build an online photography gallery with room/setting mockup previews.

## Goal

Build an online gallery that feels **approachable and personal** (not cold/high-end), where the design gives **equal weight to the photos and a clean, uncluttered layout**. Visitors should be able to browse the work, preview photos staged inside real-world settings, and pick favorites from an image picker. The site supports portfolio showcase, buying prints, and booking inquiries.

## Core Purpose (all of the following)

- **Portfolio showcase** — primary: display the photography beautifully.
- **Sell prints/products** — purchasing is **stubbed for now** (see Commerce).
- **Lead generation** — a contact/booking inquiry path.

## Image Sources

Photos come from **the photographer's iPhone Photos or a Google Photos folder**. Build for both:

- **Direct file upload** — drag/drop or file picker, multi-select, accepts common formats (JPEG, PNG, HEIC — convert HEIC to web-friendly on ingest).
- **Google Photos import** — pull from a shared Google Photos album/folder via link or API. If full Google Photos API integration is heavy, start with a **shared-album-link importer** and leave an adapter seam for the official API.
- Store imported/uploaded images with generated thumbnails + web-optimized variants. Do not depend on the original device after import.

## Image Picker — Build Multiple Options to Test

The user wants to **A/B test picker layouts**. Implement these as switchable modes (a toggle or settings flag), all driven by the same image data:

1. **Carousel / slider** — one image at a time, swipe/arrow navigation.
2. **Grid / masonry wall** — all thumbnails in a responsive masonry grid.
3. **Carousel to pick → large preview** — small carousel to select, big preview pane below/beside.
4. **Filmstrip thumbnails + main view** — horizontal thumbnail strip with a large main image.

Each mode lets the user mark/select favorites. Selected images flow into the room mockup previews and (later) the buy flow.

## Room / Setting Mockup Previews

Two preview types, both available:

- **Real interior shots** — display the photographer's actual gallery/installation photos as-is.
- **Mockup previews** — composite a selected photo (as a framed print) into a staged scene.

**Scene options to offer (all of these, selectable in the preview UI):**

- Living room
- Coffee shop
- Clothing / retail store
- Gallery wall
- Office / lobby

Implementation notes for mockups:
- Each scene = a background image with a defined "frame zone" (perspective-corrected quad/placement coords) where the selected photo is composited.
- Let the user switch scenes for the same photo and switch photos within a scene.
- Keep scenes as data (config-driven) so new scenes can be added without code changes.
- Provide a few frame styles (thin black, white mat, natural wood) as a stretch option.

## Commerce (stub for now)

- Build a **buy / order path scaffold** but no real checkout yet.
- Reserve a data model for products (print sizes, prices), cart, and order.
- Use a clearly marked stub (e.g., "Request this print" → routes to the inquiry form) so the flow is testable.
- Leave a seam to drop in Stripe or fixed price lists later.

## Lead Gen / Inquiry

- Contact / booking inquiry form (name, email, message, optional selected-image reference).
- "Request this print" and "Book a session" both route here for now.

## Branding & Content

Include placeholders the user will fill in:

- **Photographer name** (site title / header).
- **About** — short bio section.
- **Contact** — email + inquiry form; optional social links.

## Visual Direction

- **Feeling:** approachable, personal, warm — like a real person's portfolio, not a sterile luxury brand.
- **Priority:** photos and clean design carry equal weight. Generous whitespace, restrained typography, no clutter.
- Let the photography breathe; UI chrome stays quiet and out of the way.
- Responsive and mobile-first (images often come from / are viewed on a phone).

## Tech Stack

**Claude Code decides** the stack. Suggested direction (not mandatory):
- A framework that supports both static showcase and a light backend for uploads/imports and the inquiry form (e.g., Next.js), but pick what best fits the import + image-processing needs.
- Server-side image processing for thumbnails, web variants, and HEIC conversion.
- Config-driven scenes and switchable picker modes.

## Suggested Build Order

1. Image ingest (upload + Google Photos shared-album import) with thumbnail/variant generation.
2. The four picker modes behind a toggle, sharing one image store.
3. Favorite-selection flow.
4. Room mockup preview engine (config-driven scenes, composite framed print).
5. Real-interior-shot display.
6. Branding shell (name / about / contact + inquiry form).
7. Commerce stub wired to the inquiry form.

## Open Questions / Decide-Later

- Final commerce model (fixed prices vs Stripe vs quote-only).
- Official Google Photos API vs shared-link importer for v1.
- Whether mockups need perspective warping or simple flat compositing for v1.
