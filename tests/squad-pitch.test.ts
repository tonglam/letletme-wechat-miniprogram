import {
  buildDreamTeamPitchState,
  buildPitchRows,
  buildSquadPitchView,
  formatSquadPitchHeaderView,
  isSquadPitchStarter,
  kitAsset,
  toSquadPitchHeader,
  toSquadPitchLists,
  toSquadPitchPlayer,
  type SquadPitchPickInput
} from "../miniprogram/utils/squad-pitch";
import {
  buildShareDrawPlan,
  resetShareImageCache,
  shareCacheKey
} from "../miniprogram/utils/squad-pitch-canvas";

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
const watermark = plan.layers.find((layer) => layer.type === "watermark");
assert(watermark?.type === "watermark" && watermark.title === "LETLETME", "LETLETME watermark");
assert(watermark?.type === "watermark" && watermark.url === "letletme.top", "letletme.top watermark");
assert(Math.abs(plan.height / plan.width - 5 / 4) < 0.003, "bench share uses 4/5");

resetShareImageCache();
assert(
  shareCacheKey({
    players: lists.players,
    benchPlayers: lists.benchPlayers,
    header
  }).includes("WhoamI FC"),
  "share cache key includes real team"
);