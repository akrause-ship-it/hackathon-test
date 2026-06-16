// Huedini — a tiny color conjurer.
// Palettes are built with color theory so they actually look good,
// instead of five random hex codes fighting each other.

const SIZE = 5;
const paletteEl = document.getElementById("palette");
const generateBtn = document.getElementById("generate");
const toastEl = document.getElementById("toast");

// Track lock state + current color per slot.
const slots = Array.from({ length: SIZE }, () => ({ hex: "#000000", locked: false }));

// Palette memory, persisted in this browser. loadList is hoisted (defined below).
const HISTORY_KEY = "huedini-history";
const SAVED_KEY = "huedini-saved";
const MAX_HISTORY = 10;
let recentPalettes = loadList(HISTORY_KEY);
let savedPalettes = loadList(SAVED_KEY);

/* ---------- color helpers ---------- */
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Relative luminance → decide whether text should be light or dark.
function isLight(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.5;
}

const rand = (min, max) => Math.random() * (max - min) + min;
const wrap = (h) => ((h % 360) + 360) % 360;

// A grab-bag of harmony schemes — picked at random each conjure for variety.
const SCHEMES = [
  { name: "analogous",     offsets: [-40, -20, 0, 20, 40] },
  { name: "complementary", offsets: [0, 30, 180, 200, 160] },
  { name: "triadic",       offsets: [0, 120, 240, 60, 300] },
  { name: "split",         offsets: [0, 150, 210, 30, 330] },
  { name: "monochrome",    offsets: [0, 0, 0, 0, 0] },
];

function buildPalette() {
  const scheme = SCHEMES[Math.floor(Math.random() * SCHEMES.length)];
  const baseHue = rand(0, 360);
  const baseSat = rand(55, 85);

  return scheme.offsets.map((offset, i) => {
    const hue = wrap(baseHue + offset);
    // Stagger lightness so swatches read as a gradient, not a blur.
    const light = scheme.name === "monochrome"
      ? 22 + i * 15
      : rand(38, 72);
    const sat = scheme.name === "monochrome"
      ? baseSat
      : Math.min(95, baseSat + rand(-12, 12));
    return hslToHex(hue, sat, light);
  });
}

/* ---------- rendering ---------- */
function render() {
  paletteEl.innerHTML = "";
  slots.forEach((slot, i) => {
    const light = isLight(slot.hex);
    // A div (not a button) so the lock button can nest inside it validly.
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.setAttribute("role", "button");
    swatch.setAttribute("tabindex", "0");
    swatch.style.background = slot.hex;
    swatch.style.color = light ? "#10100f" : "#ffffff";
    swatch.style.animationDelay = `${i * 60}ms`;
    swatch.setAttribute("aria-label", `Copy ${slot.hex}`);

    swatch.innerHTML = `
      <button class="lock ${slot.locked ? "is-locked" : ""}" type="button"
              aria-label="${slot.locked ? "Unlock color" : "Lock color"}"
              aria-pressed="${slot.locked}">
        ${slot.locked ? "🔒" : "🔓"}
      </button>
      <span class="swatch-info">
        <span class="hex">${slot.hex}</span>
        <span class="copy-label">Click to copy</span>
      </span>`;

    swatch.addEventListener("click", () => copyColor(slot.hex));
    swatch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        copyColor(slot.hex);
      }
    });

    swatch.querySelector(".lock").addEventListener("click", (e) => {
      e.stopPropagation();
      slot.locked = !slot.locked;
      render();
    });

    paletteEl.appendChild(swatch);
  });
}

function generate() {
  const fresh = buildPalette();
  slots.forEach((slot, i) => {
    if (!slot.locked) slot.hex = fresh[i];
  });
  render();
  recordHistory(slots.map((s) => s.hex));
}

/* ---------- clipboard + toast ---------- */
let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1100);
}

async function copyColor(hex) {
  try {
    await navigator.clipboard.writeText(hex);
  } catch {
    // Fallback for non-secure contexts.
    const tmp = document.createElement("textarea");
    tmp.value = hex;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand("copy");
    tmp.remove();
  }
  showToast(`Copied ${hex}`);
}

/* ---------- events ---------- */
generateBtn.addEventListener("click", generate);

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target === document.body) {
    e.preventDefault();
    generate();
  }
});

