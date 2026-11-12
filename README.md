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
| `assets/js/hero.js` | Lays out the sky and Earth, then starts the 3D scene, or the illustrated version when WebGL2 is unavailable. |
| `assets/js/hero3d.js` | Runs the 3D scene: camera, light, the logo-to-3D handover, the frame loop. |
| `assets/js/scene3d.js`, `lunar.js` | WebGL2 host and the ray-marched lunar ground (rendered once, in strips, then reused each frame). |
| `assets/js/dog3d.js`, `dogshader.js` | The 3D hound: a skeleton with smooth muscle volumes, and the shader that draws it and its shadow. |
| `assets/js/dogbrain.js` | What the hound does: poses, transitions, idle steps, and small behaviours. |
| `assets/js/earth.js` | Draws Earth into a canvas with live day and night. |
| `assets/js/astro.js` | Sun position, moon phase, and location from the time zone. |
| `assets/js/moon.js`, `hound.js`, `hound-rig.js` | The illustrated fallback (and the logo hound shown at the start of the 3D scene). |

**Location.** Approximate latitude and longitude come only from the browser's time zone (`Intl`), via a lookup table of time zones. No Geolocation API, no IP lookup.

**Earth.** Centred on that location, with the real day/night terminator for the current time and city lights on the night side. It refreshes once a minute.

**Moon.** A ray-marched patch of regolith on a small sphere, seen from a crouching astronaut's eye height: craters of several sizes with irregular, worn rims, scattered rocks, fine grain, and hard shadows. The sun is always up. Its height follows the real moon phase (low with long shadows near new moon, high near full), from the right while waxing and the left while waning (mirrored south of the equator). The colour of the light follows the visitor's local time of day. Earthshine fills the shadows more near new moon.

**Hound.** The page opens on the logo's own hound, drawn exactly as in the mark, standing on the moon. Once the ground has rendered it hands over to a 3D hound in the same pose, lit by the same sun and casting a real shadow. After about 10 s without pointer, touch, key, wheel or scroll activity it sits, after about 24 s it lies down, and after about 42 s it sleeps (head on its paws, eyes closed). Any activity wakes it to standing. While awake it follows the pointer with its head, wags, flicks an ear, blinks, and now and then sniffs the ground, does a play bow, or looks around. With `prefers-reduced-motion`, poses change without animation and the extra movement is off. Browsers without WebGL2 get the illustrated version.

**Earth imagery** in `assets/img/earth/` is public domain, from Wikimedia Commons: `day.jpg` (NASA Blue Marble Next Generation, `File:World.topo.2004-09.png`), `night.jpg` (NASA Earth at Night 2012, `File:The earth at night.jpg`), `clouds.jpg` (Tom Patterson's Fair Weather Cloud Map from NASA data, `File:Fair Weather Cloud Map.jpg`).

### Preview parameters

These only change what the page shows for that visit:

- `?at=2026-11-24T12:00` sets the clock (local time in the visitor's or `tz`'s zone).
- `?tz=Asia/Tokyo` previews another time zone; `?lat=40.7&lon=-74` sets a location directly.
- `?dog=sitting` holds a pose: `standing`, `sitting`, `lying`, `sleeping`, `playbow` or `sniff`.
- `?flat=1` shows the illustrated fallback instead of the 3D scene.
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
