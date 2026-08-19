import { routes } from "../../config/routes";
import {
  buildBugReportDraftFromError,
  writePendingBugReportDraft
} from "../../services/bug-report.service";
import {
  diagnosticErrorDetail,
  looksTechnicalErrorMessage,
  userFacingErrorMessage
} from "../../utils/request-error";

Component({
  properties: {
    eyebrow: {
      type: String,
      value: "加载未完成"
    },
    message: {
      type: String,
      value: "加载失败"
    },
    description: {
      type: String,
      value: "请检查网络状态后再试，当前页面不会丢失已有内容。"
    },
    retryText: {
      type: String,
      value: "重试"
    },
    reportText: {
      type: String,
      value: "告诉我们可以看一看"
    }
  },

  data: {
    displayMessage: "加载失败"
  },

  observers: {
    message: function (message: string) {
      this.setData({
        displayMessage: userFacingErrorMessage(message, "加载失败，请稍后重试")
      });
    }
  },

  lifetimes: {
    attached() {
      this.setData({
        displayMessage: userFacingErrorMessage(
          this.properties.message,
          "加载失败，请稍后重试"
        )
      });
    }
  },

  methods: {
    onRetry() {
      this.triggerEvent("retry");
    },

    onReport() {
      const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
      const route = pages.length ? String(pages[pages.length - 1]?.route || "") : "";
      const raw = diagnosticErrorDetail(this.properties.message);
      writePendingBugReportDraft({
        body: buildBugReportDraftFromError({
          message: this.data.displayMessage,
          route
        }),
        source: "error-state",
        diagnostic: looksTechnicalErrorMessage(raw) ? raw : ""
      });
      wx.navigateTo({ url: routes.accountReport });
    }
  }
});
