import assert from "node:assert/strict";
import test from "node:test";
import { parse, visit } from "graphql";

const {
  LIVE_MATCHES_QUERY,
  liveMatchdayRequestOptions,
  mapGraphQLMatch,
  snapshotFromLiveMatchday,
  validateLiveMatchday,
} =
  await import("../miniprogram/services/live.service.ts");

const ISO = "2026-08-31T12:00:00.000Z";

const matchdayResult = () => ({
  availability: "READY",
  delivery: {
    state: "FRESH",
    servedFrom: "REDIS_CURRENT",
    reasonCodes: ["REDIS_CURRENT"],
  },
  snapshot: {
    season: "2026-27",
    eventId: 3,
    state: "PRE_DEADLINE",
    revisions: {
      deskPublicationId: "desk-1",
      deskGeneration: 1,
      lifecycle: "lifecycle-1",
      fixtureIdentity: "fixture-1",
      scoreState: "score-1",
      detailPublicationId: null,
      detailGeneration: null,
      playerDetail: null,
    },
    times: {
      deskSourceCheckedAt: ISO,
      deskContentUpdatedAt: ISO,
      deskPublishedAt: ISO,
      deskStaleAt: null,
      detailSourceCheckedAt: null,
      detailContentUpdatedAt: null,
      detailPublishedAt: null,
      detailStaleAt: null,
      servedAt: ISO,
      nextRefreshAt: null,
    },
    detailDelivery: {
      state: "PENDING",
      servedFrom: null,
      reasonCodes: ["DETAIL_PENDING"],
    },
    matches: [
      {
        fixtureId: 30,
        eventId: 3,
        homeTeamId: 1,
        homeTeamName: "Home",
        homeTeamShortName: "HOM",
        awayTeamId: 2,
        awayTeamName: "Away",
        awayTeamShortName: "AWY",
        homeScore: null,
        awayScore: null,
        kickoffTime: ISO,
        minutes: 0,
        started: false,
        finished: false,
        finishedProvisional: false,
        players: [],
      },
    ],
  },
});

