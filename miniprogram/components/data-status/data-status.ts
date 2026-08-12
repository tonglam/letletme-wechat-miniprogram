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
    }
  },

  methods: {
    onRetry() {
      this.triggerEvent("retry");
    }
  }
});
