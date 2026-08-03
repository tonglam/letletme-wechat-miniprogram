import assert from "node:assert/strict";
import test from "node:test";

import {
  getGraphQLEndpoint,
  getMiniProgramApiBase,
  setGraphQLEndpointOverride
} from "../miniprogram/config/env.ts";

function installWx(envVersion, values) {
  const writes = [];
  globalThis.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion } }),
    getStorageSync: (key) => values[key],
    setStorageSync: (key, value) => writes.push([key, value]),
    removeStorageSync: () => undefined
  };
  return writes;
}

test("release endpoints ignore local storage overrides", () => {
  const previous = globalThis.wx;
  try {
    const writes = installWx("release", {
      letletme_graphql_endpoint_override: "https://attacker.invalid/graphql",
      letletme_web_miniprogram_api_override: "https://attacker.invalid/api"
    });
    assert.equal(getGraphQLEndpoint(), "https://www.letletme.top/api/graphql");
    assert.equal(getMiniProgramApiBase(), "https://www.letletme.top/api/miniprogram");
    setGraphQLEndpointOverride("https://attacker.invalid/graphql");
    assert.deepEqual(writes, []);
  } finally {
    globalThis.wx = previous;
  }
});

test("develop endpoints support explicit local overrides", () => {
  const previous = globalThis.wx;
  try {
    const writes = installWx("develop", {
      letletme_graphql_endpoint_override: "http://localhost:4100/graphql",
      letletme_web_miniprogram_api_override: "http://localhost:3100/api/miniprogram/"
    });
    assert.equal(getGraphQLEndpoint(), "http://localhost:4100/graphql");
    assert.equal(getMiniProgramApiBase(), "http://localhost:3100/api/miniprogram");
    setGraphQLEndpointOverride("http://localhost:4200/graphql");
    assert.equal(writes.length, 1);
  } finally {
    globalThis.wx = previous;
  }
});
