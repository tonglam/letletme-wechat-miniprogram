Component({
  properties: {
    value: {
      type: String,
      value: ""
    },
    seasons: {
      type: Array,
      value: []
    }
  },

  methods: {
    onChange(event: WechatMiniprogram.PickerChange) {
      const index = Number(event.detail.value);
      if (!Number.isFinite(index) || index < 0) return;
      this.triggerEvent("change", { value: this.properties.seasons[index] });
    }
  }
});
