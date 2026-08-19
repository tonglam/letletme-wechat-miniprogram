import type {
  MarketPulse,
  MarketPulsePlayer,
} from "../miniprogram/services/price.service";

function assertEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertMatch(actual: string, pattern: RegExp, message: string): void {
  if (!pattern.test(actual)) {
    throw new Error(
      `${message}: ${JSON.stringify(actual)} does not match ${pattern}`,
    );
  }
}

function player(
  id: number,
  overrides: Partial<MarketPulsePlayer> = {},
): MarketPulsePlayer {
  return {
    playerId: id,
    webName: `Player${id}`,
    teamShortName: "ARS",
    position: "MIDFIELDER",
    price: 105,
    selectedByPercent: 40,
    ...overrides,
  };
}

const pulse: MarketPulse = {
  snapshot: {
    revision: "r1",
    source: "DATA_PUBLICATION",
    snapshotDate: "2026-08-14",
    capturedAt: null,
  },
  coverage: {
    requestedDays: 7,
    observedDays: 6,
    latestDate: "2026-08-14",
    complete: false,
    stale: true,
  },
  mostSelected: [player(1, { selectedByPercent: 55.24 })],
  transferMovers: [
    {
      player: player(4),
      transfersIn: 890123,
      transfersOut: 674500,
      netTransfers: 215623,
    },
  ],
  availabilityHighlights: [
    {
      player: player(5),
      status: "d",
      news: "Knock",
      observedDate: "2026-08-14",
      chanceOfPlayingThisRound: 75,
    },
  ],
  availabilityUpdateCount: 3,
  newPlayers: [{ player: player(6), firstObservedDate: "2026-08-12" }],
};

async function main(): Promise<void> {
  // The page module calls Page() at import time — shim it first, then import
  // dynamically (top-level await is unavailable in this CJS-transformed file).
  (globalThis as { Page?: (definition: unknown) => void }).Page = () =>
    undefined;
  const { buildPulseView } =
    await import("../miniprogram/pages/data/price/price");
  const view = buildPulseView(pulse);

  assertEqual(view.pulseStale, true, "coverage staleness surfaces");
  assertMatch(
    view.coverageText,
    /6\/7/,
    "coverage shows observed/requested days",
  );
  assertMatch(
    view.coverageText,
    /覆盖不完整/,
    "incomplete coverage is called out",
  );
  assertEqual(
    view.mostSelectedRows[0].valueText,
    "55.2%",
    "ownership percent renders one decimal",
  );
  assertEqual(
    view.mostSelectedRows[0].subText,
    "£10.5m",
    "price formats from FPL tenths",
  );
  assertEqual(
    view.mostSelectedRows[0].meta,
    "ARS · MID",
    "position maps to the short code",
  );
  assertEqual(
    "ownershipRiserRows" in view,
    false,
    "pulse view does not own dedicated ownership rows",
  );
  assertEqual(
    "ownershipFallerRows" in view,
    false,
    "pulse view does not own dedicated ownership rows",
  );
  assertEqual(
    view.transferRows[0].valueText,
    "+215.6k",
    "net transfers compact and signed",
  );
  assertEqual(view.transferRows[0].tone, "good", "positive net reads good");
  assertEqual(
    view.availabilityRows[0].valueText,
    "存疑",
    "status code d maps to 存疑",
  );
  assertMatch(
    view.availabilityRows[0].subText,
    /Knock/,
    "news text passes through",
  );
  assertMatch(
    view.availabilityRows[0].subText,
    /75%/,
    "chance of playing appended",
  );
  assertEqual(
    view.newPlayerRows[0].valueText,
    "£10.5m",
    "new player price formats",
  );
  assertMatch(
    view.newPlayerRows[0].subText,
    /2026-08-12/,
    "first observed date shown",
  );

  const empty = buildPulseView({
    snapshot: null,
    coverage: null,
    mostSelected: [],
    transferMovers: [],
    availabilityHighlights: [],
    availabilityUpdateCount: 0,
    newPlayers: [],
  });
  assertEqual(empty.coverageText, "", "no coverage means no coverage strip");
  assertEqual(empty.pulseStale, false, "no coverage means no stale flag");
  assertEqual(empty.mostSelectedRows.length, 0, "empty sections stay empty");

  console.log("market-pulse tests passed");
}

void main();
