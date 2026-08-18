import type { EntryTransfer } from "../miniprogram/models/entry";
import { normalizeTransfer } from "../miniprogram/pages/live/entry/transfer";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const transfer = {
  playerIn: "Igor Jesus",
  playerOut: "Welbeck",
  elementInTeamShortName: "NFO",
  elementOutTeamShortName: "BHA",
  cost: 59
} as EntryTransfer & Record<string, unknown>;

const row = normalizeTransfer(transfer);

assertEqual(row.inName, "Igor Jesus", "transfer in name");
assertEqual(row.inTeam, "NFO", "transfer in team");
assertEqual(row.outName, "Welbeck", "transfer out name");
assertEqual(row.outTeam, "BHA", "transfer out team");
assertEqual(row.priceText, "£5.9m", "transfer row player price");
