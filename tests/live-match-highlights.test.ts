import type { LiveMatch, LivePlayerRow } from "../miniprogram/models/live";

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

function player(row: LivePlayerRow): LivePlayerRow {
  return { name: row.webName, ...row };
}

function match(
  status: LiveMatch["status"],
  home: LivePlayerRow[],
  away: LivePlayerRow[] = []
): LiveMatch {
  return {
    status,
    playStatus: status,
    homeTeamShortName: "HOM",
    awayTeamShortName: "AWY",
    homeTeamDataList: home.map(player),
    awayTeamDataList: away.map(player)
  };
}

const playing: LiveMatch = match("playing", [
  { webName: "Saka", teamShortName: "ARS", elementType: 3, goalsScored: 1, assists: 1, bonus: 3, bps: 48 },
  { webName: "Havertz", teamShortName: "ARS", elementType: 4, goalsScored: 1, bonus: 1, bps: 32 },
  { webName: "Gabriel", teamShortName: "ARS", elementType: 2, yellowCards: 1, defensiveContribution: 14, bps: 27 },
  { webName: "Rice", teamShortName: "ARS", elementType: 3, defensiveContribution: 16, bps: 29 },
  { webName: "Raya", teamShortName: "ARS", elementType: 1, saves: 4, bps: 24 }
], [
  { webName: "Palmer", teamShortName: "CHE", elementType: 3, goalsScored: 1, bonus: 2, bps: 41, penaltiesMissed: 1 },
  { webName: "Cucurella", teamShortName: "CHE", elementType: 2, yellowCards: 1, defensiveContribution: 12, bps: 22 },
  { webName: "Sanchez", teamShortName: "CHE", elementType: 1, saves: 5, penaltiesSaved: 1, bps: 26 }
]);

const finishedCleanSheet: LiveMatch = match("finished", [
  { webName: "Mitoma", teamShortName: "BHA", elementType: 3, goalsScored: 1, bonus: 3, bps: 46, minutes: 90, cleanSheets: 1 },
  { webName: "Joao Pedro", teamShortName: "BHA", elementType: 4, goalsScored: 1, bonus: 2, bps: 34, minutes: 90 },
  { webName: "Dunk", teamShortName: "BHA", elementType: 2, defensiveContribution: 13, bonus: 1, bps: 30, minutes: 90, cleanSheets: 1 },
  { webName: "Verbruggen", teamShortName: "BHA", elementType: 1, saves: 4, bps: 24, minutes: 90, cleanSheets: 1 }
], [
  { webName: "Ait-Nouri", teamShortName: "WOL", elementType: 2, yellowCards: 1, ownGoals: 1, bps: 12 },
  { webName: "Sa", teamShortName: "WOL", elementType: 1, saves: 6, bps: 22, minutes: 90 }
]);

const finishedRedCard: LiveMatch = match("finished", [
  { webName: "Mbeumo", teamShortName: "BRE", elementType: 3, goalsScored: 1, bonus: 3, bps: 40 }
], [
  { webName: "Munoz", teamShortName: "CRY", elementType: 2, yellowCards: 1, redCards: 1, bps: 8 }
]);

const notStarted: LiveMatch = match("not_start", []);

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

  const groups = buildMatchHighlights(playing);
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
  assert(!byKind.cleansheet, "live match has no earned clean sheet");

  const finishedGroups = buildMatchHighlights(finishedCleanSheet);
  const finishedByKind = Object.fromEntries(finishedGroups.map((group) => [group.kind, group]));
  assert(finishedByKind.cleansheet?.items.some((item) => item.name === "Dunk"), "earned clean sheets are visible");
  assert(!finishedByKind.cleansheet?.items.some((item) => item.name === "Joao Pedro"), "FWD clean sheet earns nothing");
  assert(finishedByKind.owngoal?.items.some((item) => item.name === "Ait-Nouri"), "own goals are visible");
  assertEqual(finishedByKind.cleansheet.items[0].display, "", "single counts stay unlabeled");

  assertEqual(buildMatchHighlights(notStarted).length, 0, "unstarted matches have no highlight dump");
  assert(
    buildMatchHighlights(finishedRedCard).some((group) => group.kind === "red" && group.items.some((item) => item.name === "Munoz")),
    "red cards are not dropped"
  );

  console.log("live-match-highlights tests passed");
}

void main();
