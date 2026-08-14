#!/usr/bin/env python3
"""Convert the league's Discord avatars into square PNGs keyed by Sleeper
user id, for use as each manager's profile picture on the site.

Sources live outside the repo (downloaded from Discord with the members'
permission); this writes the web-ready copies into
public/manager-avatars/<sleeperUserId>.png.
"""

import os

from PIL import Image

SRC = "/private/tmp/claude-501/-Users-plewiz-Documents-Particle-V1/bae42f61-0118-4146-8021-0000de9d08d3/scratchpad/discord_avatars"
OUT = "/Users/plewiz/Documents/sleeper-league-site/public/manager-avatars"
SIZE = 256

# discord avatar file -> (sleeper user id, sleeper display name)
MAPPING = {
    "no-name-shown": ("853720333243482112", "mavs97"),
    "supreme-ruler": ("739228047332548608", "frtheo"),
    "bobby": ("738510505450283008", "plewiz"),
    "aaron-rodgers-fan": ("976317587141287936", "sharo733"),
    "traitor-hany": ("739597616110829568", "Hany1"),
    "uncle-iroh": ("737330429740363776", "Youssefgirges"),
    "the-matriarch": ("740737264774217728", "maryghaly"),
    "kupp-fanboy-club": ("732791680197054464", "mmasoud2"),
    "kerom": ("739598324197392384", "KokoM"),
    "it-s-agib": ("739228718886711296", "MarioM26"),
    "king-boomi": ("872210229440487424", "SumoFlakes"),
    "raidernation218": ("978857538626084864", "Enasif18"),
    "shady-4323": ("718138810201878528", "Shady43"),
    "sokka": ("738538726719930368", "3mojt"),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for slug, (user_id, name) in sorted(MAPPING.items(), key=lambda kv: kv[1][1].lower()):
        src = os.path.join(SRC, f"{slug}.webp")
        if not os.path.exists(src):
            print(f"MISSING {slug}.webp ({name})")
            continue
        img = Image.open(src).convert("RGB")
        # center-crop to square before resizing so nothing is squashed
        w, h = img.size
        side = min(w, h)
        img = img.crop(
            ((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2)
        ).resize((SIZE, SIZE), Image.LANCZOS)
        dest = os.path.join(OUT, f"{user_id}.png")
        img.save(dest, "PNG", optimize=True)
        print(f"{name:15s} -> {os.path.basename(dest)}  ({os.path.getsize(dest)}b)")


if __name__ == "__main__":
    main()
