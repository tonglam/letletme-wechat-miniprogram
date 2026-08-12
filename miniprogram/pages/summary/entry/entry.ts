import { PerformancePage } from "../../../utils/performance-page";
import { routes } from "../../../config/routes";

/**
 * Compatibility shell (plan §8.1): the Entry Summary moved to
 * /pages/my-fpl/team/team. Existing shared links and the 统计 nav group keep
 * working by redirecting; the shell carries no content of its own.
 */
PerformancePage({
  onLoad(options: Record<string, string | undefined>) {
    const query = Object.keys(options || {})
      .filter((key) => options[key] !== undefined)
      .map((key) => `${key}=${encodeURIComponent(String(options[key]))}`)
      .join("&");
    wx.redirectTo({ url: `${routes.myFplTeam}${query ? `?${query}` : ""}` });
  }
});
