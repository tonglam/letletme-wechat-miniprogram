import assert from "node:assert/strict";
import test from "node:test";

import {
  isStoredSessionUsable,
  MiniProgramLinkRequiredError
} from "../miniprogram/services/auth-session.ts";

test("accepts a bearer with more than one minute remaining", () => {
  assert.equal(isStoredSessionUsable("token", "2026-01-01T00:02:00.000Z", Date.parse("2026-01-01T00:00:00Z")), true);
});

test("rejects missing, malformed, expired, and near-expiry sessions", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(isStoredSessionUsable(undefined, "2026-01-01T01:00:00Z", now), false);
  assert.equal(isStoredSessionUsable("token", "bad", now), false);
  assert.equal(isStoredSessionUsable("token", "2025-12-31T23:59:00Z", now), false);
  assert.equal(isStoredSessionUsable("token", "2026-01-01T00:00:30Z", now), false);
});

test("uses a typed error for the authoritative account-link handoff", () => {
  const error = new MiniProgramLinkRequiredError();
  assert.equal(error instanceof MiniProgramLinkRequiredError, true);
  assert.equal(error.name, "MiniProgramLinkRequiredError");
});
