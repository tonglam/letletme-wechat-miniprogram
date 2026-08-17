function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const directory = [
  { id: 1, name: "Arsenal", shortName: "ARS" },
  { id: 13, name: "Man City", shortName: "MCI" },
  { id: 14, name: "Man Utd", shortName: "MUN" }
];

async function main(): Promise<void> {
  // The page module calls Page() at import time — shim it first.
  (globalThis as { Page?: (definition: unknown) => void }).Page = () => undefined;
  const { resolveTeamSearchId } = await import("../miniprogram/pages/data/price/price");

  assertEqual(resolveTeamSearchId("Arsenal", directory), 1, "full team name matches");
  assertEqual(resolveTeamSearchId("arsenal", directory), 1, "name match is case-insensitive");
  assertEqual(resolveTeamSearchId("MCI", directory), 13, "short code matches");
  assertEqual(resolveTeamSearchId("mci", directory), 13, "short code match is case-insensitive");
  assertEqual(resolveTeamSearchId("  Man Utd  ", directory), 14, "surrounding whitespace is ignored");
  assertEqual(resolveTeamSearchId("Man", directory), null, "partial names stay player search");
  assertEqual(resolveTeamSearchId("Haaland", directory), null, "player names stay player search");
  assertEqual(resolveTeamSearchId("", directory), null, "empty keyword resolves nothing");
  assertEqual(resolveTeamSearchId("Arsenal", []), null, "empty directory resolves nothing");

  console.log("price-team-search tests passed");
}

void main();
