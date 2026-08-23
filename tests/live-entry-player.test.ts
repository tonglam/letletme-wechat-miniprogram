import type { LivePlayerRow } from "../miniprogram/models/live";
import {
  isLiveSquadPitchStarter,
  normalizePlayer,
  splitLiveSquadPlayers
} from "../miniprogram/pages/live/entry/player";

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected "${actual}" to include "${expected}"`);
  }
}

function assertEqual(actual: string | number | undefined, expected: string | number, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function assertBoolean(actual: boolean, expected: boolean, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

assertBoolean(
  isLiveSquadPitchStarter({ pickActive: false, squadPosition: 8, multiplier: 0 }),
  true,
  "official slot keeps a starter in the XI even when scoring is inactive",
);
assertBoolean(
  isLiveSquadPitchStarter({ pickActive: true, squadPosition: 12, multiplier: 1 }),
  false,
  "official slot keeps a scoring-active bench player in the bench panel",
);
assertBoolean(
  isLiveSquadPitchStarter({ squadPosition: 12, multiplier: 1 }),
  false,
  "slot fallback keeps positions 12-15 on the bench",
);
assertBoolean(
  isLiveSquadPitchStarter({ pickActive: "false" as unknown as boolean, multiplier: 0 }),
  false,
  "legacy string false is treated as inactive",
);
assertBoolean(
  isLiveSquadPitchStarter({ multiplier: undefined }),
  false,
  "missing lineup metadata never expands the pitch",
);

const degradedSquad = splitLiveSquadPlayers(
  Array.from({ length: 15 }, (_, index) => ({
    element: index + 1,
    webName: `Player${index + 1}`,
    elementTypeName: index === 0 || index === 11 ? "GKP" : "MID",
    pickActive: true,
    multiplier: 1
  })),
);
assertEqual(degradedSquad.starters.length, 11, "degraded live payload stays at XI");
assertEqual(degradedSquad.bench.length, 4, "degraded live payload keeps four bench players");
assertEqual(degradedSquad.bench[0]?.webName, "Player12", "degraded payload preserves slot order");

const officialSquad = splitLiveSquadPlayers(
  Array.from({ length: 15 }, (_, index) => ({
    element: index + 1,
    webName: `Player${index + 1}`,
    squadPosition: index + 1,
    pickActive: true,
    multiplier: 1
  })),
);
assertEqual(officialSquad.starters.length, 11, "official slots keep XI");
assertEqual(officialSquad.bench.length, 4, "official slots keep bench");
assertEqual(officialSquad.bench[0]?.webName, "Player12", "official bench starts at slot 12");

const row = normalizePlayer({
  webName: "Sels",
  teamShortName: "NFO",
  elementTypeName: "GKP",
  totalPoints: 9,
  minutes: 90,
  cleanSheets: 1,
  saves: 5,
  yellowCards: 1,
  redCards: 1,
  ownGoals: 1,
  penaltiesSaved: 1,
  penaltiesMissed: 1,
  bonus: 2,
  bps: 31,
  playStatus: 2,
  captain: true,
  multiplier: 2
} as LivePlayerRow);

assertEqual(row.roleText, "C", "captain badge");
assertEqual(row.statusText, "比赛中", "live status text");
assertEqual(row.statusClass, "live-playing", "live status class");
assertEqual(row.pointsText, "9", "points text");
assertIncludes(row.metaText || "", "90分钟", "minutes meta");
assertIncludes(row.metaText || "", "零封", "clean sheet meta");
assertIncludes(row.metaText || "", "5扑救", "saves meta");
assertIncludes(row.metaText || "", "1黄", "yellow card meta");
assertIncludes(row.metaText || "", "1红", "red card meta");
assertIncludes(row.metaText || "", "1乌龙", "own goal meta");
assertIncludes(row.metaText || "", "1扑点", "penalty save meta");
assertIncludes(row.metaText || "", "1失点", "penalty miss meta");
assertIncludes(row.metaText || "", "2Bonus", "bonus meta");

const blankRow = normalizePlayer({ playStatus: 0 } as LivePlayerRow);
assertEqual(blankRow.statusText, "无比赛", "blank gameweek status text");
assertEqual(blankRow.statusClass, "live-blank", "blank gameweek status class");

const notStartedRow = normalizePlayer({ playStatus: 1 } as LivePlayerRow);
assertEqual(notStartedRow.statusText, "未开始", "not started status text");

const partialRow = normalizePlayer({ playStatus: 3 } as LivePlayerRow);
assertEqual(partialRow.statusText, "部分完赛", "partial double gameweek status text");
assertEqual(partialRow.statusClass, "live-partial", "partial double gameweek status class");

const finishedRow = normalizePlayer({ playStatus: 4 } as LivePlayerRow);
assertEqual(finishedRow.statusText, "已完赛", "finished status text");
assertEqual(finishedRow.statusClass, "live-finished", "finished status class");
