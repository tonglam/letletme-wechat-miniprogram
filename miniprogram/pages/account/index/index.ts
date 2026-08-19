import { routes } from "../../../config/routes";
import { canonicalAction, openWebsiteAction } from "../../../utils/canonical-action";
import { goToEntrySearch, navigateTo } from "../../../utils/navigation";
import { PerformancePage } from "../../../utils/performance-page";

PerformancePage({
  data: {
    entryId: 0,
    hasEntry: false
  },

  onLoad() {
    this.syncEntry();
  },

  onShow() {
    // A rebind on entry/search (or an email link sync) lands back here via the
    // tab, so refresh the status row every time the page surfaces.
    this.syncEntry();
  },

  syncEntry() {
    const entryId = Number(getApp<IAppOption>().globalData.entryId) || 0;
    this.setData({ entryId, hasEntry: entryId > 0 });
  },

  onGoEntrySearch() {
    goToEntrySearch();
  },

  onGoAccountLink() {
    navigateTo(routes.accountLink);
  },

  onGoReport() {
    navigateTo(routes.accountReport);
  },

  onOpenWebsite() {
    openWebsiteAction(canonicalAction("OPEN_HOME"));
  }
});
