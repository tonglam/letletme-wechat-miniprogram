import {
  buildLiveSquadPitchState,
  buildDreamTeamPitchState,
  buildPitchRows,
  buildSquadPitchView,
  formatSquadPitchHeaderView,
  isSquadPitchStarter,
  kitAsset,
  normalizeSquadPitchLists,
  sortSquadPitchBench,
  toSquadPitchHeader,
  toSquadPitchLists,
  toSquadPitchPlayer,
  type SquadPitchPickInput
} from "../miniprogram/utils/squad-pitch";
import {
  buildShareDrawPlan,
  resetShareImageCache,
  shareCacheKey,
  shareExportPixelRatio,
  shareUsesPortraitLayout
} from "../miniprogram/utils/squad-pitch-canvas";
import { buildShareBrandLayout } from "../miniprogram/utils/share-image-brand";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function pick(partial: Partial<SquadPitchPickInput> & { webName: string; elementTypeName: string }): SquadPitchPickInput {
  return {
    teamShortName: "ARS",
    position: 1,
    multiplier: 1,
    totalPoints: 6,
    ...partial
  };
}

function formationPicks(def: number, mid: number, fwd: number): SquadPitchPickInput[] {
  const starters: SquadPitchPickInput[] = [
    pick({ webName: "Raya", elementTypeName: "GKP", teamShortName: "ARS", position: 1, totalPoints: 4 })
  ];
  let slot = 2;
  for (let i = 0; i < def; i += 1) {
    starters.push(pick({
      webName: `Def${i + 1}`,
      elementTypeName: "DEF",
      teamShortName: "LIV",
      position: slot,
      totalPoints: 6
    }));
    slot += 1;
  }
  for (let i = 0; i < mid; i += 1) {
    starters.push(pick({
      webName: `Mid${i + 1}`,
      elementTypeName: "MID",
      teamShortName: "CHE",
      position: slot,
      totalPoints: 8
    }));
    slot += 1;
  }
  for (let i = 0; i < fwd; i += 1) {
    starters.push(pick({
      webName: `Fwd${i + 1}`,
      elementTypeName: "FWD",
      teamShortName: "MCI",
      position: slot,
      isCaptain: i === 0,
      totalPoints: 12
    }));
    slot += 1;
  }
  return starters.concat([
    pick({ webName: "BenchGk", elementTypeName: "GKP", teamShortName: "BRE", position: 12, multiplier: 0, totalPoints: 3 }),
    pick({ webName: "BenchDef", elementTypeName: "DEF", teamShortName: "BHA", position: 13, multiplier: 0, totalPoints: 1 }),
    pick({ webName: "BenchMid", elementTypeName: "MID", teamShortName: "NEW", position: 14, multiplier: 0, totalPoints: 2 }),
    pick({ webName: "BenchFwd", elementTypeName: "FWD", teamShortName: "TOT", position: 15, multiplier: 0, totalPoints: 0 })
  ]);
}

const elevenAndFour = toSquadPitchLists(formationPicks(4, 4, 2));
assertEqual(elevenAndFour.players.length, 11, "11 starters");
assertEqual(elevenAndFour.benchPlayers.length, 4, "4 bench");
assertEqual(elevenAndFour.benchPlayers.map((player) => player.position).join(","), "GKP,DEF,MID,FWD", "bench order");

assertEqual(isSquadPitchStarter({ position: 12, multiplier: 1 }), false, "BB bench stays bench");
assertEqual(isSquadPitchStarter({ position: 8, multiplier: 0 }), true, "starter slot wins over multiplier");
assertEqual(isSquadPitchStarter({ multiplier: 0 }), false, "multiplier fallback");
assertEqual(isSquadPitchStarter({}), false, "missing lineup metadata is not a starter");

const mixedPlayers = formationPicks(4, 4, 2).flatMap((pick, index) => {
  const player = toSquadPitchPlayer(pick, `mixed-${index}`);
  return player ? [player] : [];
});
const mixedLists = normalizeSquadPitchLists(mixedPlayers);
assertEqual(mixedLists.players.length, 11, "mixed pitch input keeps XI");
assertEqual(mixedLists.benchPlayers.length, 4, "mixed pitch input creates bench");
assertEqual(mixedLists.benchPlayers[0]?.webName, "BenchGk", "mixed input keeps official bench order");

const shuffledBench = [
  toSquadPitchPlayer(pick({ webName: "Slot15Def", elementTypeName: "DEF", position: 15, multiplier: 0 }))!,
  toSquadPitchPlayer(pick({ webName: "Slot13Fwd", elementTypeName: "FWD", position: 13, multiplier: 0 }))!,
  toSquadPitchPlayer(pick({ webName: "Slot12Gk", elementTypeName: "GKP", position: 12, multiplier: 0 }))!,
  toSquadPitchPlayer(pick({ webName: "Slot14Mid", elementTypeName: "MID", position: 14, multiplier: 0 }))!
];
assertEqual(
  sortSquadPitchBench(shuffledBench).map((player) => player.webName).join(","),
  "Slot12Gk,Slot13Fwd,Slot14Mid,Slot15Def",
  "bench keeps official slots 12-15 instead of position order"
);

