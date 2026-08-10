#!/usr/bin/env python3
"""Generate Dispatch's minimal black-on-white home-screen icon.

The mark is a single hand-authored rounded squiggle. It is rendered from the
same cubic path as ``preview/assets/dispatch-mark.svg`` so the app icon and
the public preview stay visually identical.
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "icons"))
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)

def draw_icon(size: int) -> Image.Image:
    # Render on an opaque white field before downsampling. Keeping the
    # anti-aliased edge on the same field avoids halos in the PNG icons.
    image = Image.new("RGB", (size, size), WHITE)
    draw = ImageDraw.Draw(image)
    radius = round(size * 224 / 1024)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=WHITE)

    def cubic(p0, p1, p2, p3, steps=32):
        points = []
        for i in range(steps + 1):
            t = i / steps
            u = 1 - t
            points.append((
                size * (u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]) / 1024,
                size * (u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]) / 1024,
            ))
        return points

    points = []
    segments = [
        ((170, 646), (245, 478), (329, 388), (427, 388)),
        ((427, 388), (523, 388), (543, 493), (582, 582)),
        ((582, 582), (618, 663), (669, 742), (747, 742)),
        ((747, 742), (827, 742), (884, 663), (932, 490)),
    ]
    for index, segment in enumerate(segments):
        # A modest number of integer samples keeps Pillow's thick-line raster
        # path stable at small icon sizes; excessive samples create seams.
        points.extend(cubic(*segment, steps=32 if index == 0 else 24)[index != 0:])
    stroke = max(1, round(size * 92 / 1024))
    draw.line(points, fill=BLACK, width=stroke, joint="curve")
    cap = stroke // 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((round(x - cap), round(y - cap), round(x + cap), round(y + cap)), fill=BLACK)
    return image.convert("RGBA")


def write_svg(path: str) -> None:
    # The PNGs remain the authoritative Home Screen mark. Keep this SVG path
    # identical to the preview generator's canonical vector asset.
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="224" fill="#fff"/>
  <path d="M170 646C245 478 329 388 427 388c96 0 116 105 155 194 36 81 87 160 165 160 80 0 137-79 185-252"
        fill="none" stroke="#000" stroke-width="92" stroke-linecap="round" stroke-linejoin="round"/>
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
