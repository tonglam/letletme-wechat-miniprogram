import type { LivePlayerRow } from "../../../models/live";
import type { SquadPitchPlayer } from "../../../utils/squad-pitch";
import { asRecord, fieldText } from "../../../utils/summary-format";

const LIVE_STAT_KEYS = [
  "minutes",
  "goalsScored",
  "assists",
  "cleanSheets",
  "goalsConceded",
  "saves",
  "defensiveContribution",
  "bonus",
  "bps",
  "yellowCards",
  "redCards",
  "ownGoals",
  "penaltiesSaved",
  "penaltiesMissed"
] as const;

function copyLiveStats(record: Record<string, unknown>): Partial<LivePlayerRow> {
  const stats: Partial<LivePlayerRow> = {};
  LIVE_STAT_KEYS.forEach((key) => {
    const raw = record[key];
    if (raw === undefined || raw === null || raw === "") return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) stats[key] = parsed;
  });
  return stats;
}

function cleanText(value: string): string {
  return !value || value === "-" ? "" : value;
}

function numberFrom(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = record[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const parsed = Number(String(raw).replace(/分$/, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function toEventLiveRow(
  record: Record<string, unknown>,
  options: { statusText: string; name?: string; team?: string; position?: string; points?: number }
): LivePlayerRow {
  const nested = asRecord(record.player);
  const team = asRecord(nested.team || record.team);
  const name = options.name
    || cleanText(fieldText(record, ["webName", "name", "playerName"], fieldText(nested, ["webName", "name"])));
  const teamCode = options.team
    || cleanText(fieldText(record, ["teamShortName", "team"], fieldText(team, ["shortName", "name"], "")));
  const position = options.position
    || cleanText(fieldText(record, ["position", "elementTypeName"], fieldText(nested, ["position"], "")));
  const points = options.points
    ?? numberFrom(record, ["points", "totalPoints", "livePoints", "value"])
    ?? 0;
  return {
    element: Number(record.id ?? record.element ?? nested.id) || undefined,
    name,
    webName: name,
    team: teamCode,
    teamShortName: teamCode,
    position,
    points,
    totalPoints: points,
    statusText: options.statusText,
    playStatus: 4,
    ...copyLiveStats(record)
  };
}

function toDreamTeamLiveRow(
  pitch: SquadPitchPlayer,
  record: Record<string, unknown>
): LivePlayerRow {
  return toEventLiveRow(record, {
    statusText: "梦之队",
    name: pitch.webName,
    team: pitch.teamCode,
    position: pitch.position,
    points: pitch.score
  });
}

export function indexEventPlayersByRowId(
  rows: Array<{ id: string }>,
  sourceRows: unknown[],
  statusText: string
): Record<string, LivePlayerRow> {
  const mapped: Record<string, LivePlayerRow> = {};
  rows.forEach((row, index) => {
    mapped[row.id] = toEventLiveRow(asRecord(sourceRows[index]), { statusText });
  });
  return mapped;
}

export function indexDreamTeamById(
  pitchPlayers: SquadPitchPlayer[],
  sourceRows: unknown[]
): Record<string, LivePlayerRow> {
  const byKey: Record<string, Record<string, unknown>> = {};
  sourceRows.forEach((raw, index) => {
    const record = asRecord(raw);
    const nested = asRecord(record.player);
    const id = fieldText(record, ["id", "element"], fieldText(nested, ["id"], `dream-${index}`));
    byKey[id] = record;
    const name = fieldText(record, ["webName", "name"], fieldText(nested, ["webName", "name"]));
    if (name && name !== "-") byKey[`name:${name}`] = record;
  });
  const mapped: Record<string, LivePlayerRow> = {};
  pitchPlayers.forEach((player) => {
    const record = byKey[player.id] || byKey[`name:${player.webName}`] || {};
    mapped[player.id] = toDreamTeamLiveRow(player, record);
  });
  return mapped;
}
