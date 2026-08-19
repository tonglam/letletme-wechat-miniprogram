/**
 * Systemic guard: every named value import from a local miniprogram module
 * must resolve to an exported binding. Catches half-applied stashes like
 * `canReadEventReporting is not a function` before DevTools runtime.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../miniprogram");

const IMPORT_RE =
  /(?:^|\n)import\s+(?:type\s+)?(?:\{([^}]+)\}|[\w*$]+(?:\s*,\s*\{([^}]+)\})?)\s+from\s+["']([^"']+)["']/g;

function listTsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "miniprogram_npm" || name === "node_modules") continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listTsFiles(full));
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function parseNamedImports(clause) {
  return clause
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const typeOnly = /^type\s+/.test(part);
      const cleaned = part.replace(/^type\s+/, "").trim();
      const asMatch = cleaned.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
      const name = asMatch ? asMatch[1] : cleaned;
      return { name, typeOnly };
    })
    .filter((item) => item.name && item.name !== "type");
}

function collectExports(source) {
  const text = stripComments(source);
  const names = new Set();

  for (const match of text.matchAll(
    /\bexport\s+(?:async\s+)?(?:function|class|const|let|var|enum)\s+([\w$]+)/g
  )) {
    names.add(match[1]);
  }
  for (const match of text.matchAll(/\bexport\s+type\s+(?:interface\s+)?([\w$]+)/g)) {
    names.add(match[1]);
  }
  for (const match of text.matchAll(/\bexport\s+interface\s+([\w$]+)/g)) {
    names.add(match[1]);
  }
  for (const match of text.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    for (const part of match[1].split(",")) {
      const cleaned = part.trim();
      if (!cleaned || cleaned.startsWith("type ")) continue;
      const asMatch = cleaned.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
      names.add(asMatch ? asMatch[2] : cleaned.replace(/^type\s+/, ""));
    }
  }
  return names;
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, `${base}.ts`, path.join(base, "index.ts")];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

test("named local imports resolve to exported bindings", () => {
  const files = listTsFiles(ROOT);
  const exportCache = new Map();
  const failures = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const text = stripComments(source);
    IMPORT_RE.lastIndex = 0;
    let match = IMPORT_RE.exec(text);
    while (match) {
      const full = match[0];
      const isTypeImport = /(?:^|\n)import\s+type\s+/.test(full);
      const clause = match[1] || match[2];
      const specifier = match[3];
      match = IMPORT_RE.exec(text);
      if (!clause || isTypeImport) continue;

      const target = resolveImport(file, specifier);
      if (!target) {
        if (specifier.startsWith(".")) {
          failures.push(`${path.relative(ROOT, file)} -> missing module ${specifier}`);
        }
        continue;
      }
      if (!exportCache.has(target)) {
        exportCache.set(target, collectExports(readFileSync(target, "utf8")));
      }
      const exports = exportCache.get(target);
      for (const item of parseNamedImports(clause)) {
        if (item.typeOnly) continue;
        if (!exports.has(item.name)) {
          failures.push(
            `${path.relative(ROOT, file)} imports { ${item.name} } from ${specifier}, but it is not exported by ${path.relative(ROOT, target)}`
          );
        }
      }
    }
  }

  assert.deepEqual(failures, [], failures.join("\n"));
});

test("canReadEventReporting is exported and used by reporting desks", () => {
  const util = readFileSync(path.join(ROOT, "utils/event-context.ts"), "utf8");
  assert.match(util, /export function canReadEventReporting/);
  for (const rel of [
    "pages/my-fpl/team/team.ts",
    "pages/summary/gameweek/gameweek.ts",
    "pages/summary/tournament/tournament.ts",
    "pages/my-fpl/leagues/leagues.ts",
    "pages/data/selections/selections.ts"
  ]) {
    const page = readFileSync(path.join(ROOT, rel), "utf8");
    assert.match(page, /canReadEventReporting/);
    assert.match(page, /from ["'].*utils\/event-context["']/);
  }
});
