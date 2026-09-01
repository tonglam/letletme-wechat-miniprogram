import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

const storage = new Map();
let requestHandler = () => {
  throw new Error("unexpected GraphQL request");
};
let requests = [];
let tournamentPageDefinition;

function installRuntime(handler = requestHandler) {
  requests = [];
  requestHandler = handler;
  globalThis.getApp = () => ({ globalData: { season: "2026", gw: 1 } });
  globalThis.wx = {
    canIUse: () => false,
    getAccountInfoSync: () => ({ miniProgram: { envVersion: "trial" } }),
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    showToast: () => undefined,
    request: (options) => {
      requests.push(options);
      requestHandler(options);
    },
  };
  return { requests, storage };
}

installRuntime();

const auth = await import("../miniprogram/services/auth.service.ts");
const diagnostics =
  await import("../miniprogram/utils/bug-report-diagnostics.ts");
const {
  ENTRY_LIVE_COMPETITION_BOARD_QUERY,
  LIVE_BOARD_CONTRACT_VERSION,
  LiveBoardInvalidResponseError,
  clearAllLiveBoardLastGood,
  getEntryLiveCompetitionBoardPage,
  isCompleteLiveBoardPage,
  liveBoardLastGoodKey,
  parseLiveBoardPage,
  readLiveBoardLastGood,
  writeLiveBoardLastGood,
} = await import("../miniprogram/services/live-board.service.ts");
const { GraphQLApplicationError, purgeGraphQLStorageCache } =
  await import("../miniprogram/services/graphql.service.ts");

const checkedAt = "2026-08-23T12:00:00.000Z";
const nextRefreshAt = "2026-08-23T12:00:30.000Z";

function validRevisions(overrides = {}) {
  return {
    publicationId: "publication-1",
    generation: 1,
    lifecycle: "lifecycle-r1",
    fixtureIdentity: "fixture-r1",
    scoreCore: "score-r1",
    displayStats: "display-r1",
    explain: "explain-r1",
    picksBase: "picks-r1",
    officialAdjustment: null,
    previousTotals: "totals-r1",
    finalResult: null,
    rules: "rules-r1",
    algorithm: "live-points-v2-algorithm-1",
    content: "content-r1",
    input: "input-r1",
    ...overrides,
  };
}

function validTimes(overrides = {}) {
  return {
    sourceCheckedAt: checkedAt,
    contentUpdatedAt: checkedAt,
    publishedAt: checkedAt,
    checkpointedAt: null,
    servedAt: checkedAt,
    staleAt: nextRefreshAt,
    nextRefreshAt,
    ...overrides,
  };
}

function validDelivery(overrides = {}) {
  return {
    state: "FRESH",
    servedFrom: "REDIS_CURRENT",
    reasonCodes: [],
    ...overrides,
  };
}

function validScore(overrides = {}) {
  return {
    eventPoints: 38,
    netEventPoints: 34,
    totalPoints: 101,
    totalScope: "OVERALL",
    transferCost: 4,
    source: "FPL_EVENT_LIVE",
    calculationMode: "PROJECTED_AUTOSUBS",
    revisions: validRevisions(),
    times: validTimes(),
    delivery: validDelivery(),
    ...overrides,
  };
}

function validPage(overrides = {}) {
  const base = {
    head: {
      season: "2026",
      eventId: 1,
      tournamentId: 7,
      mode: "CLASSIC",
      availability: "READY",
      contentRevision: "content-r1",
      publication: {
        revisions: validRevisions(),
        times: validTimes(),
      },
      delivery: validDelivery(),
      nextRefreshAt,
    },
    totalEntries: 65,
    filteredEntries: 65,
    pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
    highestEventPoints: 58,
    averageEventPoints: 34.5,
    rows: [
      {
        availability: "READY",
        entry: 123,
        entryName: "North London",
        playerName: "Mikel",
        liveRank: 1,
        overallRank: 1000,
        teamValue: 100.5,
        chip: null,
        transferCost: 4,
        played: 8,
        toPlay: 3,
        captainId: 11,
        captainName: "Saka",
        captainPoints: 12,
        score: validScore(),
      },
    ],
    viewerRow: null,
    ...overrides,
  };
  const overrideHead = overrides.head || {};
  const head = {
    ...base.head,
    ...overrideHead,
    season: overrides.season || overrideHead.season || base.head.season,
    eventId: overrides.eventId || overrideHead.eventId || base.head.eventId,
    tournamentId:
      overrides.tournamentId ||
      overrideHead.tournamentId ||
      base.head.tournamentId,
    publication:
      overrideHead.publication === null
        ? null
        : {
            ...base.head.publication,
            ...(overrideHead.publication || {}),
          },
  };
  return { ...base, head };
}