const livePitch = buildLiveSquadPitchState({
  starters: formationPicks(4, 4, 2).map((entry) => ({
    webName: entry.webName || undefined,
    teamShortName: entry.teamShortName || undefined,
    position: entry.elementTypeName || undefined,
    squadPosition: entry.position ?? undefined,
    totalPoints: entry.totalPoints ?? undefined
  }))
});
assertEqual(livePitch.pitchPlayers.length, 11, "live adapter keeps XI");
assertEqual(livePitch.pitchBench.length, 4, "live adapter creates bench from mixed starters");
assertEqual(livePitch.pitchBench[0]?.webName, "BenchGk", "live adapter keeps official bench order");

[
  { def: 3, mid: 4, fwd: 3 },
  { def: 4, mid: 4, fwd: 2 },
  { def: 3, mid: 5, fwd: 2 }
].forEach((shape) => {
  const lists = toSquadPitchLists(formationPicks(shape.def, shape.mid, shape.fwd));
  const rows = buildPitchRows(lists.players, true);
  assertEqual(rows.map((row) => `${row.position}:${row.players.length}`).join("|"), `GKP:1|DEF:${shape.def}|MID:${shape.mid}|FWD:${shape.fwd}`, `${shape.def}-${shape.mid}-${shape.fwd} rows`);
  const tops = rows.map((row) => row.top);
  assert(new Set(tops).size === tops.length, "row tops do not overlap");
  rows.forEach((row) => {
    assert(row.top.endsWith("%"), "row uses percent top");
    assert(row.cardWidth.endsWith("%"), "card width is percent");
    assert(Number.parseFloat(row.cardWidth) * row.players.length <= 90, "cards fit the row");
  });
});

const header = toSquadPitchHeader({
  eventId: 4,
  eventPoints: 117,
  overallPoints: 1420,
  overallRank: 235000,
  eventChip: "WILDCARD",
  entry: { entryName: "WhoamI FC", playerName: "Tong" }
});
const zh = formatSquadPitchHeaderView(header, "zh-CN");
const en = formatSquadPitchHeaderView(header, "en");
assertEqual(zh.teamName, "WhoamI FC", "keeps real team name");
assertEqual(zh.managerName, "Tong", "keeps real manager name");
assertEqual(zh.gwPoints, "117", "score only");
assertEqual(en.teamName, "WhoamI FC", "en team name");
assertEqual(en.gwPoints, "117", "en score");
assertEqual(toSquadPitchHeader({}).teamName, "", "no fake team name");

const captain = toSquadPitchPlayer(pick({
  webName: "Haaland",
  elementTypeName: "FWD",
  teamShortName: "MCI",
  isCaptain: true,
  totalPoints: 18
}));
const vice = toSquadPitchPlayer(pick({
  webName: "Salah",
  elementTypeName: "MID",
  teamShortName: "LIV",
  isViceCaptain: true,
  totalPoints: 8
}));
assert(Boolean(captain?.isCaptain), "captain flag");
assert(Boolean(vice?.isViceCaptain), "vice flag");
const marked = buildPitchRows([captain!, vice!], false);
assertEqual(marked.find((row) => row.position === "FWD")?.players[0].marker, "C", "C marker");
assertEqual(marked.find((row) => row.position === "MID")?.players[0].marker, "V", "V marker");

const boosted = buildSquadPitchView({
  eventChip: "BENCH_BOOST",
  eventPicks: formationPicks(3, 4, 3),
  entry: { entryName: "WhoamI FC", playerName: "Tong" }
}, "zh-CN");
assertEqual(boosted.benchBoost, true, "BB from real chip");

const unknownClub = toSquadPitchPlayer(pick({
  webName: "Ait-Nouri",
  elementTypeName: "DEF",
  teamShortName: "WOL",
  totalPoints: 1
}));
assertEqual(unknownClub?.teamCode, "", "unknown club is not invented");
assertEqual(unknownClub?.webName, "Ait-Nouri", "keeps real name");
assertEqual(kitAsset(""), "https://letletme.top/images/squad-pitch/kits/DEFAULT.png", "placeholder kit");
assertEqual(kitAsset("ARS"), "https://letletme.top/images/squad-pitch/kits/ARS.png", "club kit uses CDN");

const dream = buildDreamTeamPitchState([
  { webName: "Raya", teamShortName: "ARS", position: "GOALKEEPER", totalPoints: 6 },
  { player: { id: 2, webName: "Salah", team: { shortName: "LIV" }, position: "MIDFIELDER" }, totalPoints: 15 },
  { element: 3, webName: "Haaland", teamShortName: "MCI", elementType: 4, points: 18 }
], 3);
assertEqual(dream.pitchPlayers.length, 3, "dream team maps XI rows");
assertEqual(dream.pitchBench.length, 0, "dream team has no bench");
assertEqual(dream.pitchHeader.teamName, "梦之队", "dream team title");
assertEqual(dream.pitchHeader.managerName, "GW3", "dream team gw");
assertEqual(dream.pitchHeader.gameweekPoints, 39, "dream team score sums real points");
assertEqual(dream.pitchPlayers.find((player) => player.webName === "Raya")?.position, "GKP", "GOALKEEPER maps");
assertEqual(toSquadPitchPlayer(pick({ webName: "", elementTypeName: "MID" })), null, "blank name dropped");

