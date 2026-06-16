# 🪄 Huedini

A clean, modern random **color palette generator**. Click the button (or hit
<kbd>Space</kbd>) to conjure five harmonious colors, click any swatch to copy
its hex code, and lock the ones you love before re-rolling the rest.

It's a zero-dependency static site — just HTML, CSS, and vanilla JS — so it
loads instantly and deploys anywhere.

## ✨ Features

- **One-click palettes** — generate button + <kbd>Space</kbd> shortcut.
- **Actually pretty** — palettes use color-theory schemes (analogous,
  complementary, triadic, split-complementary, monochrome) so the five colors
  belong together instead of clashing.
- **Click to copy** — tap any swatch to copy its hex code, with a toast confirm.
- **Lock favorites** — keep a color while re-rolling the others.
- **Palette memory** — a floating panel tracks your last 10 generated palettes
  as thumbnails; star any to **save** it permanently, click a thumbnail to
  re-apply it. Recent + saved palettes persist in the browser.
- **Smart contrast** — hex labels auto-switch between light/dark for readability.
- **Responsive** — horizontal bars on desktop, stacked on mobile.

## 🧑‍💻 Run locally

It's static, so any server works:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open the printed URL. (Clipboard copy needs `http://localhost` or HTTPS —
opening the file directly with `file://` falls back to a legacy copy method.)

## 🚀 Deploy to Vercel

**Option A — CLI**

```bash
npm i -g vercel
vercel          # preview deploy
vercel --prod   # production deploy
```

**Option B — Git**

Push this folder to a GitHub repo, then on
[vercel.com/new](https://vercel.com/new) import the repo. No build settings
needed — Vercel detects it as a static site and serves `index.html`.

That's it. No framework, no build step, no environment variables.

## 📁 Structure

```
index.html    markup
styles.css    styling + animations
script.js     palette generation, copy, lock, shortcuts
vercel.json   static hosting config (clean URLs + security headers)
```
