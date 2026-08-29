/**
 * Live auto-substitution projection — a faithful port of the web engine
 * (app/live/points/_lib/live-auto-subs.ts) onto the mini program models.
 *
 * Three truth tiers, in order:
 *  1. score.effectiveLineup — server-materialized XI; the client never
 *     re-derives scoring state when it is present.
 *  2. Terminal pick flags (pickActive/multiplier) once the score or snapshot
 *     is FINAL/SETTLED/FINALIZED — state OFFICIAL.
 *  3. Minute-based prediction while the GW is live — state PREDICTED.
 */
import type {
  LiveManagerScore,
  LivePlayerRow,
} from "../models/live";
import { isBenchBoostChip } from "./squad-pitch";

export type LiveAutoSubState = "NONE" | "PREDICTED" | "OFFICIAL";

export interface LiveAutoSubstitution {
  playerInId: string;
  playerInName: string;
  playerInOriginalPosition: number;
  playerOutId: string;
  playerOutName: string;
  playerOutOriginalPosition: number;
  state: Exclude<LiveAutoSubState, "NONE">;
}

export interface LiveCaptainPromotion {
  playerInId: string;
  playerInName: string;
  playerOutId: string;
  playerOutName: string;
  state: Exclude<LiveAutoSubState, "NONE">;
}

export interface LiveAutoSubProjection {
  state: LiveAutoSubState;
  benchBoostActive: boolean;
  substitutions: LiveAutoSubstitution[];
  captainPromotion: LiveCaptainPromotion | null;
  activePlayerIds: string[];
  effectivePositions: Record<string, number>;
}

export interface LiveAutoSubInput {
  chip?: string | null;
  pickList: readonly LivePlayerRow[];
  score?: Pick<LiveManagerScore, "state" | "effectiveLineup"> | null;
  snapshot?: { state?: string } | null;
}

/** Official pick slot; live rows normalize it onto squadPosition. */
function pickSlot(pick: LivePlayerRow): number {
  const slot = Number(pick.squadPosition ?? pick.position);
  return Number.isFinite(slot) ? (slot as number) : 0;
}

function pickId(pick: LivePlayerRow): string {
  return String(pick.element ?? "");
}

/**
 * A player is ruled out only after all of that player's GW fixtures have ended.
 * `isPlayed` is not an appearance-only signal in the GraphQL contract: it is
 * also true for a zero-minute player who receives a touchline card.
 */
function completedWithoutPlaying(pick: LivePlayerRow): boolean {
  return (
    Number(pick.minutes ?? 0) === 0 &&
    (pick.isGwFinished === true || pick.bgw === true)
  );
}

function isValidFormation(
  picksById: ReadonlyMap<string, LivePlayerRow>,
  activeIds: ReadonlySet<string>,
): boolean {
  let goalkeepers = 0;
  let defenders = 0;
  let midfielders = 0;
  let forwards = 0;

  activeIds.forEach((id) => {
    const pick = picksById.get(id);
    if (!pick) return;
    switch (Number(pick.elementType)) {
      case 1:
        goalkeepers += 1;
        break;
      case 2:
        defenders += 1;
        break;
      case 3:
        midfielders += 1;
        break;
      case 4:
        forwards += 1;
        break;
    }
  });

  return (
    activeIds.size === 11 &&
    goalkeepers === 1 &&
    defenders >= 3 &&
    defenders <= 5 &&
    midfielders >= 2 &&
    midfielders <= 5 &&
    forwards >= 1 &&
    forwards <= 3
  );
}

function isOfficialLineup(live: LiveAutoSubInput): boolean {
  return (
    live.score?.state === "FINAL" ||
    live.snapshot?.state === "SETTLED" ||
    live.snapshot?.state === "FINALIZED"
  );
}

