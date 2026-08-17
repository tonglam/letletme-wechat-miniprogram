function withStatText(player: { form: number; selectedByPercent: number }) {
  return `状态 ${player.form.toFixed(1)} · 持有 ${player.selectedByPercent.toFixed(1)}%`;
}

const mockPlayers = [
  { element: 301, code: 301, name: "Haaland", teamId: 13, team: "MCI", teamName: "Man City", position: "FWD", price: 14.1, priceText: "£14.1m", totalPoints: 187, form: 7.2, selectedByPercent: 52.6 },
  { element: 302, code: 302, name: "Salah", teamId: 12, team: "LIV", teamName: "Liverpool", position: "MID", price: 13.1, priceText: "£13.1m", totalPoints: 165, form: 6.1, selectedByPercent: 55.2 },
  { element: 303, code: 303, name: "Palmer", teamId: 6, team: "CHE", teamName: "Chelsea", position: "MID", price: 10.6, priceText: "£10.6m", totalPoints: 152, form: 6.8, selectedByPercent: 48.8 },
  { element: 304, code: 304, name: "Saka", teamId: 1, team: "ARS", teamName: "Arsenal", position: "MID", price: 10.1, priceText: "£10.1m", totalPoints: 148, form: 5.9, selectedByPercent: 45.1 },
  { element: 305, code: 305, name: "Watkins", teamId: 2, team: "AVL", teamName: "Aston Villa", position: "FWD", price: 8.5, priceText: "£8.5m", totalPoints: 121, form: 4.2, selectedByPercent: 28.4 },
  { element: 306, code: 306, name: "Isak", teamId: 15, team: "NEW", teamName: "Newcastle", position: "FWD", price: 8.8, priceText: "£8.8m", totalPoints: 118, form: 5.1, selectedByPercent: 21.9 },
  { element: 307, code: 307, name: "Alexander-Arnold", teamId: 12, team: "LIV", teamName: "Liverpool", position: "DEF", price: 7.2, priceText: "£7.2m", totalPoints: 96, form: 3.8, selectedByPercent: 18.2 },
  { element: 308, code: 308, name: "Raya", teamId: 1, team: "ARS", teamName: "Arsenal", position: "GKP", price: 5.6, priceText: "£5.6m", totalPoints: 74, form: 3.1, selectedByPercent: 12.4 },
  { element: 309, code: 309, name: "Rogers", teamId: 2, team: "AVL", teamName: "Aston Villa", position: "MID", price: 5.3, priceText: "£5.3m", totalPoints: 68, form: 4.6, selectedByPercent: 4.8 },
  { element: 310, code: 310, name: "Gabriel", teamId: 1, team: "ARS", teamName: "Arsenal", position: "DEF", price: 6.3, priceText: "£6.3m", totalPoints: 82, form: 3.4, selectedByPercent: 22.7 }
].map((player) => ({ ...player, statText: withStatText(player) }));

export const dataPlayersMockData = {
  loading: false,
  loadingMore: false,
  error: "",
  loadMoreError: "",
  keyword: "",
  players: mockPlayers,
  displayedPlayers: mockPlayers,
  nextCursor: null,
  totalCount: mockPlayers.length,
  hasMore: false
};

/* ---- 双球员对比的 desk 数据(确定性与目录行派生,镜像 playerStatsDesk 契约) ---- */

const POSITION_TO_ELEMENT_TYPE: Record<string, number> = { GKP: 1, DEF: 2, MID: 3, FWD: 4 };
const POSITION_TO_TYPE_NAME: Record<string, string> = { GKP: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward" };

function mockDeskEntry(player: (typeof mockPlayers)[number]): import("../services/player.service").PlayerStatsDeskEntry {
  const attackWeight = player.position === "FWD" ? 1 : player.position === "MID" ? 0.62 : player.position === "DEF" ? 0.18 : 0.02;
  const goalsScored = Math.round(player.totalPoints * attackWeight * 0.09);
  const assists = Math.round(player.totalPoints * attackWeight * 0.06);
  const cleanSheets = player.position === "GKP" || player.position === "DEF"
    ? Math.round(player.totalPoints * 0.1)
    : 0;
  const minutes = 1350 + ((player.element * 137) % 900);
  const starts = Math.max(1, Math.round(minutes / 88));
  const bonus = Math.round(player.totalPoints * 0.16);
  const expectedGoals = Math.round(goalsScored * 8.5) / 10;
  const expectedAssists = Math.round(assists * 7.5) / 10;
  const transfersInEvent = 40000 + ((player.element * 7919) % 850000);
  const transfersOutEvent = 30000 + ((player.element * 104729) % 700000);
  return {
    playerId: player.element,
    overview: {
      id: player.element,
      webName: player.name,
      teamShortName: player.team,
      elementType: POSITION_TO_ELEMENT_TYPE[player.position] || 3,
      elementTypeName: POSITION_TO_TYPE_NAME[player.position] || "Midfielder",
      price: player.price,
      startPrice: Math.round((player.price - 0.2) * 10) / 10,
      totalPoints: player.totalPoints,
      selectedByPercent: player.selectedByPercent,
      form: player.form,
      seasonTransfersIn: transfersInEvent * 14,
      seasonTransfersOut: transfersOutEvent * 14,
      transfersInEvent,
      transfersOutEvent,
      minutes,
      starts,
      goalsScored,
      assists,
      cleanSheets,
      bonus,
      bps: bonus * 24 + (player.element % 40),
      expectedGoals,
      expectedAssists,
      expectedGoalInvolvements: Math.round((expectedGoals + expectedAssists) * 10) / 10
    },
    ictIndex: Math.round((goalsScored * 4 + assists * 3 + (minutes / 90) * 2.2) * 10) / 10
  };
}

export const dataPlayersMockDesk: Record<number, import("../services/player.service").PlayerStatsDeskEntry> =
  Object.fromEntries(mockPlayers.map((player) => [player.element, mockDeskEntry(player)]));

