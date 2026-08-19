import { PerformancePage } from "../../../utils/performance-page";
import { isPrivacyScopeUndeclared } from "../../../utils/privacy";
import {
  BUG_REPORT_BODY_MAX,
  BUG_REPORT_BODY_MIN,
  screenshotWithinLimit,
  submitMiniProgramBugReport
} from "../../../services/bug-report.service";

const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;

PerformancePage({
  data: {
    body: "",
    screenshotName: "",
    submitting: false,
    publicId: "",
    error: ""
  },

  screenshotBase64: null as string | null,
  screenshotMime: null as string | null,

  onBodyInput(event: WechatMiniprogram.Input) {
    this.setData({
      body: event.detail.value.slice(0, BUG_REPORT_BODY_MAX),
      error: "",
      publicId: ""
    });
  },

  onPickScreenshot() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album"],
      success: (result) => {
        const file = result.tempFiles[0];
        if (!file) return;
        this.readScreenshot(file.tempFilePath, "image/jpeg", file.size);
      },
      fail: (error) => {
        if (isPrivacyScopeUndeclared(error)) {
          this.setData({ error: "这次没法选图，文字照样能发" });
          return;
        }
        if (String(error.errMsg || "").includes("cancel")) return;
        this.setData({ error: "这张图没加上，文字照样能发" });
      }
    });
  },

  readScreenshot(filePath: string, mime: string, knownSize?: number) {
    if (typeof knownSize === "number" && !screenshotWithinLimit(knownSize)) {
      this.setData({ error: "这张图有点大，可不加图，或换一张小一点的" });
      return;
    }
    wx.getFileInfo({
      filePath,
      success: (info) => {
        if (info.size > SCREENSHOT_MAX_BYTES) {
          this.setData({ error: "这张图有点大，可不加图，或换一张小一点的" });
          return;
        }
        wx.getFileSystemManager().readFile({
          filePath,
          encoding: "base64",
          success: (file) => {
            this.screenshotBase64 = String(file.data);
            this.screenshotMime = mime.startsWith("image/") ? mime : "image/jpeg";
            this.setData({
              screenshotName: "已选一张图",
              error: ""
            });
          },
          fail: () => {
            this.setData({ error: "这张图没加上，文字照样能发" });
          }
        });
      },
      fail: () => {
        this.setData({ error: "这张图没加上，文字照样能发" });
      }
    });
  },

  onClearScreenshot() {
    this.screenshotBase64 = null;
    this.screenshotMime = null;
    this.setData({ screenshotName: "" });
  },

  async onSubmit() {
    if (this.data.body.trim().length < BUG_REPORT_BODY_MIN) {
      this.setData({ error: "再写几个字就行" });
      return;
    }
    this.setData({ submitting: true, error: "", publicId: "" });
    try {
      const publicId = await submitMiniProgramBugReport({
        body: this.data.body,
        screenshotBase64: this.screenshotBase64,
        screenshotMime: this.screenshotMime
      });
      this.screenshotBase64 = null;
      this.screenshotMime = null;
      this.setData({
        publicId,
        screenshotName: "",
        body: ""
      });
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : "这次没发出去，请稍后再试"
      });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
