import { graphqlRequest } from "./graphql.service";
import type { Fixture } from "../models/common";
import { fixtureWindowEvents } from "../utils/fixture-run";

interface FixturePayload {
  id: number;
  kickoffTime: string | null;
  finished: boolean;
  homeTeam: { id: number; name: string; shortName: string };
  awayTeam: { id: number; name: string; shortName: string };
  homeTeamDifficulty: number | null;
  awayTeamDifficulty: number | null;
}

interface FixtureWindowResponse {
  [alias: string]: FixturePayload[];
}

export function buildFixtureWindowRequest(events: number[]): {
  query: string;
  variables: Record<string, number>;
} {
  const variables: Record<string, number> = {};
  const definitions = events.map((event, index) => {
    variables[`event${index}`] = event;
    return `$event${index}: Int!`;
  }).join(", ");
  const selections = events.map((_, index) =>
    `event${index}: eventFixtures(eventId: $event${index}) { ...FixtureWindowFields }`
  ).join("\n");
  return {
    query: `
      query FixtureWindow(${definitions}) {
        ${selections}
      }
      fragment FixtureWindowFields on Fixture {
        id
        kickoffTime
        finished
        homeTeam { id name shortName }
        awayTeam { id name shortName }
        homeTeamDifficulty
        awayTeamDifficulty
      }
    `,
    variables
  };
}

export async function getFixtureWindow(
  startEvent: number,
  horizon: number,
  forceRefresh = false
): Promise<Fixture[]> {
  const events = fixtureWindowEvents(startEvent, horizon);
  const request = buildFixtureWindowRequest(events);
  const data = await graphqlRequest<FixtureWindowResponse>(request.query, request.variables, {
    cacheTtl: 30 * 60 * 1000,
    forceRefresh
  });

  return events.flatMap((event, index) => (data[`event${index}`] || []).map((fixture) => ({
    id: fixture.id,
    event,
    homeTeam: fixture.homeTeam.name,
    awayTeam: fixture.awayTeam.name,
    teamId: fixture.homeTeam.id,
    againstTeamId: fixture.awayTeam.id,
    teamName: fixture.homeTeam.name,
    againstTeamName: fixture.awayTeam.name,
    teamShortName: fixture.homeTeam.shortName,
    againstTeamShortName: fixture.awayTeam.shortName,
    kickoffTime: fixture.kickoffTime || undefined,
    difficulty: fixture.homeTeamDifficulty ?? undefined,
    homeDifficulty: fixture.homeTeamDifficulty ?? undefined,
    awayDifficulty: fixture.awayTeamDifficulty ?? undefined,
    finished: fixture.finished
  })));
}
