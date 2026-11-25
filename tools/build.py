#!/usr/bin/env python3
"""Build the Noble Sourdough site in public/.

What it writes:
  * the five loaf pages, public/<id>/index.html, from templates/product.html
    and content/products.json
  * the shared blocks in every page, between <!-- build:NAME --> markers:
      head    fonts, stylesheet, script, icons
      header  logo + main menu; "<!-- build:header about -->" marks ABOUT as the
              current page, "<!-- build:header home dark -->" is for a blue panel
      footer  contact, social links, legal line
      range   the Sourdough range cards (public/sourdough/)

Everything else in public/ is edited by hand.

Usage:
  python3 tools/build.py           write the pages
  python3 tools/build.py --check   change nothing; report out-of-date pages,
                                   broken internal links and missing images
                                   and any live-site text that is missing
                                   (exit code 1 if any page is out of date,
                                   any link is broken or any live text is missing)
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
PRODUCTS = ROOT / "content" / "products.json"
TEMPLATE = ROOT / "templates" / "product.html"

e = html.escape

# ---------------------------------------------------------------- shared blocks

HEAD = """\
  <link rel="icon" href="/assets/img/favicon.png">
  <link rel="icon" href="/assets/img/icon-192.png" sizes="192x192">
  <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png" sizes="180x180">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=Roboto+Mono:wght@400;500&amp;display=swap">
  <link rel="stylesheet" href="/assets/css/site.css">
  <script src="/assets/js/site.js" defer></script>"""

# Order and wording as on the live site. CATERING has no page yet ("coming soon").
# CONTACT is shown as the pill button (the reference design's "Let's talk").
NAV_ITEMS = [
    ("home", "/", "HOME"),
    ("about", "/about", "ABOUT"),
    ("sourdough", "/sourdough", "SOURDOUGH"),
    ("catering", None, "CATERING"),
    ("honesty-counter", "/honesty-counter", "HONESTY COUNTER"),
    ("contact", "/contact", "CONTACT"),
]


def header(current, theme="light"):
    """Shared header. "<!-- build:header about -->" marks ABOUT as current;
    add "dark" for white text on a blue panel: "<!-- build:header home dark -->"."""
    items = []
    for key, href, label in NAV_ITEMS:
        here = ' aria-current="page"' if key == current else ""
        if href is None:
            items.append(f'      <span class="soon">{label} <small>(COMING SOON)</small></span>')
        elif key == "contact":
            items.append(f'      <a class="pill" href="{href}"{here}>{label}</a>')
        else:
            items.append(f'      <a href="{href}"{here}>{label}</a>')
    return f"""\
  <header class="site-header" data-theme="{theme}">
    <a class="brand" href="/"><img src="/assets/img/logo.webp" alt="Noble Sourdough, home" width="140" height="196"></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu"><span></span></button>
    <nav class="site-nav" id="site-nav" aria-label="Main">
{chr(10).join(items)}
    </nav>
  </header>"""


# Live site: Instagram and LinkedIn link from the icon only; "Privacy Policy |
# Terms & Conditions" is plain text (no pages exist yet). Kept as live.
FOOTER = """\
  <footer class="site-footer">
    <div class="wrap">
      <div class="footer-grid">
        <a class="brand" href="/"><img src="/assets/img/logo.webp" alt="Noble Sourdough, home" width="140" height="196"></a>
        <div>
          <h2>Contact</h2>
          <address><strong>+971 52 923 1755<br>G05, Al Rawdha, Warsan First, Al Warsan First</strong><br>Dubai, United Arab Emirates<br>PO Box 2334 (Dubai)</address>
        </div>
        <div>
          <h2>Social Media</h2>
          <ul class="social">
            <li><a href="http://www.instagram.com/noblesourdough.ae"><img src="/assets/img/icon-instagram.webp" alt="Instagram" width="22" height="22"></a> Instagram</li>
            <li><a href="https://www.linkedin.com/in/matthew-firth-4595501a7/"><img src="/assets/img/icon-linkedin.webp" alt="LinkedIn" width="26" height="22"></a> LinkedIn</li>
          </ul>
        </div>
        <div>
          <p class="legal">Privacy Policy | Terms &amp; Conditions</p>
        </div>
      </div>
      <p class="footer-bottom"><img src="/assets/img/icon-copyright.webp" alt="©" width="15" height="15"> 2026 NOBLE BAKERY FZE. All rights reserved.</p>
    </div>
  </footer>"""

ALLERGEN_ICONS = {"Gluten": "allergen-gluten", "Sesame": "allergen-sesame"}

ARROW_LEFT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
ARROW_RIGHT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'


def allergen_tags(allergens):
    return "".join(
        f'<li class="tag"><img src="/assets/img/{ALLERGEN_ICONS[a]}.webp" alt="" height="14">{e(a)}</li>'
        for a in allergens
    )


def range_cards(data):
    """The Sourdough range as a card slider ("01 /05", round arrows)."""
    cards = []
    for p in data["products"]:
        cards.append(f"""\
          <article class="loaf-card" style="--card: {p['colors']['card']}">
            <img src="/assets/img/loaves/{p['id']}-card.webp" alt="" width="323" height="220">
            <p class="eyebrow">{e(p['specs'][0])}</p>
            <h2>{e(p['card_name'].title())}</h2>
            <p>{e(p['description'])}</p>
            <ul class="tags" aria-label="Allergens">{allergen_tags(p['allergens'])}</ul>
            <a class="dot-link" href="/{p['id']}">VIEW PRODUCT</a>
          </article>""")
    r = data["range"]
    words = r["heading"].split()  # "The SOURDOUGH Range": grey first words, blue last word
    heading = f'{e(" ".join(words[:-1]))}<br><span class="accent">{e(words[-1])}</span>'
    count = len(data["products"])
    return f"""\
    <div class="wrap" data-slider>
      <div class="slider-head">
        <h1 class="display">{heading}</h1>
        <p class="lead">{e(r['intro'])}</p>
      </div>
      <div class="slider-bar">
        <p class="counter" aria-hidden="true"><span data-current>01</span><small>/{count:02d}</small></p>
        <div class="slider-arrows">
          <button class="circle-btn" type="button" data-prev aria-label="Previous loaf">{ARROW_LEFT}</button>
          <button class="circle-btn" type="button" data-next aria-label="Next loaf">{ARROW_RIGHT}</button>
        </div>
      </div>
      <div class="slider-track" tabindex="0" aria-label="The Sourdough range">
{chr(10).join(cards)}
      </div>
    </div>"""


def product_page(template, p):
    li = lambda items: "\n".join(f"            <li>{e(x)}</li>" for x in items)
    values = {
        "id": p["id"],
        "page_title": e(p["page_title"]),
        "heading": e(p["heading"].title()),  # stored as on the live site (CAPS); shown in title case
        "description": e(p["description"]),
        "ingredients": li(p["ingredients"]),
        "allergens": allergen_tags(p["allergens"]),
        "color_loaf": p["colors"]["page"],
        "specs": li(p["specs"]),
        "color_page": p["colors"]["page"],
        "color_button": p["colors"]["button"],
        "color_panel_text": p["colors"]["panel_text"],
        "ingredient_columns": "3" if len(p["ingredients"]) > 9 else "2",
    }
    out = re.sub(r"\{\{(\w+)\}\}", lambda m: values[m.group(1)], template)
    leftover = re.findall(r"\{\{\w+\}\}", out)
    if leftover:
        sys.exit(f"Template placeholders not filled for {p['id']}: {leftover}")
    return out


# ------------------------------------------------------------------- the build

MARKER = re.compile(r"(?P<indent>[ \t]*)<!-- build:(?P<name>\w+)(?: (?P<arg>[\w -]+?))? -->\n.*?<!-- /build:(?P=name) -->", re.S)


def fill_blocks(text, data, page):
    def repl(m):
        name, arg, indent = m.group("name"), m.group("arg"), m.group("indent")
        if name == "head":
            body = HEAD
        elif name == "header":
            body = header(*(arg or "").split())
        elif name == "footer":
            body = FOOTER
        elif name == "range":
            body = range_cards(data)
        else:
            sys.exit(f"{page}: unknown block build:{name}")
        # Blocks are written for a 2-space indent; shift them to where the marker sits.
        extra = " " * max(len(indent) - 2, 0)
        body = "\n".join(extra + line if line else line for line in body.split("\n"))
        opening = f"<!-- build:{name}{' ' + arg if arg else ''} -->"
        return f"{indent}{opening}\n{body}\n{indent}<!-- /build:{name} -->"

    return MARKER.sub(repl, text)


REQUIRED = ["id", "page_title", "heading", "card_name", "description", "ingredients", "allergens", "specs", "colors"]


def load_products():
    data = json.loads(PRODUCTS.read_text(encoding="utf-8"))
    problems = []
    ids = set()
    for p in data["products"]:
        missing = [k for k in REQUIRED if not p.get(k)]
        if missing:
            problems.append(f"{p.get('id', '?')}: missing {', '.join(missing)}")
        if not re.fullmatch(r"[a-z0-9-]+", p.get("id", "")):
            problems.append(f"{p.get('id')}: id must be lower-case letters, digits and dashes (it is the page URL)")
        if p.get("id") in ids:
            problems.append(f"{p['id']}: used twice")
        ids.add(p.get("id"))
        for a in p.get("allergens", []):
            if a not in ALLERGEN_ICONS:
                problems.append(f"{p['id']}: no icon for allergen '{a}' (add it to ALLERGEN_ICONS)")
    if problems:
        sys.exit("content/products.json:\n  " + "\n  ".join(problems))
    return data


def render_all():
    """Return {path: new text} for every page build.py owns or touches."""
    data = load_products()
    template = TEMPLATE.read_text(encoding="utf-8")
    out = {}
    product_paths = set()
    for p in data["products"]:
        path = PUBLIC / p["id"] / "index.html"
        product_paths.add(path)
        out[path] = fill_blocks(product_page(template, p), data, path)
    for path in sorted(PUBLIC.rglob("*.html")):
        if path not in product_paths:
            out[path] = fill_blocks(path.read_text(encoding="utf-8"), data, path)
    return out


def local_target(url):
    """Map a site URL to the file that serves it, or None for external URLs."""
    if re.match(r"^(https?:|mailto:|tel:|#|data:)", url) or not url.startswith("/"):
        return None
    path = url.split("#")[0].split("?")[0]
    target = PUBLIC / path.lstrip("/")
    if path.endswith("/") or not Path(path).suffix:
        target = target / "index.html"
    return target


def check(pages):
    stale = [p for p, text in pages.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
    broken, missing_media = [], {}
    for page, text in pages.items():
        for attr, url in re.findall(r'\b(href|src)="([^"]+)"', text):
            target = local_target(html.unescape(url))
            if target is None or target.exists():
                continue
            if attr == "src" or url.startswith("/assets/img/"):
                missing_media.setdefault(url, []).append(page.relative_to(PUBLIC).as_posix())
            else:
                broken.append(f"{page.relative_to(PUBLIC)}: {url}")
    return stale, broken, missing_media


OUTLINE = ROOT / "reference" / "live-site-outline.json"


def visible_text(page_html):
    body = re.sub(r"<(script|style)\b.*?</\1>|<!--.*?-->", " ", page_html, flags=re.S)
    body = re.sub(r"<br\s*/?>", "\n", body)
    body = re.sub(r"<[^>]+>", "\n", body)
    return html.unescape(body)


def squash(s):
    # Words must match the live site exactly. Capitalisation is a design choice
    # (the live site uses ALL CAPS headings), so the comparison ignores case.
    return re.sub(r"\s+", " ", s).strip().casefold()


def missing_live_text(pages):
    """Lines of text on each live page (from the reference outline) that the new page lacks."""
    if not OUTLINE.exists():
        return {}
    outline = json.loads(OUTLINE.read_text(encoding="utf-8"))
    report = {}
    for live in outline["pages"]:
        slug = live["url"].strip("/")
        path = PUBLIC / slug / "index.html" if slug else PUBLIC / "index.html"
        ours = squash(visible_text(pages.get(path, "")))
        lines = set()

        def collect(el):
            for key in ("text", "label"):
                for line in (el.get(key) or "").split("\n"):
                    if line.strip():
                        lines.add(squash(line))
            for child in el.get("children", []):
                collect(child)

        for section in live["sections"]:
            for el in section["elements"]:
                collect(el)
        lacking = sorted(line for line in lines if line not in ours)
        if lacking:
            report[live["url"]] = lacking
    return report


def main():
    check_only = "--check" in sys.argv[1:]
    pages = render_all()

    if not check_only:
        for path, text in pages.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                path.write_text(text, encoding="utf-8")
                print(f"wrote {path.relative_to(ROOT)}")

    stale, broken, missing_media = check(pages)
    if check_only and stale:
        print("Out of date (run python3 tools/build.py):")
        for p in stale:
            print(f"  {p.relative_to(ROOT)}")
    if broken:
        print("Broken internal links:")
        for b in broken:
            print(f"  {b}")
    if missing_media:
        print(f"Images/videos not in public/ yet: {len(missing_media)} (expected until Phase 2)")
        for url in sorted(missing_media):
            print(f"  {url}")
    lacking = missing_live_text(pages)
    if lacking:
        print("Text on the live site that these pages lack (reference/live-site-outline.json):")
        for url, lines in lacking.items():
            for line in lines:
                print(f"  {url}: {line!r}")
    print(f"{len(pages)} pages checked, {len(broken)} broken links, "
          f"{sum(map(len, lacking.values()))} live text lines missing"
          + (f", {len(stale)} out of date" if check_only else ""))
    sys.exit(1 if broken or lacking or (check_only and stale) else 0)


if __name__ == "__main__":
    main()
