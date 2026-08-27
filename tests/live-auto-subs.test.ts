import {
  autoSubRoleMap,
  deriveLiveAutoSubProjection,
} from "../miniprogram/utils/live-auto-subs";
import type { LivePlayerRow } from "../miniprogram/models/live";

function check(label: string, condition: boolean, detail?: unknown): void {
  if (!condition) {
    throw new Error(
      `${label} failed${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`,
    );
  }
}

let nextElement = 100;

function pick(
  overrides: Partial<LivePlayerRow> & {
    squadPosition: number;
    elementType: number;
  },
): LivePlayerRow {
  nextElement += 1;
  return {
    element: nextElement,
    webName: `P${nextElement}`,
    minutes: 90,
    multiplier: 1,
    ...overrides,
  };
}

/** A legal 4-4-2 with a 4-man bench (GK first, per FPL order). */
function squad(
  overrides: Record<number, Partial<LivePlayerRow>> = {},
): LivePlayerRow[] {
  nextElement = 0;
  const types = [1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 1, 3, 3, 4];
  return types.map((elementType, index) =>
    pick({
      squadPosition: index + 1,
      elementType,
      ...(overrides[index + 1] || {}),
    }),
  );
}

// --- no projection when everyone plays -----------------------------------
{
  const projection = deriveLiveAutoSubProjection({ chip: "", pickList: squad() });
  check("idle state", projection.state === "NONE");
  check("idle no subs", projection.substitutions.length === 0);
  check("idle no promotion", projection.captainPromotion === null);
  check("idle XI", projection.activePlayerIds.length === 11);
}

// --- predicted sub: confirmed zero-minute starter swaps with first bench ---
{
  const picks = squad({ 5: { minutes: 0, isGwFinished: true } });
  const projection = deriveLiveAutoSubProjection({ chip: "", pickList: picks });
  check("predicted state", projection.state === "PREDICTED");
  check("one sub", projection.substitutions.length === 1);
  const sub = projection.substitutions[0];
  check("out is the blanked starter", sub.playerOutId === String(picks[4].element));
  // First bench pick is the GK (slot 12) — an outfield starter must not swap
  // with a GK, so slot 13 comes in.
  check("in is slot 13", sub.playerInId === String(picks[12].element));
  check("sub-in takes the starter slot", projection.effectivePositions[sub.playerInId] === 5);
  check("sub-out drops to the bench slot", projection.effectivePositions[sub.playerOutId] === 13);
}

// --- bench no-show is skipped to the next bench player ---------------------
{
  const picks = squad({
    5: { minutes: 0, isGwFinished: true },
    13: { minutes: 0, isGwFinished: true },
  });
  const projection = deriveLiveAutoSubProjection({ chip: "", pickList: picks });
  check("skip blanked bench", projection.substitutions.length === 1);
  check(
    "slot 14 comes in",
    projection.substitutions[0].playerInId === String(picks[13].element),
  );
}

// --- GK starter only swaps with the bench GK -------------------------------
{
  const picks = squad({ 1: { minutes: 0, isGwFinished: true } });
  const projection = deriveLiveAutoSubProjection({ chip: "", pickList: picks });
  check("gk sub found", projection.substitutions.length === 1);
  check(
    "gk swapped for gk",
    projection.substitutions[0].playerInId === String(picks[11].element),
  );
}

// --- predicted captain promotion when the armband blanks and VC played -----
{
  const picks = squad({
    7: { isCaptain: true, captain: true, minutes: 0, isGwFinished: true },
    8: { isViceCaptain: true, viceCaptain: true, minutes: 60 },
  });
  const projection = deriveLiveAutoSubProjection({ chip: "", pickList: picks });
  check("promotion predicted", projection.captainPromotion?.state === "PREDICTED");
  check(
    "promotion target is VC",
    projection.captainPromotion?.playerInId === String(picks[7].element),
  );
  check(
    "promotion source is C",
    projection.captainPromotion?.playerOutId === String(picks[6].element),
  );
  // The blanked captain also triggered a normal auto-sub from the bench.
  check(
    "bench covers the blank",
    projection.substitutions[0]?.playerInId === String(picks[12].element),
  );
}

// --- no captain promotion while the captain's fixture is still pending -----
{
  const picks = squad({
    7: { isCaptain: true, captain: true, minutes: 0, isGwFinished: false },
    8: { isViceCaptain: true, viceCaptain: true, minutes: 60 },
  });
  const projection = deriveLiveAutoSubProjection({ chip: "", pickList: picks });
  check("pending captain stays", projection.captainPromotion === null);
  check("pending starter stays", projection.substitutions.length === 0);
}