const longName = toSquadPitchPlayer(pick({
  webName: "Alexander-Arnold",
  elementTypeName: "DEF",
  teamShortName: "LIV",
  totalPoints: 12
}));
assertEqual(longName?.webName, "Alexander-Arnold", "long name kept for CSS ellipsis");

const lists = toSquadPitchLists(formationPicks(3, 5, 2));
const plan = buildShareDrawPlan({
  players: lists.players,
  benchPlayers: lists.benchPlayers,
  header,
  benchBoost: true,
  locale: "zh-CN"
});
const types = plan.layers.map((layer) => layer.type);
assert(types.includes("background"), "share has background");
assert(types.includes("header"), "share has header");
assert(types.includes("watermark"), "share has watermark");
assertEqual(types.filter((type) => type === "starter").length, 11, "share has 11 starters");
assertEqual(types.filter((type) => type === "bench").length, 4, "share has 4 bench");
const starterLayers = plan.layers.filter((layer) => layer.type === "starter");
assert(starterLayers.every((layer) => layer.width <= plan.width * 0.17), "bench share narrows starter cards");
assert(starterLayers.every((layer) => layer.y < plan.height * 0.63), "bench share keeps starter rows above the panel");

const mixedPlan = buildShareDrawPlan({
  players: mixedPlayers,
  header,
  locale: "zh-CN"
});
assertEqual(mixedPlan.layers.filter((layer) => layer.type === "starter").length, 11, "share caps mixed input at XI");
assertEqual(mixedPlan.layers.filter((layer) => layer.type === "bench").length, 4, "share moves mixed overflow to bench");
assert(Math.abs(mixedPlan.height / mixedPlan.width - 5 / 4) < 0.003, "mixed share reserves bench panel");
assert(shareUsesPortraitLayout(mixedPlayers), "full squad share uses portrait layout before normalization");
assert(!shareUsesPortraitLayout(lists.players.slice(0, 11)), "XI-only share keeps plain layout");
const dreamSharePlan = buildShareDrawPlan({
  players: dream.pitchPlayers,
  header: dream.pitchHeader,
  locale: "zh-CN",
  forcePortrait: true
});
assert(shareUsesPortraitLayout(dream.pitchPlayers, [], true), "dream-team share opts into portrait layout");
assert(Math.abs(dreamSharePlan.height / dreamSharePlan.width - 5 / 4) < 0.003, "dream-team share uses portrait canvas");
assert(
  dreamSharePlan.layers.filter((layer) => layer.type === "starter").every((layer) => layer.width <= dreamSharePlan.width * 0.17),
  "dream-team share narrows starter cards"
);
const watermark = plan.layers.find((layer) => layer.type === "watermark");
assert(watermark?.type === "watermark" && watermark.title === "LetLetMe", "LetLetMe watermark");
assert(watermark?.type === "watermark" && watermark.url === "letletme.top", "letletme.top watermark");
assert(Math.abs(plan.height / plan.width - 5 / 4) < 0.003, "bench share uses 4/5");

const brandLayout = buildShareBrandLayout(plan.width, plan.height);
assert(brandLayout.tiles.length >= 20, "watermark repeats across the complete share image");
assert(
  brandLayout.tiles.some((tile) => tile.x < plan.width * 0.25 && tile.y < plan.height * 0.25),
  "watermark covers the top-left crop"
);
assert(
  brandLayout.tiles.some((tile) => tile.x > plan.width * 0.75 && tile.y > plan.height * 0.75),
  "watermark covers the bottom-right crop"
);
for (const crop of [
  { x: 0, y: 0, width: plan.width / 2, height: plan.height / 2 },
  { x: plan.width / 2, y: 0, width: plan.width / 2, height: plan.height / 2 },
  { x: 0, y: plan.height / 2, width: plan.width / 2, height: plan.height / 2 },
  { x: plan.width / 2, y: plan.height / 2, width: plan.width / 2, height: plan.height / 2 }
]) {
  assert(
    brandLayout.tiles.some((tile) => (
      tile.x >= crop.x && tile.x <= crop.x + crop.width &&
      tile.y >= crop.y && tile.y <= crop.y + crop.height
    )),
    "every half-image crop keeps a watermark"
  );
}
assertEqual(shareExportPixelRatio(3), 2, "share export caps high-DPR devices at 2x");
assertEqual(shareExportPixelRatio(0), 1, "share export normalizes missing DPR");

resetShareImageCache();
assert(
  shareCacheKey({
    players: lists.players,
    benchPlayers: lists.benchPlayers,
    header
  }).includes("WhoamI FC"),
  "share cache key includes real team"
);
