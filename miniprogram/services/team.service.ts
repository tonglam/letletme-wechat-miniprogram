import { graphqlRequest, type PageRequestTrace } from "./graphql.service";
import type { TeamSummary } from "../models/team";

export const TEAM = `
  query Team($id: Int!) {
    team(id: $id) {
      id
      name
      shortName
      strength
      position
      points
      played
      win
      draw
      loss
      strengthOverallHome
      strengthOverallAway
    }
  }
`;

interface TeamResponse {
  team: {
    id: number;
    name: string;
    shortName: string;
    strength: number | null;
    position: number;
    points: number;
    played: number;
    win: number;
    draw: number;
    loss: number;
    strengthOverallHome: number;
    strengthOverallAway: number;
  } | null;
}

export async function getTeamSummary(
  teamId: number | string,
  season: string,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<TeamSummary> {
  if (!season) throw new Error("赛季信息暂时不可用，请稍后重试");
  const data = await graphqlRequest<TeamResponse>(TEAM, { id: Number(teamId) }, {
    cachePolicy: "team-directory",
    season,
    forceRefresh,
    trace
  });
  if (!data.team) {
    throw new Error("没有找到这支球队，请返回后重试");
  }

  return {
    id: data.team.id,
    name: data.team.name,
    shortName: data.team.shortName,
    strength: data.team.strength,
    position: data.team.position,
    points: data.team.points,
    played: data.team.played,
    win: data.team.win,
    draw: data.team.draw,
    loss: data.team.loss,
    strengthOverallHome: data.team.strengthOverallHome,
    strengthOverallAway: data.team.strengthOverallAway
  };
}

export function refreshTeamSummary(teamId: number | string, season: string): Promise<unknown> {
  return getTeamSummary(teamId, season);
}
