#!/usr/bin/env node
/**
 * Validate/patch the built Vant Weapp tree used by the Mini Program.
 *
 * WeChat's lazy component injector indexes the complete package tree even when
 * a component is not referenced by the initial page. Removing apparently
 * unused Vant directories therefore produces runtime ENOENT WXML failures
 * (the missing directory varies with the page/cache state). Keep the official
 * package output intact; the upload gate still runs this script so the
 * compatibility patch below is applied consistently in CI and local builds.
 *
 * Do not delete component directories here. The full tree is required by the
 * official DevTools/runtime package resolver, including on pages that do not
 * render the component during the first pass.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const vantDir = join("miniprogram", "miniprogram_npm", "@vant", "weapp");

if (!existsSync(vantDir)) {
  console.log(`[prune-vant] ${vantDir} not found — skipping (npm build not run yet)`);
  process.exit(0);
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

console.log("[prune-vant] kept the complete Vant component tree for runtime lazy loading");
