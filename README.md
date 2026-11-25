# Noble Sourdough website

The code version of [noblesourdough.com](https://noblesourdough.com/).

**Status: in progress, not live.** The live site is still the Canva website.
Nothing here is published, and nothing here changes the live site, until the
owner approves the switch (Phase 6 below).

`public/` is the whole site: plain HTML, one CSS file, images. There is no
framework and nothing to install except Python 3 (already on macOS).

## Preview it on your computer

```bash
cd "/Users/charlestarampi/Desktop/Noble Code/noble-sourdough"
python3 tools/build.py
python3 -m http.server 8090 --directory public
```

Then open <http://localhost:8090>. Stop the server with Ctrl+C.

## Where things are

```
public/                     what gets published
  index.html                home            (noblesourdough.com/)
  about/index.html          /about
  sourdough/index.html      /sourdough      (range cards are built, see below)
  honesty-counter/index.html  /honesty-counter
  contact/index.html        /contact
  <loaf-id>/index.html      the five loaf pages: BUILT, do not edit by hand
  assets/css/site.css       all styling
  assets/img/, assets/video/  images and video (Phase 2)
content/products.json       the five loaves: names, descriptions, ingredients,
                            allergens, specs, colours
templates/product.html      layout of a loaf page
tools/build.py              builds loaf pages and shared blocks; checks the site
tools/extract_canva.py      reads the live Canva site into reference/
reference/
  live-site-outline.json    every page, section, text, link and image on the
                            live site (2026-11-25), used to check this copy
  media-map.json            which live image each local image comes from
```

Each page lives in its own folder so the addresses stay exactly as they are
on the live site (`/about`, `/classic-loaf`, ...).

## Editing

- **Loaf details** (name, description, ingredients, allergens, weight, colours):
  edit `content/products.json`, then run `python3 tools/build.py`. That rewrites
  the five loaf pages and the cards on `/sourdough`.
- **Header/menu, footer, fonts**: these are the same on every page and
  live in `tools/build.py` (`NAV_ITEMS`, `header()`, `FOOTER`, `HEAD`). Edit there and
  run the build. In the pages they sit between `<!-- build:... -->` markers;
  anything typed between those markers is overwritten.
- **Everything else** (page text, sections, layout): edit the page in `public/`
  directly.

Before proposing any change, run:

```bash
python3 tools/build.py --check
```

It changes nothing and fails if:
- a page is out of date (the build was not run),
- an internal link points nowhere,
- any line of text from the live site is missing from the matching page
  (words must match exactly; capitals are ignored, because the new design uses
  normal case where the live site uses ALL CAPS headings).

It also lists images that are not in `public/` yet.

To compare again with the live site after it changes in Canva:

```bash
curl -sSL https://noblesourdough.com/ -o /tmp/noble-live.html
python3 tools/extract_canva.py /tmp/noble-live.html
git diff reference/
```

## Branches and publishing

- `main`: approved work only. Once hosting is set up (Phase 5), whatever is on
  `main` may be published, so never push straight to it.
- `dev`: day-to-day work. Merge into `main` only after the owner has checked it
  in the local preview.

Nothing has been pushed to GitHub yet.

## Plan

1. **Set up** (this branch): layout, build script, all live text copied in. Done.
2. **Images**: done (2026-11-25). Taken from the live site at its largest size
   (`reference/media-map.json`, `canva_media` in `products.json`), converted to
   WebP and sized for where they show (63 MB down to 2.8 MB). Notes:
   - Canva stores icons as a picture half plus a transparency-mask half; they
     were rebuilt as transparent icons and coloured for the new design (blue on
     light areas, white on dark ones).
   - Canva's own on-page crop was applied to the logo and the Honesty Counter
     step icons, so they show the same part as on the live site.
   - Every photo has descriptive `alt` text; the six About badges carry their
     words ("No added sugar", ...), loaf panels say "Nutrition facts table".
   - **The About video is 19 MB** (as served by Canva). Compress it before going
     live (needs a video tool such as ffmpeg); it plays fine locally.
   - Originals exported from Canva would be sharper for the icons and logo;
     drop them in under the same names if wanted.
3. **Design** (replaces "match the live look", at the owner's request): restyled
   after a reference design. See "Design" below. Done; to review once photos are in.
4. **Fixes**: only those the owner approves (list below).
5. **Hosting**: GitHub Pages recommended, with owner approval.
6. **Go live**: test on the temporary address, then change only the website DNS
   records at GoDaddy. **Leave the email (MX) records alone**: email runs on
   Microsoft 365. Keep the Canva site as a fallback for a few weeks.

## Kept exactly as on the live site (owner to decide)

These are on noblesourdough.com today. They have been copied as they are and
will only be changed with the owner's approval:

- WhatsApp link `https://wa.me/529231755` has no 971 country code, so it does
  not reach +971 52 923 1755 (About page, "TALK TO MATTHEW?").
- Contact page: the email icon opens `info@noblesourdough.com` but the address
  shown under it is `orders@noblesourdough.com`.
- "Privacy Policy | Terms & Conditions" is plain text; no such pages exist.
- "sundried tomatos" (Mediterranean).
- The same loaf is "Multigrain Loaf" (page title, range card) and
  "MULTISEED LOAF" (its own page heading).
- Classic Loaf lists both "Purified Water" and "Water"; Multigrain lists "White
  Wheat Flour" twice.
- Classic and Multigrain list "Yeast" in a sourdough loaf. Worth confirming.
- Whole Wheat Loaf's ingredients are word for word the same as Country Bread's
  (Flour, Rye Flour, Water, Salt, Yeast, Malt, Starter), which looks like a
  copy-paste in Canva.
- CATERING appears in the menu but has no page ("coming soon").
- The home page menu has no CONTACT link (other pages do).
- No `robots.txt`; no page description for search results or link previews.

## Design

The layout and components follow a reference the owner chose (Pinterest pin
647040671497005259: the Garvin Promotion Group corporate site on Behance). Only
its design language is used; no text or images from it.

- Large, light two-tone headlines: grey words with the key words in Noble blue.
- Pill buttons with a dot ("• ORDER HERE!") next to a dot text link.
- Rounded full-width blue panels (Home photos, About "Why", Honesty Counter).
- The Sourdough range as a card slider: "01 /05" counter, round arrows, thin
  dividers, a small mono label over each title, allergens as outlined tags.
- One header on every page (logo left, menu right, CONTACT as the pill).
  On phones the menu opens from a round button.

Kept from Noble: every word, the logo, the blues/cream/yellow, each loaf's own
colour (title and label accents), all images and all links.

Changed on purpose, for the owner to confirm:
- Headings in normal case instead of ALL CAPS (same words).
- Loaf pages now have the full header; their back button is a round arrow.
- The home page menu now includes CONTACT, and "(COMING SOON)" is shown next
  to CATERING on every page.
- The home page shows the site title "Noble Sourdough / Better Bread Everyday"
  as its headline (the live home page has no visible headline). The two buttons
  are existing labels: "ORDER HERE!" (jumps to the Kibsons/Amazon links) and
  "The SOURDOUGH Range".
- Range cards show "Net Weight: 450G" as their label and allergen names as tags.

`public/assets/js/site.js` adds the slider arrows/counter and the phone menu.
Without it, the menu is shown and the range scrolls sideways.

## Fonts

The new design uses **Inter** for headlines and text and **Roboto Mono** for
small labels. Both are free (Google Fonts) and both are already used on the live
site. The live site's third font, Gotham, a paid font licensed to Canva, is no
longer needed.
