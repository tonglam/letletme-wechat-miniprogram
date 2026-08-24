import {
  acknowledgeDiagnosticDisclosure,
  DEFAULT_PRIVACY_CONTRACT_NAME,
  PRIVACY_AGREE_BUTTON_ID,
  resolvePrivacyAuthorization,
  subscribeDiagnosticDisclosure,
  subscribePrivacyPrompt
} from "../../utils/privacy";

const unsubscribers = new WeakMap<object, () => void>();

Component({
  data: {
    show: false,
    diagnostics: false,
    privacyContractName: DEFAULT_PRIVACY_CONTRACT_NAME
  },

  lifetimes: {
    attached() {
      const unsubscribePrivacy = subscribePrivacyPrompt((info) => {
        this.setData({
          show: true,
          diagnostics: false,
          privacyContractName: info.privacyContractName || DEFAULT_PRIVACY_CONTRACT_NAME
        });
      });
      const unsubscribeDiagnostics = subscribeDiagnosticDisclosure((info) => {
        this.setData({
          show: true,
          diagnostics: true,
          privacyContractName: info.privacyContractName || DEFAULT_PRIVACY_CONTRACT_NAME
        });
      });
      unsubscribers.set(this, () => {
        unsubscribePrivacy();
        unsubscribeDiagnostics();
      });
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

    onAcknowledgeDiagnostics() {
      acknowledgeDiagnosticDisclosure();
      this.setData({ show: false, diagnostics: false });
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
