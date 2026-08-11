import type { Fixture } from "../models/common";

/**
 * Team fixture-run composition (plan §5). Pure and wx-free: the fixtures page
 * (WP2) feeds the cached season fixtures plus the team directory in, and gets
 * one vertical card per team out. Nothing is fabricated — events without a
 * fixture simply contribute no chip.
 */

export interface FixtureRunChip {
  event: number;
  opponentShortName: string;
  home: boolean;
  difficulty?: number;
  finished: boolean;
}

export interface FixtureRun {
  teamId: number;
  teamName: string;
  teamShortName: string;
  /** One chip per real fixture inside the window, event ascending. Normally
   * ≤ horizon; a double gameweek legitimately yields two chips for one
   * event (both are real — dropping one would fabricate completeness). */
  chips: FixtureRunChip[];
}

export interface FixtureRunTeam {
  id: number | string;
  name: string;
  shortName?: string;
}

/** Only 3 and 5 are meaningful windows; anything else clamps to 3. */
export function normalizeHorizon(horizon: number): 3 | 5 {
  return horizon === 5 ? 5 : 3;
}

/** Real event ids needed by the visible fixture window. */
export function fixtureWindowEvents(
  startEvent: number,
  horizon: number,
  maxEvent = 38
): number[] {
  const safeMax = Math.max(1, Math.trunc(maxEvent) || 38);
  const safeStart = Math.min(Math.max(1, Math.trunc(startEvent) || 1), safeMax);
  const endEvent = Math.min(safeMax, safeStart + normalizeHorizon(horizon) - 1);
  return Array.from({ length: endEvent - safeStart + 1 }, (_, index) => safeStart + index);
}

function toId(value: number | string | undefined): number | undefined {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export function buildFixtureRuns(
  fixtures: Fixture[],
  teams: FixtureRunTeam[],
  startEvent: number,
  horizon: number
): FixtureRun[] {
  const window = normalizeHorizon(horizon);
  const lastEvent = startEvent + window - 1;

  const runs: FixtureRun[] = [];
  for (const team of teams) {
    const teamId = toId(team.id);
    if (teamId === undefined) {
      continue; // a team without a real id is dropped, never guessed
    }
    const chips = fixtures
      .filter((fixture) => {
        const event = Number(fixture.event);
        if (!Number.isInteger(event) || event < startEvent || event > lastEvent) {
          return false;
        }
        const homeId = toId(fixture.teamId);
        const awayId = toId(fixture.againstTeamId);
        return homeId === teamId || awayId === teamId;
      })
      .sort((a, b) => {
        const byEvent = Number(a.event) - Number(b.event);
        if (byEvent !== 0) return byEvent;
        return Number(a.id) - Number(b.id);
      })
      .map((fixture): FixtureRunChip => {
        const isHome = toId(fixture.teamId) === teamId;
        return {
          event: Number(fixture.event),
          opponentShortName: (isHome ? fixture.againstTeamShortName : fixture.teamShortName) || "—",
          home: isHome,
          difficulty: (isHome ? fixture.homeDifficulty : fixture.awayDifficulty) ?? undefined,
          finished: fixture.finished === true
        };
      });
    runs.push({ teamId, teamName: team.name, teamShortName: team.shortName || team.name, chips });
  }
  return runs;
}

export function maxFixtureEvent(fixtures: Fixture[]): number {
  let max = 0;
  for (const fixture of fixtures) {
    const event = Number(fixture.event);
    if (Number.isInteger(event) && event > max) {
      max = event;
    }
  }
  return max;
}
