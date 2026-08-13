let knownOnline: boolean | null = null;
let initialized = false;
let initializationPromise: Promise<void> | null = null;
let listenerRegistrationAttempted = false;
let listenerInstalled = false;
let lastProbeAt = 0;
let networkStatusGeneration = 0;

const LISTENERLESS_REPROBE_MS = 5_000;

export function initializeNetworkStatus(): Promise<void> {
  if (initializationPromise) return initializationPromise;
  if (initialized && listenerInstalled) return Promise.resolve();
  if (initialized && Date.now() - lastProbeAt < LISTENERLESS_REPROBE_MS) {
    return Promise.resolve();
  }
  initialized = true;
  if (!listenerRegistrationAttempted) {
    listenerRegistrationAttempted = true;
    try {
      if (typeof wx.onNetworkStatusChange === "function") {
        wx.onNetworkStatusChange((result) => {
          networkStatusGeneration += 1;
          knownOnline = result.isConnected;
        });
        listenerInstalled = true;
      }
    } catch {
      listenerInstalled = false;
    }
  }

  lastProbeAt = Date.now();
  const probeGeneration = networkStatusGeneration;
  initializationPromise = new Promise<void>((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => finish(), 250);
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    };
    try {
      wx.getNetworkType({
        success: (result) => {
          if (probeGeneration === networkStatusGeneration) {
            knownOnline = result.networkType !== "none";
          }
          finish();
        },
        fail: () => {
          if (probeGeneration === networkStatusGeneration) {
            knownOnline = null;
          }
          finish();
        },
        complete: finish
      });
    } catch {
      knownOnline = null;
      finish();
    }
  }).finally(() => {
    initializationPromise = null;
  });
  return initializationPromise;
}

function initialize(): void {
  void initializeNetworkStatus();
}

export function isKnownOffline(): boolean {
  initialize();
  return knownOnline === false;
}

export function setKnownNetworkStatusForTest(
  online: boolean | null,
  options: { listenerInstalled?: boolean; lastProbeAt?: number } = {}
): void {
  initialized = true;
  initializationPromise = null;
  knownOnline = online;
  networkStatusGeneration += 1;
  listenerRegistrationAttempted = true;
  listenerInstalled = options.listenerInstalled ?? true;
  lastProbeAt = options.lastProbeAt ?? Date.now();
}
