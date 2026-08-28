import {
  HOME_MARKET_SHARE_MAX_ROWS,
  HOME_MARKET_SHARE_WIDTH,
  buildHomeMarketMoversSharePlan,
  buildHomeMarketWatchSharePlan,
  drawHomeMarketSharePlan,
  homeMarketShareCacheKey,
  homeMarketSharePixelRatio,
  type HomeMarketMoversShareInput,
  type HomeMarketWatchShareInput,
} from "../miniprogram/utils/home-market-share-image";

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

const moversInput: HomeMarketMoversShareInput = {
  title: "身价变化",
  subtitle: "更新于 8月27日 09:31",
  upTitle: "上涨",
  downTitle: "下跌",
  upRows: Array.from({ length: 7 }, (_, index) => ({
    name: `Riser${index + 1}`,
    team: "ARS",
    position: "MID",
    meta: "5.0 → 5.1",
    changeText: "+0.1",
    rising: true,
  })),
  downRows: [
    {
      name: "Faller",
      team: "LIV",
      position: "FWD",
      meta: "12.5 → 12.4",
      changeText: "-0.1",
      rising: false,
    },
  ],
};

const moversPlan = buildHomeMarketMoversSharePlan(moversInput);
assertEqual(moversPlan.width, HOME_MARKET_SHARE_WIDTH, "share width");
assertEqual(moversPlan.title, "身价变化", "card title passes through");
assertEqual(
  moversPlan.subtitle,
  "更新于 8月27日 09:31",
  "the card's 更新于 label passes through",
);
assertEqual(
  moversPlan.upRows.length,
  HOME_MARKET_SHARE_MAX_ROWS,
  "columns are capped",
);
assertEqual(moversPlan.downRows.length, 1, "short column passes through");

const emptyMoversPlan = buildHomeMarketMoversSharePlan({
  ...moversInput,
  upRows: [],
  downRows: [],
});
assert(
  emptyMoversPlan.height < moversPlan.height,
  "empty columns stay compact",
);

const watchInput: HomeMarketWatchShareInput = {
  title: "出场状态观察",
  subtitle: "更新于 8月27日 09:31",
  rows: [
    {
      name: "Saka",
      team: "ARS",
      owned: "31.2%",
      status: "出场存疑",
      tone: "down",
      body: "Ankle knock — 75% chance",
    },
    {
      name: "Palmer",
      team: "CHE",
      owned: "44.8%",
      status: "可出场",
      tone: "up",
      body: "球员已恢复可用，之前的伤停消息已清除。",
    },
  ],
};

const watchPlan = buildHomeMarketWatchSharePlan(watchInput);
assertEqual(watchPlan.kind, "watch", "watch plan kind");
assertEqual(watchPlan.rows.length, 2, "watch rows pass through");

assertEqual(homeMarketSharePixelRatio(3), 2, "high DPR is capped");
assertEqual(homeMarketSharePixelRatio(0), 1, "missing DPR is normalized");

assert(
  homeMarketShareCacheKey(moversPlan) !==
    homeMarketShareCacheKey({ ...moversPlan, subtitle: "更新于 8月28日 09:31" }),
  "subtitle changes invalidate the image cache",
);
assert(
  homeMarketShareCacheKey(moversPlan) !==
    homeMarketShareCacheKey(
      buildHomeMarketMoversSharePlan({
        ...moversInput,
        upRows: moversInput.upRows.map((row, index) =>
          index === 0 ? { ...row, changeText: "+0.2" } : row,
        ),
      }),
    ),
  "row changes invalidate the image cache",
);
assert(
  homeMarketShareCacheKey(watchPlan) !== homeMarketShareCacheKey(moversPlan),
  "plan kinds never share a cache entry",
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

drawHomeMarketSharePlan(context as never, moversPlan);
let lastRowText = -1;
textOperations.forEach((text, index) => {
  if (text.includes("Riser5")) lastRowText = index;
});
const firstBrandText = textOperations.findIndex(
  (text) => text === "LetLetMe · letletme.top",
);
assert(lastRowText >= 0, "the last capped row reaches the canvas");
assert(firstBrandText > lastRowText, "watermark is painted after the rows");
assert(textOperations.includes("上涨"), "column title reaches the canvas");
assert(textOperations.includes("+0.1"), "change text reaches the canvas");

textOperations.length = 0;
drawHomeMarketSharePlan(context as never, emptyMoversPlan);
assert(textOperations.includes("暂无"), "empty columns keep the 暂无 note");

textOperations.length = 0;
drawHomeMarketSharePlan(context as never, watchPlan);
assert(textOperations.includes("出场存疑"), "status pill reaches the canvas");
assert(
  textOperations.includes("Ankle knock — 75% chance"),
  "news body reaches the canvas",
);
assert(
  textOperations.some((text) => text.includes("ARS · 31.2%")),
  "team and ownership reach the canvas",
);

console.log("home-market-share-image tests passed");
