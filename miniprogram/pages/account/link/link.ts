import {
  confirmMiniProgramEmailLink,
  logoutMiniProgramSession,
  startMiniProgramEmailLink,
} from '../../../services/auth.service';
import { switchToHome } from '../../../utils/navigation';

Page({
  data: { email: '', code: '', sending: false, confirming: false, error: '' },

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
      const synced = Boolean(session.profile.fplEntryId && session.profile.fplEntryVerifiedAt);
      // With no web-verified team the user simply picks one manually on Home.
      wx.showToast({ title: synced ? '已同步网页球队' : '登录成功', icon: 'success' });
      switchToHome();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '验证失败' });
    } finally {
      this.setData({ confirming: false });
    }
  },

  async logout() {
    this.setData({ error: '' });
    try {
      await logoutMiniProgramSession();
      wx.showToast({ title: '已退出登录', icon: 'success' });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '退出失败，请重试' });
    }
  },
});
