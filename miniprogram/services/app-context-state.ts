import { getEntryId } from "../utils/storage";

export type AppEventPhase = "scheduled" | "active" | "settled" | "unresolved";

export interface AppContextSnapshot {
  season: string;
  currentEvent: number | null;
  nextEvent: number | null;
  displayEvent: number | null;
  nextDeadlineAt: number | null;
  entryId: number | null;
  authRevision: number;
  contextRevision: number;
  phase: AppEventPhase;
  source: "memory" | "storage" | "network" | "stale";
  stale: boolean;
  storedAt: number;
  freshUntil: number;
}

function normalizeEntryId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function readInitialEntryId(): number | null {
  try {
    return normalizeEntryId(getEntryId());
  } catch {
    return null;
  }
}

let snapshot: AppContextSnapshot | null = null;
let entryId = readInitialEntryId();
let authRevision = 0;
let contextRevision = 0;

export function currentEntryBinding(): { entryId: number | null; authRevision: number } {
  return { entryId, authRevision };
}

export function readAppContextSnapshot(): AppContextSnapshot | null {
  return snapshot ? { ...snapshot } : null;
}

export function replaceAppContextSnapshot(
  value: Omit<AppContextSnapshot, "entryId" | "authRevision" | "contextRevision">
): AppContextSnapshot {
  const changed = !snapshot
    || snapshot.season !== value.season
    || snapshot.currentEvent !== value.currentEvent
    || snapshot.nextEvent !== value.nextEvent
    || snapshot.nextDeadlineAt !== value.nextDeadlineAt
    || snapshot.entryId !== entryId
    || snapshot.authRevision !== authRevision;
  if (changed) contextRevision += 1;
  snapshot = {
    ...value,
    entryId,
    authRevision,
    contextRevision
  };
  return { ...snapshot };
}

export function commitEntryBindingState(
  value: number | null,
  reason: "restore" | "login" | "logout" | "rebind" | "token-rotation"
): void {
  const normalized = normalizeEntryId(value);
  const bindingChanged = normalized !== entryId;
  const authChanged = reason !== "restore";
  if (!bindingChanged && !authChanged) return;
  entryId = normalized;
  authRevision += 1;
  contextRevision += 1;
  if (snapshot) {
    snapshot = { ...snapshot, entryId, authRevision, contextRevision };
  }
  try {
    const app = getApp<IAppOption>();
    app.globalData.entryId = entryId || undefined;
    app.globalData.authRevision = authRevision;
    app.globalData.contextRevision = contextRevision;
  } catch {}
}
