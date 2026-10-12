// Builds the site into dist/: reads data/portfolio.json, asks GitHub for each repo's details, newest
// release downloads and screenshot, and renders one static index.html. No npm packages needed.
//
//   GITHUB_TOKEN=... node scripts/build.mjs      (locally: GITHUB_TOKEN=$(gh auth token) node scripts/build.mjs)
//
// A token is optional but raises GitHub's rate limit from 60 to thousands of requests an hour.

import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const cfg = JSON.parse(await readFile(join(root, "data/portfolio.json"), "utf8"));
const owner = cfg.owner;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

// Platforms in the order the download picker lists them.
const PLATFORMS = {
  "win-x64": "Windows x64", "win-arm64": "Windows ARM64", "win-x86": "Windows 32-bit",
  "osx-arm64": "macOS Apple Silicon", "osx-x64": "macOS Intel",
  "linux-x64": "Linux x64", "linux-arm64": "Linux ARM64", "linux-arm": "Linux ARM 32-bit",
};

async function gh(path, accept = "application/vnd.github+json") {
  const res = await fetch(`https://api.github.com/${path}`, {
    headers: { Accept: accept, "User-Agent": "harlock123-site", ...(token && { Authorization: `Bearer ${token}` }) },
  });
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status} ${res.statusText}`);
  return accept.includes("raw") ? Buffer.from(await res.arrayBuffer()) : res.json();
}

// The plain .zip / .tar.gz download for each platform. Installers, disk images, AppImages and musl
// builds are left out: the site offers the one-file-to-unpack build everywhere.
function downloads(release) {
  const out = {};
  for (const a of release?.assets ?? []) {
    const m = a.name.match(/(?:^|[-_.])((?:win|osx|linux)-(?:x64|x86|arm64|arm))(?=[-_.])/);
    if (!m || !/\.(zip|tar\.gz)$/.test(a.name) || /-setup\./.test(a.name)) continue;
    out[m[1]] ??= a.browser_download_url;
  }
  return out;
}

// Prefer the rolling "latest" build when a repo has one; otherwise its newest proper release.
function pickRelease(releases) {
  return releases.find(r => r.tag_name === "latest" && !r.draft)
      ?? releases.find(r => !r.draft && !r.prerelease)
      ?? null;
}

async function repoInfo(repo) {
  const meta = await gh(`repos/${owner}/${repo}`);
  let release = null;
  if (!meta.private) {
    const releases = await gh(`repos/${owner}/${repo}/releases?per_page=20`);
    release = pickRelease(releases);
  }
  return {
    url: meta.html_url, description: meta.description, branch: meta.default_branch, private: meta.private,
    pushed: meta.pushed_at, stars: meta.stargazers_count,
    releaseUrl: release?.html_url ?? null, releaseTag: release?.tag_name ?? null, downloads: downloads(release),
  };
}

const hasMagick = (() => { try { execFileSync("magick", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

// Screenshot from the repo, made 16:9 and shrunk; copied as-is when ImageMagick isn't installed.
// "fit" says how a picture of another shape becomes 16:9: cropped from the middle (the default), cropped
// keeping the top ("top") or the bottom ("bottom") for games with their readouts there, or shown whole
// ("contain") with black filling the sides, for games on a black screen.
const FITS = { center: "center", top: "north", bottom: "south" };
async function screenshot(repo, branch, path, fit = "center") {
  const raw = await gh(`repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${branch}`,
                       "application/vnd.github.raw");
  await mkdir(join(dist, "shots"), { recursive: true });
  if (!hasMagick) {
    const name = `shots/${repo}${extname(path).toLowerCase()}`;
    await writeFile(join(dist, name), raw);
    return name;
  }
  const src = join(dist, "shots", `${repo}.src${extname(path)}`);
  const name = `shots/${repo}.jpg`;
  await writeFile(src, raw);
  const shape = fit === "contain"
    ? ["-resize", "720x405", "-background", "black", "-gravity", "center"]
    : ["-resize", "720x405^", "-gravity", FITS[fit] ?? "center"];
  execFileSync("magick", [src, ...shape, "-extent", "720x405", "-quality", "78", "-strip", join(dist, name)]);
  await rm(src);
  return name;
}

// Matches the fit in the browser too, for when the picture was copied as-is.
const FitStyle = fit => fit === "contain" ? ' style="object-fit: contain"'
  : fit === "top" ? ' style="object-position: top"'
  : fit === "bottom" ? ' style="object-position: bottom"' : "";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const href = s => esc(encodeURI(s));

// ---------- Gather ----------
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const failures = [];
async function gather(list, withShot) {
  const out = [];
  for (const item of list) {
    if (!item.repo) { out.push(item); continue; }
    try {
      const info = await repoInfo(item.repo);
      const shot = withShot && item.shot ? await screenshot(item.repo, info.branch, item.shot, item.shotFit) : null;
      out.push({ ...item, name: item.name ?? item.repo, info, shotFile: shot });
    } catch (e) {
      failures.push(`${item.repo}: ${e.message}`);
      console.warn(`warning: ${item.repo}: ${e.message}`);
    }
  }
  return out;
}
const games = await gather(cfg.games, true);
const tools = await gather(cfg.tools, false);
const work = await gather(cfg.work, false);

// ---------- Render ----------
function downloadBlock(item) {
  const d = item.info?.downloads ?? {};
  const rids = Object.keys(PLATFORMS).filter(r => d[r]);
  const source = `<a class="btn" href="${esc(item.info.url)}">Source</a>`;
  if (!rids.length) return source;
  const first = rids.includes("win-x64") ? "win-x64" : rids[0]; // what visitors without JavaScript see
  return `
        <a class="btn primary dl" href="${esc(d[first])}" data-releases="${esc(item.info.releaseUrl)}">⬇ ${esc(PLATFORMS[first])}</a>
        ${source}
        <details>
          <summary>All ${rids.length} builds</summary>
          <ul>${rids.map(r => `<li><a href="${esc(d[r])}">${esc(PLATFORMS[r])}</a></li>`).join("")}</ul>
        </details>`;
}

function gameCard(g) {
  const after = g.after ?? `After ${g.original} · ${g.publisher}`;
  const tube = g.shotFile
    ? `<img src="${esc(g.shotFile)}" alt="${esc(g.name)} gameplay" loading="lazy" width="720" height="405"${FitStyle(g.shotFit)}>`
    : `<canvas data-placeholder="${esc(g.placeholder ?? "elite")}" role="img" aria-label="${esc(g.name)} placeholder art" width="720" height="405"></canvas>`;
  return `
      <article class="cab" data-f="${esc(g.genre)}" data-downloads='${esc(JSON.stringify(g.info.downloads))}'>
        <div class="tube">${tube}<span class="year">${esc(g.year)}</span></div>
        <h3>${esc(g.name)}</h3>
        <div class="after">${esc(after)}</div>
        <p class="desc">${esc(g.blurb ?? g.info.description)}</p>
        <div class="acts">${downloadBlock(g)}</div>
      </article>`;
}

function toolCard(t) {
  const n = Object.keys(t.info.downloads).length;
  return `
      <a href="${esc(t.info.url)}">
        <strong>${esc(t.name)}</strong>
        <span>${esc(t.blurb ?? t.info.description ?? "")}</span>
        ${n ? `<em>${n} platform downloads</em>` : ""}
      </a>`;
}

function workCard(j) {
  const links = [...(j.links ?? [])];
  if (j.info && !j.info.private) links.unshift(["Source", j.info.url]);
  return `
      <article class="job">
        <div class="kind">${esc(j.kind)}${j.private ? ` · <span class="priv">private repo</span>` : ""}</div>
        <h3>${esc(j.name)}</h3>
        <p>${esc(j.blurb)}</p>
        <div class="links">${links.map(([t, h]) => `<a href="${h.startsWith("http") ? esc(h) : href(h)}">${esc(t)}</a>`).join("")}</div>
      </article>`;
}

const ordinal = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"));
const scoreRows = [...games].sort((a, b) => a.year - b.year || a.original.localeCompare(b.original)).map((g, i) => `
            <tr><td>${ordinal(i + 1)}</td><td>${esc(g.year)}</td><td>${esc(g.original)}</td><td><a href="#game-${esc(g.repo)}">${esc(g.name)}</a></td></tr>`).join("");

const p = cfg.profile;
const oldest = Math.min(...games.map(g => g.year));
const platformsPerGame = Math.max(0, ...games.map(g => Object.keys(g.info.downloads).length));
const built = new Date().toISOString().slice(0, 10);
// Content hashes on the CSS and JS links, so browsers fetch a new copy as soon as either file changes.
const version = async f => createHash("sha256").update(await readFile(join(root, f))).digest("hex").slice(0, 10);
const cssVersion = await version("site/style.css"), jsVersion = await version("site/app.js");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<script>/* The IIS host has no URL Rewrite module, so web.config can't redirect http to https; do it here. */
if (location.protocol === "http:" && !/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname)) location.replace("https:" + location.href.slice(5));</script>
<title>${esc(p.name)} · Harlock123</title>
<meta name="description" content="${esc(p.lede)}">
<meta property="og:title" content="${esc(p.name)} · Harlock123">
<meta property="og:description" content="Arcade and RPG classics rebuilt in C# and Avalonia, with downloads for Windows, macOS and Linux.">
<meta property="og:type" content="website">
<meta name="theme-color" content="#05080d">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#05080d"/><path d="M10 12h12l3 6H7zM9 18l-4 8M23 18l4 8" stroke="#5ce1ff" stroke-width="2" fill="none"/></svg>`)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Audiowide&family=Chakra+Petch:wght@400;500;600&family=VT323&display=swap">
<link rel="stylesheet" href="style.css?v=${cssVersion}">
</head>
<body>
<div id="top" class="crt">

