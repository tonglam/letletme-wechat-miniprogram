import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

let capturedPage;
globalThis.Page = (definition) => {
  capturedPage = definition;
};

await import("../miniprogram/pages/live/entry/entry.ts");
const entryPage = capturedPage;

capturedPage = undefined;
const tournamentModule = await import("../miniprogram/pages/live/tournament/tournament.ts");
const tournamentPage = capturedPage;

test("re-arms current-gameweek polling before loading the switched context", () => {
  const calls = [];
  const context = {
    ...entryPage,
    data: { ...entryPage.data, entryId: 123, event: 32 },
    cancelFreshnessCheck() {
      calls.push("cancel");
    },
    stopAutoRefresh() {
      calls.push("stop");
    },
    setData(update) {
      Object.assign(this.data, update);
      calls.push(`set:${this.data.event}`);
    },
    syncAutoRefresh() {
      calls.push(`sync:${this.data.event}`);
    },
    loadData(options) {
      calls.push(`load:${this.data.event}:${options.includeTransfers === true}`);
      return Promise.resolve();
    }
  };

  entryPage.onGwChange.call(context, { detail: { value: 33 } });

  assert.deepEqual(calls, ["cancel", "stop", "set:33", "sync:33", "load:33:true"]);
});

test("an overlapping manual refresh awaits its independent transfer refresh", async () => {
  let resolveScore;
  let resolveTransfers;
  const scoreRequest = new Promise((resolve) => {
    resolveScore = resolve;
  });
  const transfersRequest = new Promise((resolve) => {
    resolveTransfers = resolve;
  });
  const transferCalls = [];
  const context = {
    data: { entryId: 123, event: 33 },
    liveRequest: scoreRequest,
    liveRequestKey: "123:33",
    loadTransfers(entryId, eventId, forceRefresh) {
      transferCalls.push([entryId, eventId, forceRefresh]);
      return transfersRequest;
    }
  };

  let settled = false;
  const result = entryPage.loadData.call(context, {
    includeTransfers: true,
    forceRefresh: true
  });
  void result.then(() => {
    settled = true;
  });

  assert.deepEqual(transferCalls, [[123, 33, true]]);
  resolveScore();
  await Promise.resolve();
  assert.equal(settled, false, "the pull refresh must remain active for transfers");
  resolveTransfers();
  await result;
  assert.equal(settled, true);
});

test("renders pending transfers and partial tournament rows honestly", () => {
  const entryTemplate = readFileSync(
    new URL("../miniprogram/pages/live/entry/entry.wxml", import.meta.url),
    "utf8"
  );
  const tournamentTemplate = readFileSync(
    new URL("../miniprogram/pages/live/tournament/tournament.wxml", import.meta.url),
    "utf8"
  );

  assert.match(entryTemplate, /transfersLoading && transfers\.length === 0/);
  assert.match(tournamentTemplate, /errorSuffix/);
  assert.equal(
    tournamentModule.partialTournamentErrorSuffix(0),
    "未成功加载的球队暂未显示"
  );
  assert.equal(
    tournamentModule.partialTournamentErrorSuffix(1),
    "部分球队显示上次成功结果"
  );
  assert.equal(tournamentPage.data.errorSuffix, "");
});
