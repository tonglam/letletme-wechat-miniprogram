import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\s+/g, " ");

test("rank displays share the zh-CN compact formatRank", () => {
  const format = source("miniprogram/utils/summary-format.ts");

  // Web parity: format.number(rank, { notation: "compact" }) → 1.2万 / 123万.
  assert.match(format, /notation: "compact"/);
  assert.match(format, /万/);
  assert.doesNotMatch(format, /toLocaleString/);
});

test("overall-rank call sites route through formatRank", () => {
  const entryCard = source("miniprogram/components/entry-card/entry-card.ts");
  const team = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  const summary = source("miniprogram/pages/summary/tournament/tournament.ts");
  const search = source("miniprogram/pages/entry/search/search.ts");
  const profile = source("miniprogram/pages/entry/profile/profile.ts");
  const profileView = source("miniprogram/pages/entry/profile/profile.wxml");

  // The entry card dropped its local k/m copy.
  assert.match(entryCard, /import \{ formatRank \} from "..\/..\/utils\/summary-format"/);
  assert.doesNotMatch(entryCard, /function formatRank/);
  assert.match(entryCard, /总排名", value: formatRank/);

  // History, chip log and the season table all format ranks centrally.
  assert.match(team, /formatRank\(eventResult\.overallRank\)/);
  assert.match(team, /rankText: formatRank\(item\.eventRank\)/);
  assert.match(team, /rankText: formatRank\(item\.overallRank\)/);
  assert.match(team, /overallRank: formatRank\(item\.overallRank\)/);

  // Tournament summary header + leaderboard OR column.
  assert.match(summary, /总排名", value: formatRank\(summary\.overallRank/);
  assert.match(summary, /overallRank: formatRank\(row\.overallRank\)/);

  // Entry search preview/result cards and the profile metric.
  assert.match(search, /previewOverallRank: formatRank\(entry\.overallRank\)/);
  assert.match(search, /overallRank: formatRank\(hit\.overallRank\)/);
  assert.match(profile, /overallRankText: formatRank\(entry\.overallRank\)/);
  assert.match(profileView, /\{\{overallRankText \|\| '-'\}\}/);
});

test("non-rank counts keep the k/m compact formatter", () => {
  const team = source("miniprogram/pages/my-fpl/team/team.controller.ts");

  // Season total points are a count, not a rank.
  assert.match(team, /totalPoints: formatCompactNumber\(item\.totalPoints\)/);
});
