import {
  HOME_FIXTURE_SHARE_MAX_MATCHES,
  HOME_FIXTURE_SHARE_WIDTH,
  buildHomeFixtureSharePlan,
  drawHomeFixtureSharePlan,
  homeFixtureShareCacheKey,
  homeFixtureSharePixelRatio,
  type HomeFixtureShareInput,
} from "../miniprogram/utils/home-fixture-share-image";

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

const input: HomeFixtureShareInput = {
  title: "近期赛程",
  subtitle: "GW2 · 直播中",
  days: [
    {
      tabLabel: "30/08 周六",
      rows: [
        { homeName: "阿森纳", awayName: "布莱顿", centerLabel: "2-1", finished: true, live: false },
        { homeName: "利物浦", awayName: "曼城", centerLabel: "1-1", finished: false, live: true },
      ],
    },
    {
      tabLabel: "31/08 周日",
      rows: [
        { homeName: "切尔西", awayName: "热刺", centerLabel: "22:00", finished: false, live: false },
      ],
    },
  ],
};

const plan = buildHomeFixtureSharePlan(input);
assertEqual(plan.width, HOME_FIXTURE_SHARE_WIDTH, "share width");
assertEqual(plan.title, "近期赛程", "card title passes through");
assertEqual(plan.subtitle, "GW2 · 直播中", "GW subtitle passes through");
assertEqual(plan.days.length, 2, "both day groups are kept");
assertEqual(plan.totalMatches, 3, "total counts every match");
assertEqual(plan.shownMatches, 3, "nothing truncated under the cap");

// The defensive cap trims painted rows but never the reported total.
const bigPlan = buildHomeFixtureSharePlan({
  ...input,
  days: [
    {
      tabLabel: "30/08 周六",
      rows: Array.from({ length: HOME_FIXTURE_SHARE_MAX_MATCHES + 4 }, (_, index) => ({
        homeName: `主队${index + 1}`,
        awayName: `客队${index + 1}`,
        centerLabel: "22:00",
        finished: false,
        live: false,
      })),
    },
  ],
});
assertEqual(
  bigPlan.shownMatches,
  HOME_FIXTURE_SHARE_MAX_MATCHES,
  "painted rows stop at the cap",
);
assertEqual(
  bigPlan.totalMatches,
  HOME_FIXTURE_SHARE_MAX_MATCHES + 4,
  "the stats line still reports the full gameweek",
);

const emptyPlan = buildHomeFixtureSharePlan({ ...input, days: [] });
assert(emptyPlan.height < plan.height, "an unpublished gameweek stays compact");
assertEqual(emptyPlan.days.length, 0, "no day groups without rows");

// Days with zero rows never paint a bare day header.
const skippedPlan = buildHomeFixtureSharePlan({
  ...input,
  days: [{ tabLabel: "29/08 周五", rows: [] }, ...input.days],
});
assertEqual(skippedPlan.days.length, 2, "empty days are dropped");

assertEqual(homeFixtureSharePixelRatio(3), 2, "high DPR is capped");
assertEqual(homeFixtureSharePixelRatio(0), 1, "missing DPR is normalized");

assert(
  homeFixtureShareCacheKey(plan) !==
    homeFixtureShareCacheKey({ ...plan, subtitle: "GW3" }),
  "gameweek changes invalidate the image cache",
);
assert(
  homeFixtureShareCacheKey(plan) !==
    homeFixtureShareCacheKey(
      buildHomeFixtureSharePlan({
        ...input,
        days: input.days.map((day, index) =>
          index === 0
            ? {
                ...day,
                rows: day.rows.map((row, rowIndex) =>
                  rowIndex === 1 ? { ...row, centerLabel: "1-2" } : row,
                ),
              }
            : day,
        ),
      }),
    ),
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

drawHomeFixtureSharePlan(context as never, plan);
let lastRowText = -1;
textOperations.forEach((text, index) => {
  if (text.includes("切尔西")) lastRowText = index;
});
const firstBrandText = textOperations.findIndex(
  (text) => text === "LetLetMe" || text === "stroke:LetLetMe",
);
assert(lastRowText >= 0, "the last fixture row reaches the canvas");
assert(firstBrandText > lastRowText, "watermark is painted after the rows");
assert(textOperations.includes("30/08 周六"), "day tab label reaches the canvas");
assert(textOperations.includes("2-1"), "score reaches the canvas");
assert(textOperations.includes("22:00"), "kickoff time reaches the canvas");
assert(
  textOperations.some((text) => text.includes("共 3 场")),
  "match count reaches the canvas",
);
assert(
  textOperations.includes("时间按本机时区"),
  "the card's timezone note reaches the canvas",
);

textOperations.length = 0;
drawHomeFixtureSharePlan(context as never, emptyPlan);
assert(textOperations.includes("赛程还没公布"), "empty gameweeks keep the note");

textOperations.length = 0;
drawHomeFixtureSharePlan(context as never, bigPlan);
assert(
  textOperations.some((text) => text.includes(`展示前 ${HOME_FIXTURE_SHARE_MAX_MATCHES} 场`)),
  "truncation is stated on the image",
);

console.log("home-fixture-share-image tests passed");
