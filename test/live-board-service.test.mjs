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
    }
  };
  return { requests, storage };
}

installRuntime();

const auth = await import("../miniprogram/services/auth.service.ts");
const diagnostics = await import(
  "../miniprogram/utils/bug-report-diagnostics.ts"
);
const {
  ENTRY_LIVE_COMPETITION_BOARD_QUERY,
  LIVE_BOARD_CONTRACT_VERSION,
  LiveBoardInvalidResponseError,
  clearAllLiveBoardLastGood,
  clearOtherLiveBoardLastGood,
  getEntryLiveCompetitionBoardPage,
  isLiveBoardSchemaUnavailableError,
  liveBoardLastGoodKey,
  parseLiveBoardPage,
  readLiveBoardLastGood,
  writeLiveBoardLastGood
} = await import("../miniprogram/services/live-board.service.ts");
const {
  GraphQLApplicationError,
  GraphQLTransportError,
  purgeGraphQLStorageCache
} = await import("../miniprogram/services/graphql.service.ts");

const checkedAt = "2026-08-23T12:00:00.000Z";
const nextRefreshAt = "2026-08-23T12:00:30.000Z";

function validScore(overrides = {}) {
  return {
    eventPoints: 38,
    netEventPoints: 34,
    totalPoints: 101,
    totalScope: "OVERALL",
    eventRank: 100,
    overallRank: 1000,
    leagueRank: 3,
    transferCost: 4,
    source: "FPL_ENTRY_SUMMARY",
    state: "LIVE",
    eventPointSemantics: "GROSS",
    revision: "manager-row-r1",
    checkedAt,
    upstreamUpdatedAt: null,
    staleAt: nextRefreshAt,
    nextRefreshAt,
    reconciliation: "MATCH",
    reasonCodes: [],
    ...overrides
  };
}

function validPage(overrides = {}) {
  return {
    season: "2026",
    eventId: 1,
    tournamentId: 7,
    boardRevision: "board-r1",
    playerRevision: "player-r1",
    managerRevision: "manager-r1",
    dataAvailability: "FRESH",
    managerDataAvailability: "FRESH",
    managerServedFrom: "REDIS",
    managerRefreshQueued: false,
    managerCheckedAt: checkedAt,
    managerNextRefreshAt: nextRefreshAt,
    officialCoverage: 1,
    unavailableEntryIds: [],
    failedEntryIds: [],
    partial: false,
    totalEntries: 65,
    filteredEntries: 65,
    page: 1,
    pageSize: 20,
    hasMore: true,
    highestEventPoints: 58,
    averageEventPoints: 34.5,
    rows: [
      {
        entry: 123,
        entryName: "North London",
        playerName: "Mikel",
        rank: 1,
        overallRank: 1000,
        teamValue: 100.5,
        chip: "",
        livePoints: 38,
        transferCost: 4,
        liveNetPoints: 34,
        liveTotalPoints: 101,
        played: 8,
        toPlay: 3,
        captainId: 11,
        captainName: "Saka",
        captainPoints: 12,
        score: validScore()
      }
    ],
    ...overrides
  };
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
      data: { data: { entryLiveCompetitionBoard: page } }
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

test("light board parser requires the additive contract and never requests pickList", () => {
  assert.equal(parseLiveBoardPage(validPage()).boardRevision, "board-r1");
  assert.doesNotMatch(ENTRY_LIVE_COMPETITION_BOARD_QUERY, /pickList/);
  assert.throws(
    () => parseLiveBoardPage(validPage({ managerRevision: undefined })),
    (error) =>
      error instanceof LiveBoardInvalidResponseError &&
      error.code === "LIVE_BOARD_INVALID_RESPONSE" &&
      error.missingFields.includes("managerRevision")
  );
  assert.throws(
    () =>
      parseLiveBoardPage(
        validPage({
          pageSize: 51,
          filteredEntries: 0,
          rows: [validPage().rows[0], validPage().rows[0]]
        })
      ),
    (error) =>
      error instanceof LiveBoardInvalidResponseError &&
      error.missingFields.includes("pageSize:max") &&
      error.missingFields.includes("rows.filteredEntries") &&
      error.missingFields.includes("rows.entry:duplicate")
  );
});

test("last-good cache is strictly scoped and does not expire by wall-clock age", () => {
  const scope = {
    sessionKey: "session-a",
    season: "2026",
    eventId: 1,
    entryId: 123,
    tournamentId: 7
  };
  const key = liveBoardLastGoodKey(scope);
  assert.equal(
    key,
    `${"live-board:last-good:"}${LIVE_BOARD_CONTRACT_VERSION}:session-a:2026:1:123:7`
  );

  assert.equal(writeLiveBoardLastGood(scope, validPage()), true);
  const stored = storage.get(key);
  storage.set(key, { ...stored, savedAt: 1 });
  assert.equal(readLiveBoardLastGood(scope)?.page.boardRevision, "board-r1");

  for (const mismatch of [
    { sessionKey: "session-b" },
    { season: "2025" },
    { eventId: 2 },
    { entryId: 456 },
    { tournamentId: 8 }
  ]) {
    assert.equal(readLiveBoardLastGood({ ...scope, ...mismatch }), null);
  }

  const otherScope = { ...scope, tournamentId: 8 };
  writeLiveBoardLastGood(otherScope, validPage({ tournamentId: 8 }));
  clearOtherLiveBoardLastGood(key);
  assert.equal(storage.has(key), true);
  assert.equal(storage.has(liveBoardLastGoodKey(otherScope)), false);
  clearAllLiveBoardLastGood();
  assert.equal(storage.has(key), false);
});

test("a failed last-good write cannot authorize pruning another scope", () => {
  const currentScope = {
    sessionKey: "session-a",
    season: "2026",
    eventId: 1,
    entryId: 123,
    tournamentId: 7
  };
  assert.equal(writeLiveBoardLastGood(currentScope, validPage()), true);
  const setStorageSync = globalThis.wx.setStorageSync;
  globalThis.wx.setStorageSync = () => {
    throw new Error("storage unavailable");
  };
  const replacementScope = { ...currentScope, tournamentId: 8 };
  const written = writeLiveBoardLastGood(
    replacementScope,
    validPage({ tournamentId: 8 })
  );
  globalThis.wx.setStorageSync = setStorageSync;

  assert.equal(written, false);
  assert.equal(readLiveBoardLastGood(currentScope)?.page.boardRevision, "board-r1");
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
      sleepImpl: async (milliseconds) => void delays.push(milliseconds)
    }
  );

  assert.equal(result.page.rows.length, 1);
  assert.equal(requests.length, 2);
  assert.deepEqual(delays, [600]);
});

