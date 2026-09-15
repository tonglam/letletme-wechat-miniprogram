/**
 * The upload workflow replaces these values with the exact user-visible
 * version and the 40-character source commit before packaging. Development
 * builds keep an explicit local identity so diagnostics never look like a
 * production release.
 */
export const MINI_BUILD_PROVENANCE = {
  version: "development",
  commitSha: "development",
} as const;

function safePart(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9._-]/g, "-");
  return normalized.slice(0, 64) || fallback;
}

export function miniClientRelease(): string {
  const version = safePart(MINI_BUILD_PROVENANCE.version, "development");
  const commit = safePart(MINI_BUILD_PROVENANCE.commitSha, "development");
  return `miniprogram-${version}-${commit.slice(0, 12)}`.slice(0, 128);
}
