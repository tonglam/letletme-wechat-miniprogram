import { PerformancePage } from "../../../utils/performance-page";
import { routes } from "../../../config/routes";

/**
 * Compatibility shell (explore plan §7.2): the data hub became the Explore
 * overview at /pages/explore/index/index. Existing shared links and stale
 * tab state keep working by redirecting; the shell carries no content.
 */
PerformancePage({
  onLoad() {
    wx.redirectTo({ url: routes.exploreIndex });
  }
});
