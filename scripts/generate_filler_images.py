#!/usr/bin/env python3
"""Generate each manager's hero card: a sleek dark banner in their
signature neon color (kept in sync with src/lib/teamColors.ts) - neon
perspective grid, glowing title text, and their profile picture ringed
in their color. Falls back to a glowing wireframe football for any
manager who has no picture in public/manager-avatars/ yet.

Run:  python3 scripts/generate_filler_images.py
"""

from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os

AVATAR_DIR = "/Users/plewiz/Documents/sleeper-league-site/public/manager-avatars"

# (userId, displayName, neon hex) - colors mirror src/lib/teamColors.ts
MANAGERS = [
    ("737330429740363776", "Youssefgirges", "#00E5FF"),
    ("739228718886711296", "MarioM26", "#FF2BD6"),
    ("740737264774217728", "maryghaly", "#A3FF12"),
    ("976317587141287936", "sharo733", "#FF7A1A"),
    ("732791680197054464", "mmasoud2", "#9D4EFF"),
    ("978857538626084864", "Enasif18", "#00FF9C"),
    ("738510505450283008", "plewiz", "#FF1E6F"),
    ("739598324197392384", "KokoM", "#2E8BFF"),
    ("853720333243482112", "mavs97", "#FFE81A"),
    ("872210229440487424", "SumoFlakes", "#00FFD1"),
    ("739228047332548608", "frtheo", "#FF3B3B"),
    ("738538726719930368", "3mojt", "#6C5CFF"),
]

OUT_DIR = "/Users/plewiz/Documents/sleeper-league-site/public/manager-images"
W, H = 1260, 480
INK = (5, 6, 11)
FONT_BLACK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def glow(layer: Image.Image, radius: int, passes=3) -> Image.Image:
    """Stack progressively blurred copies to fake a neon bloom."""
    out = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    for i in range(passes, 0, -1):
        blurred = layer.filter(ImageFilter.GaussianBlur(radius * i / passes))
        out = Image.alpha_composite(out, blurred)
    return Image.alpha_composite(out, layer)


def draw_grid(size, color):
    """Perspective floor grid fading toward the horizon."""
    w, h = size
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    horizon = h * 0.52
    vpx = w * 0.5

    # verticals converging on the vanishing point
    for i in range(-14, 15):
        x_bottom = vpx + i * (w / 10)
        d.line([(x_bottom, h), (vpx + i * 6, horizon)], fill=(*color, 40), width=2)

    # horizontals, spaced so they bunch up near the horizon
    y = h
    step = 6.0
    while y > horizon:
        t = (y - horizon) / (h - horizon)
        d.line([(0, y), (w, y)], fill=(*color, int(18 + 42 * t)), width=2)
        step *= 1.32
        y -= step

    # mask so the grid only lives in the lower half
    mask = Image.linear_gradient("L").resize(size)
    layer.putalpha(Image.composite(layer.getchannel("A"), Image.new("L", size, 0), mask))
    return layer


def draw_football(size, color, center, ball_w, ball_h):
    """Neon wireframe football: outline, seam, and laces - no fill."""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center
    box = [cx - ball_w / 2, cy - ball_h / 2, cx + ball_w / 2, cy + ball_h / 2]
    d.ellipse(box, outline=(*color, 255), width=5)

    # inner seam line
    d.line([(cx - ball_w * 0.34, cy), (cx + ball_w * 0.34, cy)], fill=(*color, 200), width=3)
    # laces
    for i in range(5):
        lx = cx - ball_w * 0.16 + i * (ball_w * 0.32 / 4)
        d.line([(lx, cy - ball_h * 0.12), (lx, cy + ball_h * 0.12)], fill=(*color, 255), width=4)
    # nose highlights
    d.arc([box[0] - 6, box[1] - 6, box[2] + 6, box[3] + 6], 200, 250, fill=(*color, 120), width=3)
    return layer


def draw_avatar(size, color, center, diameter, avatar_path):
    """The manager's picture as a circle with a neon ring, or None if we
    don't have a picture for them."""
    if not os.path.exists(avatar_path):
        return None

    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    av = Image.open(avatar_path).convert("RGB").resize((diameter, diameter), Image.LANCZOS)

    # circular mask, supersampled so the edge isn't jagged
    mask = Image.new("L", (diameter * 4, diameter * 4), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, diameter * 4 - 1, diameter * 4 - 1], fill=255)
    mask = mask.resize((diameter, diameter), Image.LANCZOS)

    cx, cy = int(center[0] - diameter / 2), int(center[1] - diameter / 2)
    layer.paste(av, (cx, cy), mask)
    return layer


