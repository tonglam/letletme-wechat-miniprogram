import {
  DEFAULT_PRIVACY_CONTRACT_NAME,
  PRIVACY_AGREE_BUTTON_ID,
  resolvePrivacyAuthorization,
  subscribePrivacyPrompt
} from "../../utils/privacy";

const unsubscribers = new WeakMap<object, () => void>();

Component({
  data: {
    show: false,
    privacyContractName: DEFAULT_PRIVACY_CONTRACT_NAME
  },

  lifetimes: {
    attached() {
      const unsubscribe = subscribePrivacyPrompt((info) => {
        this.setData({
          show: true,
          privacyContractName: info.privacyContractName || DEFAULT_PRIVACY_CONTRACT_NAME
        });
      });
      unsubscribers.set(this, unsubscribe);
    },

    detached() {
      unsubscribers.get(this)?.();
      unsubscribers.delete(this);
    }
  },

  methods: {
    onAgree() {
      resolvePrivacyAuthorization({
        event: "agree",
        buttonId: PRIVACY_AGREE_BUTTON_ID
      });
      this.setData({ show: false });
    },

    onDisagree() {
      resolvePrivacyAuthorization({ event: "disagree" });
      this.setData({ show: false });
    },

    onOpenContract() {
      if (typeof wx.openPrivacyContract !== "function") {
        wx.showToast({ title: "暂时无法打开隐私指引", icon: "none" });
        return;
      }
      wx.openPrivacyContract({
        fail: () => {
          wx.showToast({ title: "暂时无法打开隐私指引", icon: "none" });
        }
      });
    },

    onNoop() {}
  }
});
