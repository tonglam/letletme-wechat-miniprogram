import { graphqlRead } from "./graphql.service";
import type { GraphQLErrorInfo } from "./graphql.service";
import type { PlayerValue } from "../models/player";
import type { GameweekOverallSummary } from "../models/summary";

export const MINI_HOME_SUPPLEMENT_QUERY = `
  query MiniHomeSupplement($changeDate: Date!) {
    miniProgramNotice
    eventOverallResult {
      event
      averageScore
      highestScore
      highestScoringEntry
      transfersMade
      mostViceCaptainedPlayer { id webName }
      mostTransferInPlayer { id webName }
      mostSelectedPlayer { id webName }
      mostCaptainedPlayer { id webName }
      topElementInfo {
        element
        points
        teamShortName
        player { id webName team { name shortName } }
      }
      chipPlays { chipName numberPlayed }
    }
    playerValues(changeDate: $changeDate) {
      playerId
      playerName
      teamName
      position
      lastValue
      value
    }
  }
`;

interface MiniHomeSupplementResponse {
  miniProgramNotice: string | null;
  eventOverallResult: GameweekOverallSummary | GameweekOverallSummary[] | null;
  playerValues: PlayerValue[];
}

export interface MiniHomeSupplementResult {
  notice: string;
  summary?: GameweekOverallSummary;
  playerValues: PlayerValue[];
  errors: {
    notice: string;
    summary: string;
    playerValues: string;
  };
}

function normalizeSummary(
  results: MiniHomeSupplementResponse["eventOverallResult"],
  eventId: number
): GameweekOverallSummary | undefined {
  const list = Array.isArray(results) ? results.filter(Boolean) : results ? [results] : [];
  return list.find((result) => Number(result.event) === eventId)
    || list
      .filter((result) => typeof result.event === "number" && Number(result.event) <= eventId)
      .sort((left, right) => Number(right.event || 0) - Number(left.event || 0))[0];
}

function rootError(errors: GraphQLErrorInfo[], root: string): string {
  return errors
    .filter((error) => String(error.path?.[0] || "") === root)
    .map((error) => error.message || "数据加载失败")
    .join("；");
}

function normalizeChangeDate(changeDate: string): string {
  return /^\d{8}$/.test(changeDate)
    ? `${changeDate.slice(0, 4)}-${changeDate.slice(4, 6)}-${changeDate.slice(6, 8)}`
    : changeDate;
}

export async function getMiniHomeSupplement(
  eventId: number,
  changeDate: string,
  forceRefresh = false
): Promise<MiniHomeSupplementResult> {
  const result = await graphqlRead<MiniHomeSupplementResponse>(
    MINI_HOME_SUPPLEMENT_QUERY,
    { changeDate: normalizeChangeDate(changeDate) },
    {
      authMode: "public",
      cachePolicy: "market",
      cacheVariant: `event:${eventId}`,
      forceRefresh
    }
  );
  return {
    notice: result.data.miniProgramNotice || "",
    summary: normalizeSummary(result.data.eventOverallResult, eventId),
    playerValues: result.data.playerValues || [],
    errors: {
      notice: rootError(result.errors, "miniProgramNotice"),
      summary: rootError(result.errors, "eventOverallResult"),
      playerValues: rootError(result.errors, "playerValues")
    }
  };
}