async function restoreSession() {
  auth.clearSessionCredentials();
  storage.set("api-session-token", "live-board-session-token");
  storage.set("api-session-expires-at", "2099-01-01T00:00:00.000Z");
  await auth.restoreApiSessionCredentials();
}

function graphQLSuccess(page = validPage(), requestId = "request-live-board") {
  return (options) =>
    options.success({
      statusCode: 200,
      header: { "x-request-id": requestId },
      data: { data: { entryLiveCompetitionBoard: page } },
    });
}

async function getTournamentPageDefinition() {
  if (!tournamentPageDefinition) {
    globalThis.Page = (definition) => {
      tournamentPageDefinition = definition;
    };
    await import("../miniprogram/pages/live/tournament/tournament.controller.ts");
  }
  return tournamentPageDefinition;
}

beforeEach(async () => {
  storage.clear();
  installRuntime();
  diagnostics.resetBugReportDiagnosticsForTests();
  purgeGraphQLStorageCache();
  await restoreSession();
});

test("light board parser requires the complete V2 contract and never requests pickList", () => {
  assert.equal(
    parseLiveBoardPage(validPage()).head.contentRevision,
    "content-r1",
  );
  assert.doesNotMatch(ENTRY_LIVE_COMPETITION_BOARD_QUERY, /pickList/);
  assert.throws(
    () =>
      parseLiveBoardPage(
        validPage({ head: { ...validPage().head, publication: null } }),
      ),
    (error) =>
      error instanceof LiveBoardInvalidResponseError &&
      error.code === "LIVE_BOARD_INVALID_RESPONSE" &&
      error.missingFields.includes("head.publication"),
  );
  assert.throws(
    () =>
      parseLiveBoardPage(
        validPage({
          filteredEntries: 1,
          rows: Array.from({ length: 51 }, (_, index) => ({
            ...validPage().rows[0],
            entry: index + 1,
          })),
        }),
      ),
    (error) =>
      error instanceof LiveBoardInvalidResponseError &&
      error.missingFields.includes("rows:max"),
  );
});

test("only a complete publication can replace an existing board", () => {
  const page = parseLiveBoardPage(validPage());
  assert.equal(isCompleteLiveBoardPage(page), true);
  assert.equal(
    isCompleteLiveBoardPage({
      ...page,
      head: { ...page.head, availability: "PENDING" },
    }),
    false,
  );
  assert.equal(
    isCompleteLiveBoardPage({
      ...page,
      rows: [{ ...page.rows[0], availability: "ERROR", score: null }],
    }),
    false,
  );
  assert.equal(
    isCompleteLiveBoardPage({
      ...page,
      rows: [{ ...page.rows[0], availability: "MISSING", score: null }],
    }),
    true,
  );
});

test("last-good cache is strictly scoped and does not expire by wall-clock age", () => {
  const scope = {
    sessionKey: "session-a",
    season: "2026",
    eventId: 1,
    entryId: 123,
    tournamentId: 7,
  };
  const key = liveBoardLastGoodKey(scope);
  assert.equal(
    key,
    `${"live-board:last-good:"}${LIVE_BOARD_CONTRACT_VERSION}:session-a:2026:1:123:7`,
  );

  assert.equal(writeLiveBoardLastGood(scope, validPage()), true);
  const stored = storage.get(key);
  storage.set(key, { ...stored, savedAt: 1 });
  assert.equal(
    readLiveBoardLastGood(scope)?.page.head.contentRevision,
    "content-r1",
  );

  for (const mismatch of [
    { sessionKey: "session-b" },
    { season: "2025" },
    { eventId: 2 },
    { entryId: 456 },
    { tournamentId: 8 },
  ]) {
    assert.equal(readLiveBoardLastGood({ ...scope, ...mismatch }), null);
  }

  const otherScope = { ...scope, tournamentId: 8 };
  writeLiveBoardLastGood(otherScope, validPage({ tournamentId: 8 }));
  assert.equal(storage.has(key), true);
  assert.equal(storage.has(liveBoardLastGoodKey(otherScope)), true);
  clearAllLiveBoardLastGood();
  assert.equal(storage.has(key), false);
});

