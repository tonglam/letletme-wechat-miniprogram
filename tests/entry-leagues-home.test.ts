import {
  isInvitationalLeague,
  selectHomeEntryLeagues
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

  const names = selectHomeEntryLeagues(
    [
      { id: 314, name: "Overall", officialKind: "SYSTEM" as const, shortName: "overall" },
      { id: 2, name: "Friends League", officialKind: "INVITATIONAL" as const },
      { id: 3, name: "Office League", officialKind: "INVITATIONAL" as const },
      { id: 4, name: "H2H Cup", officialKind: "INVITATIONAL" as const },
      { id: 5, name: "Another", officialKind: "INVITATIONAL" as const },
      { id: 6, name: "Fifth", officialKind: "INVITATIONAL" as const }
    ],
    4
  ).map((league) => league.name);

  assertEqual(names.length, 4, "home preview is capped at 4");
  assertEqual(
    names.join(","),
    "Friends League,Office League,H2H Cup,Another",
    "drops system leagues and keeps caller order"
  );
  console.log("entry-leagues-home tests passed");
}

main();
