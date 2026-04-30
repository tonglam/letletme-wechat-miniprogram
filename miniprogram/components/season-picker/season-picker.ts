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
      this.triggerEvent("change", { value: this.properties.seasons[index] });
    }
  }
});
