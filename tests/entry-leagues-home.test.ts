import {
  HOME_LEAGUE_PAGE_SIZE,
  isInvitationalLeague,
  normalizeHomeLeagueType,
  pageHomeLeagues,
  partitionHomeEntryLeagues
} from "../miniprogram/utils/entry-leagues";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function main(): void {
  assert(isInvitationalLeague({ officialKind: "INVITATIONAL" }), "explicit invitational");
  assert(!isInvitationalLeague({ officialKind: "SYSTEM", shortName: "overall" }), "overall is system");
  assert(!isInvitationalLeague({ officialKind: "SYSTEM", shortName: "brd-stan" }), "broadcaster is system");
  assert(isInvitationalLeague({}), "legacy rows without kind or short_name stay invitational");
  assertEqual(normalizeHomeLeagueType("h2h"), "H2H", "normalize h2h");
  assertEqual(normalizeHomeLeagueType("CLASSIC"), "CLASSIC", "normalize classic");
  assertEqual(normalizeHomeLeagueType(undefined), "CLASSIC", "missing type defaults classic");

  const partitioned = partitionHomeEntryLeagues([
    { id: 314, name: "Overall", officialKind: "SYSTEM" as const, shortName: "overall", type: "CLASSIC" },
    { id: 2, name: "Friends League", officialKind: "INVITATIONAL" as const, type: "CLASSIC" },
    { id: 3, name: "Office League", officialKind: "INVITATIONAL" as const, type: "CLASSIC" },
    { id: 4, name: "H2H Cup", officialKind: "INVITATIONAL" as const, type: "H2H" },
    { id: 5, name: "Another", officialKind: "INVITATIONAL" as const, type: "CLASSIC" },
    { id: 6, name: "Fifth", officialKind: "INVITATIONAL" as const, type: "CLASSIC" },
    { id: 7, name: "H2H Two", officialKind: "INVITATIONAL" as const, type: "H2H" },
    { id: 8, name: "H2H Three", officialKind: "INVITATIONAL" as const, type: "h2h" },
    { id: 9, name: "H2H Four", officialKind: "INVITATIONAL" as const, type: "H2H" },
    { id: 10, name: "H2H Five", officialKind: "INVITATIONAL" as const, type: "H2H" }
  ]);

  assertEqual(
    partitioned.classic.map((league) => league.name).join(","),
    "Friends League,Office League,Another,Fifth",
    "classic invitational only, caller order"
  );
  assertEqual(
    partitioned.h2h.map((league) => league.name).join(","),
    "H2H Cup,H2H Two,H2H Three,H2H Four,H2H Five",
    "h2h invitational only, caller order"
  );

  const classicPage = pageHomeLeagues(partitioned.classic, HOME_LEAGUE_PAGE_SIZE);
  assertEqual(classicPage.items.length, 4, "classic initial page size");
  assertEqual(classicPage.hasMore, false, "classic exactly 4 has no more");
  assertEqual(classicPage.total, 4, "classic total");

  const h2hPage = pageHomeLeagues(partitioned.h2h, HOME_LEAGUE_PAGE_SIZE);
  assertEqual(h2hPage.items.length, 4, "h2h initial page size");
  assertEqual(h2hPage.hasMore, true, "h2h fifth stays behind load more");
  assertEqual(
    h2hPage.items.map((league) => league.name).join(","),
    "H2H Cup,H2H Two,H2H Three,H2H Four",
    "h2h first page order"
  );

  const h2hMore = pageHomeLeagues(partitioned.h2h, HOME_LEAGUE_PAGE_SIZE * 2);
  assertEqual(h2hMore.items.length, 5, "h2h load more reveals remainder");
  assertEqual(h2hMore.hasMore, false, "h2h fully paged");

  console.log("entry-leagues-home tests passed");
}

main();
