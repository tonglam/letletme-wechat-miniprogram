import assert from "node:assert/strict";
import test from "node:test";

const {
  buildLiveFixturePlayersQuery,
  LIVE_MATCHES_QUERY,
  mapGraphQLMatch,
  mergeLiveFixturePlayers,
} = await import("../miniprogram/services/live.service.ts");

test("live matchday query uses only the published match summary fields", () => {
  assert.equal(
    (LIVE_MATCHES_QUERY.match(/homeTeamShortName/g) || []).length,
    0,
  );
  assert.equal(
    (LIVE_MATCHES_QUERY.match(/awayTeamShortName/g) || []).length,
    0,
  );
  assert.equal((LIVE_MATCHES_QUERY.match(/\bminutes\b/g) || []).length, 2);
  assert.match(LIVE_MATCHES_QUERY, /matches\s*\{[\s\S]*minutes[\s\S]*started/);
  assert.match(
    LIVE_MATCHES_QUERY,
    /nextFixtures\s*\{[\s\S]*minutes[\s\S]*started/,
  );
});

test("live fixture player batches use the published player detail fields", () => {
  const query = buildLiveFixturePlayersQuery(5);

  assert.equal((query.match(/liveFixturePlayers/g) || []).length, 5);
  assert.doesNotMatch(query, /\bavailability\b/);
  assert.doesNotMatch(query, /\bbonusProvisional\b/);
  assert.match(query, /players\s*\{/);
});

test("live tournament desk requests official coverage and server ranking", async () => {
  const { TOURNAMENT_LIVE_POINTS } =
    await import("../miniprogram/services/live.service.ts");
  assert.match(TOURNAMENT_LIVE_POINTS, /officialCoverage/);
  assert.match(TOURNAMENT_LIVE_POINTS, /unavailableEntryIds/);
  assert.match(TOURNAMENT_LIVE_POINTS, /board\s*\{[\s\S]*\brank\b/);
});

test("live match mapping carries the authoritative fixture minutes", () => {
  const mapped = mapGraphQLMatch({
    fixtureId: 10,
    eventId: 1,
    homeTeamId: 1,
    homeTeamName: "Home",
    awayTeamId: 2,
    awayTeamName: "Away",
    homeScore: 2,
    awayScore: 0,
    kickoffTime: "2026-08-21T19:00:00.000Z",
    minutes: 48,
    started: true,
    finished: false,
    finishedProvisional: false,
  });

  assert.equal(mapped.minutes, 48);
  assert.equal(mapped.playStatus, "playing");
  assert.equal("homeTeamShortName" in mapped, false);
  assert.equal("awayTeamShortName" in mapped, false);
});

test("live match mapping presents provisional completion without mutating the contract", () => {
  const source = {
    fixtureId: 10,
    eventId: 1,
    homeTeamId: 1,
    homeTeamName: "Home",
    awayTeamId: 2,
    awayTeamName: "Away",
    homeScore: 2,
    awayScore: 0,
    kickoffTime: "2026-08-21T19:00:00.000Z",
    minutes: 90,
    started: true,
    finished: false,
    finishedProvisional: true,
  };

  assert.equal(mapGraphQLMatch(source).playStatus, "finished");
  assert.equal(source.finished, false);
});

function performance(playerId, teamId, teamName, teamShortName) {
  return {
    player: {
      id: playerId,
      webName: `Player ${playerId}`,
      position: "MIDFIELDER",
      team: { id: teamId, name: teamName, shortName: teamShortName },
    },
    minutes: 48,
    goalsScored: 0,
    assists: 0,
    cleanSheets: 0,
    goalsConceded: 0,
    ownGoals: 0,
    penaltiesSaved: 0,
    penaltiesMissed: 0,
    yellowCards: 0,
    redCards: 0,
    saves: 0,
    bonus: 0,
    bps: 10,
    defensiveContribution: 0,
    totalPoints: 2,
  };
}

test("live fixture players are merged by team after revision validation", () => {
  const ref = { season: "2627", eventId: 1, revision: "88" };
  const match = mapGraphQLMatch({
    fixtureId: 10,
    eventId: 1,
    homeTeamId: 1,
    homeTeamName: "Home",
    awayTeamId: 2,
    awayTeamName: "Away",
    homeScore: 1,
    awayScore: 0,
    kickoffTime: null,
    minutes: 48,
    started: true,
    finished: false,
    finishedProvisional: false,
  });
  const detail = {
    ...ref,
    fixtureId: 10,
    players: [
      performance(1, 1, "Home", "HOM"),
      performance(2, 2, "Away", "AWY"),
    ],
  };

  const [merged] = mergeLiveFixturePlayers(
    [match],
    new Map([[10, detail]]),
    ref,
  );

  assert.equal(merged?.homeTeamDataList?.length, 1);
  assert.equal(merged?.awayTeamDataList?.length, 1);
  assert.equal(merged?.homeTeamDataList?.[0]?.teamShortName, "HOM");
  assert.equal(merged?.awayTeamDataList?.[0]?.teamShortName, "AWY");
});

test("live fixture players ignore a stale revision without erasing the desk", () => {
  const ref = { season: "2627", eventId: 1, revision: "88" };
  const match = mapGraphQLMatch({
    fixtureId: 10,
    eventId: 1,
    homeTeamId: 1,
    homeTeamName: "Home",
    awayTeamId: 2,
    awayTeamName: "Away",
    homeScore: 1,
    awayScore: 0,
    kickoffTime: null,
    minutes: 48,
    started: true,
    finished: false,
    finishedProvisional: false,
  });
  const stale = {
    season: "2627",
    eventId: 1,
    revision: "87",
    fixtureId: 10,
    players: [performance(1, 1, "Home", "HOM")],
  };

  const [merged] = mergeLiveFixturePlayers(
    [match],
    new Map([[10, stale]]),
    ref,
  );

  assert.deepEqual(merged, match);
});