test("a failed last-good write cannot authorize pruning another scope", () => {
  const currentScope = {
    sessionKey: "session-a",
    season: "2026",
    eventId: 1,
    entryId: 123,
    tournamentId: 7,
  };
  assert.equal(writeLiveBoardLastGood(currentScope, validPage()), true);
  const setStorageSync = globalThis.wx.setStorageSync;
  globalThis.wx.setStorageSync = () => {
    throw new Error("storage unavailable");
  };
  const replacementScope = { ...currentScope, tournamentId: 8 };
  const written = writeLiveBoardLastGood(
    replacementScope,
    validPage({ tournamentId: 8 }),
  );
  globalThis.wx.setStorageSync = setStorageSync;

  assert.equal(written, false);
  assert.equal(
    readLiveBoardLastGood(currentScope)?.page.head.contentRevision,
    "content-r1",
  );
});

test("one transient failure retries once after a 400-800ms jitter", async () => {
  const delays = [];
  let attempt = 0;
  installRuntime((options) => {
    attempt += 1;
    if (attempt === 1) {
      options.fail({ errMsg: "request:fail timeout" });
      return;
    }
    graphQLSuccess()(options);
  });

  const result = await getEntryLiveCompetitionBoardPage(
    { entryId: 123, tournamentId: 7, eventId: 1 },
    {
      random: () => 0.5,
      sleepImpl: async (milliseconds) => void delays.push(milliseconds),
    },
  );

  assert.equal(result.page.rows.length, 1);
  assert.equal(requests.length, 2);
  assert.deepEqual(delays, [600]);
});

test("auth, business, and 429 failures do not auto-retry or use fallback", async () => {
  for (const scenario of [
    {
      response: (options) =>
        options.success({
          statusCode: 403,
          data: { errors: [{ message: "forbidden" }] },
        }),
    },
    {
      response: (options) =>
        options.success({
          statusCode: 200,
          data: {
            errors: [
              { message: "not a member", extensions: { code: "FORBIDDEN" } },
            ],
          },
        }),
    },
    {
      response: (options) =>
        options.success({
          statusCode: 429,
          header: { "retry-after": "30" },
          data: { errors: [{ message: "rate limited" }] },
        }),
    },
  ]) {
    installRuntime(scenario.response);
    await assert.rejects(
      getEntryLiveCompetitionBoardPage(
        { entryId: 123, tournamentId: 7, eventId: 1 },
        { sleepImpl: async () => assert.fail("must not retry") },
      ),
      (error) => {
        assert.ok(error);
        return true;
      },
    );
    assert.equal(requests.length, 1);
  }
});

test("canonical board validation errors are surfaced without a legacy reader", async () => {
  installRuntime((options) =>
    options.success({
      statusCode: 200,
      data: {
        errors: [
          {
            message:
              'Cannot query field "entryLiveCompetitionBoard" on type "Query".',
            extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
          },
        ],
      },
    }),
  );
  await assert.rejects(
    getEntryLiveCompetitionBoardPage({
      entryId: 123,
      tournamentId: 7,
      eventId: 1,
    }),
    GraphQLApplicationError,
  );
});

