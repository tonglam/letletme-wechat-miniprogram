import { liveMatchFixtures } from "../miniprogram/mocks/live-match.mock";

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

async function main(): Promise<void> {
  (globalThis as { Page?: (definition: unknown) => void }).Page = () => undefined;
  const { buildMatchHighlights, isCleanSheetEarned, isDefensiveContributionEarned } = await import("../miniprogram/pages/live/match/match");

  assert(isDefensiveContributionEarned({ elementType: 2, defensiveContribution: 10 }), "DEF DC at 10");
  assert(!isDefensiveContributionEarned({ elementType: 2, defensiveContribution: 9 }), "DEF DC below 10");
  assert(isDefensiveContributionEarned({ elementType: 3, defensiveContribution: 12 }), "MID DC at 12");
  assert(!isDefensiveContributionEarned({ elementType: 3, defensiveContribution: 11 }), "MID DC below 12");
  assert(!isDefensiveContributionEarned({ elementType: 1, defensiveContribution: 20 }), "GKP never earns DC");

  assert(isCleanSheetEarned({ elementType: 1, cleanSheets: 1, minutes: 90 }), "GKP clean sheet");
  assert(isCleanSheetEarned({ elementType: 3, cleanSheets: 1, minutes: 60 }), "MID clean sheet at 60min");
  assert(!isCleanSheetEarned({ elementType: 4, cleanSheets: 1, minutes: 90 }), "FWD never earns CS points");
  assert(!isCleanSheetEarned({ elementType: 2, cleanSheets: 1, minutes: 59 }), "CS needs 60 minutes");

  const groups = buildMatchHighlights(liveMatchFixtures[0]);
  const byKind = Object.fromEntries(groups.map((group) => [group.kind, group]));

  assert(byKind.bonus, "bonus group is present");
  assertEqual(byKind.bonus.items.length, 3, "all bonus winners stay visible");
  assert(byKind.bonus.items.some((item) => item.text === "+3" && item.name === "Saka"), "Saka +3 bonus");
  assert(byKind.bps, "BPS group is present");
  assertEqual(byKind.bps.items.length, 5, "BPS keeps the top 5");
  assertEqual(byKind.bps.items[0].name, "Saka", "highest BPS first");
  assert(byKind.defensive, "DC group is present");
  assert(byKind.defensive.items.some((item) => item.name === "Rice" && item.text === "16"), "Rice DC");
  assert(!byKind.defensive.items.some((item) => item.name === "Raya"), "GK saves are not DC");
  assert(byKind.yellow.items.length >= 2, "both yellow cards stay visible");
  assert(byKind.saves, "saves stay visible");
  assert(byKind.pensaved?.items.some((item) => item.name === "Sanchez"), "penalty saves are visible");
  assert(byKind.penmissed?.items.some((item) => item.name === "Palmer"), "penalty misses are visible");
  assert(!byKind.cleansheet, "match 1 has no earned clean sheet");

  const finishedGroups = buildMatchHighlights(liveMatchFixtures[3]);
  const finishedByKind = Object.fromEntries(finishedGroups.map((group) => [group.kind, group]));
  assert(finishedByKind.cleansheet?.items.some((item) => item.name === "Dunk"), "earned clean sheets are visible");
  assert(!finishedByKind.cleansheet?.items.some((item) => item.name === "Joao Pedro"), "FWD clean sheet earns nothing");
  assert(finishedByKind.owngoal?.items.some((item) => item.name === "Ait-Nouri"), "own goals are visible");
  assertEqual(finishedByKind.cleansheet.items[0].display, "", "single counts stay unlabeled");

  assertEqual(buildMatchHighlights(liveMatchFixtures[7]).length, 0, "unstarted matches have no highlight dump");
  assert(
    buildMatchHighlights(liveMatchFixtures[4]).some((group) => group.kind === "red" && group.items.some((item) => item.name === "Munoz")),
    "red cards are not dropped"
  );

  console.log("live-match-highlights tests passed");
}

void main();
