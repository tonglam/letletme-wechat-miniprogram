import type { LivePlayerRow } from "../miniprogram/models/live";
import { normalizePlayer } from "../miniprogram/pages/live/entry/player";

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
