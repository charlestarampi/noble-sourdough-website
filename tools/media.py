#!/usr/bin/env python3
"""Turn the raw brand assets in content/ into web-ready files in public/assets/.

Raw assets (content/catalogue, content/images, content/logos, content/fonts)
stay on this Mac and are not committed (see .gitignore). Run this after adding
or replacing any of them:

    python3 tools/media.py

Needs Pillow (pip3 install pillow). Videos are converted separately (README).

Writes:
  assets/img/catalogue/<product-id>.webp    900px wide, original framing and colours
  assets/img/catalogue/<product-id>-sm.webp 480px wide
  assets/img/catalogue/<product-id>-view-*.webp  alternate original views
  assets/img/values/*.webp                  supplied brand icons
  assets/img/bakery/img-00N.webp (+ -sm)    bakery photos, 1600px / 800px wide
  assets/img/brand/*.webp                   logos trimmed to their artwork
  assets/img/brand/pattern-*.webp           brand pattern tile (hat icon)
  assets/img/favicon.png, icon-192.png, apple-touch-icon.png   from the logomark
  assets/fonts/aboreto/, assets/fonts/gotham/                  (Gotham not committed)
"""
import json
import re
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow is needed: pip3 install pillow")

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
ASSETS = ROOT / "public" / "assets"
WHITE = (255, 255, 255)


sys.path.insert(0, str(Path(__file__).resolve().parent))
from ids import product_id  # noqa: E402


def newer(src, dst):
    return not dst.exists() or src.stat().st_mtime > dst.stat().st_mtime


def on_white(im):
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, WHITE)
        bg.paste(im, mask=im.getchannel("A"))
        return bg
    return im.convert("RGB")


def save_webp(im, path, quality=82):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=quality, method=6)


def catalogue_photo(src, dst, width):
    # Keep the supplied framing, background and natural shadows.
    if not newer(src, dst) and not newer(Path(__file__), dst):
        return
    with Image.open(src) as original:
        im = ImageOps.exif_transpose(original).convert("RGB")
        height = round(im.height * width / im.width)
        save_webp(im.resize((width, height), Image.LANCZOS), dst, quality=86)


def catalogue():
    data = json.loads((CONTENT / "catalogue.json").read_text(encoding="utf-8"))
    out = ASSETS / "img" / "catalogue"
    done = missing = 0
    for group in data["groups"]:
        for cat in group["categories"]:
            for p in cat["products"]:
                if not p.get("photo"):
                    continue
                src = CONTENT / "catalogue" / p["photo"]
                if not src.exists():
                    print(f"  missing photo: {p['photo']}")
                    missing += 1
                    continue
                pid = product_id(cat["id"], p["name"])
                catalogue_photo(src, out / f"{pid}.webp", 900)
                catalogue_photo(src, out / f"{pid}-sm.webp", 480)
                # Numbered shots in the same product set are alternate views.
                match = re.fullmatch(r"(.+) (\d{2})", src.stem)
                if match:
                    for photo in sorted(src.parent.glob(f"{match[1]} [0-9][0-9]{src.suffix}")):
                        if photo != src:
                            number = photo.stem.rsplit(" ", 1)[1]
                            catalogue_photo(photo, out / f"{pid}-view-{number}.webp", 900)
                done += 1
    print(f"catalogue: {done} products, {missing} photos missing")


def values():
    icons = {
        "noble-way-icon-3d-blue-on-cream.png": "noble-way",
        "no-additives-icon-3d-blue-on-cream.png": "no-additives",
        "no-added-yeast-icon-3d-blue-on-cream.png": "no-added-yeast",
        "focus-perfected-icon-3d-blue-on-cream.png": "focus-perfected",
        "proper-sourdough-icon-3d-blue-on-cream.png": "proper-sourdough",
        "no-added-sugar-icon-3d-blue-on-cream.png": "no-added-sugar",
        "fermented-24-hours-icon-3d-blue-on-cream.png": "fermented-24-hours",
        "top-quality-icon-3d-blue-on-cream.png": "top-quality",
    }
    for filename, name in icons.items():
        src = CONTENT / "icons" / filename
        dst = ASSETS / "img" / "values" / f"{name}.webp"
        if src.exists() and newer(src, dst):
            with Image.open(src) as im:
                im.thumbnail((420, 420))
                save_webp(im, dst, quality=86)


def bakery():
    for src in sorted((CONTENT / "images").glob("IMG-*.jpg")):
        name = src.stem.lower()
        out = ASSETS / "img" / "bakery" / f"{name}.webp"
        if not newer(src, out):
            continue
        im = on_white(Image.open(src))
        for width, path in ((1600, out), (800, out.with_name(f"{name}-sm.webp"))):
            copy = im.copy()
            copy.thumbnail((width, width * 2))
            save_webp(copy, path, quality=80)
    print("bakery photos: done")


def trimmed(path):
    im = Image.open(path).convert("RGBA")
    return im.crop(im.getchannel("A").getbbox())


def brand():
    logos = CONTENT / "logos"
    out = ASSETS / "img" / "brand"
    for name in ["noble-sourdough-logo-horizontal-blue", "noble-sourdough-logo-horizontal-cream",
                 "noble-sourdough-logo-stacked-blue", "noble-sourdough-logo-stacked-cream",
                 "noble-icon-blue", "noble-icon-cream"]:
        im = trimmed(logos / f"{name}.png")
        im.thumbnail((720, 720))
        save_webp(im, out / f"{name}.webp", quality=90)
    # Pattern tile: two small logomarks, offset diagonally, so it repeats as a
    # staggered pattern. Marquee separators use a single mark.
    for colour in ("cream", "blue"):
        icon = trimmed(logos / f"noble-icon-{colour}.png")
        mark = icon.copy(); mark.thumbnail((40, 40))
        tile = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
        for cx, cy in ((40, 40), (120, 120)):
            tile.paste(mark, (cx - mark.width // 2, cy - mark.height // 2), mark)
        save_webp(tile, out / f"pattern-{colour}.webp", quality=90)
        single = icon.copy(); single.thumbnail((80, 80))
        save_webp(single, out / f"mark-{colour}.webp", quality=90)
    # Favicons from the logomark on cream.
    mark = Image.open(logos / "noble-icon-blue-on-cream.png").convert("RGB")
    for size, name in ((32, "favicon.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")):
        mark.resize((size, size), Image.LANCZOS).save(ASSETS / "img" / name)
    print("brand: logos, pattern, favicons done")


def fonts():
    src = CONTENT / "fonts"
    (ASSETS / "fonts" / "aboreto").mkdir(parents=True, exist_ok=True)
    shutil.copy2(src / "Aboreto-Regular.ttf", ASSETS / "fonts" / "aboreto" / "Aboreto-Regular.ttf")
    gotham = ASSETS / "fonts" / "gotham"
    gotham.mkdir(parents=True, exist_ok=True)
    for name in ("Gotham-Book.otf", "Gotham-BookItalic.otf", "Gotham-Medium.otf", "Gotham-BoldItalic.otf"):
        shutil.copy2(src / "Gotham" / name, gotham / name)
    shutil.copy2(src / "Gotham" / "GOTHAM-BOLD.TTF", gotham / "Gotham-Bold.ttf")
    print("fonts: Aboreto, Gotham Book/Medium/Bold copied")


if __name__ == "__main__":
    catalogue()
    values()
    bakery()
    brand()
    fonts()
