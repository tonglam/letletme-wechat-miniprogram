import type { TournamentOption } from "../miniprogram/models/tournament";
import {
  buildTournamentPickerState,
  EMPTY_TOURNAMENT_PICKER_STATE,
} from "../miniprogram/utils/tournament-picker-groups";

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `assertion failed: ${message} (expected ${String(expected)}, got ${String(actual)})`,
    );
  }
}

const classicA: TournamentOption = { id: 11, name: "让让杯", leagueType: "CLASSIC" };
const classicB: TournamentOption = { id: 22, name: "总冠军联赛" };
const h2hA: TournamentOption = {
  id: 33,
  name: "周冠军对战",
  leagueType: "H2H",
  rosterMode: "OFFICIAL_SYNC",
  groupMode: "BATTLE_RACES",
};
const tournaments = [classicA, classicB, h2hA];

// Empty directory: every group empty, single-picker wording kept.
equal(EMPTY_TOURNAMENT_PICKER_STATE.classicTournaments.length, 0, "empty classic");
equal(EMPTY_TOURNAMENT_PICKER_STATE.h2hTournaments.length, 0, "empty h2h");
equal(EMPTY_TOURNAMENT_PICKER_STATE.classicPickerText, "请选择赛事", "empty classic placeholder");
equal(EMPTY_TOURNAMENT_PICKER_STATE.h2hPickerText, "请选择赛事", "empty h2h placeholder");
equal(EMPTY_TOURNAMENT_PICKER_STATE.hasDualTournamentKinds, false, "empty is not dual");

// Split mirrors the web: leagueType === "H2H" goes to the H2H picker,
// everything else (including a missing leagueType) stays classic.
const dual = buildTournamentPickerState(tournaments, classicB);
equal(dual.classicTournaments.length, 2, "classic group keeps non-H2H rows");
equal(dual.h2hTournaments.length, 1, "h2h group keeps H2H rows");
equal(dual.classicTournaments[1].id, 22, "classic order preserved");
equal(dual.h2hTournaments[0].id, 33, "h2h row classified by leagueType");
check(dual.hasDualTournamentKinds, "both groups non-empty is dual");
equal(dual.selectedClassicIndex, 1, "classic picker value follows the selection");
equal(dual.selectedH2HIndex, 0, "other-group picker value clamps to a valid row");
equal(dual.classicPickerText, "总冠军联赛", "owning group shows the tournament name");
equal(dual.h2hPickerText, "选择对战联赛", "non-owning group shows its placeholder");
check(dual.classicPickerActive, "owning group is active");
check(!dual.h2hPickerActive, "non-owning group is inactive");

// Selecting across groups flips which picker carries the name.
const h2hSelected = buildTournamentPickerState(tournaments, h2hA);
equal(h2hSelected.h2hPickerText, "周冠军对战", "h2h picker shows the selected name");
equal(h2hSelected.classicPickerText, "选择积分联赛", "classic falls back to its placeholder");
equal(h2hSelected.selectedClassicIndex, 0, "classic picker value clamps");
equal(h2hSelected.selectedH2HIndex, 0, "h2h picker value follows");

// String/number id mismatches still match the selection (storage round-trip).
const stringIdSelected = buildTournamentPickerState(
  [{ ...classicA, id: "11" }, h2hA],
  classicA,
);
equal(stringIdSelected.selectedClassicIndex, 0, "id compare is string-safe");
equal(stringIdSelected.classicPickerText, "让让杯", "string-safe match shows the name");

// Single-kind directories keep the legacy single-picker wording and are not dual.
const classicOnly = buildTournamentPickerState([classicA, classicB], classicA);
check(!classicOnly.hasDualTournamentKinds, "classic-only is not dual");
equal(classicOnly.classicPickerText, "让让杯", "classic-only shows the name");
equal(classicOnly.h2hTournamentNames.length, 0, "classic-only hides the h2h picker");

const h2hOnly = buildTournamentPickerState([h2hA], null);
check(!h2hOnly.hasDualTournamentKinds, "h2h-only is not dual");
equal(h2hOnly.h2hPickerText, "请选择赛事", "single-kind placeholder stays generic");
check(!h2hOnly.h2hPickerActive, "no selection is inactive");

console.log("tournament-picker-groups tests passed");
