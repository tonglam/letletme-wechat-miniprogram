import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const miniprogramRoot = fileURLToPath(new URL("../miniprogram/", import.meta.url));

function wxssFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return wxssFiles(path);
    return entry.isFile() && entry.name.endsWith(".wxss") ? [path] : [];
  });
}

test("WXSS selectors avoid unsupported universal selectors", () => {
  const offenders = [];

  for (const file of wxssFiles(miniprogramRoot)) {
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectorBlocks = source.matchAll(/([^{}]+)\{/g);

    for (const match of selectorBlocks) {
      const selector = match[1].trim();
      if (!selector.startsWith("@") && selector.includes("*")) {
        offenders.push(`${relative(miniprogramRoot, file)}: ${selector}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `WeChat DevTools rejects universal selectors in WXSS:\n${offenders.join("\n")}`
  );
});
