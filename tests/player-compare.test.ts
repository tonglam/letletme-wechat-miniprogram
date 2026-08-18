import type {
  PlayerStatsDeskEntry,
  PlayerStatsDeskOverview
} from "../miniprogram/services/player.service";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function entry(playerId: number, overrides: Partial<PlayerStatsDeskOverview> = {}, ictIndex: number | null = 100): PlayerStatsDeskEntry {
  return {
    playerId,
    overview: {
      id: playerId,
      webName: `Player${playerId}`,
      teamShortName: "ARS",
      elementType: 3,
      elementTypeName: "Midfielder",
      price: 10,
      startPrice: 9.5,
      totalPoints: 100,
      selectedByPercent: 30,
      form: 5,
      transfersInEvent: 500000,
      transfersOutEvent: 400000,
      minutes: 1800,
      starts: 20,
      goalsScored: 8,
      assists: 6,
      cleanSheets: 2,
      bonus: 15,
      bps: 400,
      expectedGoals: 7.5,
      expectedAssists: 5.5,
      expectedGoalInvolvements: 13,
      ...overrides
    },
    ictIndex
  };
}

async function main(): Promise<void> {
  // The page module calls Page() at import time — shim it first.
  (globalThis as { Page?: (definition: unknown) => void }).Page = () => undefined;
  const { buildCompareView } = await import("../miniprogram/pages/data/players/players");

  const strong = entry(1, { totalPoints: 150, form: 6.5 });
  const weak = entry(2, { totalPoints: 90, form: 4 });

  // Same position: winners highlighted, process shows all four rows.
  const same = buildCompareView(strong, weak);
  assert(same !== null, "view builds for two overviews");
  assertEqual(same!.samePosition, true, "same elementType is same position");
  const overview = same!.groups.find((group) => group.key === "overview");
  const totalRow = overview!.rows.find((row) => row.key === "totalPoints");
  assertEqual(totalRow!.winA, true, "higher total points wins for player A");
  assertEqual(totalRow!.winB, false, "loser is not highlighted");
  const ppmRow = overview!.rows.find((row) => row.key === "ppm");
  assertEqual(ppmRow!.valueA, "15.0", "性价比 = 总分 ÷ £价格");
  const process = same!.groups.find((group) => group.key === "process");
  assertEqual(process!.rows.length, 4, "same-position process has xG/xA/xGI/ICT");

  // Market rows never crown a winner, even same-position.
  const market = same!.groups.find((group) => group.key === "market");
  assert(market!.rows.every((row) => !row.winA && !row.winB), "market rows stay neutral");
  const netRow = market!.rows.find((row) => row.key === "net");
  assertEqual(netRow!.valueA, "+100k", "net transfers signed and compact");

  // Cross position: process collapses to ICT only and nothing is crowned.
  const defender = entry(3, { elementType: 2, elementTypeName: "Defender", totalPoints: 10 });
  const cross = buildCompareView(strong, defender);
  assertEqual(cross!.samePosition, false, "different elementType is cross position");
  const crossProcess = cross!.groups.find((group) => group.key === "process");
  assertEqual(crossProcess!.rows.length, 1, "cross-position process shows ICT only");
  assertEqual(crossProcess!.rows[0].key, "ict", "the surviving row is ICT");
  const crossOverview = cross!.groups.find((group) => group.key === "overview");
  assert(crossOverview!.rows.every((row) => !row.winA && !row.winB), "cross-position crowns no winner");

  // Null stats render as "-" and never win.
  const noForm = entry(4, { form: null });
  const withNulls = buildCompareView(strong, noForm);
  const formRow = withNulls!.groups[0].rows.find((row) => row.key === "form");
  assertEqual(formRow!.valueB, "-", "null form renders a dash");
  assertEqual(formRow!.winA, false, "null comparison has no winner");

  // Missing overview → null view (page shows the error state).
  const missing = buildCompareView({ playerId: 9, overview: null }, weak);
  assertEqual(missing, null, "missing overview yields null view");

  console.log("player-compare tests passed");
}

void main();
