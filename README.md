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
| `/` | Placeholder home page. |
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

## Deploy

`.github/workflows/pages.yml` builds the site with Jekyll and deploys it with `actions/deploy-pages` on every push to `main`.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** if the workflow cannot enable that itself. Do not set a custom domain on this repository yet.
