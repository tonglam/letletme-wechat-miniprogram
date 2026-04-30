Component({
  properties: {
    player: {
      type: Object
    },
    showTeam: {
      type: Boolean,
      value: true
    },
    showPrice: {
      type: Boolean,
      value: false
    },
    showPoints: {
      type: Boolean,
      value: true
    },
    showLiveMeta: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onOpen() {
      this.triggerEvent("open", { player: this.properties.player });
    }
  }
});
