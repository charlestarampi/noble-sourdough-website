# Noble Sourdough website

The code version of [noblesourdough.com](https://noblesourdough.com/).

**Status: in progress, not live.** The live site is still the Canva website.
Nothing here is published, and nothing here changes the live site, until the
owner approves the switch.

`public/` is the whole site: plain HTML, one CSS file, one small script,
images and video. No framework; nothing to install except Python 3.

## Preview it on your computer

```bash
cd "/Users/charlestarampi/Desktop/Noble Code/noble-sourdough"
python3 tools/build.py
python3 -m http.server 8090 --directory public
```

Then open <http://localhost:8090>. Stop the server with Ctrl+C.

## Where things are

```
public/                         what gets published
  index.html                    home
  catalogue/index.html          B2B catalogue (built from content/catalogue.json)
  sourdough/index.html          the Sourdough range (built)
  about/ contact/
  <loaf-id>/index.html          the five loaf pages: BUILT, do not edit by hand
  assets/css/site.css           all styling and motion
  assets/js/site.js             reveals, parallax, header, menu, catalogue filters, reels
  assets/img/ video/ fonts/     web-ready media (made by tools/media.py)
content/
  products.json                 the five loaves (live-site data)
  catalogue.json                the 71-product B2B catalogue
  catalogue/ images/ logos/ fonts/ videos/   RAW assets: local only, not in Git
design/  database/              brand guide, designs, references, catalogue PDF: local only
templates/product.html          layout of a loaf page
tools/build.py                  builds pages and shared blocks; --check guards the site
tools/media.py                  raw assets -> web-ready images, logos, favicons, fonts
tools/extract_canva.py          reads the live Canva site into reference/
reference/                      snapshot of the live site, used by --check
```

## Editing

- **Catalogue products**: edit `content/catalogue.json` (name, code, weight,
  size, allergens, photo). New photos go in `content/catalogue/`; then run
  `python3 tools/media.py` and `python3 tools/build.py`.
- **The five loaves**: edit `content/products.json`, then run the build.
- **Header, footer, marquee words, fonts**: in `tools/build.py` (`NAV_ITEMS`,
  `header()`, `footer()`, `MARQUEE_WORDS`, `HEAD`). In the pages they sit between
  `<!-- build:... -->` markers; anything typed between markers is overwritten.
- **Everything else** (page text, sections): edit the page in `public/` directly.
- **Logos, bakery photos, fonts**: replace the file in `content/`, run `tools/media.py`.

Before proposing any change:

```bash
python3 tools/build.py --check
```

It changes nothing and fails if a page is out of date, an internal link or
image is missing, or any line of text from the live site has gone missing from
its page (words must match; capitals are ignored).

## Design

Built from the owner's assets (`design/`):

- **Brand guidelines** (Jan 2026): Aboreto for headlines, Gotham for text,
  Noble Royal `#093fa4`, Duke `#002e89`, Navy `#00163a`, Cream `#fcf5e6`,
  Off-white `#f2f1eb`, Dark `#1d1b1a`; the hat-and-monocle logomark as the
  pattern; a "quietly confident", never flashy tone.
- **References**: RF-001 (editorial product photography with small type:
  loaf pages), RF-002 (menu typography "NAME / weight / [description]": catalogue
  cards and the Sourdough range).
- **Desktop/mobile designs**: DD-001 and MD-001..003 (outlined catalogue cards,
  category cards, search + chips): the Catalogue page and home category rail.

**Motion** (all of it switches off when the visitor has "reduce motion" on):
headlines rise word by word; images open with a slow wipe and settle from a
slight zoom; statements fill in as you scroll; gentle parallax on photos and
the pattern; a slow marquee of the brand promises; the header tucks away while
scrolling down and returns on the way up; the phone menu opens as a full-screen
panel; catalogue cards ease in when filtering; pages cross-fade and loaf photos
glide between the range and the loaf page (browsers with View Transitions).

**Pages**: Home, Catalogue, Sourdough, five loaf pages, About and Contact.

## Assets and what is kept out of Git

The GitHub repo is public. `.gitignore` keeps these on this Mac only:
`design/` (includes the brand guide marked "Confidential / for internal use
only"), `database/`, and the raw `content/catalogue|images|logos|fonts|videos`
(2.2 GB; GitHub also refuses files over 100 MB). Only the web-ready copies in
`public/assets/` are committed.

**Videos**: the three reels were cut from 4K originals to 720x1280 at about
1.8 Mbps (8.5 MB, 15 MB, 35 MB) with a small macOS AVFoundation transcoder, and
load only when someone presses play. The About video was re-encoded the same
way (20 MB to 13 MB).

## Fonts

- **Aboreto**: free (SIL Open Font License); self-hosted, committed.
- **Gotham**: a paid font. It is used for local preview from
  `public/assets/fonts/gotham/` but is **not committed**. Before going live,
  confirm the brand's Gotham licence covers web use (self-hosting), then remove
  that line from `.gitignore`. Without it, text falls back to Helvetica/Arial.

## Branches and publishing

- `main`: approved work only. Once hosting is set up, `main` may publish.
- `dev`: day-to-day work.

Nothing has been pushed to GitHub yet.

## Open items

- **Catalogue data to confirm** (from the PDF, kept as printed): Signature
  Seasoned Baguette shares code SB12000036 with Whole Wheat Baguette; Pistachio
  Mario Bread's code has an extra digit (AB110000010); Granary sliced bread's code
  (SD82247645) and 1600g differ from the other sliced breads. Photos matched by a
  different name are marked `photo_note` in `catalogue.json` (e.g. French Butter
  croissant uses "Plain Croissant"; Vanilla cinnamon roll uses "Classic Cinnamon
  Roll"). Saffron & Dates and the two Potato buns have no photo yet.
- **Live-site issues kept as they are** (owner to decide):
  - WhatsApp link `https://wa.me/529231755` has no 971 country code.
  - Contact: the email icon opens info@ but the address shown is orders@.
  - "Privacy Policy | Terms & Conditions" is plain text; no such pages exist.
  - "sundried tomatos"; "Multigrain" vs "MULTISEED"; duplicated ingredients in
    Classic and Multigrain; Whole Wheat's ingredients copy Country Bread's.
- **Gotham web licence** (above).
- **Hosting and go-live**: GitHub Pages recommended; change only the website DNS
  records at GoDaddy and leave the email (MX) records alone (Microsoft 365).
