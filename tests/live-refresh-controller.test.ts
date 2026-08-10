import { createLiveRefreshController } from "../miniprogram/utils/live-refresh-controller";
import type { LiveSnapshotStatus } from "../miniprogram/models/live";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function snapshot(revision: string, state: LiveSnapshotStatus["state"] = "LIVE"): LiveSnapshotStatus {
  return {
    eventId: 33,
    revision,
    state,
    publishedAt: "2026-08-04T10:00:00.000Z",
    checkedAt: "2026-08-04T10:00:00.000Z"
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function testUnchangedRevisionOnlyAccepts(): Promise<void> {
  const accepted: Array<LiveSnapshotStatus | null> = [];
  let reloads = 0;
  const controller = createLiveRefreshController({
    isEligible: () => true,
    getAcceptedSnapshot: () => snapshot("aa"),
    probe: () => Promise.resolve(snapshot("aa")),
    reload: () => { reloads += 1; return Promise.resolve(); },
    acceptSnapshot: (s) => accepted.push(s)
  });

  await controller.probeNow();
  assertEqual(accepted.length, 1, "unchanged revision adopts the observed snapshot");
  assertEqual(reloads, 0, "unchanged revision never reloads");
  controller.dispose();
}

async function testChangedRevisionReloadsOnceUnderConcurrency(): Promise<void> {
  const gate = deferred<LiveSnapshotStatus>();
  let reloads = 0;
  let probes = 0;
  const controller = createLiveRefreshController({
    isEligible: () => true,
    getAcceptedSnapshot: () => snapshot("aa"),
    probe: () => { probes += 1; return gate.promise; },
    reload: () => { reloads += 1; return Promise.resolve(); }
  });

  const first = controller.probeNow();
  const second = controller.probeNow();
  gate.resolve(snapshot("bb"));
  await Promise.all([first, second]);

  assertEqual(probes, 1, "concurrent probes coalesce into one request");
  assertEqual(reloads, 1, "changed revision reloads exactly once");
  controller.dispose();
}

async function testProbeErrorKeepsPolling(): Promise<void> {
  const errors: string[] = [];
  let probes = 0;
  const controller = createLiveRefreshController({
    isEligible: () => true,
    getAcceptedSnapshot: () => snapshot("aa"),
    probe: () => {
      probes += 1;
      return probes === 1 ? Promise.reject(new Error("网络异常")) : Promise.resolve(snapshot("aa"));
    },
    reload: () => Promise.resolve(),
    onProbeError: (message) => errors.push(message),
    intervalMs: 15
  });

  await controller.probeNow();
  assertEqual(errors.length, 1, "probe failure surfaces to the page");

  controller.sync();
  await sleep(40);
  assert(probes >= 2, "timer keeps probing after a failure");
  controller.dispose();
}

async function testIneligibleNeverStartsTimer(): Promise<void> {
  let probes = 0;
  const controller = createLiveRefreshController({
    isEligible: () => false,
    getAcceptedSnapshot: () => snapshot("aa"),
    probe: () => { probes += 1; return Promise.resolve(snapshot("aa")); },
    reload: () => Promise.resolve(),
    intervalMs: 10
  });

  controller.sync();
  await controller.probeNow();
  await sleep(30);
  assertEqual(probes, 0, "ineligible pages never probe");
  controller.dispose();
}

async function testNetworkOfflineStopsAndRecoveryProbes(): Promise<void> {
  let online = true;
  let emit: (online: boolean) => void = () => {};
  let probes = 0;
  const controller = createLiveRefreshController({
    isEligible: () => true,
    getAcceptedSnapshot: () => snapshot("aa"),
    probe: () => { probes += 1; return Promise.resolve(snapshot("aa")); },
    reload: () => Promise.resolve(),
    isOnline: () => online,
    subscribeNetwork: (onChange) => {
      emit = onChange;
      return () => {};
    },
    intervalMs: 10
  });

  controller.sync();
  await sleep(25);
  const probesWhileOnline = probes;
  assert(probesWhileOnline > 0, "timer probes while online");

  online = false;
  emit(false);
  const stoppedAt = probes;
  await sleep(30);
  assertEqual(probes, stoppedAt, "offline stops all probing");

  online = true;
  emit(true);
  await sleep(5);
  assert(probes > stoppedAt, "recovery triggers one immediate probe");
  controller.dispose();
}

async function testStopDiscardsLateResponse(): Promise<void> {
  const gate = deferred<LiveSnapshotStatus>();
  let accepted = 0;
  let reloads = 0;
  const controller = createLiveRefreshController({
    isEligible: () => true,
    getAcceptedSnapshot: () => snapshot("aa"),
    probe: () => gate.promise,
    reload: () => { reloads += 1; return Promise.resolve(); },
    acceptSnapshot: () => { accepted += 1; }
  });

  const pending = controller.probeNow();
  controller.stop();
  gate.resolve(snapshot("bb"));
  await pending;

  assertEqual(accepted, 0, "late accept after stop is discarded");
  assertEqual(reloads, 0, "late reload after stop is discarded");
  controller.dispose();
}

async function main(): Promise<void> {
  await testUnchangedRevisionOnlyAccepts();
  await testChangedRevisionReloadsOnceUnderConcurrency();
  await testProbeErrorKeepsPolling();
  await testIneligibleNeverStartsTimer();
  await testNetworkOfflineStopsAndRecoveryProbes();
  await testStopDiscardsLateResponse();
  console.log("live-refresh-controller tests passed");
}

void main();
