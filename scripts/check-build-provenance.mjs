import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../miniprogram/config/build-provenance.ts", import.meta.url), "utf8");
const version = process.env.RELEASE_VERSION?.trim() ?? "";
const commitSha = process.env.RELEASE_COMMIT_SHA?.trim().toLowerCase() ?? "";

if (!/^[0-9A-Za-z._-]{1,64}$/.test(version) || !/^[0-9a-f]{40}$/.test(commitSha)) {
  throw new Error("Release provenance environment is missing or malformed");
}
if (!source.includes(`version: ${JSON.stringify(version)}`) || !source.includes(`commitSha: ${JSON.stringify(commitSha)}`)) {
  throw new Error("Generated Mini Program provenance does not match the requested release");
}
