export interface EventContext {
  gw: number;
  nextGw: number;
  lastGw: number;
}

function validGameweek(value: number | null | undefined): number {
  const gameweek = Number(value);
  return Number.isInteger(gameweek) && gameweek > 0 ? gameweek : 0;
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
