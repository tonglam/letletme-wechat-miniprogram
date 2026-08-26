import type { CountdownParts } from "./date";

const SITE = "https://letletme.top/zh-CN";

export interface DeadlineShareInput {
  event: number;
  deadlineText: string;
  countdown: CountdownParts;
  passed: boolean;
}

/** Deadline reminder text for chat sharing — backs the home countdown card. */
export function formatDeadlineShareText(input: DeadlineShareInput): string {
  const eventLabel = input.event > 0 ? `GW${input.event}` : "下一轮";
  if (input.passed) {
    return [
      `${eventLabel} 进行中`,
      "",
      "等待官方数据更新，实时比分和积分以比赛页为准。",
      SITE
    ].join("\n");
  }
  const { days, hours, minutes, seconds } = input.countdown;
  const remaining = Number(days) > 0
    ? `还剩 ${days}天 ${hours}:${minutes}:${seconds}`
    : `还剩 ${hours}:${minutes}:${seconds}`;
  const lines = [`${eventLabel} 截止倒计时`, "", remaining];
  if (input.deadlineText) {
    lines.push(`截止时间：${input.deadlineText}`);
  }
  lines.push("", SITE);
  return lines.join("\n");
}
