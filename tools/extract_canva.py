#!/usr/bin/env python3
"""Read a saved copy of the live Canva site and write an outline of every page.

The live site (noblesourdough.com) is published from Canva. Each page's HTML
carries the whole site as a JSON blob (window['bootstrap']). This script decodes
that blob and writes reference/live-site-outline.json: every page, its
sections in order, and every element in each section with its position, text,
font, colour, link and image or video file.

It only reads. It is how the content in content/ and public/ was checked
against the live site, and it can be re-run to spot changes made in Canva.

Usage:
    curl -sSL https://noblesourdough.com/ -o /some/where/index.html
    python3 tools/extract_canva.py /some/where/index.html
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "reference" / "live-site-outline.json"

# Page URLs as listed in https://noblesourdough.com/sitemap.xml, by Canva page title.
SLUGS = {
    "Noble Sourdough | Better Bread Everyday": "",
    "About": "about",
    "Classic Loaf": "classic-loaf",
    "Mediterranean Loaf": "mediterranean-loaf",
    "Multigrain Loaf": "multigrain-loaf",
    "Country Bread": "country-bread",
    "Whole Wheat Loaf": "whole-wheat-loaf",
    "Sourdough": "sourdough",
    "Honesty Counter": "honesty-counter",
    "Contact": "contact",
}


def load_bootstrap(html_path):
    s = Path(html_path).read_text(encoding="utf-8")
    m = re.search(r"window\['bootstrap'\] = JSON\.parse\('(.*?)'\);", s, flags=re.S)
    if not m:
        sys.exit("No Canva bootstrap data found in that file.")

    def unescape(mm):
        c = mm.group(1)
        if c[0] in "xu":
            return chr(int(c[1:], 16))
        return {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "0": "\0"}.get(c, c)

    return json.loads(re.sub(r"\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)", unescape, m.group(1)))


def build_tables(page_data):
    fonts = {}
    for f in page_data.get("B", []):
        fonts[f"{f['A']},{f['B']}"] = f["C"]
        fonts.setdefault(f["A"], f["C"])
    media = {}
    for m in page_data.get("E", []):
        for file in m.get("files", []):
            best = media.get(m["id"])
            if not best or file["width"] > best["width"]:
                media[m["id"]] = {"url": file["url"], "width": file["width"], "height": file["height"]}
    video = {}
    for v in page_data.get("F", []):
        files = v.get("files", [])
        if files:
            f = max(files, key=lambda x: x.get("width", 0))
            video[v["id"]] = {"url": f["url"], "width": f.get("width"), "height": f.get("height")}
    return fonts, media, video


def r(x):
    return round(x, 1) if isinstance(x, (int, float)) else x


def fill_ref(fill):
    """Return a media/video/colour description from a Canva fill object."""
    out = {}
    if not isinstance(fill, dict):
        return out
    src = fill.get("B", {}).get("A") if isinstance(fill.get("B"), dict) else None
    if isinstance(src, dict) and src.get("A"):
        out["media_id"] = src["A"]
    vid = fill.get("I")
    if isinstance(vid, dict) and vid.get("A"):  # video fill
        out["media_id"] = vid["A"]
    if isinstance(fill.get("C"), str) and fill["C"].startswith("#"):
        out["color"] = fill["C"]
    return out


def text_runs(el, fonts):
    a = el.get("a", {})
    text = "".join(part.get("A", "") for part in a.get("A", []) if isinstance(part.get("A"), str))
    styles, pos = [], 0
    current = None
    for span in a.get("B", []):
        if span.get("A?") == "A" and isinstance(span.get("A"), dict):
            current = {k: v.get("B") for k, v in span["A"].items() if isinstance(v, dict)}
        elif span.get("A?") == "B" and current is not None:
            n = span["A"]
            chunk = text[pos:pos + n]
            pos += n
            st = {
                "text": chunk,
                "font": fonts.get(current.get("font-family", ""), current.get("font-family")),
                "size": current.get("font-size"),
                "weight": current.get("font-weight"),
                "style": current.get("font-style"),
                "color": current.get("color"),
                "align": current.get("text-align"),
                "tracking": current.get("tracking"),
                "leading": current.get("leading"),
                "transform": current.get("text-transform"),
                "decoration": current.get("decoration"),
                "link": current.get("link"),
            }
            styles.append({k: v for k, v in st.items() if v not in (None, "", "none", "normal")})
    return text, [s for s in styles if s.get("text", "").strip()]


def element(el, fonts, media, video):
    t = el.get("A?")
    # Canva stores top (A), left (B), width (D), height (C), in px of a 1366px-wide canvas.
    box = {"top": r(el.get("A")), "left": r(el.get("B")), "w": r(el.get("D")), "h": r(el.get("C"))}
    if el.get("E"):
        box["rotate"] = r(el["E"])
    out = {"kind": {"K": "text", "I": "image", "J": "shape", "H": "group", "U": "line"}.get(t, t), **box}
    if el.get("G"):
        out["link"] = el["G"]
    if t == "K":
        out["text"], out["runs"] = text_runs(el, fonts)
    elif t == "I":
        ref = fill_ref(el.get("a", {}))
        mid = ref.get("media_id")
        if mid in media:
            out["image"] = media[mid]
        elif mid in video:
            out["video"] = video[mid]
        elif mid:
            out["media_id"] = mid
    elif t == "J":
        fills = []
        for path in el.get("b", []) or []:
            ref = fill_ref(path.get("B", {}))
            mid = ref.pop("media_id", None)
            if mid in media:
                ref["image"] = media[mid]
            elif mid in video:
                ref["video"] = video[mid]
            elif mid:
                ref["media_id"] = mid
            ref["path"] = path.get("A")
            fills.append(ref)
        out["fills"] = fills
        # Buttons: a shape can carry its own text (and the link sits on that text).
        for ch in el.get("f", []) or []:
            if isinstance(ch, dict) and isinstance(ch.get("A"), dict):
                label, runs = text_runs({"a": ch["A"]}, fonts)
                if label.strip():
                    out["label"], out["runs"] = label, runs
                    link = next((x["link"] for x in runs if x.get("link")), None)
                    if link and not out.get("link"):
                        out["link"] = link
    elif t == "H":
        out["children"] = [element(c, fonts, media, video) for c in el.get("c", []) if isinstance(c, dict)]
    elif t == "U":
        if el.get("d"):
            out["color"] = el["d"]
    return out


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    data = load_bootstrap(sys.argv[1])
    page_data = data["page"]
    fonts, media, video = build_tables(page_data)
    pages = []
    for p in page_data["A"]["A"]:
        if p.get("R"):  # hidden page in Canva: not published
            continue
        sections = []
        for sec in p.get("t", []):
            size = sec.get("C", {})
            sections.append({
                "width": size.get("A"),
                "height": size.get("B"),
                "background": sec.get("D", {}).get("C"),
                "elements": [element(e, fonts, media, video) for e in sec.get("E", [])],
            })
        pages.append({
            "title": p["B"],
            "canva_index": p.get("P"),
            "url": "/" + SLUGS.get(p["B"], "?"),
            "sections": sections,
        })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "https://noblesourdough.com/ (Canva Websites)",
        "fonts_used": sorted(set(fonts.values())),
        "pages": pages,
    }, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(pages)} pages, "
          f"{sum(len(p['sections']) for p in pages)} sections")


if __name__ == "__main__":
    main()
