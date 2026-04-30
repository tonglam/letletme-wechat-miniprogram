import { graphqlRequest } from "./graphql.service";
import type { TeamSummary } from "../models/team";

const TEAM = `
  query Team($id: Int!) {
    team(id: $id) {
      id
      name
      shortName
      strength
    }
  }
`;

interface TeamResponse {
  team: {
    id: number;
    name: string;
    shortName: string;
    strength: number;
  } | null;
}

export async function getTeamSummary(teamId: number | string, _season: string): Promise<TeamSummary> {
  const data = await graphqlRequest<TeamResponse>(TEAM, { id: Number(teamId) });
  if (!data.team) {
    throw new Error(`No team found with id ${teamId}`);
  }

  return {
    id: data.team.id,
    name: data.team.name,
    shortName: data.team.shortName,
    strength: data.team.strength
  };
}

export function refreshTeamSummary(teamId: number | string, season: string): Promise<unknown> {
  return getTeamSummary(teamId, season);
}
