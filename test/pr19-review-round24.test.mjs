import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

for (const [label, path, resultField, serviceCall, surface] of [
  ["Player Detail", "miniprogram/pages/data/player-detail/player-detail.ts", "player", "getPlayerInfoByCode", "data-player-detail"],
  ["Team Detail", "miniprogram/pages/data/team-detail/team-detail.ts", "team", "getTeamSummary", "data-team-detail"]
]) {
  test(`${label} stops hidden startup and resumes with its originating trace`, () => {
    const page = source(path);
    assert.match(page, new RegExp(`capturePageRequestTrace\\([\\s\\S]*callerSurface: "${surface}"`));
    assert.match(page, /await ensureAppContext\([\s\S]*if \(!isActiveRequest\(\)\) return/);
    assert.match(page, new RegExp(`${serviceCall}\\([^;]*trace\\)[\\s\\S]*if \\(!isActiveRequest\\(\\)\\) return`));
    assert.match(page, new RegExp(`onHide\\(\\)[\\s\\S]*resumeOnShow = this\\.data\\.loading && !this\\.data\\.${resultField}[\\s\\S]*lifecycleRevision \\+= 1`));
    assert.match(page, /onShow\(\)[\s\S]*resumeOnShow[\s\S]*loadData\("show"\)/);
  });
}
