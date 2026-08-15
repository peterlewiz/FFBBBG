#!/usr/bin/env python3
"""Cut the trophy out of the photo.

Two signals, combined:
  - flood fill from the borders, which handles the smooth cream wall
  - a warm-color rule, since the wood floor/stairs run R-B ~ +63 while
    every part of the trophy is neutral or blue (R-B from -32 to +2)

Then only the region *connected to the border* is treated as background,
so warm reflections bouncing off the floor onto the silver body aren't
punched out.
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

SRC = "/Users/plewiz/Desktop/IMG_1390.jpeg"
OUT = "/private/tmp/claude-501/-Users-plewiz-Documents-Particle-V1/bae42f61-0118-4146-8021-0000de9d08d3/scratchpad"

CROP = (850, 380, 2320, 3920)
MARKER = (255, 0, 255)
WALL_THRESH = 42
WARM_CUTOFF = 30  # R-B above this is wood, never the trophy


def keep_center_run(mask: np.ndarray, cx: int, smooth: int = 201) -> np.ndarray:
    """
    Per row, keep only the contiguous foreground run through cx, then
    median-filter the left/right edges down the image.

    The median pass matters: where the baseboard is genuinely contiguous
    with the trophy, that row's run spans the full width, and only
    comparing it against its neighbours reveals it as a spike. Median is
    edge-preserving, so the real step at the base survives.
    """
    h, w = mask.shape
    left = np.full(h, -1)
    right = np.full(h, -1)

    for y in range(h):
        row = mask[y]
        if not row.any():
            continue
        edges = np.diff(np.concatenate(([0], row.astype(np.int8), [0])))
        starts = np.flatnonzero(edges == 1)
        ends = np.flatnonzero(edges == -1)
        chosen = next(((s, e) for s, e in zip(starts, ends) if s <= cx < e), None)
        if chosen is None:  # centre not covered - fall back to the widest run
            widest = int(np.argmax(ends - starts))
            chosen = (starts[widest], ends[widest])
        left[y], right[y] = chosen

    valid = np.flatnonzero(left >= 0)
    if valid.size:
        lo, hi = valid[0], valid[-1] + 1
        half = smooth // 2

        def med_filter(arr: np.ndarray) -> np.ndarray:
            padded = np.pad(arr, half, mode="edge")
            return np.array(
                [int(np.median(padded[i : i + smooth])) for i in range(arr.size)]
            )

        l_seg, r_seg = left[lo:hi], right[lo:hi]
        l_med, r_med = med_filter(l_seg), med_filter(r_seg)

        # Only rewrite rows whose width is an outlier against the local
        # median. Everything else keeps its exact measured silhouette, so
        # genuine steps in the trophy's profile stay sharp.
        width = r_seg - l_seg
        expected = r_med - l_med
        spike = width > np.maximum(expected * 1.25, expected + 8)
        print("  outlier rows trimmed:", int(spike.sum()))
        l_seg[spike] = l_med[spike]
        r_seg[spike] = r_med[spike]
        left[lo:hi], right[lo:hi] = l_seg, r_seg

    out = np.zeros_like(mask)
    for y in range(h):
        if left[y] >= 0 and right[y] > left[y]:
            out[y, left[y] : right[y]] = True
    return out


def border_seeds(w: int, h: int):
    seeds = []
    for frac in [i / 40 for i in range(1, 40)]:
        seeds += [
            (int(w * frac), 2),
            (int(w * frac), h - 3),
            (2, int(h * frac)),
            (w - 3, int(h * frac)),
        ]
    return seeds


def main():
    img = ImageOps.exif_transpose(Image.open(SRC)).convert("RGB")
    img = img.crop(CROP)
    w, h = img.size

    # 1. wall via flood fill
    work = img.copy()
    for s in border_seeds(w, h):
        try:
            ImageDraw.floodfill(work, s, MARKER, thresh=WALL_THRESH)
        except Exception:
            pass
    warr = np.array(work)
    wall = (warr[:, :, 0] == 255) & (warr[:, :, 1] == 0) & (warr[:, :, 2] == 255)

    # 2. wood via warm-color rule
    a = np.array(img).astype(int)
    warm = (a[:, :, 0] - a[:, :, 2]) > WARM_CUTOFF

    candidate = wall | warm
    print("candidate background: %.1f%%" % (100 * candidate.mean()))

    # 3. keep only what's connected to the border
    binary = Image.fromarray(np.where(candidate, 255, 0).astype(np.uint8), "L").convert("RGB")
    for s in border_seeds(w, h):
        try:
            ImageDraw.floodfill(binary, s, MARKER, thresh=10)
        except Exception:
            pass
    barr = np.array(binary)
    connected = (barr[:, :, 0] == 255) & (barr[:, :, 1] == 0) & (barr[:, :, 2] == 255)
    print("connected background: %.1f%%" % (100 * connected.mean()))

    # 4. Keep only the foreground blob containing the trophy. Neutral-toned
    # bits of the stair edge and baseboard survive both rules above but are
    # separate islands, so seeding from the trophy body drops them.
    fg = Image.fromarray(np.where(connected, 0, 255).astype(np.uint8), "L").convert("RGB")
    ImageDraw.floodfill(fg, (w // 2, int(h * 0.42)), MARKER, thresh=10)
    farr = np.array(fg)
    trophy = (farr[:, :, 0] == 255) & (farr[:, :, 1] == 0) & (farr[:, :, 2] == 255)
    print("trophy blob: %.1f%% (was %.1f%% foreground)" % (100 * trophy.mean(), 100 * (~connected).mean()))

    # 5. The white baseboard passes *behind* the trophy and touches it on
    # both sides, so it's part of the same blob. The trophy is convex per
    # row, so keeping only the horizontal run through its centre trims
    # those spurs without touching the trophy itself.
    trophy = keep_center_run(trophy, w // 2)

    alpha = np.where(trophy, 255, 0).astype(np.uint8)
    mask = Image.fromarray(alpha, "L")
    mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    mask = mask.filter(ImageFilter.GaussianBlur(1.4))

    cut = img.convert("RGBA")
    cut.putalpha(mask)
    bbox = mask.point(lambda v: 255 if v > 10 else 0).getbbox()
    if bbox:
        cut = cut.crop(bbox)
    print("final size", cut.size)
    cut.save(f"{OUT}/trophy_cut.png")

    prev = cut.copy()
    prev.thumbnail((520, 520), Image.LANCZOS)
    board = Image.new("RGB", prev.size, (40, 40, 46))
    d = ImageDraw.Draw(board)
    for y in range(0, prev.size[1], 16):
        for x in range(0, prev.size[0], 16):
            if (x // 16 + y // 16) % 2 == 0:
                d.rectangle([x, y, x + 15, y + 15], fill=(70, 70, 78))
    board.paste(prev, (0, 0), prev)
    board.save(f"{OUT}/trophy_preview.png")


if __name__ == "__main__":
    main()
