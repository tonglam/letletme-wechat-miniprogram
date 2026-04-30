Component({
  properties: {
    keyword: {
      type: String,
      value: ""
    },
    players: {
      type: Array,
      value: []
    },
    loading: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onInput(event: WechatMiniprogram.Input) {
      this.triggerEvent("search", { keyword: event.detail.value });
    },

    onSelect(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { index: string }>) {
      const index = Number(event.currentTarget.dataset.index);
      this.triggerEvent("change", { player: this.properties.players[index] });
    }
  }
});
