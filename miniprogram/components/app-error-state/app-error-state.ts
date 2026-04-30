Component({
  properties: {
    message: {
      type: String,
      value: "加载失败"
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
