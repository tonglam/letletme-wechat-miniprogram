#!/usr/bin/env node
/**
 * Rasterize LetLetMe abstract squad-pitch SVGs to PNG with resvg.
 *
 * WeChat <image> SVG support is uneven on Android, and canvas 2d cannot
 * draw SVG. Keep the original SVGs as the source of truth and commit the
 * PNG siblings used at runtime. Artwork is never redrawn as official kits.
 *
 * ImageMagick's SVG backend drops fills/clip-paths on these files, so do
 * not fall back to `magick` for production assets.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const ASSETS = join(ROOT, "miniprogram", "assets", "squad-pitch");
const KITS = join(ASSETS, "kits");

const require = createRequire(import.meta.url);
let Resvg;
try {
  ({ Resvg } = require("@resvg/resvg-js"));
} catch {
  throw new Error("Install @resvg/resvg-js to rasterize squad-pitch SVGs");
}

function convert(src, dest, width) {
  const svg = readFileSync(src);
  const rendered = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "rgba(0,0,0,0)"
  }).render();
  writeFileSync(dest, rendered.asPng());
  const kb = Math.round(statSync(dest).size / 1024);
  console.log(`wrote ${dest} (${kb} KB)`);
}

const pitchPng = join(ASSETS, "pitch-background.png");
convert(join(ASSETS, "pitch-background.svg"), pitchPng, 750);
const jpeg = spawnSync("magick", [pitchPng, "-strip", "-quality", "82", join(ASSETS, "pitch-background.jpg")], { stdio: "inherit" });
if (jpeg.status !== 0) throw new Error("jpeg convert failed");
unlinkSync(pitchPng);
console.log("wrote pitch-background.jpg");

for (const name of readdirSync(KITS).filter((file) => file.endsWith(".svg"))) {
  convert(join(KITS, name), join(KITS, name.replace(/\.svg$/, ".png")), 240);
}
