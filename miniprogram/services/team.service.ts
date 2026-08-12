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

export async function getTeamSummary(teamId: number | string, season: string): Promise<TeamSummary> {
  if (!season) throw new Error("赛季信息暂时不可用，请稍后重试");
  const data = await graphqlRequest<TeamResponse>(TEAM, { id: Number(teamId) }, {
    cachePolicy: "team-directory",
    season
  });
  if (!data.team) {
    throw new Error("没有找到这支球队，请返回后重试");
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