test("auth, business, and 429 failures do not auto-retry or use legacy fallback", async () => {
  for (const scenario of [
    {
      response: (options) =>
        options.success({ statusCode: 403, data: { errors: [{ message: "forbidden" }] } })
    },
    {
      response: (options) =>
        options.success({
          statusCode: 200,
          data: {
            errors: [
              { message: "not a member", extensions: { code: "FORBIDDEN" } }
            ]
          }
        })
    },
    {
      response: (options) =>
        options.success({
          statusCode: 429,
          header: { "retry-after": "30" },
          data: { errors: [{ message: "rate limited" }] }
        })
    }
  ]) {
    installRuntime(scenario.response);
    await assert.rejects(
      getEntryLiveCompetitionBoardPage(
        { entryId: 123, tournamentId: 7, eventId: 1 },
        { sleepImpl: async () => assert.fail("must not retry") }
      ),
      (error) => {
        assert.equal(isLiveBoardSchemaUnavailableError(error), false);
        return true;
      }
    );
    assert.equal(requests.length, 1);
  }
});

test("only GraphQL validation or a missing new field enables legacy fallback", () => {
  assert.equal(
    isLiveBoardSchemaUnavailableError(
      new GraphQLApplicationError([
        {
          message: 'Cannot query field "entryLiveCompetitionBoard" on type "Query".',
          extensions: { code: "GRAPHQL_VALIDATION_FAILED" }
        }
      ])
    ),
    true
  );
  assert.equal(
    isLiveBoardSchemaUnavailableError(
      new GraphQLTransportError("数据加载超时，请稍后重试", true)
    ),
    false
  );
});

