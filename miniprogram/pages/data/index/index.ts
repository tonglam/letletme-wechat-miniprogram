import { PerformancePage } from "../../../utils/performance-page";
import { routes } from "../../../config/routes";

/**
 * Compatibility shell: the data hub became the Explore section menu (there
 * is no explore landing page, same as the web). Existing shared links and
 * stale tab state keep working by redirecting to the section's first
 * destination; the shell carries no content.
 */
PerformancePage({
  onLoad() {
    wx.redirectTo({ url: routes.summaryGameweek });
  }
});
