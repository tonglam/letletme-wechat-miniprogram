export const SHARE_BRAND_NAME = "LetLetMe";
export const SHARE_BRAND_URL = "letletme.top";
export const SHARE_BRAND_VERSION = 3;

export interface ShareBrandSignature {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

interface ShareBrandContext {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  strokeText?(text: string, x: number, y: number, maxWidth?: number): void;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: "left" | "right" | "center" | "start" | "end";
  textBaseline: "top" | "middle" | "bottom" | "alphabetic" | "hanging";
  globalAlpha: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Bottom-right signature block — the only brand layer on share images. */
export function buildShareBrandSignature(
  width: number,
  height: number,
): ShareBrandSignature {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const shortSide = Math.min(safeWidth, safeHeight);
  const margin = clamp(Math.round(shortSide * 0.018), 8, 18);
  const signatureFontSize = clamp(Math.round(shortSide * 0.024), 12, 20);
  const signatureHeight = Math.max(
    1,
    Math.min(safeHeight, Math.round(signatureFontSize * 2.15))
  );
  const signatureWidth = Math.max(
    1,
    Math.min(safeWidth, Math.round(signatureFontSize * 12.8))
  );

  return {
    x: Math.max(0, safeWidth - margin - signatureWidth),
    y: Math.max(0, safeHeight - margin - signatureHeight),
    width: signatureWidth,
    height: signatureHeight,
    fontSize: signatureFontSize
  };
}

/** Draw the brand last so cards, tables, and player art cannot cover it. */
export function drawShareBranding(
  ctx: ShareBrandContext,
  width: number,
  height: number,
  options: { title?: string; url?: string } = {}
): void {
  const title = options.title || SHARE_BRAND_NAME;
  const url = options.url || SHARE_BRAND_URL;
  const signature = buildShareBrandSignature(width, height);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(33, 0, 37, 0.88)";
  ctx.fillRect(signature.x, signature.y, signature.width, signature.height);
  ctx.fillStyle = "#00ff85";
  ctx.fillRect(
    signature.x,
    signature.y,
    Math.max(3, Math.round(signature.fontSize * 0.2)),
    signature.height
  );
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${signature.fontSize}px sans-serif`;
  ctx.fillStyle = "#f8f6ef";
  ctx.fillText(
    `${title} · ${url}`,
    signature.x + signature.width - signature.fontSize * 0.65,
    signature.y + signature.height / 2,
    signature.width - signature.fontSize
  );
  ctx.restore();
}
