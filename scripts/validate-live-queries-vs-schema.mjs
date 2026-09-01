import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSchema, Kind, parse, validate, visit } from "graphql";

const {
  CALC_LIVE_POINTS_BY_ENTRY,
  LIVE_MATCHDAY_HEAD_QUERY,
  LIVE_MATCHES_QUERY,
  LIVE_SNAPSHOT_QUERY,
  PLAYER_LIVE_STATS_QUERY,
} = await import("../miniprogram/services/live.service.ts");
const {
  MINI_HOME_DREAM_TEAM_QUERY,
  MINI_HOME_MARKET_QUERY,
  MINI_HOME_PERSONAL_LEAGUES_QUERY,
} =
  await import("../miniprogram/services/home.service.ts");
const {
  EVENT_DREAM_TEAM_QUERY,
  EVENT_ELITE_ELEMENTS_QUERY,
  EVENT_OVERALL_TRANSFERS_QUERY,
} = await import("../miniprogram/services/summary.service.ts");
const {
  PRICE_CHANGE_BOARD_QUERY,
  PRICE_CHANGE_LIVE_BOARD_QUERY,
  PRICE_CHANGE_LIVE_CURSOR_QUERY,
  PRICE_CHANGE_PERSONAL_QUERY,
  PRICE_CHANGE_START_PRICES_QUERY,
} = await import("../miniprogram/services/price-change.service.ts");
const {
  GET_MY_FPL_COMPETITIONS_DESK,
  GET_MY_FPL_COMPETITION_BOARD,
  GET_MY_FPL_COMPETITION_SEASON_PATH,
  GET_ENTRY_TOURNAMENTS,
  GET_MY_TOURNAMENT_GAMEWEEK_REVIEW,
  GET_MY_TOURNAMENT_REVIEW_CATALOG,
  GET_MY_TOURNAMENT_SEASON_REVIEW,
} = await import("../miniprogram/services/tournament.service.ts");
const {
  GET_TOURNAMENT_DETAIL_DESK,
  GET_TOURNAMENT_OFFICIAL_H2H,
  GET_TOURNAMENT_OFFICIAL_H2H_HISTORY,
} = await import("../miniprogram/services/tournament-detail.service.ts");
const {
  ENTRY_LIVE_COMPETITION_BOARD_QUERY,
  LEAGUE_LIVE_HEAD_QUERY,
  TOURNAMENT_ENTRY_SQUADS_QUERY,
  TOURNAMENT_SELECTION_INDEX_QUERY,
} = await import("../miniprogram/services/live-board.service.ts");
const { ENTRY_LOOKUP_QUERY } =
  await import("../miniprogram/services/entry.service.ts");
const { PLAYER_DETAIL } =
  await import("../miniprogram/services/player.service.ts");
const {
  LIVE_MATCHES_CONTRACT_VERSION,
  LIVE_POINTS_CONTRACT_VERSION,
  liveContractVersionForQuery,
} = await import("../miniprogram/services/graphql.service.ts");

const schemaModulePath = process.env.GRAPHQL_SCHEMA_MODULE?.trim();

if (!schemaModulePath) {
  throw new Error("GRAPHQL_SCHEMA_MODULE is required");
}

