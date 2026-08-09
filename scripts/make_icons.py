#!/usr/bin/env python3
"""Generate Dispatch's monochrome home-screen icon.

The mark is deliberately simple at iPhone icon size: a white calendar/feed
card on a black field, with native calendar binding rings, one selected day
bubble, and three dispatch lines. It is full-bleed and opaque so iOS can apply
its own continuous rounded mask. Keep all artwork inside the central safe zone
for maskable Android/PWA icons too.
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "icons"))


def rounded_rect(draw: ImageDraw.ImageDraw, box, radius: float, fill):
    draw.rounded_rectangle(tuple(round(v) for v in box), radius=round(radius), fill=fill)


def draw_icon(size: int) -> Image.Image:
    """Render one high-resolution, strictly black/white icon."""
    s = float(size)
    black = (0, 0, 0, 255)
    white = (255, 255, 255, 255)
    img = Image.new("RGBA", (size, size), black)
    draw = ImageDraw.Draw(img)

    # A paper/card silhouette. The outer black field remains visible as a
    # quiet border after the platform applies its own icon mask.
    left, top, right, bottom = 128, 112, 896, 912
    radius = 126
    rounded_rect(draw, (left, top, right, bottom), radius, white)

    # Calendar binding/header: rounded at the top, square against the body.
    rounded_rect(draw, (left, top, right, 338), radius, black)
    draw.rectangle((left, 220, right, 338), fill=black)

    # Two clear binding rings, intentionally oversized for legibility at 60px.
    for x in (292, 684):
        rounded_rect(draw, (x, 82, x + 48, 250), 24, white)

    # Selected day bubble: one solid, quiet circle rather than tiny text.
    cx, cy, r = 326, 486, 94
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=black)
    # A small white centre keeps the mark readable as a selected day without
    # baking in a stale date that could be wrong tomorrow.
    draw.ellipse((cx - 20, cy - 20, cx + 20, cy + 20), fill=white)

    # Dispatch/feed lines, aligned to a strict 8pt-like grid.
    line_x = 486
    line_y = 430
    line_h = 34
    for width in (276, 222, 166):
        rounded_rect(draw, (line_x, line_y, line_x + width, line_y + line_h), line_h / 2, black)
        line_y += 82

    # A quiet lower rule anchors the card and makes the feed structure read at
    # small sizes; it is shorter than the top line so the icon stays light.
    rounded_rect(draw, (258, 742, 766, 776), 17, black)

    return img


def write_svg(path: str) -> None:
    # Same geometry as the raster mark, kept hand-authored so the favicon is
    # crisp at browser sizes.
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#000"/>
  <rect x="128" y="112" width="768" height="800" rx="126" fill="#fff"/>
  <path d="M128 238a126 126 0 0 1 126-126h516a126 126 0 0 1 126 126v100H128z" fill="#000"/>
  <rect x="292" y="82" width="48" height="168" rx="24" fill="#fff"/>
  <rect x="684" y="82" width="48" height="168" rx="24" fill="#fff"/>
  <circle cx="326" cy="486" r="94" fill="#000"/>
  <circle cx="326" cy="486" r="20" fill="#fff"/>
  <rect x="486" y="430" width="276" height="34" rx="17" fill="#000"/>
  <rect x="486" y="512" width="222" height="34" rx="17" fill="#000"/>
  <rect x="486" y="594" width="166" height="34" rx="17" fill="#000"/>
  <rect x="258" y="742" width="508" height="34" rx="17" fill="#000"/>
</svg>
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    base = draw_icon(1024)
    for filename, size in (
        ("icon-192.png", 192),
        ("icon-512.png", 512),
        ("apple-touch-icon.png", 180),
        ("favicon-64.png", 64),
    ):
        # Opaque RGB PNG: the OS owns the final icon mask.
        base.resize((size, size), Image.Resampling.LANCZOS).convert("RGB").save(
            os.path.join(OUT, filename), "PNG", optimize=True
        )
    write_svg(os.path.join(OUT, "favicon.svg"))
    print(f"icons written to {OUT}")


if __name__ == "__main__":
    main()
