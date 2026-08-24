import { routes } from "../../../config/routes";
import { awaitLinkedAccountSnapshot } from "../../../services/auth.service";
import { canonicalAction, openWebsiteAction } from "../../../utils/canonical-action";
import { waitForAuthoritativeFollow } from "../../../utils/follow";
import { goToEntrySearch, navigateTo } from "../../../utils/navigation";
import { PerformancePage } from "../../../utils/performance-page";

PerformancePage({
  data: {
    entryId: 0,
    hasEntry: false,
    accountLinked: false,
    accountEmail: ""
  },

  async onLoad() {
    await waitForAuthoritativeFollow();
    this.syncEntry();
    return this.syncAccount();
  },

  async onShow() {
    // A rebind on entry/search (or an email link sync) lands back here via the
    // tab, so refresh the status row every time the page surfaces.
    await waitForAuthoritativeFollow();
    this.syncEntry();
    return this.syncAccount();
  },

  syncEntry() {
    const entryId = Number(getApp<IAppOption>().globalData.entryId) || 0;
    this.setData({ entryId, hasEntry: entryId > 0 });
  },

  async syncAccount() {
    const snapshot = await awaitLinkedAccountSnapshot();
    this.setData({
      accountLinked: snapshot.linked,
      accountEmail: snapshot.email
    });
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
