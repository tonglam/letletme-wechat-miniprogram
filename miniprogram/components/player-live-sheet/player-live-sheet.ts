Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    detail: {
      type: Object
    }
  },

  methods: {
    onClose() {
      this.triggerEvent("close");
    },

    onNoop() {}
  }
});