function deriveOfficialProjection({
  picks,
  picksById,
  effectivePositions,
  benchBoostActive,
}: {
  picks: LivePlayerRow[];
  picksById: ReadonlyMap<string, LivePlayerRow>;
  effectivePositions: Record<string, number>;
  benchBoostActive: boolean;
}): LiveAutoSubProjection {
  // Terminal entry rows already contain FPL's settled multipliers and active
  // flags. They take precedence over any inference from minutes, including
  // after a late official correction.
  const hasPublishedActiveFlags = picks.every(
    (pick) => typeof pick.pickActive === "boolean",
  );
  const activeIds = new Set(
    picks
      .filter((pick) =>
        benchBoostActive
          ? pickSlot(pick) <= 11
          : hasPublishedActiveFlags
            ? pick.pickActive === true
            : Number(pick.multiplier ?? 0) > 0,
      )
      .map(pickId),
  );
  const originalCaptain = picks.find((pick) => pick.isCaptain === true) ?? null;
  const publishedCaptain =
    picks.find((pick) => Number(pick.multiplier ?? 0) >= 2) ?? null;
  const captainPromotion =
    originalCaptain &&
    publishedCaptain &&
    publishedCaptain.element !== originalCaptain.element
      ? {
          playerInId: pickId(publishedCaptain),
          playerInName: publishedCaptain.webName || "",
          playerOutId: pickId(originalCaptain),
          playerOutName: originalCaptain.webName || "",
          state: "OFFICIAL" as const,
        }
      : null;

  if (benchBoostActive) {
    return {
      state: captainPromotion ? "OFFICIAL" : "NONE",
      benchBoostActive,
      substitutions: [],
      captainPromotion,
      activePlayerIds: Array.from(activeIds),
      effectivePositions,
    };
  }

  const outgoing = picks
    .filter((pick) => pickSlot(pick) <= 11 && !activeIds.has(pickId(pick)))
    .sort((left, right) => pickSlot(left) - pickSlot(right));
  const incoming = picks
    .filter(
      (pick) =>
        pickSlot(pick) > 11 &&
        activeIds.has(pickId(pick)) &&
        (pick.autoSub === true || pick.pickActive === true),
    )
    .sort((left, right) => pickSlot(left) - pickSlot(right));
  const remainingOutgoing = [...outgoing];
  const presentationActiveIds = new Set(
    picks.filter((pick) => pickSlot(pick) <= 11).map(pickId),
  );
  const substitutions: LiveAutoSubstitution[] = [];

  for (const benchPlayer of incoming) {
    if (remainingOutgoing.length === 0) break;

    // The public contract identifies the settled active players, but not the
    // individual in/out pair. Reconstruct that label without ever changing
    // the authoritative active set used to render the XI.
    let outgoingIndex = remainingOutgoing.findIndex((starter) => {
      const nextActiveIds = new Set(presentationActiveIds);
      nextActiveIds.delete(pickId(starter));
      nextActiveIds.add(pickId(benchPlayer));
      return isValidFormation(picksById, nextActiveIds);
    });
    if (outgoingIndex < 0) {
      outgoingIndex = remainingOutgoing.findIndex(
        (starter) =>
          (Number(starter.elementType) === 1) ===
          (Number(benchPlayer.elementType) === 1),
      );
    }
    if (outgoingIndex < 0) outgoingIndex = 0;

    const [starter] = remainingOutgoing.splice(outgoingIndex, 1);
    const starterId = pickId(starter);
    const benchPlayerId = pickId(benchPlayer);
    presentationActiveIds.delete(starterId);
    presentationActiveIds.add(benchPlayerId);
    effectivePositions[benchPlayerId] = pickSlot(starter);
    effectivePositions[starterId] = pickSlot(benchPlayer);
    substitutions.push({
      playerInId: benchPlayerId,
      playerInName: benchPlayer.webName || "",
      playerInOriginalPosition: pickSlot(benchPlayer),
      playerOutId: starterId,
      playerOutName: starter.webName || "",
      playerOutOriginalPosition: pickSlot(starter),
      state: "OFFICIAL",
    });
  }

  return {
    state:
      substitutions.length > 0 || captainPromotion !== null
        ? "OFFICIAL"
        : "NONE",
    benchBoostActive,
    substitutions,
    captainPromotion,
    activePlayerIds: Array.from(activeIds),
    effectivePositions,
  };
}

