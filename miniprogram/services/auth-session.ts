export function isStoredSessionUsable(
  token: string | undefined,
  expiresAt: string | undefined,
  nowMs = Date.now()
): boolean {
  if (!token || !expiresAt) return false;
  const expiresMs = Date.parse(expiresAt);
  return Number.isFinite(expiresMs) && expiresMs > nowMs + 60_000;
}
