import type { LivePlayerRow } from "../miniprogram/models/live";
import {
  buildPlayerLiveDetail,
  buildProvisionalBreakdown,
  normalizeLivePosition
} from "../miniprogram/pages/live/entry/player-detail";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

assertEqual(normalizeLivePosition({ elementTypeName: "Defender" } as LivePlayerRow), "DEF", "normalize defender");
assertEqual(normalizeLivePosition({ position: "gk" } as LivePlayerRow), "GKP", "normalize gk");

const palmer = buildPlayerLiveDetail({
  name: "Palmer",
  team: "CHE",
  position: "MID",
  points: 10,
  minutes: 90,
  goalsScored: 1,
  assists: 1,
  playStatus: 4,
  statusText: "已完赛"
} as LivePlayerRow);

assertEqual(palmer.name, "Palmer", "name");
assertEqual(palmer.pointsText, "10", "points");
assertEqual(palmer.statRows.find((row) => row.label === "进球")?.value, "1", "goal stat");
assertEqual(palmer.breakdownRows.map((row) => row.label).join(","), "出场,进球,助攻", "breakdown labels");
assertEqual(palmer.breakdownSumText, "+10", "palmer breakdown sum");
assertEqual(palmer.breakdownHint, "", "palmer reconciles");

const captain = buildPlayerLiveDetail({
  name: "Haaland",
  position: "FWD",
  points: 20,
  multiplier: 2,
  captain: true,
  minutes: 90,
  goalsScored: 2
} as LivePlayerRow);
assertEqual(captain.breakdownRows.find((row) => row.label === "进球")?.pointsText, "+16", "captain goals scaled");
assertEqual(captain.breakdownSumText, "+20", "captain sum scaled");

const empty = buildPlayerLiveDetail({
  name: "Dunk",
  position: "DEF",
  points: 0,
  minutes: 0
} as LivePlayerRow);
assertEqual(empty.breakdownRows.length, 0, "empty breakdown");
assertEqual(empty.breakdownHint.includes("官方明细"), true, "empty hint");
assertEqual(empty.statRows.find((row) => row.label === "防守贡献")?.value, "0", "defensive contribution stat label");
assertEqual(empty.statRows.some((row) => row.label === "防守"), false, "legacy defensive label removed");

const gkpLines = buildProvisionalBreakdown({
  position: "GKP",
  minutes: 90,
  saves: 4,
  cleanSheets: 1
} as LivePlayerRow);
assertEqual(gkpLines.find((row) => row.label === "扑救")?.pointsText, "+1", "save points");
assertEqual(gkpLines.find((row) => row.label === "零封")?.pointsText, "+4", "gkp clean sheet");

const authoritative = buildPlayerLiveDetail({
  name: "Authoritative",
  position: "MID",
  points: 10,
  minutes: 90,
  goalsScored: 1,
  bonus: 1,
  statPoints: {
    minutes: { awardedPoints: 2 },
    goals: { awardedPoints: 6 },
    bonus: { awardedPoints: 2 },
  },
} as LivePlayerRow);
assertEqual(
  authoritative.breakdownRows.find((row) => row.label === "进球")?.pointsText,
  "+6",
  "authoritative goal points include modification",
);
assertEqual(
  authoritative.breakdownRows.find((row) => row.label === "奖励分")?.pointsText,
  "+2",
  "authoritative bonus points include modification",
);
assertEqual(authoritative.breakdownSumText, "+10", "authoritative breakdown sum");
assertEqual(authoritative.breakdownHint, "", "authoritative breakdown reconciles");

console.log("live-entry-player-detail tests passed");
