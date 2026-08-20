/**
 * Share text builders for the Explore section desks (市场 / 趋势) — mirrors
 * the web share contracts in app/data/market/_lib and app/data/selections/_lib.
 */
import type { PlayerValueChange } from "../models/player";

const SITE = "https://letletme.top/zh-CN";

function formatMoneyTenths(tenths?: number | null): string {
  if (typeof tenths !== "number" || !Number.isFinite(tenths)) return "-";
  return `£${(tenths / 10).toFixed(1)}m`;
}

/** YYYY-MM-DD → DD/MM/YYYY for share paste (web formatShareChangeDate). */
function formatShareChangeDate(value: string): string {
  const day = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return String(value || "");
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

function changeLine(change: PlayerValueChange): string {
  const name = change.name || change.playerName || "-";
  const pos = change.position || "";
  const team = change.teamShortName || change.teamName || change.team || "";
  const bits = `${name}${pos ? ` ${pos}` : ""}${team ? ` ${team}` : ""}`;
  return `- ${bits} · ${formatMoneyTenths(change.oldValue)} → ${formatMoneyTenths(change.newValue)}`;
}

/** Market desk share: one calendar day, rises then falls (web formatPriceMovementShareText). */
export function formatPriceMovementShareText(input: {
  changeDate: string;
  rises: PlayerValueChange[];
  falls: PlayerValueChange[];
}): string {
  const lines = [`身价变化 · ${formatShareChangeDate(input.changeDate)}`, ""];
  lines.push(`上涨 (${input.rises.length})`);
  if (input.rises.length === 0) lines.push("无");
  else input.rises.forEach((change) => lines.push(changeLine(change)));
  lines.push("", `下跌 (${input.falls.length})`);
  if (input.falls.length === 0) lines.push("无");
  else input.falls.forEach((change) => lines.push(changeLine(change)));
  lines.push("", `市场：${SITE}/explore/market`);
  return lines.join("\n");
}

/** Trends desk share: the active board only (web SelectionsShareLabels). */
export function formatSelectionsShareText(input: {
  tabLabel: string;
  tournamentName: string;
  event: number;
  fieldLine?: string;
  rows: Array<{
    name: string;
    /** team · position · secondary stat (EO% or transfer count). */
    meta: string;
    primaryValue: string;
  }>;
}): string {
  const lines = [`${input.tabLabel} · ${input.tournamentName} · GW${input.event}`, ""];
  if (input.fieldLine) lines.push(input.fieldLine, "");
  if (input.rows.length === 0) {
    lines.push("无");
  } else {
    input.rows.forEach((row) => {
      const bits = [row.name, row.meta].filter(Boolean).join(" · ");
      lines.push(`- ${bits} · ${row.primaryValue}`);
    });
  }
  lines.push("", `趋势：${SITE}/explore/selections`);
  return lines.join("\n");
}
