// Regenerates the PWA / home-screen icons from a monochrome source SVG.
//
// The source (public/icons/icon-source.svg) is a full-bleed square filled with
// a single color, with the Idealer dealer figure carved out as negative space.
// We recolor the tile to the brand dark, paint the brand purple->green gradient
// behind it (so the figure reads as the gradient), and emit the PNG sizes that
// iOS and Android actually accept for installed home-screen icons.
//
// Usage:
//   node scripts/build-icons.mjs [srcSvg] [outDir]
// Defaults: public/icons/icon-source.svg -> public/icons

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const srcPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(webRoot, "public/icons/icon-source.svg");
const outDir = process.argv[3]
  ? path.resolve(process.cwd(), process.argv[3])
  : path.join(webRoot, "public/icons");

const DARK = "#0b0910";
const PURPLE = "#a78bfa";
const GREEN = "#7cf29b";
const M = 1024; // master render size

const src = readFileSync(srcPath, "utf8");
const darkLogoSvg = Buffer.from(src.replace(/fill="#000000"/g, `fill="${DARK}"`), "utf8");

const gradientSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${M}" height="${M}">
     <defs>
       <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="${PURPLE}"/>
         <stop offset="1" stop-color="${GREEN}"/>
       </linearGradient>
     </defs>
     <rect width="${M}" height="${M}" fill="url(#g)"/>
   </svg>`,
  "utf8",
);

const darkLogoPng = await sharp(darkLogoSvg, { density: 200, limitInputPixels: false })
  .resize(M, M, { fit: "contain" })
  .png()
  .toBuffer();

// Full-bleed master (iOS + "any"): figure runs to the tile edges.
const masterFullBleed = await sharp(gradientSvg, { limitInputPixels: false })
  .composite([{ input: darkLogoPng, top: 0, left: 0 }])
  .png()
  .toBuffer();

// Maskable master (Android): figure shrunk into the ~78% safe zone so the
// circle/squircle mask never clips the head or shoulders.
const safe = Math.round(M * 0.78);
const pad = Math.round((M - safe) / 2);
const shrunk = await sharp(masterFullBleed).resize(safe, safe).png().toBuffer();
const masterMaskable = await sharp({
  create: { width: M, height: M, channels: 4, background: DARK },
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
