import type { EntryTransfer } from "../../../models/entry";
import { formatPrice } from "../../../utils/fpl";

export interface TransferRow {
  inText: string;
  outText: string;
  priceText: string;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value: unknown, fallback = "-"): string {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value);
}

export function normalizeTransfer(transfer: EntryTransfer): TransferRow {
  const raw = transfer as EntryTransfer & Record<string, unknown>;
  const inTeam = textValue(raw.elementInTeamShortName, "");
  const outTeam = textValue(raw.elementOutTeamShortName, "");
  const inName = textValue(raw.playerIn ?? raw.elementInWebName);
  const outName = textValue(raw.playerOut ?? raw.elementOutWebName);
  const price = numberValue(raw.cost ?? raw.transferCost);

  return {
    inText: inTeam ? `【${inTeam}】${inName}` : inName,
    outText: outTeam ? `【${outTeam}】${outName}` : outName,
    priceText: formatPrice(price)
  };
}
