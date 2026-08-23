import type { HomeH2HMatchup, HomeH2HMatchupSide } from "../models/entry";

export interface HomeH2HSideDisplay {
  primary: string;
  secondary: string;
}

export interface HomeH2HDisplay {
  officialMatchId: number;
  eventId: number;
  eventLabel: string;
  statusLabel: string;
  statusKey: "scheduled" | "live" | "final";
  centerLabel: string;
  showScore: boolean;
  viewer: HomeH2HSideDisplay;
  opponent: HomeH2HSideDisplay;
}

function sideDisplay(
  side: HomeH2HMatchupSide,
  fallback: string
): HomeH2HSideDisplay {
  const entryName = String(side.entryName || "").trim();
  const primary = String(side.playerName || "").trim() || entryName || fallback;
  return {
    primary,
    secondary: entryName && entryName !== primary ? entryName : ""
  };
}

function pointsText(value?: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

export function formatHomeH2HMatchup(matchup: HomeH2HMatchup): HomeH2HDisplay {
  const showScore = matchup.isLive || matchup.isFinal;
  const statusKey = matchup.isFinal ? "final" : matchup.isLive ? "live" : "scheduled";
  const statusLabel = matchup.isFinal ? "已结束" : matchup.isLive ? "进行中" : "待开始";
  const opponentFallback = matchup.isBye
    ? "轮空"
    : matchup.opponent.isAverage
      ? "平均分"
      : "待定";

  return {
    officialMatchId: matchup.officialMatchId,
    eventId: matchup.eventId,
    eventLabel: `GW${matchup.eventId}`,
    statusLabel,
    statusKey,
    centerLabel: showScore
      ? `${pointsText(matchup.viewer.points)} - ${pointsText(matchup.opponent.points)}`
      : "VS",
    showScore,
    viewer: sideDisplay(matchup.viewer, "我的球队"),
    opponent: matchup.isBye
      ? { primary: "轮空", secondary: "" }
      : sideDisplay(matchup.opponent, opponentFallback)
  };
}
