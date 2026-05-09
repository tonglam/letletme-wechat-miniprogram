/// <reference path="./types/index.d.ts" />

interface IAppOption extends WechatMiniprogram.IAnyObject {
  globalData: {
    season: string
    gw: number
    lastGw: number
    nextGw: number
    utcDeadline: string
    deadline: string
    entryId?: number
    openid?: string
  }
  _pendingInit: Promise<void> | null
  initAppData: () => Promise<void>
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
