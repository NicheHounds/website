# Niche Hounds

Holding-company site. It is a draft: the words on the pages are placeholders, marked as such in HTML comments. No ventures or people are named.

Until a custom domain is attached, GitHub Pages serves it at `https://nichehounds.github.io/website/`.

## Local preview

```sh
bundle install
bundle exec jekyll serve
```

Open `http://127.0.0.1:4000/website/`. The `baseurl` in `_config.yml` is `/website`, so asset and page links match the project-site path.

Jekyll 4.3.4 is pinned in the `Gemfile`. Ruby is any 3.2 patch (`~> 3.2.0`). GitHub Actions installs the newest 3.2.x the runner provides (3.2.11 on the current image).

## Custom domain later

Set `baseurl` to `""` in `_config.yml`. Internal links use the `relative_url` filter, so that is the only change. Do not add a CNAME here; the domain is attached separately.

## Pages

| Path | What it is |
| --- | --- |
| `/` | Home: the hero (placeholder copy). |
| `/about/` | Placeholder. |
| `/team/` | Placeholder. No names. |
| `/ventures/` | Lists the ventures collection. |
| `/ventures/<slug>/` | One venture, from one Markdown file. |

The contact address `roger@nichehounds.com` is in the footer.

## Adding a venture

Create `_ventures/<slug>.md`. That single file is the venture. It is published at `/ventures/<slug>/` and listed on `/ventures/`. `_ventures/example.md` is a template with `published: false`, so it is not part of the site.

Front matter:

| Field | Required | What it does |
| --- | --- | --- |
| `title` | yes | Name. Shown on the card and as the page heading. |
| `logo` | no | Site path such as `/assets/img/ventures/mark.svg`, or an absolute `https://` URL. Square or wide. Fitted inside a fixed box with `object-fit: contain` — not cropped, not stretched. |
| `logo_alt` | no | Alt text for the logo. Leave empty if the name beside it is enough. |
| `description` | yes | Short plain-text summary. Used on the card and at the top of the page. |
| `website_url` | no | The venture's own site. The button is omitted when this is empty. |
| `button_label` | no | Label for that button. Defaults to `Visit site`. |

The card links to the venture page. The website button is a separate link (`target="_blank"` and `rel="noopener"`) and does not trigger the card link.

Anything after the front matter is optional Markdown and appears on the venture page under the summary.

## The home hero

The hero is the logo come to life: the hound on a cratered moon, two stars, and Earth. All of it runs in the browser from files in this repo. Nothing is fetched from a third party, there are no trackers, and the visitor is never asked for their location.

| File | What it does |
| --- | --- |
| `_includes/hero.html` | Hero markup and copy. Included by `index.html` (`hero: true`). |
| `assets/js/hero.js` | Lays out the scene for the viewport and starts each part. |
| `assets/js/hound.js` | Poses and animates the hound. |
| `assets/js/hound-rig.js` | The logo's hound artwork cut at its joints. Generated; see below. |
| `assets/js/earth.js` | Draws Earth into a canvas with live day and night. |
| `assets/js/moon.js` | Draws the curved, cratered lunar surface and its light. |
| `assets/js/astro.js` | Sun position, moon phase, and location from the time zone. |

**Location.** Approximate latitude and longitude come only from the browser's time zone (`Intl`), via a lookup table of time zones. No Geolocation API, no IP lookup.

**Earth.** Centred on that location, with the real day/night terminator for the current time and city lights on the night side. It refreshes once a minute.

**Moon.** The lit share of the surface is the moon's real illuminated fraction right now, lit from the right while waxing and from the left while waning (mirrored south of the equator). Crater shadows lengthen toward the terminator. The colour of the light follows the visitor's local time of day: warm at dawn and dusk, cool at night. At new moon the surface is lit only by earthshine.

**Hound.** The hound is the mark's own artwork, cut into head, neck, torso, tail and jointed legs, and posed by turning those pieces. After about 9 s without pointer, touch, key, wheel or scroll activity it sits, after about 22 s it lies down, and after about 40 s it sleeps. Any activity wakes it to standing. It breathes, blinks and wags while awake. With `prefers-reduced-motion`, poses change without animation and the breathing, wagging, blinking and star twinkle are off.

**Earth imagery** in `assets/img/earth/` is NASA, public domain (U.S. government work): `day.jpg` (Blue Marble land, ocean and ice), `night.jpg` (City Lights 2012), `clouds.jpg` (Blue Marble clouds).

### Preview parameters

These only change what the page shows for that visit:

- `?at=2026-11-24T12:00` sets the clock (local time in the visitor's or `tz`'s zone).
- `?tz=Asia/Tokyo` previews another time zone; `?lat=40.7&lon=-74` sets a location directly.
- `?dog=sitting` holds a pose: `standing`, `sitting`, `lying` or `sleeping`.
- `?idle=10` makes the idle timers 10× faster.

### Regenerating the hound rig

Only needed if the mark's artwork changes. From the repo root, with Node + Playwright and Python (`numpy scipy pillow potracer`):

```sh
node tools/hound-rig/render.js
python3 tools/hound-rig/build.py
```

`tools/hound-rig/pieces.json` holds the cut lines, joint pivots and joint overlaps, in the coordinates of the 3200 px render.

## Deploy

`.github/workflows/pages.yml` builds the site with Jekyll and deploys it with `actions/deploy-pages` on every push to `main`.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** if the workflow cannot enable that itself. Do not set a custom domain on this repository yet.
