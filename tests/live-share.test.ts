import {
  chipShareLabel,
  copyShareText,
  formatLiveEntryShareText,
  formatLiveMatchShareText,
  formatLiveTournamentShareText,
  formatOfficialH2HShareText
} from "../miniprogram/utils/live-share";
import { resetPrivacyAuthorizationForTests } from "../miniprogram/utils/privacy";

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected to include ${JSON.stringify(expected)}\n${actual}`);
  }
}

if (chipShareLabel("TRIPLE_CAPTAIN") !== "Triple Captain") throw new Error("chip TC");
if (chipShareLabel("bboost") !== "Bench Boost") throw new Error("chip bboost (raw FPL api value)");
if (chipShareLabel("Bench Boost") !== "Bench Boost") throw new Error("chip label is idempotent");
if (chipShareLabel("") !== "无") throw new Error("chip empty");

const entryText = formatLiveEntryShareText({
  gameweek: 3,
  entryId: 123456,
  entryName: "WhoamI FC",
  playerName: "Tong W",
  livePoints: 72,
  netPoints: 62,
  totalPoints: 1856,
  transferCost: 10,
  transferCostKnown: true,
  chip: "WILDCARD",
  captainName: "Haaland",
  starters: [
    { name: "Haaland", teamShortName: "MCI", position: "FWD", captain: true, statusText: "已完赛", points: 18 },
    { name: "Salah", teamShortName: "LIV", position: "MID", viceCaptain: true, statusText: "已完赛", points: 8 }
  ],
  bench: [
    { name: "Dunk", teamShortName: "BHA", position: "DEF", statusText: "未出场", points: 0 }
  ]
});

assertIncludes(entryText, "# WhoamI FC · GW3 · 实时 72 (−10)", "entry title carries score and hits");
assertIncludes(entryText, "Tong W · 队长 Haaland · 赛季 1856 · Chip Wildcard", "meta line keeps chip names in English");
assertIncludes(entryText, "- Haaland (C) · MCI FWD · 18分", "finished players carry no status noise");
assertIncludes(entryText, "- Dunk · BHA DEF · 0分 · 未赛", "pending bench keeps a short status tag");
assertIncludes(entryText, "— 替补 —", "bench divider, not a heading");
if (entryText.includes("## ")) throw new Error("entry share stays one continuous list");
assertIncludes(entryText, "https://letletme.top/zh-CN/live/points/123456", "entry url");

const pendingTransferCostText = formatLiveEntryShareText({
  gameweek: 3,
  livePoints: 72,
  netPoints: 0,
  totalPoints: "—",
  transferCost: 0,
  transferCostKnown: false,
  starters: [],
  bench: []
});
assertIncludes(
  pendingTransferCostText,
  "转会扣分待确认",
  "entry share preserves an unknown transfer cost",
);

const tableText = formatLiveTournamentShareText({
  gameweek: 3,
  tournamentName: "Friends League",
  tournamentId: 2,
  highestText: "85",
  averageText: "62",
  entriesText: "2",
  rows: [
    { entryName: "Dream Team FC", playerName: "John D", visibleRank: 1, eventPointsKnown: true, playedText: "11/11", displayLive: "85", displayHit: "0", displayNet: "85", displayTotal: "2100", transferCostKnown: true },
    { entryName: "WhoamI FC", playerName: "Tong W", visibleRank: 2, eventPointsKnown: true, playedText: "9/11", displayLive: "72", displayHit: "-10", displayNet: "62", displayTotal: "1856", transferCostKnown: true },
    { entryName: "Pending FC", playerName: "Pending", visibleRank: 3, eventPointsKnown: false, displayLive: "—", displayHit: "—", displayTotal: "—", transferCostKnown: false }
  ]
});

assertIncludes(tableText, "# Friends League · GW3", "tournament title");
assertIncludes(tableText, "最高 85 · 平均 62 · 参赛 2", "stats");
assertIncludes(tableText, "1. Dream Team FC · GW 85 · 总 2100", "clean row");
assertIncludes(tableText, "2. WhoamI FC · GW 72 (−10) · 总 1856", "hit folds into GW");
assertIncludes(
  tableText,
  "—. Pending FC · GW — (转会扣分待确认) · 总 —",
  "tournament share preserves unavailable rank and transfer cost",
);
if (tableText.includes("Tong W ·") || tableText.includes("出场")) {
  throw new Error("tournament rows stay concise: no manager, no played count");
}
assertIncludes(tableText, "tournamentId=2", "tournament url");

// --- official H2H share copy (web OfficialH2HCompetitionView builders) ---
const h2hStandingsText = formatOfficialH2HShareText({
  kind: "standings",
  gameweek: 5,
  tournamentName: "WhoamI Cup",
  tournamentId: 9,
  standings: [
    { rankText: "1", entryName: "Dream Team FC", matchPointsText: "15", pointsForText: "512" },
    { rankText: "—", entryName: "Pending FC", matchPointsText: "0", pointsForText: "0" }
  ]
});
assertIncludes(h2hStandingsText, "# WhoamI Cup · GW5 对战总览", "h2h standings title");
assertIncludes(h2hStandingsText, "对战积分榜:", "h2h standings section");
assertIncludes(
  h2hStandingsText,
  "1. Dream Team FC · 15 对战积分 · 512 总得分",
  "h2h standings row (web line format)",
);
assertIncludes(h2hStandingsText, "—. Pending FC", "unranked keeps the dash");
assertIncludes(h2hStandingsText, "tournamentId=9", "h2h share carries the site link");

const h2hFixturesText = formatOfficialH2HShareText({
  kind: "matches",
  gameweek: 5,
  tournamentName: "WhoamI Cup",
  matches: [
    { homeName: "Dream Team FC", awayName: "WhoamI FC", scoreText: "66 — 55" },
    { homeName: "Pending FC", awayName: "平均队", scoreText: "对阵" }
  ]
});
assertIncludes(h2hFixturesText, "本轮对阵:", "h2h fixtures section");
assertIncludes(h2hFixturesText, "Dream Team FC 66 — 55 WhoamI FC", "scored fixture line");
assertIncludes(h2hFixturesText, "Pending FC 对阵 平均队", "scoreless fixture renders 对阵");

const h2hMatchupsText = formatOfficialH2HShareText({
  kind: "matchups",
  gameweek: 5,
  tournamentName: "WhoamI Cup",
  matches: [
    { labelText: "GW4", homeName: "WhoamI FC", awayName: "Dream Team FC", scoreText: "61 — 58" },
    { labelText: "GW5", homeName: "Dream Team FC", awayName: "WhoamI FC", scoreText: "对阵" }
  ]
});
assertIncludes(h2hMatchupsText, "# WhoamI Cup · 我的对阵", "my-matchups title");
assertIncludes(h2hMatchupsText, "GW4: WhoamI FC 61 — 58 Dream Team FC", "matchup history line");
assertIncludes(h2hMatchupsText, "GW5: Dream Team FC 对阵 WhoamI FC", "upcoming matchup line");

const matchText = formatLiveMatchShareText({
  matchId: 11,
  homeTeamDisplay: "ARS",
  awayTeamDisplay: "CHE",
  scoreText: "2-1",
  minuteText: "67'",
  statusClass: "status-playing",
  statusText: "比赛中",
  eventSummary: [
    { kind: "bonus", label: "奖励分", items: [{ name: "Saka", team: "ARS", text: "+3" }] },
    { kind: "goals", label: "进球", items: [{ name: "Saka", team: "ARS", text: "1" }] },
    {
      kind: "bps",
      label: "BPS",
      items: [48, 41, 32, 30, 28].map((value, index) => ({ name: `P${index + 1}`, team: "ARS", text: `${value}` }))
    }
  ]
});
assertIncludes(matchText, "ARS 2-1 CHE · 67'", "match header leads with scoreline and minute");
if (!(matchText.indexOf("进球") > 0 && matchText.indexOf("进球") < matchText.indexOf("奖励分"))) {
  throw new Error("share order follows the web: goals before bonus");
}
assertIncludes(matchText, "进球: Saka (ARS)", "single count omitted inline");
assertIncludes(matchText, "奖励分: Saka (ARS) +3", "bonus keeps its plus value");
if (matchText.includes("\n\n进球")) throw new Error("highlight groups stay inline, one line each");
if (matchText.includes("P4")) throw new Error("match share caps BPS at 3 rows");
assertIncludes(matchText, "实时比赛：https://letletme.top/zh-CN/live/matches", "match url");

const finishedMatchText = formatLiveMatchShareText({
  matchId: 12,
  homeTeamDisplay: "LIV",
  awayTeamDisplay: "MUN",
  scoreText: "3-0",
  minuteText: "90'",
  statusClass: "status-finished",
  statusText: "已完赛",
  eventSummary: []
});
assertIncludes(finishedMatchText, "LIV 3-0 MUN · 已完赛", "finished matches show the status, not the minute");

const provisionalFinishedText = formatLiveMatchShareText({
  matchId: 13,
  homeTeamDisplay: "LIV",
  awayTeamDisplay: "MUN",
  scoreText: "3-0",
  minuteText: "90'",
  status: "finished",
  statusClass: "status-finished",
  statusText: "等待官方结算",
  eventSummary: []
});
assertIncludes(provisionalFinishedText, "· 已完赛", "finished share text stays concise");
if (provisionalFinishedText.includes("等待官方结算")) {
  throw new Error("official-settlement wording is removed from match shares");
}

async function testCopyShareTextPrivacyFallback(): Promise<void> {
  resetPrivacyAuthorizationForTests();
  const toasts: string[] = [];
  (globalThis as { wx?: unknown }).wx = {
    setClipboardData({ fail }: { fail?: (err: { errno: number; errMsg: string }) => void }) {
      fail?.({
        errno: 112,
        errMsg: "setClipboardData:fail api scope is not declared in the privacy agreement"
      });
    },
    showToast({ title }: { title: string }) {
      toasts.push(title);
    }
  };

  const first = await copyShareText("GW3 实时积分");
  if (first) throw new Error("112 must fail the first clipboard write");
  if (!toasts[0].includes("长按文本")) throw new Error("112 tells the user to long-press");

  let setClipboardCalls = 0;
  (globalThis as { wx?: unknown }).wx = {
    setClipboardData() {
      setClipboardCalls += 1;
    },
    showToast({ title }: { title: string }) {
      toasts.push(title);
    }
  };
  const second = await copyShareText("GW3 实时积分");
  if (second) throw new Error("cached 112 must skip later clipboard writes");
  if (setClipboardCalls !== 0) throw new Error("blocked clipboard API must not be called again");
  resetPrivacyAuthorizationForTests();
}

void testCopyShareTextPrivacyFallback().then(() => {
  console.log("live-share tests passed");
});
