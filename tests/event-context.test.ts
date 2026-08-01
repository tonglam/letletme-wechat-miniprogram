import { resolveEventContext } from "../miniprogram/utils/event-context";

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
assertContext("active season", 8, 9, { gw: 8, nextGw: 9, lastGw: 7 });
assertContext("GW38", 38, null, { gw: 38, nextGw: 38, lastGw: 37 });
assertContext("missing metadata", null, null, { gw: 0, nextGw: 0, lastGw: 0 });
