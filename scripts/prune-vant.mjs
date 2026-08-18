#!/usr/bin/env node
/**
 * Prune unused Vant Weapp components from the built miniprogram_npm tree.
 *
 * The app only uses van-icon / van-action-sheet, but the npm build ships all
 * ~70 component bundles (~1.9 MB). Keeping just the transitive closure cuts
 * the upload package by ~1.6 MB.
 *
 * Closure (verified by reading each component's index.json + `../x/` imports):
 *   icon, action-sheet
 *     → info, popup, loading, overlay, transition
 *     → shared: common, mixins, wxs, definitions
 *
 * When the app starts using another Vant component, add it (and its
 * transitive deps) to KEEP below.
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const KEEP = new Set([
  // directly used
  "icon",
  "action-sheet",
  // transitive component deps
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

const versionJs = join(vantDir, "common", "version.js");
if (existsSync(versionJs)) {
  const source = readFileSync(versionJs, "utf8");
  if (source.includes("wx.getSystemInfoSync()") && !source.includes("wx.getAppBaseInfo")) {
    writeFileSync(versionJs, source.replace(
      `function getSystemInfoSync() {
    if (systemInfo == null) {
        systemInfo = wx.getSystemInfoSync();
    }
    return systemInfo;
}`,
      `function readSystemInfo() {
    if (typeof wx.getAppBaseInfo === "function") {
        var base = wx.getAppBaseInfo() || {};
        var device = typeof wx.getDeviceInfo === "function" ? wx.getDeviceInfo() || {} : {};
        var windowInfo = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() || {} : {};
        return Object.assign({}, device, windowInfo, base);
    }
    return wx.getSystemInfoSync();
}
function getSystemInfoSync() {
    if (systemInfo == null) {
        systemInfo = readSystemInfo();
    }
    return systemInfo;
}`
    ));
    console.log("[prune-vant] patched common/version.js off wx.getSystemInfoSync");
  }
}

console.log(`[prune-vant] removed ${removed} unused component bundles, kept ${KEEP.size}`);
