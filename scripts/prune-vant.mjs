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
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const vantDir = join("miniprogram", "miniprogram_npm", "@vant", "weapp");
const sourceVantDir = join("node_modules", "@vant", "weapp", "lib");
const representativeComponents = ["action-sheet", "picker-column", "circle", "common", "icon"];

if (!existsSync(vantDir)) {
  console.log(`[prune-vant] ${vantDir} not found — skipping (npm build not run yet)`);
  process.exit(0);
}

// The generated directory is ignored by git, so a developer can carry a
// previously-pruned tree across commits.  Do not report success for that
// state: WeChat's lazy component resolver will later fail with an opaque
// WXML ENOENT.  The upload workflow runs packNpmManually immediately before
// this check, while a local invocation gets an actionable rebuild error.
const missingRepresentatives = representativeComponents.filter(
  (component) => !existsSync(join(vantDir, component))
);
if (missingRepresentatives.length > 0) {
  throw new Error(
    `[prune-vant] incomplete generated tree; missing ${missingRepresentatives.join(", ")}. `
      + "Rebuild Mini Program npm packages (npm ci && packNpmManually) before running this script."
  );
}

// When the installed Vant package is available, compare every source
// component directory with the generated output instead of relying only on
// the representative sentinel list above.
if (existsSync(sourceVantDir)) {
  const expectedComponents = readdirSync(sourceVantDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const missingComponents = expectedComponents.filter(
    (component) => !existsSync(join(vantDir, component))
  );
  if (missingComponents.length > 0) {
    throw new Error(
      `[prune-vant] generated tree is missing ${missingComponents.length} installed Vant component(s): `
        + `${missingComponents.join(", ")}. Rebuild Mini Program npm packages before upload.`
    );
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

console.log("[prune-vant] kept the complete Vant component tree for runtime lazy loading");
