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

assertEqual(liveMatchFixtures.length, 10, "a full GW has 10 fixtures");

const byStatus = liveMatchFixtures.reduce<Record<string, number>>((counts, match) => {
  counts[match.status] = (counts[match.status] || 0) + 1;
  return counts;
}, {});
assertEqual(byStatus.playing, 3, "3 live");
assertEqual(byStatus.finished, 4, "4 finished");
assertEqual(byStatus.not_start, 3, "3 not started");

const shorts = liveMatchFixtures.flatMap((match) => [match.homeTeamShortName, match.awayTeamShortName]);
assertEqual(new Set(shorts).size, 20, "each club appears once");

liveMatchFixtures.forEach((match) => {
  const allowed = new Set([match.homeTeamShortName, match.awayTeamShortName]);
  [...match.homeTeamDataList, ...match.awayTeamDataList].forEach((player) => {
    assert(
      allowed.has(player.teamShortName),
      `${match.homeTeamShortName}-${match.awayTeamShortName} has foreign player ${player.webName} (${player.teamShortName})`
    );
  });
});

console.log("live-match-mock tests passed");
