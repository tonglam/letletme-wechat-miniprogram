import {
  entryLookupPresentation,
  entryPersistenceNeedsRevalidation,
  entryPersistencePresentation,
  hasMatchingEntryPreview,
  isDeterministicEntryIdentityFailure
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

assertDeepEqual(entryPersistencePresentation("NOT_REQUIRED"), null, "NOT_REQUIRED stays silent");
assertDeepEqual(entryPersistencePresentation("QUEUED"), {
  message: "球队已找到，后台保存已排队",
  retryable: false
}, "QUEUED is informational");
assertDeepEqual(entryPersistencePresentation("FAILED_RETRYABLE"), {
  message: "球队已找到，但后台保存暂时失败；可继续查看，稍后重试会再次保存",
  retryable: true
}, "FAILED_RETRYABLE exposes retry");

assertDeepEqual(entryPersistenceNeedsRevalidation("QUEUED"), true, "QUEUED is revalidated");
assertDeepEqual(
  entryPersistenceNeedsRevalidation("FAILED_RETRYABLE"),
  true,
  "FAILED_RETRYABLE is revalidated"
);
assertDeepEqual(
  entryPersistenceNeedsRevalidation("NOT_REQUIRED"),
  false,
  "NOT_REQUIRED is terminal"
);
assertDeepEqual(
  isDeterministicEntryIdentityFailure("INVALID_ID"),
  true,
  "INVALID_ID can be replaced"
);
assertDeepEqual(
  isDeterministicEntryIdentityFailure("NOT_FOUND"),
  true,
  "NOT_FOUND can be replaced"
);
assertDeepEqual(
  isDeterministicEntryIdentityFailure("UNAVAILABLE"),
  false,
  "UNAVAILABLE should retry"
);
assertDeepEqual(
  hasMatchingEntryPreview(true, 123, 123),
  true,
  "matching valid preview survives a retryable refresh"
);
assertDeepEqual(
  hasMatchingEntryPreview(true, 123, 456),
  false,
  "a different lookup cannot reuse the previous preview"
);
