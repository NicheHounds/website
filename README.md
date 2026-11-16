# Niche Hounds

Holding-company site. It is one page: a hero, then About, Ventures and Team, on a fixed space background of stars, a live Earth and the lunar surface, with the hound standing on the moon. The About section and the Ventures intro line are still placeholder copy, marked as such in HTML comments.

It is served at `https://nichehounds.com/`. GitHub's own address for it, `https://nichehounds.github.io/website/`, redirects there.

## Local preview

```sh
bundle install
bundle exec jekyll serve
```

If your Ruby is newer than 3.2, Bundler refuses to start. Jekyll installed as a plain gem still works if you tell it to skip Bundler:

```sh
JEKYLL_NO_BUNDLER_REQUIRE=true jekyll serve
```

Open `http://127.0.0.1:4000/`.

Jekyll 4.3.4 is pinned in the `Gemfile`. Ruby is any 3.2 patch (`~> 3.2.0`). GitHub Actions installs the newest 3.2.x the runner provides (3.2.11 on the current image).

## Custom domain

`nichehounds.com` is attached in three places:

- **`_config.yml`**: `url` is `https://nichehounds.com` and `baseurl` is `""`. Internal links use the `relative_url` filter, so nothing else in the templates refers to the address.
- **GitHub**: repository **Settings → Pages → Custom domain** is `nichehounds.com`, with **Enforce HTTPS** on. The domain should also be verified under the organization's **Settings → Pages**. There is no `CNAME` file: the Actions deploy ignores one and uses the setting.
- **DNS** (Squarespace Domains): four `A` records for `@` to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`; four `AAAA` records for `@` to `2606:50c0:8000::153` through `2606:50c0:8003::153`; and a `CNAME` for `www` to `nichehounds.github.io`. The Google Workspace records for email sit alongside these and must stay.

To move the site back to GitHub's address, remove the custom domain in Settings and set `url` to `https://nichehounds.github.io` and `baseurl` to `/website` in the same push.

## The page

The home page (`index.html`) is the site. It is the hero, then three sections, each from its own include:

| Section | Anchor | File | What it is |
| --- | --- | --- | --- |
| Hero | `#top` | `_includes/hero.html` | Tagline and a **Learn more** button that scrolls to About. |
| About | `#about` | `_includes/sections/about.html` | What we do, three principles, how we work. Not in the nav for now. |
| Ventures | `#ventures` | `_includes/sections/ventures.html` | One card per file in `_ventures/`, with a coloured status pill. |
| Team | `#team` | `_includes/sections/team.html` | One card per person, each with Email and LinkedIn buttons. |

The nav (Home, Ventures, Team) is pinned to the top and frosts once content scrolls under it. Every nav link, the logo and the hero button scroll smoothly to their section; the underline follows the section being read. Sections below the fold fade in as they arrive. Visitors who ask their system for reduced motion get instant jumps and no fades.

**Editing the team:** the people are in `_data/team.yml`: names, roles, headshots, the Email address and LinkedIn URL behind each card's buttons, and bios. Headshots live in `assets/img/team/` (square, 400×400 is plenty). The comment at the top of that file explains each field.

**Old addresses** still work. `/about/`, `/team/` and `/ventures/` are small pages using `_layouts/redirect.html` that send visitors on to `/#about`, `/#team` and `/#ventures`. To redirect another address, add a page with `layout: redirect`, a `permalink`, and `redirect_to` set to where it should go.

There is no site-wide contact address; each team card has its own Email and LinkedIn buttons.

| Path | What it is |
| --- | --- |
| `/` | The whole site. |
| `/ventures/<slug>/` | One venture, from one Markdown file. |
| `/about/`, `/team/`, `/ventures/` | Redirects to their section of the home page. |

## Adding a venture

Create `_ventures/<slug>.md`. That single file is the venture. It is published at `/ventures/<slug>/` and listed in the Ventures section of the home page. `_ventures/example.md` is a template with `published: false`, so it is not part of the site.

Front matter:

