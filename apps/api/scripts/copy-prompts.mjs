import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(apiRoot, "src/prompts");
const destination = resolve(apiRoot, "dist/prompts");

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
