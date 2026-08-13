import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

test("player history cache is isolated by the authoritative season", () => {
  const price = source("miniprogram/services/price.service.ts");
  assert.match(
    price,
    /getPlayerValueByElement[\s\S]*getAppContextSnapshot\(\)\?\.season[\s\S]*if \(!season\) throw new Error[\s\S]*cachePolicy: "historical",[\s\S]*cacheVariant: `season:\$\{season\}`/
  );
  assert.doesNotMatch(price, /season:unknown/);
});
