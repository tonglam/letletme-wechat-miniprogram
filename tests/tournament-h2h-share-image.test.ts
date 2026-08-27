import {
  TOURNAMENT_H2H_SHARE_MAX_ROWS,
  TOURNAMENT_H2H_SHARE_WIDTH,
  buildTournamentH2HSharePlan,
  drawTournamentH2HSharePlan,
  tournamentH2HShareCacheKey,
  tournamentH2HSharePixelRatio,
  type TournamentH2HShareInput,
} from "../miniprogram/utils/tournament-h2h-share-image";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

const standingsInput: TournamentH2HShareInput = {
  kind: "standings",
  event: 5,
  tournamentName: "WhoamI Cup",
  statsLine: "我的排名 2 · 对战积分 12 · 战绩 4-0-1",
  standingRows: Array.from({ length: 17 }, (_, index) => ({
    rankText: String(index + 1),
    entryName: `球队${index + 1}`,
    recordText: "3-1-1",
    pointsForText: "512",
    matchPointsText: "10",
    isMe: index === 1,
  })),
  matchRows: [],
};

const standingsPlan = buildTournamentH2HSharePlan(standingsInput);
assertEqual(standingsPlan.width, TOURNAMENT_H2H_SHARE_WIDTH, "share width");
assertEqual(standingsPlan.headerTitle, "H2H 积分榜", "standings title");
assertEqual(
  standingsPlan.eyebrow,
  "GW5 · WhoamI Cup",
  "standings eyebrow carries the GW",
);
assertEqual(
  standingsPlan.standingRows.length,
  TOURNAMENT_H2H_SHARE_MAX_ROWS,
  "standings rows are capped",
);
assertEqual(standingsPlan.truncated, 2, "overflow is counted");
assert(standingsPlan.statsLine.includes("我的排名"), "stats strip survives");

const matchesInput: TournamentH2HShareInput = {
  kind: "matches",
  event: 5,
  tournamentName: "WhoamI Cup",
  standingRows: [],
  matchRows: [
    {
      labelText: "#01",
      statusText: "常规赛",
      homeName: "Dream Team FC",
      awayName: "WhoamI FC",
      scoreText: "66 — 55",
      involvesViewer: true,
    },
    {
      labelText: "#02",
      statusText: "半决赛 · 轮空",
      homeName: "Pending FC",
      awayName: "平均队",
      scoreText: "对阵",
      involvesViewer: false,
    },
  ],
};

const matchesPlan = buildTournamentH2HSharePlan(matchesInput);
assertEqual(matchesPlan.headerTitle, "H2H 本轮对阵", "fixtures title");
assertEqual(matchesPlan.matchRows.length, 2, "fixture rows pass through");
assertEqual(matchesPlan.truncated, 0, "no overflow");
assert(
  matchesPlan.height < standingsPlan.height,
  "short fixture lists stay compact",
);

const matchupsPlan = buildTournamentH2HSharePlan({
  kind: "matchups",
  event: 5,
  tournamentName: "WhoamI Cup",
  standingRows: [],
  matchRows: [
    {
      labelText: "GW4",
      statusText: "已结束",
      homeName: "WhoamI FC",
      awayName: "Dream Team FC",
      scoreText: "61 — 58",
      involvesViewer: false,
    },
  ],
});
assertEqual(matchupsPlan.headerTitle, "我的对阵", "matchups title");
assertEqual(
  matchupsPlan.eyebrow,
  "WhoamI Cup",
  "matchups eyebrow spans every GW",
);

assertEqual(tournamentH2HSharePixelRatio(3), 2, "high DPR is capped");
assertEqual(tournamentH2HSharePixelRatio(0), 1, "missing DPR is normalized");

assert(
  tournamentH2HShareCacheKey(standingsInput) !==
    tournamentH2HShareCacheKey({ ...standingsInput, event: 6 }),
  "GW switches invalidate the image cache",
);
assert(
  tournamentH2HShareCacheKey(matchesInput) !==
    tournamentH2HShareCacheKey({ ...matchesInput, kind: "matchups" }),
  "the shared tab invalidates the image cache",
);
assert(
  tournamentH2HShareCacheKey(matchesInput) !==
    tournamentH2HShareCacheKey({
      ...matchesInput,
      matchRows: matchesInput.matchRows.map((row, index) =>
        index === 0 ? { ...row, scoreText: "70 — 55" } : row,
      ),
    }),
  "score changes invalidate the image cache",
);

// Branding must paint after every row (LetLetMe share-image convention).
const textOperations: string[] = [];
const context = {
  scale() {},
  fillRect() {},
  strokeRect() {},
  fillText(text: string) {
    textOperations.push(text);
  },
  strokeText(text: string) {
    textOperations.push(`stroke:${text}`);
  },
  measureText(text: string) {
    return { width: text.length * 20 };
  },
  save() {},
  restore() {},
  translate() {},
  rotate() {},
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
  font: "",
  textAlign: "left" as const,
  textBaseline: "top" as const,
  globalAlpha: 1,
};
drawTournamentH2HSharePlan(context as never, standingsPlan);
let lastRowText = -1;
textOperations.forEach((text, index) => {
  if (text.includes("球队15")) lastRowText = index;
});
const firstBrandText = textOperations.findIndex(
  (text) => text === "LetLetMe" || text === "stroke:LetLetMe",
);
assert(lastRowText >= 0, "the last capped row reaches the canvas");
assert(firstBrandText > lastRowText, "watermark is painted after the table");

textOperations.length = 0;
drawTournamentH2HSharePlan(context as never, matchupsPlan);
assert(
  textOperations.includes("61 — 58"),
  "matchup scores reach the canvas",
);
assert(textOperations.includes("GW4"), "matchup GW labels reach the canvas");
assert(
  textOperations.includes("已结束"),
  "matchup status badges reach the canvas",
);

console.log("tournament-h2h-share-image tests passed");
