interface DataStatusHost {
  transientTimer?: ReturnType<typeof setTimeout>;
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
    }
  },

  data: {
    visible: true
  },

  observers: {
    "message,status,transient,transientDuration": function () {
      this.scheduleTransientHide();
    }
  },

  lifetimes: {
    attached() {
      this.scheduleTransientHide();
    },
    detached() {
      this.clearTransientHide();
    }
  },

  methods: {
    scheduleTransientHide() {
      this.clearTransientHide();
      this.setData({ visible: true });
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

    onRetry() {
      this.triggerEvent("retry");
    }
  }
});
