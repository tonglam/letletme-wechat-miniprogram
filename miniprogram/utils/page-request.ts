export type SectionStatus = "idle" | "loading" | "ready" | "empty" | "stale" | "error";

export interface SectionReadState {
  status: SectionStatus;
  errorMessage: string;
  staleStoredAt?: number;
  requestRevision: number;
}

const revisions = new WeakMap<object, Map<string, number>>();

export function nextRequestRevision(owner: object, key: string): number {
  let values = revisions.get(owner);
  if (!values) {
    values = new Map<string, number>();
    revisions.set(owner, values);
  }
  const revision = (values.get(key) || 0) + 1;
  values.set(key, revision);
  return revision;
}

export function isCurrentRevision(owner: object, key: string, revision: number): boolean {
  return revisions.get(owner)?.get(key) === revision;
}

export function setDataAsync(
  page: { setData(data: WechatMiniprogram.IAnyObject, callback?: () => void): void },
  data: WechatMiniprogram.IAnyObject
): Promise<void> {
  return new Promise((resolve) => page.setData(data, resolve));
}

export function observeSoftTimeout(
  task: Promise<unknown>,
  timeoutMs: number,
  callback: () => void
): void {
  let settled = false;
  const timer = setTimeout(() => {
    if (!settled) callback();
  }, timeoutMs);
  const settle = () => {
    settled = true;
    clearTimeout(timer);
  };
  // `finally()` creates a second promise which rejects with the original
  // task. If that derived promise is discarded, WeChat reports an unhandled
  // rejection even though the request owner handles the original task.
  void task.then(settle, settle);
}
