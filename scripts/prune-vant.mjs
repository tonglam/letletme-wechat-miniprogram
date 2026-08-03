#!/usr/bin/env node
/**
 * Prune unused Vant Weapp components from the built miniprogram_npm tree.
 *
 * The app only uses van-tabbar / van-tabbar-item / van-action-sheet, but the
 * npm build ships all ~70 component bundles (~1.9 MB). Keeping just the
 * transitive closure cuts the upload package by ~1.6 MB.
 *
 * Closure (verified by reading each component's index.json + `../x/` imports):
 *   tabbar, tabbar-item, action-sheet
 *     → icon, info, popup, loading, overlay, transition
 *     → shared: common, mixins, wxs, definitions
 *
 * When the app starts using another Vant component, add it (and its
 * transitive deps) to KEEP below.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const KEEP = new Set([
  // directly used
  "tabbar",
  "tabbar-item",
  "action-sheet",
  // transitive component deps
  "icon",
  "info",
  "popup",
  "loading",
  "overlay",
  "transition",
  // shared runtime dirs referenced via ../common, ../mixins, ../wxs
  "common",
  "mixins",
  "wxs",
  "definitions"
]);

const vantDir = join("miniprogram", "miniprogram_npm", "@vant", "weapp");

if (!existsSync(vantDir)) {
  console.log(`[prune-vant] ${vantDir} not found — skipping (npm build not run yet)`);
  process.exit(0);
}

let removed = 0;
for (const entry of readdirSync(vantDir, { withFileTypes: true })) {
  if (entry.isDirectory() && !KEEP.has(entry.name)) {
    rmSync(join(vantDir, entry.name), { recursive: true, force: true });
    removed += 1;
  }
}

console.log(`[prune-vant] removed ${removed} unused component bundles, kept ${KEEP.size}`);
