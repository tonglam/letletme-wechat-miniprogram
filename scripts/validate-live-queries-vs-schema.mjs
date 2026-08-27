import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSchema, Kind, parse, validate, visit } from "graphql";

const {
  buildLiveFixturePlayersQuery,
  CALC_LIVE_POINTS_BY_ENTRY,
  LIVE_MATCHES_QUERY,
  LIVE_SNAPSHOT_QUERY,
  TOURNAMENT_LIVE_POINTS
} = await import("../miniprogram/services/live.service.ts");
const {
  MINI_HOME_PERSONAL_LEAGUES_QUERY
} = await import("../miniprogram/services/home.service.ts");
const {
  PRICE_CHANGE_BOARD_QUERY,
  PRICE_CHANGE_PERSONAL_QUERY,
  PRICE_CHANGE_START_PRICES_QUERY
} = await import("../miniprogram/services/price-change.service.ts");
const {
  GET_MY_FPL_COMPETITIONS_DESK,
  GET_MY_FPL_COMPETITION_BOARD,
  GET_MY_FPL_COMPETITION_SEASON_PATH
} = await import("../miniprogram/services/tournament.service.ts");
const {
  GET_TOURNAMENT_DETAIL_DESK,
  GET_TOURNAMENT_OFFICIAL_H2H,
  GET_ENTRY_OFFICIAL_H2H_MATCHUPS
} = await import("../miniprogram/services/tournament-detail.service.ts");
const {
  ENTRY_LIVE_COMPETITION_BOARD_QUERY,
  TOURNAMENT_ENTRY_SQUADS_QUERY,
  TOURNAMENT_SELECTION_INDEX_QUERY
} = await import("../miniprogram/services/live-board.service.ts");

const schemaModulePath = process.env.GRAPHQL_SCHEMA_MODULE?.trim();

if (!schemaModulePath) {
  throw new Error("GRAPHQL_SCHEMA_MODULE is required");
}

const operations = [
  ["LIVE_SNAPSHOT_QUERY", LIVE_SNAPSHOT_QUERY],
  ["CALC_LIVE_POINTS_BY_ENTRY", CALC_LIVE_POINTS_BY_ENTRY],
  ["LIVE_MATCHES_QUERY", LIVE_MATCHES_QUERY],
  ["TOURNAMENT_LIVE_POINTS", TOURNAMENT_LIVE_POINTS],
  ["LIVE_FIXTURE_PLAYERS_BATCH", buildLiveFixturePlayersQuery(5)],
  ["MINI_HOME_PERSONAL_LEAGUES_QUERY", MINI_HOME_PERSONAL_LEAGUES_QUERY],
  ["PRICE_CHANGE_BOARD_QUERY", PRICE_CHANGE_BOARD_QUERY],
  ["PRICE_CHANGE_PERSONAL_QUERY", PRICE_CHANGE_PERSONAL_QUERY],
  ["PRICE_CHANGE_START_PRICES_QUERY", PRICE_CHANGE_START_PRICES_QUERY],
  ["GET_MY_FPL_COMPETITIONS_DESK", GET_MY_FPL_COMPETITIONS_DESK],
  ["GET_MY_FPL_COMPETITION_BOARD", GET_MY_FPL_COMPETITION_BOARD],
  ["GET_MY_FPL_COMPETITION_SEASON_PATH", GET_MY_FPL_COMPETITION_SEASON_PATH],
  ["GET_TOURNAMENT_DETAIL_DESK", GET_TOURNAMENT_DETAIL_DESK],
  ["GET_TOURNAMENT_OFFICIAL_H2H", GET_TOURNAMENT_OFFICIAL_H2H],
  ["GET_ENTRY_OFFICIAL_H2H_MATCHUPS", GET_ENTRY_OFFICIAL_H2H_MATCHUPS],
  ["ENTRY_LIVE_COMPETITION_BOARD_QUERY", ENTRY_LIVE_COMPETITION_BOARD_QUERY],
  ["TOURNAMENT_SELECTION_INDEX_QUERY", TOURNAMENT_SELECTION_INDEX_QUERY],
  ["TOURNAMENT_ENTRY_SQUADS_QUERY", TOURNAMENT_ENTRY_SQUADS_QUERY]
];

async function loadSchema() {
  const resolvedPath = path.resolve(schemaModulePath);
  const imported = await import(pathToFileURL(resolvedPath).href);
  if (
    !imported.schema ||
    typeof imported.schema.getTypeMap !== "function"
  ) {
    throw new Error(`GRAPHQL_SCHEMA_MODULE did not export a GraphQLSchema: ${resolvedPath}`);
  }

  const requireFromSchema = createRequire(pathToFileURL(resolvedPath));
  const schemaGraphql = requireFromSchema("graphql");
  return buildSchema(schemaGraphql.printSchema(imported.schema));
}

const schema = await loadSchema();
let failed = 0;

const astNodeLimit = (document) => {
  const operations = document.definitions.filter(
    (definition) => definition.kind === Kind.OPERATION_DEFINITION,
  );
  if (operations.length !== 1) return 200;
  const roots = operations[0].selectionSet.selections;
  return roots.length === 1 &&
      roots[0].kind === Kind.FIELD &&
      !roots[0].alias &&
      roots[0].name.value === "entryLiveCompetitionBoard"
    ? 400
    : 200;
};

for (const [name, document] of operations) {
  let errors;
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
    errors = validate(schema, ast);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  if (errors.length > 0) {
    failed += 1;
    console.error(`[FAIL] ${name}`);
    for (const error of errors) console.error(`  ${error.message}`);
  } else {
    console.log(`[PASS] ${name}`);
  }
}

if (failed > 0) {
  throw new Error(`${failed} live GraphQL operation(s) failed schema validation`);
}
