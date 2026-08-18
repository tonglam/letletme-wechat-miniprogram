Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    text: {
      type: String,
      value: ""
    }
  },

  methods: {
    onClose() {
      this.triggerEvent("close");
    },

    onNoop() {}
  }
});
