import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  recordBugReportDiagnostic,
  readBugReportDiagnostics,
  resetBugReportDiagnosticsForTests
} from "../miniprogram/utils/bug-report-diagnostics.ts";
import {
  normalizeBugReportBody,
  screenshotWithinLimit
} from "../miniprogram/services/bug-report.service.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("bug report diagnostics keep the last three GraphQL traces", () => {
  resetBugReportDiagnosticsForTests();
  recordBugReportDiagnostic({ at: "1", requestId: "a", operation: "Home" });
  recordBugReportDiagnostic({ at: "2", requestId: "b" });
  recordBugReportDiagnostic({ at: "3", requestId: "c" });
  recordBugReportDiagnostic({ at: "4", requestId: "d" });
  assert.deepEqual(
    readBugReportDiagnostics().map((item) => item.requestId),
    ["b", "c", "d"]
  );
});

test("bug report body and screenshot limits match the product rules", () => {
  assert.equal(normalizeBugReportBody("  首页一直转圈  "), "首页一直转圈");
  assert.equal(screenshotWithinLimit(0), false);
  assert.equal(screenshotWithinLimit(2 * 1024 * 1024), true);
  assert.equal(screenshotWithinLimit(2 * 1024 * 1024 + 1), false);
});

test("Me tab and error state expose the report entry", () => {
  const app = JSON.parse(readFileSync(resolve(root, "miniprogram/app.json"), "utf8"));
  const account = readFileSync(resolve(root, "miniprogram/pages/account/index/index.wxml"), "utf8");
  const errorState = readFileSync(
    resolve(root, "miniprogram/components/app-error-state/app-error-state.wxml"),
    "utf8"
  );
  const service = readFileSync(
    resolve(root, "miniprogram/services/bug-report.service.ts"),
    "utf8"
  );
  assert.ok(app.pages.includes("pages/account/report/report"));
  assert.match(account, /遇到问题了？/);
  assert.match(errorState, /bindtap="onReport"/);
  assert.match(errorState, /\{\{reportText\}\}/);
  assert.match(service, /header\.Authorization = `Bearer \$\{token\}`/);
  assert.doesNotMatch(service, /data:\s*\{[^}]*\btoken\b/);
});
