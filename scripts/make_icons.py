#!/usr/bin/env python3
"""Generate Dispatch's minimal black-on-white home-screen icon.

The mark is one real SF Pro Display Black lowercase ``d``. There is no
illustration, date, gradient, or decorative frame: just the app's initial in
the same restrained spirit as modern fintech icons. The glyph is optically
centred (its ink mass is shifted slightly left/up from its mathematical
bounding box) and rendered at high resolution before downsampling.
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "icons"))
FONT_CANDIDATES = [
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
]
BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)


def load_font(size: int):
    for path in FONT_CANDIDATES:
        try:
            font = ImageFont.truetype(path, size)
            if path.endswith("SFNS.ttf"):
                try:
                    font.set_variation_by_axes([100, 96, 500, 900])
                except Exception:
                    pass
            return font
        except Exception:
            continue
    return ImageFont.load_default()


def draw_icon(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), WHITE)
    draw = ImageDraw.Draw(image)
    font_size = round(size * 0.86)
    font = load_font(font_size)
    glyph = "d"
    bbox = draw.textbbox((0, 0), glyph, font=font)
    ink_w = bbox[2] - bbox[0]
    ink_h = bbox[3] - bbox[1]

    x = (size - ink_w) / 2 - bbox[0] - size * 0.024
    y = (size - ink_h) / 2 - bbox[1] - size * 0.030
    draw.text((round(x), round(y)), glyph, font=font, fill=BLACK)
    return image


def write_svg(path: str) -> None:
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#fff"/>
  <text x="488" y="482" text-anchor="middle" dominant-baseline="middle"
        font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', Helvetica, Arial, sans-serif"
        font-size="880" font-weight="900" fill="#000">d</text>
</svg>
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    base = draw_icon(1024)
    for filename, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180), ("favicon-64.png", 64)):
        base.resize((size, size), Image.Resampling.LANCZOS).convert("RGB").save(os.path.join(OUT, filename), "PNG", optimize=True)
    write_svg(os.path.join(OUT, "favicon.svg"))
    print(f"icons written to {OUT}")


if __name__ == "__main__":
    main()