test("live matchday query is one V2 publication with embedded players", () => {
  assert.match(LIVE_MATCHES_QUERY, /query LiveMatchday\(\$eventId: Int\)/);
  assert.match(LIVE_MATCHES_QUERY, /liveMatchday\(eventId: \$eventId\)/);
  assert.match(LIVE_MATCHES_QUERY, /players\s*\{[\s\S]*stats\s*\{/);
  assert.match(LIVE_MATCHES_QUERY, /homeTeamShortName/);
  assert.match(LIVE_MATCHES_QUERY, /awayTeamShortName/);
  assert.equal((LIVE_MATCHES_QUERY.match(/\bminutes\b/g) || []).length, 1);
  assert.match(LIVE_MATCHES_QUERY, /matches\s*\{[\s\S]*minutes[\s\S]*started/);
  assert.doesNotMatch(LIVE_MATCHES_QUERY, /nextFixtures/);
  assert.doesNotMatch(LIVE_MATCHES_QUERY, /\bnextEventId\b/);
  assert.doesNotMatch(
    LIVE_MATCHES_QUERY,
    /scoreCoreRevision|windowState|dataAvailability|checkpointedAt|\brules\b|\balgorithm\b|\binput\b/,
  );
  assert.doesNotMatch(
    LIVE_MATCHES_QUERY,
    /liveMatchdayDesk|liveFixturePlayers/,
  );
});

test("live matchday uses native Match metadata without fabricated Live Points fields", () => {
  const result = matchdayResult();
  validateLiveMatchday(result);
  const snapshot = snapshotFromLiveMatchday(result);
  assert.equal(snapshot?.availability, "READY");
  assert.equal(snapshot?.revisions.scoreState, "score-1");
  assert.equal(snapshot?.times.deskContentUpdatedAt, ISO);
  assert.equal("scoreCoreRevision" in snapshot, false);
  assert.equal("windowState" in snapshot, false);
  assert.equal("dataAvailability" in snapshot, false);
  assert.equal("nextEventId" in snapshot, false);
});

test("live matchday rejects partial detail vectors and fake unavailable snapshots", () => {
  const partialDetail = matchdayResult();
  partialDetail.snapshot.revisions.detailPublicationId = "detail-1";
  assert.throws(
    () => validateLiveMatchday(partialDetail),
    /LIVE_MATCHDAY_INCOHERENT/,
  );

  const fakeUnavailable = matchdayResult();
  fakeUnavailable.availability = "UNAVAILABLE";
  fakeUnavailable.delivery = {
    state: "UNAVAILABLE",
    servedFrom: null,
    reasonCodes: ["DESK_UNAVAILABLE"],
  };
  assert.throws(
    () => validateLiveMatchday(fakeUnavailable),
    /LIVE_MATCHDAY_INCOHERENT/,
  );
});

test("active-event Match reads cannot enter the cross-request cache", () => {
  assert.deepEqual(liveMatchdayRequestOptions(undefined, false), {
    cachePolicy: "live",
    cacheVariant: "matchday:event:active-pointer",
    cacheTtl: 0,
    staleTtl: 0,
    forceRefresh: false,
    trace: undefined,
  });
  assert.deepEqual(liveMatchdayRequestOptions(3, true), {
    cachePolicy: "live",
    cacheVariant: "matchday:event:3",
    forceRefresh: true,
    trace: undefined,
  });
});

test("live matchday V2 query stays within the public AST budget", () => {
  let astNodes = 0;
  visit(parse(LIVE_MATCHES_QUERY), { enter: () => void (astNodes += 1) });
  assert.ok(astNodes <= 200, `operation has ${astNodes} AST nodes`);
});

test("live tournament board requests official coverage and server ranking", async () => {
  const { ENTRY_LIVE_COMPETITION_BOARD_QUERY } =
    await import("../miniprogram/services/live-board.service.ts");
  assert.match(ENTRY_LIVE_COMPETITION_BOARD_QUERY, /officialCoverage/);
  assert.match(ENTRY_LIVE_COMPETITION_BOARD_QUERY, /unavailableEntryIds/);
  assert.match(ENTRY_LIVE_COMPETITION_BOARD_QUERY, /rows\s*\{[\s\S]*\brank\b/);
});

test("live match mapping carries the authoritative fixture minutes", () => {
  const mapped = mapGraphQLMatch({
    fixtureId: 10,
    eventId: 1,
    homeTeamId: 1,
    homeTeamName: "Home",
    homeTeamShortName: "HOM",
    awayTeamId: 2,
    awayTeamName: "Away",
    awayTeamShortName: null,
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
  assert.equal(mapped.homeTeamShortName, "HOM");
  assert.equal(mapped.awayTeamShortName, "Away");
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
  assert.equal(mapGraphQLMatch(source).provisional, true);
  assert.equal(source.finished, false);
});

test("embedded live players are mapped into the authoritative fixture teams", () => {
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
    players: [
      {
        id: 1,
        webName: "Home Player",
        position: "MIDFIELDER",
        teamId: 1,
        totalPoints: 2,
        stats: [
          {
            identifier: "minutes",
            value: 48,
            points: 2,
            pointsModification: null,
          },
        ],
      },
      {
        id: 2,
        webName: "Away Player",
        position: "FORWARD",
        teamId: 2,
        totalPoints: 1,
        stats: [],
      },
    ],
  });

  assert.equal(match.homeTeamDataList?.length, 1);
  assert.equal(match.awayTeamDataList?.length, 1);
  assert.equal(match.homeTeamDataList?.[0]?.webName, "Home Player");
  assert.equal(match.awayTeamDataList?.[0]?.webName, "Away Player");
  assert.equal(match.homeTeamDataList?.[0]?.minutes, 48);
  assert.equal(match.homeTeamDataList?.[0]?.team, "Home");
  assert.equal(match.homeTeamDataList?.[0]?.teamShortName, "Home");
  assert.deepEqual(match.homeTeamDataList?.[0]?.statPoints, {
    minutes: { points: 2, pointsModification: null },
  });
});

test("embedded live player details retain fixture identity and official stat points", async () => {
  const { buildPlayerLiveDetail } = await import(
    "../miniprogram/pages/live/entry/player-detail.ts"
  );
  const match = mapGraphQLMatch({
    fixtureId: 10,
    eventId: 1,
    homeTeamId: 1,
    homeTeamName: "Home",
    homeTeamShortName: "HOM",
    awayTeamId: 2,
    awayTeamName: "Away",
    awayTeamShortName: "AWY",
    homeScore: 1,
    awayScore: 0,
    kickoffTime: null,
    minutes: 90,
    started: true,
    finished: false,
    finishedProvisional: false,
    players: [
      {
        id: 1,
        webName: "Home Player",
        position: "MIDFIELDER",
        teamId: 1,
        totalPoints: 8,
        stats: [
          {
            identifier: "minutes",
            value: 90,
            points: 2,
            pointsModification: null,
          },
          {
            identifier: "goals",
            value: 1,
            points: 5,
            pointsModification: 1,
          },
        ],
      },
    ],
  });

  const player = match.homeTeamDataList?.[0];
  assert.equal(player?.team, "Home");
  assert.equal(player?.teamShortName, "HOM");
  assert.deepEqual(player?.statPoints?.goals, {
    points: 5,
    pointsModification: 1,
  });
  assert.ok(player);
  const detail = buildPlayerLiveDetail(player);
  assert.equal(detail.team, "Home");
  assert.equal(
    detail.breakdownRows.find((row) => row.label === "进球")?.pointsText,
    "+6",
  );
  assert.equal(detail.breakdownSumText, "+8");
  assert.equal(detail.breakdownHint, "");
});
