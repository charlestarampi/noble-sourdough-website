#!/usr/bin/env python3
"""Build the Noble Sourdough site in public/.

What it writes:
  * the five loaf pages, public/<id>/index.html, from templates/product.html
    and content/products.json
  * the shared blocks in every page, between <!-- build:NAME --> markers:
      head        fonts, stylesheet, script, icons
      header      logo + main menu; "<!-- build:header about -->" marks ABOUT as
                  current, "<!-- build:header home dark -->" starts
                  with light text over a blue hero
      footer      contact, social links, menu, legal line
      marquee     the slow "Better Bread Everyday" band
      categories  catalogue category cards (home page)
      catalogue   the whole B2B catalogue (public/catalogue/), from content/catalogue.json
      range       the Sourdough range (public/sourdough/ and the home page teaser)

Everything else in public/ is edited by hand.

Usage:
  python3 tools/build.py           write the pages
  python3 tools/build.py --check   change nothing; report out-of-date pages,
                                   broken internal links, missing images and
                                   any live-site text that is missing
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
CATALOGUE = ROOT / "content" / "catalogue.json"
TEMPLATE = ROOT / "templates" / "product.html"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ids import product_id  # noqa: E402  (same id rule as the image files)

e = html.escape

# ---------------------------------------------------------------- shared blocks

HEAD = """\
  <meta name="theme-color" content="#fcf5e6">
  <link rel="icon" href="/assets/img/favicon.png">
  <link rel="icon" href="/assets/img/icon-192.png" sizes="192x192">
  <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png" sizes="180x180">
  <link rel="preload" href="/assets/fonts/aboreto/Aboreto-Regular.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="stylesheet" href="/assets/css/site.css">
  <script src="/assets/js/site.js" defer></script>"""

NAV_ITEMS = [
    ("home", "/", "HOME"),
    ("catalogue", "/catalogue", "CATALOGUE"),
    ("sourdough", "/sourdough", "SOURDOUGH"),
    ("about", "/about", "ABOUT"),
    ("contact", "/contact", "CONTACT"),
]


def header(current="", theme="light"):
    items = []
    for i, (key, href, label) in enumerate(NAV_ITEMS):
        here = ' aria-current="page"' if key == current else ""
        style = f' style="--i: {i}"'
        if key == "contact":
            items.append(f'        <li{style}><a class="btn btn--pill nav-cta" href="{href}"{here}><span>{label}</span></a></li>')
        else:
            items.append(f'        <li{style}><a class="nav-link" href="{href}"{here}>{label}</a></li>')
    return f"""\
  <header class="site-header" data-header data-theme="{theme}">
    <div class="header-inner">
      <a class="brand" href="/" aria-label="Noble Sourdough, home">
        <img class="brand-blue" src="/assets/img/brand/noble-sourdough-logo-horizontal-blue.webp" alt="" width="720" height="290">
        <img class="brand-cream" src="/assets/img/brand/noble-sourdough-logo-horizontal-cream.webp" alt="" width="720" height="290">
      </a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav">
        <span class="visually-hidden">Menu</span><span class="menu-lines" aria-hidden="true"></span>
      </button>
      <nav class="site-nav" id="site-nav" aria-label="Main">
        <ul>
{chr(10).join(items)}
        </ul>
      </nav>
    </div>
  </header>"""


def footer():
    links = "\n".join(
        f'            <li><a href="{href}">{label}</a></li>' for key, href, label in NAV_ITEMS if key != "home"
    )
    # Live site: Instagram and LinkedIn link from the icon; "Privacy Policy |
    # Terms & Conditions" is plain text (no pages exist yet). Kept as live.
    return f"""\
  <footer class="site-footer">
    <div class="wrap">
      <div class="footer-top">
        <a class="footer-brand" href="/" aria-label="Noble Sourdough, home"><img src="/assets/img/brand/noble-sourdough-logo-stacked-cream.webp" alt="" width="420" height="720" loading="lazy"></a>
        <div class="footer-col">
          <h2>Contact</h2>
          <address><strong>+971 52 923 1755<br>G05, Al Rawdha, Warsan First, Al Warsan First</strong><br>Dubai, United Arab Emirates<br>PO Box 2334 (Dubai)</address>
        </div>
        <div class="footer-col">
          <h2>Social Media</h2>
          <ul class="footer-social">
            <li><a href="http://www.instagram.com/noblesourdough.ae" aria-label="Instagram"><img src="/assets/img/icon-instagram.webp" alt="" width="22" height="22"></a> Instagram</li>
            <li><a href="https://www.linkedin.com/in/matthew-firth-4595501a7/" aria-label="LinkedIn"><img src="/assets/img/icon-linkedin.webp" alt="" width="26" height="22"></a> LinkedIn</li>
          </ul>
        </div>
        <nav class="footer-col" aria-label="Footer">
          <ul class="footer-links">
{links}
          </ul>
        </nav>
      </div>
      <p class="footer-word" aria-hidden="true" data-reveal="rise">Better Bread Everyday</p>
      <div class="footer-bottom">
        <p class="legal">Privacy Policy | Terms &amp; Conditions</p>
        <p class="copyright"><img src="/assets/img/icon-copyright.webp" alt="©" width="14" height="14"> 2026 NOBLE BAKERY FZE. All rights reserved.</p>
      </div>
    </div>
  </footer>"""


# The badges from the live About page, as one slow band.
MARQUEE_WORDS = ["BETTER BREAD EVERYDAY", "FERMENTED 24 HOURS", "NO ADDITIVES, NO PRESERVATIVES",
                 "NO ADDED SUGAR", "PROPER SOURDOUGH", "TOP QUALITY!", "THE NOBLE WAY!"]


def marquee(theme=""):
    sep = '<img src="/assets/img/brand/mark-blue.webp" alt="" width="40" height="40">'
    if theme == "dark":
        sep = sep.replace("mark-blue", "mark-cream")
    run = "".join(f"<span>{w}</span>{sep}" for w in MARQUEE_WORDS)
    return f"""\
  <div class="marquee{' marquee--dark' if theme == 'dark' else ''}" data-marquee>
    <p class="visually-hidden">{', '.join(w.title() for w in MARQUEE_WORDS)}</p>
    <div class="marquee-track" aria-hidden="true">
      <div class="marquee-run">{run}</div>
      <div class="marquee-run">{run}</div>
    </div>
  </div>"""


ALLERGEN_ICONS = {"Gluten": "allergen-gluten", "Sesame": "allergen-sesame"}


def allergen_tags(allergens):
    return "".join(
        f'<li class="tag"><img src="/assets/img/{ALLERGEN_ICONS[a]}.webp" alt="" height="14">{e(a)}</li>'
        for a in allergens
    )


ARROW_LEFT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>'
ARROW_RIGHT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>'
ARROW_UPRIGHT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>'


# -------------------------------------------------------------- the catalogue

def load_catalogue():
    data = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    for group in data["groups"]:
        for cat in group["categories"]:
            for p in cat["products"]:
                p["id"] = product_id(cat["id"], p["name"])
                p["has_photo"] = bool(p.get("photo")) and (PUBLIC / "assets/img/catalogue" / f"{p['id']}.webp").exists()
    return data


def categories(data):
    return [c for g in data["groups"] for c in g["categories"]]


def product_img(p, sizes, cls=""):
    if not p["has_photo"]:
        return (f'<div class="product-placeholder{" " + cls if cls else ""}" role="img" aria-label="{e(p["name"])}">'
                f'<img src="/assets/img/brand/noble-icon-blue.webp" alt="" width="80" height="80" loading="lazy"></div>')
    base = f"/assets/img/catalogue/{p['id']}"
    return (f'<img{" class=" + chr(34) + cls + chr(34) if cls else ""} src="{base}-sm.webp" '
            f'srcset="{base}-sm.webp 480w, {base}.webp 900w" sizes="{sizes}" '
            f'alt="{e(p["name"])}" width="900" height="900" loading="lazy" decoding="async">')


def product_photos(p):
    if not p["has_photo"]:
        return []
    base = f"/assets/img/catalogue/{p['id']}"
    alternate = sorted((PUBLIC / "assets/img/catalogue").glob(f"{p['id']}-view-*.webp"))
    return [f"{base}.webp", *(f"/{photo.relative_to(PUBLIC).as_posix()}" for photo in alternate)]


def catalogue_block(data):
    cats = categories(data)
    total = sum(len(c["products"]) for c in cats)
    chips = ['<button class="chip is-active" type="button" data-filter="all" aria-pressed="true">All '
             f'<span>{total}</span></button>']
    chips += [f'<button class="chip" type="button" data-filter="{c["id"]}" aria-pressed="false">{e(c["label"])} '
              f'<span>{len(c["products"])}</span></button>' for c in cats]
    sections = []
    for group in data["groups"]:
        cat_html = []
        for c in group["categories"]:
            cards = []
            for i, p in enumerate(c["products"]):
                search = " ".join([p["name"], c["name"], c["label"], p["code"],
                                   " ".join(p["allergens"]), p.get("description", "")]).lower()
                cards.append(f"""\
              <article class="product" id="{p['id']}" data-search="{e(search)}" style="--i: {i % 4}" data-reveal="card"
                data-description="{e(p.get('description') or c['description'])}" data-photos="{e(json.dumps(product_photos(p)))}">
                <div class="product-media">{product_img(p, "(max-width: 700px) 46vw, (max-width: 1200px) 30vw, 300px")}</div>
                <div class="product-body">
                  <p class="product-tag">Fully baked</p>
                  <div class="product-head"><h4>{e(p['name'])}</h4><span class="product-weight">{e(p['weight'])}</span></div>
                  <p class="product-meta"><span>{e(p['code'])}</span><span>{e(p['size'])}</span></p>
                  <p class="product-allergens">{e(', '.join(p['allergens']))}</p>
                </div>
                <button class="product-open" type="button" aria-haspopup="dialog" hidden>
                  <span class="visually-hidden">View {e(p['name'])}, {e(c['name'])}</span>
                  <span class="product-open-icon" aria-hidden="true">↗</span>
                </button>
              </article>""")
            cat_html.append(f"""\
          <section class="cat-category" id="{c['id']}" data-category="{c['id']}" aria-labelledby="{c['id']}-title">
            <header class="cat-category-head">
              <h3 id="{c['id']}-title" data-reveal="rise">{e(c['name'])}</h3>
              <p data-reveal="fade">{e(c['description'])}</p>
            </header>
            <div class="product-grid">
{chr(10).join(cards)}
            </div>
          </section>""")
        sections.append(f"""\
        <div class="cat-group" data-group>
          <header class="cat-group-head">
            <p class="eyebrow">{e(group['tagline'])}</p>
            <h2 class="title" data-split>{e(group['name'])}</h2>
          </header>
{chr(10).join(cat_html)}
        </div>""")
    return f"""\
    <div class="cat-toolbar" data-catalogue-toolbar>
      <div class="wrap cat-toolbar-inner">
        <label class="search">
          <span class="visually-hidden">Search the catalogue</span>
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m13 13 5 5" stroke="currentColor" stroke-width="1.5"/></svg>
          <input type="search" placeholder="Search {total} products" data-catalogue-search autocomplete="off">
        </label>
        <div class="chips" role="group" aria-label="Categories">
          {"".join(chips)}
        </div>
        <p class="cat-count" aria-live="polite" data-catalogue-count></p>
      </div>
    </div>
    <div class="wrap cat-body" data-catalogue>
{chr(10).join(sections)}
      <p class="cat-empty" data-catalogue-empty hidden>No products match your search.</p>
    </div>
    <dialog class="product-view" aria-labelledby="product-view-name" data-product-view>
      <div class="product-view-top">
        <p class="eyebrow" data-view-category></p>
        <button type="button" class="view-control" data-view-close aria-label="Close product view" autofocus>×</button>
      </div>
      <div class="product-view-content" data-view-content>
        <div class="product-view-gallery" data-view-gallery>
          <div class="product-view-stage" data-view-stage></div>
          <div class="view-photo-nav" data-view-photos hidden>
            <button type="button" class="view-control" data-view-photo-prev aria-label="Previous photo">‹</button>
            <span aria-live="polite" data-view-photo-count></span>
            <button type="button" class="view-control" data-view-photo-next aria-label="Next photo">›</button>
          </div>
        </div>
        <div class="product-view-copy">
          <p class="product-tag">Fully baked</p>
          <h2 id="product-view-name" aria-live="polite"></h2>
          <p data-view-description></p>
          <dl class="product-view-specs">
            <div><dt>Weight</dt><dd data-view-weight></dd></div>
            <div><dt>Size</dt><dd data-view-size></dd></div>
            <div><dt>Product code</dt><dd data-view-code></dd></div>
            <div><dt>Allergens</dt><dd data-view-allergens></dd></div>
          </dl>
        </div>
      </div>
      <div class="product-view-nav" aria-label="Browse products">
        <button type="button" class="view-control" data-view-prev aria-label="Previous product"><span aria-hidden="true">←</span> Previous</button>
        <span data-view-count></span>
        <button type="button" class="view-control" data-view-next aria-label="Next product">Next <span aria-hidden="true">→</span></button>
      </div>
    </dialog>"""


def categories_block(data):
    cards = []
    for i, c in enumerate(categories(data)):
        cover = next((p for p in c["products"] if p["has_photo"]), None)
        img = product_img(cover, "(max-width: 700px) 60vw, 280px") if cover else ""
        n = len(c["products"])
        cards.append(f"""\
        <a class="cat-card" href="/catalogue#{c['id']}" style="--i: {i}">
          <span class="cat-card-media">{img}</span>
          <span class="cat-card-label"><span>{e(c['label'])}</span><small>{n} product{'s' if n != 1 else ''}</small></span>
        </a>""")
    return f"""\
      <div class="rail" data-rail>
        <div class="rail-track">
{chr(10).join(cards)}
        </div>
        <div class="rail-controls">
          <button class="circle-btn" type="button" data-rail-prev aria-label="Previous categories">{ARROW_LEFT}</button>
          <button class="circle-btn" type="button" data-rail-next aria-label="Next categories">{ARROW_RIGHT}</button>
        </div>
      </div>"""


# ------------------------------------------------------- the sourdough range

def range_block(products, variant="full"):
    data = products
    items = []
    for i, p in enumerate(data["products"]):
        if variant == "teaser":
            items.append(f"""\
        <a class="loaf-tile" href="/{p['id']}" style="--loaf: {p['colors']['page']}; --i: {i}" data-reveal="card">
          <span class="loaf-tile-media"><img src="/assets/img/loaves/{p['id']}-card.webp" alt="" width="900" height="600" loading="lazy" style="view-transition-name: loaf-{p['id']}"></span>
          <span class="loaf-tile-name">{e(p['card_name'].title())}</span>
          <span class="loaf-tile-go" aria-hidden="true">{ARROW_UPRIGHT}</span>
        </a>""")
        else:
            items.append(f"""\
        <article class="range-item" style="--loaf: {p['colors']['page']}">
          <a class="range-media" href="/{p['id']}" tabindex="-1" aria-hidden="true" data-reveal="mask">
            <img src="/assets/img/loaves/{p['id']}-card.webp" alt="" width="900" height="600" loading="lazy" style="view-transition-name: loaf-{p['id']}">
          </a>
          <div class="range-text">
            <p class="range-index" aria-hidden="true">{i + 1:02d} / {len(data['products']):02d}</p>
            <p class="eyebrow">{e(p['specs'][0])}</p>
            <h2 class="range-name" data-split>{e(p['card_name'].title())}</h2>
            <p class="range-desc" data-reveal="fade">[ {e(p['description'])} ]</p>
            <ul class="tags" aria-label="Allergens">{allergen_tags(p['allergens'])}</ul>
            <a class="btn btn--line" href="/{p['id']}"><span>VIEW PRODUCT</span>{ARROW_RIGHT}</a>
          </div>
        </article>""")
    if variant == "teaser":
        return '      <div class="loaf-tiles">\n' + "\n".join(items) + "\n      </div>"
    r = data["range"]
    words = r["heading"].split()  # "The SOURDOUGH Range"
    return f"""\
    <header class="page-hero wrap">
      <p class="eyebrow" data-reveal="fade">{e(data['products'][0]['specs'][0])}</p>
      <h1 class="display" data-split>{e(" ".join(words[:-1]))}<br><span class="accent">{e(words[-1])}</span></h1>
      <p class="lead" data-reveal="fade">{e(r['intro'])}</p>
    </header>
    <div class="wrap range-list">
{chr(10).join(items)}
    </div>"""


def product_page(template, p, data):
    li = lambda items: "\n".join(f"              <li>{e(x)}</li>" for x in items)
    others = [o for o in data["products"] if o["id"] != p["id"]]
    more = "\n".join(
        f'          <a class="more-item" href="/{o["id"]}" style="--loaf: {o["colors"]["page"]}">'
        f'<img src="/assets/img/loaves/{o["id"]}-card.webp" alt="" width="900" height="600" loading="lazy">'
        f'<span>{e(o["page_title"])}</span></a>' for o in others)
    values = {
        "id": p["id"],
        "page_title": e(p["page_title"]),
        "heading": e(p["heading"].title()),  # stored as on the live site (CAPS); shown in title case
        "description": e(p["description"]),
        "ingredients": li(p["ingredients"]),
        "allergens": allergen_tags(p["allergens"]),
        "allergen_list": e(", ".join(p["allergens"])),
        "specs": li(p["specs"]),
        "spec_lines": "".join(f"<li>{e(s)}</li>" for s in p["specs"]),
        "color_loaf": p["colors"]["page"],
        "ingredient_columns": "2",
        "more": more,
    }
    out = re.sub(r"\{\{(\w+)\}\}", lambda m: values[m.group(1)], template)
    leftover = re.findall(r"\{\{\w+\}\}", out)
    if leftover:
        sys.exit(f"Template placeholders not filled for {p['id']}: {leftover}")
    return out


# ------------------------------------------------------------------- the build

MARKER = re.compile(r"(?P<indent>[ \t]*)<!-- build:(?P<name>\w+)(?: (?P<arg>[\w -]+?))? -->\n.*?<!-- /build:(?P=name) -->", re.S)


def fill_blocks(text, products, catalogue, page):
    def repl(m):
        name, arg, indent = m.group("name"), m.group("arg"), m.group("indent")
        args = (arg or "").split()
        if name == "head":
            body = HEAD
        elif name == "header":
            body = header(*args)
        elif name == "footer":
            body = footer()
        elif name == "marquee":
            body = marquee(*args)
        elif name == "categories":
            body = categories_block(catalogue)
        elif name == "catalogue":
            body = catalogue_block(catalogue)
        elif name == "catstats":
            cats = categories(catalogue)
            body = (f'  <div class="cat-stats" data-reveal="fade" style="--i: 2">\n'
                    f'    <div><strong>{sum(len(c["products"]) for c in cats)}</strong><span>Products</span></div>\n'
                    f'    <div><strong>{len(cats)}</strong><span>Categories</span></div>\n  </div>')
        elif name == "range":
            body = range_block(products, *args)
        else:
            sys.exit(f"{page}: unknown block build:{name}")
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
    products = load_products()
    catalogue = load_catalogue()
    template = TEMPLATE.read_text(encoding="utf-8")
    out = {}
    product_paths = set()
    for p in products["products"]:
        path = PUBLIC / p["id"] / "index.html"
        product_paths.add(path)
        out[path] = fill_blocks(product_page(template, p, products), products, catalogue, path)
    for path in sorted(PUBLIC.rglob("*.html")):
        if path not in product_paths:
            out[path] = fill_blocks(path.read_text(encoding="utf-8"), products, catalogue, path)
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
        urls = re.findall(r'\b(?:href|src)="([^"]+)"', text)
        urls += [u.split()[0] for s in re.findall(r'\bsrcset="([^"]+)"', text) for u in s.split(",")]
        urls += re.findall(r'\bposter="([^"]+)"', text)
        for url in urls:
            target = local_target(html.unescape(url.strip()))
            if target is None or target.exists():
                continue
            if url.startswith("/assets/"):
                missing_media.setdefault(url, []).append(page.relative_to(PUBLIC).as_posix())
            else:
                broken.append(f"{page.relative_to(PUBLIC)}: {url}")
    return stale, broken, missing_media


OUTLINE = ROOT / "reference" / "live-site-outline.json"
# Retired copy and superseded sliced loaf dimensions still appear in the production snapshot.
REMOVED_LIVE_COPY = {
    "/": {"catering", "(coming soon)", "honesty counter"},
    "/about": {"honesty counter", "our store", "we have honesty counter"},
    "/sourdough": {"catering", "honesty counter"},
    "/contact": {"catering", "honesty counter"},
    "/classic-loaf": {"product dimension: 12 x 12cm"},
    "/mediterranean-loaf": {"product dimension: 12 x 12cm"},
    "/multigrain-loaf": {"product dimension: 12 x 12cm"},
    "/whole-wheat-loaf": {"product dimension: 12 x 12cm"},
    "/country-bread": {"product dimension: 12 x 12cm"},
}


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
        if live["url"] == "/honesty-counter":
            continue
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
        expected = lines - REMOVED_LIVE_COPY.get(live["url"], set())
        lacking = sorted(line for line in expected if line not in ours)
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
        print(f"Images/videos referenced but not in public/: {len(missing_media)}")
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
