/**
 * Shared presenter for image actions. The component/page decides how an
 * image is rendered; this module owns the privacy-gated save/share fallback.
 */
export function presentImage(path: string): Promise<void> {
  return new Promise((resolve) => {
    const showMenu = (wx as WechatMiniprogram.Wx & {
      showShareImageMenu?: (options: { path: string; needShowEntrance?: boolean; success?: () => void; fail?: () => void; complete?: () => void }) => void;
    }).showShareImageMenu;
    if (typeof showMenu === "function") {
      showMenu({ path, needShowEntrance: true, complete: () => resolve() });
      return;
    }
    void authorizeAlbum()
      .then(() => new Promise<void>((saveResolve, saveReject) => {
        wx.saveImageToPhotosAlbum({
          filePath: path,
          success: () => {
            wx.showToast({ title: "已保存到相册", icon: "success" });
            saveResolve();
          },
          fail: saveReject
        });
      }))
      .catch(() => wx.showToast({ title: "保存需要相册权限", icon: "none" }))
      .finally(() => resolve());
  });
}

function authorizeAlbum(): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.getSetting({
      success(res) {
        if (res.authSetting["scope.writePhotosAlbum"]) {
          resolve();
          return;
        }
        wx.authorize({
          scope: "scope.writePhotosAlbum",
          success: () => resolve(),
          fail: reject
        });
      },
      fail: reject
    });
  });
}
