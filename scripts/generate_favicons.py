#!/usr/bin/env python3
"""Build the site's favicons from the league logo.

The full logo has the league name set beneath the artwork, which is
illegible below ~64px, so this crops to the silhouette - the part that
still reads at 16x16 - and pads it to a square.

Run:  python3 scripts/generate_favicons.py
"""

import os

from PIL import Image, ImageEnhance

SRC = "/private/tmp/claude-501/-Users-plewiz-Documents-Particle-V1/bae42f61-0118-4146-8021-0000de9d08d3/scratchpad/league_logo.png"
OUT = "/Users/plewiz/Documents/sleeper-league-site/public"

DARK_THRESHOLD = 100
# Barely any padding: at 16px every wasted pixel costs legibility.
PAD_RATIO = 0.02
# Downscaling washes the black artwork to grey, so push contrast back at
# the sizes where that actually matters.
SMALL_SIZE_CONTRAST = 1.8
# Ignore a margin so a faint scan border around the logo isn't mistaken
# for artwork (it was, and produced a visible box in the icon).
SCAN_MARGIN_RATIO = 0.04


def art_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    """
    Bounding box of the silhouette only. The logo is artwork, a blank
    band, then the league wordmark - so find the artwork block and stop
    at the first blank row after it, rather than assuming a fixed ratio
    (which cut through the glasses).
    """
    gray = img.convert("L")
    w, h = gray.size
    px = gray.load()
    m = int(w * SCAN_MARGIN_RATIO)

    density = [
        sum(1 for x in range(m, w - m) if px[x, y] < DARK_THRESHOLD) for y in range(h)
    ]

    top = next((y for y, d in enumerate(density) if d > 0), 0)
    bottom = next((y for y in range(top, h) if density[y] == 0), h)

    xs = [
        x
        for y in range(top, bottom)
        for x in range(m, w - m)
        if px[x, y] < DARK_THRESHOLD
    ]
    if not xs:
        return (0, top, w, bottom)
    return (min(xs), top, max(xs) + 1, bottom)


def main():
    src = Image.open(SRC).convert("RGB")
    bg = src.getpixel((2, 2))  # logo's own background color, for padding

    x0, y0, x1, y1 = art_bbox(src)
    art = src.crop((x0, y0, x1, y1))

    # Square canvas with a little breathing room so it isn't edge-to-edge.
    side = int(max(art.size) * (1 + PAD_RATIO * 2))
    canvas = Image.new("RGB", (side, side), bg)
    canvas.paste(art, ((side - art.size[0]) // 2, (side - art.size[1]) // 2))

    os.makedirs(OUT, exist_ok=True)

    def render(size: int) -> Image.Image:
        icon = canvas.resize((size, size), Image.LANCZOS)
        if size <= 48:
            icon = ImageEnhance.Contrast(icon).enhance(SMALL_SIZE_CONTRAST)
        return icon

    for size in (16, 32, 180, 512):
        if size == 180:
            name = "apple-touch-icon.png"
        elif size == 512:
            name = "icon-512.png"
        else:
            name = f"favicon-{size}x{size}.png"
        render(size).save(os.path.join(OUT, name), "PNG", optimize=True)
        print(f"wrote {name} ({size}x{size})")

    # Multi-resolution .ico for broad browser support.
    ico_path = os.path.join(OUT, "favicon.ico")
    render(48).save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"wrote favicon.ico  (cropped art {x0},{y0}-{x1},{y1} from {src.size})")


if __name__ == "__main__":
    main()
