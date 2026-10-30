// Builds the site into dist/: reads data/portfolio.json, asks GitHub for each repo's details, newest
// release downloads and screenshot, asks nuget.org for the published packages, and renders one static
// index.html. No npm packages needed.
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
    pushed: meta.pushed_at, created: meta.created_at, stars: meta.stargazers_count,
    releaseUrl: release?.html_url ?? null, releaseTag: release?.tag_name ?? null, downloads: downloads(release),
  };
}

const hasMagick = (() => { try { execFileSync("magick", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

// Screenshot from the repo, made 16:9 and shrunk; copied as-is when ImageMagick isn't installed, and always for a
// GIF, so an animated one keeps moving (the page's CSS crops it to 16:9, as FitStyle says). A GIF also gets a still
// JPEG of its first frame, for visitors who ask for reduced motion. Returns { file, still }.
// "fit" says how a picture of another shape becomes 16:9: cropped from the middle (the default), cropped
// keeping the top ("top") or the bottom ("bottom") for games with their readouts there, or one end of a
// very wide picture ("left", "right"), or shown whole
// ("contain") with black filling the sides, for games on a black screen.
const FITS = { center: "center", top: "north", bottom: "south", left: "west", right: "east" };
async function screenshot(repo, branch, path, fit = "center") {
  const raw = await gh(`repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${branch}`,
                       "application/vnd.github.raw");
  await mkdir(join(dist, "shots"), { recursive: true });
  const gif = extname(path).toLowerCase() === ".gif";
  const shape = fit === "contain"
    ? ["-resize", "720x405", "-background", "black", "-gravity", "center"]
    : ["-resize", "720x405^", "-gravity", FITS[fit] ?? "center"];
  const jpeg = (from, to) => execFileSync("magick", [from, ...shape, "-extent", "720x405", "-quality", "78", "-strip", join(dist, to)]);
  if (!hasMagick || gif) {
    const name = `shots/${repo}${extname(path).toLowerCase()}`;
    await writeFile(join(dist, name), raw);
    if (!gif || !hasMagick) return { file: name, still: null };
    const still = `shots/${repo}-still.jpg`;
    jpeg(`${join(dist, name)}[0]`, still);
    return { file: name, still };
  }
  const src = join(dist, "shots", `${repo}.src${extname(path)}`);
  const name = `shots/${repo}.jpg`;
  await writeFile(src, raw);
  jpeg(src, name);
  await rm(src);
  return { file: name, still: null };
}

// A card's picture: an <img>, or for an animated GIF a <picture> that gives the still to visitors who ask for
// reduced motion.
const ShotImg = (item, alt) => {
  const img = `<img src="${esc(item.shotFile)}" alt="${esc(alt)}" loading="lazy" width="720" height="405"${FitStyle(item.shotFit)}>`;
  return item.shotStill
    ? `<picture><source srcset="${esc(item.shotStill)}" media="(prefers-reduced-motion: reduce)">${img}</picture>`
    : img;
};

// Matches the fit in the browser too, for when the picture was copied as-is.
const FitStyle = fit => fit === "contain" ? ' style="object-fit: contain"'
  : fit === "top" ? ' style="object-position: top"'
  : fit === "bottom" ? ' style="object-position: bottom"'
  : fit === "left" ? ' style="object-position: left"'
  : fit === "right" ? ' style="object-position: right"' : "";

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
      out.push({ ...item, name: item.name ?? item.repo, info, shotFile: shot?.file ?? null, shotStill: shot?.still ?? null });
    } catch (e) {
      failures.push(`${item.repo}: ${e.message}`);
      console.warn(`warning: ${item.repo}: ${e.message}`);
    }
  }
  return out;
}
const games = await gather(cfg.games, true);
const tools = await gather(cfg.tools, true);
const originals = await gather(cfg.originals ?? [], true);
const work = await gather(cfg.work, false);

// ---------- NuGet ----------
// Every package the NuGet account owns, read live from nuget.org at each build (so a new package or
// version shows up by itself): version, downloads, target frameworks. Published as nuget.json too; if
// nuget.org can't be reached, the copy the live site last published is used, and failing that the
// section is left out. A NuGet hiccup never stops the build. data/portfolio.json can override a
// package's "repo" (when its NuGet page has no project link) or "blurb", or "hide" it.
const NUGET_SITE = "https://harlock123.github.io/nuget.json";

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "harlock123-site" } });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function nugetLive(account) {
  const index = await getJson("https://api.nuget.org/v3/index.json");
  const service = (...types) => types.map(t => index.resources.find(r => r["@type"] === t)?.["@id"]).find(Boolean);
  const search = service("SearchQueryService/3.5.0", "SearchQueryService");
  const registrations = service("RegistrationsBaseUrl/3.6.0", "RegistrationsBaseUrl");
  const found = await getJson(`${search}?q=owner:${encodeURIComponent(account)}&take=100&semVerLevel=2.0.0`);
  const out = [];
  for (const p of found.data) {
    // The registration lists every version; its catalog entry for the current one names the frameworks.
    const reg = await getJson(`${registrations}${p.id.toLowerCase()}/index.json`);
    const entries = [];
    for (const page of reg.items) entries.push(...(page.items ?? (await getJson(page["@id"])).items));
    const entry = entries.map(e => e.catalogEntry).find(e => e.version === p.version) ?? entries.at(-1)?.catalogEntry;
    out.push({
      id: p.id, version: p.version, description: p.description, downloads: p.totalDownloads,
      projectUrl: p.projectUrl || null, published: entry?.published?.slice(0, 10) ?? null,
      frameworks: [...new Set((entry?.dependencyGroups ?? []).map(g => g.targetFramework).filter(Boolean))],
    });
  }
  return out.sort((a, b) => b.downloads - a.downloads || a.id.localeCompare(b.id));
}