| Field | Required | What it does |
| --- | --- | --- |
| `title` | yes | Name. Shown on the card and as the page heading. |
| `logo` | no | Site path such as `/assets/img/ventures/mark.svg`, or an absolute `https://` URL. Logos live in `assets/img/ventures/`. Square or wide. Fitted inside a fixed box with a margin: not cropped, not stretched. |
| `logo_fill` | no | `true` for a square, app-icon logo with its own background: it fills the box edge to edge instead. |
| `initials` | no | Two or three letters shown in the box when there is no `logo`, such as `TH`. With neither, the box is an empty dashed square. |
| `logo_alt` | no | Alt text for the logo. Leave empty if the name beside it is enough. |
| `description` | yes | Short plain-text summary. Used on the card and at the top of the page. |
| `website_url` | no | The venture's own site. The button is omitted when this is empty. |
| `button_label` | no | Label for that button. Defaults to `Visit site`. |
| `status` | no | One of `Live`, `Beta`, `Stealth` or `Retired`, spelled exactly so. Shown as a coloured pill (see below). |

**Statuses.** These four are the standard. Each shows as a pill on the card and on the venture page, from `_includes/status-pill.html`; the colours are the `.pill--*` rules in `assets/css/site.css`.

| Status | Pill |
| --- | --- |
| `Live` | Green |
| `Beta` | Yellow |
| `Stealth` | Blue |
| `Retired` | Grey |

Any other status shows in grey. The Ventures section orders cards Live, Beta, Stealth, Retired, then A to Z by title; other statuses go last.

The card links to the venture page. The website button is a separate link (`target="_blank"` and `rel="noopener"`) and does not trigger the card link.

Anything after the front matter is optional Markdown and appears on the venture page under the summary.

## The space background

Every page shares one background, drawn in the browser from files in this repo. Nothing is fetched from a third party, there are no trackers, and the visitor is never asked for their location.

| File | What it does |
| --- | --- |
| `_includes/scene.html` | The background markup: stars, Earth, moon, and the hound on the home page. |
| `_includes/hero.html` | Home page copy. Included when a page sets `hero: true`. |
| `_layouts/default.html` | Page shell. A page with `show_title: true` shows its `title` and `lede` as the page heading. |
| `assets/js/scene.js` | Lays out the moon, Earth, stars and (on the home page) the hound for the viewport. |
| `assets/js/site.js` | The nav: phone menu, pinned-header frosting, smooth scrolling, which link is current. Also the section fade-ins. |
| `assets/js/moon.js` | Draws the lunar surface as SVG: a real Apollo photograph of the ground, cut to a gently curved horizon. |
| `assets/img/moon/regolith.jpg` | The ground photograph. |
| `assets/img/niche-hounds-hound.svg` | The hound from the mark, as a still image. |
| `assets/js/earth.js` | Draws Earth into a canvas with live day and night. |
| `assets/js/astro.js` | Sun position and location from the time zone. |

The background is fixed to the viewport, so content scrolls over it in translucent panels (`.panel`). Earth and the horizon sit in the same place on every page and depend only on the window size, so nothing moves when you go from page to page. The hound is drawn a darker grey than the logo's cream so it does not glow through the panels scrolling over it.

**Earth** is the only live part. It is centred on the visitor's approximate location, taken only from the browser's time zone (`Intl`, via a lookup table; no Geolocation API, no IP lookup), with the real day/night terminator and city lights. It refreshes once a minute.

**Moon and hound** are still. The horizon is the top of a small sphere, cresting right of centre; a phone sees a narrower slice of the same curve.

**Moon imagery** in `assets/img/moon/regolith.jpg` is a crop of an Apollo 17 surface panorama at full resolution (NASA, public domain; NASA Image Library `jsc2004e52775`), converted to neutral grey, with the camera's réseau crosshairs removed.

**Earth imagery** in `assets/img/earth/` is public domain, from Wikimedia Commons: `day.jpg` (NASA Blue Marble Next Generation, `File:World.topo.2004-09.png`), `night.jpg` (NASA Earth at Night 2012, `File:The earth at night.jpg`), `clouds.jpg` (Tom Patterson's Fair Weather Cloud Map from NASA data, `File:Fair Weather Cloud Map.jpg`).

### Preview parameters

These only change what the page shows for that visit:

- `?at=2026-11-24T12:00` sets the clock for Earth (local time in the visitor's or `tz`'s zone).
- `?tz=Asia/Tokyo` previews another time zone; `?lat=40.7&lon=-74` sets a location directly.

## Deploy

`.github/workflows/pages.yml` builds the site with Jekyll and deploys it with `actions/deploy-pages` on every push to `main`.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** if the workflow cannot enable that itself. Do not set a custom domain on this repository yet.
