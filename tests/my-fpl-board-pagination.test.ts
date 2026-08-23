import {
  mergeMyFplCompetitionBoardPages,
  type MyFplCompetitionBoard,
  type MyFplCompetitionBoardRow
} from "../miniprogram/services/tournament.service";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function row(entryId: number): MyFplCompetitionBoardRow {
  return { eventId: 1, entryId, rank: entryId };
}

function page(pageNumber: number, rows: MyFplCompetitionBoardRow[]): MyFplCompetitionBoard {
  return {
    state: "READY",
    eventId: 1,
    page: pageNumber,
    pageSize: 2,
    totalRows: 4,
    totalPages: 2,
    fieldSize: 4,
    rows,
    viewerRow: row(4)
  };
}

const merged = mergeMyFplCompetitionBoardPages([
  page(2, [row(3), row(4)]),
  page(1, [row(1), row(2), row(3)])
]);

assertEqual(merged.page, 1, "merged board resets to the first page");
assertEqual(merged.rows.map((item) => item.entryId).join(","), "1,2,3,4", "all pages merge in rank order without duplicates");
assertEqual(merged.totalRows, 4, "server total remains authoritative");
assertEqual(merged.fieldSize, 4, "field size remains authoritative");

let incompleteError = "";
try {
  mergeMyFplCompetitionBoardPages([{ ...page(1, [row(1)]), totalRows: 2, totalPages: 1 }]);
} catch (error) {
  incompleteError = error instanceof Error ? error.message : String(error);
}
assertEqual(incompleteError, "赛事榜单加载不完整（1/2）", "a short single page fails closed");

console.log("my-fpl board pagination tests passed");