async function nugetPackages(n) {
  if (!n?.owner) return [];
  let list;
  try {
    list = await nugetLive(n.owner);
  } catch (e) {
    console.warn(`warning: nuget.org: ${e.message}; using the live site's last copy`);
    try { list = (await getJson(NUGET_SITE)).packages; }
    catch (e2) { console.warn(`warning: ${e2.message}; leaving the NuGet section out`); return []; }
  }
  await writeFile(join(dist, "nuget.json"), JSON.stringify({ owner: n.owner, built: new Date().toISOString(), packages: list }, null, 2));
  return list
    .filter(p => !n.packages?.[p.id]?.hide)
    .map(p => {
      const extra = n.packages?.[p.id] ?? {};
      const fromUrl = p.projectUrl?.match(/github\.com\/[^/]+\/([^/#?]+)/i)?.[1]?.replace(/\.git$/, "");
      const repo = extra.repo ?? fromUrl ?? null;
      return { ...p, repo, source: repo ? `https://github.com/${owner}/${repo}` : null, blurb: extra.blurb ?? null };
    });
}

const packages = await nugetPackages(cfg.nuget);
// A workbench card for the same repo gets a badge pointing at its package.
for (const t of tools)
  t.nuget = packages.find(p => p.repo && t.repo && p.repo.toLowerCase() === t.repo.toLowerCase()) ?? null;
const packageDownloads = packages.reduce((n, p) => n + p.downloads, 0);

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

// The filter buttons: arcade games split by style, the rest by genre.
const STYLES = { shooter: "Shooters", scroller: "Scrolling shooters", maze: "Maze & puzzle", platform: "Platform & action", driving: "Driving & flying", sports: "Sports" };
const GENRES = { arcade: "All arcade", rpg: "RPG", strategy: "Strategy", space: "Space sim" };
// Where a game first came out, if not in the arcades: these get a button of their own, and "All arcade" keeps to
// the coin-ops. A home game still shows under its style (a computer shooter is still a shooter).
const ORIGINS = { computer: "Home computer", console: "Console" };
const HOME = "Home computer & console";
// The games added most recently get a NEW badge.
const NEW_COUNT = 5;

function gameCard(g, isNew) {
  const after = g.after ?? `After ${g.original} · ${g.publisher}`;
  // What the search box matches, and what the sort menu sorts by.
  const search = [g.name, g.original, g.publisher, g.year, GENRES[g.genre], STYLES[g.style], g.genre, ORIGINS[g.origin]].filter(Boolean).join(" ").toLowerCase();
  const tube = g.shotFile
    ? ShotImg(g, `${g.name} gameplay`)
    : `<canvas data-placeholder="${esc(g.placeholder ?? "elite")}" role="img" aria-label="${esc(g.name)} placeholder art" width="720" height="405"></canvas>`;
  return `
      <article class="cab" data-genre="${esc(g.genre)}" data-style="${esc(g.style ?? "")}" data-origin="${esc(g.origin ?? "")}" data-search="${esc(search)}"
        data-original="${esc(g.original)}" data-publisher="${esc(g.publisher)}" data-year="${esc(g.year)}" data-created="${esc(g.info.created ?? "")}"
        data-downloads='${esc(JSON.stringify(g.info.downloads))}'>
        <div class="tube">${tube}<span class="year">${esc(g.year)}</span>${isNew ? `<span class="new">NEW</span>` : ""}</div>
        <h3>${esc(g.name)}</h3>
        <button class="open" type="button" aria-label="More about ${esc(g.name)}"></button>
        <div class="after">${esc(after)}</div>
        <p class="desc">${esc(g.blurb ?? g.info.description)}</p>
        <div class="acts">${downloadBlock(g)}</div>
      </article>`;
}

// A tool's card: its screenshot in an application window's frame, what it is and what it's built on, three
// highlights from its README, and the same source and download buttons as a game.
function toolCard(t) {
  // A tool without a screenshot can give "screen": a few lines of text drawn in its window instead,
  // the first of them a heading row.
  const shot = t.shotFile
    ? ShotImg(t, `${t.name} screenshot`)
    : t.screen?.length
      ? `<pre class="screen" role="img" aria-label="${esc(t.name)} at work">${t.screen.map((l, i) => i === 0 ? `<b>${esc(l)}</b>` : esc(l)).join("\n")}</pre>`
      : "";
  const tags = [t.kind, ...(t.tags ?? [])].filter(Boolean);
  return `
      <article class="cab tool" data-downloads='${esc(JSON.stringify(t.info.downloads))}'>
        <div class="window">
          <div class="titlebar"><i></i><i></i><i></i><span>${esc(t.name)}</span></div>
          <div class="pane">${shot}</div>
        </div>
        <h3>${esc(t.name)}</h3>
        <button class="open" type="button" aria-label="More about ${esc(t.name)}"></button>
        ${tags.length ? `<div class="after">${tags.map(esc).join(" · ")}</div>` : ""}
        ${t.nuget ? `<a class="nuget-badge" href="#pkg-${esc(t.nuget.id)}">On NuGet · v${esc(t.nuget.version)} · ${esc(thousands(t.nuget.downloads))} downloads</a>` : ""}
        <p class="desc">${esc(t.blurb ?? t.info.description ?? "")}</p>
        ${t.highlights?.length ? `<ul class="highlights">${t.highlights.map(h => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
        <div class="acts">${downloadBlock(t)}</div>
      </article>`;
}

// A work in progress (a game of my own design, or a bigger project under way): like an arcade cabinet, but with its kind and tags in place of the original it
// follows, a status badge (e.g. "In development") where a remake shows the original's year, and highlights.
// These always show as full cards, never compact tiles.
function originalCard(g) {
  const tube = g.shotFile
    ? ShotImg(g, g.alt ?? `${g.name} gameplay`)
    : `<canvas data-placeholder="${esc(g.placeholder ?? "elite")}" role="img" aria-label="${esc(g.name)} placeholder art" width="720" height="405"></canvas>`;
  const tags = [g.kind, ...(g.tags ?? [])].filter(Boolean);
  return `
      <article class="cab own" id="game-${esc(g.repo)}" data-downloads='${esc(JSON.stringify(g.info.downloads))}'>
        <div class="tube">${tube}${g.status ? `<span class="year">${esc(g.status)}</span>` : ""}</div>
        <h3>${esc(g.name)}</h3>
        ${tags.length ? `<div class="after">${tags.map(esc).join(" · ")}</div>` : ""}
        <p class="desc">${esc(g.blurb ?? g.info.description ?? "")}</p>
        ${g.highlights?.length ? `<ul class="highlights">${g.highlights.map(h => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
        <div class="acts">${downloadBlock(g)}</div>
      </article>`;
}

// "net9.0" reads as ".NET 9"; "netstandard2.0" as ".NET Standard 2.0".
const framework = f => f.replace(/^net(\d+)\.0(?:-.*)?$/, ".NET $1").replace(/^netstandard/, ".NET Standard ").replace(/^netcoreapp/, ".NET Core ");
const thousands = n => n.toLocaleString("en-US");
// NuGet descriptions run long: keep whole sentences up to about two lines.
function shortDescription(text, max = 210) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const sentences = t.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  let out = "";
  for (const s of sentences) { if ((out + s).length > max) break; out += s; }
  return out.trim() || t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

function packageCard(p) {
  const install = `dotnet add package ${p.id}`;
  const facts = [`v${p.version}`, ...p.frameworks.map(framework)];
  return `
      <article class="job pkg" id="pkg-${esc(p.id)}">
        <div class="kind">NuGet · ${facts.map(esc).join(" · ")}</div>
        <h3>${esc(p.id)}</h3>
        <p>${esc(p.blurb ?? shortDescription(p.description))}</p>
        <div class="install"><code>${esc(install)}</code><button class="copy" type="button" data-copy="${esc(install)}" hidden>Copy</button></div>
        <div class="links">
          <a href="https://www.nuget.org/packages/${esc(p.id)}">NuGet</a>${p.source ? `
          <a href="${esc(p.source)}">Source</a>` : ""}
          <span class="count">${esc(thousands(p.downloads))} downloads</span>
        </div>
      </article>`;
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
const newest = new Set([...games].filter(g => g.info.created).sort((a, b) => b.info.created.localeCompare(a.info.created)).slice(0, NEW_COUNT).map(g => g.repo));
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
<script>/* Compact tiles unless the visitor chose the full cards, set before the page paints. */
try { if (localStorage.getItem("view") !== "full") document.documentElement.classList.add("compact"); } catch { document.documentElement.classList.add("compact"); }</script>
</head>
<body>
<div id="top" class="crt">

<header class="hud">
  <div class="wrap">
    <div class="one-up">1UP <b>HARLOCK123</b></div>
    <nav aria-label="Sections">
      <a href="#games">Games</a>${originals.length ? `
      <a href="#originals">In progress</a>` : ""}
      <a href="#tools">Tools</a>${packages.length ? `
      <a href="#nuget">NuGet</a>` : ""}
      <a href="#work">Work</a>
      <a href="#scores">Hi-Scores</a>
      <a href="#about">About</a>
    </nav>
    <button class="crt-toggle" id="viewToggle" aria-pressed="false" title="Show every game in full, or as compact tiles that open when clicked">DETAIL</button>
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
      <li><b>${platformsPerGame}</b>platforms each</li>${originals.length ? `
      <li><b>${originals.length}</b>in progress</li>` : ""}
      <li><b>${tools.length}</b>tools &amp; controls</li>${packages.length ? `
      <li><b>${packages.length}</b>NuGet packages</li>` : ""}
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

      <div class="finder">
        <label class="search"><span class="sr">Search the games</span>
          <input type="search" id="gameSearch" placeholder="Search: name, original, publisher, year" autocomplete="off" spellcheck="false">
        </label>
        <label class="sort">Sort
          <select id="gameSort">
            <option value="new">Newest first</option>
            <option value="az">Original A–Z</option>
            <option value="year">Oldest original first</option>
            <option value="publisher">Publisher</option>
          </select>
        </label>
        <span class="shown" id="gameCount" aria-live="polite">${games.length} games</span>
      </div>

      <div class="filters" role="group" aria-label="Filter games">
        <button class="chip" data-f="all" aria-pressed="true">All <b>${games.length}</b></button>${[
          ["arcade", GENRES.arcade, games.filter(g => g.genre === "arcade" && !g.origin).length],
          ...Object.entries(STYLES).map(([k, l]) => [k, l, games.filter(g => g.style === k).length]),
          ["home", HOME, games.filter(g => g.origin).length],
          ...["rpg", "strategy", "space"].map(k => [k, GENRES[k], games.filter(g => g.genre === k).length]),
        ].filter(([, , n]) => n > 0).map(([k, l, n]) => `
        <button class="chip${STYLES[k] ? " sub" : ""}" data-f="${k}" aria-pressed="false">${esc(l)} <b>${n}</b></button>`).join("")}
      </div>

      <div class="cabinets" id="cabinets">${games.map(g => gameCard(g, newest.has(g.repo)).replace('<article class="cab"', `<article id="game-${esc(g.repo)}" class="cab"`)).join("")}
      </div>
      <p class="no-match" id="noMatch" hidden>No game matches that. Try another word, or press <b>All</b>.</p>
      <dialog class="game-dialog" id="gameDialog" aria-label="Details">
        <button class="close btn ghost" type="button" aria-label="Close">✕</button>
        <div class="body"></div>
      </dialog>
      <p class="linux-note">On Linux some games need <code>aplay</code> for sound, or SDL2 for gamepads on ARM. Each game's README says which.</p>
    </div>
  </section>

${originals.length ? `  <section class="block" id="originals" aria-labelledby="originals-title">
    <div class="wrap">
      <div class="sec-head">
        <h2 id="originals-title">Work in <em>progress</em></h2>
        <p>Bigger projects still under way: a game of my own design, and a 3D modeling suite with Claude built in. Builds follow every push, so expect rough edges.</p>
      </div>
      <div class="cabinets own">${originals.map(originalCard).join("")}
      </div>
    </div>
  </section>

` : ""}  <section class="block" id="tools" aria-labelledby="tools-title">
    <div class="wrap">
      <div class="sec-head">
        <h2 id="tools-title">The <em>workbench</em></h2>
        <p>Editors, controls and utilities, also cross-platform with Avalonia.</p>
      </div>
      <div class="cabinets bench">${tools.map(toolCard).join("")}
      </div>
    </div>
  </section>

${packages.length ? `  <section class="block" id="nuget" aria-labelledby="nuget-title">
    <div class="wrap">
      <div class="sec-head">
        <h2 id="nuget-title">On <em>NuGet</em></h2>
        <p>Avalonia controls, ready to add to a project of your own: ${packages.length} packages, ${esc(thousands(packageDownloads))} downloads so far.</p>
      </div>
      <div class="work pkgs">${packages.map(packageCard).join("")}
      </div>
    </div>
  </section>

` : ""}  <section class="block" id="work" aria-labelledby="work-title">
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
            ${p.x ? `<dt>X</dt><dd><a href="${esc(p.x)}">@${esc(p.x.split("/").pop())}</a></dd>` : ""}
          </dl>
        </div>
      </div>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <span class="stamp">Built ${built} from GitHub${packages.length ? " and NuGet" : ""}</span>
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

console.log(`Built dist/: ${games.length} games, ${originals.length} in progress, ${tools.length} tools, ${packages.length} NuGet packages, ${work.length} work projects.`);
if (failures.length) {
  console.error(`\n${failures.length} repo(s) could not be read:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
