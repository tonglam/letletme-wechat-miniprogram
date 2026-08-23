import { formatHomeH2HMatchup } from "../miniprogram/utils/home-h2h";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const scheduled = formatHomeH2HMatchup({
  officialMatchId: 1001,
  eventId: 2,
  isLive: false,
  isFinal: false,
  isBye: false,
  viewer: {
    entryId: 1,
    entryName: "LetLet XI",
    playerName: "Tong",
    isAverage: false,
    points: null
  },
  opponent: {
    entryId: 2,
    entryName: "Rival XI",
    playerName: "Rival",
    isAverage: false,
    points: null
  }
});

assertEqual(scheduled.eventLabel, "GW2", "scheduled gameweek");
assertEqual(scheduled.statusLabel, "待开始", "scheduled status");
assertEqual(scheduled.centerLabel, "VS", "scheduled matchup does not invent a score");
assertEqual(scheduled.viewer.primary, "Tong", "viewer manager is primary");
assertEqual(scheduled.viewer.secondary, "LetLet XI", "viewer team is secondary");
assertEqual(scheduled.opponent.primary, "Rival", "opponent manager is primary");

const live = formatHomeH2HMatchup({
  officialMatchId: 1002,
  eventId: 1,
  isLive: true,
  isFinal: false,
  isBye: false,
  viewer: {
    entryName: "LetLet XI",
    playerName: "Tong",
    isAverage: false,
    points: 24
  },
  opponent: {
    entryName: "Average",
    playerName: null,
    isAverage: true,
    points: 19
  }
});

assertEqual(live.statusLabel, "进行中", "live status");
assertEqual(live.centerLabel, "24 - 19", "live score");
assertEqual(live.opponent.primary, "Average", "average side keeps its supplied label");

const bye = formatHomeH2HMatchup({
  officialMatchId: 1003,
  eventId: 3,
  isLive: false,
  isFinal: false,
  isBye: true,
  viewer: {
    entryName: "LetLet XI",
    playerName: "Tong",
    isAverage: false,
    points: null
  },
  opponent: {
    entryName: null,
    playerName: null,
    isAverage: false,
    points: null
  }
});

assertEqual(bye.opponent.primary, "轮空", "bye label");
assertEqual(bye.centerLabel, "VS", "scheduled bye does not invent a score");

console.log("home-h2h tests passed");