<header class="hud">
  <div class="wrap">
    <div class="one-up">1UP <b>HARLOCK123</b></div>
    <nav aria-label="Sections">
      <a href="#games">Games</a>
      <a href="#tools">Tools</a>
      <a href="#work">Work</a>
      <a href="#scores">Hi-Scores</a>
      <a href="#about">About</a>
    </nav>
    <button class="crt-toggle" id="crtToggle" aria-pressed="true" title="Turn the scanline effect on or off">CRT</button>
  </div>
</header>

<section class="hero" aria-labelledby="hero-title">
  <canvas id="attract" aria-hidden="true"></canvas>
  <div class="wrap">
    <p class="eyebrow"><span class="blink">Insert coin</span> · Player 1 ready</p>
    <h1 id="hero-title">${esc(p.name)}<span>${esc(p.title)}</span></h1>
    <p class="lede">${esc(p.lede)}</p>
    <ul class="stats">
      <li><b>${games.length}</b>games</li>
      <li><b>${platformsPerGame}</b>platforms each</li>
      <li><b>${tools.length}</b>tools &amp; controls</li>
      <li><b>${oldest}</b>oldest original</li>
    </ul>
    <div class="ctas">
      <a class="btn primary" href="#games">▶ Press start</a>
      <a class="btn" href="${href(p.resume)}">Résumé (PDF)</a>
      <a class="btn ghost" href="${esc(p.github)}">GitHub</a>
    </div>
  </div>
