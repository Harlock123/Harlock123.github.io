# Harlock123.github.io

Source for [harlock123.github.io](https://harlock123.github.io/): a retro vector-arcade portfolio of my
games, tools and work.

The page is built, not hand-edited. `scripts/build.mjs` reads `data/portfolio.json`, asks GitHub for each
repo's description, newest release downloads and screenshot, asks nuget.org for the published packages,
and writes a static site to `dist/`. The
`Pages` workflow runs it on every push, once a day, and on demand, then deploys `dist/` to GitHub Pages
and uploads the same files to [harlock123.com](https://harlock123.com/) (IONOS, IIS) over FTPS.

The FTPS login is in the repo secrets `FTP_USER` and `FTP_PASSWORD`; without them the upload is skipped.
The upload only adds or replaces files, so anything else on the server (`default.htm`, `web.config`, logs,
other downloads) is left alone.

## Adding or changing something

Edit `data/portfolio.json`:

- **games**: `repo`, `genre` (`arcade`, `rpg`, `space` or `strategy`), for an arcade game its `style`
  (`shooter`, `scroller`, `maze`, `platform`, `driving` or `sports`), the `original` game, its `publisher` and
  `year`, a `blurb`, and `shot`: a screenshot's path inside that repo. A game that first came out on a home
  computer or a console, not in the arcades, also has `origin` (`computer` or `console`). The genres and
  styles make the filter buttons, each with its count. **All arcade** counts only the coin-ops (no `origin`);
  **Home computer & console** counts every game with an `origin`, whatever its genre. A home game still
  shows under its style (Jetpac is under Shooters). A game without a screenshot can use `"placeholder": "invader"` or
  `"elite"` for drawn wireframe art.

The games show as compact tiles by default; a tile opens the full card in a panel. The **DETAIL**
button in the header switches to the full cards, and the page remembers the choice. Above the games,
a search box matches the name, original, publisher and year, and a menu sorts them: newest first (by
the repo's creation date), by original title, by year, or by publisher. The five newest games carry a
NEW badge.
- **originals**: work in progress, shown as full cards in the "Work in progress" section between the games
  and the tools: games of my own design, and bigger projects still under way (AVA Modeler). Each has `repo`, a `kind` and `tags` (shown where a
  remake shows its original), a `status` badge for the screenshot's corner (e.g. "In development"), a
  `blurb`, three `highlights`, `shot`, and optionally `alt` for the picture (default "<name> gameplay"). They aren't in
  the game filters, the search or the high-score table.
- **tools**: `repo`, a `blurb`, its `kind` and `tags`, three `highlights`, and `shot`: a screenshot's path
  inside that repo (an animated GIF plays on the card, or shows its first frame to visitors who ask for
  reduced motion). Any card's `shot` can also be a list of GIFs, which the card plays in turn, each through
  to its end (at least 8 seconds) before the next starts from its first frame. A tool without a screenshot can give `screen` instead: a few lines of text drawn in
  its window, the first of them a heading.
- **work**: `name`, `kind`, `blurb`, plus `repo` for a public repo or `"private": true`, and any `links`.
- **nuget**: the NuGet account (`owner`). Every package it owns is listed in the "On NuGet" section with
  its version, frameworks, downloads and a `dotnet add package` line, read fresh at each build, so new
  packages and versions need no editing. Under `packages`, a package can be given a `repo` (when its
  NuGet page has no project link), its own `blurb`, or `"hide": true`. A workbench tool with the same
  repo gets an "On NuGet" badge linking to it. If nuget.org can't be reached, the build uses the
  `nuget.json` the live site last published, and failing that leaves the section out.

Downloads need no configuration. The build picks each repo's rolling `latest` release if it has one,
otherwise its newest release, and offers the `.zip` / `.tar.gz` for each platform it finds
(`win-x64`, `linux-arm64`, …).

PDFs, the résumé and the portrait live in `static/` and are copied to the site root as-is. Page styles
and behaviour are in `site/style.css` and `site/app.js`.

Behind the hero, `site/app.js` plays little vector attract-mode scenes in turn, cross-fading every 15
seconds (`SCENE_SECONDS`): the lunar lander, a ship clearing an asteroid field, an invader formation
against a cannon, a claw on the rim of a tempest tube, a battle-tank periscope view, a ship chipping at a
star castle's rotating rings, missiles falling on cities with counter-missiles bursting among them, and a
wireframe trench run to an exhaust port, among others (Pac-Man, Qix, Defender, Tron, Gravitar, Elite, Tailgunner,
Red Baron, Omega Race, Black Widow, Major Havoc, Robotron, Centipede, Thrust and Tetris). Each is an object in the `scenes` list with `layout`, `start` and `draw`, so another
can be added alongside them. A visitor who prefers reduced motion sees one still frame.

## Building locally

```bash
GITHUB_TOKEN=$(gh auth token) node scripts/build.mjs   # Node 22+; ImageMagick optional (resizes screenshots)
python3 -m http.server -d dist 8000                    # then open http://localhost:8000
```

## Refreshing after a game release

The site rebuilds itself daily. To refresh right away, run the **Pages** workflow from the Actions tab,
or from a terminal:

```bash
gh workflow run pages.yml -R Harlock123/Harlock123.github.io
```