function authoritativeProjection(
  live: LiveAutoSubInput,
  picks: LivePlayerRow[],
): LiveAutoSubProjection | null {
  const publishedLineup = live.score?.effectiveLineup;
  if (!publishedLineup || publishedLineup.length !== picks.length) return null;
  const byElement = new Map(
    publishedLineup.map((row) => [row.elementId, row] as const),
  );
  if (
    byElement.size !== picks.length ||
    picks.some((pick) => !byElement.has(Number(pick.element)))
  ) {
    return null;
  }

  // The server materialization owns active status, effective multipliers,
  // captain fallback and lineup slots. Feed those values into the same
  // presentation projection so the client never re-derives scoring state.
  const authoritativePicks = picks.map((pick) => {
    const row = byElement.get(Number(pick.element));
    if (!row) return pick;
    return {
      ...pick,
      squadPosition: row.position,
      multiplier: row.effectiveMultiplier,
      pickActive: row.pickActive,
      autoSub: row.autoSub,
      isCaptain: row.isCaptain,
      isViceCaptain: row.isViceCaptain,
    };
  });
  const projection = deriveOfficialProjection({
    picks: authoritativePicks,
    picksById: new Map(
      authoritativePicks.map((pick) => [pickId(pick), pick] as const),
    ),
    effectivePositions: Object.fromEntries(
      publishedLineup.map((row) => [String(row.elementId), row.position]),
    ),
    benchBoostActive: isBenchBoostChip(live.chip),
  });
  if (isOfficialLineup(live)) return projection;
  return {
    ...projection,
    state: projection.state === "NONE" ? "NONE" : "PREDICTED",
    substitutions: projection.substitutions.map((substitution) => ({
      ...substitution,
      state: "PREDICTED" as const,
    })),
    captainPromotion: projection.captainPromotion
      ? { ...projection.captainPromotion, state: "PREDICTED" as const }
      : null,
  };
}

/**
 * Derive the XI that should be shown right now.
 *
 * Once a starter is a confirmed zero-minute no-show, bench players are tried in
 * their FPL order. A bench player whose own fixture is still pending is kept as
 * the current prediction; only a confirmed bench no-show is skipped. Every swap
 * must leave a legal 11-player formation.
 */
export function deriveLiveAutoSubProjection(
  live: LiveAutoSubInput,
): LiveAutoSubProjection {
  const picks = [...live.pickList].sort(
    (left, right) => pickSlot(left) - pickSlot(right),
  );
  const picksById = new Map(picks.map((pick) => [pickId(pick), pick] as const));
  const effectivePositions = Object.fromEntries(
    picks.map((pick) => [pickId(pick), pickSlot(pick)]),
  );
  const authoritative = authoritativeProjection(live, picks);
  if (authoritative) return authoritative;
  const benchBoostActive = isBenchBoostChip(live.chip);
  if (isOfficialLineup(live)) {
    return deriveOfficialProjection({
      picks,
      picksById,
      effectivePositions,
      benchBoostActive,
    });
  }

  const activeIds = new Set(
    picks.filter((pick) => pickSlot(pick) <= 11).map(pickId),
  );
  const state: Exclude<LiveAutoSubState, "NONE"> = "PREDICTED";
  const originalCaptain = picks.find((pick) => pick.isCaptain === true) ?? null;
  const viceCaptain =
    picks.find((pick) => pick.isViceCaptain === true) ?? null;
  const viceCaptainId = viceCaptain ? pickId(viceCaptain) : null;
  const deriveCaptainPromotion = (): LiveCaptainPromotion | null =>
    originalCaptain &&
    viceCaptain &&
    viceCaptainId &&
    completedWithoutPlaying(originalCaptain) &&
    Number(viceCaptain.minutes ?? 0) > 0 &&
    activeIds.has(viceCaptainId)
      ? {
          playerInId: viceCaptainId,
          playerInName: viceCaptain.webName || "",
          playerOutId: pickId(originalCaptain),
          playerOutName: originalCaptain.webName || "",
          state,
        }
      : null;

  if (benchBoostActive) {
    const captainPromotion = deriveCaptainPromotion();
    return {
      state: captainPromotion ? state : "NONE",
      benchBoostActive,
      substitutions: [],
      captainPromotion,
      activePlayerIds: Array.from(activeIds),
      effectivePositions,
    };
  }

  const nonPlayingStarters = picks
    .filter((pick) => pickSlot(pick) <= 11 && completedWithoutPlaying(pick))
    .sort((left, right) => pickSlot(left) - pickSlot(right));
  const bench = picks
    .filter((pick) => pickSlot(pick) > 11)
    .sort((left, right) => pickSlot(left) - pickSlot(right));
  const substitutions: LiveAutoSubstitution[] = [];

  for (const benchPlayer of bench) {
    if (nonPlayingStarters.length === 0) break;
    // A pending bench player is the current prediction. Skip only once that
    // player's own GW fixtures have all ended without an appearance.
    if (completedWithoutPlaying(benchPlayer)) continue;

    for (let index = 0; index < nonPlayingStarters.length; index += 1) {
      const starter = nonPlayingStarters[index];
      const starterId = pickId(starter);
      const benchPlayerId = pickId(benchPlayer);
      const nextActiveIds = new Set(activeIds);
      nextActiveIds.delete(starterId);
      nextActiveIds.add(benchPlayerId);
      if (!isValidFormation(picksById, nextActiveIds)) continue;

      activeIds.clear();
      nextActiveIds.forEach((id) => activeIds.add(id));
      effectivePositions[benchPlayerId] = pickSlot(starter);
      effectivePositions[starterId] = pickSlot(benchPlayer);
      nonPlayingStarters.splice(index, 1);
      substitutions.push({
        playerInId: benchPlayerId,
        playerInName: benchPlayer.webName || "",
        playerInOriginalPosition: pickSlot(benchPlayer),
        playerOutId: starterId,
        playerOutName: starter.webName || "",
        playerOutOriginalPosition: pickSlot(starter),
        state,
      });
      break;
    }
  }

  const captainPromotion = deriveCaptainPromotion();

  return {
    state:
      substitutions.length > 0 || captainPromotion !== null ? state : "NONE",
    benchBoostActive,
    substitutions,
    captainPromotion,
    activePlayerIds: Array.from(activeIds),
    effectivePositions,
  };
}

