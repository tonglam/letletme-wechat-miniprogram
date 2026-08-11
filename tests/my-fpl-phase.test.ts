import { deriveMyFplPhase, derivePrincipalDisplay } from "../miniprogram/utils/my-fpl-phase";
import type { MyFplPhase, MyFplPhaseInput } from "../miniprogram/models/my-fpl";
import type { MyFplPrincipalState, PrincipalDisplayInput } from "../miniprogram/models/principal";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

function phase(expected: MyFplPhase, input: MyFplPhaseInput, message: string): void {
  const actual = deriveMyFplPhase(input);
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function principal(expected: MyFplPrincipalState, input: PrincipalDisplayInput, message: string): void {
  const actual = derivePrincipalDisplay(input);
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

const DEADLINE = "2026-08-15T17:30:00.000Z";
const BEFORE = Date.parse("2026-08-10T00:00:00.000Z");
const AFTER = Date.parse("2026-08-20T00:00:00.000Z");

function testServerPhaseWins(): void {
  phase("SETTLED", { currentEvent: 1, snapshotState: "LIVE", now: BEFORE, serverPhase: "SETTLED" },
    "a valid server phase overrides every other signal");
  phase("LIVE", { currentEvent: 1, snapshotState: "LIVE", now: BEFORE, serverPhase: "garbage" },
    "an unknown server phase is ignored and derivation continues");
}

function testNoCurrentEvent(): void {
  phase("PRESEASON", { nextEvent: 1, now: BEFORE }, "no current event with a next event is preseason");
  phase("OFFSEASON", { now: BEFORE }, "no current and no next event is offseason");
}

function testSnapshotStates(): void {
  phase("LIVE", { currentEvent: 33, snapshotState: "LIVE", now: AFTER }, "live snapshot wins over a passed deadline");
  phase("PRE_DEADLINE", { currentEvent: 33, snapshotState: "SCHEDULED", now: AFTER }, "scheduled snapshot is pre-deadline");
  phase("SETTLED", { currentEvent: 33, snapshotState: "SETTLED", now: BEFORE }, "settled snapshot is settled");
}

function testDeadlineFallback(): void {
  phase("PRE_DEADLINE", { currentEvent: 33, nextUtcDeadline: DEADLINE, now: BEFORE },
    "no snapshot before the deadline is pre-deadline");
  phase("SETTLING", { currentEvent: 33, nextUtcDeadline: DEADLINE, now: AFTER },
    "no snapshot after the deadline falls back to settling, never a claimed final");
  phase("SETTLING", { currentEvent: 33, now: BEFORE },
    "active event with neither snapshot nor deadline is the safe settling fallback");
  phase("SETTLING", { currentEvent: 33, nextUtcDeadline: "not-a-date", now: BEFORE },
    "an unparseable deadline degrades to the settling fallback");
}

function testPrincipalDisplay(): void {
  principal("OFFLINE_CACHED", { entryId: 123, accountLinked: true, online: false, hasCachedContent: true },
    "offline with same-context cache shows the cached state even when ready");
  principal("READY", { entryId: 123, accountLinked: false, online: true, hasCachedContent: false },
    "a follow pointer alone is ready; account link is not required");
  principal("NO_FOLLOW", { accountLinked: true, online: true, hasCachedContent: false },
    "no follow pointer is no-follow even with a linked account");
  principal("NO_FOLLOW", { accountLinked: false, online: false, hasCachedContent: false },
    "offline without cache and without follow is no-follow, not an error");
}

function main(): void {
  testServerPhaseWins();
  testNoCurrentEvent();
  testSnapshotStates();
  testDeadlineFallback();
  testPrincipalDisplay();
  assert(true, "sanity");
  console.log("my-fpl-phase tests passed");
}

main();
