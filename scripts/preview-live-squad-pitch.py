#!/usr/bin/env python3
"""Compose a live-squad pitch preview from the abstract kit assets."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "miniprogram/assets/squad-pitch"
OUT = ROOT / "images/live-squad-pitch-preview.jpg"

STARTERS = [
    ("GKP", [("Raya", "ARS", 6, "")]),
    ("DEF", [("TAA", "LIV", 12, ""), ("Saliba", "ARS", 5, ""), ("Gabriel", "ARS", 6, "")]),
    ("MID", [("Salah", "LIV", 8, "V"), ("Saka", "ARS", 3, ""), ("Palmer", "CHE", 10, ""), ("Rogers", "AVL", 2, "")]),
    ("FWD", [("Haaland", "MCI", 18, "C"), ("Watkins", "AVL", 2, ""), ("Isak", "NEW", 0, "")]),
]
BENCH = [
    ("GKP", "Flekken", "BRE", "BRE", 3),
    ("1. DEF", "Ait-Nouri", "WOL", "", 1),
    ("2. DEF", "Dunk", "BHA", "BHA", 0),
]
TOPS = {"GKP": 0.131, "DEF": 0.29, "MID": 0.46, "FWD": 0.63}
CREAM = (248, 246, 239)
PLUM = (56, 0, 60)
GREEN = (0, 255, 133)
DARK = (17, 19, 21)
BRAND_NAME = "LetLetMe"
BRAND_URL = "letletme.top"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def kit(code: str) -> Image.Image:
    path = ASSETS / "kits" / f"{code}.png"
    if not path.exists():
        path = ASSETS / "kits" / "DEFAULT.png"
    return Image.open(path).convert("RGBA")


def ellipsize(draw: ImageDraw.ImageDraw, text: str, max_w: int, typeface: ImageFont.ImageFont) -> str:
    if draw.textlength(text, font=typeface) <= max_w:
        return text
    clipped = text
    while clipped and draw.textlength(clipped + "…", font=typeface) > max_w:
        clipped = clipped[:-1]
    return clipped + "…"


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def draw_branding(canvas: Image.Image) -> Image.Image:
    """Mirror the production repeated watermark plus the readable signature."""

    width, height = canvas.size
    short_side = min(width, height)
    tile_size = int(clamp(round(short_side * 0.032), 14, 30))
    step_x = max(tile_size * 7.3, width * 0.28)
    step_y = max(tile_size * 4.8, height * 0.16)
    tile_font = font(tile_size, True)
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))

    row = 0
    y = -step_y * 0.2
    while y <= height + step_y * 0.2:
        offset = 0 if row % 2 == 0 else step_x / 2
        x = -step_x * 0.3 + offset
        while x <= width + step_x * 0.3:
            label = Image.new("RGBA", (tile_size * 8, tile_size * 3), (0, 0, 0, 0))
            label_draw = ImageDraw.Draw(label)
            label_draw.text(
                (label.width / 2, label.height / 2),
                BRAND_NAME,
                fill=(248, 246, 239, 31),
                stroke_width=max(1, round(tile_size * 0.1)),
                stroke_fill=(33, 0, 37, 22),
                font=tile_font,
                anchor="mm",
            )
            label = label.rotate(-18, resample=Image.Resampling.BICUBIC, expand=True)
            overlay.alpha_composite(
                label,
                (round(x - label.width / 2), round(y - label.height / 2)),
            )
            x += step_x
        y += step_y
        row += 1

    margin = int(clamp(round(short_side * 0.018), 8, 18))
    signature_size = int(clamp(round(short_side * 0.024), 12, 20))
    signature_height = round(signature_size * 2.15)
    signature_width = min(width - margin * 2, round(signature_size * 12.8))
    signature_x = max(margin, width - margin - signature_width)
    signature_y = max(margin, height - margin - signature_height)
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.rounded_rectangle(
        (
            signature_x,
            signature_y,
            signature_x + signature_width,
            signature_y + signature_height,
        ),
        radius=max(3, signature_size // 3),
        fill=(33, 0, 37, 224),
    )
    overlay_draw.rectangle(
        (
            signature_x,
            signature_y,
            signature_x + max(3, round(signature_size * 0.2)),
            signature_y + signature_height,
        ),
        fill=GREEN + (255,),
    )
    overlay_draw.text(
        (
            signature_x + signature_width - signature_size * 0.65,
            signature_y + signature_height / 2,
        ),
        f"{BRAND_NAME} · {BRAND_URL}",
        fill=CREAM + (255,),
        font=font(signature_size, True),
        anchor="rm",
    )
    return Image.alpha_composite(canvas, overlay)


def main() -> None:
    bg = Image.open(ASSETS / "pitch-background.jpg").convert("RGBA")
    width, height = 750, 938
    canvas = bg.resize((width, height), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(canvas)

    eyebrow = font(13, True)
    title = font(26, True)
    manager = font(16)
    stat = font(18, True)
    name_font = font(12, True)
    score_font = font(13, True)
    draw.text((39, 28), "实时总分 72 · 总排名 —", fill=GREEN, font=eyebrow)
    draw.text((39, 48), "WHOAMI FC", fill=CREAM, font=title)
    draw.text((39, 80), "Tong W", fill=(248, 246, 239, 180), font=manager)
    draw.text((560, 42), "周赛得分", fill=(248, 246, 239, 150), font=eyebrow)
    draw.text((711, 40), "72", fill=GREEN, font=stat, anchor="ra")
    draw.text((560, 68), "道具卡", fill=(248, 246, 239, 150), font=eyebrow)
    draw.text((711, 66), "BB", fill=CREAM, font=stat, anchor="ra")

    for position, players in STARTERS:
        count = len(players)
        card_w = int(min(0.22, 0.88 / count) * width)
        usable = width * 0.916
        slot = usable / count
        y = int(TOPS[position] * height)
        for index, (name, team, score, marker) in enumerate(players):
            x = int(width * 0.042 + slot * index + (slot - card_w) / 2)
            shirt = kit(team)
            kit_w = int(card_w * 0.9)
            kit_h = int(kit_w * 220 / 240)
            shirt = shirt.resize((kit_w, kit_h), Image.Resampling.LANCZOS)
            kit_x = x + (card_w - kit_w) // 2
            canvas.paste(shirt, (kit_x, y), shirt)
            if marker:
                r = 9
                cx, cy = kit_x + 10, y + 16
                draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=DARK, outline=GREEN if marker == "C" else CREAM, width=2)
                draw.text((cx, cy), marker, fill=CREAM, font=name_font, anchor="mm")
            plate_y = y + int(kit_h * 0.78)
            draw.rounded_rectangle((x, plate_y, x + card_w, plate_y + 32), 4, fill=CREAM)
            draw.rectangle((x, plate_y + 16, x + card_w, plate_y + 32), fill=PLUM)
            draw.text((x + card_w / 2, plate_y + 8), ellipsize(draw, name, card_w - 8, name_font), fill=PLUM, font=name_font, anchor="mm")
            draw.text((x + card_w / 2, plate_y + 24), str(score), fill=CREAM, font=score_font, anchor="mm")

    panel = (39, 742, 711, 922)
    draw.rounded_rectangle(panel, 10, fill=(184, 217, 185, 230))
    draw.text((52, 754), "替补", fill=PLUM, font=name_font)
    draw.rounded_rectangle((656, 752, 696, 772), 3, fill=PLUM)
    draw.text((676, 762), "BB", fill=GREEN, font=name_font, anchor="mm")

    card_w = 150
    for index, (label, name, team, fixture, score) in enumerate(BENCH):
        x = 52 + index * (card_w + 18)
        y = 782
        draw.rounded_rectangle((x, y, x + card_w, y + 124), 8, fill=(248, 246, 239, 242))
        shirt = kit(team).resize((64, 58), Image.Resampling.LANCZOS)
        canvas.paste(shirt, (x + 6, y + 28), shirt)
        draw.text((x + 74, y + 14), label, fill=(56, 0, 60, 140), font=font(10, True))
        draw.text((x + 74, y + 36), name, fill=PLUM, font=name_font)
        draw.text((x + 74, y + 56), f"{fixture or team} · {score} 分", fill=(56, 0, 60, 170), font=font(10))

    canvas = draw_branding(canvas)
    OUT.parent.mkdir(exist_ok=True)
    canvas.convert("RGB").save(OUT, quality=88)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
