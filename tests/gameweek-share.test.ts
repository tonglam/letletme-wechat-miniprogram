import {
  formatGameweekShareText,
  type GameweekShareInput
} from "../miniprogram/utils/gameweek-share";

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected to include ${JSON.stringify(expected)}\n${actual}`);
  }
}

const input: GameweekShareInput = {
  event: 1,
  headlineStats: [
    { label: "最高分", value: "95", meta: "Mendy" },
    { label: "平均分", value: "23" }
  ],
  mostRows: [
    { label: "最多选择球员", value: "Haaland" },
    { label: "本轮最佳球员", value: "Mendy (HUL)", meta: "15分" }
  ],
  chipRows: [
    { id: "chip-bb", title: "bboost", value: "814.6k", meta: "开卡数量" }
  ],
  dreamPlayers: [
    { id: "1", webName: "Mendy", score: 15, teamCode: "HUL", position: "DEF" },
    { id: "2", webName: "Salah", score: 12, teamCode: "LIV", position: "MID", isCaptain: true }
  ],
  dreamPoints: 27,
  eliteRows: [
    { id: "elite-0", title: "Mendy (HUL)", value: "15分", description: "选择率 4%" }
  ],
  transfersInRows: [
    { id: "in-0", title: "Raya (ARS)", value: "250.8k" }
  ],
  transfersOutRows: [
    { id: "out-0", title: "Pedro Porro (TOT)", value: "120.4k" }
  ]
};

assertIncludes(formatGameweekShareText(input, "headline"), "GW1 本轮概览", "headline title");
assertIncludes(formatGameweekShareText(input, "most"), "- 本轮最佳球员：Mendy (HUL) · 15分", "most rows");
assertIncludes(formatGameweekShareText(input, "chips"), "- bboost · 开卡数量 · 814.6k", "chip rows");
assertIncludes(formatGameweekShareText(input, "dreamTeam"), "GW1 梦之队 · 27分", "dream team score");
assertIncludes(formatGameweekShareText(input, "dreamTeam"), "- Salah (C) · LIV 中场 · 12分", "dream team player role");
assertIncludes(formatGameweekShareText(input, "elite"), "- Mendy (HUL) · 选择率 4% · 15分", "elite rows");
assertIncludes(formatGameweekShareText(input, "transfersIn"), "- Raya (ARS) · 250.8k", "transfer in rows");
assertIncludes(formatGameweekShareText(input, "transfersOut"), "- Pedro Porro (TOT) · 120.4k", "transfer out rows");

const emptyText = formatGameweekShareText({ ...input, eliteRows: [] }, "elite");
assertIncludes(emptyText, "GW1 高分榜\n\n无", "empty list remains explicit");

console.log("gameweek-share tests passed");
