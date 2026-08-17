export const competitionsMockData = {
  loading: false,
  error: "",
  entryId: 123456,
  items: [
    { competitionId: 1, name: "FPL Cup", kind: "UNKNOWN" as const, lifecycle: "ACTIVE" as const, formatHint: "UNKNOWN" as const, participantCount: 500000, startedEventId: 1, endedEventId: 38 },
    { competitionId: 2, name: "Friends League", kind: "UNKNOWN" as const, lifecycle: "ACTIVE" as const, formatHint: "UNKNOWN" as const, participantCount: 20, startedEventId: 1, endedEventId: 38 },
    { competitionId: 3, name: "Office League", kind: "UNKNOWN" as const, lifecycle: "ACTIVE" as const, formatHint: "UNKNOWN" as const, participantCount: 15, startedEventId: 1, endedEventId: 38 }
  ],
  displayItems: [],
  keyword: "",
  fromCache: false
};
