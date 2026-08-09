#!/usr/bin/env python3
"""Generate Dispatch icons (monochrome, Apple-HIG shaped).

Motif: white rounded square, a row of three "day bubbles" in black —
the two outer bubbles as outlines, the middle one filled with a white
date number. Reads as calendar + daily feed, pure monochrome.
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
OUT = os.path.abspath(OUT)

# macOS SF Pro-ish font candidates (for the date glyph)
FONT_CANDS = [
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


def load_font(size: int):
    for path in FONT_CANDS:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Rounded-square base, iOS icon radius ~ 22.37% (mask will round it further on device)
    radius = int(size * 0.2237)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=(255, 255, 255, 255))

    # Bubble row geometry
    n = 3
    gap = size * 0.045
    bw = size * 0.155          # bubble width
    bh = size * 0.20           # bubble height
    total = n * bw + (n - 1) * gap
    x0 = (size - total) / 2
    y0 = size * 0.30
    # line width for outline bubbles
    lw = max(2, int(size * 0.018))
    cx = x0 + bw / 2

    for i in range(n):
        bx = x0 + i * (bw + gap)
        if i == 1:
            # filled bubble
            d.rounded_rectangle([bx, y0, bx + bw, y0 + bh], radius=bh / 2, fill=(0, 0, 0, 255))
            # date number inside
            fs = int(bh * 0.62)
            font = load_font(fs)
            text = "14"
            bbox = d.textbbox((0, 0), text, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            d.text((cx - tw / 2 - bbox[0], y0 + bh / 2 - th / 2 - bbox[1]), text,
                   font=font, fill=(255, 255, 255, 255))
        else:
            d.rounded_rectangle([bx, y0, bx + bw, y0 + bh], radius=bh / 2,
                                outline=(0, 0, 0, 255), width=lw)

    # Small "feed line" under the bubbles: three tiny bars
    bar_y = y0 + bh + size * 0.09
    bar_w = bw * 0.9
    bar_h = max(2, int(size * 0.014))
    bar_gap = bar_h * 2.2
    for k, wfac in enumerate((1.0, 0.68, 0.42)):
        bw2 = bar_w * wfac
        bx = cx - bw2 / 2
        d.rounded_rectangle([bx, bar_y + k * (bar_h + bar_gap), bx + bw2, bar_y + k * (bar_h + bar_gap) + bar_h],
                            radius=bar_h / 2, fill=(0, 0, 0, 200))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    base = draw_icon(1024)
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512),
                       ("apple-touch-icon.png", 180), ("favicon-64.png", 64)]:
        base.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))
    # mask to the true iOS shape (continuous corner ~0.2237) for the PNG icons
    for name in ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]:
        p = os.path.join(OUT, name)
        im = Image.open(p).convert("RGBA")
        mask = Image.new("L", im.size, 0)
        md = ImageDraw.Draw(mask)
        r = int(im.size[0] * 0.2237)
        md.rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius=r, fill=255)
        im.putalpha(mask)
        im.save(p)
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
