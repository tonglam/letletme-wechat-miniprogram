import assert from "node:assert/strict";
import test from "node:test";
import {
  looksTechnicalErrorMessage,
  userFacingErrorMessage
} from "../miniprogram/utils/request-error.ts";

test("technical runtime leaks are hidden from users", () => {
  assert.equal(looksTechnicalErrorMessage("(0,d.canReadEventReporting) is not a function"), true);
  assert.equal(looksTechnicalErrorMessage("LIVE_MATCHDAY_INCOHERENT"), true);
  assert.equal(
    userFacingErrorMessage(
      new Error("(0,d.canReadEventReporting) is not a function"),
      "加载失败，请稍后重试"
    ),
    "加载失败，请稍后重试"
  );
  assert.equal(
    userFacingErrorMessage(new Error("TypeError: undefined is not an object"), "球队数据加载失败"),
    "球队数据加载失败"
  );
  assert.equal(
    userFacingErrorMessage(new Error("LIVE_MATCHDAY_INCOHERENT"), "实时比赛加载失败"),
    "实时比赛加载失败"
  );
});

test("localised product copy stays visible", () => {
  assert.equal(looksTechnicalErrorMessage("网络连接失败，请检查网络后重试"), false);
  assert.equal(
    userFacingErrorMessage(new Error("网络连接失败，请检查网络后重试"), "加载失败"),
    "网络连接失败，请检查网络后重试"
  );
  assert.equal(
    userFacingErrorMessage(new Error("数据暂时无法加载，请稍后重试"), "加载失败"),
    "数据暂时无法加载，请稍后重试"
  );
});
