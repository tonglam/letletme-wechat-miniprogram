import {
  userFacingErrorMessage
} from "../../utils/request-error";
import {
  GRAPHQL_COOLDOWN_READY_MESSAGE,
  getGraphQLCooldownState,
  graphQLCooldownMessage,
  isGraphQLWorkload,
  isGraphQLCooldownMessage,
  subscribeGraphQLCooldown,
  type GraphQLWorkload,
} from "../../services/graphql-cooldown";

interface DataStatusHost {
  transientTimer?: ReturnType<typeof setTimeout>;
  cooldownTimer?: ReturnType<typeof setInterval>;
  unsubscribeCooldown?: () => void;
  cooldownWorkload?: GraphQLWorkload;
}

function host(component: WechatMiniprogram.Component.TrivialInstance): DataStatusHost {
  return component as unknown as DataStatusHost;
}

Component({
  properties: {
    status: {
      type: String,
      value: "error"
    },
    message: {
      type: String,
      value: "数据暂时不可用"
    },
    storedAtText: {
      type: String,
      value: ""
    },
    showRetry: {
      type: Boolean,
      value: false
    },
    retryText: {
      type: String,
      value: "重试"
    },
    /** Hide a stale-data notice after it has been surfaced once. */
    transient: {
      type: Boolean,
      value: false
    },
    transientDuration: {
      type: Number,
      value: 3200
    },
    /** Optional workload key for workload-scoped rate-limit cooldowns. */
    workload: {
      type: String,
      value: ""
    }
  },

  data: {
    visible: true,
    displayMessage: "数据暂时不可用",
    retryDisabled: false,
    retryButtonText: "重试",
  },

  observers: {
    "message,status,transient,transientDuration": function () {
      this.refreshCooldownState();
      this.scheduleTransientHide();
    }
  },

  lifetimes: {
    attached() {
      const state = host(this);
      state.unsubscribeCooldown?.();
      state.unsubscribeCooldown = subscribeGraphQLCooldown((cooldown) => {
        state.cooldownWorkload = cooldown.workload;
        this.refreshCooldownState();
      });
      this.refreshCooldownState();
      this.scheduleTransientHide();
    },
    detached() {
      const state = host(this);
      state.unsubscribeCooldown?.();
      state.unsubscribeCooldown = undefined;
      this.clearTransientHide();
      this.clearCooldownTimer();
    }
  },

  methods: {
    refreshCooldownState() {
      const state = host(this);
      const configuredWorkload = isGraphQLWorkload(this.properties.workload)
        ? this.properties.workload
        : undefined;
      const cooldown = getGraphQLCooldownState(
        Date.now(),
        configuredWorkload ?? state.cooldownWorkload,
      );
      const storedMessage = this.properties.message;
      this.setData({
        displayMessage: cooldown.active
          ? graphQLCooldownMessage(
              cooldown,
              this.properties.status === "stale",
            )
          : isGraphQLCooldownMessage(storedMessage)
            ? GRAPHQL_COOLDOWN_READY_MESSAGE
            : userFacingErrorMessage(
                storedMessage,
                "数据暂时不可用，请稍后重试",
              ),
        retryDisabled: cooldown.active,
        retryButtonText: cooldown.active
          ? `${cooldown.remainingSeconds} 秒后可重试`
          : this.properties.retryText,
        visible: true,
      });

      if (cooldown.active && !state.cooldownTimer) {
        this.clearTransientHide();
        state.cooldownTimer = setInterval(() => {
          this.refreshCooldownState();
        }, 1000);
      } else if (!cooldown.active) {
        const hadCooldownTimer = Boolean(state.cooldownTimer);
        this.clearCooldownTimer();
        if (hadCooldownTimer) this.scheduleTransientHide();
      }
    },

    scheduleTransientHide() {
      this.clearTransientHide();
      this.setData({ visible: true });
      if (getGraphQLCooldownState().active) return;
      if (this.properties.transient !== true) return;

      const state = host(this);
      const duration = Math.max(1000, Number(this.properties.transientDuration) || 3200);
      state.transientTimer = setTimeout(() => {
        state.transientTimer = undefined;
        this.setData({ visible: false });
      }, duration);
    },

    clearTransientHide() {
      const state = host(this);
      if (!state.transientTimer) return;
      clearTimeout(state.transientTimer);
      state.transientTimer = undefined;
    },

    clearCooldownTimer() {
      const state = host(this);
      if (!state.cooldownTimer) return;
      clearInterval(state.cooldownTimer);
      state.cooldownTimer = undefined;
    },

    onRetry() {
      const state = host(this);
      const configuredWorkload = isGraphQLWorkload(this.properties.workload)
        ? this.properties.workload
        : undefined;
      if (
        getGraphQLCooldownState(
          Date.now(),
          configuredWorkload ?? state.cooldownWorkload,
        ).active
      ) {
        this.refreshCooldownState();
        return;
      }
      this.triggerEvent("retry");
    }
  }
});
