Component({
  properties: {
    value: {
      type: String,
      value: ""
    },
    teams: {
      type: Array,
      value: []
    }
  },

  data: {
    names: [] as string[]
  },

  observers: {
    teams(value: Array<{ name?: string; shortName?: string }>) {
      this.setData({ names: value.map((team) => team.name || team.shortName || "-") });
    }
  },

  methods: {
    onChange(event: WechatMiniprogram.PickerChange) {
      const index = Number(event.detail.value);
      this.triggerEvent("change", { value: this.properties.teams[index] });
    }
  }
});