/** Auto-sub badge role per player id, ready for row/pitch rendering. */
export function autoSubRoleMap(
  projection: LiveAutoSubProjection,
): Map<string, { role: string; partnerName: string }> {
  const map = new Map<string, { role: string; partnerName: string }>();
  for (const substitution of projection.substitutions) {
    map.set(substitution.playerInId, {
      role: substitution.state === "OFFICIAL" ? "OFFICIAL_IN" : "PREDICTED_IN",
      partnerName: substitution.playerOutName,
    });
    if (substitution.playerOutId) {
      map.set(substitution.playerOutId, {
        role:
          substitution.state === "OFFICIAL" ? "OFFICIAL_OUT" : "PREDICTED_OUT",
        partnerName: substitution.playerInName,
      });
    }
  }
  return map;
}

/** Badge display parts for a role string (OFFICIAL_IN / PREDICTED_OUT / …). */
export function autoSubBadge(role?: string): {
  arrow: "" | "↑" | "↓";
  incoming: boolean;
  predicted: boolean;
} {
  const value = String(role || "");
  const incoming = value.endsWith("_IN");
  return {
    arrow: value ? (incoming ? "↑" : "↓") : "",
    incoming,
    predicted: value.startsWith("PREDICTED_"),
  };
}

/**
 * Apply the projection to display rows: effective squad slots, arrow badges,
 * and the promoted captaincy. Rows keep every other field untouched.
 */
export function applyLiveAutoSubProjection(
  players: readonly LivePlayerRow[],
  projection: LiveAutoSubProjection,
): LivePlayerRow[] {
  const roles = autoSubRoleMap(projection);
  const promotion = projection.captainPromotion;
  return players.map((player) => {
    const id = String(player.element ?? "");
    const effectivePosition = projection.effectivePositions[id];
    const role = roles.get(id);
    return {
      ...player,
      squadPosition: effectivePosition ?? player.squadPosition,
      autoSubRole: role?.role,
      autoSubPartnerName: role?.partnerName,
      captain: promotion ? id === promotion.playerInId : player.captain,
      viceCaptain: promotion ? false : player.viceCaptain,
      isCaptain: promotion ? id === promotion.playerInId : player.isCaptain,
      isViceCaptain: promotion ? false : player.isViceCaptain,
    };
  });
}
