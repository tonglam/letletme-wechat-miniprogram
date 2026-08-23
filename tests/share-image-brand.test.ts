import {
  SHARE_BRAND_NAME,
  SHARE_BRAND_URL,
  buildShareBrandLayout
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

interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

function cropKeepsTile(
  tiles: ReturnType<typeof buildShareBrandLayout>["tiles"],
  crop: Crop
): boolean {
  return tiles.some((tile) => (
    tile.x >= crop.x &&
    tile.x <= crop.x + crop.width &&
    tile.y >= crop.y &&
    tile.y <= crop.y + crop.height
  ));
}

assertEqual(SHARE_BRAND_NAME, "LetLetMe", "share image uses product brand");
assertEqual(SHARE_BRAND_URL, "letletme.top", "share image includes product URL");

for (const [width, height] of [
  [1, 1],
  [750, 938],
  [1200, 630],
  [320, 640]
]) {
  const { signature } = buildShareBrandLayout(width, height);
  assert(signature.x >= 0, "signature stays inside the left edge");
  assert(signature.y >= 0, "signature stays inside the top edge");
  assert(signature.x + signature.width <= width, "signature stays inside the right edge");
  assert(signature.y + signature.height <= height, "signature stays inside the bottom edge");
}

for (const [width, height] of [
  [750, 938],
  [1200, 630],
  [320, 640]
]) {
  const { tiles } = buildShareBrandLayout(width, height);
  assert(tiles.length >= 20, "watermark repeats across the complete share image");

  for (let xStep = 0; xStep <= 4; xStep += 1) {
    for (let yStep = 0; yStep <= 4; yStep += 1) {
      const crop: Crop = {
        x: (width / 2) * (xStep / 4),
        y: (height / 2) * (yStep / 4),
        width: width / 2,
        height: height / 2
      };
      assert(cropKeepsTile(tiles, crop), "every sampled half-image crop keeps LetLetMe");
    }
  }
}

assertEqual(shareExportPixelRatio(3), 2, "share export caps high-DPR devices at 2x");
assertEqual(shareExportPixelRatio(0), 1, "share export normalizes missing DPR");
