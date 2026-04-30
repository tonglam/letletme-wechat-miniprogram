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
  }
  initAppData: () => Promise<void>
}
