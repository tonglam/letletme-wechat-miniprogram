let knownOnline: boolean | null = null;
let initialized = false;

function initialize(): void {
  if (initialized) return;
  initialized = true;
  try {
    wx.getNetworkType({
      success: (result) => {
        knownOnline = result.networkType !== "none";
      }
    });
    wx.onNetworkStatusChange((result) => {
      knownOnline = result.isConnected;
    });
  } catch {
    knownOnline = null;
  }
}

export function isKnownOffline(): boolean {
  initialize();
  return knownOnline === false;
}

export function setKnownNetworkStatusForTest(online: boolean | null): void {
  initialized = true;
  knownOnline = online;
}
