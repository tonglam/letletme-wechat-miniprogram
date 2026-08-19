import { routes } from "../../config/routes";

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

  methods: {
    onRetry() {
      this.triggerEvent("retry");
    },

    onReport() {
      wx.navigateTo({ url: routes.accountReport });
    }
  }
});
