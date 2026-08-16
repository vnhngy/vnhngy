// Erzeugt die PWA/App-Icons (PNG) rein programmatisch mit pngjs —
// kein externer Bildeditor nötig. Bei Bedarf einfach erneut ausführen:
//   node scripts/generate-icons.mjs
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const PINK = hexToRgb("#ff3cac");
const PURPLE = hexToRgb("#7c3aed");

function drawIcon(size, { rounded = true, padding = 0.16 } = {}) {
  const png = new PNG({ width: size, height: size });

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const t = (x / size + y / size) / 2;
      const r = Math.round(lerp(PINK[0], PURPLE[0], t));
      const g = Math.round(lerp(PINK[1], PURPLE[1], t));
      const b = Math.round(lerp(PINK[2], PURPLE[2], t));

      let alpha = 255;
      if (rounded) {
        const cornerRadius = size * 0.22;
        const cx = x < size / 2 ? cornerRadius : size - cornerRadius;
        const cy = y < size / 2 ? cornerRadius : size - cornerRadius;
        const nearCornerX = x < cornerRadius || x > size - cornerRadius;
        const nearCornerY = y < cornerRadius || y > size - cornerRadius;
        if (nearCornerX && nearCornerY) {
          const dist = Math.hypot(x - cx, y - cy);
          if (dist > cornerRadius) alpha = 0;
        }
      }

      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = alpha;
    }
  }

  // Mikrofon-Silhouette: Kopf (Kreis/Kapsel), Bügel (Halbkreis), Fuß (Linie).
  const cx = size / 2;
  const headCy = size * (0.5 - 0.08);
  const headRx = size * 0.15;
  const headRy = size * 0.22;
  const white = [255, 255, 255];

  const setPixel = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const idx = (size * Math.round(y) + Math.round(x)) << 2;
    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;
    png.data[idx + 3] = a;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - cx) / headRx;
      const ny = (y - headCy) / headRy;
      if (nx * nx + ny * ny <= 1) setPixel(x, y, white);
    }
  }

  const armR = size * 0.26;
  const armThickness = size * 0.045;
  const armCy = headCy + size * 0.06;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (y < armCy) continue;
      const dist = Math.hypot(x - cx, y - armCy);
      if (Math.abs(dist - armR) <= armThickness) setPixel(x, y, white);
    }
  }

  const standTop = armCy + armR;
  const standBottom = size * 0.86;
  const standWidth = size * 0.035;
  for (let y = standTop; y < standBottom; y++) {
    for (let x = cx - standWidth; x < cx + standWidth; x++) setPixel(x, y, white);
  }
  const baseWidth = size * 0.14;
  const baseHeight = size * 0.03;
  for (let y = standBottom; y < standBottom + baseHeight; y++) {
    for (let x = cx - baseWidth; x < cx + baseWidth; x++) setPixel(x, y, white);
  }

  return PNG.sync.write(png);
}

const targets = [
  { file: "icon-192.png", size: 192, rounded: true },
  { file: "icon-512.png", size: 512, rounded: true },
  { file: "apple-touch-icon.png", size: 180, rounded: false },
  { file: "maskable-512.png", size: 512, rounded: false },
];

for (const t of targets) {
  const buffer = drawIcon(t.size, { rounded: t.rounded });
  writeFileSync(join(outDir, t.file), buffer);
  console.log(`✓ ${t.file}`);
}
