/**
 * Central home for system info reads. `wx.getSystemInfoSync` is deprecated in
 * favor of getWindowInfo/getDeviceInfo, but the locked miniprogram-api-typings
 * 2.x has no declarations for them — narrow casts, with getSystemInfoSync as
 * the fallback for old base libraries. The fallback is short-circuited whenever
 * the modern API exists, so no deprecation warning fires on current clients.
 */
type WindowInfoLike = { pixelRatio?: unknown };
type DeviceInfoLike = { platform?: unknown; system?: unknown };

export function windowPixelRatio(): number {
  const getWindowInfo = (wx as unknown as { getWindowInfo?: () => WindowInfoLike }).getWindowInfo;
  const info = typeof getWindowInfo === "function" ? getWindowInfo() : wx.getSystemInfoSync();
  return Number(info.pixelRatio) || 1;
}

export function devicePlatform(): string {
  const getDeviceInfo = (wx as unknown as { getDeviceInfo?: () => DeviceInfoLike }).getDeviceInfo;
  const info = typeof getDeviceInfo === "function" ? getDeviceInfo() : wx.getSystemInfoSync();
  return String(info.platform ?? "");
}

export function deviceSystem(): string {
  const getDeviceInfo = (wx as unknown as { getDeviceInfo?: () => DeviceInfoLike }).getDeviceInfo;
  const info = typeof getDeviceInfo === "function" ? getDeviceInfo() : wx.getSystemInfoSync();
  return String(info.system ?? "");
}
