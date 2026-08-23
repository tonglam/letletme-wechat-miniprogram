import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const upload = readFileSync(new URL("../.github/workflows/wechat-upload.yml", import.meta.url), "utf8");
const release = readFileSync(new URL("../.github/workflows/wechat-release.yml", import.meta.url), "utf8");

test("upload run name binds version and exact commit", () => {
  assert.match(upload, /run-name: WeChat upload \$\{\{ inputs\.version \}\} @ \$\{\{ inputs\.commit_sha \}\}/);
  assert.match(upload, /test "\$INPUT_COMMIT_SHA" = "\$checkout_sha"/);
  assert.match(upload, /test "\$checkout_sha" = "\$remote_sha"/);
  assert.match(upload, /persist-credentials: false/);
  assert.match(upload, /git\/ref\/heads\/main/);
  assert.doesNotMatch(upload, /persist-credentials: true/);
  assert.match(upload, /umask 077/);
  assert.match(upload, /wechat-audit-provenance\.json/);
  assert.match(upload, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
});

test("release verifies the successful upload run and its audit id", () => {
  for (const input of ["auditid", "version", "commit_sha", "upload_run_id"]) {
    assert.match(release, new RegExp(`\\n      ${input}:`));
  }
  assert.match(release, /actions\/runs\/\$UPLOAD_RUN_ID/);
  assert.match(release, /ref: \$\{\{ inputs\.commit_sha \}\}/);
  assert.match(release, /test "\$\(git rev-parse HEAD\)" = "\$RELEASE_COMMIT_SHA"/);
  assert.doesNotMatch(release, /git\/ref\/heads\/main/);
  assert.doesNotMatch(release, /test "\$remote_sha" = "\$RELEASE_COMMIT_SHA"/);
  assert.match(release, /\.head_sha'\)" = "\$RELEASE_COMMIT_SHA"/);
  assert.match(release, /WeChat upload \$RELEASE_VERSION @ \$RELEASE_COMMIT_SHA/);
  assert.match(release, /actions\/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093/);
  assert.match(release, /run-id: \$\{\{ inputs\.upload_run_id \}\}/);
  assert.match(release, /\.auditid' "\$provenance"\)" = "\$AUDIT_ID"/);
  assert.doesNotMatch(release, /actions\/runs\/\$UPLOAD_RUN_ID\/logs/);
  assert.match(release, /version: \$RELEASE_VERSION/);
  assert.match(release, /commit: \$RELEASE_COMMIT_SHA/);
});
