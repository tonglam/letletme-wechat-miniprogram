let knownOnline: boolean | null = null;
let initialized = false;
let initializationPromise: Promise<void> | null = null;

export function initializeNetworkStatus(): Promise<void> {
  if (initialized) return initializationPromise || Promise.resolve();
  initialized = true;
  try {
    if (typeof wx.onNetworkStatusChange === "function") {
      wx.onNetworkStatusChange((result) => {
        knownOnline = result.isConnected;
      });
    }
  } catch {
    // A missing listener does not make connectivity known.
  }

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
          knownOnline = result.networkType !== "none";
          finish();
        },
        fail: () => {
          knownOnline = null;
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

export function setKnownNetworkStatusForTest(online: boolean | null): void {
  initialized = true;
  initializationPromise = null;
  knownOnline = online;
}
