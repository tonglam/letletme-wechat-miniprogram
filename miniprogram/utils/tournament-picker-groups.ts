/**
 * Live-tournament picker grouping: the web TournamentSelector splits the
 * directory into two dropdowns — 经典联赛 (classicSelector) and 对战联赛
 * (h2hSelector) — on `leagueType === "H2H"` alone. The mini renders the same
 * split as two compact pickers; the live directory already filters to
 * POINTS_RACES + official H2H rows, so the leagueType check is equivalent to
 * the stricter isOfficialH2HTournamentRow inside this list.
 */

import type { TournamentOption } from "../models/tournament";

export interface TournamentPickerState {
  classicTournaments: TournamentOption[];
  h2hTournaments: TournamentOption[];
  classicTournamentNames: string[];
  h2hTournamentNames: string[];
  /** Picker `value` bindings — always a valid row, 0 when the selection lives in the other group. */
  selectedClassicIndex: number;
  selectedH2HIndex: number;
  /** Selected tournament name when the group owns it, otherwise the group placeholder. */
  classicPickerText: string;
  h2hPickerText: string;
  classicPickerActive: boolean;
  h2hPickerActive: boolean;
  /** Both groups non-empty — the split UI is only meaningful then. */
  hasDualTournamentKinds: boolean;
}

export function buildTournamentPickerState(
  tournaments: TournamentOption[],
  selectedTournament: TournamentOption | null,
): TournamentPickerState {
  const classicTournaments = tournaments.filter(
    (tournament) => tournament.leagueType !== "H2H",
  );
  const h2hTournaments = tournaments.filter(
    (tournament) => tournament.leagueType === "H2H",
  );
  const sameSelection = (tournament: TournamentOption) =>
    selectedTournament != null &&
    String(tournament.id) === String(selectedTournament.id);
  const classicIndex = classicTournaments.findIndex(sameSelection);
  const h2hIndex = h2hTournaments.findIndex(sameSelection);
  const hasDualTournamentKinds =
    classicTournaments.length > 0 && h2hTournaments.length > 0;
  return {
    classicTournaments,
    h2hTournaments,
    classicTournamentNames: classicTournaments.map(
      (tournament) => tournament.name,
    ),
    h2hTournamentNames: h2hTournaments.map((tournament) => tournament.name),
    selectedClassicIndex: Math.max(0, classicIndex),
    selectedH2HIndex: Math.max(0, h2hIndex),
    classicPickerText:
      classicIndex >= 0
        ? classicTournaments[classicIndex].name
        : hasDualTournamentKinds
          ? "选择积分联赛"
          : "请选择赛事",
    h2hPickerText:
      h2hIndex >= 0
        ? h2hTournaments[h2hIndex].name
        : hasDualTournamentKinds
          ? "选择对战联赛"
          : "请选择赛事",
    classicPickerActive: classicIndex >= 0,
    h2hPickerActive: h2hIndex >= 0,
    hasDualTournamentKinds,
  };
}

export const EMPTY_TOURNAMENT_PICKER_STATE: TournamentPickerState =
  buildTournamentPickerState([], null);
