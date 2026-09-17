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

/**
 * The GraphQL gateway limits one operation to five root fields.  Keep the
 * client-side window API at the requested 3/5/8 rounds while sending
 * production-compatible batches for the eight-round view.
 */
export const FIXTURE_WINDOW_MAX_ROOT_FIELDS = 5;

export function splitFixtureWindowEvents(
  events: readonly number[],
  maxRootFields = FIXTURE_WINDOW_MAX_ROOT_FIELDS,
): number[][] {
  if (!Number.isSafeInteger(maxRootFields) || maxRootFields <= 0) {
    throw new Error("赛程请求批大小无效");
  }
  const batches: number[][] = [];
  for (let index = 0; index < events.length; index += maxRootFields) {
    batches.push(Array.from(events.slice(index, index + maxRootFields)));
  }
  return batches;
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

/**
 * Validate and merge each aliased batch without converting a missing alias
 * into an empty gameweek.  Keeping this pure makes the partial-response and
 * ordering contract testable without mocking wx.request.
 */
export function mergeFixtureWindowResponses(
  batches: readonly (readonly number[])[],
  responses: readonly FixtureWindowResponse[],
): Fixture[] {
  if (responses.length !== batches.length) {
    throw new Error("赛程批次响应不完整，请稍后重试");
  }
  return batches.flatMap((batch, batchIndex) => {
    const data = responses[batchIndex] as unknown as Record<string, unknown> | undefined;
    if (!data || typeof data !== "object") {
      throw new Error("赛程批次响应格式异常，请稍后重试");
    }
    return batch.flatMap((event, eventIndex) => {
      const alias = `event${eventIndex}`;
      if (!Object.prototype.hasOwnProperty.call(data, alias)) {
        throw new Error(`GW${event}赛程数据不完整，请稍后重试`);
      }
      const payload = data[alias];
      if (!Array.isArray(payload)) {
        throw new Error(`GW${event}赛程数据格式异常，请稍后重试`);
      }
      return payload.map((fixture) => mapFixturePayload(fixture as FixturePayload, event));
    });
  });
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
      season,
      forceRefresh: options.forceRefresh,
      trace: options.trace
    }
  );
  if (result.errors.length > 0) {
    throw new Error(
      result.errors.map((error) => error.message).filter(Boolean).join("; ")
      || "赛程数据暂时不可用，请稍后重试"
    );
  }
  return {
    data: (result.data.eventFixtures || []).map((fixture) => mapFixturePayload(fixture, event)),
    meta: result.meta
  };
}

export async function getFixtureWindow(
  startEvent: number,
  horizon: number,
  season: string | undefined,
  forceRefresh = false,
  trace?: ServiceReadOptions["trace"]
): Promise<Fixture[]> {
  if (!season) throw new Error("赛季信息暂时不可用，请稍后重试");
  const events = fixtureWindowEvents(startEvent, horizon);
  const batches = splitFixtureWindowEvents(events);
  const responses = await Promise.all(
    batches.map(async (batch) => {
      const request = buildFixtureWindowRequest(batch);
      return graphqlRequest<FixtureWindowResponse>(
        request.query,
        request.variables,
        {
          cachePolicy: "fixtures",
          season,
          forceRefresh,
          trace,
        },
      );
    }),
  );

  return mergeFixtureWindowResponses(batches, responses);
}
