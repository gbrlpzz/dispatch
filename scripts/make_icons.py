#!/usr/bin/env python3
"""Generate Dispatch's minimal black-on-white home-screen icon.

The mark is a single geometric lowercase ``d``: a bold loop and a rounded
stem, inspired by the restraint of modern fintech app icons. It is not a
calendar illustration or a tiny wordmark, so it remains unmistakable at
small iPhone sizes. The PNGs are full-bleed opaque white; iOS supplies the
final continuous rounded mask.
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "icons"))
BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)


def draw_icon(size: int) -> Image.Image:
    """Render a strong, centred geometric d at high resolution."""
    image = Image.new("RGBA", (size, size), WHITE)
    draw = ImageDraw.Draw(image)
    s = float(size)

    # Loop: generous white counter and a heavy, smooth black ring.
    cx, cy = 422, 548
    outer, inner = 238, 112
    draw.ellipse((cx - outer, cy - outer, cx + outer, cy + outer), fill=BLACK)
    draw.ellipse((cx - inner, cy - inner, cx + inner, cy + inner), fill=WHITE)

    # Rounded stem on the right, overlapping the loop to create one continuous
    # mark. The proportions are deliberately bold at a 60px Home Screen size.
    stem_left, stem_right = 570, 704
    stem_top, stem_bottom, stem_radius = 150, 874, 67
    draw.rounded_rectangle((stem_left, stem_top, stem_right, stem_bottom), radius=stem_radius, fill=BLACK)

    return image


def write_svg(path: str) -> None:
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#fff"/>
  <circle cx="422" cy="548" r="238" fill="#000"/>
  <circle cx="422" cy="548" r="112" fill="#fff"/>
  <rect x="570" y="150" width="134" height="724" rx="67" fill="#000"/>
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
