"""Product ids shared by build.py (page anchors) and media.py (image file names)."""
import re


def slug(text):
    text = text.lower().replace("&", "and").replace("’", "").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def product_id(category_id, name):
    return f"{category_id}--{slug(name)}"
