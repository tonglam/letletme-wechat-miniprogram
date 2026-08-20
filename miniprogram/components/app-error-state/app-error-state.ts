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
import {
  GRAPHQL_COOLDOWN_READY_MESSAGE,
  getGraphQLCooldownState,
  graphQLCooldownMessage,
  isGraphQLCooldownMessage,
  subscribeGraphQLCooldown,
} from "../../services/graphql-cooldown";

interface ErrorStateHost {
  cooldownTimer?: ReturnType<typeof setInterval>;
  unsubscribeCooldown?: () => void;
}

function host(
  component: WechatMiniprogram.Component.TrivialInstance,
): ErrorStateHost {
  return component as unknown as ErrorStateHost;
}

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
    displayMessage: "加载失败",
    retryDisabled: false,
    retryButtonText: "重试",
  },

  observers: {
    message: function (message: string) {
      this.refreshCooldownState(message);
    }
  },

  lifetimes: {
    attached() {
      const state = host(this);
      state.unsubscribeCooldown?.();
      state.unsubscribeCooldown = subscribeGraphQLCooldown(() => {
        this.refreshCooldownState(this.properties.message);
      });
      this.refreshCooldownState(this.properties.message);
    },
    detached() {
      const state = host(this);
      state.unsubscribeCooldown?.();
      state.unsubscribeCooldown = undefined;
      this.clearCooldownTimer();
    }
  },

  methods: {
    refreshCooldownState(message?: string) {
      const cooldown = getGraphQLCooldownState();
      const storedMessage = message ?? this.properties.message;
      this.setData({
        displayMessage: cooldown.active
          ? graphQLCooldownMessage(cooldown, false)
          : isGraphQLCooldownMessage(storedMessage)
            ? GRAPHQL_COOLDOWN_READY_MESSAGE
            : userFacingErrorMessage(
                storedMessage,
                "加载失败，请稍后重试",
              ),
        retryDisabled: cooldown.active,
        retryButtonText: cooldown.active
          ? `${cooldown.remainingSeconds} 秒后可重试`
          : this.properties.retryText,
      });

      const state = host(this);
      if (cooldown.active && !state.cooldownTimer) {
        state.cooldownTimer = setInterval(() => {
          this.refreshCooldownState(this.properties.message);
        }, 1000);
      } else if (!cooldown.active) {
        this.clearCooldownTimer();
      }
    },

    clearCooldownTimer() {
      const state = host(this);
      if (!state.cooldownTimer) return;
      clearInterval(state.cooldownTimer);
      state.cooldownTimer = undefined;
    },

    onRetry() {
      if (getGraphQLCooldownState().active) {
        this.refreshCooldownState(this.properties.message);
        return;
      }
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
