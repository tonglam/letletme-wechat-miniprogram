import {
  entryLookupPresentation
} from "../miniprogram/utils/entry-lookup-presentation";

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

assertDeepEqual(entryLookupPresentation("FOUND"), null, "FOUND stays silent");
assertDeepEqual(entryLookupPresentation("INVALID_ID"), {
  message: "请输入有效的 FPL 参赛 ID",
  retryable: false
}, "INVALID_ID is deterministic");
assertDeepEqual(entryLookupPresentation("NOT_FOUND"), {
  message: "没有找到该参赛 ID 对应的 FPL 球队",
  retryable: false
}, "NOT_FOUND is deterministic");
assertDeepEqual(entryLookupPresentation("SATURATED"), {
  message: "球队查询当前繁忙，请稍后重试",
  retryable: true
}, "SATURATED is retryable");
assertDeepEqual(entryLookupPresentation("UNAVAILABLE"), {
  message: "当前无法确认球队数据，请稍后重试",
  retryable: true
}, "UNAVAILABLE is retryable");
