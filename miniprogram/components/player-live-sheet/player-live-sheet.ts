Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    detail: {
      type: Object
    },
    /** Opt-in: pages with a share-image renderer show the image action. */
    shareable: {
      type: Boolean,
      value: false
    },
    shareBusy: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onClose() {
      this.triggerEvent("close");
    },

    onShareImage() {
      if (this.properties.shareBusy) return;
      this.triggerEvent("shareimage");
    },

    onNoop() {}
  }
});
