// Regenerates the favicon and PWA / home-screen icons from the canonical
// magenta goddess logo. The source is already square, monochrome, and
// transparent, so the icon builder preserves its authored shape and colour.
//
// Usage:
//   node scripts/build-icons.mjs [srcSvg] [outDir]
// Defaults: public/illustrations/logo-deusa-vetorizada.svg -> public/icons

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const srcPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(webRoot, "public/illustrations/logo-deusa-vetorizada.svg");
const outDir = process.argv[3]
  ? path.resolve(process.cwd(), process.argv[3])
  : path.join(webRoot, "public/icons");

const M = 1024; // master render size

const masterFullBleed = await sharp(srcPath, { density: 200, limitInputPixels: false })
  .resize(M, M, { fit: "contain" })
  .png()
  .toBuffer();

// Maskable master (Android): figure shrunk into the ~78% safe zone so the
// circle/squircle mask never clips the head or shoulders.
const safe = Math.round(M * 0.78);
const pad = Math.round((M - safe) / 2);
const shrunk = await sharp(masterFullBleed).resize(safe, safe).png().toBuffer();
const masterMaskable = await sharp({
  create: {
    width: M,
    height: M,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: shrunk, top: pad, left: pad }])
  .png()
  .toBuffer();

async function emit(buf, size, name) {
  await sharp(buf).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(outDir, name));
}

await emit(masterFullBleed, 192, "icon-192.png");
await emit(masterFullBleed, 512, "icon-512.png");
await emit(masterMaskable, 192, "icon-maskable-192.png");
await emit(masterMaskable, 512, "icon-maskable-512.png");
await emit(masterFullBleed, 180, "apple-touch-icon.png");
await emit(masterFullBleed, 32, "favicon-32.png");

console.log(`Icons written to ${outDir}`);
