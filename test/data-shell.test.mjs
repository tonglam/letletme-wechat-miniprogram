import assert from "node:assert/strict";
import test from "node:test";

let capturedShell;
globalThis.Page = (definition) => {
  capturedShell = definition;
};
// PerformancePage wraps Page; the stub above captures the final definition.
globalThis.wx = { nextTick: (fn) => fn() };

await import("../miniprogram/pages/data/index/index.ts");
const dataShell = capturedShell;

test("the data hub shell redirects to the explore section's first destination", () => {
  const redirects = [];
  globalThis.wx = { redirectTo: ({ url }) => redirects.push(url) };
  dataShell.onLoad.call({ ...dataShell });
  assert.deepEqual(redirects, ["/pages/summary/gameweek/gameweek"]);
});
