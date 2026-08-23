import type { LiveMatch } from "../miniprogram/models/live";
import {
  buildLiveMatchSharePlan,
  drawLiveMatchSharePlan,
  liveMatchShareCacheKey,
  liveMatchSharePixelRatio,
} from "../miniprogram/utils/live-match-share-image";
import { buildShareBrandLayout } from "../miniprogram/utils/share-image-brand";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const match: LiveMatch = {
  matchId: 11,
  status: "finished",
  statusClass: "status-finished",
  statusText: "等待官方结算",
  kickoffText: "08-23 19:30",
  homeTeamDisplay: "ARS",
  awayTeamDisplay: "CHE",
  scoreText: "2-1",
  minuteText: "90'",
  eventSummary: [
    {
      kind: "goals",
      label: "进球",
      items: [
        { name: "Saka", team: "ARS", text: "1" },
        { name: "Palmer", team: "CHE", text: "1" },
      ],
    },
    {
      kind: "bonus",
      label: "奖励分",
      items: [
        { name: "Saka", team: "ARS", text: "+3" },
        { name: "Rice", team: "ARS", text: "+2" },
      ],
    },
    {
      kind: "bps",
      label: "BPS",
      items: [
        { name: "Saka", team: "ARS", text: "41" },
        { name: "Rice", team: "ARS", text: "36" },
        { name: "Palmer", team: "CHE", text: "34" },
      ],
    },
  ],
};

const plan = buildLiveMatchSharePlan(match);
assertEqual(plan.width, 750, "share image width");
assertEqual(plan.statusText, "已完赛", "provisional copy is normalized");
assertEqual(plan.rows.length, 3, "every event group stays in the card");
assert(plan.rows.flatMap((row) => row.lines).join(" ").includes("Saka"), "Saka is rendered");
assert(plan.rows.flatMap((row) => row.lines).join(" ").includes("Palmer"), "Palmer is rendered");
assert(plan.height > 560, "event-heavy cards grow instead of clipping rows");
assertEqual(liveMatchSharePixelRatio(3), 2, "high DPR is capped");
assertEqual(liveMatchSharePixelRatio(0), 1, "missing DPR is normalized");

const changedScore = { ...match, scoreText: "3-1" };
assert(
  liveMatchShareCacheKey(match) !== liveMatchShareCacheKey(changedScore),
  "live score changes invalidate the generated image cache",
);

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
drawLiveMatchSharePlan(context as never, plan);
let lastEventText = -1;
textOperations.forEach((text, index) => {
  if (text.includes("Palmer (CHE) 34")) lastEventText = index;
});
const firstBrandText = textOperations.findIndex(
  (text) => text === "LetLetMe" || text === "stroke:LetLetMe",
);
assert(lastEventText >= 0, "every planned event reaches the canvas");
assert(firstBrandText > lastEventText, "watermark is painted after card content");
assertEqual(
  textOperations[textOperations.length - 1],
  "LetLetMe · letletme.top",
  "readable signature is the final text layer",
);

const watermark = buildShareBrandLayout(plan.width, plan.height);
const crops = [
  { left: 0, top: 0, right: plan.width / 2, bottom: plan.height },
  { left: plan.width / 2, top: 0, right: plan.width, bottom: plan.height },
  { left: 0, top: 0, right: plan.width, bottom: plan.height / 2 },
  { left: 0, top: plan.height / 2, right: plan.width, bottom: plan.height },
];
crops.forEach((crop) => {
  assert(
    watermark.tiles.some(
      (tile) =>
        tile.x >= crop.left &&
        tile.x <= crop.right &&
        tile.y >= crop.top &&
        tile.y <= crop.bottom,
    ),
    "every sampled half-image crop keeps a LetLetMe tile",
  );
});

console.log("live-match-share-image tests passed");
