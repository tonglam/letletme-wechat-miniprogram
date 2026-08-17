import { chipShareLabel } from "../utils/live-share";
import { liveTournamentMockData } from "./live-tournament.mock";

export const liveEntryMockData = {
  loading: false,
  refreshing: false,
  transfersLoading: false,
  hasData: true,
  noPicks: false,
  error: "",
  transfersError: "",
  emptyState: false,
  displayState: "fresh" as const,
  viewOnly: false,
  event: 3,
  maxGw: 38,
  entryId: 123456,
  entryName: "WhoamI FC",
  playerName: "Tong W",
  total: 72,
  livePoints: 72,
  netPoints: 62,
  transferCost: 10,
  captainText: "Haaland",
  chipText: "Bench Boost",
  playedText: "9 / 11",
  lastUpdated: "21:45",
  summaryTiles: [
    { label: "总分", value: "72" },
    { label: "实时分", value: "72" },
    { label: "净分", value: "62" },
    { label: "转会扣分", value: "-10" }
  ],
  starters: [
    { element: 301, name: "Raya", webName: "Raya", team: "ARS", teamShortName: "ARS", position: "GKP", elementType: 1, points: 6, livePoints: 6, multiplier: 1, captain: false, viceCaptain: false, pickActive: true, playStatus: 1, minutes: 90, goalsScored: 0, assists: 0, cleanSheets: 1, saves: 2, yellowCards: 0, redCards: 0, statusText: "已完赛", roleText: "", pointsText: "6", metaText: "90分钟 · CS", statusClass: "played" },
    { element: 302, name: "Alexander-Arnold", webName: "TAA", team: "LIV", teamShortName: "LIV", position: "DEF", elementType: 2, points: 12, livePoints: 12, multiplier: 1, captain: false, viceCaptain: false, pickActive: true, playStatus: 1, minutes: 90, goalsScored: 1, assists: 0, cleanSheets: 0, saves: 0, yellowCards: 0, redCards: 0, statusText: "已完赛", roleText: "", pointsText: "12", metaText: "90分钟 · 1球", statusClass: "played" },
    { element: 303, name: "Saliba", webName: "Saliba", team: "ARS", teamShortName: "ARS", position: "DEF", elementType: 2, points: 5, livePoints: 5, multiplier: 1, captain: false, viceCaptain: false, pickActive: true, playStatus: 2, minutes: 55, goalsScored: 0, assists: 0, cleanSheets: 1, saves: 0, defensiveContribution: 7, yellowCards: 0, redCards: 0, statusText: "比赛中", roleText: "", pointsText: "5", metaText: "55分钟 · CS待锁", statusClass: "played" },
    { element: 304, name: "Gabriel", webName: "Gabriel", team: "ARS", teamShortName: "ARS", position: "DEF", elementType: 2, points: 6, livePoints: 6, multiplier: 1, captain: false, viceCaptain: false, pickActive: true, playStatus: 1, minutes: 90, goalsScored: 0, assists: 0, cleanSheets: 1, saves: 0, yellowCards: 0, redCards: 0, statusText: "已完赛", roleText: "", pointsText: "6", metaText: "90分钟 · CS", statusClass: "played" },
    { element: 305, name: "Salah", webName: "Salah", team: "LIV", teamShortName: "LIV", position: "MID", elementType: 3, points: 8, livePoints: 8, multiplier: 1, captain: false, viceCaptain: true, pickActive: true, playStatus: 1, minutes: 90, goalsScored: 0, assists: 2, cleanSheets: 0, saves: 0, yellowCards: 0, redCards: 0, statusText: "已完赛", roleText: "VC", pointsText: "8", metaText: "90分钟 · 2助", statusClass: "played" },
    { element: 306, name: "Saka", webName: "Saka", team: "ARS", teamShortName: "ARS", position: "MID", elementType: 3, points: 3, livePoints: 3, multiplier: 1, captain: false, viceCaptain: false, pickActive: true, playStatus: 1, minutes: 72, goalsScored: 0, assists: 0, cleanSheets: 0, saves: 0, yellowCards: 1, redCards: 0, statusText: "已完赛", roleText: "", pointsText: "3", metaText: "72分钟 · 1黄", statusClass: "played" },
    { element: 307, name: "Palmer", webName: "Palmer", team: "CHE", teamShortName: "CHE", position: "MID", elementType: 3, points: 10, livePoints: 10, multiplier: 1, captain: false, viceCaptain: false, pickActive: true, playStatus: 1, minutes: 90, goalsScored: 1, assists: 1, cleanSheets: 0, saves: 0, yellowCards: 0, redCards: 0, statusText: "已完赛", roleText: "", pointsText: "10", metaText: "90分钟 · 1球1助", statusClass: "played" },
    { element: 308, name: "Rogers", webName: "Rogers", team: "AVL", teamShortName: "AVL", position: "MID", elementType: 3, points: 2, livePoints: 2, multiplier: 1, captain: false, viceCaptain: false, pickActive: true, playStatus: 1, minutes: 65, goalsScored: 0, assists: 0, cleanSheets: 0, saves: 0, yellowCards: 0, redCards: 0, statusText: "已完赛", roleText: "", pointsText: "2", metaText: "65分钟", statusClass: "played" },
    { element: 309, name: "Haaland", webName: "Haaland", team: "MCI", teamShortName: "MCI", position: "FWD", elementType: 4, points: 18, livePoints: 18, multiplier: 2, captain: true, viceCaptain: false, pickActive: true, playStatus: 1, minutes: 90, goalsScored: 2, assists: 0, cleanSheets: 0, saves: 0, yellowCards: 0, redCards: 0, statusText: "已完赛", roleText: "C", pointsText: "9×2", metaText: "90分钟 · 2球", statusClass: "played" },
    { element: 310, name: "Watkins", webName: "Watkins", team: "AVL", teamShortName: "AVL", position: "FWD", elementType: 4, points: 2, livePoints: 2, multiplier: 1, captain: false, viceCaptain: false, pickActive: true, playStatus: 1, minutes: 80, goalsScored: 0, assists: 0, cleanSheets: 0, saves: 0, yellowCards: 0, redCards: 0, statusText: "已完赛", roleText: "", pointsText: "2", metaText: "80分钟", statusClass: "played" },
    { element: 311, name: "Isak", webName: "Isak", team: "NEW", teamShortName: "NEW", position: "FWD", elementType: 4, points: 0, livePoints: 0, multiplier: 1, captain: false, viceCaptain: false, pickActive: true, playStatus: 0, minutes: 0, goalsScored: 0, assists: 0, cleanSheets: 0, saves: 0, yellowCards: 0, redCards: 0, statusText: "未出场", roleText: "", pointsText: "0", metaText: "待比赛", statusClass: "waiting" }
  ],
  bench: [
    { element: 312, name: "Flekken", webName: "Flekken", team: "BRE", teamShortName: "BRE", position: "GKP", elementType: 1, points: 3, livePoints: 3, multiplier: 0, captain: false, viceCaptain: false, pickActive: false, playStatus: 1, minutes: 90, goalsScored: 0, assists: 0, cleanSheets: 0, saves: 4, yellowCards: 0, redCards: 0, statusText: "已完赛", roleText: "", pointsText: "3", metaText: "90分钟", statusClass: "played" },
    { element: 313, name: "Ait-Nouri", webName: "Ait-Nouri", team: "WOL", teamShortName: "WOL", position: "DEF", elementType: 2, points: 1, livePoints: 1, multiplier: 0, captain: false, viceCaptain: false, pickActive: false, playStatus: 1, minutes: 45, goalsScored: 0, assists: 0, cleanSheets: 0, saves: 0, yellowCards: 0, redCards: 0, statusText: "已完赛", roleText: "", pointsText: "1", metaText: "45分钟", statusClass: "played" },
    { element: 314, name: "Dunk", webName: "Dunk", team: "BHA", teamShortName: "BHA", position: "DEF", elementType: 2, points: 0, livePoints: 0, multiplier: 0, captain: false, viceCaptain: false, pickActive: false, playStatus: 0, minutes: 0, goalsScored: 0, assists: 0, cleanSheets: 0, saves: 0, yellowCards: 0, redCards: 0, statusText: "未出场", roleText: "", pointsText: "0", metaText: "待比赛", statusClass: "waiting" }
  ],
  managers: [],
  transfers: [
    { inName: "Palmer", inTeam: "CHE", outName: "Eze", outTeam: "CRY", priceText: "£0.0m" },
    { inName: "Isak", inTeam: "NEW", outName: "Wood", outTeam: "NFO", priceText: "£0.0m" }
  ]
};

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Overlay the shared live-entry mock onto the tournament row the user tapped. */
export function resolveLiveEntryMock(entryId: number): typeof liveEntryMockData {
  const requested = numberValue(entryId);
  const row = (liveTournamentMockData.rows || []).find((item) => numberValue(item.entry) === requested);
  if (!row) {
    return {
      ...liveEntryMockData,
      entryId: requested || liveEntryMockData.entryId,
      viewOnly: requested > 0 && requested !== liveEntryMockData.entryId
    };
  }

  const livePoints = numberValue(row.livePoints);
  const netPoints = numberValue(row.liveNetPoints, livePoints);
  const total = numberValue(row.liveTotalPoints ?? row.totalPoints);
  const transferCost = numberValue(row.transferCost);
  const played = numberValue(row.played);
  const toPlay = numberValue(row.toPlay);

  return {
    ...liveEntryMockData,
    entryId: requested,
    entryName: String(row.entryName || `Entry ${requested}`),
    playerName: String(row.playerName || ""),
    livePoints,
    netPoints,
    total,
    transferCost,
    captainText: String(row.captainName || "-"),
    chipText: chipShareLabel(row.chip),
    playedText: `${played} / ${played + toPlay}`,
    viewOnly: requested !== liveEntryMockData.entryId,
    summaryTiles: [
      { label: "总分", value: String(total) },
      { label: "实时分", value: String(livePoints) },
      { label: "净分", value: String(netPoints) },
      { label: "转会扣分", value: transferCost > 0 ? `-${transferCost}` : "0" }
    ]
  };
}
