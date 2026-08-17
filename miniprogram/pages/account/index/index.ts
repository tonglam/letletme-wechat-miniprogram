import { MOCK_ENABLED } from "../../../config/mock-mode";
import { routes } from "../../../config/routes";
import { accountIndexMockData } from "../../../mocks/index";
import { canonicalAction, openWebsiteAction } from "../../../utils/canonical-action";
import { goToEntrySearch, navigateTo } from "../../../utils/navigation";
import { PerformancePage } from "../../../utils/performance-page";

PerformancePage({
  data: {
    entryId: 0,
    hasEntry: false
  },

  onLoad() {
    if (MOCK_ENABLED) {
      this.setData(accountIndexMockData);
      return;
    }
    this.syncEntry();
  },

  onShow() {
    // A rebind on entry/search (or an email link sync) lands back here via the
    // tab, so refresh the status row every time the page surfaces.
    if (!MOCK_ENABLED) {
      this.syncEntry();
    }
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

  onOpenWebsite() {
    openWebsiteAction(canonicalAction("OPEN_HOME"));
  }
});