test("malformed V2 success becomes a stable error and records internal diagnostics", async () => {
  installRuntime(
    graphQLSuccess(
      validPage({
        head: {
          ...validPage().head,
          publication: {
            ...validPage().head.publication,
            times: validTimes({ sourceCheckedAt: "not-a-date" }),
          },
        },
      }),
      "request-bad-board",
    ),
  );

  await assert.rejects(
    getEntryLiveCompetitionBoardPage({
      entryId: 123,
      tournamentId: 7,
      eventId: 1,
    }),
    (error) => {
      assert.equal(error.code, "LIVE_BOARD_INVALID_RESPONSE");
      assert.equal(error.message, "实时赛事响应不完整，请稍后重试");
      assert.equal(error.requestId, "request-bad-board");
      assert.equal(
        error.missingFields.includes("head.publication.times.sourceCheckedAt"),
        true,
      );
      return true;
    },
  );
  assert.equal(requests.length, 1);
  const diagnostic = diagnostics.readBugReportDiagnostics().at(-1);
  assert.equal(diagnostic.requestId, "request-bad-board");
  assert.equal(diagnostic.code, "LIVE_BOARD_INVALID_RESPONSE");
  assert.equal(diagnostic.operation, "GetEntryLiveCompetitionBoard");
  assert.match(diagnostic.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(
    diagnostic.message,
    /missing=head.publication.times.sourceCheckedAt/,
  );
});

test("response identity includes the expected season", async () => {
  installRuntime(
    graphQLSuccess(
      validPage({ head: { ...validPage().head, season: "2025" } }),
      "request-wrong-season",
    ),
  );

  await assert.rejects(
    getEntryLiveCompetitionBoardPage(
      { entryId: 123, tournamentId: 7, eventId: 1 },
      { expectedSeason: "2026" },
    ),
    (error) =>
      error instanceof LiveBoardInvalidResponseError &&
      error.missingFields.includes("head.season:mismatch") &&
      error.requestId === "request-wrong-season",
  );
});

test("response identity rejects a page from another event", async () => {
  installRuntime(
    graphQLSuccess(
      validPage({ head: { ...validPage().head, eventId: 2 } }),
      "request-wrong-event",
    ),
  );

  await assert.rejects(
    getEntryLiveCompetitionBoardPage({
      entryId: 123,
      tournamentId: 7,
      eventId: 1,
    }),
    (error) =>
      error instanceof LiveBoardInvalidResponseError &&
      error.missingFields.includes("head.eventId:mismatch") &&
      error.requestId === "request-wrong-event",
  );
});

test("failed server filter restores the last committed controls and rows", async () => {
  const capturedPage = await getTournamentPageDefinition();
  const selectedPlayer = {
    element: 11,
    name: "Saka",
    meta: "ARS · MID",
    teamShortName: "ARS",
    teamName: "Arsenal",
    position: "MID",
  };
  const selectedTeam = {
    id: 1,
    shortName: "ARS",
    name: "Arsenal",
  };
  const committed = {
    submittedKeyword: "",
    keyword: "",
    sortKey: "livePoints",
    sortDesc: true,
    chipFilters: ["BB"],
    captainFilters: [11],
    ownershipScope: "any",
    ownershipCaptainMode: "any",
    selectedOwnershipPlayers: [selectedPlayer],
    selectedOwnershipTeamIndex: 1,
    selectedOwnershipTeam: selectedTeam,
    selectedOwnershipPositionIndex: 2,
    selectedOwnershipPosition: "MID",
    ownershipAvailablePlayers: [selectedPlayer],
    ownershipAvailablePlayerNames: ["Saka"],
    ownershipSearch: "sak",
    ownershipSearchResults: [selectedPlayer],
    teamExposureScope: "any",
    teamExposureRules: [
      { teamId: 1, teamShortName: "ARS", name: "Arsenal", count: 3 },
    ],
    pendingExposureTeamIndex: 1,
    pendingExposureTeam: selectedTeam,
  };
  const context = {
    data: {
      ...capturedPage.data,
      hasData: true,
      sortKey: "totalPoints",
      chipFilters: [],
      captainFilters: [],
      selectedOwnershipPlayers: [],
      selectedOwnershipTeam: null,
      selectedOwnershipPosition: "",
      teamExposureRules: [],
      pendingExposureTeam: null,
      activeFilterCount: 0,
      filteredCount: 12,
      rowCount: 98,
      displayedRows: [{ entry: 123 }],
    },
    ownershipPlayers: [selectedPlayer],
    boardControlRequestId: 0,
    committedBoardControls: committed,
    _submittedKeyword: "",
    loadRows: async () => {
      throw new Error("gateway unavailable");
    },
    restoreCommittedBoardControls: capturedPage.restoreCommittedBoardControls,
    setData(update) {
      Object.assign(this.data, update);
    },
  };

  await capturedPage.reloadBoardControls.call(context);

  assert.equal(context.data.sortKey, "livePoints");
  assert.deepEqual(context.data.chipFilters, ["BB"]);
  assert.deepEqual(context.data.captainFilters, [11]);
  assert.deepEqual(context.data.selectedOwnershipPlayers, [selectedPlayer]);
  assert.deepEqual(context.data.selectedOwnershipTeam, selectedTeam);
  assert.equal(context.data.selectedOwnershipPosition, "MID");
  assert.deepEqual(context.data.teamExposureRules, committed.teamExposureRules);
  assert.deepEqual(context.data.pendingExposureTeam, selectedTeam);
  assert.equal(context.data.activeFilterCount, 4);
  assert.equal(context.data.ownershipMatchedText, " · 匹配 12/98");
  assert.equal(context.data.teamExposureMatchedText, " · 匹配 12/98");
  assert.equal(context.data.ownershipSummary, "Saka");
  assert.equal(context.data.teamExposureSummary, "Arsenal恰好3人");
  assert.deepEqual(context.data.displayedRows, [{ entry: 123 }]);
  assert.equal(context.data.errorSuffix, "当前筛选和榜单保持不变");
});

test("sharing lazily reads every lightweight page with one locked revision", async () => {
  const capturedPage = await getTournamentPageDefinition();
  const allRows = Array.from({ length: 65 }, (_, index) => ({
    ...validPage().rows[0],
    entry: 1000 + index,
    entryName: `Team ${index + 1}`,
    liveRank: index + 1,
    overallRank: 2000 + index,
  }));
  installRuntime((options) => {
    const variables = options.data.variables;
    const input = variables.input;
    assert.equal(input.first, 50);
    assert.equal(input.after === null || typeof input.after === "string", true);
    const start = input.after === null ? 0 : 50;
    const rows = allRows.slice(start, start + input.first);
    const base = validPage();
    graphQLSuccess(
      validPage({
        head: base.head,
        totalEntries: allRows.length,
        filteredEntries: allRows.length,
        rows,
        pageInfo: {
          hasNextPage: start + rows.length < allRows.length,
          endCursor: start + rows.length < allRows.length ? "cursor-50" : null,
        },
      }),
      `share-page-${start}`,
    )(options);
  });

  const context = {
    data: {
      ...capturedPage.data,
      entryId: 123,
      event: 1,
      maxGw: 1,
      selectedTournament: { id: 7, name: "League" },
      filteredCount: 65,
    },
    loadedSeason: "2026",
    pageVisible: true,
    _submittedKeyword: "",
    boardControlRequestId: 1,
    committedBoardControlRequestId: 1,
    boardPage: validPage(),
    shareRows: [{ entry: 123 }],
    currentBoardScope: () => ({
      sessionKey: "session",
      season: "2026",
      eventId: 1,
      entryId: 123,
      tournamentId: 7,
    }),
    buildBoardVariables: (after = null) => ({
      entryId: 123,
      tournamentId: 7,
      eventId: 1,
      input: {
        first: 20,
        after,
        sort: "EVENT_POINTS",
        direction: "DESC",
        search: null,
        chips: [],
        captainPlayerIds: [],
        ownership: null,
        teamCountRules: [],
      },
    }),
  };

  const rows = await capturedPage.collectBoardShareRows.call(context);

  assert.equal(rows.length, 65);
  assert.deepEqual(
    requests.map((request) => request.data.variables.input.after),
    [null, "cursor-50"],
  );
  assert.equal(rows[0].visibleRank, 1);
  assert.equal(rows[64].visibleRank, 65);
});

test("sharing stops when board controls change between page requests", async () => {
  const capturedPage = await getTournamentPageDefinition();
  let context;
  installRuntime((options) => {
    context.boardControlRequestId += 1;
    const after = options.data.variables.input.after;
    graphQLSuccess(
      validPage({
        pageInfo: {
          hasNextPage: true,
          endCursor: after ? "cursor-next" : "cursor-50",
        },
      }),
      "share-stale-controls",
    )(options);
  });
  context = {
    data: {
      ...capturedPage.data,
      entryId: 123,
      event: 1,
      maxGw: 1,
      selectedTournament: { id: 7, name: "League" },
      filteredCount: 65,
    },
    loadedSeason: "2026",
    pageVisible: true,
    _submittedKeyword: "",
    boardControlRequestId: 1,
    committedBoardControlRequestId: 1,
    boardPage: validPage(),
    shareRows: [{ entry: 123 }],
    currentBoardScope: () => ({
      sessionKey: "session",
      season: "2026",
      eventId: 1,
      entryId: 123,
      tournamentId: 7,
    }),
    buildBoardVariables: (after = null) => ({
      entryId: 123,
      tournamentId: 7,
      eventId: 1,
      input: {
        first: 20,
        after,
        sort: "EVENT_POINTS",
        direction: "DESC",
        search: null,
        chips: [],
        captainPlayerIds: [],
        ownership: null,
        teamCountRules: [],
      },
    }),
  };

  await assert.rejects(
    capturedPage.collectBoardShareRows.call(context),
    /榜单已更新，请重新分享/,
  );
  assert.equal(requests.length, 1);
});
