import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";

const testFiles = [
  ...globSync("test/**/*.test.mjs"),
  ...globSync("tests/**/*.test.ts")
];
const result = spawnSync(process.execPath, [
  "--experimental-test-coverage",
  "--test-coverage-include", "miniprogram/**/*.ts",
  "--test-coverage-exclude", "**/*.d.ts",
  "--import", "tsx",
  "--test",
  ...testFiles
], { encoding: "utf8" });

process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.status !== 0) process.exit(result.status || 1);

const match = (result.stdout || "").match(/^\s*[#ℹ]\s+all files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|/m);
if (!match) {
  console.error("Coverage summary was not produced by Node");
  process.exit(1);
}
const [lines, branches, functions] = match.slice(1).map(Number);
const minimum = { lines: 65, branches: 75, functions: 65 };
const failed = Object.entries({ lines, branches, functions })
  .filter(([key, value]) => value < minimum[key])
  .map(([key, value]) => `${key} ${value}% < ${minimum[key]}%`);
if (failed.length) {
  console.error(`Coverage gate failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`Coverage gate passed: lines ${lines}%, branches ${branches}%, functions ${functions}%`);
