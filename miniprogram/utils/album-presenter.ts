/**
 * Shared presenter for image actions. The component/page decides how an
 * image is rendered; this module owns the privacy-gated save/share fallback.
 *
 * `needShowEntrance` (image message carrying a mini-program entrance) is
 * category-whitelisted (电商/餐饮/生活服务…); for ineligible categories the
 * whole showShareImageMenu call fails with "fail to permission", so it must
 * not be passed. Menu failures fall back to saving the image to the album.
 */
export function presentImage(path: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof wx.showShareImageMenu === "function") {
      wx.showShareImageMenu({
        path,
        fail: (err) => {
          // "fail cancel" = the user dismissed the share panel; stay silent.
          if (err && /cancel/.test(err.errMsg || "")) return;
          console.warn("showShareImageMenu failed, falling back to album", err);
          void saveToAlbum(path);
        },
        complete: () => resolve()
      });
      return;
    }
    void saveToAlbum(path).finally(() => resolve());
  });
}

function saveToAlbum(path: string): Promise<void> {
  return authorizeAlbum()
    .then(() => new Promise<void>((saveResolve, saveReject) => {
      wx.saveImageToPhotosAlbum({
        filePath: path,
        success: () => {
          wx.showToast({ title: "已保存到相册,可手动转发", icon: "none" });
          saveResolve();
        },
        fail: saveReject
      });
    }))
    .catch(() => {
      wx.showToast({ title: "保存需要相册权限", icon: "none" });
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
