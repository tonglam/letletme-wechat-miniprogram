import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

test("Price resumes the visible Player mode ahead of cold daily startup", () => {
  const price = source("miniprogram/pages/data/price/price.ts");
  assert.match(price, /resumeStage = this\.data\.activeMode === "player"[\s\S]*historyLoading[\s\S]*startupPending \|\| this\.data\.playerLoading[\s\S]*\? "player"[\s\S]*: this\.startupPending \|\| this\.data\.loading/);
});

test("Home invalidates a hidden cold lifecycle and resumes with a warm tracker", () => {
  const home = source("miniprogram/pages/home/index/index.ts");
  assert.match(home, /startHomeLifecycle\("cold-launch", "page-load"\)/);
  assert.match(home, /if \(this\._resumeStartupOnShow\)[\s\S]*startHomeLifecycle\("warm-enter", "page-show"\)/);
  assert.match(home, /const isActiveLifecycle = \(\) => \([\s\S]*lifecycleRevision === this\._lifecycleRevision[\s\S]*tracker === this\._perfTracker/);
  assert.match(home, /onHide\(\)[\s\S]*_resumeStartupOnShow = this\._startupPending[\s\S]*_lifecycleRevision \+= 1/);
});

test("My FPL exposes its primary selector only after authoritative principal resolution", () => {
  const page = source("miniprogram/pages/my-fpl/index/index.ts");
  const template = source("miniprogram/pages/my-fpl/index/index.wxml");
  assert.match(page, /principalResolved: false/);
  assert.match(page, /syncPrincipalState\(principalResolved = false\)[\s\S]*principalResolved \? \{ principalResolved: true \}/);
  assert.match(page, /if \(!this\.pageVisible \|\| lifecycleRevision !== this\.lifecycleRevision\) return[\s\S]*await this\.loadOverview\(false, lifecycleRevision\)/);
  assert.match(page, /isStale\(requestId: number, lifecycleRevision: number\)[\s\S]*!this\.pageVisible[\s\S]*lifecycleRevision !== this\.lifecycleRevision/);
  assert.match(page, /syncPrincipalState\(true\)[\s\S]*void this\.loadOverviewSecondary\(/);
  assert.match(page, /async loadOverviewSecondary\([\s\S]*Promise\.all\(/);
  assert.match(template, /principalResolved && \(eventContextAvailable \|\| principalState === 'NO_FOLLOW'\)/);
});
