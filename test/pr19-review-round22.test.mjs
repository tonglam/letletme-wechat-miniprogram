import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Teams owns context and directory continuations for the active lifecycle", () => {
  const teams = source("miniprogram/pages/data/teams/teams.ts");
  assert.match(teams, /const trace = originatingTrace \|\| capturePageRequestTrace\([\s\S]*callerSurface: "data-teams"/);
  assert.match(teams, /await ensureAppContext\([\s\S]*if \(!isActiveLifecycle\(\)\) return;[\s\S]*getTeamList\(context\.season, forceRefresh, trace\)[\s\S]*if \(!isActiveLifecycle\(\)\) return/);
  assert.match(teams, /onHide\(\)[\s\S]*resumeOnShow = this\.data\.loading[\s\S]*lifecycleRevision \+= 1/);
  assert.match(teams, /onShow\(\)[\s\S]*resumeForceRefresh[\s\S]*loadData\(resumeForceRefresh, trace\)/);
});

test("Selections resumes interrupted stats without resetting picker context", () => {
  const selections = source("miniprogram/pages/data/selections/selections.ts");
  assert.match(selections, /resumeStage: null as SelectionsResumeStage \| null/);
  assert.match(selections, /resumeStage = this\.startupPending[\s\S]*\? "initialize"[\s\S]*\? "stats"[\s\S]*\? "tournaments"/);
  assert.match(selections, /if \(resumeStage === "stats"\)[\s\S]*loadStats\(false, trace\)[\s\S]*if \(resumeStage === "tournaments"\)[\s\S]*loadTournaments\(resumeTournamentForceRefresh, trace\)[\s\S]*initializePage\(trace\)/);
  assert.doesNotMatch(selections, /if \(resumeStage === "stats"\)[\s\S]{0,300}initializePage\(trace\)/);
});
