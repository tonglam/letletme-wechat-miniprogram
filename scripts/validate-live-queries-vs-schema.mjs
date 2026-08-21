import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSchema, parse, validate } from "graphql";

const {
  buildLiveFixturePlayersQuery,
  CALC_LIVE_POINTS_BY_ENTRY,
  LIVE_MATCHES_QUERY,
  LIVE_SNAPSHOT_BY_EVENT_QUERY,
  LIVE_SNAPSHOT_QUERY
} = await import("../miniprogram/services/live.service.ts");

const schemaModulePath = process.env.GRAPHQL_SCHEMA_MODULE?.trim();

if (!schemaModulePath) {
  throw new Error("GRAPHQL_SCHEMA_MODULE is required");
}

const operations = [
  ["LIVE_SNAPSHOT_QUERY", LIVE_SNAPSHOT_QUERY],
  ["LIVE_SNAPSHOT_BY_EVENT_QUERY", LIVE_SNAPSHOT_BY_EVENT_QUERY],
  ["CALC_LIVE_POINTS_BY_ENTRY", CALC_LIVE_POINTS_BY_ENTRY],
  ["LIVE_MATCHES_QUERY", LIVE_MATCHES_QUERY],
  ["LIVE_FIXTURE_PLAYERS_BATCH", buildLiveFixturePlayersQuery(5)]
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

for (const [name, document] of operations) {
  let errors;
  try {
    errors = validate(schema, parse(document));
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
