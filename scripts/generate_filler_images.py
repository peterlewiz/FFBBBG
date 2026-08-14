#!/usr/bin/env python3
"""Generate placeholder hero images for each manager: football-themed,
anime/manga action-card style - speed lines, halftone texture, a flying
football with motion streaks, bold outlined title text. Meant to be
replaced later with real AI-generated images."""

from PIL import Image, ImageDraw, ImageFont
import colorsys
import hashlib
import math
import os
import random

MANAGERS = [
    ("738538726719930368", "3mojt"),
    ("978857538626084864", "Enasif18"),
    ("739228047332548608", "frtheo"),
    ("739598324197392384", "KokoM"),
    ("739228718886711296", "MarioM26"),
    ("740737264774217728", "maryghaly"),
    ("853720333243482112", "mavs97"),
    ("732791680197054464", "mmasoud2"),
    ("738510505450283008", "plewiz"),
    ("976317587141287936", "sharo733"),
    ("872210229440487424", "SumoFlakes"),
    ("737330429740363776", "Youssefgirges"),
]

OUT_DIR = "/Users/plewiz/Documents/sleeper-league-site/public/manager-images"
W, H = 1260, 480
FONT_BLACK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def hsl(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return (int(r * 255), int(g * 255), int(b * 255))


def gradient_colors(index: int, total: int, seed_name: str):
    # Evenly space hues around the wheel by index (golden-angle stepping
    # avoids two adjacent slots ever landing near the same hue, unlike
    # pure hashing which can cluster with only a dozen samples), then
    # nudge deterministically per-name so re-running stays stable.
    h = int(hashlib.sha256(seed_name.encode()).hexdigest(), 16)
    golden_angle = 0.618033988749895
    hue1 = (index * golden_angle + (h % 1000) / 100000.0) % 1.0
    hue2 = (hue1 + 0.06) % 1.0
    c1 = hsl(hue1, 0.75, 0.32)
    c2 = hsl(hue2, 0.85, 0.14)
    accent = hsl((hue1 + 0.5) % 1.0, 0.9, 0.62)  # complementary pop color
    return c1, c2, accent


def make_gradient(w, h, c1, c2, angle_deg=125):
    base = Image.new("RGB", (w, h), c1)
    top = Image.new("RGB", (w, h), c2)
    mask = Image.new("L", (w, h))
    angle = math.radians(angle_deg)
    dx, dy = math.cos(angle), math.sin(angle)
    corners = [(0, 0), (w, 0), (0, h), (w, h)]
    projections = [x * dx + y * dy for x, y in corners]
    pmin, pmax = min(projections), max(projections)
    data = []
    for y in range(h):
        for x in range(w):
            p = x * dx + y * dy
            t = (p - pmin) / (pmax - pmin) if pmax != pmin else 0
            data.append(int(max(0, min(1, t)) * 255))
    mask.putdata(data)
    return Image.composite(top, base, mask)


def add_speed_lines(img: Image.Image, seed: int, origin=None, color=(255, 255, 255)):
    """Anime-style radiating action lines fanning out from a focal point."""
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    rng = random.Random(seed)
    ox, oy = origin or (w * 0.14, h * 0.5)
    n_lines = 46
    max_r = math.hypot(w, h) * 1.1
    for i in range(n_lines):
        angle = rng.uniform(0, 2 * math.pi)
        length = rng.uniform(max_r * 0.35, max_r)
        width = rng.choice([1, 1, 2, 2, 3])
        alpha = rng.randint(14, 46)
        x2 = ox + math.cos(angle) * length
        y2 = oy + math.sin(angle) * length
        draw.line([(ox, oy), (x2, y2)], fill=(*color, alpha), width=width)
    img = Image.alpha_composite(img.convert("RGBA"), layer)
    return img.convert("RGB")


def add_halftone(img: Image.Image, seed: int, box, dot_max=5, gap=13, color=(255, 255, 255), alpha=40):
    """Manga-style halftone dot screen inside a rectangular region."""
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = box
    rng = random.Random(seed)
    y = y0
    row = 0
    while y < y1:
        x = x0 + (gap / 2 if row % 2 else 0)
        while x < x1:
            # dots shrink toward the edges of the box for a faded screen-tone look
            dx = min(x - x0, x1 - x) / max(1, (x1 - x0) / 2)
            dy = min(y - y0, y1 - y) / max(1, (y1 - y0) / 2)
            fade = max(0.15, min(dx, dy))
            r = dot_max * fade
            if r > 0.6:
                draw.ellipse([x - r, y - r, x + r, y + r], fill=(*color, alpha))
            x += gap
        y += gap
        row += 1
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def draw_football(img: Image.Image, center, size, rotation_deg, accent):
    """A simple stylized American football with laces and a motion glow."""
    w, h = img.size
    fw, fh = size
    pad = 40
    layer = Image.new("RGBA", (fw + pad * 2, fh + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = layer.size[0] / 2, layer.size[1] / 2

    # motion streaks trailing behind (drawn first, so they sit under the ball)
    for i in range(6, 0, -1):
        offset = i * 14
        alpha = int(70 / i)
        d.ellipse(
            [pad - offset, pad + fh * 0.5 - 6, pad + fw - offset, pad + fh * 0.5 + 6],
            fill=(255, 255, 255, alpha),
        )

    # ball body
    d.ellipse([pad, pad, pad + fw, pad + fh], fill=(120, 66, 24, 255), outline=(30, 16, 6, 255), width=6)
    # leather seams
    d.line([(pad + fw * 0.08, cy), (pad + fw * 0.92, cy)], fill=(30, 16, 6, 230), width=4)
    # laces
    lace_x0, lace_x1 = pad + fw * 0.38, pad + fw * 0.62
    d.line([(lace_x0, cy), (lace_x1, cy)], fill=(255, 255, 255, 240), width=5)
    for t in range(5):
        lx = lace_x0 + (lace_x1 - lace_x0) * (t + 0.5) / 5
        d.line([(lx, cy - 10), (lx, cy + 10)], fill=(255, 255, 255, 240), width=4)

    # accent rim glow
    d.ellipse([pad - 5, pad - 5, pad + fw + 5, pad + fh + 5], outline=(*accent, 140), width=3)

    layer = layer.rotate(rotation_deg, expand=True, resample=Image.BICUBIC)
    img = img.convert("RGBA")
    px = int(center[0] - layer.size[0] / 2)
    py = int(center[1] - layer.size[1] / 2)
    img.alpha_composite(layer, (px, py))
    return img.convert("RGB")


def draw_title(img: Image.Image, name: str, accent):
    draw = ImageDraw.Draw(img)
    w, h = img.size
    max_width = w * 0.86
    size = 168
    font = ImageFont.truetype(FONT_BLACK, size)
    while True:
        bbox = draw.textbbox((0, 0), name, font=font, stroke_width=max(2, size // 22))
        text_w = bbox[2] - bbox[0]
        if text_w <= max_width or size <= 44:
            break
        size -= 6
        font = ImageFont.truetype(FONT_BLACK, size)

    stroke_w = max(4, size // 18)
    bbox = draw.textbbox((0, 0), name, font=font, stroke_width=stroke_w)
    text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (w - text_w) / 2 - bbox[0]
    y = h * 0.60 - text_h / 2 - bbox[1]

    # drop shadow
    draw.text((x + 6, y + 8), name, font=font, fill=(0, 0, 0, 160))
    # anime title-card style: bold color fill + thick dark outline
    draw.text((x, y), name, font=font, fill=(255, 255, 255), stroke_width=stroke_w, stroke_fill=(17, 17, 17))

    # small accent underline flourish
    underline_y = y + text_h + 22
    draw.line(
        [(w / 2 - text_w * 0.32, underline_y), (w / 2 + text_w * 0.32, underline_y)],
        fill=accent,
        width=6,
    )

    tag_font = ImageFont.truetype(FONT_BOLD, 20)
    tag = "PLACEHOLDER IMAGE"
    tbbox = draw.textbbox((0, 0), tag, font=tag_font)
    tw = tbbox[2] - tbbox[0]
    draw.text((w - tw - 24, h - 40), tag, font=tag_font, fill=(255, 255, 255, 140))
    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for idx, (user_id, name) in enumerate(MANAGERS):
        seed = int(hashlib.sha256(name.encode()).hexdigest(), 16) % (2**31)
        rng = random.Random(seed)
        c1, c2, accent = gradient_colors(idx, len(MANAGERS), name)

        img = make_gradient(W, H, c1, c2)
        img = add_halftone(img, seed, box=(0, 0, W * 0.55, H), dot_max=4, gap=16, alpha=26)
        img = add_speed_lines(img, seed, origin=(W * 0.12, H * 0.42), color=(255, 255, 255))

        ball_size = (int(W * 0.30), int(W * 0.30 * 0.6))
        ball_center = (W * 0.80, H * 0.38)
        rotation = rng.uniform(-35, -15)
        img = draw_football(img, ball_center, ball_size, rotation, accent)

        img = draw_title(img, name, accent)

        out_path = os.path.join(OUT_DIR, f"{user_id}.jpg")
        img.convert("RGB").save(out_path, "JPEG", quality=90)
        print(f"wrote {out_path}  ({name})")


if __name__ == "__main__":
    main()
