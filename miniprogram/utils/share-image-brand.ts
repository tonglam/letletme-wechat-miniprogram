export const SHARE_BRAND_NAME = "LetLetMe";
export const SHARE_BRAND_URL = "letletme.top";
export const SHARE_BRAND_VERSION = 2;

const TILE_ANGLE = (-18 * Math.PI) / 180;

export interface ShareBrandTile {
  x: number;
  y: number;
  fontSize: number;
  angle: number;
}

export interface ShareBrandSignature {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

export interface ShareBrandLayout {
  tiles: ShareBrandTile[];
  signature: ShareBrandSignature;
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

/**
 * Builds a dense, staggered watermark field. The spacing is deliberately
 * smaller than a normal social crop, so removing the brand requires editing
 * pixels rather than trimming one edge or corner.
 */
export function buildShareBrandLayout(width: number, height: number): ShareBrandLayout {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const shortSide = Math.min(safeWidth, safeHeight);
  const tileFontSize = clamp(Math.round(shortSide * 0.032), 14, 30);
  const stepX = Math.max(tileFontSize * 7.3, safeWidth * 0.28);
  const stepY = Math.max(tileFontSize * 4.8, safeHeight * 0.16);
  const tiles: ShareBrandTile[] = [];

  let row = 0;
  for (let y = -stepY * 0.2; y <= safeHeight + stepY * 0.2; y += stepY) {
    const offset = row % 2 === 0 ? 0 : stepX / 2;
    for (let x = -stepX * 0.3 + offset; x <= safeWidth + stepX * 0.3; x += stepX) {
      tiles.push({ x, y, fontSize: tileFontSize, angle: TILE_ANGLE });
    }
    row += 1;
  }

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
    tiles,
    signature: {
      x: Math.max(0, safeWidth - margin - signatureWidth),
      y: Math.max(0, safeHeight - margin - signatureHeight),
      width: signatureWidth,
      height: signatureHeight,
      fontSize: signatureFontSize
    }
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
  const layout = buildShareBrandLayout(width, height);

  layout.tiles.forEach((tile) => {
    ctx.save();
    ctx.translate(tile.x, tile.y);
    ctx.rotate(tile.angle);
    ctx.globalAlpha = 0.12;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${tile.fontSize}px sans-serif`;
    ctx.lineWidth = Math.max(1, tile.fontSize * 0.1);
    ctx.strokeStyle = "rgba(33, 0, 37, 0.7)";
    ctx.strokeText?.(title, 0, 0);
    ctx.fillStyle = "#f8f6ef";
    ctx.fillText(title, 0, 0);
    ctx.restore();
  });

  const signature = layout.signature;
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
