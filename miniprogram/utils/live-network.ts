/**
 * wx-bound connectivity, isolated here so the refresh-controller core stays
 * testable in node. Optimistic: unknown states count as online.
 */
export function subscribeNetworkStatus(onChange: (online: boolean) => void): () => void {
  const handler = (res: WechatMiniprogram.OnNetworkStatusChangeCallbackResult) => {
    onChange(res.isConnected);
  };

  try {
    wx.getNetworkType({
      success: (res) => {
        if (res.networkType === "none") {
          onChange(false);
        }
      }
    });
    wx.onNetworkStatusChange(handler);
  } catch {
    return () => {};
  }

  return () => {
    try {
      wx.offNetworkStatusChange(handler);
    } catch {}
  };
}