test("malformed success becomes a stable error and records internal diagnostics", async () => {
  installRuntime(
    graphQLSuccess(validPage({ managerCheckedAt: "not-a-date" }), "request-bad-board")
  );

  await assert.rejects(
    getEntryLiveCompetitionBoardPage({
      entryId: 123,
      tournamentId: 7,
      eventId: 1
    }),
    (error) => {
      assert.equal(error.code, "LIVE_BOARD_INVALID_RESPONSE");
      assert.equal(error.message, "实时赛事响应不完整，请稍后重试");
      assert.equal(error.requestId, "request-bad-board");
      assert.equal(error.missingFields.includes("managerCheckedAt"), true);
      return true;
    }
  );
  assert.equal(requests.length, 1);
  const diagnostic = diagnostics.readBugReportDiagnostics().at(-1);
  assert.equal(diagnostic.requestId, "request-bad-board");
  assert.equal(diagnostic.code, "LIVE_BOARD_INVALID_RESPONSE");
  assert.equal(diagnostic.operation, "GetEntryLiveCompetitionBoard");
  assert.match(diagnostic.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(diagnostic.message, /missing=managerCheckedAt/);
});

test("response identity includes the expected season", async () => {
  installRuntime(graphQLSuccess(validPage({ season: "2025" }), "request-wrong-season"));

  await assert.rejects(
    getEntryLiveCompetitionBoardPage(
      { entryId: 123, tournamentId: 7, eventId: 1 },
      { expectedSeason: "2026" }
    ),
    (error) =>
      error instanceof LiveBoardInvalidResponseError &&
      error.missingFields.includes("season:mismatch") &&
      error.requestId === "request-wrong-season"
  );
});

test("response identity rejects a page from another board revision", async () => {
  installRuntime(
    graphQLSuccess(
      validPage({ page: 2, boardRevision: "board-r2" }),
      "request-wrong-board-revision"
    )
  );

  await assert.rejects(
    getEntryLiveCompetitionBoardPage({
      entryId: 123,
      tournamentId: 7,
      eventId: 1,
      page: 2,
      expectedBoardRevision: "board-r1"
    }),
    (error) =>
      error instanceof LiveBoardInvalidResponseError &&
      error.missingFields.includes("boardRevision:mismatch") &&
      error.requestId === "request-wrong-board-revision"
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
    position: "MID"
  };
  const selectedTeam = {
    id: 1,
    shortName: "ARS",
    name: "Arsenal"
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
      { teamId: 1, teamShortName: "ARS", name: "Arsenal", count: 3 }
    ],
    pendingExposureTeamIndex: 1,
    pendingExposureTeam: selectedTeam
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
      displayedRows: [{ entry: 123 }]
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
    }
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
    rank: index + 1,
    overallRank: 2000 + index
  }));
  installRuntime((options) => {
    const variables = options.data.variables;
    assert.equal(variables.pageSize, 50);
    assert.equal(variables.expectedBoardRevision, "board-r1");
    const start = (variables.page - 1) * variables.pageSize;
    const rows = allRows.slice(start, start + variables.pageSize);
    graphQLSuccess(
      validPage({
        page: variables.page,
        pageSize: variables.pageSize,
        rows,
        hasMore: start + rows.length < allRows.length
      }),
      `share-page-${variables.page}`
    )(options);
  });

  const context = {
    data: {
      ...capturedPage.data,
      entryId: 123,
      event: 1,
      maxGw: 1,
      selectedTournament: { id: 7, name: "League" },
      filteredCount: 65
    },
    loadedSeason: "2026",
    pageVisible: true,
    usingLegacyBoard: false,
    _submittedKeyword: "",
    boardControlRequestId: 1,
    committedBoardControlRequestId: 1,
    boardPage: validPage(),
    shareRows: [{ entry: 123 }],
    currentBoardScope: capturedPage.currentBoardScope,
    buildBoardVariables: capturedPage.buildBoardVariables
  };

  const rows = await capturedPage.collectBoardShareRows.call(context);

  assert.equal(rows.length, 65);
  assert.deepEqual(requests.map((request) => request.data.variables.page), [1, 2]);
  assert.equal(rows[0].visibleRank, 1);
  assert.equal(rows[64].visibleRank, 65);
});

test("sharing stops when board controls change between page requests", async () => {
  const capturedPage = await getTournamentPageDefinition();
  let context;
  installRuntime((options) => {
    context.boardControlRequestId += 1;
    graphQLSuccess(
      validPage({
        page: options.data.variables.page,
        pageSize: 50,
        hasMore: true
      }),
      "share-stale-controls"
    )(options);
  });
  context = {
    data: {
      ...capturedPage.data,
      entryId: 123,
      event: 1,
      maxGw: 1,
      selectedTournament: { id: 7, name: "League" },
      filteredCount: 65
    },
    loadedSeason: "2026",
    pageVisible: true,
    usingLegacyBoard: false,
    _submittedKeyword: "",
    boardControlRequestId: 1,
    committedBoardControlRequestId: 1,
    boardPage: validPage(),
    shareRows: [{ entry: 123 }],
    currentBoardScope: capturedPage.currentBoardScope,
    buildBoardVariables: capturedPage.buildBoardVariables
  };

  await assert.rejects(
    capturedPage.collectBoardShareRows.call(context),
    /榜单已更新，请重新分享/
  );
  assert.equal(requests.length, 1);
});