/* ---------- palette memory: recent history + saved ---------- */
const trayToggle = document.getElementById("tray-toggle");
const trayClose = document.getElementById("tray-close");
const tray = document.getElementById("tray");
const recentList = document.getElementById("recent-list");
const savedList = document.getElementById("saved-list");

function loadList(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(recentPalettes));
    localStorage.setItem(SAVED_KEY, JSON.stringify(savedPalettes));
  } catch {}
}

const samePalette = (a, b) => a.join() === b.join();

// Record a freshly generated palette (most-recent first, capped at MAX_HISTORY).
function recordHistory(palette) {
  if (recentPalettes.length && samePalette(recentPalettes[0], palette)) return;
  recentPalettes.unshift(palette.slice());
  recentPalettes = recentPalettes.slice(0, MAX_HISTORY);
  persist();
  renderTray();
}

// Apply a stored palette back onto the swatches.
function applyPalette(palette) {
  slots.forEach((slot, i) => { slot.hex = palette[i]; });
  render();
  showToast("Palette applied");
}

function savePalette(palette) {
  if (savedPalettes.some((p) => samePalette(p, palette))) {
    showToast("Already saved");
    return;
  }
  savedPalettes.unshift(palette.slice());
  persist();
  renderTray();
  showToast("Saved ★");
}

function removeSaved(index) {
  savedPalettes.splice(index, 1);
  persist();
  renderTray();
}

function thumbMarkup(palette) {
  return palette.map((hex) => `<span style="background:${hex}"></span>`).join("");
}

function buildItem(palette, actionLabel, actionClass, onAction) {
  const item = document.createElement("div");
  item.className = "pal-item";
  item.innerHTML = `
    <button class="pal-thumb" type="button" title="Apply this palette"
            aria-label="Apply palette ${palette.join(", ")}">${thumbMarkup(palette)}</button>
    <button class="pal-act ${actionClass}" type="button">${actionLabel}</button>`;
  item.querySelector(".pal-thumb").addEventListener("click", () => applyPalette(palette));
  item.querySelector(".pal-act").addEventListener("click", onAction);
  return item;
}

function renderTray() {
  recentList.innerHTML = "";
  if (recentPalettes.length === 0) {
    recentList.innerHTML = `<p class="tray-empty">Generate a palette to start your history.</p>`;
  } else {
    recentPalettes.forEach((palette) => {
      recentList.appendChild(buildItem(palette, "★", "", () => savePalette(palette)));
    });
  }

  savedList.innerHTML = "";
  if (savedPalettes.length === 0) {
    savedList.innerHTML = `<p class="tray-empty">No saved palettes yet. Tap ★ on any palette to keep it.</p>`;
  } else {
    savedPalettes.forEach((palette, i) => {
      savedList.appendChild(buildItem(palette, "✕", "pal-remove", () => removeSaved(i)));
    });
  }

  trayToggle.dataset.count = savedPalettes.length || "";
}

function toggleTray(force) {
  const open = typeof force === "boolean" ? force : !tray.classList.contains("open");
  tray.classList.toggle("open", open);
  trayToggle.setAttribute("aria-expanded", String(open));
}

trayToggle.addEventListener("click", () => toggleTray());
trayClose.addEventListener("click", () => toggleTray(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && tray.classList.contains("open")) toggleTray(false);
});

renderTray();

// First palette on load (content stays hidden behind the gate until unlocked).
generate();

/* ---------- password gate ---------- */
// Client-side only — keeps casual visitors out, not a real security boundary.
const GATE_KEY = "huedini-unlocked";
const PASSWORD = "preview2026";

const gateForm = document.getElementById("gate-form");
const gateInput = document.getElementById("gate-input");
const gateError = document.getElementById("gate-error");
const gateBox = document.querySelector(".gate-box");

function unlock() {
  document.body.classList.remove("locked");
}

// Remembered from a previous visit in this browser?
let remembered = false;
try { remembered = localStorage.getItem(GATE_KEY) === "true"; } catch {}

if (remembered) {
  unlock();
} else {
  gateInput.focus();
}

gateForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (gateInput.value === PASSWORD) {
    try { localStorage.setItem(GATE_KEY, "true"); } catch {}
    gateError.textContent = "";
    unlock();
  } else {
    gateError.textContent = "Hmm, that's not quite right — try again.";
    gateInput.value = "";
    gateInput.focus();
    // Restart the shake animation for a little nudge of feedback.
    gateBox.classList.remove("shake");
    void gateBox.offsetWidth;
    gateBox.classList.add("shake");
  }
});
