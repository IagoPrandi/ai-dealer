// Encodes out/landing-raw.webm (from record.mjs) into the landing-page assets:
// public/videos/tywish-round.{mp4,webm} and a poster frame. Requires ffmpeg.
//
// KEEP holds the [start, end] seconds worth showing; the gaps are the app's
// own loading states between scenes. Re-check them after re-recording:
//   ffmpeg -i out/landing-raw.webm -vf "fps=4,scale=100:-1,tile=24x2" -frames:v 1 sheet.png
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const raw = path.join(here, "out", "landing-raw.webm");
const publicDir = path.resolve(here, "../../public/videos");
const KEEP = [[1.2, 42.45], [44.2, 49.2], [50.5, 999]];

const select = KEEP.map(([start, end]) => `between(t,${start},${end})`).join("+");
const filter = `select='${select}',setpts=N/FRAME_RATE/TB,scale=1280:-2`;
const ffmpeg = (...args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { stdio: "inherit" });

ffmpeg("-i", raw, "-vf", filter, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(publicDir, "tywish-round.mp4"));
ffmpeg("-i", raw, "-vf", filter, "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-row-mt", "1", path.join(publicDir, "tywish-round.webm"));
ffmpeg("-ss", "3", "-i", path.join(publicDir, "tywish-round.mp4"), "-frames:v", "1", "-q:v", "4", path.join(publicDir, "tywish-round-poster.jpg"));
console.log("encoded into", publicDir);