def draw_avatar_ring(size, color, center, diameter):
    ring = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ring)
    r = diameter / 2
    d.ellipse(
        [center[0] - r, center[1] - r, center[0] + r, center[1] + r],
        outline=(*color, 255),
        width=6,
    )
    return ring


def draw_text_layer(size, text, color, font_path, y_center, left_x, max_width):
    """Left-aligned title text, auto-shrunk to fit its own column so it
    never collides with the football on the right."""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    fsize = 132
    font = ImageFont.truetype(font_path, fsize)
    while True:
        bbox = d.textbbox((0, 0), text, font=font)
        if bbox[2] - bbox[0] <= max_width or fsize <= 34:
            break
        fsize -= 4
        font = ImageFont.truetype(font_path, fsize)

    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = left_x - bbox[0]
    y = y_center - th / 2 - bbox[1]
    d.text((x, y), text, font=font, fill=(*color, 255))
    return layer, (x, y, tw, th)


def build(user_id, name, hex_color):
    color = hex_rgb(hex_color)
    img = Image.new("RGBA", (W, H), (*INK, 255))

    # ambient corner glows
    ambient = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ad = ImageDraw.Draw(ambient)
    ad.ellipse([-W * 0.2, -H * 0.6, W * 0.45, H * 0.7], fill=(*color, 30))
    ad.ellipse([W * 0.62, H * 0.35, W * 1.25, H * 1.6], fill=(*color, 22))
    img = Image.alpha_composite(img, ambient.filter(ImageFilter.GaussianBlur(90)))

    # neon floor grid
    img = Image.alpha_composite(img, draw_grid((W, H), color))

    # Layout: name occupies the left column, football sits in its own
    # clear zone on the right so the two never overlap.
    TEXT_LEFT = W * 0.07
    TEXT_MAX_W = W * 0.56
    BALL_CX = W * 0.82

    avatar_path = os.path.join(AVATAR_DIR, f"{user_id}.png")
    avatar_layer = draw_avatar((W, H), color, (BALL_CX, H * 0.42), int(H * 0.56), avatar_path)
    if avatar_layer is not None:
        ring = draw_avatar_ring((W, H), color, (BALL_CX, H * 0.42), int(H * 0.56))
        img = Image.alpha_composite(img, glow(ring, 16))  # bloom behind
        img = Image.alpha_composite(img, avatar_layer)
        img = Image.alpha_composite(img, ring)  # crisp ring on top
    else:
        ball_w = W * 0.20
        ball = draw_football((W, H), color, (BALL_CX, H * 0.42), ball_w, ball_w * 0.58)
        img = Image.alpha_composite(img, glow(ball, 14))

    # glowing name
    text_layer, _ = draw_text_layer((W, H), name, color, FONT_BLACK, H * 0.42, TEXT_LEFT, TEXT_MAX_W)
    img = Image.alpha_composite(img, glow(text_layer, 16))
    # crisp white core on top so it stays legible at small sizes
    core, (tx, ty, tw, th) = draw_text_layer(
        (W, H), name, (255, 255, 255), FONT_BLACK, H * 0.42, TEXT_LEFT, TEXT_MAX_W
    )
    img = Image.alpha_composite(img, core)

    # Accent rule under the name, left-aligned with it. Pinned to a fixed
    # baseline rather than the text bbox: bbox height varies with which
    # glyphs a name happens to use (descenders in "plewiz", none in
    # "mavs97"), which put the rule through the letters on some names.
    rule = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rule)
    rule_y = H * 0.63
    rd.line([(tx, rule_y), (tx + tw * 0.55, rule_y)], fill=(*color, 255), width=4)
    img = Image.alpha_composite(img, glow(rule, 10))

    # thin neon frame + corner ticks, HUD feel
    frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.rectangle([10, 10, W - 11, H - 11], outline=(*color, 70), width=2)
    for cx, cy, dx, dy in ((10, 10, 1, 1), (W - 11, 10, -1, 1), (10, H - 11, 1, -1), (W - 11, H - 11, -1, -1)):
        fd.line([(cx, cy), (cx + 46 * dx, cy)], fill=(*color, 220), width=4)
        fd.line([(cx, cy), (cx, cy + 46 * dy)], fill=(*color, 220), width=4)
    img = Image.alpha_composite(img, glow(frame, 8))

    # scanlines
    scan = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scan)
    for y in range(0, H, 3):
        sd.line([(0, y), (W, y)], fill=(255, 255, 255, 8), width=1)
    img = Image.alpha_composite(img, scan)

    out_path = os.path.join(OUT_DIR, f"{user_id}.jpg")
    img.convert("RGB").save(out_path, "JPEG", quality=90)
    print(f"wrote {out_path}  ({name} {hex_color})")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for user_id, name, hex_color in MANAGERS:
        build(user_id, name, hex_color)


if __name__ == "__main__":
    main()
