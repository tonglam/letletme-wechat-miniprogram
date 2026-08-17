import { summaryGameweekMockData } from "../miniprogram/mocks/summary-gameweek.mock";
import { indexDreamTeamById, indexEventPlayersByRowId } from "../miniprogram/pages/summary/gameweek/dream-detail";
import { buildPlayerLiveDetail } from "../miniprogram/pages/live/entry/player-detail";
import { buildDreamTeamPitchState } from "../miniprogram/utils/squad-pitch";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

const mockRows = summaryGameweekMockData.pitchGroups.flatMap((group) =>
  group.players.map((player) => ({
    id: player.id,
    webName: player.name,
    teamShortName: player.team,
    position: group.id === "gkp" ? "GKP" : group.id === "def" ? "DEF" : group.id === "mid" ? "MID" : "FWD",
    points: player.points,
    minutes: player.minutes,
    goalsScored: player.goalsScored,
    assists: player.assists,
    cleanSheets: player.cleanSheets,
    saves: player.saves,
    bonus: player.bonus,
    bps: player.bps
  }))
);

const pitch = buildDreamTeamPitchState(mockRows, 3);
const byId = indexDreamTeamById(pitch.pitchPlayers, mockRows);
const palmerPitch = pitch.pitchPlayers.find((player) => player.webName === "Palmer");
if (!palmerPitch) throw new Error("Palmer missing from mock pitch");

const palmer = buildPlayerLiveDetail(byId[palmerPitch.id]);
assertEqual(palmer.name, "Palmer", "mock palmer name");
assertEqual(palmer.pointsText, "18", "mock palmer points");
assertEqual(palmer.statusText, "梦之队", "mock palmer status");
assertEqual(palmer.statRows.find((row) => row.label === "进球")?.value, "2", "mock palmer goals");
assertEqual(palmer.breakdownRows.length > 0, true, "mock palmer has breakdown");
assertEqual(palmer.breakdownHint.includes("官方明细"), false, "mock palmer is not empty");

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

const eliteById = indexEventPlayersByRowId(
  summaryGameweekMockData.eliteRows,
  summaryGameweekMockData.eliteRows,
  "高分球员"
);
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

console.log("gameweek-dream-detail tests passed");
