import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Tournament directory has one GraphQL operation and one season-aware read", () => {
  const service = source("miniprogram/services/tournament.service.ts");
  assert.equal((service.match(/query EntryTournaments/g) || []).length, 1);
  assert.equal((service.match(/graphqlRead<EntryTournamentsResponse>/g) || []).length, 1);
  assert.match(service, /readEntryTournamentDirectory[\s\S]*cacheVariant: `season:\$\{season\}`/);
  assert.equal((service.match(/(?:return|await) readDirectory\(entry/g) || []).length, 4);
  assert.match(service, /getEntryPointsRaceTournament[\s\S]*const rows = await readDirectory/);
  assert.match(service, /getEntrySummaryTournaments[\s\S]*const rows = await readDirectory/);
  const directoryRead = service.indexOf("const result = await graphqlRead<EntryTournamentsResponse>");
  const partialGuard = service.indexOf("if (result.errors.length > 0)", directoryRead);
  const mapping = service.indexOf("result.data.entryTournaments || []", directoryRead);
  assert.ok(directoryRead >= 0 && partialGuard > directoryRead && mapping > partialGuard);
  assert.match(service, /async function readDirectory[\s\S]*if \(!season\)[\s\S]*ensureAppContext\([\s\S]*forceRefresh: true/);
});

test("Live Tournament skips live rows for empty metadata or no current event", () => {
  const page = source("miniprogram/pages/live/tournament/tournament.ts");
  const guard = page.indexOf("selectedTournament.participantCount === 0 || this.data.event <= 0");
  const rows = page.indexOf("await this.loadRows", guard);
  assert.ok(guard >= 0 && rows > guard);
  const branch = page.slice(guard, rows);
  assert.match(branch, /this\.liveRefresh\?\.stop\(\)/);
  assert.match(branch, /return;/);
});

test("EntryLeagues operation exists only in the entry service", () => {
  const entry = source("miniprogram/services/entry.service.ts");
  const common = source("miniprogram/services/common.service.ts");
  assert.equal((entry.match(/query EntryLeagues/g) || []).length, 1);
  assert.doesNotMatch(common, /query EntryLeagues/);
  assert.match(common, /getEntryLeagueInfo\(entryId\)/);
});
