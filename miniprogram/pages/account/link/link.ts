import { PerformancePage } from "../../../utils/performance-page";
import {
  awaitLinkedAccountSnapshot,
  confirmMiniProgramEmailLink,
  logoutMiniProgramSession,
  startMiniProgramEmailLink,
  unlinkMiniProgramWebAccount,
} from '../../../services/auth.service';
import { switchToHome } from '../../../utils/navigation';

PerformancePage({
  data: {
    email: '',
    code: '',
    sending: false,
    confirming: false,
    unlinking: false,
    error: '',
    accountLinked: false,
    accountEmail: ''
  },

  onLoad() {
    return this.syncAccount();
  },

  onShow() {
    return this.syncAccount();
  },

  async syncAccount() {
    const snapshot = await awaitLinkedAccountSnapshot();
    this.setData({
      accountLinked: snapshot.linked,
      accountEmail: snapshot.email,
      error: snapshot.linked ? '' : this.data.error
    });
  },

  onEmailInput(event: WechatMiniprogram.Input) {
    this.setData({ email: event.detail.value.trim(), error: '' });
  },

  onCodeInput(event: WechatMiniprogram.Input) {
    this.setData({ code: event.detail.value.trim(), error: '' });
  },

  async sendCode() {
    if (!/^\S+@\S+\.\S+$/.test(this.data.email)) {
      this.setData({ error: '请输入有效邮箱地址' });
      return;
    }
    this.setData({ sending: true, error: '' });
    try {
      await startMiniProgramEmailLink(this.data.email);
      wx.showToast({ title: '验证码已发送', icon: 'success' });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '发送失败' });
    } finally {
      this.setData({ sending: false });
    }
  },

  async confirm() {
    if (!this.data.email || !this.data.code) {
      this.setData({ error: '请输入邮箱和验证码' });
      return;
    }
    this.setData({ confirming: true, error: '' });
    try {
      const session = await confirmMiniProgramEmailLink(this.data.email, this.data.code);
      const synced = session.profile.effectiveEntrySource === 'WEB';
      wx.showToast({ title: synced ? '已关联并同步球队' : '网页账户已关联', icon: 'success' });
      switchToHome();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '验证失败' });
    } finally {
      this.setData({ confirming: false });
    }
  },

  unlinkWebAccount() {
    wx.showModal({
      title: '解除网页关联？',
      content: '只会解除网页版账户关系。小程序账户、当前设备会话和小程序球队都会保留。',
      confirmText: '解除关联',
      confirmColor: '#c9183f',
      success: async ({ confirm }) => {
        if (!confirm) return;
        this.setData({ unlinking: true, error: '' });
        try {
          await unlinkMiniProgramWebAccount();
          this.setData({
            accountLinked: false,
            accountEmail: '',
            email: '',
            code: ''
          });
          wx.showToast({ title: '已解除网页关联', icon: 'success' });
        } catch (error) {
          this.setData({ error: error instanceof Error ? error.message : '解除关联失败' });
        } finally {
          this.setData({ unlinking: false });
        }
      }
    });
  },

  async logout() {
    this.setData({ error: '' });
    try {
      const result = await logoutMiniProgramSession();
      this.setData({
        accountLinked: false,
        accountEmail: '',
        email: '',
        code: '',
        error: result.remoteRevoked ? '' : '已在本地退出，远端撤销尚未确认'
      });
      wx.showToast({ title: result.remoteRevoked ? '已退出当前设备' : '已退出本地会话', icon: 'success' });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '退出失败，请重试' });
    }
  },
});
