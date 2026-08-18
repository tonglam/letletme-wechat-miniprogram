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
      value: "查"
    }
  },

  data: {
    draft: ""
  },

  observers: {
    keyword(value: string) {
      if (value !== this.data.draft) {
        this.setData({ draft: value });
      }
    }
  },

  lifetimes: {
    attached() {
      this.setData({ draft: this.properties.keyword });
    }
  },

  methods: {
    onInput(event: WechatMiniprogram.Input) {
      const keyword = event.detail.value;
      this.setData({ draft: keyword });
      this.triggerEvent("search", { keyword });
    },

    onConfirm(event: WechatMiniprogram.Input) {
      const keyword = event.detail.value;
      this.setData({ draft: keyword });
      this.triggerEvent("submit", { keyword });
    },

    onSubmit() {
      this.triggerEvent("submit", { keyword: this.data.draft });
    },

    onReset() {
      this.setData({ draft: "" });
      this.triggerEvent("reset");
    }
  }
});
