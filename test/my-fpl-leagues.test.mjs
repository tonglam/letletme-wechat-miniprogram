import assert from "node:assert/strict";
import test from "node:test";

globalThis.Page = () => {};
const leaguesModule = await import("../miniprogram/pages/my-fpl/leagues/leagues.ts");

test("tournament directory cache never crosses season boundaries", () => {
  globalThis.wx = {
    getStorageSync() {
      return {
        entryId: 123,
        season: "2025-26",
        tournaments: [{ id: 9, name: "Old tournament" }],
        storedAt: 1
      };
    }
  };

  assert.equal(leaguesModule.readTournamentsCache(123, "2026-27"), null);
  assert.equal(
    leaguesModule.readTournamentsCache(123, "2025-26")?.tournaments[0]?.name,
    "Old tournament"
  );
  assert.equal(leaguesModule.readTournamentsCache(123, undefined), null);
});
