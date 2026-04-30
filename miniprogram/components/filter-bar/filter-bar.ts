Component({
  properties: {
    keyword: {
      type: String,
      value: ""
    },
    placeholder: {
      type: String,
      value: "搜索"
    },
    filters: {
      type: Array,
      value: []
    },
    actionText: {
      type: String,
      value: "搜索"
    }
  },

  methods: {
    onInput(event: WechatMiniprogram.Input) {
      this.triggerEvent("search", { keyword: event.detail.value });
    },

    onConfirm(event: WechatMiniprogram.Input) {
      this.triggerEvent("submit", { keyword: event.detail.value });
    },

    onSubmit() {
      this.triggerEvent("submit", { keyword: this.properties.keyword });
    },

    onReset() {
      this.triggerEvent("reset");
    }
  }
});
