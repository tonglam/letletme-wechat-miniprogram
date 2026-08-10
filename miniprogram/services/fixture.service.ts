import { graphqlRequest } from "./graphql.service";
import type { Fixture } from "../models/common";

const SEASON_FIXTURES = `
  query SeasonFixtures {
    fixtures(limit: 500) {
      id
      event { id }
      kickoffTime
      finished
      homeTeam { id name shortName }
      awayTeam { id name shortName }
      homeTeamDifficulty
      awayTeamDifficulty
    }
  }
`;

interface SeasonFixturesResponse {
  fixtures: Array<{
    id: number;
    event: { id: number } | null;
    kickoffTime: string | null;
    finished: boolean;
    homeTeam: { id: number; name: string; shortName: string };
    awayTeam: { id: number; name: string; shortName: string };
    homeTeamDifficulty: number | null;
    awayTeamDifficulty: number | null;
  }>;
}

export async function getSeasonFixture(_season: string): Promise<Fixture[]> {
  const data = await graphqlRequest<SeasonFixturesResponse>(SEASON_FIXTURES, {}, {
    cacheTtl: 30 * 60 * 1000
  });
  return (data.fixtures || []).map((fixture) => ({
    id: fixture.id,
    event: fixture.event?.id,
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
  }));
}
