import type { EntryLookupStatus } from "../models/entry";

export interface EntryLookupPresentation {
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
