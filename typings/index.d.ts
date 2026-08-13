/// <reference path="./types/index.d.ts" />

interface IAppOption extends WechatMiniprogram.IAnyObject {
  globalData: {
    season: string
    gw: number
    currentGw: number
    lastGw: number
    nextGw: number
    utcDeadline: string
    deadline: string
    entryId?: number
    openid?: string
    authRevision: number
    contextRevision: number
  }
  _pendingInit: Promise<void> | null
  _pendingInitForced: boolean
  _authReadyResolve: (() => void) | null
  authReady: Promise<void> | null
  initAppData: (forceRefresh?: boolean) => Promise<void>
}

declare namespace WechatMiniprogram {
  interface Wx {
    requirePrivacyAuthorize(option: {
      success?: (res: { errMsg: string }) => void
      fail?: (err: { errMsg: string }) => void
      complete?: (res: { errMsg: string }) => void
    }): void
    getPrivacySetting(option: {
      success?: (res: { privacyAuthorized: boolean; privacyRequires: string[] }) => void
      fail?: (err: { errMsg: string }) => void
      complete?: (res: { errMsg: string }) => void
    }): void
  }
}
