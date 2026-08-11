import assert from "node:assert/strict";
import test from "node:test";

globalThis.Page = () => {};
const leaguesModule = await import("../miniprogram/pages/my-fpl/leagues/leagues.ts");

test("official league cache never crosses season boundaries", () => {
  globalThis.wx = {
    getStorageSync() {
      return {
        entryId: 123,
        season: "2025-26",
        leagues: [{ id: "old", name: "Old league" }],
        storedAt: 1
      };
    }
  };

  assert.equal(leaguesModule.readLeaguesCache(123, "2026-27"), null);
  assert.equal(
    leaguesModule.readLeaguesCache(123, "2025-26")?.leagues[0]?.name,
    "Old league"
  );
  assert.equal(leaguesModule.readLeaguesCache(123, undefined), null);
});