const operations = [
  ["LIVE_SNAPSHOT_QUERY", LIVE_SNAPSHOT_QUERY],
  ["CALC_LIVE_POINTS_BY_ENTRY", CALC_LIVE_POINTS_BY_ENTRY],
  ["LIVE_MATCHES_QUERY", LIVE_MATCHES_QUERY],
  ["LIVE_MATCHDAY_HEAD_QUERY", LIVE_MATCHDAY_HEAD_QUERY],
  ["PLAYER_LIVE_STATS_QUERY", PLAYER_LIVE_STATS_QUERY],
  ["MINI_HOME_PERSONAL_LEAGUES_QUERY", MINI_HOME_PERSONAL_LEAGUES_QUERY],
  ["MINI_HOME_MARKET_QUERY", MINI_HOME_MARKET_QUERY],
  ["MINI_HOME_DREAM_TEAM_QUERY", MINI_HOME_DREAM_TEAM_QUERY],
  ["EVENT_DREAM_TEAM_QUERY", EVENT_DREAM_TEAM_QUERY],
  ["EVENT_ELITE_ELEMENTS_QUERY", EVENT_ELITE_ELEMENTS_QUERY],
  ["EVENT_OVERALL_TRANSFERS_QUERY", EVENT_OVERALL_TRANSFERS_QUERY],
  ["PRICE_CHANGE_BOARD_QUERY", PRICE_CHANGE_BOARD_QUERY],
  ["PRICE_CHANGE_LIVE_CURSOR_QUERY", PRICE_CHANGE_LIVE_CURSOR_QUERY],
  ["PRICE_CHANGE_LIVE_BOARD_QUERY", PRICE_CHANGE_LIVE_BOARD_QUERY],
  ["PRICE_CHANGE_PERSONAL_QUERY", PRICE_CHANGE_PERSONAL_QUERY],
  ["PRICE_CHANGE_START_PRICES_QUERY", PRICE_CHANGE_START_PRICES_QUERY],
  ["GET_MY_FPL_COMPETITIONS_DESK", GET_MY_FPL_COMPETITIONS_DESK],
  ["GET_MY_FPL_COMPETITION_BOARD", GET_MY_FPL_COMPETITION_BOARD],
  ["GET_MY_FPL_COMPETITION_SEASON_PATH", GET_MY_FPL_COMPETITION_SEASON_PATH],
  ["GET_TOURNAMENT_DETAIL_DESK", GET_TOURNAMENT_DETAIL_DESK],
  ["GET_TOURNAMENT_OFFICIAL_H2H", GET_TOURNAMENT_OFFICIAL_H2H],
  ["GET_TOURNAMENT_OFFICIAL_H2H_HISTORY", GET_TOURNAMENT_OFFICIAL_H2H_HISTORY],
  ["GET_ENTRY_TOURNAMENTS", GET_ENTRY_TOURNAMENTS],
  ["GET_MY_TOURNAMENT_REVIEW_CATALOG", GET_MY_TOURNAMENT_REVIEW_CATALOG],
  ["GET_MY_TOURNAMENT_GAMEWEEK_REVIEW", GET_MY_TOURNAMENT_GAMEWEEK_REVIEW],
  ["GET_MY_TOURNAMENT_SEASON_REVIEW", GET_MY_TOURNAMENT_SEASON_REVIEW],
  ["ENTRY_LIVE_COMPETITION_BOARD_QUERY", ENTRY_LIVE_COMPETITION_BOARD_QUERY],
  ["LEAGUE_LIVE_HEAD_QUERY", LEAGUE_LIVE_HEAD_QUERY],
  ["TOURNAMENT_SELECTION_INDEX_QUERY", TOURNAMENT_SELECTION_INDEX_QUERY],
  ["TOURNAMENT_ENTRY_SQUADS_QUERY", TOURNAMENT_ENTRY_SQUADS_QUERY],
  ["ENTRY_LOOKUP_QUERY", ENTRY_LOOKUP_QUERY],
  ["PLAYER_DETAIL", PLAYER_DETAIL],
];

const rootFieldsForDocument = (document) => {
  const ast = parse(document);
  const fragments = new Map(
    ast.definitions
      .filter((definition) => definition.kind === Kind.FRAGMENT_DEFINITION)
      .map((definition) => [definition.name.value, definition]),
  );
  const rootFields = new Set();
  const visitedFragments = new Set();

  const collect = (selectionSet) => {
    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        rootFields.add(selection.name.value);
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        collect(selection.selectionSet);
      } else if (
        selection.kind === Kind.FRAGMENT_SPREAD &&
        !visitedFragments.has(selection.name.value)
      ) {
        visitedFragments.add(selection.name.value);
        const fragment = fragments.get(selection.name.value);
        if (fragment) collect(fragment.selectionSet);
      }
    }
  };

  for (const definition of ast.definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) {
      collect(definition.selectionSet);
    }
  }
  return Array.from(rootFields);
};

async function loadPinnedTransportContracts() {
  const graphqlRoot = path.resolve(
    path.dirname(path.resolve(schemaModulePath)),
    "..",
    "..",
  );
  const pointsPath = path.join(
    graphqlRoot,
    "src/http/live-points-contract.ts",
  );
  const matchesPath = path.join(
    graphqlRoot,
    "src/http/live-matches-contract.ts",
  );
  const [points, matches] = await Promise.all([
    import(pathToFileURL(pointsPath).href),
    import(pathToFileURL(matchesPath).href),
  ]);
  if (
    typeof points.requiresLivePointsV2Contract !== "function" ||
    typeof matches.requiresLiveMatchesV3Contract !== "function" ||
    typeof points.LIVE_POINTS_CONTRACT_VALUE !== "string" ||
    typeof matches.LIVE_MATCHES_CONTRACT_VALUE !== "string"
  ) {
    throw new Error("Pinned GraphQL transport contract exports are invalid");
  }
  return {
    requiresLivePointsV2Contract: points.requiresLivePointsV2Contract,
    requiresLiveMatchesV3Contract: matches.requiresLiveMatchesV3Contract,
    livePointsValue: points.LIVE_POINTS_CONTRACT_VALUE,
    liveMatchesValue: matches.LIVE_MATCHES_CONTRACT_VALUE,
  };
}

async function discoverVersionGatedOperations(contracts) {
  const servicesDirectory = path.resolve("miniprogram/services");
  const discovered = [];
  for (const filename of readdirSync(servicesDirectory).filter((name) =>
    name.endsWith(".service.ts")
  )) {
    const exports = await import(
      pathToFileURL(path.join(servicesDirectory, filename)).href
    );
    for (const [exportName, value] of Object.entries(exports)) {
      if (typeof value !== "string") continue;
      let rootFields;
      try {
        rootFields = rootFieldsForDocument(value);
      } catch {
        continue;
      }
      if (
        contracts.requiresLivePointsV2Contract(rootFields) ||
        contracts.requiresLiveMatchesV3Contract(rootFields)
      ) {
        discovered.push([`${filename}:${exportName}`, value]);
      }
    }
  }
  return discovered;
}

