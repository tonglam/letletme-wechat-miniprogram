import {
  SHARE_BRAND_NAME,
  SHARE_BRAND_URL,
  buildShareBrandSignature
} from "../miniprogram/utils/share-image-brand";
import { shareExportPixelRatio } from "../miniprogram/utils/squad-pitch-canvas";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(SHARE_BRAND_NAME, "LetLetMe", "share image uses product brand");
assertEqual(SHARE_BRAND_URL, "letletme.top", "share image includes product URL");

for (const [width, height] of [
  [1, 1],
  [750, 938],
  [1200, 630],
  [320, 640]
]) {
  const signature = buildShareBrandSignature(width, height);
  assert(signature.x >= 0, "signature stays inside the left edge");
  assert(signature.y >= 0, "signature stays inside the top edge");
  assert(signature.x + signature.width <= width, "signature stays inside the right edge");
  assert(signature.y + signature.height <= height, "signature stays inside the bottom edge");
}

// The signature anchors the bottom-right corner regardless of aspect ratio.
for (const [width, height] of [
  [750, 938],
  [1200, 630]
]) {
  const signature = buildShareBrandSignature(width, height);
  assert(signature.x + signature.width >= width * 0.6, "signature hugs the right edge");
  assert(signature.y + signature.height >= height * 0.85, "signature hugs the bottom edge");
}

assertEqual(shareExportPixelRatio(3), 2, "share export caps high-DPR devices at 2x");
assertEqual(shareExportPixelRatio(0), 1, "share export normalizes missing DPR");

console.log("share-image-brand tests passed");
