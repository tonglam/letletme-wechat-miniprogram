Component({
  properties: {
    value: {
      type: Number,
      value: 1
    },
    min: {
      type: Number,
      value: 1
    },
    max: {
      type: Number,
      value: 1
    },
    compact: {
      type: Boolean,
      value: false
    },
    dark: {
      type: Boolean,
      value: false
    }
  },

  data: {
    options: [] as string[],
    selectedIndex: 0,
    label: "GW 1"
  },

  observers: {
    "min,max,value": function () {
      this.syncOptions();
    }
  },

  lifetimes: {
    attached() {
      this.syncOptions();
    }
  },

  methods: {
    boundedValue(value: number): number {
      const min = Math.max(1, Number(this.properties.min) || 1);
      const max = Math.max(min, Number(this.properties.max) || min);
      return Math.min(max, Math.max(min, value));
    },

    syncOptions() {
      const min = Math.max(1, Number(this.properties.min) || 1);
      const max = Math.max(min, Number(this.properties.max) || min);
      const value = this.boundedValue(Number(this.properties.value) || min);
      const options = Array.from({ length: max - min + 1 }, (_, index) => `GW ${min + index}`);
      this.setData({
        options,
        selectedIndex: value - min,
        label: `GW ${value}`
      });
    },

    onPickerChange(event: WechatMiniprogram.PickerChange) {
      const min = Math.max(1, Number(this.properties.min) || 1);
      const next = this.boundedValue(min + Number(event.detail.value));
      this.triggerEvent("change", { value: next });
    }
  }
});
