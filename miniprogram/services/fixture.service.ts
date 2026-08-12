import { graphqlRead, graphqlRequest } from "./graphql.service";
import type { DomainRead, ServiceReadOptions } from "./service-read";
import type { Fixture } from "../models/common";
import { fixtureWindowEvents } from "../utils/fixture-run";

interface FixturePayload {
  id: number;
  code: number;
  kickoffTime: string | null;
  finished: boolean;
  started: boolean | null;
  minutes: number;
  homeTeam: { id: number; name: string; shortName: string };
  awayTeam: { id: number; name: string; shortName: string };
  homeScore: number | null;
  awayScore: number | null;
  homeTeamDifficulty: number | null;
  awayTeamDifficulty: number | null;
}

interface CoreEventFixtureScheduleResponse {
  eventFixtures: FixturePayload[];
}

export const CORE_EVENT_FIXTURE_SCHEDULE_QUERY = `
  query CoreEventFixtureSchedule($eventId: Int!) {
    eventFixtures(eventId: $eventId) {
      id
      code
      kickoffTime
      finished
      started
      minutes
      homeTeam { id name shortName }
      awayTeam { id name shortName }
      homeScore
      awayScore
      homeTeamDifficulty
      awayTeamDifficulty
    }
  }
`;

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
        code
        kickoffTime
        finished
        started
        minutes
        homeTeam { id name shortName }
        awayTeam { id name shortName }
        homeScore
        awayScore
        homeTeamDifficulty
        awayTeamDifficulty
      }
    `,
    variables
  };
}

function mapFixturePayload(fixture: FixturePayload, event: number): Fixture {
  return {
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
    started: fixture.started === true,
    minutes: fixture.minutes,
    homeScore: fixture.homeScore ?? undefined,
    awayScore: fixture.awayScore ?? undefined,
    difficulty: fixture.homeTeamDifficulty ?? undefined,
    homeDifficulty: fixture.homeTeamDifficulty ?? undefined,
    awayDifficulty: fixture.awayTeamDifficulty ?? undefined,
    finished: fixture.finished
  };
}

export async function getCoreEventFixtureSchedule(
  event: number | undefined,
  season: string | undefined,
  forceRefresh = false
): Promise<Fixture[]> {
  if (!event) {
    return [];
  }
  if (!season) throw new Error("赛季信息暂时不可用，请稍后重试");
  return (await readCoreEventFixtureSchedule(event, season, { forceRefresh })).data;
}

export async function readCoreEventFixtureSchedule(
  event: number,
  season: string,
  options: ServiceReadOptions = {}
): Promise<DomainRead<Fixture[]>> {
  if (!event) throw new Error("比赛周信息暂时不可用，请稍后重试");
  if (!season) throw new Error("赛季信息暂时不可用，请稍后重试");
  const result = await graphqlRead<CoreEventFixtureScheduleResponse>(
    CORE_EVENT_FIXTURE_SCHEDULE_QUERY,
    { eventId: event },
    {
      cachePolicy: "fixtures",
      cacheVariant: `season:${season}`,
      forceRefresh: options.forceRefresh,
      trace: options.trace
    }
  );
  return {
    data: (result.data.eventFixtures || []).map((fixture) => mapFixturePayload(fixture, event)),
    meta: result.meta
  };
}

export async function getFixtureWindow(
  startEvent: number,
  horizon: number,
  season: string | undefined,
  forceRefresh = false
): Promise<Fixture[]> {
  if (!season) throw new Error("赛季信息暂时不可用，请稍后重试");
  const events = fixtureWindowEvents(startEvent, horizon);
  const request = buildFixtureWindowRequest(events);
  const data = await graphqlRequest<FixtureWindowResponse>(request.query, request.variables, {
    cachePolicy: "fixtures",
    cacheVariant: `season:${season}`,
    forceRefresh
  });

  return events.flatMap((event, index) =>
    (data[`event${index}`] || []).map((fixture) => mapFixturePayload(fixture, event))
  );
}
