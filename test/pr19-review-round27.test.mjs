import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

test("Price resumes the visible Player mode ahead of cold daily startup", () => {
  const price = source("miniprogram/pages/data/price/price.ts");
  assert.match(price, /resumePlayerRefreshAfterShow = this\.playerRefreshPending[\s\S]*resumeStage = this\.resumePlayerRefreshAfterShow[\s\S]*historyLoading[\s\S]*startupPending \|\| this\.data\.playerLoading[\s\S]*\? "player"[\s\S]*: this\.startupPending \|\| this\.data\.loading/);
});

test("Home invalidates a hidden cold lifecycle and resumes with a warm tracker", () => {
  const home = source("miniprogram/pages/home/index/index.ts");
  assert.match(home, /startHomeLifecycle\("cold-launch", "page-load"\)/);
  assert.match(home, /if \(this\._resumeStartupOnShow\)[\s\S]*startHomeLifecycle\("warm-enter", "page-show"\)/);
  assert.match(home, /const isActiveLifecycle = \(\) => \([\s\S]*lifecycleRevision === this\._lifecycleRevision[\s\S]*tracker === this\._perfTracker/);
  assert.match(home, /onHide\(\)[\s\S]*_resumeStartupOnShow = this\._startupPending[\s\S]*_lifecycleRevision \+= 1/);
});

