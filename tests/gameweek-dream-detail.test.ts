import { indexDreamTeamById, indexEventPlayersByRowId } from "../miniprogram/pages/summary/gameweek/dream-detail";
import { buildPlayerLiveDetail } from "../miniprogram/pages/live/entry/player-detail";
import { buildDreamTeamPitchState } from "../miniprogram/utils/squad-pitch";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

const dreamRows = [
  { id: "mid-0", webName: "Palmer", teamShortName: "CHE", position: "MID", points: 18, minutes: 90, goalsScored: 2, assists: 1, bonus: 3, bps: 61 },
  { id: "fwd-0", webName: "Haaland", teamShortName: "MCI", position: "FWD", points: 18, minutes: 90, goalsScored: 3, assists: 1, bonus: 1, bps: 68 }
];

const pitch = buildDreamTeamPitchState(dreamRows, 3);
const byId = indexDreamTeamById(pitch.pitchPlayers, dreamRows);
const palmerPitch = pitch.pitchPlayers.find((player) => player.webName === "Palmer");
if (!palmerPitch) throw new Error("Palmer missing from dream team pitch");

const palmer = buildPlayerLiveDetail(byId[palmerPitch.id]);
assertEqual(palmer.name, "Palmer", "palmer name");
assertEqual(palmer.pointsText, "18", "palmer points");
assertEqual(palmer.statusText, "梦之队", "palmer status");
assertEqual(palmer.statRows.find((row) => row.label === "进球")?.value, "2", "palmer goals");
assertEqual(palmer.breakdownRows.length > 0, true, "palmer has breakdown");
assertEqual(palmer.breakdownHint.includes("官方明细"), false, "palmer is not empty");

const apiRows = [{
  id: 7,
  webName: "Saka",
  teamShortName: "ARS",
  position: "MIDFIELDER",
  totalPoints: 12,
  minutes: 90,
  goalsScored: 1,
  assists: 1,
  bonus: 2,
  bps: 44
}];
const apiPitch = buildDreamTeamPitchState(apiRows, 3);
const apiById = indexDreamTeamById(apiPitch.pitchPlayers, apiRows);
const saka = buildPlayerLiveDetail(apiById[apiPitch.pitchPlayers[0].id]);
assertEqual(saka.statRows.find((row) => row.label === "助攻")?.value, "1", "api row maps assists");
assertEqual(saka.bpsText, "44", "api row maps bps");

const eliteRows = [{
  id: "e1",
  title: "Haaland (MCI)",
  value: "18分",
  name: "Haaland",
  team: "MCI",
  position: "FWD",
  points: 18,
  minutes: 90,
  goalsScored: 3,
  assists: 1,
  bonus: 1,
  bps: 68
}];
const eliteById = indexEventPlayersByRowId(eliteRows, eliteRows, "高分球员");
const haaland = buildPlayerLiveDetail(eliteById.e1);
assertEqual(haaland.name, "Haaland", "elite haaland name");
assertEqual(haaland.statusText, "高分球员", "elite status");
assertEqual(haaland.pointsText, "18", "elite haaland points");
assertEqual(haaland.statRows.find((row) => row.label === "进球")?.value, "3", "elite haaland goals");
assertEqual(haaland.breakdownRows.length > 0, true, "elite haaland has breakdown");
assertEqual(haaland.breakdownHint.includes("官方明细"), false, "elite haaland is not empty");

const apiEliteRows = [{ id: "elite-0" }];
const apiEliteSource = [{
  id: 9,
  webName: "Salah",
  teamShortName: "LIV",
  position: "MIDFIELDER",
  totalPoints: 15,
  minutes: 90,
  goalsScored: 2,
  cleanSheets: 1,
  bonus: 2,
  bps: 52
}];
const apiElite = indexEventPlayersByRowId(apiEliteRows, apiEliteSource, "高分球员");
const salah = buildPlayerLiveDetail(apiElite["elite-0"]);
assertEqual(salah.name, "Salah", "api elite name");
assertEqual(salah.statRows.find((row) => row.label === "进球")?.value, "2", "api elite goals");
assertEqual(salah.bpsText, "52", "api elite bps");

// defensiveContribution / goalsConceded must flow from the summary queries into
// the sheet (web match-stats parity: DC thresholds and goals-conceded rows).
const dcRows = [{
  id: 21,
  webName: "Gabriel",
  teamShortName: "ARS",
  position: "DEFENDER",
  totalPoints: 8,
  minutes: 90,
  cleanSheets: 1,
  goalsConceded: 0,
  defensiveContribution: 14,
  bonus: 2,
  bps: 41
}];
const dcPitch = buildDreamTeamPitchState(dcRows, 3);
const dcById = indexDreamTeamById(dcPitch.pitchPlayers, dcRows);
const gabriel = buildPlayerLiveDetail(dcById[dcPitch.pitchPlayers[0].id]);
assertEqual(gabriel.statRows.find((row) => row.label === "防守贡献")?.value, "14", "dream DC stat row");
assertEqual(gabriel.breakdownRows.some((row) => row.label === "防守贡献" && row.pointsText === "+2"), true, "dream DC breakdown +2");

console.log("gameweek-dream-detail tests passed");
