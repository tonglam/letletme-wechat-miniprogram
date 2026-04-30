import type { EntryTransfer } from "../miniprogram/models/entry";
import { normalizeTransfer } from "../miniprogram/pages/live/entry/transfer";

function assertEqual(actual: string, expected: string, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
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

assertEqual(row.inText, "【NFO】Igor Jesus", "transfer in text");
assertEqual(row.outText, "【BHA】Welbeck", "transfer out text");
assertEqual(row.priceText, "£5.9m", "transfer row player price");
