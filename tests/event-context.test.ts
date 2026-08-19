import {
  canReadEventReporting,
  positiveEventId,
  resolveEventContext
} from "../miniprogram/utils/event-context";

function assertContext(
  label: string,
  currentEvent: number | null,
  nextEvent: number | null,
  expected: { gw: number; nextGw: number; lastGw: number }
): void {
  const actual = resolveEventContext(currentEvent, nextEvent);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

assertContext("pre-season", null, 1, { gw: 1, nextGw: 1, lastGw: 0 });
assertContext("pre-season numeric zero", 0, 1, { gw: 1, nextGw: 1, lastGw: 0 });
assertContext("active season", 8, 9, { gw: 8, nextGw: 9, lastGw: 7 });
assertContext("GW38", 38, null, { gw: 38, nextGw: 38, lastGw: 37 });
assertContext("missing metadata", null, null, { gw: 0, nextGw: 0, lastGw: 0 });

if (positiveEventId(null) !== null || positiveEventId(0) !== null || positiveEventId(1) !== 1) {
  throw new Error("positiveEventId must reject 0/null and keep GW1");
}

function assertReporting(
  label: string,
  eventId: number,
  currentEvent: number | null,
  expected: boolean
): void {
  const actual = canReadEventReporting(eventId, currentEvent);
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

assertReporting("pre-season next GW1", 1, null, false);
assertReporting("pre-season numeric zero", 1, 0, false);
assertReporting("live GW1", 1, 1, true);
assertReporting("history during GW8", 5, 8, true);
assertReporting("future GW during GW8", 9, 8, false);

console.log("event-context tests passed");
