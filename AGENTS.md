# AGENTS.md

Notes for anyone, human or AI agent, changing this repo. `README.md` covers every field in `data/portfolio.json`
and the attract-mode scenes; this file covers how the build fits together and the rules that keep it working.

## What this is

The source of the owner's portfolio site, harlock123.github.io, which is also copied to harlock123.com. The page is
generated, never hand-edited. A Node script reads `data/portfolio.json`, fetches live data from the GitHub API
(repo details, release downloads, screenshots) and nuget.org, and writes a static site to `dist/`. There are no npm
dependencies and no `package.json`.

## Commands

```bash
GITHUB_TOKEN=$(gh auth token) node scripts/build.mjs   # Node 22; writes dist/ (GH_TOKEN also works)
python3 -m http.server -d dist 8000                    # look at it on http://localhost:8000
gh workflow run pages.yml -R Harlock123/Harlock123.github.io   # rebuild and deploy now
```

- The build makes several GitHub API calls per card (about 200 cards), so run it with a token; unauthenticated
  calls hit the rate limit.
- ImageMagick (`magick`) is optional. With it, screenshots are cropped to 720x405 JPEGs; without it they are copied
  as they are. GIFs are always copied as they are, so animated ones keep playing; the CSS crops them to 16:9. Keep
  them small (a couple of MB at most), as the page loads every card's picture.
- `dist/` and `node_modules/` are ignored by git. There are no tests; the build itself is the check.

## Layout

- `data/portfolio.json`: everything on the page. `owner`, `profile`, then the lists `games`, `originals`, `tools`,
  `work` and the `nuget` account. The README documents each field.
- `scripts/build.mjs`: the generator.
  - `gather` calls `repoInfo` (GitHub metadata and the release, picked by `pickRelease`) and `screenshot` for each
    entry. `downloads` keeps one `.zip` or `.tar.gz` per platform RID.
  - `nugetPackages` lists the NuGet packages and also writes `dist/nuget.json`, its fallback for the next build.
  - `gameCard`, `originalCard`, `toolCard`, `packageCard` and `workCard` render the cards. The page template, with
    the filter buttons built from `GENRES`, `STYLES` and `ORIGINS`, follows them.
  - Last, it copies `site/` and `static/` into `dist/` and writes `.nojekyll` (and `CNAME` if `cname` is set).
- `site/app.js`: the browser side. Filters, search, sort, the tile and detail views (remembered in
  `localStorage`), and the vector attract-mode `scenes` behind the hero.
- `site/style.css`: the page styles.
- `static/`: the resumes, PDFs in `docs/` and the portrait, copied to the site root as they are.
- `images/`: older github.io images, copied to `dist/images/`.

## Rules that keep it working

- **Every repo must be readable.** If any entry's repo (or its `shot` path on the default branch) can't be fetched,
  the build lists it and exits 1, which fails the workflow. Check the name and the screenshot path before pushing.
- **Downloads are found, not configured.** The build takes the `latest` release if there is one, else the newest
  full release, and matches asset names containing a RID such as `win-x64`. A card added before its repo has a
  release shows no downloads until the next build.
- **The genre, style and origin values are fixed lists** (`GENRES`, `STYLES`, `ORIGINS` in `build.mjs`). A new value
  needs adding there, or its games get no filter button.
- **Games go in `games`, the owner's own designs in `originals`.** Originals are left out of the game filters and
  search. A home-computer or console game gets `origin`, so it counts under "Home computer & console".
- **Escape everything.** Text from the JSON and the API goes through `esc` (or `href` for URLs) in the templates.
- **Cache busting.** `style.css` and `app.js` are linked with a hash of their contents, so edit those files in `site/`,
  never in `dist/`.

## Making a change

- To add a card, edit `data/portfolio.json` only, then build locally with a token and look at the result.
- For a change to the look or behaviour, edit `site/` or the templates in `build.mjs`, then build and check both the
  tile and the DETAIL views.
- Keep `README.md` in step when you add a field to the JSON.

## CI and releases

`.github/workflows/pages.yml` (Node 22 on Ubuntu 24.04) runs on every push to `main`, daily at 06:17 UTC, by hand,
and on a `portfolio-refresh` repository dispatch. It builds with the workflow's own token and deploys `dist/` to
GitHub Pages. A second job uploads the same files to harlock123.com over FTPS, `index.html` last, using the
`FTP_USER` and `FTP_PASSWORD` secrets; without them that step is skipped. It only adds or replaces files on that
server, never deletes.
