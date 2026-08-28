import type {
  EntryLookupStatus,
  EntryPersistenceState
} from "../models/entry";

export interface EntryLookupPresentation {
  message: string;
  retryable: boolean;
}

export interface EntryPersistencePresentation {
  message: string;
  retryable: boolean;
}

export function entryLookupPresentation(status: EntryLookupStatus): EntryLookupPresentation | null {
  switch (status) {
    case "FOUND":
      return null;
    case "INVALID_ID":
      return { message: "请输入有效的 FPL 参赛 ID", retryable: false };
    case "NOT_FOUND":
      return { message: "没有找到该参赛 ID 对应的 FPL 球队", retryable: false };
    case "SATURATED":
      return { message: "球队查询当前繁忙，请稍后重试", retryable: true };
    case "UNAVAILABLE":
      return { message: "当前无法确认球队数据，请稍后重试", retryable: true };
  }
}

export function entryPersistencePresentation(
  state: EntryPersistenceState | null | undefined
): EntryPersistencePresentation | null {
  switch (state) {
    case "NOT_REQUIRED":
    case null:
    case undefined:
      return null;
    case "QUEUED":
      return {
        message: "球队已找到，后台保存已排队",
        retryable: false
      };
    case "FAILED_RETRYABLE":
      return {
        message: "球队已找到，但后台保存暂时失败；可继续查看，稍后重试会再次保存",
        retryable: true
      };
  }
}

export function entryPersistenceNeedsRevalidation(
  state: EntryPersistenceState | "" | null | undefined
): boolean {
  return state === "QUEUED" || state === "FAILED_RETRYABLE";
}

export function isDeterministicEntryIdentityFailure(
  status: EntryLookupStatus | "" | null | undefined
): boolean {
  return status === "INVALID_ID" || status === "NOT_FOUND";
}

export function hasMatchingEntryPreview(
  hasPreview: boolean,
  previewEntryId: number,
  requestedEntryId: number
): boolean {
  return hasPreview && previewEntryId > 0 && previewEntryId === requestedEntryId;
}