// --- bench boost keeps the XI and emits no substitutions -------------------
{
  const picks = squad({
    5: { minutes: 0, isGwFinished: true },
    7: { isCaptain: true, captain: true, minutes: 0, isGwFinished: true },
    8: { isViceCaptain: true, viceCaptain: true, minutes: 60 },
  });
  const projection = deriveLiveAutoSubProjection({ chip: "bboost", pickList: picks });
  check("bb flag", projection.benchBoostActive === true);
  check("bb no subs", projection.substitutions.length === 0);
  check("bb still promotes captain", projection.captainPromotion?.state === "PREDICTED");
  check("bb XI intact", projection.activePlayerIds.length === 11);
}

// --- terminal flags drive an OFFICIAL projection without minute heuristics -
{
  const picks = squad({
    5: { minutes: 0, isGwFinished: true, pickActive: false },
    12: { pickActive: false },
    13: { pickActive: true, autoSub: true },
    14: { pickActive: false },
    15: { pickActive: false },
    7: {
      isCaptain: true,
      captain: true,
      minutes: 0,
      isGwFinished: true,
      pickActive: true,
      multiplier: 0,
    },
    8: {
      isViceCaptain: true,
      viceCaptain: true,
      minutes: 60,
      pickActive: true,
      multiplier: 2,
    },
  });
  const flagged = picks.map((p) =>
    typeof p.pickActive === "boolean" ? p : { ...p, pickActive: true },
  );
  const projection = deriveLiveAutoSubProjection({
    chip: "",
    pickList: flagged,
    score: { state: "FINAL" },
  });
  check("official state", projection.state === "OFFICIAL");
  check("official sub", projection.substitutions.length === 1);
  check("official sub state", projection.substitutions[0].state === "OFFICIAL");
  check(
    "official sub in",
    projection.substitutions[0].playerInId === String(picks[12].element),
  );
  // Multiplier ≥ 2 on the VC publishes the auto-captain promotion.
  check("official promotion", projection.captainPromotion?.state === "OFFICIAL");
  check(
    "official promotion target",
    projection.captainPromotion?.playerInId === String(picks[7].element),
  );
}

// --- server effectiveLineup adopts the materialized XI ---------------------
{
  // Real backend shape (verified against settled GW1): pickList keeps ORIGINAL
  // slots, effectiveLineup carries EFFECTIVE slots — the sub is already
  // materialized, so no in/out pairing is reconstructed (matches the web
  // engine).
  const picks = squad({
    5: { minutes: 90, isGwFinished: true },
    13: { minutes: 30 },
  });
  const effectiveLineup = picks.map((p) => {
    const slot =
      p.squadPosition === 13 ? 5 : p.squadPosition === 5 ? 13 : p.squadPosition;
    return {
      elementId: Number(p.element),
      position: slot as number,
      effectiveMultiplier: p.squadPosition === 5 ? 0 : 1,
      pickActive: p.squadPosition !== 5,
      autoSub: p.squadPosition === 13,
      isCaptain: p.isCaptain === true,
      isViceCaptain: p.isViceCaptain === true,
    };
  });
  const projection = deriveLiveAutoSubProjection({
    chip: "",
    pickList: picks,
    score: { state: "STALE", effectiveLineup },
  });
  check("lineup adopted", projection.activePlayerIds.includes(String(picks[12].element)));
  check(
    "lineup drops subbed-out",
    !projection.activePlayerIds.includes(String(picks[4].element)),
  );
  check(
    "lineup effective slot",
    projection.effectivePositions[String(picks[12].element)] === 5,
  );
  check(
    "lineup benched slot",
    projection.effectivePositions[String(picks[4].element)] === 13,
  );
  check("lineup no invented labels", projection.substitutions.length === 0);
}

// --- autoSubRoleMap pairs in/out with partner names ------------------------
{
  const picks = squad({ 5: { minutes: 0, isGwFinished: true } });
  const projection = deriveLiveAutoSubProjection({ chip: "", pickList: picks });
  const roles = autoSubRoleMap(projection);
  const sub = projection.substitutions[0];
  check("role in", roles.get(sub.playerInId)?.role === "PREDICTED_IN");
  check("role in partner", roles.get(sub.playerInId)?.partnerName === picks[4].webName);
  check("role out", roles.get(sub.playerOutId)?.role === "PREDICTED_OUT");
  check("role out partner", roles.get(sub.playerOutId)?.partnerName === picks[12].webName);
}

console.log("live-auto-subs tests passed");
