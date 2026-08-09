#!/usr/bin/env python3
"""Generate Dispatch home-screen icons (monochrome, full-bleed).

Motif: the app's signature UI element — a row of day bubbles. On a
pure-black field: two white outline bubbles flanking one filled white
bubble that carries a bold date number, with a short feed line beneath.
Full-bleed and opaque so iOS applies its own rounded mask; the artwork
stays inside the center ~66% for maskable safe zones.

Usage: python3 scripts/make_icons.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "icons"))

FONT_CANDS = [
    "/System/Library/Fonts/SFNS.ttf",            # SF Pro variable — weight set via font.set_variation_by_axes if possible
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


def load_font(size: int):
    for path in FONT_CANDS:
        try:
            f = ImageFont.truetype(path, size)
            try:
                f.set_variation_by_axes([800.0])  # Black weight when variable
            except Exception:
                pass
            return f
        except Exception:
            continue
    return ImageFont.load_default()


def draw_icon(size: int) -> Image.Image:
    S = size
    img = Image.new("RGBA", (S, S), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)

    # ---- Day bubble row ----
    n = 3
    bw = S * 0.185                     # bubble width
    bh = S * 0.235                     # bubble height
    gap = S * 0.05
    total = n * bw + (n - 1) * gap
    x0 = (S - total) / 2
    y0 = S * 0.345                     # row top
    lw = max(3, int(S * 0.021))        # outline weight

    cx = x0 + bw / 2
    for i in range(n):
        bx = x0 + i * (bw + gap)
        if i == 1:
            # filled bubble with the date
            d.rounded_rectangle([bx, y0, bx + bw, y0 + bh], radius=bh / 2, fill=(255, 255, 255, 255))
            fs = int(bh * 0.72)
            font = load_font(fs)
            text = "14"
            bbox = d.textbbox((0, 0), text, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            d.text((cx - tw / 2 - bbox[0], y0 + bh / 2 - th / 2 - bbox[1]), text,
                   font=font, fill=(0, 0, 0, 255))
        else:
            d.rounded_rectangle([bx, y0, bx + bw, y0 + bh], radius=bh / 2,
                                outline=(255, 255, 255, 255), width=lw)

    # ---- Feed line (three descending bars, echoing the card layout) ----
    bar_y = y0 + bh + S * 0.085
    bar_w = bw * 0.92
    bar_h = max(3, int(S * 0.016))
    bar_gap = bar_h * 2.4
    for k, wfac in enumerate((1.0, 0.66, 0.4)):
        b2 = bar_w * wfac
        bx = cx - b2 / 2
        d.rounded_rectangle([bx, bar_y + k * (bar_h + bar_gap), bx + b2, bar_y + k * (bar_h + bar_gap) + bar_h],
                            radius=bar_h / 2, fill=(255, 255, 255, 235))

    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    base = draw_icon(1024)
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512),
                       ("apple-touch-icon.png", 180), ("favicon-64.png", 64)]:
        im = base.resize((size, size), Image.LANCZOS).convert("RGB")
        im.save(os.path.join(OUT, name), "PNG")
    # SVG favicon (same motif, hand-drawn primitives)
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#000"/>
  <rect x="126" y="177" width="74" height="94" rx="47" fill="none" stroke="#fff" stroke-width="11"/>
  <rect x="219" y="177" width="74" height="94" rx="47" fill="#fff"/>
  <text x="256" y="247" font-family="Helvetica, Arial, sans-serif" font-size="62" font-weight="700"
        fill="#000" text-anchor="middle" dominant-baseline="middle">14</text>
  <rect x="312" y="177" width="74" height="94" rx="47" fill="none" stroke="#fff" stroke-width="11"/>
  <rect x="150" y="330" width="212" height="10" rx="5" fill="#fff"/>
  <rect x="177" y="354" width="158" height="10" rx="5" fill="#fff" opacity="0.66"/>
  <rect x="212" y="378" width="88" height="10" rx="5" fill="#fff" opacity="0.4"/>
</svg>'''
    with open(os.path.join(OUT, "favicon.svg"), "w") as f:
        f.write(svg)
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
