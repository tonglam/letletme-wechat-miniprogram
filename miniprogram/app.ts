import { getCurrentEventAndDeadline } from "./services/common.service";
import { formatDeadline } from "./utils/date";
import { getEntryId } from "./utils/storage";

App<IAppOption>({
  globalData: {
    season: "",
    gw: 0,
    lastGw: 0,
    nextGw: 0,
    utcDeadline: "",
    deadline: "",
    entryId: undefined
  },

  async onLaunch() {
    this.globalData.entryId = getEntryId();
    await this.initAppData();
  },

  async initAppData() {
    try {
      const current = await getCurrentEventAndDeadline();
      const gw = Number(current.gw || current.event || current.currentEvent || 0);
      const utcDeadline = String(current.utcDeadline || current.deadline || "");

      this.globalData.season = String(current.season || "");
      this.globalData.gw = gw;
      this.globalData.lastGw = Math.max(gw - 1, 0);
      this.globalData.nextGw = gw + 1;
      this.globalData.utcDeadline = utcDeadline;
      this.globalData.deadline = formatDeadline(utcDeadline);
    } catch {
      // Keep launch resilient when shared app data is temporarily unavailable.
    }
  }
});
