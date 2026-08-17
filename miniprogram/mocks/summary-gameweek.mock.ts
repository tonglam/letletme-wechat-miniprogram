export const summaryGameweekMockData = {
  loading: false,
  refreshing: false,
  error: "",
  summaryError: "",
  dreamTeamError: "",
  eliteError: "",
  transfersError: "",
  staleNotice: "",
  event: 3,
  maxGw: 38,
  activeTab: "summary" as const,
  showSummary: true,
  showDreamTeam: false,
  showElite: false,
  showTransfers: false,
  headlineStats: [
    { label: "最高分", value: "127", meta: "Let It Be", tone: "default" as const },
    { label: "平均分", value: "62", tone: "default" as const }
  ],
  mostRows: [
    { label: "最多选择球员", value: "Haaland (MCI)", tone: "default" as const },
    { label: "本轮最佳球员", value: "Palmer (CHE)", meta: "18分", tone: "default" as const },
    { label: "最多选择队长", value: "Haaland (MCI)", tone: "default" as const },
    { label: "最多选择副队长", value: "Salah (LIV)", tone: "default" as const },
    { label: "最多转入", value: "Palmer (CHE)", tone: "default" as const },
    { label: "最多转出", value: "Rashford (MUN)", tone: "default" as const }
  ],
  chipRows: [
    { id: "chip-0", title: "Wildcard", value: "1.2m", meta: "开卡数量", barStyle: "width: 100%;", tone: "default" as const },
    { id: "chip-1", title: "Triple Captain", value: "789k", meta: "开卡数量", barStyle: "width: 66%;", tone: "default" as const },
    { id: "chip-2", title: "Bench Boost", value: "457k", meta: "开卡数量", barStyle: "width: 38%;", tone: "default" as const },
    { id: "chip-3", title: "Free Hit", value: "346k", meta: "开卡数量", barStyle: "width: 29%;", tone: "default" as const }
  ],
  pitchGroups: [
    {
      id: "gkp",
      title: "GKP",
      emptyText: "该位置还没有梦之队球员",
      players: [
        { id: "gkp-0", name: "Raya", team: "ARS", points: "12", minutes: 90, saves: 9, cleanSheets: 1, bonus: 3, bps: 42 }
      ]
    },
    {
      id: "def",
      title: "DEF",
      emptyText: "该位置还没有梦之队球员",
      players: [
        { id: "def-0", name: "Alexander-Arnold", team: "LIV", points: "18", minutes: 90, goalsScored: 1, assists: 1, cleanSheets: 1, bonus: 3, bps: 55 },
        { id: "def-1", name: "Gabriel", team: "ARS", points: "15", minutes: 90, goalsScored: 1, cleanSheets: 1, bonus: 3, bps: 48 },
        { id: "def-2", name: "Trippier", team: "NEW", points: "12", minutes: 90, assists: 1, cleanSheets: 1, bonus: 3, bps: 36 }
      ]
    },
    {
      id: "mid",
      title: "MID",
      emptyText: "该位置还没有梦之队球员",
      players: [
        { id: "mid-0", name: "Palmer", team: "CHE", points: "18", minutes: 90, goalsScored: 2, assists: 1, bonus: 3, bps: 61 },
        { id: "mid-1", name: "Salah", team: "LIV", points: "15", minutes: 90, goalsScored: 2, cleanSheets: 1, bonus: 2, bps: 52 },
        { id: "mid-2", name: "Saka", team: "ARS", points: "12", minutes: 90, goalsScored: 1, assists: 1, bonus: 2, bps: 44 }
      ]
    },
    {
      id: "fwd",
      title: "FWD",
      emptyText: "该位置还没有梦之队球员",
      players: [
        { id: "fwd-0", name: "Haaland", team: "MCI", points: "18", minutes: 90, goalsScored: 3, assists: 1, bonus: 1, bps: 68 },
        { id: "fwd-1", name: "Isak", team: "NEW", points: "12", minutes: 90, goalsScored: 2, bonus: 2, bps: 41 }
      ]
    }
  ],
  eliteRows: [
    { id: "e1", title: "Haaland (MCI)", value: "18分", meta: "总分 210", description: "选择率 62.5%", tone: "good" as const, name: "Haaland", team: "MCI", position: "FWD", points: 18, minutes: 90, goalsScored: 3, assists: 1, bonus: 1, bps: 68 },
    { id: "e2", title: "Palmer (CHE)", value: "18分", meta: "总分 142", description: "选择率 48.8%", tone: "good" as const, name: "Palmer", team: "CHE", position: "MID", points: 18, minutes: 90, goalsScored: 2, assists: 1, bonus: 3, bps: 61 },
    { id: "e3", title: "Alexander-Arnold (LIV)", value: "18分", meta: "总分 121", description: "选择率 33.1%", tone: "good" as const, name: "Alexander-Arnold", team: "LIV", position: "DEF", points: 18, minutes: 90, goalsScored: 1, assists: 1, cleanSheets: 1, bonus: 3, bps: 55 },
    { id: "e4", title: "Salah (LIV)", value: "15分", meta: "总分 135", description: "选择率 55.2%", tone: "good" as const, name: "Salah", team: "LIV", position: "MID", points: 15, minutes: 90, goalsScored: 2, cleanSheets: 1, bonus: 2, bps: 52 },
    { id: "e5", title: "Gabriel (ARS)", value: "15分", meta: "总分 108", description: "选择率 21.4%", tone: "good" as const, name: "Gabriel", team: "ARS", position: "DEF", points: 15, minutes: 90, goalsScored: 1, cleanSheets: 1, bonus: 3, bps: 48 }
  ],
  transfersInRows: [
    { id: "ti1", title: "Palmer (CHE)", value: "890k", meta: "总分 142", description: "", tone: "accent" as const },
    { id: "ti2", title: "Isak (NEW)", value: "650k", meta: "总分 96", description: "", tone: "accent" as const },
    { id: "ti3", title: "Rogers (AVL)", value: "420k", meta: "总分 71", description: "", tone: "accent" as const }
  ],
  transfersOutRows: [
    { id: "to1", title: "Rashford (MUN)", value: "780k", meta: "总分 58", description: "", tone: "bad" as const },
    { id: "to2", title: "Nkunku (CHE)", value: "520k", meta: "总分 44", description: "", tone: "bad" as const },
    { id: "to3", title: "Eze (CRY)", value: "380k", meta: "总分 52", description: "", tone: "bad" as const }
  ],
  hasSummary: true,
  hasDreamTeam: true,
  hasElite: true,
  hasTransfers: true
};