</section>

<main>
  <section class="block" id="games" aria-labelledby="games-title">
    <div class="wrap">
      <div class="sec-head">
        <h2 id="games-title">Select your <em>game</em></h2>
        <p>Each one is a single self-contained program: download, unpack, run. No installer and no .NET needed.</p>
      </div>

      <div class="platform" role="group" aria-label="Download platform">
        <span class="led" aria-hidden="true"></span>
        <span>Detected: <span class="what" id="detected">Windows x64</span></span>
        <label for="ridPick">Download for
          <select id="ridPick">${Object.entries(PLATFORMS).map(([r, l]) => `<option value="${r}">${esc(l)}</option>`).join("")}</select>
        </label>
        <span class="note" id="platformNote">Download buttons below are set for this machine. Change it to grab a build for another computer.</span>
      </div>

      <div class="filters" role="group" aria-label="Filter games">
        <button class="chip" data-f="all" aria-pressed="true">All</button>
        <button class="chip" data-f="arcade" aria-pressed="false">Arcade</button>
        <button class="chip" data-f="rpg" aria-pressed="false">RPG</button>
        <button class="chip" data-f="space" aria-pressed="false">Space sim</button>
      </div>

      <div class="cabinets" id="cabinets">${games.map(g => gameCard(g).replace('<article class="cab"', `<article id="game-${esc(g.repo)}" class="cab"`)).join("")}
      </div>
      <p class="linux-note">On Linux some games need <code>aplay</code> for sound, or SDL2 for gamepads on ARM. Each game's README says which.</p>
    </div>
  </section>

  <section class="block" id="tools" aria-labelledby="tools-title">
    <div class="wrap">
      <div class="sec-head">
        <h2 id="tools-title">The <em>workbench</em></h2>
        <p>Editors, controls and utilities, also cross-platform with Avalonia.</p>
      </div>
      <div class="bench">${tools.map(toolCard).join("")}
      </div>
    </div>
  </section>

  <section class="block" id="work" aria-labelledby="work-title">
    <div class="wrap">
      <div class="sec-head">
        <h2 id="work-title">Day <em>job</em></h2>
        <p>Healthcare records, reporting and code generation: the systems that pay for the arcade.</p>
      </div>
      <div class="work">${work.map(workCard).join("")}
      </div>
    </div>
  </section>

  <section class="block" id="scores" aria-labelledby="scores-title">
    <div class="wrap">
      <div class="sec-head">
        <h2 id="scores-title">Hall of <em>fame</em></h2>
        <p>The originals, oldest first, and what each became here.</p>
      </div>
      <div class="scores-box">
        <h3>High scores</h3>
        <table class="scores">
          <thead><tr><th scope="col">Rank</th><th scope="col">Year</th><th scope="col">Original</th><th scope="col">Rebuilt as</th></tr></thead>
          <tbody>${scoreRows}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="block" id="about" aria-labelledby="about-title">
    <div class="wrap">
      <div class="sec-head"><h2 id="about-title">Player <em>profile</em></h2></div>
      <div class="about">
        <div>${p.about.map(t => `
          <p>${esc(t)}</p>`).join("")}
        </div>
        <div class="card">
          <img class="portrait" src="${href(p.photo)}" alt="${esc(p.name)}" width="480" height="480">
          <dl>${p.card.map(([k, v]) => `
            <dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}
            <dt>GitHub</dt><dd><a href="${esc(p.github)}">${esc(owner)}</a></dd>
            <dt>LinkedIn</dt><dd><a href="${esc(p.linkedin)}">lonnie-watson</a></dd>
          </dl>
        </div>
      </div>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <span class="stamp">Built ${built} from GitHub</span>
    <span>Unofficial fan recreations; not affiliated with the original publishers. Trademarks belong to their owners.</span>
  </div>
</footer>
</div>
<script src="app.js?v=${jsVersion}"></script>
</body>
</html>
`;

await writeFile(join(dist, "index.html"), html);
await cp(join(root, "site/style.css"), join(dist, "style.css"));
await cp(join(root, "site/app.js"), join(dist, "app.js"));
await cp(join(root, "static"), dist, { recursive: true });
if (existsSync(join(root, "images"))) await cp(join(root, "images"), join(dist, "images"), { recursive: true });
await writeFile(join(dist, ".nojekyll"), "");
if (cfg.cname) await writeFile(join(dist, "CNAME"), cfg.cname + "\n");

console.log(`Built dist/: ${games.length} games, ${tools.length} tools, ${work.length} work projects.`);
if (failures.length) {
  console.error(`\n${failures.length} repo(s) could not be read:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
