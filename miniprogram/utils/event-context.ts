export interface EventContext {
  gw: number;
  nextGw: number;
  lastGw: number;
}

/** FPL has no GW0; 0/NaN/null all mean "no event yet". */
export function positiveEventId(value: number | null | undefined): number | null {
  const event = Number(value);
  return Number.isInteger(event) && event > 0 ? event : null;
}

function validGameweek(value: number | null | undefined): number {
  return positiveEventId(value) ?? 0;
}

export function resolveEventContext(
  currentEvent: number | null | undefined,
  nextEvent: number | null | undefined
): EventContext {
  const currentGw = validGameweek(currentEvent);
  const followingGw = validGameweek(nextEvent);

  return {
    gw: currentGw || followingGw,
    nextGw: followingGw || currentGw,
    lastGw: currentGw ? currentGw - 1 : 0
  };
}

/**
 * Season/GW reporting (standings, picks, selection stats) exists only for a
 * started current event. displayEvent/nextEvent may be GW1 in preseason;
 * querying that round before currentEvent exists is not a user-facing error.
 */
export function canReadEventReporting(
  eventId: number,
  currentEvent: number | null | undefined
): boolean {
  const event = positiveEventId(eventId);
  const started = positiveEventId(currentEvent);
  return event !== null && started !== null && event <= started;
}