async function loadSchema() {
  const resolvedPath = path.resolve(schemaModulePath);
  const imported = await import(pathToFileURL(resolvedPath).href);
  if (!imported.schema || typeof imported.schema.getTypeMap !== "function") {
    throw new Error(
      `GRAPHQL_SCHEMA_MODULE did not export a GraphQLSchema: ${resolvedPath}`,
    );
  }

  const requireFromSchema = createRequire(pathToFileURL(resolvedPath));
  const schemaGraphql = requireFromSchema("graphql");
  return buildSchema(schemaGraphql.printSchema(imported.schema));
}

const schema = await loadSchema();
let failed = 0;
const transportContracts = await loadPinnedTransportContracts();
if (
  transportContracts.livePointsValue !== LIVE_POINTS_CONTRACT_VERSION ||
  transportContracts.liveMatchesValue !== LIVE_MATCHES_CONTRACT_VERSION
) {
  console.error("[CONTRACT_FAIL] Client contract tokens differ from GraphQL");
  failed += 1;
}
const registeredDocuments = new Set(
  operations.map(([, document]) => document.trim()),
);
for (const [name, document] of await discoverVersionGatedOperations(
  transportContracts,
)) {
  if (!registeredDocuments.has(document.trim())) {
    console.error(
      `[REGISTRY_FAIL] ${name} is version-gated but missing from operations`,
    );
    failed += 1;
  }
}

const astNodeLimit = (document) => {
  const operations = document.definitions.filter(
    (definition) => definition.kind === Kind.OPERATION_DEFINITION,
  );
  if (operations.length !== 1) return 200;
  const roots = operations[0].selectionSet.selections;
  const rootName =
    roots.length === 1 &&
    roots[0].kind === Kind.FIELD &&
    !roots[0].alias
      ? roots[0].name.value
      : null;
  // Tournament review is a bounded, server-paginated read model. Its
  // nested shape is intentionally larger than the generic 200-node client
  // budget, but remains below the same production ceiling used by the live
  // points operations.
  if (["myTournamentGameweekReview", "myTournamentSeasonReview"].includes(rootName)) {
    return 320;
  }
  if (rootName === "tournamentOfficialH2H") return 240;
  return roots.length === 1 &&
    roots[0].kind === Kind.FIELD &&
    !roots[0].alias &&
    ["calcLivePointsByEntry", "entryLiveCompetitionBoard"].includes(
      roots[0].name.value,
    )
    ? roots[0].name.value === "calcLivePointsByEntry"
      ? 320
      : 400
    : 200;
};

for (const [name, document] of operations) {
  let errors;
  let operationFailed = false;
  try {
    const ast = parse(document);
    let astNodes = 0;
    visit(ast, { enter: () => void (astNodes += 1) });
    const maxAstNodes = astNodeLimit(ast);
    if (astNodes > maxAstNodes) {
      failed += 1;
      console.error(
        `[FAIL] ${name}: ${astNodes} AST nodes exceeds the production limit of ${maxAstNodes}`,
      );
      continue;
    }
    const rootFields = rootFieldsForDocument(document);
    const requiresPoints =
      transportContracts.requiresLivePointsV2Contract(rootFields);
    const requiresMatches =
      transportContracts.requiresLiveMatchesV3Contract(rootFields);
    if (requiresPoints && requiresMatches) {
      console.error(
        `[CONTRACT_FAIL] ${name}: mixes Live Points and Live Matches roots`,
      );
      operationFailed = true;
    } else {
      const expected = requiresPoints
        ? transportContracts.livePointsValue
        : requiresMatches
          ? transportContracts.liveMatchesValue
          : null;
      let actual = null;
      try {
        actual = liveContractVersionForQuery(document);
      } catch (error) {
        console.error(
          `[CONTRACT_FAIL] ${name}: ${error instanceof Error ? error.message : String(error)}`,
        );
        operationFailed = true;
      }
      if (!operationFailed && actual !== expected) {
        console.error(
          `[CONTRACT_FAIL] ${name}: expected ${expected ?? "no contract"}, client selected ${actual ?? "no contract"}`,
        );
        operationFailed = true;
      }
    }
    errors = validate(schema, ast);
  } catch (error) {
    failed += 1;
    console.error(
      `[FAIL] ${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
    continue;
  }

  if (errors.length > 0) {
    operationFailed = true;
    console.error(`[FAIL] ${name}`);
    for (const error of errors) console.error(`  ${error.message}`);
  }
  if (operationFailed) {
    failed += 1;
  } else {
    console.log(`[PASS] ${name}`);
  }
}

if (failed > 0) {
  throw new Error(
    `${failed} live GraphQL operation(s) failed schema validation`,
  );
}
