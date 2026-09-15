import { writeFile } from "node:fs/promises";

const version = process.env.RELEASE_VERSION?.trim() ?? "";
const commitSha = process.env.RELEASE_COMMIT_SHA?.trim() ?? "";

if (!/^[0-9A-Za-z._-]{1,64}$/.test(version)) {
  throw new Error("RELEASE_VERSION must be a bounded release version");
}
if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
  throw new Error("RELEASE_COMMIT_SHA must be the exact 40-character commit SHA");
}

const source = `/** Generated for the signed WeChat upload; do not edit by hand. */
export const MINI_BUILD_PROVENANCE = {
  version: ${JSON.stringify(version)},
  commitSha: ${JSON.stringify(commitSha.toLowerCase())},
} as const;

function safePart(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9._-]/g, "-");
  return normalized.slice(0, 64) || fallback;
}

export function miniClientRelease(): string {
  const version = safePart(MINI_BUILD_PROVENANCE.version, "development");
  const commit = safePart(MINI_BUILD_PROVENANCE.commitSha, "development");
  return \`miniprogram-\${version}-\${commit.slice(0, 12)}\`.slice(0, 128);
}
`;

await writeFile(new URL("../miniprogram/config/build-provenance.ts", import.meta.url), source, "utf8");
