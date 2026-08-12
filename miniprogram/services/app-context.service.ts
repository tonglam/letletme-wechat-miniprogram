import { readCurrentEventAndDeadline } from "./common.service";
import { formatDeadline } from "../utils/date";
import {
  commitEntryBindingState,
  currentEntryBinding,
  readAppContextSnapshot,
  replaceAppContextSnapshot,
  type AppContextSnapshot,
  type AppEventPhase
} from "./app-context-state";

export type { AppContextSnapshot, AppEventPhase } from "./app-context-state";

export interface EnsureAppContextOptions {
  forceRefresh?: boolean;
  reason: "app-launch" | "app-show" | "page-load" | "page-show" | "pull-refresh" | "auth-change";
}

let pending: Promise<AppContextSnapshot> | null = null;
let pendingForced = false;
let nextRetryAt = 0;

function phaseFor(currentEvent: number | null, nextEvent: number | null): AppEventPhase {
  if (!currentEvent && nextEvent) return "scheduled";
  if (currentEvent === 38 && !nextEvent) return "settled";
  if (currentEvent) return "active";
  return "unresolved";
}

function sourceFor(source: string): AppContextSnapshot["source"] {
  if (source === "network") return "network";
  if (source === "storage") return "storage";
  if (source === "stale") return "stale";
  return "memory";
}

function syncGlobalData(snapshot: AppContextSnapshot): void {
  const app = getApp<IAppOption>();
  const displayEvent = snapshot.displayEvent || 0;
  app.globalData.season = snapshot.season;
  app.globalData.gw = displayEvent;
  app.globalData.currentGw = snapshot.currentEvent || 0;
  app.globalData.lastGw = snapshot.currentEvent ? Math.max(0, snapshot.currentEvent - 1) : 0;
  app.globalData.nextGw = snapshot.nextEvent || displayEvent;
  app.globalData.utcDeadline = snapshot.nextDeadlineAt
    ? new Date(snapshot.nextDeadlineAt).toISOString()
    : "";
  app.globalData.deadline = formatDeadline(app.globalData.utcDeadline);
  app.globalData.entryId = snapshot.entryId || undefined;
  app.globalData.authRevision = snapshot.authRevision;
  app.globalData.contextRevision = snapshot.contextRevision;
}

async function loadContext(forceRefresh: boolean): Promise<AppContextSnapshot> {
  const read = await readCurrentEventAndDeadline({ forceRefresh });
  const currentEvent = read.data.currentEvent || null;
  const nextEvent = read.data.nextEvent || null;
  const deadlineTime = read.data.utcDeadline ? new Date(read.data.utcDeadline).getTime() : NaN;
  const nextDeadlineAt = Number.isFinite(deadlineTime) ? deadlineTime : null;
  const storedAt = read.meta.storedAt || Date.now();
  const freshUntil = nextDeadlineAt && nextDeadlineAt > Date.now()
    ? nextDeadlineAt
    : currentEvent === 38 && !nextEvent
      ? storedAt + 24 * 60 * 60 * 1000
      : Date.now();
  const value = replaceAppContextSnapshot({
    season: String(read.data.season || ""),
    currentEvent,
    nextEvent,
    displayEvent: currentEvent || nextEvent,
    nextDeadlineAt,
    phase: phaseFor(currentEvent, nextEvent),
    source: sourceFor(read.meta.source),
    stale: read.meta.stale,
    storedAt,
    freshUntil
  });
  if (!value.season || !value.displayEvent) nextRetryAt = Date.now() + 60 * 1000;
  else nextRetryAt = 0;
  syncGlobalData(value);
  return value;
}

export async function ensureAppContext(
  options: EnsureAppContextOptions
): Promise<AppContextSnapshot> {
  const existing = readAppContextSnapshot();
  if (!options.forceRefresh && existing && existing.freshUntil > Date.now()) {
    return existing;
  }
  if (!options.forceRefresh && existing && nextRetryAt > Date.now()) {
    return existing;
  }
  if (pending) {
    if (!options.forceRefresh || pendingForced) return pending;
    await pending;
    return ensureAppContext(options);
  }
  pendingForced = Boolean(options.forceRefresh);
  const task = loadContext(Boolean(options.forceRefresh));
  pending = task;
  try {
    return await task;
  } finally {
    if (pending === task) {
      pending = null;
      pendingForced = false;
    }
  }
}

export function getAppContextSnapshot(): AppContextSnapshot | null {
  return readAppContextSnapshot();
}

export function commitEntryBinding(
  entryId: number | null,
  reason: "restore" | "login" | "logout" | "rebind" | "token-rotation"
): void {
  commitEntryBindingState(entryId, reason);
}

export function requireSeasonVariant(context: AppContextSnapshot): string {
  if (!context.season) throw new Error("赛季信息暂时不可用，请稍后重试");
  return `season:${context.season}`;
}

export function getCurrentEntryBinding(): { entryId: number | null; authRevision: number } {
  return currentEntryBinding();
}
