import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

let capturedApp;
globalThis.App = (definition) => {
  capturedApp = definition;
};
globalThis.wx = {};

await import("../miniprogram/app.ts");

const appSource = readFileSync(
  new URL("../miniprogram/app.ts", import.meta.url),
  "utf8",
);

test("a forced app-data refresh upgrades an ordinary pending read", async () => {
  const calls = [];
  let releaseOrdinary;
  const ordinary = new Promise((resolve) => {
    releaseOrdinary = resolve;
  });
  const context = {
    ...capturedApp,
    _pendingInit: null,
    _pendingInitForced: false,
    _initAppDataInner(forceRefresh) {
      calls.push(forceRefresh);
      return forceRefresh ? Promise.resolve() : ordinary;
    }
  };

  const initial = capturedApp.initAppData.call(context, false);
  const forced = capturedApp.initAppData.call(context, true);
  assert.deepEqual(calls, [false]);

  releaseOrdinary();
  await initial;
  await forced;

  assert.deepEqual(calls, [false, true]);
  assert.equal(context._pendingInit, null);
  assert.equal(context._pendingInitForced, false);
});

test("concurrent forced app-data refreshes remain single-flight", async () => {
  const calls = [];
  let releaseForced;
  const pendingForced = new Promise((resolve) => {
    releaseForced = resolve;
  });
  const context = {
    ...capturedApp,
    _pendingInit: null,
    _pendingInitForced: false,
    _initAppDataInner(forceRefresh) {
      calls.push(forceRefresh);
      return pendingForced;
    }
  };

  const first = capturedApp.initAppData.call(context, true);
  const second = capturedApp.initAppData.call(context, true);
  assert.deepEqual(calls, [true]);
  releaseForced();
  await Promise.all([first, second]);
  assert.deepEqual(calls, [true]);
});

test("profile synchronization reloads pages when the effective viewer changes", () => {
  assert.match(appSource, /const entryAtStart = getEntryId\(\);/);
  assert.match(appSource, /const nextEntry = getEntryId\(\);/);
  assert.match(
    appSource,
    /if \(nextEntry !== entryAtStart\)[\s\S]*reloadCurrentPageForEntryChange\(nextEntry\)/,
  );
  assert.match(appSource, /synchronizeMiniProgramAccount\(\)/);
});
