// Regenerates the favicon and PWA / home-screen icons from the canonical
// transparent blindfolded-bust artwork. The portrait is cropped from the top
// into a strict square, filled with the brand gradient, and kept transparent.
//
// Usage:
//   node scripts/build-icons.mjs [srcSvg] [outDir]
// Defaults: public/illustrations/busto-vendado.svg -> public/icons

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const srcPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(webRoot, "public/illustrations/busto-vendado.svg");
const outDir = process.argv[3]
  ? path.resolve(process.cwd(), process.argv[3])
  : path.join(webRoot, "public/icons");

const GRADIENT = ["#c77dff", "#9945ff", "#2ed6a6", "#14f195"];
const M = 1024; // master render size

const squareBust = await sharp(srcPath, { density: 200, limitInputPixels: false })
  .resize(M, M, { fit: "cover", position: "north" })
  .png()
  .toBuffer();

// The supplied transparent source is a white/black master. Flattening it on
// black turns the visible white artwork into a luminance mask while preserving
// the blindfold, facial shadows, and transparent background as negative space.
const { data: bustMask, info: maskInfo } = await sharp(squareBust)
  .flatten({ background: "#000000" })
  .greyscale()
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const gradientSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${M}" height="${M}">
     <defs>
       <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="${GRADIENT[0]}"/>
         <stop offset="0.34" stop-color="${GRADIENT[1]}"/>
         <stop offset="0.78" stop-color="${GRADIENT[2]}"/>
         <stop offset="1" stop-color="${GRADIENT[3]}"/>
       </linearGradient>
     </defs>
     <rect width="${M}" height="${M}" fill="url(#g)"/>
   </svg>`,
  "utf8",
);

const { data: gradientRgb, info: gradientInfo } = await sharp(gradientSvg)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const gradientBust = await sharp(gradientRgb, {
  raw: {
    width: gradientInfo.width,
    height: gradientInfo.height,
    channels: 3,
  },
})
  .joinChannel(bustMask, {
    raw: { width: maskInfo.width, height: maskInfo.height, channels: 1 },
  })
  .png()
  .toBuffer();

// Full-bleed master (browser, iOS, and PWA "any").
const masterFullBleed = gradientBust;

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
