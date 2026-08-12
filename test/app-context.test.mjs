import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const storage = new Map();
const globalData = {};
globalThis.wx = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value)
};
globalThis.getApp = () => ({ globalData });

const state = await import("../miniprogram/services/app-context-state.ts");

test("AppContext revisions change only for authoritative context or auth changes", () => {
  const base = {
    season: "2025-26",
    currentEvent: 12,
    nextEvent: 13,
    displayEvent: 12,
    nextDeadlineAt: Date.now() + 60_000,
    phase: "active",
    source: "network",
    stale: false,
    storedAt: Date.now(),
    freshUntil: Date.now() + 60_000
  };
  const first = state.replaceAppContextSnapshot(base);
  const metadataOnly = state.replaceAppContextSnapshot({
    ...base,
    source: "memory",
    storedAt: base.storedAt + 1,
    freshUntil: base.freshUntil + 1
  });
  assert.equal(metadataOnly.contextRevision, first.contextRevision);

  state.commitEntryBindingState(null, "restore");
  assert.equal(state.readAppContextSnapshot().authRevision, 0);
  state.commitEntryBindingState(null, "token-rotation");
  assert.equal(state.readAppContextSnapshot().authRevision, 1);
  state.commitEntryBindingState(42, "rebind");
  assert.equal(state.readAppContextSnapshot().entryId, 42);
  assert.equal(globalData.entryId, 42);
});

test("AppContext source enforces deadline freshness, unresolved backoff and forced single-flight", () => {
  const source = readFileSync(
    new URL("../miniprogram/services/app-context.service.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /displayEvent: currentEvent \|\| nextEvent/);
  assert.match(source, /nextDeadlineAt && nextDeadlineAt > Date\.now\(\)[\s\S]*\? nextDeadlineAt/);
  assert.match(source, /currentEvent === 38 && !nextEvent[\s\S]*24 \* 60 \* 60 \* 1000/);
  assert.match(source, /nextRetryAt = Date\.now\(\) \+ 60 \* 1000/);
  assert.match(source, /if \(pending\)[\s\S]*if \(!options\.forceRefresh \|\| pendingForced\) return pending;[\s\S]*await pending;[\s\S]*return ensureAppContext\(options\)/);
});
