# Niche Hounds

Holding-company site. It is a draft: the words on the pages are placeholders, marked as such in HTML comments. No ventures or people are named. Every page sits on the same space background: stars, a live Earth and the lunar surface. The home page also stands the hound on the moon.

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
| `/about/` | Layout mockup: what we do, three principles, how we work, a call to action. Placeholder copy. |
| `/team/` | Layout mockup: a grid of person cards. Placeholder copy, no names. |
| `/ventures/` | Lists the ventures collection. While none is published it shows mock cards. |
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
| `status` | no | Short stage label shown as a pill, such as `Testing` or `Live`. |

The card links to the venture page. The website button is a separate link (`target="_blank"` and `rel="noopener"`) and does not trigger the card link.

Anything after the front matter is optional Markdown and appears on the venture page under the summary.

## The space background

Every page shares one background, drawn in the browser from files in this repo. Nothing is fetched from a third party, there are no trackers, and the visitor is never asked for their location.

| File | What it does |
| --- | --- |
| `_includes/scene.html` | The background markup: stars, Earth, moon, and the hound on the home page. |
| `_includes/hero.html` | Home page copy. Included when a page sets `hero: true`. |
| `_layouts/default.html` | Page shell. Inner pages show `title` and `lede` from their front matter as the page heading. |
| `assets/js/scene.js` | Lays out the moon, Earth, stars and (on the home page) the hound for the viewport. |
| `assets/js/moon.js` | Draws the lunar surface as SVG: a curved horizon, regolith relief from an SVG lighting filter, shaded craters and small rocks, lit low from the right. |
| `assets/img/niche-hounds-hound.svg` | The hound from the mark, as a still image. |
| `assets/js/earth.js` | Draws Earth into a canvas with live day and night. |
| `assets/js/astro.js` | Sun position and location from the time zone. |

The background is fixed to the viewport, so inner-page content scrolls over it in translucent panels (`.panel`). On inner pages the horizon sits lower and Earth moves up to the top right.

**Earth** is the only live part. It is centred on the visitor's approximate location, taken only from the browser's time zone (`Intl`, via a lookup table; no Geolocation API, no IP lookup), with the real day/night terminator and city lights. It refreshes once a minute.

**Moon and hound** are still. The horizon is the top of a small sphere, cresting right of centre; a phone sees a narrower slice of the same curve.

**Earth imagery** in `assets/img/earth/` is public domain, from Wikimedia Commons: `day.jpg` (NASA Blue Marble Next Generation, `File:World.topo.2004-09.png`), `night.jpg` (NASA Earth at Night 2012, `File:The earth at night.jpg`), `clouds.jpg` (Tom Patterson's Fair Weather Cloud Map from NASA data, `File:Fair Weather Cloud Map.jpg`).

### Preview parameters

These only change what the page shows for that visit:

- `?at=2026-11-24T12:00` sets the clock for Earth (local time in the visitor's or `tz`'s zone).
- `?tz=Asia/Tokyo` previews another time zone; `?lat=40.7&lon=-74` sets a location directly.

## Deploy

`.github/workflows/pages.yml` builds the site with Jekyll and deploys it with `actions/deploy-pages` on every push to `main`.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** if the workflow cannot enable that itself. Do not set a custom domain on this repository yet.
