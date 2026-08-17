import { liveEntryMockData, resolveLiveEntryMock } from "../miniprogram/mocks/live-entry.mock";

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

const bound = resolveLiveEntryMock(123456);
assertEqual(bound.entryId, 123456, "bound entry keeps its id");
assertEqual(bound.entryName, "WhoamI FC", "bound entry keeps its team");
assertEqual(bound.viewOnly, false, "bound entry is not view-only");

const other = resolveLiveEntryMock(100001);
assertEqual(other.entryId, 100001, "tapped row keeps its entry id");
assertEqual(other.entryName, "Dream Team FC", "tapped row uses that team's name");
assertEqual(other.playerName, "John D", "tapped row uses that manager");
assertEqual(other.livePoints, 85, "tapped row uses that GW score");
assertEqual(other.viewOnly, true, "another team is view-only");
assert(other.entryName !== liveEntryMockData.entryName, "must not fall back to the bound team");

console.log("live-entry-mock tests passed");
