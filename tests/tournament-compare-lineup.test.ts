import { mapTournamentLiveRows } from "../miniprogram/services/live-tournament";
import { buildTournamentLineupComparison } from "../miniprogram/utils/live-share";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const mapped = mapTournamentLiveRows([
  {
    entry: 1,
    entryName: "Left XI",
    playerName: "Left Manager",
    livePoints: 10,
    transferCost: 0,
    liveNetPoints: 10,
    liveTotalPoints: 10,
    played: 1,
    toPlay: 10,
    captainName: "Starter",
    pickList: [
      {
        element: 101,
        webName: "Starter",
        teamShortName: "ARS",
        elementTypeName: "MID",
        position: 1,
        isCaptain: true,
        totalPoints: 7,
      },
      {
        element: 115,
        webName: "Bench",
        teamShortName: "LIV",
        elementTypeName: "FWD",
        position: 12,
        totalPoints: 2,
      },
    ],
  },
]);

assertEqual(mapped[0].picks?.[0].totalPoints, 7, "pick points survive board mapping");

const comparison = buildTournamentLineupComparison(mapped[0].picks, [
  {
    element: 201,
    webName: "Opponent",
    teamShortName: "MCI",
    elementTypeName: "FWD",
    squadPosition: 1,
    viceCaptain: true,
    totalPoints: 5,
  },
]);

assertEqual(comparison.leftCount, 2, "left pick count");
assertEqual(comparison.rightCount, 1, "right pick count");
assertEqual(comparison.rows[0].sectionLabel, "首发", "starter section");
assertEqual(comparison.rows[0].left?.name, "Starter", "left starter name");
assertEqual(comparison.rows[0].left?.role, "C", "captain marker");
assertEqual(comparison.rows[0].left?.pointsText, "7分", "left player points");
assertEqual(comparison.rows[0].right?.role, "V", "vice marker");
assertEqual(comparison.rows[1].sectionLabel, "替补", "bench section");
assertEqual(comparison.rows[1].slotLabel, "替1", "bench slot label");
assertEqual(comparison.rows[1].right, null, "missing side remains explicit");

const fallback = buildTournamentLineupComparison([
  { webName: "First" },
  { webName: "Second" },
]);
assertEqual(fallback.rows[0].slot, 1, "missing slots keep source order");
assertEqual(fallback.rows[1].slot, 2, "missing slots keep second source order");

console.log("tournament-compare-lineup tests passed");
