import {
  HOME_LEAGUES_SHARE_MAX_ROWS,
  HOME_LEAGUES_SHARE_WIDTH,
  buildHomeLeaguesSharePlan,
  drawHomeLeaguesSharePlan,
  homeLeaguesShareCacheKey,
  homeLeaguesSharePixelRatio,
  type HomeLeaguesShareInput,
} from "../miniprogram/utils/home-leagues-share-image";

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

const classicInput: HomeLeaguesShareInput = {
  kind: "classic",
  entryName: "WhoamI FC",
  playerName: "Tong W",
  total: 17,
  classicRows: Array.from({ length: 17 }, (_, index) => ({
    name: `联赛${index + 1}`,
    badgeText: index % 2 === 0 ? "公开" : "私人",
    badgePublic: index % 2 === 0,
    rankText: `#${index + 2}`,
    movementText: index % 3 === 0 ? `↑${index}` : "",
    movementTone: (index % 3 === 0 ? "up" : "") as "up" | "",
  })),
  h2hRows: [],
};

const classicPlan = buildHomeLeaguesSharePlan(classicInput);
assertEqual(classicPlan.width, HOME_LEAGUES_SHARE_WIDTH, "share width");
assertEqual(classicPlan.headerTitle, "经典联赛", "classic panel title");
assertEqual(
  classicPlan.eyebrow,
  "WhoamI FC · Tong W",
  "eyebrow carries team and manager",
);
assertEqual(classicPlan.statsLine, "共 17 个联赛", "stats strip");
assertEqual(
  classicPlan.classicRows.length,
  HOME_LEAGUES_SHARE_MAX_ROWS,
  "rows are capped",
);
assertEqual(classicPlan.truncated, 2, "overflow is counted");

const h2hInput: HomeLeaguesShareInput = {
  kind: "h2h",
  entryName: "WhoamI FC",
  playerName: "",
  total: 2,
  classicRows: [],
  h2hRows: [
    {
      name: "老友记 H2H",
      metaText: "GW5 · 进行中 · #2",
      hasMatchup: true,
      viewerName: "Tong W",
      opponentName: "Dream Team",
      centerText: "66 - 55",
    },
    {
      name: "公司杯 H2H",
      metaText: "#7",
      hasMatchup: false,
      viewerName: "",
      opponentName: "",
      centerText: "",
    },
  ],
};

const h2hPlan = buildHomeLeaguesSharePlan(h2hInput);
assertEqual(h2hPlan.headerTitle, "H2H 联赛", "h2h panel title");
assertEqual(h2hPlan.eyebrow, "WhoamI FC", "missing manager falls back");
assertEqual(h2hPlan.h2hRows.length, 2, "h2h rows pass through");
assert(h2hPlan.height < classicPlan.height, "short lists stay compact");

assertEqual(homeLeaguesSharePixelRatio(3), 2, "high DPR is capped");
assertEqual(homeLeaguesSharePixelRatio(0), 1, "missing DPR is normalized");

assert(
  homeLeaguesShareCacheKey(classicInput) !==
    homeLeaguesShareCacheKey({ ...classicInput, kind: "h2h" }),
  "panel kind invalidates the image cache",
);
assert(
  homeLeaguesShareCacheKey(classicInput) !==
    homeLeaguesShareCacheKey({
      ...classicInput,
      classicRows: classicInput.classicRows.map((row, index) =>
        index === 0 ? { ...row, rankText: "#9" } : row,
      ),
    }),
  "rank changes invalidate the image cache",
);
assert(
  homeLeaguesShareCacheKey(h2hInput) !==
    homeLeaguesShareCacheKey({
      ...h2hInput,
      h2hRows: h2hInput.h2hRows.map((row, index) =>
        index === 0 ? { ...row, centerText: "70 - 55" } : row,
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
drawHomeLeaguesSharePlan(context as never, classicPlan);
let lastRowText = -1;
textOperations.forEach((text, index) => {
  if (text.includes("联赛15")) lastRowText = index;
});
const firstBrandText = textOperations.findIndex(
  (text) => text === "LetLetMe" || text === "stroke:LetLetMe",
);
assert(lastRowText >= 0, "the last capped row reaches the canvas");
assert(firstBrandText > lastRowText, "watermark is painted after the rows");
assert(textOperations.includes("公开"), "visibility pills reach the canvas");

textOperations.length = 0;
drawHomeLeaguesSharePlan(context as never, h2hPlan);
assert(textOperations.includes("66 - 55"), "matchup score reaches the canvas");
assert(
  textOperations.includes("GW5 · 进行中 · #2"),
  "matchup meta reaches the canvas",
);
assert(
  textOperations.includes("暂无当前对阵"),
  "matchup-less leagues keep the empty note",
);

console.log("home-leagues-share-image tests passed");
