// Page behaviour: point the download buttons at the visitor's platform, filter the games, the CRT
// toggle, placeholder art for games without screenshots, and the attract-mode scene in the hero.
(() => {
  const LABEL = Object.fromEntries([...document.querySelectorAll("#ridPick option")].map(o => [o.value, o.textContent]));

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  // ---------- Platform detection ----------
  let mobile = false;
  function guessRid() {
    const ua = navigator.userAgent;
    if (/Android|iPhone|iPad|iPod/i.test(ua)) { mobile = true; return "win-x64"; }
    if (/Windows/i.test(ua)) return /ARM64|aarch64/i.test(ua) ? "win-arm64" : (/WOW64|Win64|x64/i.test(ua) ? "win-x64" : "win-x86");
    if (/Mac OS X|Macintosh/i.test(ua)) return "osx-arm64"; // every Mac browser claims Intel; most Macs are Apple Silicon now
    if (/aarch64|arm64/i.test(ua)) return "linux-arm64";
    if (/armv7|armv6|armhf/i.test(ua)) return "linux-arm";
    return "linux-x64";
  }
  async function refineRid(rid) {
    const uad = navigator.userAgentData;
    if (!uad?.getHighEntropyValues) return rid;
    try {
      const v = await uad.getHighEntropyValues(["architecture", "bitness"]);
      const arm = v.architecture === "arm", p = (uad.platform || "").toLowerCase();
      if (p.includes("windows")) return arm ? "win-arm64" : (v.bitness === "32" ? "win-x86" : "win-x64");
      if (p.includes("mac")) return arm ? "osx-arm64" : "osx-x64";
      if (p.includes("linux") || p.includes("chrome os")) return arm ? (v.bitness === "32" ? "linux-arm" : "linux-arm64") : "linux-x64";
    } catch {}
    return rid;
  }

  const pick = document.getElementById("ridPick");
  const cards = [...document.querySelectorAll(".cab")].map(card => ({
    downloads: JSON.parse(card.dataset.downloads || "{}"),
    button: card.querySelector(".dl"),
  }));
  let detected = guessRid();
  let current = store.get("rid") || detected;
  pick.value = current;

  function paint() {
    for (const { downloads, button } of cards) {
      if (!button) continue;
      if (downloads[current]) {
        button.href = downloads[current];
        button.removeAttribute("aria-disabled");
        button.textContent = `⬇ ${LABEL[current]}`;
      } else {
        button.href = button.dataset.releases;
        button.setAttribute("aria-disabled", "true");
        button.textContent = `No ${LABEL[current]} build`;
      }
    }
    document.getElementById("detected").textContent = mobile ? "Phone or tablet" : LABEL[detected];
    document.getElementById("platformNote").textContent = mobile
      ? "These games are desktop programs. Pick the computer you'll play on."
      : current === detected
        ? "Download buttons below are set for this machine. Change it to grab a build for another computer."
        : `Buttons are set for ${LABEL[current]}, not this machine.`;
  }
  pick.addEventListener("change", () => { current = pick.value; store.set("rid", current); paint(); });
  paint();
  refineRid(detected).then(r => {
    if (r === detected) return;
    if (!store.get("rid")) { current = r; pick.value = r; }
    detected = r;
    paint();
  });

  // ---------- Finding a game: filter buttons, search and sort ----------
  const chips = [...document.querySelectorAll(".chip")];
  const cabinets = document.getElementById("cabinets");
  const all = [...cabinets.children];
  all.forEach((card, i) => card.dataset.order = i);
  const search = document.getElementById("gameSearch"), sort = document.getElementById("gameSort");
  const count = document.getElementById("gameCount"), noMatch = document.getElementById("noMatch");
  let filter = "all";
  const byText = k => (a, b) => a.dataset[k].localeCompare(b.dataset[k], undefined, { sensitivity: "base" });
  const SORTS = {
    // Newest repo first; the order in portfolio.json breaks ties and covers any without a date.
    new: (a, b) => (b.dataset.created || "").localeCompare(a.dataset.created || "") || a.dataset.order - b.dataset.order,
    az: byText("original"),
    year: (a, b) => a.dataset.year - b.dataset.year || byText("original")(a, b),
    publisher: (a, b) => byText("publisher")(a, b) || a.dataset.year - b.dataset.year,
  };
  function apply() {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const card of all) {
      // "All arcade" is the coin-ops only; "home" is everything that first came out on a home computer or console.
      const d = card.dataset;
      const inGroup = filter === "all" ? true
        : filter === "home" ? d.origin !== ""
        : filter === "arcade" ? d.genre === "arcade" && d.origin === ""
        : d.genre === filter || d.style === filter;
      const ok = inGroup && words.every(w => card.dataset.search.includes(w));
      card.hidden = !ok;
      if (ok) shown++;
    }
    const sorted = [...all].sort(SORTS[sort.value] ?? SORTS.new);
    if (sorted.some((c, i) => cabinets.children[i] !== c)) cabinets.append(...sorted);
    count.textContent = `${shown} ${shown === 1 ? "game" : "games"}`;
    noMatch.hidden = shown > 0;
  }
  for (const chip of chips) chip.addEventListener("click", () => {
    for (const c of chips) c.setAttribute("aria-pressed", String(c === chip));
    filter = chip.dataset.f;
    apply();
  });
  search.addEventListener("input", apply);
  sort.value = store.get("sort") || "new";
  sort.addEventListener("change", () => { store.set("sort", sort.value); apply(); });
  apply();

  // ---------- Compact tiles or full cards ----------
  const html = document.documentElement, viewBtn = document.getElementById("viewToggle");
  const setView = full => { html.classList.toggle("compact", !full); viewBtn.setAttribute("aria-pressed", String(full)); };
  setView(store.get("view") === "full");
  viewBtn.addEventListener("click", () => {
    const full = html.classList.contains("compact");
    setView(full);
    store.set("view", full ? "full" : "compact");
  });

  // A compact tile, a game's or a tool's, opens the whole card in a panel.
  const dialog = document.getElementById("gameDialog"), dialogBody = dialog.querySelector(".body");
  document.addEventListener("click", e => {
    const open = e.target.closest(".cabinets .open");
    if (!open || !html.classList.contains("compact")) return;
    const card = open.closest(".cab").cloneNode(true);
    card.removeAttribute("id");
    card.hidden = false;
    card.querySelector(".open")?.remove();
    card.querySelectorAll("canvas[data-placeholder]").forEach(cv => drawPlaceholder(cv, cv.dataset.placeholder));
    dialogBody.replaceChildren(card);
    dialog.showModal();
  });
  dialog.querySelector(".close").addEventListener("click", () => dialog.close());
  // A click on the dimmed page around the panel closes it too.
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  // A link to somewhere else on the page (a tool's NuGet badge) closes the panel on the way.
  dialog.addEventListener("click", e => { if (e.target.closest('a[href^="#"]')) dialog.close(); });
  // A link to a game (from the high-score table, say) shows it whatever the filter.
  function reveal() {
    const target = location.hash.startsWith("#game-") && document.getElementById(location.hash.slice(1));
    if (target?.hidden) { search.value = ""; chips[0].click(); }
  }
  addEventListener("hashchange", reveal);
  reveal();

  // ---------- CRT toggle ----------
  const root = document.getElementById("top"), crtBtn = document.getElementById("crtToggle");
  const setCrt = on => { root.classList.toggle("crt", on); crtBtn.setAttribute("aria-pressed", String(on)); };
  setCrt(store.get("crt") !== "off");
  crtBtn.addEventListener("click", () => {
    const on = !root.classList.contains("crt");
    setCrt(on);
    store.set("crt", on ? "on" : "off");
  });

  // ---------- Placeholder art for games without a screenshot ----------
  function drawPlaceholder(canvas, kind) {
    const w = canvas.width, h = canvas.height, c = canvas.getContext("2d");
    c.fillStyle = "#000"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "rgba(92,225,255,.12)"; c.lineWidth = 1;
    for (let x = 0; x < w; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y < h; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.shadowBlur = 12;
    if (kind === "invader") {
      const rows = ["00100000100", "00010001000", "00111111100", "01101110110", "11111111111", "10111111101", "10100000101", "00011011000"];
      const s = 14, ox = (w - 11 * s) / 2, oy = 110;
      c.fillStyle = c.shadowColor = "#72ff8f";
      rows.forEach((r, y) => [...r].forEach((b, x) => b === "1" && c.fillRect(ox + x * s, oy + y * s, s - 2, s - 2)));
    } else {
      c.strokeStyle = c.shadowColor = "#5ce1ff"; c.lineWidth = 2;
      const P = [[360, 120], [250, 200], [470, 200], [300, 250], [420, 250], [360, 215]]; // a Cobra-ish wireframe
      const E = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5]];
      c.beginPath(); for (const [a, b] of E) { c.moveTo(...P[a]); c.lineTo(...P[b]); } c.stroke();
    }
    c.shadowBlur = 0; c.fillStyle = "#7d91a5"; c.font = "26px VT323, monospace"; c.textAlign = "center";
    c.fillText("SCREENSHOT PENDING", w / 2, h - 40);
  }
  const placeholders = () => document.querySelectorAll("canvas[data-placeholder]").forEach(cv => drawPlaceholder(cv, cv.dataset.placeholder));
  placeholders();
  document.fonts?.ready.then(placeholders); // redraw once VT323 has loaded

  // ---------- Attract-mode vector scenes ----------
  // Little vector games take turns behind the hero, in a shuffled order, cross-fading every SCENE_SECONDS: the
  // lander coming down to its pad, a ship clearing an asteroid field, an invader formation against a cannon, a
  // claw on the rim of a tempest tube, a tank's periscope, a star castle's rings, missiles falling on cities, a
  // trench run, a muncher in its maze, a marker cutting up a Qix's field, a ship over Defender's mountains,
  // light cycles on the grid, a ship fighting Gravitar's gravity, a Cobra docking at a Coriolis station, fighters
  // coming at a tail gun, a biplane's guns over the hills, Omega Race's ring of droids, a spider on its web, Major
  // Havoc's run to the reactor, Robotron's grunts and family, a centipede in its mushrooms, a ship towing Thrust's
  // pod out of its cavern, and a well of falling Tetris pieces.
  // Each scene keeps its own state and clock, and only the one(s) on screen are stepped.
  const cv = document.getElementById("attract"), cx = cv.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, stars = [], visible = true, running = false, last = 0;
  const t0 = performance.now();
  const rand = (a, b) => a + Math.random() * (b - a);
  const wrap = (v, lo, span) => ((((v - lo) % span) + span) % span) + lo;
  const beam = (color, blur) => { cx.strokeStyle = color; cx.shadowColor = color; cx.shadowBlur = blur; };
  const SCENE_SECONDS = 15, FADE = 1.2;

  function drawStars(t, depth = .62) {
    cx.shadowBlur = 0;
    for (const [x, y, b] of stars) {
      if (y > H * depth) continue;
      cx.fillStyle = `rgba(213,227,238,${b * (.6 + .4 * Math.sin(t * 2 + x))})`;
      cx.fillRect(x, y, 1.5, 1.5);
    }
  }
  const sparkBurst = (list, x, y, n, speed, color) => {
    for (let i = 0; i < n; i++) {
      const ang = rand(0, Math.PI * 2), sp = rand(speed * .4, speed);
      list.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(.5, 1.1), age: 0, color });
    }
  };
  function drawSparks(list, dt) {
    for (let i = list.length - 1; i >= 0; i--) if ((list[i].age += dt) >= list[i].life) list.splice(i, 1);
    cx.lineWidth = 2;
    for (const sp of list) {
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      const fade = 1 - sp.age / sp.life;
      beam(`rgba(${sp.color ?? "255,200,120"},${fade})`, 12);
      cx.beginPath(); cx.moveTo(sp.x, sp.y); cx.lineTo(sp.x - sp.vx * .1, sp.y - sp.vy * .1); cx.stroke();
    }
  }

  // ----- The lander, coming down to its pad over the mountains -----
  const lander = {
    name: "LUNAR LANDER",
    layout() {
      this.ridge = []; let y = H * .82;
      for (let x = 0; x <= W + 40; x += 40) { y = Math.min(H - 12, Math.max(H * .66, y + rand(-36, 36))); this.ridge.push([x, y]); }
      const padAt = Math.floor(this.ridge.length * .72); // a flat landing pad
      if (this.ridge[padAt + 1]) this.ridge[padAt + 1][1] = this.ridge[padAt][1];
    },
    start() { this.t = 0; },
    draw(t, dt) {
      this.t += dt;
      drawStars(t);
      // perspective grid floor
      beam("rgba(20,48,74,1)", 0); cx.lineWidth = 1;
      const hz = H * .9;
      for (let i = -12; i <= 12; i++) { cx.beginPath(); cx.moveTo(W / 2 + i * 30, hz); cx.lineTo(W / 2 + i * 160, H); cx.stroke(); }
      for (let k = 0; k < 5; k++) {
        const yy = hz + (H - hz) * ((k + (still ? 0 : t * .5) % 1) / 5) ** 1.6;
        cx.beginPath(); cx.moveTo(0, yy); cx.lineTo(W, yy); cx.stroke();
      }
      // mountains and the landing pad
      const ridge = this.ridge;
      beam("#ffb347", 10); cx.lineWidth = 1.6;
      cx.beginPath(); ridge.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y)); cx.stroke();
      const pad = Math.floor(ridge.length * .72), [px, py] = ridge[pad] || [W * .7, H * .8];
      beam("#72ff8f", 12); cx.lineWidth = 3; cx.beginPath(); cx.moveTo(px, py); cx.lineTo(px + 40, py); cx.stroke();
      // the lander: descends toward the pad, sits a moment, then starts over
      const cycle = 14, p = still ? .55 : (this.t % cycle) / cycle;
      // q runs 0 to 1 over the descent and holds at 1 once landed, so the lander sits still on the pad.
      // Resting height: the feet (ly + 14) sit on the pad, allowing for half of each line's width.
      const q = Math.min(1, p * 1.15), rest = py - 14 - 2.3;
      const lx = px + 20 + Math.sin(q * 6) * 30 * (1 - q), ly = H * .12 + (rest - H * .12) * q;
      beam("#5ce1ff", 12); cx.lineWidth = 1.6;
      cx.beginPath();
      cx.moveTo(lx - 9, ly - 8); cx.lineTo(lx + 9, ly - 8); cx.lineTo(lx + 12, ly); cx.lineTo(lx - 12, ly); cx.closePath();
      cx.moveTo(lx - 10, ly); cx.lineTo(lx - 16, ly + 14); cx.moveTo(lx + 10, ly); cx.lineTo(lx + 16, ly + 14);
      cx.moveTo(lx - 19, ly + 14); cx.lineTo(lx - 13, ly + 14); cx.moveTo(lx + 13, ly + 14); cx.lineTo(lx + 19, ly + 14);
      cx.stroke();
      if (!still && p < .85 && Math.sin(t * 40) > -.3) {
        beam("#ff4fd8", 14);
        cx.beginPath(); cx.moveTo(lx - 5, ly + 2); cx.lineTo(lx, ly + 10 + Math.random() * 10); cx.lineTo(lx + 5, ly + 2); cx.stroke();
      }
    },
  };

  // ----- Asteroids: a ship clearing a rock field -----
  // Rocks come in three sizes: big ones split into two medium, medium into two small, and small ones burst
  // into sparks. The ship turns to lead the nearest rock, fires, and keeps its distance; if a rock gets it,
  // it comes apart and returns a moment later, blinking until it is safe.
  const BIG = 30, SMALLEST = 11, MAX_ROCKS = 16, SHOT = 380;
  function makeRock(x, y, size, vx, vy) {
    const n = 10;
    return { x, y, size, vx, vy, a: rand(0, 6.3), va: rand(-.4, .4) * (BIG / size) ** .5,
             pts: Array.from({ length: n }, (_, i) => [i / n * Math.PI * 2, size * rand(.7, 1.1)]) };
  }
  const asteroids = {
    name: "ASTEROIDS",
    layout() {
      const big = W < 600 ? 3 : 6;
      this.big = big;
      this.rocks = Array.from({ length: big + 2 }, (_, i) => {
        const ang = rand(0, 6.3), sp = rand(12, 26);
        // Keep clear of where the ship starts.
        let x, y;
        do { x = rand(0, W); y = rand(0, H); } while (Math.hypot(x - W * .68, y - H * .5) < 140);
        return makeRock(x, y, i < big ? rand(BIG, 42) : rand(16, 22), Math.cos(ang) * sp, Math.sin(ang) * sp);
      });
      this.ship = { x: W * .68, y: H * .5, vx: 0, vy: 0, a: -Math.PI / 2, alive: true, wait: 0, invul: 1.5, fire: 0, thrust: false };
      this.shots = []; this.sparks = []; this.debris = []; this.spawn = 0;
    },
    start() { if (!this.rocks) this.layout(); },
    // The shortest way across the wrapping screen.
    delta(ax, ay, bx, by) {
      let dx = bx - ax, dy = by - ay;
      if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
      if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
      return [dx, dy];
    },
    split(r, dirX, dirY) {
      sparkBurst(this.sparks, r.x, r.y, r.size >= SMALLEST * 1.6 ? 10 : 16, 90);
      if (r.size < SMALLEST * 1.6 || this.rocks.length >= MAX_ROCKS) return [];
      const size = r.size * .58;
      return [1, -1].map(side => makeRock(r.x - dirY * side * size * .5, r.y + dirX * side * size * .5, size,
        r.vx * .6 + dirX * rand(8, 18) - dirY * side * rand(14, 26), r.vy * .6 + dirY * rand(8, 18) + dirX * side * rand(14, 26)));
    },
    step(dt) {
      const s = this.ship, rocks = this.rocks;
      for (const r of rocks) { r.x = wrap(r.x + r.vx * dt, -40, W + 80); r.y = wrap(r.y + r.vy * dt, -40, H + 80); r.a += r.va * dt; }
      // Keep a few big rocks coming in from the edges.
      this.spawn -= dt;
      if (this.spawn <= 0 && rocks.filter(r => r.size >= BIG * .9).length < this.big && rocks.length < MAX_ROCKS) {
        this.spawn = rand(1.5, 3.5);
        const left = Math.random() < .5, sp = rand(14, 26), ang = rand(-.6, .6);
        rocks.push(makeRock(left ? -40 : W + 40, rand(0, H), rand(BIG, 42), Math.cos(ang) * sp * (left ? 1 : -1), Math.sin(ang) * sp));
      }
      // The ship.
      if (!s.alive) {
        s.wait -= dt;
        if (s.wait <= 0) Object.assign(s, { alive: true, x: W * .68, y: H * .5, vx: 0, vy: 0, invul: 2.2 });
      } else {
        s.invul -= dt;
        let best = null, bd = Infinity;
        for (const r of rocks) { const [dx, dy] = this.delta(s.x, s.y, r.x, r.y), d = Math.hypot(dx, dy) - r.size; if (d < bd) { bd = d; best = [r, dx, dy]; } }
        let want = s.a;
        s.thrust = false;
        if (best) {
          const [r, dx, dy] = best, time = Math.hypot(dx, dy) / SHOT;
          want = Math.atan2(dy + (r.vy - s.vy) * time, dx + (r.vx - s.vx) * time);
          // Too close: turn tail and burn away.
          if (bd < 55) { want += Math.PI; s.thrust = true; }
        }
        // Drift back towards its home on the right when nothing presses.
        if (!s.thrust && Math.hypot(s.x - W * .68, s.y - H * .5) > 160) { s.vx += (W * .68 - s.x) * .15 * dt; s.vy += (H * .5 - s.y) * .15 * dt; }
        let err = Math.atan2(Math.sin(want - s.a), Math.cos(want - s.a));
        s.a += Math.max(-4 * dt, Math.min(4 * dt, err));
        if (s.thrust && Math.abs(err) < .5) { s.vx += Math.cos(s.a) * 160 * dt; s.vy += Math.sin(s.a) * 160 * dt; }
        s.vx *= 1 - .6 * dt; s.vy *= 1 - .6 * dt;
        s.x = wrap(s.x + s.vx * dt, 0, W); s.y = wrap(s.y + s.vy * dt, 0, H);
        s.fire -= dt;
        if (best && !s.thrust && Math.abs(err) < .12 && s.fire <= 0 && this.shots.length < 4) {
          s.fire = .24;
          this.shots.push({ x: s.x + Math.cos(s.a) * 12, y: s.y + Math.sin(s.a) * 12, vx: s.vx + Math.cos(s.a) * SHOT, vy: s.vy + Math.sin(s.a) * SHOT, age: 0 });
        }
        if (s.invul <= 0)
          for (const r of rocks) {
            const [dx, dy] = this.delta(s.x, s.y, r.x, r.y);
            if (Math.hypot(dx, dy) < r.size * .85 + 7) {
              s.alive = false; s.wait = 2;
              sparkBurst(this.sparks, s.x, s.y, 14, 110, "92,225,255");
              for (let i = 0; i < 5; i++) this.debris.push({ x: s.x, y: s.y, vx: rand(-60, 60), vy: rand(-60, 60), a: rand(0, 6.3), va: rand(-5, 5), len: rand(8, 14), age: 0 });
              break;
            }
          }
      }
      // Shots.
      for (const b of this.shots) { b.x = wrap(b.x + b.vx * dt, 0, W); b.y = wrap(b.y + b.vy * dt, 0, H); b.age += dt; }
      this.shots = this.shots.filter(b => {
        if (b.age > .9) return false;
        const i = rocks.findIndex(r => { const [dx, dy] = this.delta(b.x, b.y, r.x, r.y); return Math.hypot(dx, dy) < r.size * .9; });
        if (i < 0) return true;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        rocks.push(...this.split(rocks.splice(i, 1)[0], b.vx / sp, b.vy / sp));
        return false;
      });
      for (const d of this.debris) { d.x += d.vx * dt; d.y += d.vy * dt; d.a += d.va * dt; d.age += dt; }
      this.debris = this.debris.filter(d => d.age < 1.6);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, 1);
      beam("rgba(213,227,238,.85)", 6); cx.lineWidth = 1.5;
      for (const r of this.rocks) {
        cx.beginPath();
        r.pts.forEach(([ang, rad], i) => { const X = r.x + Math.cos(ang + r.a) * rad, Y = r.y + Math.sin(ang + r.a) * rad; i ? cx.lineTo(X, Y) : cx.moveTo(X, Y); });
        cx.closePath(); cx.stroke();
      }
      const s = this.ship;
      if (s.alive && (s.invul <= 0 || Math.sin(t * 25) > 0)) {
        const c = Math.cos(s.a) * 1.4, n = Math.sin(s.a) * 1.4, P = (f, side) => [s.x + c * f - n * side, s.y + n * f + c * side];
        beam("#5ce1ff", 12); cx.lineWidth = 1.6;
        cx.beginPath(); cx.moveTo(...P(14, 0)); cx.lineTo(...P(-9, -8)); cx.lineTo(...P(-5, 0)); cx.lineTo(...P(-9, 8)); cx.closePath(); cx.stroke();
        if (s.thrust && Math.sin(t * 50) > -.2) {
          beam("#ff4fd8", 12);
          cx.beginPath(); cx.moveTo(...P(-6, -4)); cx.lineTo(...P(-14 - Math.random() * 6, 0)); cx.lineTo(...P(-6, 4)); cx.stroke();
        }
      }
      beam("#ffffff", 8); cx.fillStyle = "#ffffff";
      for (const b of this.shots) cx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
      beam("rgba(92,225,255,.9)", 10); cx.lineWidth = 1.5;
      for (const d of this.debris) {
        const hx = Math.cos(d.a) * d.len / 2, hy = Math.sin(d.a) * d.len / 2;
        cx.globalAlpha *= 1 - d.age / 1.6;
        cx.beginPath(); cx.moveTo(d.x - hx, d.y - hy); cx.lineTo(d.x + hx, d.y + hy); cx.stroke();
        cx.globalAlpha /= Math.max(.001, 1 - d.age / 1.6);
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Invaders: a marching formation against a cannon behind its bunkers -----
  // The aliens are this site's own designs (three kinds, two frames each), drawn once into small glowing
  // sprites. The formation steps faster as it thins; the cannon picks a target, lines up, fires, and side-steps
  // bombs; a saucer crosses the top now and then.
  const ALIENS = [
    [["...XXXXX...", "..XXXXXXX..", ".XX..X..XX.", ".XX.XXX.XX.", ".XXXXXXXXX.", "..X.X.X.X..", ".X.X...X.X.", "..........."],
     ["...XXXXX...", "..XXXXXXX..", ".XX..X..XX.", ".XX.XXX.XX.", ".XXXXXXXXX.", "..X.X.X.X..", "...X.X.X...", "..........."]],
    [["X.........X", ".X..XXX..X.", "..XXXXXXX..", ".XXX.X.XXX.", "XXXXXXXXXXX", "X..XXXXX..X", "..X.....X..", "..........."],
     ["X.........X", ".X..XXX..X.", "..XXXXXXX..", ".XXX.X.XXX.", "XXXXXXXXXXX", ".X.XXXXX.X.", "X.X.....X.X", "..........."]],
    [["....XXX....", ".XXXXXXXXX.", "XXX.XXX.XXX", "XXXXXXXXXXX", "..XX.X.XX..", ".XX.....XX.", "XX.......XX", "..........."],
     ["....XXX....", ".XXXXXXXXX.", "XXX.XXX.XXX", "XXXXXXXXXXX", "..XX.X.XX..", "..X.....X..", "...X...X...", "..........."]],
  ];
  const ALIEN_COLOURS = ["#ff4fd8", "#5ce1ff", "#72ff8f"];
  const BUNKER = ["....XXXXXXXXXX....", "..XXXXXXXXXXXXXX..", ".XXXXXXXXXXXXXXXX.", "XXXXXXXXXXXXXXXXXX", "XXXXXXXXXXXXXXXXXX",
                  "XXXXXXXXXXXXXXXXXX", "XXXXXXXXXXXXXXXXXX", "XXXXX........XXXXX", "XXXX..........XXXX", "XXX............XXX"];
  const spriteCache = new Map();
  // The outline of a block of lit cells: an edge wherever a lit cell meets an unlit one, so pixel art
  // reads as wireframe.
  function outline(lit, w, h, line) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!lit(x, y)) continue;
        if (!lit(x, y - 1)) line(x, y, x + 1, y);
        if (!lit(x, y + 1)) line(x, y + 1, x + 1, y + 1);
        if (!lit(x - 1, y)) line(x, y, x, y + 1);
        if (!lit(x + 1, y)) line(x + 1, y, x + 1, y + 1);
      }
  }
  function sprite(kind, frame, px) {
    const key = `${kind}/${frame}/${px}`;
    if (spriteCache.has(key)) return spriteCache.get(key);
    const rows = ALIENS[kind][frame], pad = 8, c = document.createElement("canvas");
    c.width = 11 * px + pad * 2; c.height = 8 * px + pad * 2;
    const g = c.getContext("2d");
    g.strokeStyle = g.shadowColor = ALIEN_COLOURS[kind]; g.shadowBlur = 8; g.lineWidth = 1.3; g.lineCap = "square";
    const lit = (x, y) => rows[y]?.[x] === "X";
    g.beginPath();
    outline(lit, 11, 8, (x0, y0, x1, y1) => { g.moveTo(pad + x0 * px, pad + y0 * px); g.lineTo(pad + x1 * px, pad + y1 * px); });
    g.stroke();
    spriteCache.set(key, c);
    return c;
  }
  const invaders = {
    name: "INVADERS",
    layout() {
      const px = this.px = W < 700 ? 2 : 3;
      this.cw = 16 * px; this.ch = 13 * px;
      // On a wide screen they keep to the right, clear of the hero's words; on a phone they have it all.
      this.left = W < 700 ? W * .06 : W * .46; this.right = W - 16;
      this.cols = Math.max(4, Math.min(9, Math.floor((this.right - this.left) * .72 / this.cw)));
      this.ground = H - 18; this.gunY = H - 34;
      this.bunkers = [];
      const nb = W < 700 ? 2 : 4, span = this.right - this.left;
      for (let i = 0; i < nb; i++) {
        const bx = this.left + span * (i + .5) / nb - 9 * px, by = this.gunY - 48 - 10 * px;
        BUNKER.forEach((r, y) => [...r].forEach((ch, x) => ch === "X" && this.bunkers.push({ x: bx + x * px, y: by + y * px, b: i, gx: x, gy: y })));
      }
      this.gun = { x: (this.left + this.right) / 2, alive: true, wait: 0, target: null };
      this.newWave();
      this.ufo = null; this.ufoWait = rand(6, 10);
    },
    start() { if (!this.aliens) this.layout(); },
    newWave() {
      this.aliens = [];
      for (let r = 0; r < 5; r++) for (let c = 0; c < this.cols; c++) this.aliens.push({ r, c, kind: r === 0 ? 0 : r < 3 ? 1 : 2, alive: true });
      this.fx = this.left; this.fy = H * .07; this.dir = 1; this.frame = 0; this.stepWait = 0;
      this.shot = null; this.bombs = []; this.booms = []; this.sparks = this.sparks ?? []; this.restart = 0;
    },
    pos(a) { return [this.fx + a.c * this.cw, this.fy + a.r * this.ch]; },
    step(dt) {
      const px = this.px, live = this.aliens.filter(a => a.alive);
      if (this.restart > 0) { this.restart -= dt; if (this.restart <= 0) this.newWave(); return; }
      if (!live.length) { this.restart = 1.5; return; }
      // March: a step at a time, faster as the formation thins; down a row at each edge.
      this.stepWait -= dt;
      if (this.stepWait <= 0) {
        this.stepWait = .04 + .5 * live.length / this.aliens.length;
        this.frame ^= 1;
        const xs = live.map(a => this.pos(a)[0]), lo = Math.min(...xs), hi = Math.max(...xs) + 11 * px;
        if ((this.dir > 0 && hi + 3 * px > this.right) || (this.dir < 0 && lo - 3 * px < this.left)) { this.dir *= -1; this.fy += 3 * px; }
        else this.fx += this.dir * 3 * px;
        // Down to the bunkers: they've landed, and it starts again.
        if (Math.max(...live.map(a => this.pos(a)[1])) + 8 * px > this.gunY - 50) { this.restart = 1.2; sparkBurst(this.sparks, this.gun.x, this.gunY, 20, 120, "114,255,143"); return; }
      }
      // Bombs from the bottom alien of a column.
      if (Math.random() < 1.1 * dt && this.bombs.length < 4) {
        const bottoms = Object.values(live.reduce((m, a) => ((!m[a.c] || m[a.c].r < a.r) && (m[a.c] = a), m), {}));
        const a = bottoms[Math.floor(Math.random() * bottoms.length)];
        if (a) { const [x, y] = this.pos(a); this.bombs.push({ x: x + 5.5 * px, y: y + 8 * px }); }
      }
      for (const b of this.bombs) b.y += 150 * dt;
      // The cannon: dodge a bomb overhead, otherwise line up under a target and fire.
      const g = this.gun;
      if (!g.alive) { g.wait -= dt; if (g.wait <= 0) g.alive = true; }
      else {
        const threat = this.bombs.find(b => b.y > this.gunY - 140 && Math.abs(b.x - g.x) < 16);
        let want;
        if (threat) want = g.x + (threat.x < g.x ? 40 : -40);
        else {
          if (!g.target || !g.target.alive) {
            const bottoms = Object.values(live.reduce((m, a) => ((!m[a.c] || m[a.c].r < a.r) && (m[a.c] = a), m), {}));
            g.target = bottoms[Math.floor(Math.random() * bottoms.length)];
          }
          want = g.target ? this.pos(g.target)[0] + 5.5 * px + this.dir * 6 * px : g.x;
          if (this.ufo && !this.shot && Math.abs(this.ufo.x - g.x) < 140) want = this.ufo.x + this.ufo.dir * 60;
        }
        want = Math.max(this.left + 12, Math.min(this.right - 12, want));
        g.x += Math.max(-150 * dt, Math.min(150 * dt, want - g.x));
        if (!threat && !this.shot && Math.abs(want - g.x) < 4) this.shot = { x: g.x, y: this.gunY - 10 };
      }
      // The cannon's shot.
      if (this.shot) {
        const s = this.shot; s.y -= 520 * dt;
        const hit = live.find(a => { const [x, y] = this.pos(a); return s.x > x && s.x < x + 11 * px && s.y > y && s.y < y + 8 * px; });
        if (hit) { hit.alive = false; const [x, y] = this.pos(hit); this.booms.push({ x: x + 5.5 * px, y: y + 4 * px, age: 0, color: ALIEN_COLOURS[hit.kind] }); this.shot = null; }
        else if (this.ufo && Math.abs(s.x - this.ufo.x) < 18 && Math.abs(s.y - this.ufo.y) < 8) {
          sparkBurst(this.sparks, this.ufo.x, this.ufo.y, 22, 130, "255,79,216"); this.ufo = null; this.shot = null;
        } else if (s.y < 0) this.shot = null;
      }
      // Bunkers wear away under shots and bombs.
      const chip = (x, y) => {
        const i = this.bunkers.findIndex(c => x >= c.x - 1 && x <= c.x + px + 1 && y >= c.y - 1 && y <= c.y + px + 1);
        if (i < 0) return false;
        this.bunkers = this.bunkers.filter(c => Math.hypot(c.x - this.bunkers[i].x, c.y - this.bunkers[i].y) > px * 1.6);
        return true;
      };
      if (this.shot && chip(this.shot.x, this.shot.y)) this.shot = null;
      this.bombs = this.bombs.filter(b => {
        if (chip(b.x, b.y)) return false;
        if (g.alive && Math.abs(b.x - g.x) < 12 && b.y > this.gunY - 8) {
          g.alive = false; g.wait = 1.6; g.target = null;
          sparkBurst(this.sparks, g.x, this.gunY, 18, 120, "114,255,143");
          return false;
        }
        return b.y < this.ground;
      });
      // The saucer.
      this.ufoWait -= dt;
      if (!this.ufo && this.ufoWait <= 0) {
        const dir = Math.random() < .5 ? 1 : -1;
        this.ufo = { x: dir > 0 ? this.left - 30 : this.right + 30, y: H * .07, dir };
        this.ufoWait = rand(9, 14);
      }
      if (this.ufo) { this.ufo.x += this.ufo.dir * 90 * dt; if (this.ufo.x < this.left - 40 || this.ufo.x > this.right + 40) this.ufo = null; }
      for (const b of this.booms) b.age += dt;
      this.booms = this.booms.filter(b => b.age < .35);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, .5);
      const px = this.px, alpha = cx.globalAlpha;
      // The formation marches behind the hero's words, so it's drawn a little faint, like the rocks.
      cx.globalAlpha = alpha * .62;
      for (const a of this.aliens) {
        if (!a.alive) continue;
        const [x, y] = this.pos(a);
        cx.drawImage(sprite(a.kind, this.frame, px), x - 8, y - 8);
      }
      cx.globalAlpha = alpha;
      // Bursts where aliens were hit.
      for (const b of this.booms) {
        beam(b.color, 10); cx.lineWidth = 1.5;
        const r = 4 + b.age * 40;
        cx.beginPath();
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; cx.moveTo(b.x + Math.cos(a) * r * .4, b.y + Math.sin(a) * r * .4); cx.lineTo(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r); }
        cx.stroke();
      }
      // Bunkers.
      const cells = new Map(this.bunkers.map(c => [`${c.b}:${c.gx},${c.gy}`, c]));
      beam("rgba(114,255,143,.85)", 6); cx.lineWidth = 1.2;
      cx.beginPath();
      for (const c of this.bunkers) {
        const has = (dx, dy) => cells.has(`${c.b}:${c.gx + dx},${c.gy + dy}`);
        if (!has(0, -1)) { cx.moveTo(c.x, c.y); cx.lineTo(c.x + px, c.y); }
        if (!has(0, 1)) { cx.moveTo(c.x, c.y + px); cx.lineTo(c.x + px, c.y + px); }
        if (!has(-1, 0)) { cx.moveTo(c.x, c.y); cx.lineTo(c.x, c.y + px); }
        if (!has(1, 0)) { cx.moveTo(c.x + px, c.y); cx.lineTo(c.x + px, c.y + px); }
      }
      cx.stroke();
      // The ground and the cannon.
      beam("rgba(114,255,143,.7)", 6); cx.lineWidth = 1.5;
      cx.beginPath(); cx.moveTo(this.left - 10, this.ground); cx.lineTo(this.right + 10, this.ground); cx.stroke();
      const g = this.gun;
      if (g.alive) {
        beam("#72ff8f", 12); cx.lineWidth = 1.6;
        const y = this.gunY;
        cx.beginPath();
        cx.moveTo(g.x - 14, y + 8); cx.lineTo(g.x + 14, y + 8); cx.lineTo(g.x + 14, y + 1); cx.lineTo(g.x + 4, y - 2);
        cx.lineTo(g.x + 2, y - 9); cx.lineTo(g.x - 2, y - 9); cx.lineTo(g.x - 4, y - 2); cx.lineTo(g.x - 14, y + 1); cx.closePath();
        cx.stroke();
      }
      // Shot, bombs (zigzag) and the saucer.
      beam("#ffffff", 8); cx.lineWidth = 2;
      if (this.shot) { cx.beginPath(); cx.moveTo(this.shot.x, this.shot.y); cx.lineTo(this.shot.x, this.shot.y + 9); cx.stroke(); }
      beam("#ffb347", 8); cx.lineWidth = 1.5;
      for (const b of this.bombs) {
        const k = Math.floor(b.y / 4) % 2 ? 2 : -2;
        cx.beginPath(); cx.moveTo(b.x, b.y - 9); cx.lineTo(b.x + k, b.y - 6); cx.lineTo(b.x - k, b.y - 3); cx.lineTo(b.x, b.y); cx.stroke();
      }
      if (this.ufo) {
        const u = this.ufo;
        beam("#ff4fd8", 12); cx.lineWidth = 1.6;
        cx.beginPath();
        cx.moveTo(u.x - 18, u.y + 3); cx.lineTo(u.x - 10, u.y - 3); cx.lineTo(u.x + 10, u.y - 3); cx.lineTo(u.x + 18, u.y + 3); cx.closePath();
        cx.moveTo(u.x - 6, u.y - 3); cx.lineTo(u.x - 3, u.y - 8); cx.lineTo(u.x + 3, u.y - 8); cx.lineTo(u.x + 6, u.y - 3);
        cx.stroke();
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Tempest: a claw on the rim of a tube, shooting down its lanes -----
  // The tube is seen end on: an outer rim and a small far rim, joined lane by lane. Flippers climb out of the
  // depths, flipping from lane to lane and leaving spikes; one that reaches the rim crawls round it towards the
  // claw. The claw follows the nearest flipper and fires down its lane. The tube's shape changes each time.
  const TUBES = [
    n => Array.from({ length: n }, (_, i) => [Math.cos(i / n * Math.PI * 2 - Math.PI / 2), Math.sin(i / n * Math.PI * 2 - Math.PI / 2)]),
    () => [[-1, -1], [-.5, -1], [0, -1], [.5, -1], [1, -1], [1, -.5], [1, 0], [1, .5], [1, 1], [.5, 1], [0, 1], [-.5, 1], [-1, 1], [-1, .5], [-1, 0], [-1, -.5]],
    n => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2 - Math.PI / 2, r = i % 2 ? .55 : 1; return [Math.cos(a) * r, Math.sin(a) * r]; }),
    () => [[-.35, -1], [.35, -1], [.35, -.35], [1, -.35], [1, .35], [.35, .35], [.35, 1], [-.35, 1], [-.35, .35], [-1, .35], [-1, -.35], [-.35, -.35]],
  ];
  const tempest = {
    name: "TEMPEST",
    shape: -1,
    layout() {
      this.cxT = W < 700 ? W * .5 : W * .7; this.cyT = H * .5;
      this.R = Math.min(H * .42, W < 700 ? W * .42 : W * .25);
      this.build();
    },
    build() {
      const pts = TUBES[Math.max(0, this.shape) % TUBES.length](16);
      this.outer = pts.map(([x, y]) => [this.cxT + x * this.R, this.cyT + y * this.R]);
      // The far rim, small and a little above centre, as if looking slightly down the tube.
      this.inner = pts.map(([x, y]) => [this.cxT + x * this.R * .16, this.cyT - this.R * .06 + y * this.R * .16]);
      this.n = pts.length;
      this.claw = { lane: 0, at: 0, alive: true, wait: 0, fire: 0 };
      this.flippers = []; this.shots = []; this.spikes = new Array(this.n).fill(0); this.sparks = []; this.spawn = .5;
    },
    start() { this.shape++; this.build(); },
    // A point on a lane's edge `edge` (0..n) at depth d (0 far, 1 rim).
    edgeAt(edge, d) {
      const i = ((edge % this.n) + this.n) % this.n, o = this.outer[i], f = this.inner[i], e = d * d;
      return [f[0] + (o[0] - f[0]) * e, f[1] + (o[1] - f[1]) * e];
    },
    // A point across a lane: `lane` may be fractional while something flips between lanes.
    at(lane, across, d) {
      const l = Math.floor(lane), frac = lane - l;
      const p = (k, t) => { const a = this.edgeAt(k, d), b = this.edgeAt(k + 1, d); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
      const a = p(l, across), b = p(l + 1, across);
      return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
    },
    laneGap(a, b) { let d = b - a; if (d > this.n / 2) d -= this.n; if (d < -this.n / 2) d += this.n; return d; },
    step(dt) {
      const n = this.n, c = this.claw;
      // New flippers from the far end.
      this.spawn -= dt;
      if (this.spawn <= 0 && this.flippers.length < 6) {
        this.spawn = rand(.6, 1.3);
        this.flippers.push({ lane: Math.floor(rand(0, n)), d: 0, speed: rand(.1, .2), flip: 0, dir: 1, wait: rand(.8, 2) });
      }
      for (const f of this.flippers) {
        if (f.flip) {
          // Mid-flip: when it lands it is in the next lane.
          f.flip += dt * 3;
          if (f.flip >= 1) { f.lane = ((f.lane + f.dir) % n + n) % n; f.flip = 0; }
          continue;
        }
        if (f.d < 1) {
          f.d = Math.min(1, f.d + f.speed * dt);
          // Spikes grow behind a climbing flipper now and then.
          if (Math.random() < .25 * dt) this.spikes[f.lane] = Math.min(.55, Math.max(this.spikes[f.lane], f.d));
          f.wait -= dt;
          if (f.wait <= 0) { f.wait = rand(1, 2.5); f.dir = Math.random() < .5 ? 1 : -1; f.flip = .001; }
        } else {
          // On the rim: flip round towards the claw.
          f.wait -= dt;
          if (f.wait <= 0) { f.wait = .45; f.dir = Math.sign(this.laneGap(f.lane, c.lane)) || 1; f.flip = .001; }
          if (c.alive && f.lane === c.lane) {
            c.alive = false; c.wait = 1.4; f.dead = true;
            const [x, y] = this.at(c.lane, .5, 1);
            sparkBurst(this.sparks, x, y, 24, 140, "255,225,74");
          }
        }
      }
      // The claw: round the rim to the most pressing flipper's lane, firing down it.
      if (!c.alive) { c.wait -= dt; if (c.wait <= 0) { c.alive = true; this.flippers = this.flippers.filter(f => f.d < 1); } }
      else {
        const target = this.flippers.filter(f => !f.dead).sort((a, b) => b.d - a.d)[0];
        let want = target ? target.lane : this.spikes.indexOf(Math.max(...this.spikes));
        const gap = this.laneGap(c.lane, want);
        c.at += dt;
        if (gap !== 0 && c.at > .09) { c.at = 0; c.lane = ((c.lane + Math.sign(gap)) % n + n) % n; }
        c.fire -= dt;
        // It lets a flipper climb into view before firing on it.
        if (gap === 0 && c.fire <= 0 && this.shots.length < 6 && (!target || target.d > .4)) { c.fire = .16; this.shots.push({ lane: c.lane, d: 1 }); }
      }
      // Shots down the lanes: they hit flippers, and wear spikes down.
      for (const s of this.shots) {
        s.d -= 1.9 * dt;
        const f = this.flippers.find(f => !f.dead && f.lane === s.lane && (!f.flip || f.flip < .5) && Math.abs(f.d - s.d) < .07);
        if (f) {
          f.dead = true; s.dead = true;
          const [x, y] = this.at(f.lane + (f.flip ? f.flip * f.dir : 0), .5, f.d);
          sparkBurst(this.sparks, x, y, 14, 90, "255,74,74");
        } else if (s.d < this.spikes[s.lane]) { this.spikes[s.lane] = Math.max(0, this.spikes[s.lane] - .08); s.dead = true; }
        else if (s.d <= 0) s.dead = true;
      }
      this.shots = this.shots.filter(s => !s.dead);
      this.flippers = this.flippers.filter(f => !f.dead);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, 1);
      const n = this.n;
      // The tube: both rims and the lanes between them.
      beam("#3a6cff", 10); cx.lineWidth = 1.4;
      cx.beginPath();
      for (const rim of [this.outer, this.inner]) { rim.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y)); cx.closePath(); }
      for (let i = 0; i < n; i++) { cx.moveTo(...this.inner[i]); cx.lineTo(...this.outer[i]); }
      cx.stroke();
      // Spikes.
      beam("#72ff8f", 8); cx.lineWidth = 1.6;
      cx.beginPath();
      this.spikes.forEach((len, lane) => { if (len > .01) { cx.moveTo(...this.at(lane, .5, 0)); cx.lineTo(...this.at(lane, .5, len)); } });
      cx.stroke();
      // Flippers: a bow tie across the lane, turning end over end as they flip.
      beam("#ff4a4a", 10); cx.lineWidth = 1.5;
      for (const f of this.flippers) {
        const lane = f.lane + (f.flip ? f.flip * f.dir : 0), w = .06 + .05 * f.d;
        const tilt = f.flip ? Math.sin(f.flip * Math.PI) * w : 0;
        const a = this.at(lane, .08, f.d - w + tilt), b = this.at(lane, .92, f.d + w - tilt);
        const c2 = this.at(lane, .92, f.d - w), d2 = this.at(lane, .08, f.d + w);
        cx.beginPath(); cx.moveTo(...a); cx.lineTo(...b); cx.lineTo(...c2); cx.lineTo(...d2); cx.closePath(); cx.stroke();
      }
      // Shots.
      beam("#ffffff", 8); cx.fillStyle = "#ffffff";
      for (const s of this.shots) { const [x, y] = this.at(s.lane, .5, s.d); cx.fillRect(x - 2, y - 2, 4, 4); }
      // The claw on the rim.
      const c = this.claw;
      if (c.alive) {
        beam("#ffe14a", 12); cx.lineWidth = 1.8;
        const P = (across, d) => this.at(c.lane, across, d);
        cx.beginPath();
        // Sitting on the rim with its two jaws pointing down the lane.
        cx.moveTo(...P(0, 1)); cx.lineTo(...P(.18, .955)); cx.lineTo(...P(.36, .978)); cx.lineTo(...P(.5, .945)); cx.lineTo(...P(.64, .978));
        cx.lineTo(...P(.82, .955)); cx.lineTo(...P(1, 1)); cx.lineTo(...P(.5, .99)); cx.closePath();
        cx.stroke();
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Battlezone: the view from a tank's periscope -----
  // First person, in green wireframe: mountains on the horizon turn as the turret does, pyramids and blocks
  // stand about the plain, and enemy tanks roll in. The turret swings onto the nearest, fires, and a hit sends
  // the tank flying apart in lines. Now and then an enemy shell gets through and cracks the glass.
  const TANK_V = [[-1.3, 0, -2], [1.3, 0, -2], [1.3, 0, 2.2], [-1.3, 0, 2.2], [-1.1, .7, -1.7], [1.1, .7, -1.7], [1.1, .7, 1.6], [-1.1, .7, 1.6],
    [-1.3, .35, 2.6], [1.3, .35, 2.6], [-.6, .7, -.8], [.6, .7, -.8], [.6, .7, .6], [-.6, .7, .6], [-.5, 1.2, -.6], [.5, 1.2, -.6], [.5, 1.2, .4], [-.5, 1.2, .4],
    [0, 1, .5], [0, 1, 3]];
  const TANK_E = [[0, 1], [1, 2], [2, 3], [3, 0], [2, 9], [3, 8], [8, 9], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [9, 6], [8, 7],
    [10, 11], [11, 12], [12, 13], [13, 10], [14, 15], [15, 16], [16, 17], [17, 14], [10, 14], [11, 15], [12, 16], [13, 17], [18, 19]];
  const PYRAMID = { v: [[-1.5, 0, -1.5], [1.5, 0, -1.5], [1.5, 0, 1.5], [-1.5, 0, 1.5], [0, 3, 0]], e: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]] };
  const BLOCK = { v: [[-1.2, 0, -1.2], [1.2, 0, -1.2], [1.2, 0, 1.2], [-1.2, 0, 1.2], [-1.2, 2.4, -1.2], [1.2, 2.4, -1.2], [1.2, 2.4, 1.2], [-1.2, 2.4, 1.2]],
                  e: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] };
  const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const battlezone = {
    name: "BATTLEZONE",
    layout() {
      this.horizon = H * .6; this.F = Math.min(W, H * 1.7) * .55; this.cxs = W < 700 ? W * .5 : W * .64;
      if (!this.peaks) this.reset();
    },
    reset() {
      this.h = 0; this.shell = null; this.enemyShells = []; this.bits = []; this.crack = 0; this.spawnWait = 0;
      // Mountains all round the horizon, and a few things standing on the plain.
      this.peaks = Array.from({ length: 72 }, () => rand(6, 34));
      for (let i = 0; i < 72; i += 9) this.peaks[i] = rand(40, 64);
      this.props = Array.from({ length: 16 }, (_, i) => { const a = rand(0, 6.3), d = rand(14, 70); return { x: Math.sin(a) * d, z: Math.cos(a) * d, m: i % 2 ? PYRAMID : BLOCK, yaw: rand(0, 1.6) }; });
      this.tanks = [this.newTank(rand(-.8, .8)), this.newTank(rand(2, 4))];
    },
    newTank(bearing) { const d = rand(45, 60); return { x: Math.sin(bearing) * d, z: Math.cos(bearing) * d, yaw: bearing + Math.PI, fire: rand(4, 7) }; },
    start() { if (!this.peaks) this.reset(); },
    // World to camera: the player sits at the origin, looking along its heading.
    cam(x, y, z) {
      const s = Math.sin(this.h), c = Math.cos(this.h);
      return [x * c - z * s, y - 1.1, x * s + z * c];
    },
    line(a, b) {
      let [ax, ay, az] = a, [bx, by, bz] = b;
      const near = .4;
      if (az < near && bz < near) return;
      if (az < near) { const k = (near - az) / (bz - az); ax += (bx - ax) * k; ay += (by - ay) * k; az = near; }
      if (bz < near) { const k = (near - bz) / (az - bz); bx += (ax - bx) * k; by += (ay - by) * k; bz = near; }
      cx.moveTo(this.cxs + ax / az * this.F, this.horizon - ay / az * this.F);
      cx.lineTo(this.cxs + bx / bz * this.F, this.horizon - by / bz * this.F);
    },
    model(m, x, z, yaw, lift = 0) {
      const s = Math.sin(yaw), c = Math.cos(yaw);
      const pts = m.v.map(([vx, vy, vz]) => this.cam(x + vx * c + vz * s, vy + lift, z - vx * s + vz * c));
      for (const [i, j] of m.e) this.line(pts[i], pts[j]);
    },
    step(dt) {
      // Enemies roll in, turn to face the player, and fire now and then.
      for (const tk of this.tanks) {
        const d = Math.hypot(tk.x, tk.z), toMe = Math.atan2(-tk.x, -tk.z);
        tk.yaw += Math.max(-.5 * dt, Math.min(.5 * dt, angleTo(tk.yaw, toMe)));
        if (d > 18) { tk.x += Math.sin(tk.yaw) * 3 * dt; tk.z += Math.cos(tk.yaw) * 3 * dt; }
        tk.fire -= dt;
        if (tk.fire <= 0 && Math.abs(angleTo(tk.yaw, toMe)) < .15 && !this.crack) {
          tk.fire = rand(6, 10);
          this.enemyShells.push({ x: tk.x + Math.sin(tk.yaw) * 3, z: tk.z + Math.cos(tk.yaw) * 3, vx: Math.sin(tk.yaw) * 16, vz: Math.cos(tk.yaw) * 16 });
        }
      }
      for (const es of this.enemyShells) { es.x += es.vx * dt; es.z += es.vz * dt; if (Math.hypot(es.x, es.z) < 1.5) { es.hit = true; this.crack = 1.8; this.crackAt = [rand(-.25, .25), rand(-.2, .2)]; } }
      this.enemyShells = this.enemyShells.filter(es => !es.hit && Math.hypot(es.x, es.z) < 90);
      if (this.crack > 0) {
        this.crack -= dt;
        if (this.crack <= 0) { this.crack = 0; this.tanks = this.tanks.map(() => this.newTank(rand(0, 6.3))); this.enemyShells = []; }
        return;
      }
      // The turret: onto the nearest tank, then fire.
      const target = this.tanks.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
      if (target) {
        const err = angleTo(this.h, Math.atan2(target.x, target.z));
        this.h += Math.max(-.8 * dt, Math.min(.8 * dt, err));
        if (Math.abs(err) < .02 && !this.shell) this.shell = { x: Math.sin(this.h) * 2, z: Math.cos(this.h) * 2, vx: Math.sin(this.h) * 45, vz: Math.cos(this.h) * 45, age: 0 };
      }
      if (this.shell) {
        const sh = this.shell; sh.x += sh.vx * dt; sh.z += sh.vz * dt; sh.age += dt;
        const hit = this.tanks.find(tk => Math.hypot(tk.x - sh.x, tk.z - sh.z) < 2.6);
        if (hit) {
          // The tank comes apart: every edge flies off on its own.
          const s = Math.sin(hit.yaw), c = Math.cos(hit.yaw);
          for (const [i, j] of TANK_E) {
            const [ax, ay, az] = TANK_V[i], [bx, by, bz] = TANK_V[j];
            this.bits.push({ a: [hit.x + ax * c + az * s, ay, hit.z - ax * s + az * c], b: [hit.x + bx * c + bz * s, by, hit.z - bx * s + bz * c],
                             v: [rand(-5, 5), rand(4, 10), rand(-5, 5)], age: 0 });
          }
          this.tanks.splice(this.tanks.indexOf(hit), 1);
          this.shell = null; this.spawnWait = 2.5;
        } else if (sh.age > 2) this.shell = null;
      }
      this.spawnWait -= dt;
      if (this.tanks.length < 2 && this.spawnWait <= 0) { this.tanks.push(this.newTank(this.h + rand(-2.5, 2.5))); this.spawnWait = 3; }
      for (const b of this.bits) {
        b.age += dt; b.v[1] -= 12 * dt;
        for (const p of [b.a, b.b]) { p[0] += b.v[0] * dt; p[1] = Math.max(0, p[1] + b.v[1] * dt); p[2] += b.v[2] * dt; }
      }
      this.bits = this.bits.filter(b => b.age < 2.2);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, .5);
      const G = "#72ff8f";
      // The horizon, the mountains beyond it (they turn with the turret but never come nearer), and a moon.
      beam(G, 8); cx.lineWidth = 1.4;
      cx.beginPath(); cx.moveTo(0, this.horizon); cx.lineTo(W, this.horizon); cx.stroke();
      cx.beginPath();
      let pen = false;
      for (let i = 0; i <= 72; i++) {
        const rel = angleTo(this.h, (i % 72) * Math.PI * 2 / 72);
        if (Math.abs(rel) > 1.25) { pen = false; continue; }
        const x = this.cxs + Math.tan(rel) * this.F, y = this.horizon - this.peaks[i % 72] * (H / 400);
        pen ? cx.lineTo(x, y) : cx.moveTo(x, y); pen = true;
      }
      cx.stroke();
      const moonRel = angleTo(this.h, 1.1);
      if (Math.abs(moonRel) < 1.1) {
        const mx = this.cxs + Math.tan(moonRel) * this.F, my = this.horizon - H * .32;
        beam("#d5e3ee", 8); cx.lineWidth = 1.3;
        cx.beginPath(); cx.arc(mx, my, 16, .6, 5.6); cx.arc(mx + 7, my - 3, 13, 5.2, 1.0, true); cx.stroke();
      }
      // The plain: obstacles, enemy tanks, shells and wreckage.
      beam(G, 8); cx.lineWidth = 1.3;
      cx.beginPath();
      for (const pr of this.props) this.model(pr.m, pr.x, pr.z, pr.yaw);
      for (const tk of this.tanks) this.model({ v: TANK_V, e: TANK_E }, tk.x, tk.z, tk.yaw);
      cx.stroke();
      beam("#ff4a4a", 10); cx.lineWidth = 1.6;
      cx.beginPath();
      for (const es of this.enemyShells) {
        const p = [[0, .9, -.5], [0, .9, .5], [-.3, .9, 0], [.3, .9, 0]].map(([x, y, z]) => this.cam(es.x + x, y, es.z + z));
        this.line(p[0], p[1]); this.line(p[2], p[3]);
      }
      cx.stroke();
      if (this.shell) {
        beam("#ffffff", 10); cx.lineWidth = 2;
        cx.beginPath(); const sh = this.shell; this.line(this.cam(sh.x, .9, sh.z), this.cam(sh.x + sh.vx * .03, .9, sh.z + sh.vz * .03)); cx.stroke();
      }
      beam(G, 10); cx.lineWidth = 1.5;
      for (const b of this.bits) {
        cx.globalAlpha *= 1 - b.age / 2.2;
        cx.beginPath(); this.line(this.cam(...b.a), this.cam(...b.b)); cx.stroke();
        cx.globalAlpha /= Math.max(.001, 1 - b.age / 2.2);
      }
      // The gunsight.
      beam(G, 8); cx.lineWidth = 1.5;
      const sx = this.cxs, sy = this.horizon - 20;
      cx.beginPath();
      cx.moveTo(sx, sy - 40); cx.lineTo(sx, sy - 14); cx.moveTo(sx, sy + 14); cx.lineTo(sx, sy + 40);
      cx.moveTo(sx - 30, sy - 40); cx.lineTo(sx + 30, sy - 40); cx.moveTo(sx - 30, sy + 40); cx.lineTo(sx + 30, sy + 40);
      cx.moveTo(sx - 30, sy - 40); cx.lineTo(sx - 30, sy - 30); cx.moveTo(sx + 30, sy - 40); cx.lineTo(sx + 30, sy - 30);
      cx.moveTo(sx - 30, sy + 40); cx.lineTo(sx - 30, sy + 30); cx.moveTo(sx + 30, sy + 40); cx.lineTo(sx + 30, sy + 30);
      cx.stroke();
      // The radar, with its sweep and a blip for each enemy.
      const rx = W - 64, ry = 64, rr = 40;
      beam("rgba(114,255,143,.8)", 6); cx.lineWidth = 1.2;
      cx.beginPath(); cx.arc(rx, ry, rr, 0, Math.PI * 2); cx.moveTo(rx, ry - 4); cx.lineTo(rx, ry - rr); cx.stroke();
      const sweep = t * 2.4;
      beam(G, 6); cx.beginPath(); cx.moveTo(rx, ry); cx.lineTo(rx + Math.sin(sweep) * rr, ry - Math.cos(sweep) * rr); cx.stroke();
      cx.fillStyle = "#ff4a4a"; cx.shadowColor = "#ff4a4a";
      for (const tk of this.tanks) {
        const d = Math.hypot(tk.x, tk.z), rel = angleTo(this.h, Math.atan2(tk.x, tk.z));
        if (d > 80) continue;
        const k = d / 80 * rr;
        cx.fillRect(rx + Math.sin(rel) * k - 2, ry - Math.cos(rel) * k - 2, 4, 4);
      }
      // A hit: the glass cracks.
      if (this.crack > 0) {
        const [ox, oy] = this.crackAt, px = this.cxs + ox * W * .3, py = this.horizon + oy * H;
        beam("rgba(213,227,238,.9)", 8); cx.lineWidth = 1.5;
        cx.beginPath();
        for (let i = 0; i < 9; i++) {
          let a = i * .7 + 1.3 * Math.sin(i * 2.1), x = px, y = py;
          cx.moveTo(x, y);
          for (let k = 0; k < 4; k++) { a += Math.sin(i * 3 + k) * .4; x += Math.cos(a) * 60; y += Math.sin(a) * 60; cx.lineTo(x, y); }
        }
        cx.stroke();
      }
    },
  };

  // ----- Star Castle: a ship chipping away at the rotating rings round a cannon -----
  // Three rings of twelve segments turn in alternate directions. The ship circles outside, firing in; each shot
  // breaks the first segment it meets (they take two hits). When the gaps line up between the cannon and the
  // ship the cannon fires a spinning fireball out through them; when a shot gets all the way in, the cannon
  // goes up and a new castle is built.
  const SEGS = 12;
  const castle = {
    name: "STAR CASTLE",
    layout() {
      this.cxC = W < 700 ? W * .5 : W * .68; this.cyC = H * .5;
      this.R = Math.min(H * .34, W < 700 ? W * .34 : W * .2);
      if (!this.rings) this.reset();
    },
    reset() {
      this.rings = [[.82, .22, "#ff4a4a"], [.64, -.3, "#ffe14a"], [.46, .4, "#ff4fd8"]]
        .map(([r, spin, colour]) => ({ r, spin, colour, rot: rand(0, 6.3), segs: new Array(SEGS).fill(2) }));
      this.cannon = { a: rand(0, 6.3), alive: true, fire: 2.5, boom: 0 };
      this.ship = this.ship ?? { th: rand(0, 6.3), alive: true, wait: 0, fire: 0 };
      this.shots = []; this.balls = []; this.sparks = this.sparks ?? [];
    },
    start() { if (!this.rings) this.reset(); },
    // Which segment of a ring is at an angle.
    segAt(ring, ang) { const k = ((ang - ring.rot) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); return Math.floor(k / (Math.PI * 2 / SEGS)); },
    shipAt() { const s = this.ship; return [this.cxC + Math.cos(s.th) * this.R * 1.3, this.cyC + Math.sin(s.th) * this.R * 1.12]; },
    step(dt) {
      const s = this.ship, c = this.cannon, R = this.R;
      for (const g of this.rings) g.rot += g.spin * dt;
      if (!c.alive) { c.boom -= dt; if (c.boom <= 0) this.reset(); }
      // The ship circles, nose to the castle, firing in.
      if (!s.alive) { s.wait -= dt; if (s.wait <= 0) Object.assign(s, { alive: true, th: s.th + 2 }); }
      else {
        s.th += .3 * dt;
        s.fire -= dt;
        if (s.fire <= 0 && c.alive) {
          s.fire = .2;
          const [x, y] = this.shipAt(), d = Math.hypot(this.cxC - x, this.cyC - y);
          this.shots.push({ x, y, vx: (this.cxC - x) / d * 340, vy: (this.cyC - y) / d * 340 });
        }
      }
      for (const b of this.shots) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        const rho = Math.hypot(b.x - this.cxC, b.y - this.cyC), ang = Math.atan2(b.y - this.cyC, b.x - this.cxC);
        for (const g of this.rings) {
          if (Math.abs(rho - g.r * R) > 5) continue;
          const i = this.segAt(g, ang);
          if (g.segs[i] > 0) { g.segs[i]--; b.dead = true; sparkBurst(this.sparks, b.x, b.y, 4, 60, "255,225,74"); }
          break;
        }
        if (!b.dead && rho < R * .16 && c.alive) {
          b.dead = true; c.alive = false; c.boom = 2.2; this.balls = [];
          sparkBurst(this.sparks, this.cxC, this.cyC, 40, 200, "255,120,80");
          sparkBurst(this.sparks, this.cxC, this.cyC, 24, 120, "255,255,255");
        }
      }
      this.shots = this.shots.filter(b => !b.dead && Math.hypot(b.x - this.cxC, b.y - this.cyC) > R * .1);
      // The cannon follows the ship and fires out through the gaps when they line up.
      if (c.alive && s.alive) {
        const [x, y] = this.shipAt(), want = Math.atan2(y - this.cyC, x - this.cxC), err = angleTo(c.a, want);
        c.a += Math.max(-1.5 * dt, Math.min(1.5 * dt, err));
        c.fire -= dt;
        const clear = this.rings.every(g => g.segs[this.segAt(g, c.a)] === 0);
        if (clear && Math.abs(err) < .06 && c.fire <= 0) {
          c.fire = 2;
          this.balls.push({ x: this.cxC, y: this.cyC, vx: Math.cos(c.a) * 190, vy: Math.sin(c.a) * 190, age: 0 });
        }
      }
      for (const f of this.balls) {
        f.x += f.vx * dt; f.y += f.vy * dt; f.age += dt;
        const [x, y] = this.shipAt();
        if (s.alive && Math.hypot(f.x - x, f.y - y) < 14) {
          f.dead = true; s.alive = false; s.wait = 1.6;
          sparkBurst(this.sparks, x, y, 18, 120, "92,225,255");
        }
      }
      this.balls = this.balls.filter(f => !f.dead && f.age < 3);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, 1);
      const R = this.R, X = (r, a) => this.cxC + Math.cos(a) * r, Y = (r, a) => this.cyC + Math.sin(a) * r;
      // The rings: each segment a narrow band, dimmer once it's been hit.
      for (const g of this.rings) {
        for (let i = 0; i < SEGS; i++) {
          if (!g.segs[i]) continue;
          const a0 = g.rot + i * Math.PI * 2 / SEGS + .04, a1 = a0 + Math.PI * 2 / SEGS - .08, r0 = g.r * R - 4, r1 = g.r * R + 4;
          beam(g.segs[i] === 2 ? g.colour : `${g.colour}88`, 10); cx.lineWidth = 1.6;
          cx.beginPath();
          cx.moveTo(X(r0, a0), Y(r0, a0)); cx.lineTo(X(r1, a0), Y(r1, a0)); cx.lineTo(X(r1, a1), Y(r1, a1)); cx.lineTo(X(r0, a1), Y(r0, a1)); cx.closePath();
          cx.stroke();
        }
      }
      // The cannon: a pointed eye turning to follow the ship.
      const c = this.cannon;
      if (c.alive) {
        const r = R * .14, a = c.a;
        beam("#72ff8f", 12); cx.lineWidth = 1.8;
        cx.beginPath();
        cx.moveTo(X(r * 1.6, a), Y(r * 1.6, a)); cx.lineTo(X(r, a + 2.3), Y(r, a + 2.3)); cx.lineTo(X(r * .5, a + Math.PI), Y(r * .5, a + Math.PI)); cx.lineTo(X(r, a - 2.3), Y(r, a - 2.3)); cx.closePath();
        cx.stroke();
      }
      // The ship, nose to the castle.
      const s = this.ship;
      if (s.alive) {
        const [x, y] = this.shipAt(), a = Math.atan2(this.cyC - y, this.cxC - x), P = (f, side) => [x + Math.cos(a) * f - Math.sin(a) * side, y + Math.sin(a) * f + Math.cos(a) * side];
        beam("#5ce1ff", 12); cx.lineWidth = 1.6;
        cx.beginPath(); cx.moveTo(...P(12, 0)); cx.lineTo(...P(-8, -8)); cx.lineTo(...P(-4, 0)); cx.lineTo(...P(-8, 8)); cx.closePath(); cx.stroke();
      }
      beam("#ffffff", 8); cx.lineWidth = 2;
      cx.beginPath();
      for (const b of this.shots) { cx.moveTo(b.x, b.y); cx.lineTo(b.x - b.vx * .02, b.y - b.vy * .02); }
      cx.stroke();
      // Fireballs, spinning as they come.
      beam("#ff9a3a", 14); cx.lineWidth = 1.8;
      for (const f of this.balls) {
        cx.beginPath();
        for (let k = 0; k < 4; k++) { const a = f.age * 9 + k * Math.PI / 4; cx.moveTo(f.x - Math.cos(a) * 9, f.y - Math.sin(a) * 9); cx.lineTo(f.x + Math.cos(a) * 9, f.y + Math.sin(a) * 9); }
        cx.stroke();
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Missile Command: cities under attack, and the counter-missiles that stop what they can -----
  // Missiles streak down on six cities and three bases, some splitting on the way. The bases fire
  // counter-missiles at the point where each incoming one will be; they burst into rings that swell and fade,
  // and anything caught in one goes up in a ring of its own. When the cities are gone, they're rebuilt.
  const missiles = {
    name: "MISSILE COMMAND",
    layout() {
      this.left = W < 700 ? 14 : W * .42; this.right = W - 14; this.ground = H - 26;
      this.reset();
    },
    reset() {
      const slots = 9, span = this.right - this.left;
      this.places = Array.from({ length: slots }, (_, i) => ({ x: this.left + span * (i + .5) / slots, base: i % 4 === 0, alive: true }));
      this.incoming = []; this.counters = []; this.booms = []; this.sparks = this.sparks ?? [];
      this.spawn = .5; this.fire = 0; this.rebuild = 0;
    },
    start() { if (!this.places) this.layout(); },
    aimFrom(m) {
      // Where an incoming missile will be by the time a counter-missile from the nearest base reaches it, and the ring has grown.
      const bases = this.places.filter(p => p.base && p.alive);
      if (!bases.length) return null;
      const base = bases.reduce((a, b) => Math.abs(a.x - m.x) < Math.abs(b.x - m.x) ? a : b);
      const bx = base.x, by = this.ground - 10;
      let T = .5, px = m.x, py = m.y;
      for (let k = 0; k < 4; k++) { px = m.x + m.vx * T; py = m.y + m.vy * T; T = Math.hypot(px - bx, py - by) / 340 + .3; }
      return py < this.ground - 40 ? { bx, by, px, py } : null;
    },
    step(dt) {
      const ground = this.ground, alive = this.places.filter(p => p.alive);
      // New attackers, aimed at what's still standing.
      this.spawn -= dt;
      if (this.spawn <= 0 && this.incoming.length < 10 && alive.length) {
        this.spawn = rand(.3, .8);
        this.launch(rand(this.left, this.right), 0, alive[Math.floor(rand(0, alive.length))], Math.random() < .3);
      }
      for (const m of this.incoming) {
        m.x += m.vx * dt; m.y += m.vy * dt;
        if (m.split && m.y > m.split) {
          m.split = 0;
          for (let k = 0; k < 2 && alive.length; k++) this.launch(m.x, m.y, alive[Math.floor(rand(0, alive.length))], false, m.x, m.y);
        }
        if (m.y >= ground - 4) {
          m.dead = true;
          this.boom(m.x, ground - 4, 18, "255,74,74");
          const hit = this.places.find(p => p.alive && Math.abs(p.x - m.x) < 14);
          if (hit) { hit.alive = false; sparkBurst(this.sparks, hit.x, ground - 6, 16, 90, "255,179,71"); }
        }
      }
      // The defence: a counter-missile at whichever attacker is nearest to landing.
      this.fire -= dt;
      if (this.fire <= 0) {
        const next = this.incoming.filter(m => !m.dead && !m.marked).sort((a, b) => (ground - a.y) / a.vy - (ground - b.y) / b.vy)[0];
        const aim = next && this.aimFrom(next);
        if (aim) {
          this.fire = .5; next.marked = true;
          const d = Math.hypot(aim.px - aim.bx, aim.py - aim.by);
          this.counters.push({ x0: aim.bx, y0: aim.by, x: aim.bx, y: aim.by, tx: aim.px, ty: aim.py, vx: (aim.px - aim.bx) / d * 340, vy: (aim.py - aim.by) / d * 340 });
        }
      }
      for (const c of this.counters) {
        c.x += c.vx * dt; c.y += c.vy * dt;
        if ((c.tx - c.x) * c.vx + (c.ty - c.y) * c.vy <= 0) { c.dead = true; this.boom(c.tx, c.ty, 30); }
      }
      // Rings swell and fade; anything inside one bursts too.
      for (const b of this.booms) {
        b.age += dt;
        const r = b.max * Math.sin(Math.min(1, b.age / 1.4) * Math.PI);
        for (const m of this.incoming) if (!m.dead && Math.hypot(m.x - b.x, m.y - b.y) < r) { m.dead = true; this.boom(m.x, m.y, 20); }
      }
      this.incoming = this.incoming.filter(m => !m.dead);
      this.counters = this.counters.filter(c => !c.dead);
      this.booms = this.booms.filter(b => b.age < 1.4);
      // Everything gone: a pause, then rebuilt.
      if (!this.places.some(p => p.alive && !p.base) || !this.places.some(p => p.alive && p.base)) {
        this.rebuild += dt;
        if (this.rebuild > 2.5) this.reset();
      }
    },
    launch(x, y, target, split, ox = x, oy = y) {
      const sp = rand(30, 48), d = Math.hypot(target.x - x, this.ground - y);
      this.incoming.push({ ox, oy, x, y, vx: (target.x - x) / d * sp, vy: (this.ground - y) / d * sp, split: split ? rand(H * .25, H * .5) : 0 });
    },
    boom(x, y, max, colour) { this.booms.push({ x, y, max, age: 0, colour }); },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, .7);
      const g = this.ground;
      // The ground, with a hill under each base.
      beam("#ffb347", 8); cx.lineWidth = 1.6;
      cx.beginPath(); cx.moveTo(this.left - 14, g);
      for (const p of this.places) if (p.base) { cx.lineTo(p.x - 22, g); cx.lineTo(p.x - 10, g - 10); cx.lineTo(p.x + 10, g - 10); cx.lineTo(p.x + 22, g); }
      cx.lineTo(this.right + 14, g); cx.stroke();
      // Cities: a little skyline each.
      beam("#5ce1ff", 10); cx.lineWidth = 1.4;
      cx.beginPath();
      for (const p of this.places) {
        if (p.base || !p.alive) continue;
        const x = p.x - 12;
        cx.moveTo(x, g); cx.lineTo(x, g - 8); cx.lineTo(x + 5, g - 8); cx.lineTo(x + 5, g - 14); cx.lineTo(x + 10, g - 14); cx.lineTo(x + 10, g - 6);
        cx.lineTo(x + 15, g - 6); cx.lineTo(x + 15, g - 11); cx.lineTo(x + 20, g - 11); cx.lineTo(x + 20, g - 4); cx.lineTo(x + 24, g - 4); cx.lineTo(x + 24, g);
      }
      cx.stroke();
      // Incoming trails, red with a bright head; counter-missiles blue, each with an X where it's going.
      beam("#ff4a4a", 8); cx.lineWidth = 1.3;
      cx.beginPath();
      for (const m of this.incoming) { cx.moveTo(m.ox, m.oy); cx.lineTo(m.x, m.y); }
      cx.stroke();
      beam("#5ce1ff", 8);
      cx.beginPath();
      for (const c of this.counters) {
        cx.moveTo(c.x0, c.y0); cx.lineTo(c.x, c.y);
        cx.moveTo(c.tx - 4, c.ty - 4); cx.lineTo(c.tx + 4, c.ty + 4); cx.moveTo(c.tx + 4, c.ty - 4); cx.lineTo(c.tx - 4, c.ty + 4);
      }
      cx.stroke();
      cx.fillStyle = "#ffffff"; cx.shadowColor = "#ffffff";
      for (const m of [...this.incoming, ...this.counters]) cx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
      // The rings, flickering through the colours.
      const flicker = ["255,255,255", "255,79,216", "255,225,74", "92,225,255"];
      for (const b of this.booms) {
        const r = b.max * Math.sin(Math.min(1, b.age / 1.4) * Math.PI);
        beam(`rgba(${b.colour ?? flicker[Math.floor(t * 20 + b.x) % 4]},.9)`, 14); cx.lineWidth = 2;
        cx.beginPath(); cx.arc(b.x, b.y, Math.max(1, r), 0, Math.PI * 2); cx.stroke();
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Star Wars: a run down the trench to the exhaust port -----
  // First person, flying low down a trench that streams past in wireframe. Catwalks cross it (the ship dips
  // under them), turrets along the rims fire, and the ship's lasers converge on them from the corners of the
  // view. At the end of the run the port comes up on the floor; a torpedo goes in, and the screen goes white.
  const TRENCH_W = 1.6, TRENCH_H = 2.6, RUN = 210, SPEED = 19;
  const wars = {
    name: "STAR WARS",
    layout() {
      this.vx = W < 700 ? W * .5 : W * .64; this.vy = H * .46; this.F = Math.min(W, H * 1.6) * .5;
      if (this.z === undefined) this.start();
    },
    start() {
      this.z = 0; this.camX = 0; this.camY = 1.3; this.done = 0; this.torpedo = null;
      this.cats = Array.from({ length: 5 }, (_, i) => 35 + i * 34 + rand(-6, 6));
      this.turrets = Array.from({ length: 8 }, (_, i) => ({ z: 25 + i * 22 + rand(0, 8), side: i % 2 ? 1 : -1, fire: rand(.5, 1.5), dead: false }));
      this.balls = []; this.lasers = []; this.sparks = []; this.laserWait = 0;
    },
    // Camera space (relative to the ship) to the screen, clipping lines that come too near.
    line(a, b) {
      let [ax, ay, az] = a, [bx, by, bz] = b;
      const near = .5;
      if (az < near && bz < near) return;
      if (az < near) { const k = (near - az) / (bz - az); ax += (bx - ax) * k; ay += (by - ay) * k; az = near; }
      if (bz < near) { const k = (near - bz) / (az - bz); bx += (ax - bx) * k; by += (ay - by) * k; bz = near; }
      cx.moveTo(this.vx + ax / az * this.F, this.vy - ay / az * this.F);
      cx.lineTo(this.vx + bx / bz * this.F, this.vy - by / bz * this.F);
    },
    rel(x, y, z) { return [x - this.camX, y - this.camY, z - this.z]; },
    screen(x, y, z) { const [a, b, c] = this.rel(x, y, z); return c > .5 ? [this.vx + a / c * this.F, this.vy - b / c * this.F] : null; },
    step(dt) {
      if (this.done > 0) { this.done += dt; if (this.done > 3.2) this.start(); return; }
      this.z += SPEED * dt;
      // Dip under the next catwalk, then rise again; weave a little.
      const next = this.cats.find(c => c > this.z);
      const wantY = next !== undefined && next - this.z < 14 ? .7 : 1.4;
      this.camY += (wantY - this.camY) * Math.min(1, dt * 3);
      this.camX = Math.sin(this.z * .05) * .5;
      // Turrets fire at the ship; the lasers answer the nearest.
      for (const tu of this.turrets) {
        const d = tu.z - this.z;
        if (tu.dead || d < 4 || d > 60) continue;
        tu.fire -= dt;
        if (tu.fire <= 0) { tu.fire = rand(1.2, 2.2); this.balls.push({ x: tu.side * TRENCH_W, y: TRENCH_H, z: tu.z, age: 0 }); }
      }
      for (const f of this.balls) {
        f.age += dt;
        // Coming at the ship: towards its line, and back along the trench faster than it flies.
        f.x += (this.camX - f.x) * dt * 1.2; f.y += (this.camY - f.y) * dt * 1.2; f.z -= 14 * dt;
      }
      this.balls = this.balls.filter(f => f.z > this.z + .6 && f.age < 4);
      this.laserWait -= dt;
      const target = this.turrets.filter(tu => !tu.dead && tu.z - this.z > 10 && tu.z - this.z < 40).sort((a, b) => a.z - b.z)[0];
      if (target && this.laserWait <= 0) {
        this.laserWait = .45;
        const p = this.screen(target.side * TRENCH_W, TRENCH_H + .2, target.z);
        if (p) {
          this.lasers.push({ x: p[0], y: p[1], age: 0 });
          if (Math.random() < .6) { target.dead = true; sparkBurst(this.sparks, p[0], p[1], 18, 120, "255,179,71"); }
        }
      }
      for (const l of this.lasers) l.age += dt;
      this.lasers = this.lasers.filter(l => l.age < .18);
      // The port: a torpedo goes in.
      if (!this.torpedo && RUN - this.z < 24) this.torpedo = { z: this.z + 2, y: this.camY - .3, x: this.camX };
      if (this.torpedo) {
        const tp = this.torpedo;
        tp.z += SPEED * 1.8 * dt; tp.y += (0 - tp.y) * dt * 1.4; tp.x += (0 - tp.x) * dt * 2;
        if (tp.z >= RUN) { this.done = .001; this.torpedo = null; }
      }
      if (this.z > RUN - 3) this.z = RUN - 3;
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, .38);
      if (this.done > 0) {
        // The flash: rings of light, then sparks, then on to the next run.
        const k = this.done;
        for (let i = 0; i < 5; i++) {
          const r = (k * 260 - i * 50);
          if (r <= 0) continue;
          beam(`rgba(255,${200 - i * 30},${120 + i * 20},${Math.max(0, 1 - k / 3)})`, 20); cx.lineWidth = 3;
          cx.beginPath(); cx.arc(this.vx, this.vy, r, 0, Math.PI * 2); cx.stroke();
        }
        if (k < .3) { cx.fillStyle = `rgba(255,255,255,${.5 * (1 - k / .3)})`; cx.fillRect(0, 0, W, H); }
        return;
      }
      const G = "#5c8cff", L = (a, b) => this.line(this.rel(...a), this.rel(...b));
      // The trench: its edges stream away to the horizon, ribs crossing it every few metres.
      beam(G, 8); cx.lineWidth = 1.3;
      cx.beginPath();
      // (From a few metres ahead, so the nearest lines don't sweep across the whole hero.)
      const near = this.z + 4, far = this.z + 140;
      for (const [x, y] of [[-TRENCH_W, 0], [TRENCH_W, 0], [-TRENCH_W, TRENCH_H], [TRENCH_W, TRENCH_H]]) L([x, y, near], [x, y, far]);
      for (let z = Math.ceil(near / 8) * 8; z < far; z += 8) {
        L([-TRENCH_W, TRENCH_H, z], [-TRENCH_W, 0, z]); L([-TRENCH_W, 0, z], [TRENCH_W, 0, z]); L([TRENCH_W, 0, z], [TRENCH_W, TRENCH_H, z]);
        // The surface either side of the rims.
        L([-TRENCH_W - 2.5, TRENCH_H, z], [-TRENCH_W, TRENCH_H, z]); L([TRENCH_W, TRENCH_H, z], [TRENCH_W + 2.5, TRENCH_H, z]);
      }
      cx.stroke();
      // Catwalks across the trench.
      beam("#ffe14a", 8); cx.lineWidth = 1.5;
      cx.beginPath();
      for (const c of this.cats) if (c > near && c < far) { L([-TRENCH_W, 1.9, c], [TRENCH_W, 1.9, c]); L([-TRENCH_W, 2.2, c], [TRENCH_W, 2.2, c]); }
      cx.stroke();
      // Turrets on the rims.
      beam("#72ff8f", 8); cx.lineWidth = 1.4;
      cx.beginPath();
      for (const tu of this.turrets) {
        if (tu.dead || tu.z < this.z || tu.z > far) continue;
        const x = tu.side * TRENCH_W, z = tu.z;
        L([x - .3, TRENCH_H, z], [x - .3, TRENCH_H + .5, z]); L([x - .3, TRENCH_H + .5, z], [x + .3, TRENCH_H + .5, z]);
        L([x + .3, TRENCH_H + .5, z], [x + .3, TRENCH_H, z]); L([x, TRENCH_H + .5, z], [x - tu.side * .6, TRENCH_H + .7, z]);
      }
      cx.stroke();
      // The exhaust port, on the floor at the end.
      if (RUN - this.z < 140) {
        beam("#ff4fd8", 12); cx.lineWidth = 1.8;
        cx.beginPath();
        for (const s of [.8, .4]) { L([-s, 0, RUN - s], [s, 0, RUN - s]); L([s, 0, RUN - s], [s, 0, RUN + s]); L([s, 0, RUN + s], [-s, 0, RUN + s]); L([-s, 0, RUN + s], [-s, 0, RUN - s]); }
        cx.stroke();
      }
      // Fireballs coming at the ship.
      beam("#ff4a4a", 12); cx.lineWidth = 1.6;
      for (const f of this.balls) {
        const p = this.screen(f.x, f.y, f.z);
        if (!p) continue;
        const r = Math.min(26, 60 / Math.max(1, f.z - this.z));
        cx.beginPath();
        for (let k = 0; k < 3; k++) { const a = f.age * 8 + k * Math.PI / 3; cx.moveTo(p[0] - Math.cos(a) * r, p[1] - Math.sin(a) * r); cx.lineTo(p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r); }
        cx.stroke();
      }
      // The ship's lasers, from the corners of the view to the target.
      beam("#ff4a4a", 14); cx.lineWidth = 2;
      cx.beginPath();
      for (const l of this.lasers) { cx.moveTo(this.vx - W * .3, H); cx.lineTo(l.x, l.y); cx.moveTo(this.vx + W * .3, H); cx.lineTo(l.x, l.y); }
      cx.stroke();
      if (this.torpedo) {
        const p = this.screen(this.torpedo.x, this.torpedo.y, this.torpedo.z);
        if (p) { beam("#ffffff", 16); cx.fillStyle = "#ffffff"; cx.beginPath(); cx.arc(p[0], p[1], 3, 0, Math.PI * 2); cx.fill(); }
      }
      // The sight.
      beam("rgba(255,225,74,.8)", 6); cx.lineWidth = 1.3;
      const sx = this.vx, sy = this.vy + 30;
      cx.beginPath();
      cx.moveTo(sx - 26, sy); cx.lineTo(sx - 8, sy); cx.moveTo(sx + 8, sy); cx.lineTo(sx + 26, sy);
      cx.moveTo(sx, sy - 22); cx.lineTo(sx, sy - 8); cx.moveTo(sx, sy + 8); cx.lineTo(sx, sy + 22);
      cx.stroke();
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // The area a scene plays in: the right-hand part of the hero, clear of the text, or all of it on a phone.
  const arena = (pad = 16) => {
    const x0 = W < 700 ? pad : W * .46;
    return { x0, y0: pad, x1: W - pad, y1: H - pad, w: W - pad - x0, h: H - pad * 2 };
  };

  // ----- Pac-Man: the muncher clearing a maze while four ghosts hunt it -----
  // The walls are drawn as outlines, like the cabinet's double-line maze. The muncher heads for the nearest
  // dot by the shortest way that keeps clear of the ghosts; a power pellet turns the tables for a while, and
  // the ghosts it eats go back to the middle to start again.
  const MAZE = [
    "###################",
    "#o.......#.......o#",
    "#.##.###.#.###.##.#",
    "#.................#",
    "#.##.#.#####.#.##.#",
    "#....#...#...#....#",
    "####.###.#.###.####",
    "#........ ........#",
    "#.##.###.#.###.##.#",
    "#o.#...........#.o#",
    "#..#.#.#####.#.#..#",
    "#....#.......#....#",
    "###################",
  ];
  const MW = MAZE[0].length, MH = MAZE.length;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const GHOSTS = ["#ff4a4a", "#ffb8ff", "#5ce1ff", "#ffb347"];
  const walkable = (c, r) => MAZE[r]?.[c] !== undefined && MAZE[r][c] !== "#";
  const pacman = {
    name: "PAC-MAN",
    layout() {
      const a = arena(20);
      this.cs = Math.max(8, Math.floor(Math.min(a.w / MW, a.h / MH)));
      this.ox = a.x0 + (a.w - this.cs * MW) / 2; this.oy = a.y0 + (a.h - this.cs * MH) / 2;
      if (!this.dots) this.reset(true);
    },
    reset(full) {
      if (full) {
        this.dots = new Set();
        MAZE.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === "." || ch === "o") this.dots.add(r * MW + c); }));
        this.flash = 0;
      }
      this.pac = { c: 9, r: 9, nc: 9, nr: 9, p: 1, d: 2, speed: 6 };
      this.ghosts = GHOSTS.map((colour, i) => ({ colour, c: 9, r: 7, nc: 9, nr: 7, p: 1, d: i % 2 ? 0 : 2, speed: 5.2, wait: i * 1.5, i }));
      this.power = 0; this.dying = 0; this.sparks = this.sparks ?? [];
    },
    start() { if (!this.dots) this.reset(true); },
    at(e) { return [e.c + (e.nc - e.c) * e.p, e.r + (e.nr - e.r) * e.p]; },
    // Shortest way from a cell to any target cell, avoiding cells the ghosts are near: the first step's direction.
    route(c, r, isTarget, avoid) {
      const seen = new Map([[r * MW + c, -1]]), queue = [[c, r]];
      while (queue.length) {
        const [qc, qr] = queue.shift();
        if ((qc !== c || qr !== r) && isTarget(qc, qr)) {
          // Back along the way it came to the first step out of the start.
          let k = qr * MW + qc;
          while (seen.get(k) !== r * MW + c) k = seen.get(k);
          const fc = k % MW, fr = Math.floor(k / MW);
          return DIRS.findIndex(([dc, dr]) => c + dc === fc && r + dr === fr);
        }
        for (const [dc, dr] of DIRS) {
          const nc = qc + dc, nr = qr + dr, k = nr * MW + nc;
          if (!walkable(nc, nr) || seen.has(k) || avoid(nc, nr)) continue;
          seen.set(k, qr * MW + qc); queue.push([nc, nr]);
        }
      }
      return -1;
    },
    step(dt) {
      const pac = this.pac;
      if (this.flash > 0) { this.flash -= dt; if (this.flash <= 0) this.reset(true); return; }
      if (this.dying > 0) { this.dying -= dt; if (this.dying <= 0) this.reset(false); return; }
      this.power = Math.max(0, this.power - dt);
      const ghostNear = (c, r, d) => this.ghosts.some(g => g.wait <= 0 && !g.scared && Math.abs(g.c - c) + Math.abs(g.r - r) <= d);
      // The muncher: at each cell, the next step towards its target.
      pac.p += pac.speed * dt;
      if (pac.p >= 1) {
        pac.c = pac.nc; pac.r = pac.nr; pac.p = 0;
        const k = pac.r * MW + pac.c;
        if (this.dots.delete(k) && MAZE[pac.r][pac.c] === "o") { this.power = 6; for (const g of this.ghosts) g.scared = g.wait <= 0; }
        let d = -1;
        if (this.power > 1.5) d = this.route(pac.c, pac.r, (c, r) => this.ghosts.some(g => g.scared && g.c === c && g.r === r), () => false);
        if (d < 0) d = this.route(pac.c, pac.r, (c, r) => this.dots.has(r * MW + c), (c, r) => ghostNear(c, r, 1));
        if (d < 0) {
          // Cornered: whichever way gets furthest from the ghosts.
          let best = -1;
          DIRS.forEach(([dc, dr], i) => {
            if (!walkable(pac.c + dc, pac.r + dr)) return;
            const room = Math.min(...this.ghosts.map(g => Math.abs(g.c - pac.c - dc) + Math.abs(g.r - pac.r - dr)));
            if (room > best) { best = room; d = i; }
          });
        }
        if (d >= 0) { pac.d = d; pac.nc = pac.c + DIRS[d][0]; pac.nr = pac.r + DIRS[d][1]; }
        else { pac.nc = pac.c; pac.nr = pac.r; }
        if (!this.dots.size) { this.flash = 1.8; return; }
      }
      // The ghosts: no turning back; at each cell, the way that brings each nearest its own target.
      for (const g of this.ghosts) {
        if (g.wait > 0) { g.wait -= dt; continue; }
        if (g.scared && this.power <= 0) g.scared = false;
        g.p += (g.scared ? 3.2 : g.speed) * dt;
        if (g.p < 1) continue;
        g.c = g.nc; g.r = g.nr; g.p = 0;
        const ahead = DIRS[pac.d];
        const [tc, tr] = g.scared ? [rand(0, MW), rand(0, MH)]
          : g.i === 0 ? [pac.c, pac.r]
          : g.i === 1 ? [pac.c + ahead[0] * 4, pac.r + ahead[1] * 4]
          : g.i === 2 ? [pac.c + rand(-5, 5), pac.r + rand(-4, 4)]
          : Math.abs(g.c - pac.c) + Math.abs(g.r - pac.r) > 7 ? [pac.c, pac.r] : [0, MH];
        let best = -1, bd = Infinity;
        DIRS.forEach(([dc, dr], i) => {
          if (i === (g.d + 2) % 4 || !walkable(g.c + dc, g.r + dr)) return;
          const dd = Math.hypot(g.c + dc - tc, g.r + dr - tr);
          if (dd < bd) { bd = dd; best = i; }
        });
        if (best < 0) best = (g.d + 2) % 4;
        g.d = best; g.nc = g.c + DIRS[best][0]; g.nr = g.r + DIRS[best][1];
      }
      // Caught, or eating.
      const [px, py] = this.at(pac);
      for (const g of this.ghosts) {
        if (g.wait > 0) continue;
        const [gx, gy] = this.at(g);
        if (Math.hypot(gx - px, gy - py) > .6) continue;
        const sx = this.ox + (gx + .5) * this.cs, sy = this.oy + (gy + .5) * this.cs;
        if (g.scared) {
          sparkBurst(this.sparks, sx, sy, 12, 90, "92,140,255");
          Object.assign(g, { c: 9, r: 7, nc: 9, nr: 7, p: 1, scared: false, wait: 1.2 });
        } else {
          this.dying = 1.6;
          sparkBurst(this.sparks, this.ox + (px + .5) * this.cs, this.oy + (py + .5) * this.cs, 18, 110, "255,225,74");
          return;
        }
      }
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      const cs = this.cs, ox = this.ox, oy = this.oy;
      // The walls: blue outlines, flashing white when the maze is cleared.
      beam(this.flash > 0 && Math.sin(t * 20) > 0 ? "#ffffff" : "#4a7dff", 10); cx.lineWidth = 1.6;
      cx.beginPath();
      outline((c, r) => MAZE[r]?.[c] === "#", MW, MH, (x0, y0, x1, y1) => { cx.moveTo(ox + x0 * cs, oy + y0 * cs); cx.lineTo(ox + x1 * cs, oy + y1 * cs); });
      cx.stroke();
      // Dots, and the power pellets blinking.
      beam("#ffd8a0", 6); cx.fillStyle = "#ffd8a0";
      for (const k of this.dots) {
        const c = k % MW, r = Math.floor(k / MW), x = ox + (c + .5) * cs, y = oy + (r + .5) * cs;
        if (MAZE[r][c] === "o") { if (Math.sin(t * 8) > -.3) { cx.beginPath(); cx.arc(x, y, cs * .28, 0, Math.PI * 2); cx.fill(); } }
        else cx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
      // The ghosts: a dome, a wavy hem and eyes looking the way they go; blue and blinking when scared.
      for (const g of this.ghosts) {
        const [gc, gr] = this.at(g), x = ox + (gc + .5) * cs, y = oy + (gr + .5) * cs, R = cs * .42;
        const fading = g.scared && this.power < 2 && Math.sin(t * 16) > 0;
        beam(g.scared ? (fading ? "#ffffff" : "#4a7dff") : g.colour, 10); cx.lineWidth = 1.6;
        cx.beginPath();
        cx.moveTo(x - R, y + R); cx.lineTo(x - R, y); cx.arc(x, y, R, Math.PI, 0); cx.lineTo(x + R, y + R);
        for (let k = 1; k <= 4; k++) cx.lineTo(x + R - k * R / 2, y + R - (k % 2 ? R * .35 : 0) * (Math.sin(t * 12) > 0 ? 1 : .4));
        cx.stroke();
        const [dc, dr] = DIRS[g.d];
        cx.shadowBlur = 0; cx.fillStyle = "#f2f2ff";
        for (const s of [-1, 1]) {
          cx.beginPath(); cx.arc(x + s * R * .38, y - R * .1, R * .22, 0, Math.PI * 2); cx.fill();
        }
        cx.fillStyle = g.scared ? "#ff8a8a" : "#1a2a6a";
        for (const s of [-1, 1]) cx.fillRect(x + s * R * .38 + dc * R * .1 - 1.5, y - R * .1 + dr * R * .1 - 1.5, 3, 3);
      }
      // The muncher: a wedge opening and closing the way it's going; caught, it folds away.
      const [pc, pr] = this.at(this.pac), x = ox + (pc + .5) * cs, y = oy + (pr + .5) * cs;
      const face = [0, Math.PI / 2, Math.PI, -Math.PI / 2][this.pac.d];
      let mouth = this.dying > 0 ? Math.PI * (1 - this.dying / 1.6) * .98 + .02 : .05 + .3 * Math.abs(Math.sin(t * 12));
      if (this.dying <= 0 || mouth < Math.PI * .97) {
        beam("#ffe14a", 12); cx.lineWidth = 1.8;
        cx.beginPath(); cx.moveTo(x, y); cx.arc(x, y, cs * .42, face + mouth, face + Math.PI * 2 - mouth); cx.closePath(); cx.stroke();
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Qix: a marker cutting boxes out of the playfield while the Qix swirls -----
  // The field is a grid of small cells. The marker runs round the frame, then cuts in, mostly turning towards
  // the nearer side to box off a corner, until it meets claimed ground; the side away from the Qix is filled in. If the Qix touches the cut while
  // it's being drawn, the cut is lost. Three quarters claimed, and the field is cleared for another go.
  const qix = {
    name: "QIX",
    layout() {
      const a = arena(22);
      this.g = W < 700 ? 6 : 8;
      this.gw = Math.floor(a.w / this.g); this.gh = Math.floor(a.h / this.g);
      this.ox = a.x0 + (a.w - this.gw * this.g) / 2; this.oy = a.y0 + (a.h - this.gh * this.g) / 2;
      this.reset();
    },
    reset() {
      const { gw, gh } = this;
      this.cells = new Uint8Array(gw * gh); // 0 open, 1 frame or cut, 2+ a fill colour
      for (let x = 0; x < gw; x++) { this.cells[x] = 1; this.cells[(gh - 1) * gw + x] = 1; }
      for (let y = 0; y < gh; y++) { this.cells[y * gw] = 1; this.cells[y * gw + gw - 1] = 1; }
      this.fills = 0;
      // The frame as a loop, for the marker and the Sparx to run round.
      this.ring = [];
      for (let x = 0; x < gw; x++) this.ring.push([x, 0]);
      for (let y = 1; y < gh; y++) this.ring.push([gw - 1, y]);
      for (let x = gw - 2; x >= 0; x--) this.ring.push([x, gh - 1]);
      for (let y = gh - 2; y > 0; y--) this.ring.push([0, y]);
      this.marker = { i: 0, x: 0, y: 0, mode: "run", goal: 0, path: [], drawn: 0, wait: 0 };
      this.sparx = rand(0, this.ring.length);
      const cxm = gw / 2, cym = gh / 2;
      this.qix = { a: [cxm - 4, cym], b: [cxm + 4, cym + 2], va: [rand(-9, 9), rand(-9, 9)], vb: [rand(-9, 9), rand(-9, 9)], trail: [], clock: 0, hue: 0 };
      this.sparks = this.sparks ?? []; this.flash = 0; this.colour = 0;
    },
    start() { if (!this.cells) this.layout(); },
    claimed(x, y) { x = Math.floor(x); y = Math.floor(y); return x < 0 || y < 0 || x >= this.gw || y >= this.gh || this.cells[y * this.gw + x] !== 0; },
    // A cut: in from a frame cell, then on until it meets claimed ground.
    plan() {
      const { gw, gh } = this, n = this.ring.length;
      let best = null, cost = Infinity;
      for (let tries = 0; tries < 40; tries++) {
        const i = Math.floor(rand(0, this.ring.length)), [sx, sy] = this.ring[i];
        const d = sx === 0 ? [1, 0] : sx === gw - 1 ? [-1, 0] : sy === 0 ? [0, 1] : [0, -1];
        if (this.claimed(sx + d[0], sy + d[1])) continue;
        // In a way, then (mostly) a turn towards the nearer side, boxing off a corner; now and then straight across.
        const path = []; let x = sx, y = sy, dir = d, turned = Math.random() < .25;
        const leg = Math.floor(rand(6, d[0] ? gw * .35 : gh * .45));
        for (let k = 0; k < 600; k++) {
          if (!turned && path.length === leg) {
            dir = d[0] ? [0, y < gh / 2 ? -1 : 1] : [x < gw / 2 ? -1 : 1, 0];
            turned = true;
          }
          const nx = x + dir[0], ny = y + dir[1];
          if (this.claimed(nx, ny)) break;
          x = nx; y = ny; path.push([x, y]);
        }
        if (path.length < 4) continue;
        // The best: not far round the frame to get there, and a cut long enough to take a good piece.
        let ring = Math.abs(i - this.marker.i) % n; ring = Math.min(ring, n - ring);
        const c = ring / 90 + Math.abs(path.length - 40) / 20 + rand(0, .5);
        if (c < cost) { cost = c; best = { i, path }; }
      }
      return best;
    },
    finish() {
      const { gw, gh } = this, m = this.marker;
      for (const [x, y] of m.path) this.cells[y * gw + x] = 1;
      // Flood from the Qix; whatever open ground it can't reach is filled.
      const q = this.qix, start = [Math.floor((q.a[0] + q.b[0]) / 2), Math.floor((q.a[1] + q.b[1]) / 2)];
      const reach = new Uint8Array(gw * gh), stack = [start];
      while (stack.length) {
        const [x, y] = stack.pop();
        if (this.claimed(x, y) || reach[y * gw + x]) continue;
        reach[y * gw + x] = 1;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      const colour = 2 + (this.colour++ % 3);
      for (let k = 0; k < gw * gh; k++) if (this.cells[k] === 0 && !reach[k]) this.cells[k] = colour;
      const [ex, ey] = m.path[m.path.length - 1];
      sparkBurst(this.sparks, this.ox + (ex + .5) * this.g, this.oy + (ey + .5) * this.g, 14, 90, "255,225,74");
      m.path = []; m.mode = "run"; m.wait = .4;
      for (const p of [q.a, q.b]) if (this.claimed(p[0], p[1])) { p[0] = start[0] + .5; p[1] = start[1] + .5; }
      let taken = 0; for (const v of this.cells) if (v) taken++;
      if (taken / (gw * gh) > .74) this.flash = 2;
    },
    step(dt) {
      if (this.flash > 0) { this.flash -= dt; if (this.flash <= 0) this.reset(); return; }
      const m = this.marker, q = this.qix, ring = this.ring, n = ring.length;
      // The Qix: two ends wandering and bouncing off claimed ground, leaving a fan of lines behind.
      for (const [p, v] of [[q.a, q.va], [q.b, q.vb]]) {
        v[0] += rand(-30, 30) * dt; v[1] += rand(-30, 30) * dt;
        const sp = Math.hypot(v[0], v[1]); if (sp > 14) { v[0] *= 14 / sp; v[1] *= 14 / sp; }
        if (this.claimed(p[0] + v[0] * dt, p[1])) v[0] = -v[0]; else p[0] += v[0] * dt;
        if (this.claimed(p[0], p[1] + v[1] * dt)) v[1] = -v[1]; else p[1] += v[1] * dt;
      }
      if (Math.hypot(q.a[0] - q.b[0], q.a[1] - q.b[1]) > 12) { q.vb[0] += (q.a[0] - q.b[0]) * dt; q.vb[1] += (q.a[1] - q.b[1]) * dt; }
      q.clock += dt; q.hue = (q.hue + dt * 90) % 360;
      if (q.clock > .06) { q.clock = 0; q.trail.unshift([[...q.a], [...q.b], q.hue]); q.trail.length = Math.min(q.trail.length, 9); }
      this.sparx = (this.sparx + dt * 20) % n;
      if (m.wait > 0) { m.wait -= dt; return; }
      if (m.mode === "run") {
        if (!m.plan) m.plan = this.plan();
        if (!m.plan) { this.flash = 1; return; }
        // Round the frame the short way to where the cut starts.
        let diff = (m.plan.i - m.i + n) % n; if (diff > n / 2) diff -= n;
        const stepCells = dt * 90;
        if (Math.abs(diff) <= stepCells) { m.i = m.plan.i; m.mode = "cut"; m.path = m.plan.path; m.drawn = 0; m.plan = null; }
        else m.i = (m.i + Math.sign(diff) * stepCells + n) % n;
        [m.x, m.y] = ring[Math.floor(m.i) % n];
      } else {
        m.drawn += dt * 28;
        const k = Math.min(m.path.length - 1, Math.floor(m.drawn));
        [m.x, m.y] = m.path[k];
        // The Qix touching the cut so far: the cut is lost.
        const cut = new Set(m.path.slice(0, k + 1).map(([x, y]) => y * this.gw + x));
        for (let s = 0; s <= 4; s++) {
          const x = Math.floor(q.a[0] + (q.b[0] - q.a[0]) * s / 4), y = Math.floor(q.a[1] + (q.b[1] - q.a[1]) * s / 4);
          if (!cut.has(y * this.gw + x)) continue;
          sparkBurst(this.sparks, this.ox + (m.x + .5) * this.g, this.oy + (m.y + .5) * this.g, 18, 120, "255,79,216");
          m.mode = "run"; m.path = []; m.wait = 1;
          return;
        }
        if (m.drawn >= m.path.length) this.finish();
      }
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      const { g, gw, gh, ox, oy } = this;
      const fills = ["", "", "rgba(74,125,255,.18)", "rgba(255,79,216,.16)", "rgba(114,255,143,.14)"];
      for (let y = 0; y < gh; y++)
        for (let x = 0; x < gw; x++) {
          const v = this.cells[y * gw + x];
          if (v >= 2) { cx.fillStyle = this.flash > 0 && Math.sin(t * 18) > 0 ? "rgba(255,255,255,.25)" : fills[v]; cx.fillRect(ox + x * g, oy + y * g, g, g); }
        }
      // The edges of claimed ground.
      beam("#5ce1ff", 8); cx.lineWidth = 1.4;
      cx.beginPath();
      outline((x, y) => x >= 0 && y >= 0 && x < gw && y < gh && this.cells[y * gw + x] === 0, gw, gh,
        (x0, y0, x1, y1) => { cx.moveTo(ox + x0 * g, oy + y0 * g); cx.lineTo(ox + x1 * g, oy + y1 * g); });
      cx.stroke();
      // The cut being drawn.
      const m = this.marker;
      if (m.mode === "cut" && m.path.length) {
        beam("#ff4a4a", 10); cx.lineWidth = 2;
        cx.beginPath();
        const k = Math.min(m.path.length, Math.floor(m.drawn) + 1);
        const [sx, sy] = this.ring[Math.floor(m.i) % this.ring.length];
        cx.moveTo(ox + (sx + .5) * g, oy + (sy + .5) * g);
        for (let i = 0; i < k; i++) cx.lineTo(ox + (m.path[i][0] + .5) * g, oy + (m.path[i][1] + .5) * g);
        cx.stroke();
      }
      // The Qix's fan of lines, its colours shifting.
      const q = this.qix;
      q.trail.forEach(([a, b, hue], i) => {
        beam(`hsla(${hue},100%,65%,${1 - i / 10})`, 10); cx.lineWidth = 1.6;
        cx.beginPath(); cx.moveTo(ox + a[0] * g, oy + a[1] * g); cx.lineTo(ox + b[0] * g, oy + b[1] * g); cx.stroke();
      });
      // The marker, a diamond, and a Sparx running round the frame.
      const mx = ox + (m.x + .5) * g, my = oy + (m.y + .5) * g;
      beam("#ffffff", 12); cx.lineWidth = 1.8;
      cx.beginPath(); cx.moveTo(mx, my - 6); cx.lineTo(mx + 6, my); cx.lineTo(mx, my + 6); cx.lineTo(mx - 6, my); cx.closePath(); cx.stroke();
      const [zx, zy] = this.ring[Math.floor(this.sparx) % this.ring.length], sxp = ox + (zx + .5) * g, syp = oy + (zy + .5) * g;
      beam("#ffe14a", 12); cx.lineWidth = 1.4;
      cx.beginPath();
      for (let k = 0; k < 4; k++) { const ang = t * 9 + k * Math.PI / 2; cx.moveTo(sxp, syp); cx.lineTo(sxp + Math.cos(ang) * 6, syp + Math.sin(ang) * 6); }
      cx.stroke();
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Defender: a ship skimming the mountains, saving the humanoids from the landers -----
  // The world is three screens wide and wraps. Landers drift down to snatch a humanoid and carry it up; the
  // ship goes for those first, lines up and fires its long laser. A humanoid let go of falls back to the
  // ground. The scanner along the top shows the whole world.
  const defender = {
    name: "DEFENDER",
    layout() {
      this.WW = Math.max(1800, W * 3);
      this.ground = [];
      let y = H * .86;
      for (let x = 0; x < this.WW; x += 24) { y = Math.min(H * .96, Math.max(H * .74, y + rand(-18, 18))); this.ground.push(y); }
      this.ground[this.ground.length - 1] = this.ground[0];
      if (!this.ship) this.reset();
    },
    reset() {
      this.ship = { x: 0, y: H * .45, vx: 0, face: 1, sx: W * .55, fire: 0 };
      this.humans = Array.from({ length: 6 }, (_, i) => ({ x: (i + .5) * this.WW / 6 + rand(-60, 60), y: 0, vy: 0, held: null }));
      this.landers = []; this.lasers = []; this.sparks = this.sparks ?? []; this.spawn = 0; this.bolts = [];
    },
    start() { if (!this.ship) this.layout(); },
    groundAt(x) {
      const n = this.ground.length, f = (((x % this.WW) + this.WW) % this.WW) / 24, i = Math.floor(f) % n;
      return this.ground[i] + (this.ground[(i + 1) % n] - this.ground[i]) * (f - Math.floor(f));
    },
    dx(a, b) { let d = b - a; const WW = this.WW; d = ((d % WW) + WW) % WW; return d > WW / 2 ? d - WW : d; },
    step(dt) {
      const s = this.ship, WW = this.WW;
      // Landers keep coming, five at most, each after a humanoid.
      this.spawn -= dt;
      if (this.spawn <= 0 && this.landers.length < 5) {
        this.spawn = rand(2, 4);
        this.landers.push({ x: s.x + rand(W * .6, WW - W * .6), y: H * .3, target: null, carry: null, t: rand(0, 6) });
      }
      for (const h of this.humans) {
        if (h.held) continue;
        const floor = this.groundAt(h.x) - 8;
        if (h.y < floor && h.y > 0) { h.vy += 120 * dt; h.y = Math.min(floor, h.y + h.vy * dt); }
        else { h.y = floor; h.vy = 0; }
      }
      for (const l of this.landers) {
        l.t += dt;
        if (!l.target || l.target.held && l.target.held !== l) l.target = this.humans.filter(h => !h.held).sort((a, b) => Math.abs(this.dx(l.x, a.x)) - Math.abs(this.dx(l.x, b.x)))[0] ?? null;
        if (l.carry) {
          l.y -= 34 * dt;
          l.carry.x = l.x; l.carry.y = l.y + 16;
          // At the top, the humanoid is lost; it's back on the ground somewhere a moment later.
          if (l.y < H * .2) { l.carry.held = null; l.carry.x = rand(0, WW); l.carry.y = 0; l.dead = true; }
        } else if (l.target) {
          const d = this.dx(l.x, l.target.x);
          l.x = ((l.x + Math.sign(d) * Math.min(Math.abs(d), 60 * dt)) % WW + WW) % WW;
          l.y += (Math.abs(d) < 30 ? 40 : 6 * Math.sin(l.t * 2)) * dt;
          if (Math.abs(d) < 6 && l.y > l.target.y - 22) { l.carry = l.target; l.target.held = l; }
        }
        if (Math.random() < dt * .3 && Math.abs(this.dx(s.x, l.x)) < W * .5) {
          const ax = this.dx(l.x, s.x), ay = s.y - l.y, d = Math.hypot(ax, ay) || 1;
          this.bolts.push({ x: l.x, y: l.y, vx: ax / d * 140, vy: ay / d * 140, age: 0 });
        }
      }
      this.landers = this.landers.filter(l => !l.dead);
      for (const b of this.bolts) { b.x += b.vx * dt; b.y += b.vy * dt; b.age += dt; }
      this.bolts = this.bolts.filter(b => b.age < 3);
      // The ship: after a lander carrying someone first, else the nearest; to its height, facing it, laser.
      const pick = this.landers.slice().sort((a, b) => (a.carry ? 0 : 1) - (b.carry ? 0 : 1) || Math.abs(this.dx(s.x, a.x)) - Math.abs(this.dx(s.x, b.x)))[0];
      if (pick) {
        const d = this.dx(s.x, pick.x);
        s.face = d >= 0 ? 1 : -1;
        const want = d - s.face * 260;
        s.vx += Math.sign(want) * Math.min(Math.abs(want) * 2, 600) * dt;
        s.y += Math.max(-160 * dt, Math.min(160 * dt, pick.y - s.y));
        s.fire -= dt;
        if (s.fire <= 0 && Math.abs(pick.y - s.y) < 8 && Math.abs(d) < W * .55) {
          s.fire = .45;
          this.lasers.push({ x: s.x + s.face * 18, y: s.y + 2, dir: s.face, len: 0, age: 0 });
        }
      } else s.vx += s.face * 200 * dt;
      s.vx *= 1 - 1.4 * dt;
      s.vx = Math.max(-520, Math.min(520, s.vx));
      s.x = ((s.x + s.vx * dt) % WW + WW) % WW;
      s.y = Math.max(H * .16, Math.min(this.groundAt(s.x) - 30, s.y));
      // On screen, the ship slides to one side so it faces the open part of the hero.
      const homeX = W < 700 ? (s.face > 0 ? W * .25 : W * .75) : (s.face > 0 ? W * .55 : W * .9);
      s.sx += (homeX - s.sx) * Math.min(1, 2 * dt);
      for (const z of this.lasers) {
        z.age += dt; z.len = Math.min(W * .6, z.len + 2600 * dt);
        for (const l of this.landers) {
          if (l.dead || Math.abs(l.y - z.y) > 12) continue;
          const d = this.dx(z.x, l.x) * z.dir;
          if (d < 0 || d > z.len) continue;
          l.dead = true;
          if (l.carry) { l.carry.held = null; l.carry.vy = 0; }
          sparkBurst(this.sparks, this.toScreen(l.x), l.y, 16, 120, "114,255,143");
        }
      }
      this.landers = this.landers.filter(l => !l.dead);
      this.lasers = this.lasers.filter(z => z.age < .3);
    },
    toScreen(x) { return this.ship.sx + this.dx(this.ship.x, x); },
    draw(t, dt) {
      if (!still) this.step(dt);
      const s = this.ship;
      // Stars drift past, slower than the ground.
      cx.shadowBlur = 0;
      for (const [x, y, b] of stars) {
        if (y > H * .7) continue;
        cx.fillStyle = `rgba(213,227,238,${b * .7})`;
        cx.fillRect(((x - s.x * .2) % W + W) % W, y, 1.5, 1.5);
      }
      // The mountains.
      beam("#ffb347", 8); cx.lineWidth = 1.5;
      cx.beginPath();
      for (let sx = 0; sx <= W + 24; sx += 12) { const y = this.groundAt(s.x + sx - s.sx); sx ? cx.lineTo(sx, y) : cx.moveTo(sx, y); }
      cx.stroke();
      // Humanoids.
      beam("#ff4fd8", 8); cx.lineWidth = 1.5;
      for (const h of this.humans) {
        const x = this.toScreen(h.x); if (x < -20 || x > W + 20) continue;
        cx.beginPath(); cx.moveTo(x, h.y - 8); cx.lineTo(x, h.y + 2); cx.moveTo(x - 4, h.y - 4); cx.lineTo(x + 4, h.y - 4);
        cx.moveTo(x, h.y + 2); cx.lineTo(x - 3, h.y + 8); cx.moveTo(x, h.y + 2); cx.lineTo(x + 3, h.y + 8); cx.stroke();
      }
      // Landers: a dome on legs, green and yellow.
      for (const l of this.landers) {
        const x = this.toScreen(l.x); if (x < -30 || x > W + 30) continue;
        beam("#72ff8f", 10); cx.lineWidth = 1.6;
        cx.beginPath(); cx.arc(x, l.y, 8, Math.PI, 0); cx.lineTo(x + 10, l.y + 4); cx.lineTo(x - 10, l.y + 4); cx.closePath();
        cx.moveTo(x - 7, l.y + 4); cx.lineTo(x - 11, l.y + 12); cx.moveTo(x + 7, l.y + 4); cx.lineTo(x + 11, l.y + 12); cx.stroke();
        beam("#ffe14a", 8); cx.fillStyle = "#ffe14a";
        cx.fillRect(x - 4 + Math.sin(l.t * 6) * 3, l.y - 3, 3, 3);
      }
      beam("#ff8a8a", 8); cx.fillStyle = "#ff8a8a";
      for (const b of this.bolts) cx.fillRect(this.toScreen(b.x) - 2, b.y - 2, 4, 4);
      // The laser: a long streak, banded in colours, thinning out at its tip.
      for (const z of this.lasers) {
        const x0 = this.toScreen(z.x), fade = 1 - z.age / .3;
        for (let k = 0; k < 6; k++) {
          const a = z.len * k / 6, b = z.len * (k + 1) / 6;
          beam(["#ffffff", "#ff4fd8", "#5ce1ff", "#ffe14a", "#72ff8f", "#ff4a4a"][k], 8);
          cx.globalAlpha *= fade * (1 - k * .12); cx.lineWidth = 2;
          cx.beginPath(); cx.moveTo(x0 + a * z.dir, z.y); cx.lineTo(x0 + b * z.dir, z.y); cx.stroke();
          cx.globalAlpha /= fade * (1 - k * .12);
        }
      }
      // The ship: a long nose, a fin, and its flame behind.
      const x = s.sx, y = s.y, f = s.face;
      beam("#f2f2ff", 12); cx.lineWidth = 1.6;
      cx.beginPath(); cx.moveTo(x + f * 20, y + 2); cx.lineTo(x - f * 4, y - 4); cx.lineTo(x - f * 14, y - 10); cx.lineTo(x - f * 16, y);
      cx.lineTo(x - f * 16, y + 5); cx.closePath(); cx.stroke();
      if (Math.abs(s.vx) > 60 && Math.sin(t * 40) > -.3) {
        beam("#ff4fd8", 12);
        cx.beginPath(); cx.moveTo(x - f * 16, y); cx.lineTo(x - f * (26 + Math.random() * 10), y + 2); cx.lineTo(x - f * 16, y + 5); cx.stroke();
      }
      // The scanner: the whole world at a glance, top right.
      const sw = Math.min(W * .4, 360), sx0 = W - sw - 16, sy0 = 10, sh = 40;
      beam("rgba(92,225,255,.5)", 0); cx.lineWidth = 1;
      cx.strokeRect(sx0, sy0, sw, sh);
      const toScan = wx => sx0 + sw / 2 + this.dx(s.x, wx) / this.WW * sw;
      beam("rgba(255,179,71,.7)", 0);
      cx.beginPath();
      for (let k = 0; k <= 60; k++) { const wx = s.x - this.WW / 2 + k * this.WW / 60, yy = sy0 + (this.groundAt(wx) / H) * sh; k ? cx.lineTo(toScan(wx), yy) : cx.moveTo(toScan(wx), yy); }
      cx.stroke();
      cx.fillStyle = "#72ff8f"; for (const l of this.landers) cx.fillRect(toScan(l.x) - 1.5, sy0 + l.y / H * sh - 1.5, 3, 3);
      cx.fillStyle = "#ff4fd8"; for (const h of this.humans) cx.fillRect(toScan(h.x) - 1, sy0 + h.y / H * sh - 1, 2, 2);
      cx.fillStyle = "#ffffff"; cx.fillRect(sx0 + sw / 2 - 2, sy0 + s.y / H * sh - 2, 4, 4);
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Tron: light cycles racing on the grid, each walling the others in -----
  // Three cycles leave walls behind them and can turn only at right angles. Each looks at the ways it could
  // go and takes the one with the most room beyond it, now and then cutting across another's path. Whoever
  // hits a wall de-rezzes; the last one riding wins the round.
  const tron = {
    name: "TRON",
    layout() {
      const a = arena(18);
      this.g = W < 700 ? 6 : 8;
      this.gw = Math.floor(a.w / this.g); this.gh = Math.floor(a.h / this.g);
      this.ox = a.x0 + (a.w - this.gw * this.g) / 2; this.oy = a.y0 + (a.h - this.gh * this.g) / 2;
      this.reset();
    },
    reset() {
      const { gw, gh } = this;
      this.grid = new Int8Array(gw * gh);
      const starts = [[Math.floor(gw * .2), Math.floor(gh * .5), 0], [Math.floor(gw * .8), Math.floor(gh * .3), 2], [Math.floor(gw * .6), Math.floor(gh * .85), 3]];
      this.cycles = [["#5ce1ff", "92,225,255"], ["#ffb347", "255,179,71"], ["#72ff8f", "114,255,143"]].map(([colour, rgb], i) => {
        const [c, r, d] = starts[i];
        return { colour, rgb, c, r, d, alive: true, fade: 1, trail: [[c, r]], id: i + 1 };
      });
      for (const y of this.cycles) this.grid[y.r * gw + y.c] = y.id;
      this.clock = 0; this.over = 0; this.sparks = this.sparks ?? [];
    },
    start() { if (!this.grid) this.layout(); },
    free(c, r) { return c >= 0 && r >= 0 && c < this.gw && r < this.gh && this.grid[r * this.gw + c] === 0; },
    // How much room there is beyond a cell, counted up to a limit.
    room(c, r) {
      const seen = new Set(), stack = [[c, r]];
      while (stack.length && seen.size < 220) {
        const [x, y] = stack.pop(), k = y * this.gw + x;
        if (seen.has(k) || !this.free(x, y)) continue;
        seen.add(k);
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      return seen.size;
    },
    step(dt) {
      if (this.over > 0) { this.over -= dt; if (this.over <= 0) this.reset(); return; }
      for (const y of this.cycles) if (!y.alive) y.fade = Math.max(0, y.fade - dt);
      this.clock += dt * 20;
      while (this.clock >= 1) {
        this.clock -= 1;
        const moves = [];
        for (const y of this.cycles.filter(y => y.alive)) {
          const foe = this.cycles.find(o => o !== y && o.alive);
          let best = -1, score = -Infinity;
          for (const turn of [0, 1, 3]) {
            const d = (y.d + turn) % 4, nc = y.c + DIRS[d][0], nr = y.r + DIRS[d][1];
            if (!this.free(nc, nr)) continue;
            let s = this.room(nc, nr) + (turn === 0 ? 25 : 0) + rand(0, 20);
            if (foe && s > 150) s += 30 - Math.min(30, Math.abs(nc - foe.c) + Math.abs(nr - foe.r)) * (Math.random() < .3 ? 1 : 0);
            if (s > score) { score = s; best = d; }
          }
          moves.push([y, best]);
        }
        for (const [y, d] of moves) {
          if (d < 0) { this.derez(y); continue; }
          if (d !== y.d) y.trail.push([y.c, y.r]);
          y.d = d; y.c += DIRS[d][0]; y.r += DIRS[d][1];
        }
        // Two into the same cell: both go.
        for (const [y] of moves) {
          if (!y.alive) continue;
          if (this.cycles.some(o => o !== y && o.alive && o.c === y.c && o.r === y.r)) this.derez(y);
          else this.grid[y.r * this.gw + y.c] = y.id;
        }
        if (this.cycles.filter(y => y.alive).length <= 1) { this.over = 2.2; break; }
      }
      // A wall gone dark is cleared away.
      for (const y of this.cycles)
        if (!y.alive && y.fade <= 0 && !y.cleared) { y.cleared = true; for (let k = 0; k < this.grid.length; k++) if (this.grid[k] === y.id) this.grid[k] = 0; }
    },
    derez(y) {
      y.alive = false; y.fade = 1;
      sparkBurst(this.sparks, this.ox + (y.c + .5) * this.g, this.oy + (y.r + .5) * this.g, 22, 130, y.rgb);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      const { g, gw, gh, ox, oy } = this;
      // The grid floor.
      beam("rgba(30,60,110,.55)", 0); cx.lineWidth = 1;
      cx.beginPath();
      for (let x = 0; x <= gw; x += 4) { cx.moveTo(ox + x * g, oy); cx.lineTo(ox + x * g, oy + gh * g); }
      for (let y = 0; y <= gh; y += 4) { cx.moveTo(ox, oy + y * g); cx.lineTo(ox + gw * g, oy + y * g); }
      cx.stroke();
      beam("#5ce1ff", 8); cx.lineWidth = 1.4; cx.strokeRect(ox, oy, gw * g, gh * g);
      // The walls of light, and the cycles at their heads.
      for (const y of this.cycles) {
        if (y.fade <= 0) continue;
        const flick = y.alive ? 1 : y.fade * (Math.sin(t * 30) > 0 ? 1 : .5);
        cx.globalAlpha *= flick;
        beam(y.colour, 12); cx.lineWidth = 2.4;
        cx.beginPath();
        y.trail.forEach(([c, r], i) => i ? cx.lineTo(ox + (c + .5) * g, oy + (r + .5) * g) : cx.moveTo(ox + (c + .5) * g, oy + (r + .5) * g));
        cx.lineTo(ox + (y.c + .5) * g, oy + (y.r + .5) * g);
        cx.stroke();
        if (y.alive) {
          const [dc, dr] = DIRS[y.d], hx = ox + (y.c + .5) * g, hy = oy + (y.r + .5) * g;
          beam("#ffffff", 14); cx.lineWidth = 2;
          cx.beginPath(); cx.moveTo(hx - dc * 9 - dr * 3, hy - dr * 9 - dc * 3); cx.lineTo(hx + dc * 4 - dr * 3, hy + dr * 4 - dc * 3);
          cx.lineTo(hx + dc * 4 + dr * 3, hy + dr * 4 + dc * 3); cx.lineTo(hx - dc * 9 + dr * 3, hy - dr * 9 + dc * 3); cx.closePath(); cx.stroke();
        }
        cx.globalAlpha /= flick || 1;
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Gravitar: a ship fighting gravity over a planet, knocking out its bunkers -----
  // Gravity pulls the ship down all the time. It climbs nose-up on its thruster, then turns to aim at the
  // nearest bunker and fires as it sinks, climbing again before it gets too low. The bunkers fire back.
  // With every bunker gone, the planet is left behind and a new one comes up.
  const gravitar = {
    name: "GRAVITAR",
    layout() {
      this.x0 = W < 700 ? 0 : W * .42;
      this.reset();
    },
    reset() {
      // The ground runs right across; the bunkers sit on flats out to the right, with hills between them.
      const pts = [], bunkers = [];
      let x = -10, y = H * .86, since = 9;
      while (x < W + 30) {
        if (bunkers.length < 4 && since >= 2 && x > this.x0 + 40 && x < W - 60 && Math.random() < .5) {
          pts.push([x, y], [x + 46, y]);
          bunkers.push({ x: x + 23, y, alive: true, fire: rand(1.5, 4), a: -Math.PI / 2 });
          x += 46; since = 0;
        } else {
          since++;
          y += rand(-70, 70);
          if (y < H * .58) y = H * .58 + rand(20, 60); else if (y > H * .95) y = H * .95 - rand(20, 60);
          pts.push([x, y]);
        }
        x += rand(26, 52);
      }
      this.pts = pts; this.bunkers = bunkers;
      this.ship = { x: (this.x0 + W) / 2, y: H * .2, vx: 0, vy: 0, a: -Math.PI / 2, alive: true, wait: 0, fire: 0, thrust: false, mode: "climb" };
      this.shots = []; this.bolts = []; this.sparks = this.sparks ?? []; this.next = 0;
    },
    start() { if (!this.pts) this.layout(); },
    groundAt(x) {
      const p = this.pts;
      for (let i = 1; i < p.length; i++) if (p[i][0] >= x) { const [ax, ay] = p[i - 1], [bx, by] = p[i]; return ay + (by - ay) * (x - ax) / Math.max(1, bx - ax); }
      return H;
    },
    step(dt) {
      const s = this.ship, G = 50;
      if (this.next > 0) { this.next -= dt; if (this.next <= 0) this.reset(); return; }
      if (!s.alive) { s.wait -= dt; if (s.wait <= 0) Object.assign(s, { alive: true, x: (this.x0 + W) / 2, y: H * .15, vx: 0, vy: 0, a: -Math.PI / 2, mode: "climb" }); }
      else {
        const target = this.bunkers.filter(b => b.alive).sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))[0];
        const ground = Math.min(this.groundAt(s.x - 20), this.groundAt(s.x), this.groundAt(s.x + 20));
        const low = ground - 120, high = Math.max(H * .12, ground - 230);
        if (s.mode === "attack" && (s.y > low || s.vy > 70)) s.mode = "climb";
        if (s.mode === "climb" && s.y < high && s.vy < 20) s.mode = "attack";
        let want = -Math.PI / 2;
        if (s.mode === "climb") want += target ? Math.max(-.5, Math.min(.5, (target.x - s.x) * .004)) : 0;
        else if (target) want = Math.atan2(target.y - 6 - s.y, target.x - s.x);
        const err = angleTo(s.a, want);
        s.a += Math.max(-3.2 * dt, Math.min(3.2 * dt, err));
        s.thrust = s.mode === "climb" && Math.abs(err) < .5;
        if (s.thrust) { s.vx += Math.cos(s.a) * 150 * dt; s.vy += Math.sin(s.a) * 150 * dt; }
        s.vy += G * dt;
        s.vx *= 1 - .4 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.x < this.x0 + 20 || s.x > W - 20) { s.vx = -s.vx * .5; s.x = Math.max(this.x0 + 20, Math.min(W - 20, s.x)); }
        s.y = Math.max(20, s.y);
        s.fire -= dt;
        if (s.mode === "attack" && target && Math.abs(err) < .08 && s.fire <= 0) {
          s.fire = .32;
          this.shots.push({ x: s.x + Math.cos(s.a) * 12, y: s.y + Math.sin(s.a) * 12, vx: Math.cos(s.a) * 320 + s.vx, vy: Math.sin(s.a) * 320 + s.vy, age: 0 });
        }
        if (s.y > this.groundAt(s.x) - 6) this.crash();
      }
      // Bunkers turn their guns on the ship and fire now and then.
      for (const b of this.bunkers) {
        if (!b.alive) continue;
        if (s.alive) b.a = Math.atan2(s.y - b.y, s.x - b.x);
        b.fire -= dt;
        if (b.fire <= 0 && s.alive) { b.fire = rand(2.2, 4); this.bolts.push({ x: b.x, y: b.y - 8, vx: Math.cos(b.a) * 120, vy: Math.sin(b.a) * 120, age: 0 }); }
      }
      for (const z of this.shots) {
        z.x += z.vx * dt; z.y += z.vy * dt; z.vy += G * .3 * dt; z.age += dt;
        const hit = this.bunkers.find(b => b.alive && Math.hypot(b.x - z.x, b.y - 6 - z.y) < 14);
        if (hit) { hit.alive = false; z.dead = true; sparkBurst(this.sparks, hit.x, hit.y - 6, 20, 120, "255,179,71"); }
        else if (z.y > this.groundAt(z.x) || z.age > 1.6) z.dead = true;
      }
      this.shots = this.shots.filter(z => !z.dead);
      for (const z of this.bolts) {
        z.x += z.vx * dt; z.y += z.vy * dt; z.age += dt;
        if (s.alive && Math.hypot(z.x - s.x, z.y - s.y) < 9) { z.dead = true; this.crash(); }
      }
      this.bolts = this.bolts.filter(z => !z.dead && z.age < 3.5);
      if (!this.bunkers.some(b => b.alive) && this.next <= 0) this.next = 2.5;
    },
    crash() {
      const s = this.ship;
      s.alive = false; s.wait = 2;
      sparkBurst(this.sparks, s.x, s.y, 18, 120, "92,225,255");
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, .7);
      // The planet's surface.
      beam("#72ff8f", 10); cx.lineWidth = 1.6;
      cx.beginPath(); this.pts.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y)); cx.stroke();
      // Bunkers: a dome with its gun turned on the ship.
      for (const b of this.bunkers) {
        if (!b.alive) continue;
        beam("#ffb347", 10); cx.lineWidth = 1.6;
        cx.beginPath(); cx.arc(b.x, b.y, 11, Math.PI, 0); cx.closePath();
        cx.moveTo(b.x, b.y - 7); cx.lineTo(b.x + Math.cos(b.a) * 17, b.y - 7 + Math.sin(b.a) * 17); cx.stroke();
      }
      beam("#ff4fd8", 8); cx.fillStyle = "#ff4fd8";
      for (const z of this.bolts) { cx.beginPath(); cx.arc(z.x, z.y, 2.5, 0, Math.PI * 2); cx.fill(); }
      beam("#ffffff", 8); cx.fillStyle = "#ffffff";
      for (const z of this.shots) cx.fillRect(z.x - 1.5, z.y - 1.5, 3, 3);
      const s = this.ship;
      if (s.alive) {
        const c = Math.cos(s.a), n = Math.sin(s.a), P = (f, side) => [s.x + c * f - n * side, s.y + n * f + c * side];
        beam("#5ce1ff", 12); cx.lineWidth = 1.6;
        cx.beginPath(); cx.moveTo(...P(13, 0)); cx.lineTo(...P(-8, -8)); cx.lineTo(...P(-4, 0)); cx.lineTo(...P(-8, 8)); cx.closePath(); cx.stroke();
        if (s.thrust && Math.sin(t * 50) > -.2) {
          beam("#ff4fd8", 12);
          cx.beginPath(); cx.moveTo(...P(-5, -4)); cx.lineTo(...P(-13 - Math.random() * 6, 0)); cx.lineTo(...P(-5, 4)); cx.stroke();
        }
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Elite: a Cobra Mk III docking at a Coriolis station -----
  // The station turns slowly on its axis in front of a planet, its slot facing out into space. A Cobra swings
  // in, lines up on the axis, rolls to match the station's spin and slides in through the slot; a moment later
  // another ship launches and heads off past the camera, and the next Cobra comes in. Now and then a Krait or
  // a Viper goes by. Faces turned away are left out, as Elite did, and the scanner shows where everything is.
  const elite = {
    name: "ELITE",
    // Models much as Elite kept them: vertices (the first n make the hull), faces as loops of vertex numbers,
    // markings drawn with their face ([face, loop]), lines always drawn, and a scale to world units.
    M: {
      station: { s: 10, n: 12, v: [[.71, .71, 1], [-.71, .71, 1], [-.71, -.71, 1], [.71, -.71, 1], [.71, .71, -1], [-.71, .71, -1], [-.71, -.71, -1], [.71, -.71, -1],
        [1.41, 0, 0], [0, 1.41, 0], [-1.41, 0, 0], [0, -1.41, 0], [.42, .1, 1], [-.42, .1, 1], [-.42, -.1, 1], [.42, -.1, 1]],
        f: [[0, 1, 2, 3], [4, 5, 6, 7], [9, 0, 8, 4], [10, 2, 11, 6], [9, 1, 10, 5], [8, 3, 11, 7],
          [0, 1, 9], [1, 2, 10], [2, 3, 11], [3, 0, 8], [4, 5, 9], [5, 6, 10], [6, 7, 11], [7, 4, 8]],
        d: [[0, [12, 13, 14, 15]]] },
      cobra: { s: .03, n: 12, v: [[32, 0, 76], [-32, 0, 76], [0, 26, 24], [-120, -3, -8], [120, -3, -8], [-88, 16, -40], [88, 16, -40], [128, -8, -40],
        [-128, -8, -40], [0, 26, -40], [-32, -24, -40], [32, -24, -40], [-36, -10, -40], [-12, -10, -40], [-12, 8, -40], [-36, 8, -40],
        [12, -10, -40], [36, -10, -40], [36, 8, -40], [12, 8, -40]],
        f: [[0, 2, 1], [1, 2, 9, 5], [0, 6, 9, 2], [1, 5, 3], [0, 4, 6], [3, 5, 8], [4, 7, 6], [5, 9, 6, 7, 11, 10, 8], [0, 1, 10, 11], [1, 3, 8, 10], [0, 11, 7, 4]],
        d: [[7, [12, 13, 14, 15]], [7, [16, 17, 18, 19]]] },
      viper: { s: .03, n: 9, v: [[0, 0, 72], [0, 16, 24], [0, -16, 24], [48, 0, -24], [-48, 0, -24], [24, -16, -24], [-24, -16, -24], [24, 16, -24], [-24, 16, -24]],
        f: [[0, 1, 7], [0, 7, 3], [0, 8, 1], [0, 4, 8], [0, 2, 5], [0, 5, 3], [0, 6, 2], [0, 4, 6], [1, 8, 7], [2, 5, 6], [3, 7, 8, 4, 6, 5]] },
      krait: { s: .026, n: 5, v: [[0, 0, 96], [0, 18, -48], [0, -18, -48], [90, 0, -3], [-90, 0, -3], [90, 0, 87], [-90, 0, 87]],
        f: [[0, 3, 1], [0, 2, 3], [0, 1, 4], [0, 4, 2], [1, 3, 2], [1, 2, 4]], x: [[3, 5], [4, 6]] },
    },
    CY: 16, SPIN: .3, ST: [4, 2, 100], // seconds per docking, the station's spin, and where it sits
    layout() {
      this.cxs = W < 700 ? W * .5 : W * .7; this.cy = H * .48;
      this.F = Math.min(W < 700 ? W : W * .54, H) * 1.15;
      this.A = this.norm([-.35, .1, -.93]); // the station's axis, out through the slot
      if (this.T === undefined) { this.T = still ? 7 : 1.5; this.others = []; this.wait = 3; }
    },
    start() { if (this.T === undefined) this.layout(); },
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    add: (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    norm(a) { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    bez(P, k) { const j = 1 - k; return [0, 1, 2].map(i => j * j * j * P[0][i] + 3 * j * j * k * P[1][i] + 3 * j * k * k * P[2][i] + k * k * k * P[3][i]); },
    // A ship's axes (right, up, forward) for a heading and a roll about it.
    axes(f, roll) {
      const r0 = this.norm(this.cross([0, 1, 0], f)), u0 = this.cross(f, r0), c = Math.cos(roll), s = Math.sin(roll);
      return [this.add(this.add([0, 0, 0], r0, c), u0, s), this.add(this.add([0, 0, 0], u0, c), r0, -s), f];
    },
    // Rolling to bank into the turn along a curve.
    bank(P, k, f) {
      const r0 = this.norm(this.cross([0, 1, 0], f)), f2 = this.norm(this.sub(this.bez(P, Math.min(1, k + .03)), this.bez(P, Math.max(0, k - .03))));
      return Math.max(-.9, Math.min(.9, -10 * this.dot(this.sub(f2, f), r0)));
    },
    tangent(P, k) { return this.norm(this.sub(this.bez(P, Math.min(1, k + .005)), this.bez(P, Math.max(0, k - .005)))); },
    // Where the docking ship (or the one launching) is at time T: model, position, axes, and the slot's plane.
    pose(T) {
      const { A, ST, CY, SPIN } = this, tau = T % CY, c0 = T - tau, S = this.M.station.s;
      const cut = [ST, A, S];
      if (tau < 6) {
        // Swinging in from behind the camera and on to the axis, rolling to match the slot as it lines up.
        const P = [[34, -12, 30], [28, 2, 75], this.add(ST, A, 42), this.add(ST, A, 30)], k = tau / 6, f = this.tangent(P, k);
        const match = -SPIN * T + Math.round(SPIN * (c0 + 6) / Math.PI) * Math.PI, m = Math.min(1, Math.max(0, (k - .5) / .5));
        const ease = m * m * (3 - 2 * m);
        return { m: "cobra", pos: this.bez(P, k), ax: this.axes(f, this.bank(P, k, f) * (1 - ease) + match * ease) };
      }
      if (tau < 9.5) {
        const d = 30 - (tau - 6) / 3.5 * 22;
        return { m: "cobra", pos: this.add(ST, A, d), ax: this.axes(this.sub([0, 0, 0], A), -SPIN * T + Math.round(SPIN * (c0 + 6) / Math.PI) * Math.PI), cut };
      }
      if (tau < 10.5) return null;
      const m = ["krait", "viper", "cobra"][Math.floor(T / CY) % 3];
      if (tau < 12.5) {
        // Out through the slot, still turning with the station until it's clear.
        const d = 8 + (tau - 10.5) / 2 * 16;
        return { m, pos: this.add(ST, A, d), ax: this.axes(A, SPIN * T - Math.round(SPIN * (c0 + 12.5) / Math.PI) * Math.PI), cut };
      }
      const P = [this.add(ST, A, 24), this.add(ST, A, 32), [20, 16, 30], [40, 30, -5]], k = (tau - 12.5) / 3.5, f = this.tangent(P, k);
      const from = SPIN * T - Math.round(SPIN * (c0 + 12.5) / Math.PI) * Math.PI, e = Math.min(1, k / .4);
      return { m, pos: this.bez(P, k), ax: this.axes(f, from * (1 - e) + this.bank(P, k, f) * e) };
    },
    // A line in camera space, cut at the near plane and, for a ship in the slot, at the station's face.
    seg(a, b, cut) {
      if (cut) {
        const da = this.dot(this.sub(a, cut[0]), cut[1]) - cut[2], db = this.dot(this.sub(b, cut[0]), cut[1]) - cut[2];
        if (da < 0 && db < 0) return;
        if (da < 0) a = this.add(a, this.sub(b, a), da / (da - db)); else if (db < 0) b = this.add(b, this.sub(a, b), db / (db - da));
      }
      let [ax, ay, az] = a, [bx, by, bz] = b;
      const near = .5;
      if (az < near && bz < near) return;
      if (az < near) { const k = (near - az) / (bz - az); ax += (bx - ax) * k; ay += (by - ay) * k; az = near; }
      if (bz < near) { const k = (near - bz) / (az - bz); bx += (ax - bx) * k; by += (ay - by) * k; bz = near; }
      cx.moveTo(this.cxs + ax / az * this.F, this.cy - ay / az * this.F);
      cx.lineTo(this.cxs + bx / bz * this.F, this.cy - by / bz * this.F);
    },
    // A model at pos with axes [r, u, f], leaving out the faces turned away from the eye.
    solid(m, pos, [r, u, f], cut) {
      const P = m.v.map(([x, y, z]) => [0, 1, 2].map(i => pos[i] + (r[i] * x + u[i] * y + f[i] * z) * m.s));
      const C = [0, 1, 2].map(i => P.slice(0, m.n).reduce((s, p) => s + p[i], 0) / m.n), seen = new Set();
      const loop = L => L.forEach((a, i) => {
        const b = L[(i + 1) % L.length], key = Math.min(a, b) * 64 + Math.max(a, b);
        if (!seen.has(key)) { seen.add(key); this.seg(P[a], P[b], cut); }
      });
      m.f.forEach((L, fi) => {
        const n = this.cross(this.sub(P[L[1]], P[L[0]]), this.sub(P[L[2]], P[L[0]]));
        const mid = [0, 1, 2].map(i => L.reduce((s, j) => s + P[j][i], 0) / L.length);
        if (this.dot(n, mid) * Math.sign(this.dot(n, this.sub(mid, C))) >= 0) return;
        loop(L);
        for (const [face, D] of m.d ?? []) if (face === fi) loop(D);
      });
      for (const [a, b] of m.x ?? []) this.seg(P[a], P[b], cut);
    },
    step(dt) {
      this.T += dt;
      // Traders passing through, from far out to past the camera.
      this.wait -= dt;
      if (this.wait <= 0 && this.others.length < 2) {
        this.wait = rand(5, 9);
        const a = [rand(15, 45), rand(-25, 25), 180], b = [rand(25, 60), rand(-30, 30), -10];
        this.others.push({ m: Math.random() < .5 ? "krait" : "viper", a, b, age: 0, life: rand(5, 7), spin: rand(-1.2, 1.2) });
      }
      for (const o of this.others) o.age += dt;
      this.others = this.others.filter(o => o.age < o.life);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, 1);
      const { A, ST } = this, w = W < 700 ? W : W * .54;
      // The planet, with its equator and a meridian turning round it.
      const pr = Math.min(H * .22, w * .25), px = this.cxs + w * .26, py = this.cy - H * .17, tilt = -.35;
      beam("#ffb347", 10); cx.lineWidth = 1.6;
      cx.beginPath(); cx.arc(px, py, pr, 0, Math.PI * 2); cx.stroke();
      beam("rgba(255,179,71,.55)", 6); cx.lineWidth = 1.2;
      cx.beginPath(); cx.ellipse(px, py, pr, pr * .3, tilt, 0, Math.PI); cx.stroke();
      const lon = wrap(this.T * .12, -Math.PI / 2, Math.PI), side = lon > 0 ? 1 : -1;
      cx.beginPath(); cx.ellipse(px, py, pr * Math.abs(Math.sin(lon)), pr, tilt, side > 0 ? -Math.PI / 2 : Math.PI / 2, side > 0 ? Math.PI / 2 : Math.PI * 1.5); cx.stroke();
      // The station, turning.
      beam("#ffffff", 9); cx.lineWidth = 1.6;
      cx.beginPath(); this.solid(this.M.station, ST, this.axes(A, this.SPIN * this.T)); cx.stroke();
      // The ship docking or launching, and anyone passing by.
      const p = this.pose(this.T);
      if (p) {
        beam(p.m === "cobra" && this.T % this.CY < 10 ? "#5ce1ff" : "#72ff8f", 10); cx.lineWidth = 1.5;
        cx.beginPath(); this.solid(this.M[p.m], p.pos, p.ax, p.cut); cx.stroke();
      }
      beam("#ff4fd8", 10); cx.lineWidth = 1.4;
      cx.beginPath();
      for (const o of this.others) {
        const k = o.age / o.life;
        this.solid(this.M[o.m], this.add(o.a, this.sub(o.b, o.a), k), this.axes(this.norm(this.sub(o.b, o.a)), o.spin * o.age));
      }
      cx.stroke();
      // The sight in the middle of the front view.
      beam("rgba(213,227,238,.6)", 4); cx.lineWidth = 1.2;
      cx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { cx.moveTo(this.cxs + dx * 7, this.cy + dy * 7); cx.lineTo(this.cxs + dx * 18, this.cy + dy * 18); }
      cx.stroke();
      // The scanner: an ellipse seen from above and behind, each contact a dot on a stalk showing its height.
      const rx = Math.min(150, w * .3), ry = rx * .3, sx = this.cxs, sy = H - ry - Math.min(26, H * .05), R = 120;
      beam("rgba(114,255,143,.7)", 6); cx.lineWidth = 1.2;
      cx.beginPath();
      cx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); cx.moveTo(sx + rx * .5, sy); cx.ellipse(sx, sy, rx * .5, ry * .5, 0, 0, Math.PI * 2);
      cx.moveTo(sx - rx, sy); cx.lineTo(sx + rx, sy); cx.moveTo(sx, sy - ry); cx.lineTo(sx, sy + ry);
      cx.moveTo(sx - rx * .7, sy - ry * .7); cx.lineTo(sx, sy); cx.lineTo(sx + rx * .7, sy - ry * .7);
      cx.stroke();
      const blips = [[ST, "#ffffff"], ...this.others.map(o => [this.add(o.a, this.sub(o.b, o.a), o.age / o.life), "#ff4fd8"])];
      if (p) blips.push([p.pos, "#5ce1ff"]);
      cx.lineWidth = 1.6;
      for (const [q, col] of blips) {
        const bx = sx + q[0] / R * rx, by = sy - q[2] / R * ry, h = q[1] / R * ry * 3;
        if (((bx - sx) / rx) ** 2 + ((by - sy) / ry) ** 2 > 1) continue;
        beam(col, 6);
        cx.beginPath(); cx.moveTo(bx, by); cx.lineTo(bx, by - h); cx.moveTo(bx - 4, by - h); cx.lineTo(bx + 4, by - h); cx.stroke();
      }
    },
  };

  // ----- Tail Gunner: the rear turret, looking back along the ship's wake -----
  // Stars stream away into the dark behind. Fighters come up out of it in threes, weaving in to close range;
  // the gunner swings the sight onto the nearest, leading it a little, and both guns fire in to meet there. A
  // hit blows the fighter apart in lines. Any that get through hit the shields, which flash and lose a point;
  // when they run out they're topped up again.
  const tailgunner = {
    name: "TAILGUNNER",
    // A fighter, nose forward along +z: a dart with a fin on top and its wingtips turned down.
    SHIP: { v: [[0, 0, 1.6], [-1.5, 0, -.8], [1.5, 0, -.8], [0, 0, -.4], [0, .7, -.9], [-1.5, -.6, -1.1], [1.5, -.6, -1.1]],
            e: [[0, 1], [0, 2], [1, 3], [2, 3], [0, 4], [4, 3], [1, 5], [2, 6], [5, 3], [6, 3]] },
    layout() {
      this.w = W < 700 ? W : W * .54;
      this.cxs = W < 700 ? W * .5 : W * .69; this.cy = H * .46;
      this.F = Math.min(this.w, H) * .95;
      if (!this.stars) this.reset();
    },
    reset() {
      this.stars = Array.from({ length: 120 }, () => [rand(-12, 12), rand(-8, 8), rand(1.5, 60)]);
      this.ships = []; this.bits = []; this.shots = []; this.sparks = this.sparks ?? [];
      this.shields = 12; this.score = 0; this.flash = 0; this.fire = 0; this.lag = 0; this.waveWait = 2.5;
      this.aim = [.05, -.04]; // the sight, as a direction (x/z, y/z)
      this.wave(.42);
    },
    start() { if (!this.stars) this.layout(); },
    // Three fighters sharing one weaving path in towards the turret.
    wave(s0 = 0) {
      const p = { dur: rand(5.5, 7), x0: rand(-.25, .25), y0: rand(-.2, .2), amp: rand(.1, .22), ampY: rand(.05, .15), fq: rand(1, 2), ph: rand(0, 6.3) };
      p.t = s0 * p.dur;
      for (const [ox, oy] of [[0, 1.2], [-3, -.6], [3, -.6]]) this.ships.push({ ...p, ox, oy });
    },
    // Where a fighter is at s (0 far out, 1 at the turret).
    at(f, s) {
      const z = 8 + 105 * (1 - s) ** 1.5, fade = (1 - s) ** .7;
      const ax = f.x0 * (1 - s) + f.amp * Math.sin(f.fq * Math.PI * s + f.ph) * fade, ay = f.y0 * (1 - s) + f.ampY * Math.cos(f.fq * 2 * s + f.ph) * fade;
      return [ax * z + f.ox * fade, ay * z + f.oy * fade, z];
    },
    // The fighter's lines, posed along its path and banking into its turns.
    lines(f) {
      const s = f.t / f.dur, p = this.at(f, s), q = this.at(f, Math.min(1, s + .01));
      let dir = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const l = Math.hypot(...dir) || 1; dir = dir.map(v => v / l);
      let r = [dir[2], 0, -dir[0]]; const rl = Math.hypot(...r) || 1; r = r.map(v => v / rl);
      let u = [dir[1] * r[2] - dir[2] * r[1], dir[2] * r[0] - dir[0] * r[2], dir[0] * r[1] - dir[1] * r[0]];
      const b = Math.max(-.9, Math.min(.9, (q[0] - p[0]) * 3)), c = Math.cos(b), sn = Math.sin(b);
      [r, u] = [r.map((v, i) => v * c + u[i] * sn), u.map((v, i) => v * c - r[i] * sn)];
      const P = this.SHIP.v.map(([x, y, z]) => p.map((o, i) => o + r[i] * x + u[i] * y + dir[i] * z));
      return this.SHIP.e.map(([i, j]) => [P[i], P[j]]);
    },
    line(a, b) {
      let [ax, ay, az] = a, [bx, by, bz] = b;
      const near = .5;
      if (az < near && bz < near) return;
      if (az < near) { const k = (near - az) / (bz - az); ax += (bx - ax) * k; ay += (by - ay) * k; az = near; }
      if (bz < near) { const k = (near - bz) / (az - bz); bx += (ax - bx) * k; by += (ay - by) * k; bz = near; }
      cx.moveTo(this.cxs + ax / az * this.F, this.cy - ay / az * this.F);
      cx.lineTo(this.cxs + bx / bz * this.F, this.cy - by / bz * this.F);
    },
    screen([x, y, z]) { return [this.cxs + x / z * this.F, this.cy - y / z * this.F]; },
    step(dt) {
      for (const st of this.stars) {
        st[2] += 24 * dt;
        if (st[2] > 60) { st[0] = rand(-12, 12); st[1] = rand(-8, 8); st[2] = rand(1.5, 3); }
      }
      // Fighters close in; one that reaches the turret hits the shields.
      for (const f of this.ships) {
        f.t += dt;
        if (f.t >= f.dur) {
          f.gone = true; this.flash = 1;
          if (--this.shields <= 0) this.shields = 12;
        }
      }
      this.ships = this.ships.filter(f => !f.gone);
      this.waveWait -= dt;
      if (this.waveWait <= 0 && this.ships.length < 2) { this.wave(); this.waveWait = rand(2.5, 4); }
      this.flash = Math.max(0, this.flash - dt * 1.6);
      // The gunner: onto the nearest fighter, a little ahead of it, and fire when the sight is on.
      this.lag -= dt;
      const target = this.lag > 0 ? null : this.ships.filter(f => f.t / f.dur > .3).sort((a, b) => b.t / b.dur - a.t / a.dur)[0];
      if (target) {
        const [x, y, z] = this.at(target, Math.min(1, (target.t + .28) / target.dur));
        const ex = x / z - this.aim[0], ey = y / z - this.aim[1], d = Math.hypot(ex, ey), m = Math.min(d, .8 * dt);
        if (d > 1e-6) { this.aim[0] += ex / d * m; this.aim[1] += ey / d * m; }
        this.fire -= dt;
        if (d < .03 && this.fire <= 0) { this.fire = .4; this.shots.push({ age: 0, at: [this.aim[0] + rand(-.05, .05), this.aim[1] + rand(-.05, .05)] }); }
      } else {
        this.aim[0] *= 1 - dt; this.aim[1] *= 1 - dt;
      }
      // Shots meet at the sight after a moment, and take out anything there.
      for (const sh of this.shots) {
        sh.age += dt;
        if (sh.age < .28 || sh.done) continue;
        sh.done = true;
        const hit = this.ships.find(f => {
          const [x, y, z] = this.at(f, f.t / f.dur);
          return Math.hypot(x / z - sh.at[0], y / z - sh.at[1]) < Math.max(.035, 1.8 / z);
        });
        if (hit) {
          for (const [a, b] of this.lines(hit)) { const z = a[2]; this.bits.push({ a, b, v: [rand(-.15, .15) * z, rand(-.15, .15) * z, rand(0, .25) * z], age: 0 }); }
          const [px, py] = this.screen(this.at(hit, hit.t / hit.dur));
          sparkBurst(this.sparks, px, py, 14, 160, "255,179,71");
          this.ships.splice(this.ships.indexOf(hit), 1);
          this.score = (this.score + 100) % 1e6; this.lag = rand(.4, 2);
        }
      }
      this.shots = this.shots.filter(sh => sh.age < .45);
      for (const b of this.bits) {
        b.age += dt;
        for (const p of [b.a, b.b]) { p[0] += b.v[0] * dt; p[1] += b.v[1] * dt; p[2] += b.v[2] * dt; }
      }
      this.bits = this.bits.filter(b => b.age < 1.3);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      // The wake: stars streaming away towards the middle.
      cx.shadowBlur = 0; cx.lineWidth = 1.3;
      for (const [far, alpha] of [[false, .45], [true, .9]]) {
        cx.strokeStyle = `rgba(213,227,238,${alpha})`;
        cx.beginPath();
        for (const [x, y, z] of this.stars) if ((z < 14) === far) this.line([x, y, z], [x, y, z + (far ? 1.6 : .8)]);
        cx.stroke();
      }
      // Fighters and the wreckage of the ones that were hit.
      beam("#5ce1ff", 10); cx.lineWidth = 1.6;
      cx.beginPath();
      for (const f of this.ships) for (const [a, b] of this.lines(f)) this.line(a, b);
      cx.stroke();
      beam("#5ce1ff", 10); cx.lineWidth = 1.4;
      for (const b of this.bits) {
        cx.globalAlpha *= 1 - b.age / 1.3;
        cx.beginPath(); this.line(b.a, b.b); cx.stroke();
        cx.globalAlpha /= Math.max(.001, 1 - b.age / 1.3);
      }
      drawSparks(this.sparks, still ? 0 : dt);
      // Twin shots from the gun ports, meeting at the sight.
      const gx = this.w * .42;
      beam("#ffb347", 12); cx.lineWidth = 2.4;
      cx.beginPath();
      for (const sh of this.shots) {
        if (sh.age > .28) continue;
        const tx = this.cxs + sh.at[0] * this.F, ty = this.cy - sh.at[1] * this.F, k1 = sh.age / .28, k0 = Math.max(0, k1 - .25);
        for (const sx of [this.cxs - gx, this.cxs + gx]) {
          const e0 = k0 ** .6, e1 = k1 ** .6;
          cx.moveTo(sx + (tx - sx) * e0, H + (ty - H) * e0); cx.lineTo(sx + (tx - sx) * e1, H + (ty - H) * e1);
        }
      }
      cx.stroke();
      // The sight.
      const ax = this.cxs + this.aim[0] * this.F, ay = this.cy - this.aim[1] * this.F;
      beam("#72ff8f", 8); cx.lineWidth = 1.8;
      cx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { cx.moveTo(ax + dx * 8, ay + dy * 8); cx.lineTo(ax + dx * 24, ay + dy * 24); }
      cx.stroke();
      // The shields: a dome of light across the view when something gets through.
      if (this.flash > 0) {
        beam(`rgba(92,225,255,${this.flash})`, 18); cx.lineWidth = 2;
        cx.beginPath();
        for (let i = 0; i < 4; i++) { const r = this.w * (.42 + i * .05); cx.moveTo(this.cxs + r, H + 10); cx.arc(this.cxs, H + 10, r, 0, Math.PI, true); }
        for (let i = -3; i <= 3; i++) { const a = -Math.PI / 2 + i * .32; cx.moveTo(this.cxs + Math.cos(a) * this.w * .42, H + 10 + Math.sin(a) * this.w * .42); cx.lineTo(this.cxs + Math.cos(a) * this.w * .57, H + 10 + Math.sin(a) * this.w * .57); }
        cx.stroke();
      }
      // Shields and score, as on the cabinet.
      cx.shadowBlur = 6; cx.shadowColor = "#72ff8f"; cx.fillStyle = this.flash > 0 ? "#ffffff" : "#72ff8f";
      cx.font = "20px VT323, monospace"; cx.textAlign = "center"; cx.textBaseline = "top";
      cx.fillText(`SHIELDS ${String(this.shields).padStart(2, "0")}    ${String(this.score).padStart(6, "0")}`, this.cxs, Math.max(16, H * .04));
      cx.shadowBlur = 0;
    },
  };

  // ----- Red Baron: from the cockpit of a biplane -----
  // Low over a wireframe country of fields, sheds and mountains, banking through gentle turns. Enemy biplanes
  // come at you head on, and now and then a blimp drifts across. The pilot turns onto the nearest and the twin
  // guns' tracers meet where the sight points; a hit plane rolls over and goes down trailing smoke, and the
  // blimp takes a good few rounds before it sags and falls.
  const redbaron = {
    name: "RED BARON",
    // An enemy biplane, nose along +z: two wings, struts, a tapering fuselage, tailplane and fin.
    PLANE: { v: [[-4.5, 1.3, .8], [4.5, 1.3, .8], [4.5, 1.3, -.7], [-4.5, 1.3, -.7], [-4, -.2, .6], [4, -.2, .6], [4, -.2, -.7], [-4, -.2, -.7],
      [-.5, -.1, 1.6], [.5, -.1, 1.6], [.5, .8, 1.6], [-.5, .8, 1.6], [0, .4, -4.5], [-1.7, .4, -3.6], [1.7, .4, -3.6], [1.7, .4, -4.4], [-1.7, .4, -4.4],
      [0, .4, -3.7], [0, 1.6, -4.4], [-3, 1.3, 0], [-3, -.2, 0], [3, 1.3, 0], [3, -.2, 0]],
      e: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [8, 9], [9, 10], [10, 11], [11, 8], [8, 12], [9, 12], [10, 12], [11, 12],
        [13, 14], [14, 15], [15, 16], [16, 13], [17, 18], [18, 12], [19, 20], [21, 22]] },
    layout() {
      this.w = W < 700 ? W : W * .54;
      this.cxs = W < 700 ? W * .5 : W * .69; this.cy = H * .42;
      this.F = Math.min(this.w, H) * 1.05;
      if (!this.blimp) this.blimp = this.blimpModel();
      if (!this.peaks) this.reset();
    },
    // A blimp: an envelope of rings and long lines, four fins, and a gondola underneath.
    blimpModel() {
      const v = [], e = [], L = 17, R = 5, n = 8, ring = [-12, -6, 0, 6, 12];
      const pt = (z, a) => { const r = R * Math.sqrt(Math.max(0, 1 - (z / L) ** 2)); return [Math.cos(a) * r, Math.sin(a) * r, z]; };
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        for (let k = 0; k <= 12; k++) { v.push(pt(-L + k * L / 6, a)); if (k) e.push([v.length - 2, v.length - 1]); }
      }
      for (const z of ring) {
        const s = v.length;
        for (let i = 0; i < n; i++) { v.push(pt(z, i / n * Math.PI * 2)); e.push([s + i, s + (i + 1) % n]); }
      }
      for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const s = v.length;
        v.push([x * 2.4, y * 2.4, -12], [x * 6, y * 6, -16.5], [x * 6, y * 6, -13], [x * 1.4, y * 1.4, -15.5]);
        e.push([s, s + 1], [s + 1, s + 3], [s + 1, s + 2], [s + 2, s]);
      }
      const s = v.length;
      v.push([-1, -5.6, 3], [1, -5.6, 3], [1, -5.6, -3], [-1, -5.6, -3], [0, -4.8, 3], [0, -4.8, -3]);
      e.push([s, s + 1], [s + 1, s + 2], [s + 2, s + 3], [s + 3, s], [s, s + 4], [s + 1, s + 4], [s + 2, s + 5], [s + 3, s + 5]);
      return { v, e };
    },
    reset() {
      this.h = 0; this.bank = 0; this.alt = 12; this.px = 0; this.pz = 0; this.clock = 0;
      this.peaks = Array.from({ length: 72 }, (_, i) => i % 7 ? rand(4, 22) : rand(26, 44));
      this.sheds = Array.from({ length: 12 }, () => this.shed(rand(20, 220)));
      this.foes = [this.foe(110, .08)]; this.tracers = []; this.smoke = []; this.sparks = this.sparks ?? [];
      this.spawn = 3; this.fire = 0; this.puff = 0;
    },
    start() { if (!this.peaks) this.layout(); },
    // A building somewhere ahead: a block, some with a pitched roof.
    shed(d) {
      const a = this.h + (W < 700 ? rand(-.8, .8) : rand(-.45, .9));
      return { x: Math.sin(a) * d, z: Math.cos(a) * d, w: rand(3, 7), d: rand(3, 8), ht: rand(2, 5), yaw: rand(0, 1.6), roof: Math.random() < .5 };
    },
    // An enemy plane coming in from ahead (or a blimp crossing).
    foe(d, off = rand(-.3, .3), blimp = false) {
      const a = this.h + off, x = Math.sin(a) * d, z = Math.cos(a) * d;
      return blimp
        ? { blimp, x, z, y: this.alt + 5, yaw: a + (Math.random() < .5 ? 1.5 : -1.5), sp: 5, hp: 7, roll: 0, pitch: 0, vy: 0 }
        : { blimp, x, z, y: this.alt + rand(-1, 4), dy: rand(-1, 4), d0: d, yaw: Math.atan2(-x, -z) + rand(-.15, .15), sp: 22, hp: 1, roll: 0, pitch: 0, vy: 0, ph: rand(0, 6.3) };
    },
    // World (relative to the plane) to camera: turn to the heading, drop to the plane's height, roll with the bank.
    cam(x, y, z) {
      const s = Math.sin(this.h), c = Math.cos(this.h), b = this.bank;
      const X = x * c - z * s, Y = y - this.alt, Z = x * s + z * c;
      return [X * Math.cos(b) - Y * Math.sin(b), X * Math.sin(b) + Y * Math.cos(b), Z];
    },
    line(a, b) {
      let [ax, ay, az] = a, [bx, by, bz] = b;
      const near = .5;
      if (az < near && bz < near) return;
      if (az < near) { const k = (near - az) / (bz - az); ax += (bx - ax) * k; ay += (by - ay) * k; az = near; }
      if (bz < near) { const k = (near - bz) / (az - bz); bx += (ax - bx) * k; by += (ay - by) * k; bz = near; }
      cx.moveTo(this.cxs + ax / az * this.F, this.cy - ay / az * this.F);
      cx.lineTo(this.cxs + bx / bz * this.F, this.cy - by / bz * this.F);
    },
    // A model placed at (x, y, z) with its own heading, roll and pitch.
    model(m, o) {
      const cy = Math.cos(o.yaw), sy = Math.sin(o.yaw), cr = Math.cos(o.roll), sr = Math.sin(o.roll), cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
      const P = m.v.map(([x, y, z]) => {
        const x1 = x * cr - y * sr, y1 = x * sr + y * cr, y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
        return this.cam(o.x + x1 * cy + z2 * sy, o.y + y2, o.z - x1 * sy + z2 * cy);
      });
      for (const [i, j] of m.e) this.line(P[i], P[j]);
      return P;
    },
    step(dt) {
      this.clock += dt;
      const sp = 24, vx = Math.sin(this.h) * sp * dt, vz = Math.cos(this.h) * sp * dt;
      this.px += vx; this.pz += vz;
      // Everything on the ground slides back past the plane.
      for (const s of [...this.sheds, ...this.foes, ...this.smoke]) { s.x -= vx; s.z -= vz; }
      // A blimp keeps its distance, idling along as the plane closes slowly; it's a big target at range.
      for (const f of this.foes) if (f.blimp && f.hp > 0) { f.x += vx * .85; f.z += vz * .85; }
      for (let i = 0; i < this.sheds.length; i++) {
        const s = this.sheds[i], [, , cz] = this.cam(s.x, 0, s.z);
        if (cz < -8 || Math.hypot(s.x, s.z) > 260) this.sheds[i] = this.shed(rand(190, 240));
      }
      // The enemy: planes weave in, levelling off at the player's height as they close; blimps drift.
      for (const f of this.foes) {
        if (f.hp > 0 && !f.blimp) {
          f.yaw += Math.sin(this.clock * 1.4 + f.ph) * .25 * dt;
          f.y = this.alt + f.dy * Math.min(1, Math.hypot(f.x, f.z) / f.d0);
          f.roll = Math.sin(this.clock * 1.4 + f.ph) * .4;
        }
        if (f.hp <= 0) {
          // Going down: rolling over, nose dropping, smoke pouring out.
          f.vy -= (f.blimp ? 2 : 9) * dt; f.y += f.vy * dt;
          f.roll += (f.blimp ? .1 : 2.2) * dt; f.pitch = Math.min(f.blimp ? .5 : 1.1, f.pitch + .5 * dt);
          f.smoking = (f.smoking ?? 0) - dt;
          if (f.smoking <= 0) { f.smoking = .07; this.smoke.push({ x: f.x, y: f.y + 1, z: f.z, age: 0 }); }
          if (f.y < 0) {
            f.gone = true;
            const [x, y, z] = this.cam(f.x, 0, f.z);
            if (z > 2) sparkBurst(this.sparks, this.cxs + x / z * this.F, this.cy - y / z * this.F, 18, 140, "255,179,71");
          }
        }
        f.x += Math.sin(f.yaw) * f.sp * dt; f.z += Math.cos(f.yaw) * f.sp * dt;
        const [, , cz] = this.cam(f.x, f.y, f.z);
        if (cz < -10 || Math.hypot(f.x, f.z) > 320) f.gone = true;
      }
      this.foes = this.foes.filter(f => !f.gone);
      this.spawn -= dt;
      if (this.spawn <= 0 && this.foes.length < 3) {
        this.spawn = rand(2.5, 4.5);
        const blimp = !this.foes.some(f => f.blimp) && Math.random() < .25;
        this.foes.push(this.foe(blimp ? 170 : rand(190, 230), blimp ? rand(-.45, .45) : rand(-.35, .35), blimp));
      }
      // The pilot: bank and turn onto the nearest live enemy ahead, firing when it's in the sight.
      const live = this.foes.filter(f => f.hp > 0 && this.cam(f.x, f.y, f.z)[2] > 12).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
      const target = live[0];
      let turn = Math.sin(this.clock * .23) * .12;
      if (target) turn = Math.max(-.32, Math.min(.32, angleTo(this.h, Math.atan2(target.x, target.z)) * 1.6));
      this.h += turn * dt;
      this.bank += (turn * .9 - this.bank) * Math.min(1, dt * 2);
      this.fire -= dt;
      if (target && this.fire <= 0 && Math.hypot(target.x, target.z) < 150 && Math.abs(angleTo(this.h, Math.atan2(target.x, target.z))) < .04) {
        this.fire = .11;
        const s = Math.sin(this.h), c = Math.cos(this.h);
        for (const side of [-.7, .7]) {
          // From each gun to the point ahead where the two streams cross.
          const gx = side * c + 2 * s, gz = -side * s + 2 * c, tx = 70 * s, tz = 70 * c, l = Math.hypot(tx - gx, tz - gz);
          this.tracers.push({ x: gx, y: this.alt - .8, z: gz, vx: (tx - gx) / l * 150, vy: .6 / l * 150, vz: (tz - gz) / l * 150, age: 0 });
        }
      }
      for (const tr of this.tracers) {
        tr.x += tr.vx * dt; tr.y += tr.vy * dt; tr.z += tr.vz * dt; tr.age += dt;
        const hit = this.foes.find(f => f.hp > 0 && Math.hypot(f.x - tr.x, f.y - tr.y, f.z - tr.z) < (f.blimp ? 7 : 4.5));
        if (hit) {
          tr.age = 9; hit.hp--;
          const [x, y, z] = this.cam(tr.x, tr.y, tr.z);
          if (z > 1) sparkBurst(this.sparks, this.cxs + x / z * this.F, this.cy - y / z * this.F, hit.hp > 0 ? 3 : 14, 90, "255,255,255");
        }
      }
      this.tracers = this.tracers.filter(tr => tr.age < 1.2);
      for (const p of this.smoke) p.age += dt;
      this.smoke = this.smoke.filter(p => p.age < 2.4);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      const b = this.bank, G = "#72ff8f";
      // The horizon, rolled with the bank, and the mountains beyond it turning with the heading.
      const hx0 = this.cxs, hy0 = this.cy, L = W + H;
      beam(G, 8); cx.lineWidth = 1.4;
      cx.beginPath(); cx.moveTo(hx0 - L * Math.cos(b), hy0 + L * Math.sin(b)); cx.lineTo(hx0 + L * Math.cos(b), hy0 - L * Math.sin(b)); cx.stroke();
      drawStars(t, .25);
      cx.beginPath();
      let pen = false;
      for (let i = 0; i <= 72; i++) {
        const a = (i % 72) * Math.PI * 2 / 72, rel = angleTo(this.h, a);
        if (Math.abs(rel) > 1.3) { pen = false; continue; }
        const D = 3000, [x, y, z] = this.cam(Math.sin(a) * D, this.alt + this.peaks[i % 72] * D * .0016, Math.cos(a) * D);
        const sx = this.cxs + x / z * this.F, sy = this.cy - y / z * this.F;
        pen ? cx.lineTo(sx, sy) : cx.moveTo(sx, sy); pen = true;
      }
      cx.stroke();
      // Fields: a grid on the ground, fixed to the land so it swings round in the turns.
      beam("rgba(30,60,110,.9)", 0); cx.lineWidth = 1;
      cx.beginPath();
      const g = 16, R = 160, ox = wrap(this.px, 0, g), oz = wrap(this.pz, 0, g);
      for (let k = -R; k <= R; k += g) {
        this.line(this.cam(k - ox, 0, -R), this.cam(k - ox, 0, R));
        this.line(this.cam(-R, 0, k - oz), this.cam(R, 0, k - oz));
      }
      cx.stroke();
      // Buildings.
      beam("#5ce1ff", 8); cx.lineWidth = 1.3;
      cx.beginPath();
      for (const s of this.sheds) {
        const w = s.w / 2, d = s.d / 2, ht = s.ht, v = [[-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d], [-w, ht, -d], [w, ht, -d], [w, ht, d], [-w, ht, d]];
        const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
        if (s.roof) { v.push([0, ht + w, -d], [0, ht + w, d]); e.push([4, 8], [5, 8], [7, 9], [6, 9], [8, 9]); }
        this.model({ v, e }, { x: s.x, y: 0, z: s.z, yaw: s.yaw, roll: 0, pitch: 0 });
      }
      cx.stroke();
      // Smoke from the ones going down.
      cx.lineWidth = 1.2; cx.shadowBlur = 0;
      for (const p of this.smoke) {
        const [x, y, z] = this.cam(p.x, p.y + p.age * 1.5, p.z);
        if (z < 1) continue;
        cx.strokeStyle = `rgba(213,227,238,${.5 * (1 - p.age / 2.4)})`;
        cx.beginPath(); cx.arc(this.cxs + x / z * this.F, this.cy - y / z * this.F, Math.min(40, (1 + p.age * 2) / z * this.F), 0, Math.PI * 2); cx.stroke();
      }
      // The enemy, propellers turning.
      for (const f of this.foes) {
        beam(f.hp > 0 ? "#ffffff" : "#ff4a4a", 10); cx.lineWidth = 1.5;
        cx.beginPath();
        if (f.blimp) this.model(this.blimp, f);
        else {
          const pa = t * 30;
          this.model({ v: [...this.PLANE.v, [Math.cos(pa) * 1.3, .35 + Math.sin(pa) * 1.3, 1.8], [-Math.cos(pa) * 1.3, .35 - Math.sin(pa) * 1.3, 1.8]],
                       e: [...this.PLANE.e, [23, 24]] }, f);
        }
        cx.stroke();
      }
      // Tracers.
      beam("#ffb347", 10); cx.lineWidth = 2;
      cx.beginPath();
      for (const tr of this.tracers) this.line(this.cam(tr.x, tr.y, tr.z), this.cam(tr.x - tr.vx * .025, tr.y - tr.vy * .025, tr.z - tr.vz * .025));
      cx.stroke();
      drawSparks(this.sparks, still ? 0 : dt);
      // The cockpit, which doesn't roll: cowling, the twin guns, a ring sight, and the struts out to the wings.
      const hw = this.w / 2, x = this.cxs, gx = hw * .16, top = H * .72;
      beam("#ffb347", 8); cx.lineWidth = 1.8;
      cx.beginPath();
      cx.moveTo(x - hw * .62, H); cx.quadraticCurveTo(x, H * .78, x + hw * .62, H);
      for (const s of [-1, 1]) {
        // A gun: a cooling jacket narrowing towards the muzzle, which points at the sight.
        const bx = x + s * gx, mx = x + s * gx * .45, n = 7;
        cx.moveTo(bx - 9, H); cx.lineTo(mx - 4, top); cx.lineTo(mx + 4, top); cx.lineTo(bx + 9, H);
        for (let k = 1; k < n; k++) { const q = k / n, yy = H + (top - H) * q, half = 9 + (4 - 9) * q, cx0 = bx + (mx - bx) * q; cx.moveTo(cx0 - half, yy); cx.lineTo(cx0 + half, yy); }
      }
      cx.moveTo(x + 14, this.cy); cx.arc(x, this.cy, 14, 0, Math.PI * 2);
      cx.moveTo(x - 4, this.cy); cx.lineTo(x + 4, this.cy); cx.moveTo(x, this.cy - 4); cx.lineTo(x, this.cy + 4);
      cx.stroke();
      // Out at the sides, the lower wings' leading edges and the struts, fading as they go up to the top wing.
      const fade = cx.createLinearGradient(0, H, 0, H * .35);
      fade.addColorStop(0, "rgba(255,179,71,.75)"); fade.addColorStop(1, "rgba(255,179,71,0)");
      beam("#ffb347", 6); cx.strokeStyle = fade; cx.lineWidth = 1.5;
      cx.beginPath();
      for (const s of [-1, 1]) {
        cx.moveTo(x + s * hw * .55, H * .97); cx.lineTo(x + s * hw * 1.02, H * .9);
        cx.moveTo(x + s * hw * .84, H * .925); cx.lineTo(x + s * hw * .78, H * .3);
        cx.moveTo(x + s * hw * .97, H * .905); cx.lineTo(x + s * hw * .93, H * .3);
        cx.moveTo(x + s * hw * .84, H * .925); cx.lineTo(x + s * hw * .92, H * .45);
      }
      cx.stroke();
    },
  };

  // ----- Omega Race: a ship racing round the centre box, picking off the droids -----
  // The droids circle the box in formation; now and then one breaks away as a command ship, seeding photon
  // mines as it goes, and a command ship left alone too long turns into a death ship that hunts the player.
  // The ship keeps moving round the track, bouncing off the walls (each length lights up as it is struck), and
  // turns to fire whenever it has a clear line on something. With the field clear, a new wave comes in.
  const omegarace = {
    name: "OMEGA RACE",
    layout() {
      const a = arena(16);
      Object.assign(this, { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, mx: a.x0 + a.w / 2, my: a.y0 + a.h / 2, bw: a.w * .18, bh: a.h * .17 });
      // The track the droids follow: halfway between the box and the walls.
      this.pw = (this.bw + a.w / 2) / 2; this.ph = (this.bh + a.h / 2) / 2;
      this.gap = Math.max(26, Math.min(40, a.w * .03));
      // The outer walls, in short lengths that light up one at a time.
      this.walls = [];
      const side = (ax, ay, bx, by) => {
        const n = Math.max(3, Math.round(Math.hypot(bx - ax, by - ay) / 70));
        for (let i = 0; i < n; i++)
          this.walls.push({ ax: ax + (bx - ax) * i / n, ay: ay + (by - ay) * i / n, bx: ax + (bx - ax) * (i + 1) / n, by: ay + (by - ay) * (i + 1) / n, lit: 0 });
      };
      side(a.x0, a.y0, a.x1, a.y0); side(a.x1, a.y0, a.x1, a.y1); side(a.x1, a.y1, a.x0, a.y1); side(a.x0, a.y1, a.x0, a.y0);
      this.reset();
      if (still) { this.convert = 0; this.step(.01); this.mines.push({ x: this.mx - this.pw * .4, y: this.my - this.ph * .9 }, { x: this.mx - this.pw * .9, y: this.my - this.ph * .3 }); }
    },
    reset() {
      const [x, y] = this.track(2 * this.pw + 2 * this.ph + this.pw * .6);
      this.ship = { x, y, vx: 80, vy: 0, a: 0, alive: true, wait: 0, invul: 1, fire: 0, thrust: false, fly: true };
      this.sparks = this.sparks ?? []; this.score = 0; this.lives = 3; this.boxLit = 0;
      this.wave();
    },
    wave() {
      this.fs = this.pw; this.next = 0; this.convert = 2; this.shots = []; this.mines = [];
      this.foes = Array.from({ length: W < 700 ? 5 : 7 }, (_, slot) => ({ kind: "droid", slot, x: 0, y: 0, vx: 0, vy: 0, h: 0, spin: rand(0, 6), age: 0, lay: 0 }));
      for (const e of this.foes) [e.x, e.y] = this.track(this.fs - e.slot * this.gap);
    },
    start() { if (!this.foes) this.layout(); },
    // A point on the track, a distance s round it: anticlockwise from the top right corner.
    track(s) {
      const { pw, ph } = this;
      s = wrap(s, 0, 4 * (pw + ph));
      if (s < 2 * pw) return [this.mx + pw - s, this.my - ph];
      s -= 2 * pw; if (s < 2 * ph) return [this.mx - pw, this.my - ph + s];
      s -= 2 * ph; if (s < 2 * pw) return [this.mx - pw + s, this.my + ph];
      s -= 2 * pw; return [this.mx + pw, this.my + ph - s];
    },
    inBox(x, y, pad = 0) { return Math.abs(x - this.mx) < this.bw + pad && Math.abs(y - this.my) < this.bh + pad; },
    clear(ax, ay, bx, by) {
      for (let i = 1; i < 12; i++) if (this.inBox(ax + (bx - ax) * i / 12, ay + (by - ay) * i / 12, 2)) return false;
      return true;
    },
    // Off the walls and the box; returns where it struck an outer wall, if it did.
    bounce(o, r) {
      let hit = null;
      if (o.x < this.x0 + r) { o.x = this.x0 + r; o.vx = Math.abs(o.vx); hit = [this.x0, o.y]; }
      if (o.x > this.x1 - r) { o.x = this.x1 - r; o.vx = -Math.abs(o.vx); hit = [this.x1, o.y]; }
      if (o.y < this.y0 + r) { o.y = this.y0 + r; o.vy = Math.abs(o.vy); hit = [o.x, this.y0]; }
      if (o.y > this.y1 - r) { o.y = this.y1 - r; o.vy = -Math.abs(o.vy); hit = [o.x, this.y1]; }
      const dx = o.x - this.mx, dy = o.y - this.my, ox = this.bw + r - Math.abs(dx), oy = this.bh + r - Math.abs(dy);
      if (ox > 0 && oy > 0) {
        if (ox < oy) { o.x += Math.sign(dx) * ox; o.vx = Math.sign(dx) * Math.abs(o.vx); }
        else { o.y += Math.sign(dy) * oy; o.vy = Math.sign(dy) * Math.abs(o.vy); }
        o.boxed = true;
      }
      return hit;
    },
    step(dt) {
      const s = this.ship;
      for (const w of this.walls) w.lit = Math.max(0, w.lit - dt * 2);
      this.boxLit = Math.max(0, this.boxLit - dt * 3);
      if (this.next > 0) { this.next -= dt; if (this.next <= 0) this.wave(); }
      // The formation creeps round the box; the others fly free.
      this.fs += 42 * dt;
      for (const e of this.foes) {
        e.spin += dt * (e.kind === "death" ? 7 : 1.6);
        if (e.kind === "droid") {
          const [x, y] = this.track(this.fs - e.slot * this.gap);
          if (dt > 0) { e.vx = (x - e.x) / dt; e.vy = (y - e.y) / dt; }
          e.x = x; e.y = y;
          continue;
        }
        e.age += dt;
        let sp = 80;
        if (e.kind === "command") {
          e.h += rand(-2.5, 2.5) * dt;
          if ((e.lay -= dt) <= 0) { e.lay = 1.3; if (this.mines.length < 10) this.mines.push({ x: e.x, y: e.y }); }
          if (e.age > 7) e.kind = "death";
        } else {
          sp = 120;
          if (s.alive) e.h += Math.max(-1.8 * dt, Math.min(1.8 * dt, angleTo(e.h, Math.atan2(s.y - e.y, s.x - e.x))));
          else e.h += rand(-2, 2) * dt;
        }
        e.vx = Math.cos(e.h) * sp; e.vy = Math.sin(e.h) * sp;
        e.x += e.vx * dt; e.y += e.vy * dt;
        e.boxed = false;
        if (this.bounce(e, 10) || e.boxed) e.h = Math.atan2(e.vy, e.vx) + rand(-.3, .3);
      }
      // Every so often a droid breaks away as a command ship, if there isn't one out already.
      if ((this.convert -= dt) <= 0) {
        this.convert = 4.5;
        const droids = this.foes.filter(e => e.kind === "droid");
        if (droids.length && !this.foes.some(e => e.kind !== "droid")) {
          const d = droids[Math.floor(rand(0, droids.length))];
          Object.assign(d, { kind: "command", age: 0, lay: .6, h: Math.atan2(d.vy, d.vx) + rand(-.8, .8) });
        }
      }
      if (!s.alive) {
        if ((s.wait -= dt) <= 0) this.respawn();
      } else this.fly(dt);
      // Shots: gone at a wall or the box, or on whatever they hit.
      for (const z of this.shots) {
        z.x += z.vx * dt; z.y += z.vy * dt; z.age += dt;
        if (z.x < this.x0 || z.x > this.x1 || z.y < this.y0 || z.y > this.y1 || this.inBox(z.x, z.y) || z.age > 1.4) { z.dead = true; continue; }
        const e = this.foes.find(e => Math.hypot(e.x - z.x, e.y - z.y) < 12);
        if (e) {
          z.dead = e.dead = true;
          this.score += e.kind === "death" ? 2500 : e.kind === "command" ? 1500 : 1000;
          sparkBurst(this.sparks, e.x, e.y, 16, 110, e.kind === "droid" ? "255,179,71" : e.kind === "command" ? "111,140,255" : "255,90,90");
          continue;
        }
        const m = this.mines.find(m => Math.hypot(m.x - z.x, m.y - z.y) < 8);
        if (m) { z.dead = m.dead = true; this.score += 350; sparkBurst(this.sparks, m.x, m.y, 8, 70, "255,79,216"); }
      }
      this.shots = this.shots.filter(z => !z.dead);
      this.foes = this.foes.filter(e => !e.dead);
      this.mines = this.mines.filter(m => !m.dead);
      if (!this.foes.length && this.next <= 0) this.next = 2;
    },
    // The ship: round the track when it needs speed, otherwise turning to shoot at whatever it can see.
    fly(dt) {
      const s = this.ship;
      s.invul = Math.max(0, s.invul - dt);
      const nx = (s.x - this.mx) / this.pw, ny = (s.y - this.my) / this.ph;
      let dir, off;
      if (Math.abs(ny) >= Math.abs(nx)) { dir = [ny < 0 ? -1 : 1, 0]; off = [0, this.my + Math.sign(ny || 1) * this.ph - s.y]; }
      else { dir = [0, nx < 0 ? 1 : -1]; off = [this.mx + Math.sign(nx) * this.pw - s.x, 0]; }
      const along = s.vx * dir[0] + s.vy * dir[1], speed = Math.hypot(s.vx, s.vy);
      if (s.fly && speed > 150 && along > 100) s.fly = false;
      if (!s.fly && along < 40) s.fly = true;
      // The nearest thing it has a clear line on, death ships first.
      let target = null, best = this.pw * 1.7;
      for (const e of [...this.foes, ...this.mines]) {
        const d = Math.hypot(e.x - s.x, e.y - s.y) * (e.kind === "death" ? .5 : e.kind ? 1 : 1.4);
        if (d < best && this.clear(s.x, s.y, e.x, e.y)) { best = d; target = e; }
      }
      let aim = null;
      if (target) {
        const lead = Math.hypot(target.x - s.x, target.y - s.y) / 420;
        aim = Math.atan2(target.y + (target.vy ?? 0) * lead - s.y, target.x + (target.vx ?? 0) * lead - s.x);
      }
      const want = s.fly ? Math.atan2(dir[1] * 170 + off[1] * 1.5 - s.vy, dir[0] * 170 + off[0] * 1.5 - s.vx)
        : aim ?? Math.atan2(dir[1], dir[0]);
      const err = angleTo(s.a, want);
      s.a += Math.max(-5 * dt, Math.min(5 * dt, err));
      s.thrust = s.fly && Math.abs(err) < .5;
      if (s.thrust) { s.vx += Math.cos(s.a) * 320 * dt; s.vy += Math.sin(s.a) * 320 * dt; }
      s.vx *= 1 - .25 * dt; s.vy *= 1 - .25 * dt;
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > 260) { s.vx *= 260 / sp; s.vy *= 260 / sp; }
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.boxed = false;
      const hit = this.bounce(s, 9);
      if (hit) {
        let w = null, bd = Infinity;
        for (const seg of this.walls) { const d = Math.hypot((seg.ax + seg.bx) / 2 - hit[0], (seg.ay + seg.by) / 2 - hit[1]); if (d < bd) { bd = d; w = seg; } }
        if (w) w.lit = 1;
      }
      if (s.boxed) this.boxLit = 1;
      s.fire -= dt;
      if (aim !== null && Math.abs(angleTo(s.a, aim)) < .12 && s.fire <= 0 && this.shots.length < 4) {
        s.fire = .22;
        this.shots.push({ x: s.x + Math.cos(s.a) * 13, y: s.y + Math.sin(s.a) * 13, vx: Math.cos(s.a) * 420 + s.vx * .3, vy: Math.sin(s.a) * 420 + s.vy * .3, age: 0 });
      }
      if (s.invul > 0) return;
      const foe = this.foes.find(e => Math.hypot(e.x - s.x, e.y - s.y) < 14);
      const mine = this.mines.find(m => Math.hypot(m.x - s.x, m.y - s.y) < 9);
      if (foe || mine) {
        if (mine) mine.dead = true;
        s.alive = false; s.wait = 2;
        sparkBurst(this.sparks, s.x, s.y, 22, 130, "255,255,255");
        if (--this.lives <= 0) { this.lives = 3; this.score = 0; }
      }
    },
    // Back in, wherever on the track is furthest from trouble.
    respawn() {
      const P = 4 * (this.pw + this.ph), danger = [...this.foes, ...this.mines];
      let best = null, room = -1;
      for (let i = 0; i < 12; i++) {
        const [x, y] = this.track(i / 12 * P), d = Math.min(1e9, ...danger.map(e => Math.hypot(e.x - x, e.y - y)));
        if (d > room) { room = d; best = i / 12 * P; }
      }
      const [x, y] = this.track(best), [x2, y2] = this.track(best + 1), a = Math.atan2(y2 - y, x2 - x);
      Object.assign(this.ship, { x, y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, a, alive: true, invul: 2, fly: true });
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, 1);
      // The walls: dotted, each length flaring solid when the ship bounces off it.
      cx.lineWidth = 1.8;
      cx.setLineDash([3, 7]); beam("rgba(92,225,255,.7)", 6);
      cx.beginPath();
      for (const w of this.walls) if (w.lit <= 0) { cx.moveTo(w.ax, w.ay); cx.lineTo(w.bx, w.by); }
      cx.stroke();
      cx.setLineDash([]);
      for (const w of this.walls) {
        if (w.lit <= 0) continue;
        beam(`rgba(225,250,255,${.35 + .65 * w.lit})`, 14); cx.lineWidth = 2.4;
        cx.beginPath(); cx.moveTo(w.ax, w.ay); cx.lineTo(w.bx, w.by); cx.stroke();
      }
      // The centre box, with the score and the ships left.
      beam(this.boxLit > 0 ? "#e8fbff" : "#5ce1ff", 8 + this.boxLit * 8); cx.lineWidth = 1.8;
      cx.strokeRect(this.mx - this.bw, this.my - this.bh, this.bw * 2, this.bh * 2);
      const fs = Math.round(Math.max(14, Math.min(34, this.bh * .42)));
      cx.font = `${fs}px VT323, monospace`; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillStyle = "#ffb347"; cx.shadowColor = "#ffb347"; cx.shadowBlur = 6;
      cx.fillText(String(this.score).padStart(6, "0"), this.mx, this.my - this.bh * .35);
      cx.textBaseline = "alphabetic";
      beam("#ffffff", 8); cx.lineWidth = 1.4;
      for (let i = 0; i < this.lives; i++) this.shipShape(this.mx + (i - (this.lives - 1) / 2) * 24, this.my + this.bh * .35, -Math.PI / 2, .7);
      // Photon mines: little diamonds left where the command ships passed.
      beam("#ff4fd8", 8); cx.lineWidth = 1.4;
      cx.beginPath();
      for (const m of this.mines) { cx.moveTo(m.x, m.y - 4); cx.lineTo(m.x + 4, m.y); cx.lineTo(m.x, m.y + 4); cx.lineTo(m.x - 4, m.y); cx.closePath(); }
      cx.stroke();
      for (const e of this.foes) {
        const c = Math.cos(e.spin), n = Math.sin(e.spin), P = (u, v) => [e.x + c * u - n * v, e.y + n * u + c * v];
        cx.beginPath();
        if (e.kind === "droid") {
          // A droid: a box with a cross through it, turning slowly.
          beam("#ffb347", 10); cx.lineWidth = 1.6;
          cx.moveTo(...P(-8, 0)); cx.lineTo(...P(0, -8)); cx.lineTo(...P(8, 0)); cx.lineTo(...P(0, 8)); cx.closePath();
          cx.moveTo(...P(-4, -4)); cx.lineTo(...P(4, 4)); cx.moveTo(...P(4, -4)); cx.lineTo(...P(-4, 4));
        } else if (e.kind === "command") {
          // A command ship: two squares, one inside the other, turning against each other.
          beam("#6f8cff", 12); cx.lineWidth = 1.8;
          cx.moveTo(...P(-9, -9)); cx.lineTo(...P(9, -9)); cx.lineTo(...P(9, 9)); cx.lineTo(...P(-9, 9)); cx.closePath();
          const c2 = Math.cos(-e.spin * 2), n2 = Math.sin(-e.spin * 2), Q = (u, v) => [e.x + c2 * u - n2 * v, e.y + n2 * u + c2 * v];
          cx.moveTo(...Q(-4, -4)); cx.lineTo(...Q(4, -4)); cx.lineTo(...Q(4, 4)); cx.lineTo(...Q(-4, 4)); cx.closePath();
        } else {
          // A death ship: a spinning six-pointed star.
          beam("#ff5a5a", 12); cx.lineWidth = 1.8;
          for (const off of [0, Math.PI]) for (let k = 0; k <= 3; k++) {
            const ang = off + k * Math.PI * 2 / 3;
            k ? cx.lineTo(...P(Math.cos(ang) * 11, Math.sin(ang) * 11)) : cx.moveTo(...P(Math.cos(ang) * 11, Math.sin(ang) * 11));
          }
        }
        cx.stroke();
      }
      beam("#ffffff", 8); cx.fillStyle = "#ffffff";
      for (const z of this.shots) cx.fillRect(z.x - 1.5, z.y - 1.5, 3, 3);
      const s = this.ship;
      if (s.alive && (s.invul <= 0 || Math.sin(t * 25) > 0)) {
        beam("#ffffff", 12); cx.lineWidth = 1.7;
        this.shipShape(s.x, s.y, s.a, 1);
        if (s.thrust && Math.sin(t * 50) > -.2) {
          const c = Math.cos(s.a), n = Math.sin(s.a);
          beam("#5ce1ff", 12);
          cx.beginPath(); cx.moveTo(s.x - c * 6 + n * 3, s.y - n * 6 - c * 3); cx.lineTo(s.x - c * (13 + Math.random() * 6), s.y - n * (13 + Math.random() * 6));
          cx.lineTo(s.x - c * 6 - n * 3, s.y - n * 6 + c * 3); cx.stroke();
        }
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
    // The ship: an arrowhead with swept-back wings and a notch at the tail.
    shipShape(x, y, a, k) {
      const c = Math.cos(a) * k, n = Math.sin(a) * k, P = (u, v) => [x + c * u - n * v, y + n * u + c * v];
      cx.beginPath();
      cx.moveTo(...P(13, 0)); cx.lineTo(...P(-3, -5)); cx.lineTo(...P(-9, -10)); cx.lineTo(...P(-6, -3)); cx.lineTo(...P(-8, 0));
      cx.lineTo(...P(-6, 3)); cx.lineTo(...P(-9, 10)); cx.lineTo(...P(-3, 5)); cx.closePath();
      cx.stroke();
    },
  };

  // ----- Black Widow: a spider defending its web from the bugs crawling in -----
  // Bugs fly in to the rim of the web and crawl along its strands: mosquitoes make for the middle, beetles and
  // hornets for the spider. The spider walks the web by the way that keeps clear of them, shooting at the
  // nearest whichever way it happens to be going, and goes after the grubsteaks the dead ones leave behind.
  // Now and then the Bug Slayer cuts straight across the web, eating any bug in its path.
  const blackwidow = {
    name: "BLACK WIDOW",
    layout() {
      const a = arena(16), N = 12, K = 5;
      this.R = Math.min(a.w, a.h) * .47; this.wx = a.x0 + a.w / 2; this.wy = a.y0 + a.h / 2;
      this.N = N; this.K = K;
      // The web: a node in the middle, then N spokes crossing K rings, a little uneven, as webs are.
      this.nodes = [[this.wx, this.wy]];
      for (let i = 0; i < N; i++) {
        const ang = (i / N) * Math.PI * 2 - Math.PI / 2 + rand(-.05, .05);
        for (let k = 1; k <= K; k++) {
          const r = this.R * k / K * (k === K ? 1 : rand(.93, 1.05));
          this.nodes.push([this.wx + Math.cos(ang) * r, this.wy + Math.sin(ang) * r]);
        }
      }
      const id = (i, k) => k ? 1 + wrap(i, 0, N) * K + k - 1 : 0;
      this.id = id;
      this.adj = this.nodes.map(() => []);
      const link = (p, q) => { this.adj[p].push(q); this.adj[q].push(p); };
      for (let i = 0; i < N; i++) for (let k = 1; k <= K; k++) { link(id(i, k - 1), id(i, k)); link(id(i, k), id(i + 1, k)); }
      this.reset();
    },
    reset() {
      this.spider = { from: 0, to: this.id(0, 1), p: 0, x: this.wx, y: this.wy, face: -Math.PI / 2, gait: 0, fire: 0, alive: true, wait: 0, invul: 1, goal: -1 };
      this.bugs = []; this.shots = []; this.grubs = []; this.sparks = this.sparks ?? []; this.slayer = null;
      this.spawn = 0; this.slayerWait = rand(8, 14);
      // A few already on the web, so there's something to see from the start.
      for (let i = 0; i < 3; i++) { const b = this.newBug(); b.on = true; b.from = this.id(i * 4 + 1, this.K); b.to = this.id(i * 4 + 1, this.K - 1); b.p = .3; this.place(b); this.bugs.push(b); }
    },
    start() { if (!this.nodes) this.layout(); },
    newBug() {
      const kind = ["mosquito", "mosquito", "beetle", "hornet"][Math.floor(rand(0, 4))], i = Math.floor(rand(0, this.N));
      const [nx, ny] = this.nodes[this.id(i, this.K)], ang = Math.atan2(ny - this.wy, nx - this.wx) + rand(-.6, .6);
      return { kind, on: false, t: 0, fx: this.wx + Math.cos(ang) * this.R * 1.5, fy: this.wy + Math.sin(ang) * this.R * 1.5, from: this.id(i, this.K), to: this.id(i, this.K), prev: -1, p: 0,
               x: 0, y: 0, vx: 0, vy: 0, face: 0, speed: this.R * (kind === "hornet" ? .38 : kind === "beetle" ? .17 : .26) };
    },
    place(e) {
      const [ax, ay] = this.nodes[e.from], [bx, by] = this.nodes[e.to];
      e.x = ax + (bx - ax) * e.p; e.y = ay + (by - ay) * e.p;
      if (e.from !== e.to) e.face = Math.atan2(by - ay, bx - ax);
    },
    // Moves something along its strand; returns true when it reaches the far node.
    walk(e, dt) {
      const [ax, ay] = this.nodes[e.from], [bx, by] = this.nodes[e.to], len = Math.max(1, Math.hypot(bx - ax, by - ay));
      e.p += e.speed * dt / len;
      const done = e.p >= 1;
      if (done) e.p = 1;
      this.place(e);
      e.vx = (bx - ax) / len * e.speed; e.vy = (by - ay) / len * e.speed;
      return done;
    },
    // The first step from a node toward the nearest target, avoiding the nodes it is told to.
    route(start, isTarget, avoid) {
      const seen = new Map([[start, -1]]), queue = [start];
      while (queue.length) {
        const n = queue.shift();
        if (n !== start && isTarget(n)) {
          let k = n;
          while (seen.get(k) !== start) k = seen.get(k);
          return k;
        }
        for (const m of this.adj[n]) if (!seen.has(m) && !avoid(m)) { seen.set(m, n); queue.push(m); }
      }
      return -1;
    },
    step(dt) {
      const sp = this.spider, R = this.R, nodes = this.nodes;
      // Bugs: fly in to the rim, then crawl strand to strand.
      if ((this.spawn -= dt) <= 0) { this.spawn = rand(1, 2.2); if (this.bugs.length < 7) this.bugs.push(this.newBug()); }
      for (const b of this.bugs) {
        b.t += dt;
        if (!b.on) {
          const [nx, ny] = nodes[b.from], q = Math.min(1, b.t / 1.3);
          b.x = b.fx + (nx - b.fx) * q; b.y = b.fy + (ny - b.fy) * q; b.face = Math.atan2(ny - b.fy, nx - b.fx);
          b.vx = (nx - b.fx) / 1.3; b.vy = (ny - b.fy) / 1.3;
          if (q >= 1) { b.on = true; b.p = 1; }
          continue;
        }
        if (!this.walk(b, dt)) continue;
        // At a node: the way that brings it nearest its goal, more or less, and not straight back.
        const [gx, gy] = b.kind === "mosquito" || !sp.alive ? [this.wx, this.wy] : [sp.x, sp.y];
        let best = -1, bd = Infinity;
        for (const m of this.adj[b.to]) {
          if (m === b.from && this.adj[b.to].length > 1) continue;
          const d = Math.hypot(nodes[m][0] - gx, nodes[m][1] - gy) + rand(0, R * .35);
          if (d < bd) { bd = d; best = m; }
        }
        b.from = b.to; b.to = best; b.p = 0;
      }
      // The Bug Slayer: straight across, now and then.
      if (!this.slayer && (this.slayerWait -= dt) <= 0) {
        const ang = rand(0, Math.PI * 2), off = rand(-.4, .4) * R;
        this.slayer = { x: this.wx + Math.cos(ang) * R * 1.4 - Math.sin(ang) * off, y: this.wy + Math.sin(ang) * R * 1.4 + Math.cos(ang) * off,
                        vx: -Math.cos(ang) * R * .32, vy: -Math.sin(ang) * R * .32, spin: 0 };
      }
      const sl = this.slayer;
      if (sl) {
        sl.x += sl.vx * dt; sl.y += sl.vy * dt; sl.spin += dt * 4;
        for (const b of this.bugs) if (Math.hypot(b.x - sl.x, b.y - sl.y) < 16) { b.dead = true; sparkBurst(this.sparks, b.x, b.y, 8, 70, "255,90,90"); }
        if (Math.hypot(sl.x - this.wx, sl.y - this.wy) > R * 1.6 && sl.vx * (this.wx - sl.x) + sl.vy * (this.wy - sl.y) < 0) { this.slayer = null; this.slayerWait = rand(10, 16); }
      }
      // The spider.
      if (!sp.alive) {
        if ((sp.wait -= dt) <= 0) Object.assign(sp, { alive: true, from: 0, to: 0, p: 1, x: this.wx, y: this.wy, invul: 2 });
      } else {
        sp.invul = Math.max(0, sp.invul - dt);
        sp.speed = R * .4;
        sp.gait += dt * 12;
        if (sp.from === sp.to || this.walk(sp, dt)) {
          // At a node: after the nearest grubsteak, or off to wherever it's patrolling, keeping clear of bugs.
          const here = sp.to, near = n => this.bugs.some(b => b.on && Math.hypot(b.x - nodes[n][0], b.y - nodes[n][1]) < R * .2);
          if (sp.goal < 0 || sp.goal === here || Math.random() < .1) sp.goal = this.id(Math.floor(rand(0, this.N)), Math.floor(rand(1, 4)));
          const grub = new Set(this.grubs.flatMap(g => g.ends));
          let next = grub.size ? this.route(here, n => grub.has(n), near) : -1;
          if (next < 0) next = this.route(here, n => n === sp.goal, near);
          if (next < 0) {
            // Hemmed in: whichever way is furthest from the bugs.
            let room = -1;
            for (const m of this.adj[here]) {
              const d = Math.min(1e9, ...this.bugs.map(b => Math.hypot(b.x - nodes[m][0], b.y - nodes[m][1])));
              if (d > room) { room = d; next = m; }
            }
          }
          sp.from = here; sp.to = next; sp.p = 0;
          this.place(sp);
        }
        // Shoot at the nearest bug, any direction, leading it a little.
        sp.fire -= dt;
        let target = null, bd = R * .9;
        for (const b of this.bugs) { const d = Math.hypot(b.x - sp.x, b.y - sp.y); if (d < bd) { bd = d; target = b; } }
        if (sl && Math.hypot(sl.x - sp.x, sl.y - sp.y) < bd) target = sl;
        if (target && sp.fire <= 0 && this.shots.length < 6) {
          sp.fire = .2;
          const lead = bd / (R * 1.7), ang = Math.atan2(target.y + target.vy * lead - sp.y, target.x + target.vx * lead - sp.x);
          this.shots.push({ x: sp.x, y: sp.y, vx: Math.cos(ang) * R * 1.7, vy: Math.sin(ang) * R * 1.7, age: 0 });
        }
        // Picking up grubsteaks; caught by a bug.
        for (const g of this.grubs) if (Math.hypot(g.x - sp.x, g.y - sp.y) < R * .07) { g.dead = true; sparkBurst(this.sparks, g.x, g.y, 6, 50, "114,255,143"); }
        if (sp.invul <= 0 && this.bugs.some(b => b.on && Math.hypot(b.x - sp.x, b.y - sp.y) < R * .055)) {
          sp.alive = false; sp.wait = 1.6;
          sparkBurst(this.sparks, sp.x, sp.y, 22, 120, "255,255,255");
        }
      }
      // Shots, and what they hit.
      for (const z of this.shots) {
        z.x += z.vx * dt; z.y += z.vy * dt; z.age += dt;
        if (z.age > 1 || Math.hypot(z.x - this.wx, z.y - this.wy) > R * 1.2) { z.dead = true; continue; }
        const b = this.bugs.find(b => !b.dead && Math.hypot(b.x - z.x, b.y - z.y) < Math.max(10, R * .03));
        if (b) {
          z.dead = b.dead = true;
          sparkBurst(this.sparks, b.x, b.y, 12, 90, b.kind === "mosquito" ? "114,255,143" : b.kind === "beetle" ? "255,179,71" : "255,79,216");
          // A grubsteak where it fell, if it fell on the web.
          if (b.on && this.grubs.length < 8) this.grubs.push({ x: b.x, y: b.y, ends: [b.from, b.to], age: 0 });
        } else if (sl && Math.hypot(sl.x - z.x, sl.y - z.y) < 15) {
          z.dead = true; sparkBurst(this.sparks, sl.x, sl.y, 24, 130, "255,90,90"); this.slayer = null; this.slayerWait = rand(10, 16);
        }
      }
      for (const g of this.grubs) if ((g.age += dt) > 7) g.dead = true;
      this.shots = this.shots.filter(z => !z.dead);
      this.bugs = this.bugs.filter(b => !b.dead);
      this.grubs = this.grubs.filter(g => !g.dead);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, 1);
      const { nodes, N, K, id } = this;
      // The web: spokes, and the rings strung between them.
      beam("rgba(80,150,255,.8)", 8); cx.lineWidth = 1.3;
      cx.beginPath();
      for (let i = 0; i < N; i++) { cx.moveTo(...nodes[0]); for (let k = 1; k <= K; k++) cx.lineTo(...nodes[id(i, k)]); }
      for (let k = 1; k <= K; k++) { cx.moveTo(...nodes[id(0, k)]); for (let i = 1; i <= N; i++) cx.lineTo(...nodes[id(i, k)]); }
      cx.stroke();
      // Grubsteaks: dollar signs, blinking before they go.
      beam("#72ff8f", 10); cx.lineWidth = 1.6;
      const S = [[.5, -.6], [.2, -.75], [-.3, -.72], [-.55, -.4], [-.3, -.08], [.3, .08], [.55, .4], [.3, .72], [-.2, .75], [-.5, .6]];
      cx.beginPath();
      for (const g of this.grubs) {
        if (g.age > 5.5 && Math.sin(t * 20) < 0) continue;
        const k = 8 * Math.max(1, Math.min(1.5, this.R / 260));
        S.forEach(([u, v], i) => i ? cx.lineTo(g.x + u * k, g.y + v * k) : cx.moveTo(g.x + u * k, g.y + v * k));
        cx.moveTo(g.x, g.y - k * 1.05); cx.lineTo(g.x, g.y + k * 1.05);
      }
      cx.stroke();
      for (const b of this.bugs) this.drawBug(b, t);
      const sl = this.slayer;
      if (sl) {
        // The Bug Slayer: a spiked wheel with jaws out in front.
        beam("#ff5a5a", 12); cx.lineWidth = 1.8;
        const ang = Math.atan2(sl.vy, sl.vx);
        cx.beginPath(); cx.arc(sl.x, sl.y, 9, 0, Math.PI * 2);
        for (let k = 0; k < 8; k++) { const q = sl.spin + k * Math.PI / 4; cx.moveTo(sl.x + Math.cos(q) * 9, sl.y + Math.sin(q) * 9); cx.lineTo(sl.x + Math.cos(q + .3) * 15, sl.y + Math.sin(q + .3) * 15); }
        for (const side of [-1, 1]) {
          const q = ang + side * (.5 + .25 * Math.sin(t * 10));
          cx.moveTo(sl.x + Math.cos(ang + side * .4) * 9, sl.y + Math.sin(ang + side * .4) * 9);
          cx.quadraticCurveTo(sl.x + Math.cos(q) * 22, sl.y + Math.sin(q) * 22, sl.x + Math.cos(ang) * 20, sl.y + Math.sin(ang) * 20);
        }
        cx.stroke();
      }
      beam("#ffffff", 8); cx.fillStyle = "#ffffff";
      for (const z of this.shots) cx.fillRect(z.x - 1.5, z.y - 1.5, 3, 3);
      const sp = this.spider;
      if (sp.alive && (sp.invul <= 0 || Math.sin(t * 25) > 0)) this.drawSpider(sp);
      drawSparks(this.sparks, still ? 0 : dt);
    },
    drawSpider(sp) {
      const c = Math.cos(sp.face), n = Math.sin(sp.face), P = (u, v) => [sp.x + c * u - n * v, sp.y + n * u + c * v];
      const k = Math.max(.8, Math.min(1.3, this.R / 300));
      beam("#ffffff", 12); cx.lineWidth = 1.7;
      cx.beginPath();
      // Eight legs, four a side, stepping in turn.
      for (const side of [-1, 1]) for (let j = 0; j < 4; j++) {
        const swing = Math.sin(sp.gait + j * 1.6 + (side > 0 ? Math.PI : 0)) * 2.5, fwd = (1.5 - j) * 4 * k;
        cx.moveTo(...P(fwd * .3 + 2 * k, side * 3 * k));
        cx.lineTo(...P(fwd + swing + 2 * k, side * 9 * k));
        cx.lineTo(...P(fwd * 1.6 + swing * 1.5 + 2 * k, side * 14 * k));
      }
      cx.stroke();
      cx.beginPath(); cx.ellipse(...P(-5 * k, 0), 7 * k, 5.5 * k, sp.face, 0, Math.PI * 2); cx.stroke();
      cx.beginPath(); cx.ellipse(...P(4 * k, 0), 4 * k, 3.5 * k, sp.face, 0, Math.PI * 2); cx.stroke();
      // The red hourglass on its back.
      beam("#ff4a4a", 8); cx.lineWidth = 1.4;
      cx.beginPath();
      cx.moveTo(...P(-8 * k, -2.5 * k)); cx.lineTo(...P(-8 * k, 2.5 * k)); cx.lineTo(...P(-2 * k, -2.5 * k)); cx.lineTo(...P(-2 * k, 2.5 * k)); cx.closePath();
      cx.stroke();
    },
    drawBug(b, t) {
      const k = Math.max(1, Math.min(1.5, this.R / 260)), c = Math.cos(b.face) * k, n = Math.sin(b.face) * k;
      const P = (u, v) => [b.x + c * u - n * v, b.y + n * u + c * v], flap = Math.sin(t * 40 + b.fx) > 0 ? 1 : .6;
      cx.lineWidth = 1.6;
      cx.beginPath();
      if (b.kind === "mosquito") {
        // Thin body, long nose, a pair of wings beating.
        beam("#72ff8f", 10);
        cx.moveTo(...P(-7, 0)); cx.lineTo(...P(4, 0)); cx.lineTo(...P(11, 0));
        cx.moveTo(...P(-1, 0)); cx.lineTo(...P(-5, -7 * flap)); cx.lineTo(...P(1, -2));
        cx.moveTo(...P(-1, 0)); cx.lineTo(...P(-5, 7 * flap)); cx.lineTo(...P(1, 2));
      } else if (b.kind === "beetle") {
        // A round shell split down the back, six stubby legs.
        beam("#ffb347", 10);
        cx.ellipse(b.x, b.y, 8 * k, 6 * k, b.face, 0, Math.PI * 2);
        cx.moveTo(...P(-8, 0)); cx.lineTo(...P(4, 0));
        for (const side of [-1, 1]) for (const u of [-4, 0, 4]) { cx.moveTo(...P(u, side * 5)); cx.lineTo(...P(u + 2, side * 10)); }
      } else {
        // A hornet: a striped sting end, wings up.
        beam("#ff4fd8", 10);
        cx.ellipse(...P(-3, 0), 6 * k, 3.5 * k, b.face, 0, Math.PI * 2);
        cx.moveTo(...P(-5, -3)); cx.lineTo(...P(-5, 3)); cx.moveTo(...P(-1, -3.5)); cx.lineTo(...P(-1, 3.5));
        cx.moveTo(...P(-9, 0)); cx.lineTo(...P(-13, 0));
        const [hx, hy] = P(5, 0); cx.moveTo(hx + 2.5 * k, hy); cx.arc(hx, hy, 2.5 * k, 0, Math.PI * 2);
        cx.moveTo(...P(1, -2)); cx.lineTo(...P(-4, -9 * flap)); cx.moveTo(...P(1, 2)); cx.lineTo(...P(-4, 9 * flap));
      }
      cx.stroke();
    },
  };

  // ----- Major Havoc: a landing on the space fortress, then a run down through its maze to the reactor -----
  // First the little ship comes in low over the fortress, a wireframe deck seen in perspective, and settles on
  // its pad. Then the side view: Major Havoc runs out along the floors, dropping through the gap at the end of
  // each, hopping the bouncing robots, down to the reactor. Touching it starts the countdown, and he climbs
  // back up by the ledges under the gaps to the ship, which lifts off just before the whole place goes up.
  const majorhavoc = {
    name: "MAJOR HAVOC",
    layout() {
      const a = arena(16);
      this.a = a;
      this.mw = Math.min(a.w - 20, 900); this.mx0 = a.x0 + (a.w - this.mw) / 2; this.mx1 = this.mx0 + this.mw;
      const n = this.n = a.h > 560 ? 4 : 3;
      this.top = a.y0 + a.h * .22; this.h = (a.y1 - 8 - this.top) / (n - 1);
      this.hw = this.mw * .16; this.rh = Math.max(13, Math.min(30, this.h * .15, this.mw * .05));
      this.g = 9 * this.h; this.run = this.mw / 3.2;
      // Each floor has a gap at one end, alternating, with a ledge half way down under it; the bottom floor is whole.
      this.plats = [];
      for (let i = 0; i < n; i++) {
        const y = this.fy(i), s = this.side(i), hw = this.hw;
        if (i === n - 1) { this.plats.push({ x0: this.mx0, x1: this.mx1, y, floor: i }); continue; }
        this.plats.push(s > 0 ? { x0: this.mx0, x1: this.mx1 - hw, y, floor: i } : { x0: this.mx0 + hw, x1: this.mx1, y, floor: i });
        const e1 = this.X(s, hw * .5), e2 = this.X(s, hw - 6);
        this.plats.push({ x0: Math.min(e1, e2), x1: Math.max(e1, e2), y: y + this.h / 2, floor: i, step: true });
      }
      this.shipX = this.X(-1, this.hw * .6);
      this.reactorX = this.X(-this.side(n - 2), this.rh * 1.8);
      this.reset(still ? "maze" : "fly");
    },
    fy(i) { return this.top + i * this.h; },
    side(i) { return i % 2 ? -1 : 1; },
    // A distance in from the right-hand (s > 0) or left-hand end of the maze.
    X(s, d) { return s > 0 ? this.mx1 - d : this.mx0 + d; },
    reset(phase) {
      const { n, rh, hw } = this;
      this.phase = phase; this.pt = 0; this.count = 0; this.lift = 0; this.sparks = this.sparks ?? [];
      // The fortress deck: towers either side of the run in to the pad.
      this.towers = Array.from({ length: 16 }, (_, i) => {
        let x; do x = rand(-38, 38); while (Math.abs(x) < 10);
        return { x, z: rand(5, 150), w: rand(2, 5), d: rand(2, 5), h: rand(2, 12), colour: i % 3 ? "#5ce1ff" : "#ffb347" };
      });
      this.rex = { x: this.shipX, y: this.fy(0), vx: 0, vy: 0, plat: this.plats[0], mode: "in", alive: true, wait: 0, face: 1, gait: 0, gone: false };
      const lo = this.mx0 + hw + rh * 3.5, hi = this.mx1 - hw - rh * 3.5;
      this.robots = Array.from({ length: n - 1 }, (_, j) => ({ floor: j + 1, x: rand(lo, hi), dir: Math.random() < .5 ? -1 : 1, ph: rand(0, 6), lo, hi }));
      // Fishoids swim high in the gaps between floors, clear of the way down.
      this.fish = Array.from({ length: n - 1 }, (_, i) => {
        const s = this.side(i), flo = s > 0 ? this.mx0 + 30 : this.mx0 + hw + 40, fhi = s > 0 ? this.mx1 - hw - 40 : this.mx1 - 30;
        return { y: this.fy(i) + this.h * .28, x: rand(flo, fhi), dir: Math.random() < .5 ? -1 : 1, ph: rand(0, 6), lo: flo, hi: fhi };
      });
      // Oxoids: little rings of air along the floors, his for the running over.
      this.oxoids = this.plats.filter(p => !p.step).flatMap(p => Array.from({ length: 3 }, (_, k) => ({ x: p.x0 + (p.x1 - p.x0) * (k + rand(.3, .7)) / 3, y: p.y - rh * .35, floor: p.floor })));
      if (still) Object.assign(this.rex, { x: (this.mx0 + this.mx1) / 2, y: this.fy(1), plat: this.plats[2], face: -1 });
    },
    start() { if (!this.plats) this.layout(); },
    // A leap that lands on a point dy higher up (dy may be 0): up a little higher than that, then down onto it.
    jumpTo(tx, dy) {
      const r = this.rex, g = this.g, vy0 = Math.sqrt(2 * g * (dy + this.rh * .9));
      const T = (vy0 + Math.sqrt(Math.max(0, vy0 * vy0 - 2 * g * dy))) / g;
      r.vx = (tx - r.x) / T; r.vy = -vy0; r.plat = null;
      r.face = Math.sign(r.vx) || r.face;
    },
    step(dt) {
      this.pt += dt;
      if (this.phase === "fly") { if (this.pt > 5.6) { this.phase = "maze"; this.pt = 0; } return; }
      const { rh, run } = this;
      for (const b of this.robots) {
        b.x += b.dir * run * .42 * dt; b.ph += dt * 6;
        if (b.x < b.lo || b.x > b.hi) { b.x = Math.max(b.lo, Math.min(b.hi, b.x)); b.dir = -b.dir; }
      }
      for (const f of this.fish) {
        f.x += f.dir * run * .3 * dt; f.ph += dt * 3;
        if (f.x < f.lo || f.x > f.hi) { f.x = Math.max(f.lo, Math.min(f.hi, f.x)); f.dir = -f.dir; }
      }
      if (this.phase === "launch") {
        this.lift += dt * (40 + this.pt * 300);
        if (this.pt > 1.3) { this.phase = "boom"; this.pt = 0; }
        return;
      }
      if (this.phase === "boom") {
        // The reactor goes, and the maze with it.
        if (Math.floor(this.pt * 12) !== Math.floor((this.pt - dt) * 12))
          sparkBurst(this.sparks, rand(this.mx0, this.mx1), rand(this.fy(0), this.fy(this.n - 1)), 10, 140, Math.random() < .5 ? "255,179,71" : "255,255,255");
        if (this.pt > 2.2) this.reset("fly");
        return;
      }
      if (this.count > 0 && (this.count -= dt) <= 0) { this.die(); this.phase = "boom"; this.pt = 0; return; }
      const r = this.rex;
      if (!r.alive) { if ((r.wait -= dt) <= 0) this.reset("fly"); return; }
      if (r.plat) {
        // On his feet: where next.
        const p = r.plat, i = p.floor;
        let dir = 0;
        if (r.mode === "in") {
          if (i < this.n - 1) dir = this.side(i);
          else if (Math.abs(this.reactorX - r.x) < rh * .6) { r.mode = "out"; this.count = (this.n - 1) * 4.5 + 6; sparkBurst(this.sparks, this.reactorX, p.y - rh, 16, 120, "255,79,216"); }
          else dir = Math.sign(this.reactorX - r.x);
        } else if (p.step) {
          this.jumpTo(this.X(this.side(i), this.hw + rh * 1.5), this.h / 2);
        } else if (i === 0) {
          if (Math.abs(this.shipX - r.x) < 4) { r.gone = true; this.phase = "launch"; this.pt = 0; return; }
          dir = Math.sign(this.shipX - r.x);
        } else {
          const s = this.side(i - 1), tx = this.X(s, this.hw * .2);
          if (Math.abs(tx - r.x) < 4) { r.x = tx; this.jumpTo(this.X(s, this.hw * .75), this.h / 2); }
          else dir = Math.sign(tx - r.x);
        }
        if (r.plat) {
          let speed = run;
          // A robot ahead: hop it as it comes, or hang back while it's going the same way.
          // He takes off so as to be at the top of his hop as they pass.
          const reach = run * 1.42 * Math.sqrt(7 * rh / this.g);
          const bot = p.step ? null : this.robots.find(b => b.floor === i && Math.sign(b.x - r.x) === dir && Math.abs(b.x - r.x) < reach * 2 + rh);
          const gap = bot ? Math.abs(bot.x - r.x) : 0;
          if (bot && bot.dir === dir) speed = run * .3;
          else if (bot && gap > reach) speed = Math.min(run, (gap - reach) / .05 / 1.42 + run * .3);
          r.vx = dir * speed; r.face = dir || r.face;
          if (bot && bot.dir !== dir && gap <= reach) { r.vx = dir * run; r.vy = -Math.sqrt(2 * this.g * rh * 3.5); r.plat = null; }
        }
      }
      r.x += r.vx * dt;
      if (r.plat) {
        r.gait += dt * 14 * Math.abs(r.vx) / run;
        if (r.x < r.plat.x0 || r.x > r.plat.x1) r.plat = null; else r.y = r.plat.y;
      }
      if (!r.plat) {
        const oy = r.y;
        r.vy += this.g * dt; r.y += r.vy * dt;
        if (r.vy > 0) for (const p of this.plats) if (oy <= p.y && r.y >= p.y && r.x >= p.x0 && r.x <= p.x1) { r.y = p.y; r.vy = 0; r.plat = p; break; }
      }
      r.x = Math.max(this.mx0 + 5, Math.min(this.mx1 - 5, r.x));
      if (r.plat && !r.plat.step) for (const o of this.oxoids) if (!o.got && o.floor === r.plat.floor && Math.abs(o.x - r.x) < rh * .4) { o.got = true; sparkBurst(this.sparks, o.x, o.y, 5, 50, "92,225,255"); }
      // Caught by a robot or a fishoid.
      const hitBot = this.robots.some(b => {
        const by = this.fy(b.floor) - Math.abs(Math.sin(b.ph)) * rh * .6;
        return Math.abs(b.x - r.x) < rh * .5 && r.y > by - rh * .7 && r.y - rh < by;
      });
      const hitFish = this.fish.some(f => Math.hypot(f.x - r.x, f.y + Math.sin(f.ph) * 6 - (r.y - rh / 2)) < rh * .6);
      if (hitBot || hitFish) this.die();
    },
    die() {
      const r = this.rex;
      if (!r.alive || r.gone) return;
      r.alive = false; r.wait = 1.6;
      sparkBurst(this.sparks, r.x, r.y - this.rh / 2, 20, 120, "255,255,255");
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      if (this.phase === "fly") this.drawFly(t);
      else this.drawMaze(t);
      drawSparks(this.sparks, still ? 0 : dt);
    },
    // ----- The approach: low over the fortress deck to the landing pad -----
    drawFly(t) {
      const a = this.a, q = Math.min(1, this.pt / 4.6), e = 1 - (1 - q) ** 2;
      const sz = -30 + 140 * e, sy = 30 * (1 - q) ** 2 + .8;
      const camZ = sz - 24 - 8 * (1 - q), camY = sy + 6 + 8 * (1 - q), pitch = Math.atan2(camY - sy, sz - camZ) * .8;
      const cp = Math.cos(pitch), spn = Math.sin(pitch), F = Math.min(a.w, a.h) * 1.1, ox = a.x0 + a.w / 2, oy = a.y0 + a.h * .4;
      const cam = (x, y, z) => { const Y = y - camY, Z = z - camZ; return [x, Y * cp + Z * spn, Z * cp - Y * spn]; };
      const line = (p, q2) => {
        let [ax, ay, az] = cam(...p), [bx, by, bz] = cam(...q2);
        const near = .5;
        if (az < near && bz < near) return;
        if (az < near) { const k = (near - az) / (bz - az); ax += (bx - ax) * k; ay += (by - ay) * k; az = near; }
        if (bz < near) { const k = (near - bz) / (az - bz); bx += (ax - bx) * k; by += (ay - by) * k; bz = near; }
        cx.moveTo(ox + ax / az * F, oy - ay / az * F); cx.lineTo(ox + bx / bz * F, oy - by / bz * F);
      };
      drawStars(t, .45);
      cx.save();
      cx.beginPath(); cx.rect(a.x0, a.y0, a.w, a.h); cx.clip();
      // The deck: a grid, and its edge.
      beam("rgba(30,60,110,.9)", 0); cx.lineWidth = 1;
      cx.beginPath();
      for (let x = -40; x <= 40; x += 8) line([x, 0, 0], [x, 0, 160]);
      for (let z = 0; z <= 160; z += 10) line([-40, 0, z], [40, 0, z]);
      cx.stroke();
      beam("#5ce1ff", 10); cx.lineWidth = 1.6;
      cx.beginPath(); line([-40, 0, 0], [40, 0, 0]); line([40, 0, 0], [40, 0, 160]); line([40, 0, 160], [-40, 0, 160]); line([-40, 0, 160], [-40, 0, 0]);
      cx.stroke();
      // Towers and blocks standing on it, furthest first.
      for (const tw of [...this.towers].sort((p, q2) => q2.z - p.z)) {
        const { x, z, w, d, h } = tw, V = [[x - w, 0, z - d], [x + w, 0, z - d], [x + w, 0, z + d], [x - w, 0, z + d]].flatMap(([vx, , vz]) => [[vx, 0, vz], [vx, h, vz]]);
        beam(tw.colour, 8); cx.lineWidth = 1.4;
        cx.beginPath();
        for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; line(V[k * 2], V[k2 * 2]); line(V[k * 2 + 1], V[k2 * 2 + 1]); line(V[k * 2], V[k * 2 + 1]); }
        if (h > 9) line([x, h, z], [x, h + 4, z]);
        cx.stroke();
      }
      // The pad, flashing until the ship is down.
      beam(q < 1 && Math.sin(t * 12) < 0 ? "rgba(114,255,143,.35)" : "#72ff8f", 12); cx.lineWidth = 2;
      cx.beginPath();
      line([-5, 0, 105], [5, 0, 105]); line([5, 0, 105], [5, 0, 115]); line([5, 0, 115], [-5, 0, 115]); line([-5, 0, 115], [-5, 0, 105]);
      line([-2, 0, 107], [-2, 0, 113]); line([2, 0, 107], [2, 0, 113]); line([-2, 0, 110], [2, 0, 110]);
      cx.stroke();
      // The ship: a little wedge, nose down the deck.
      const sx = Math.sin(q * 5) * 4 * (1 - q);
      const S = [[sx, sy + .3, sz + 3.5], [sx - 3, sy, sz - 1.5], [sx + 3, sy, sz - 1.5], [sx, sy + 1.5, sz - .5], [sx, sy + .4, sz - 1.8]];
      beam("#ffffff", 12); cx.lineWidth = 1.8;
      cx.beginPath();
      for (const [i, j] of [[0, 1], [0, 2], [1, 4], [2, 4], [0, 3], [1, 3], [2, 3], [3, 4]]) line(S[i], S[j]);
      cx.stroke();
      if (q < 1 && Math.sin(t * 50) > -.3) {
        beam("#ff4fd8", 12); cx.beginPath(); line([sx, sy + .3, sz - 1.5], [sx, sy + .3, sz - 3 - Math.random() * 2]); cx.stroke();
      }
      cx.restore();
    },
    // ----- The maze, side on -----
    drawMaze(t) {
      const { mx0, mx1, rh, h, n } = this, boom = this.phase === "boom";
      const ceil = this.top - h * .55, bottom = this.fy(n - 1);
      const wall = boom && Math.sin(t * 40) > 0 ? "#ffffff" : "#5ce1ff";
      beam(wall, 10); cx.lineWidth = 2;
      cx.beginPath();
      cx.moveTo(mx0, bottom + 5); cx.lineTo(mx0, ceil); cx.lineTo(mx1, ceil); cx.lineTo(mx1, bottom + 5); cx.lineTo(mx0, bottom + 5);
      // Floors as thin slabs; ledges in amber.
      for (const p of this.plats) if (!p.step) { cx.moveTo(p.x0, p.y); cx.lineTo(p.x1, p.y); cx.lineTo(p.x1, p.y + 5); cx.lineTo(p.x0, p.y + 5); }
      cx.stroke();
      beam(boom && Math.sin(t * 40) > 0 ? "#ffffff" : "#ffb347", 10); cx.lineWidth = 2;
      cx.beginPath();
      for (const p of this.plats) if (p.step) { cx.moveTo(p.x0, p.y); cx.lineTo(p.x1, p.y); cx.lineTo(p.x1, p.y + 4); cx.lineTo(p.x0, p.y + 4); cx.closePath(); }
      cx.stroke();
      // The reactor: a spinning core in its housing, racing once it has been touched.
      const rx = this.reactorX, ry = bottom, live = this.count > 0;
      if (!boom) {
        const spin = t * (live ? 9 : 1.5), rr = rh * .8;
        beam(live && Math.sin(t * 16) > 0 ? "#ffffff" : "#ff4fd8", 12); cx.lineWidth = 1.8;
        cx.beginPath();
        cx.rect(rx - rh * 1.1, ry - rh * 2.4, rh * 2.2, rh * 2.4);
        cx.moveTo(rx + rr, ry - rh * 1.2); cx.arc(rx, ry - rh * 1.2, rr, 0, Math.PI * 2);
        for (let k = 0; k < 3; k++) { const q = spin + k * Math.PI * 2 / 3; cx.moveTo(rx, ry - rh * 1.2); cx.lineTo(rx + Math.cos(q) * rr, ry - rh * 1.2 + Math.sin(q) * rr); }
        cx.stroke();
      }
      // The countdown.
      if (live) {
        cx.font = `${Math.round(Math.max(22, h * .32))}px VT323, monospace`; cx.textAlign = "center"; cx.textBaseline = "middle";
        cx.fillStyle = this.count < 5 && Math.sin(t * 16) > 0 ? "#ff4a4a" : "#ffb347"; cx.shadowColor = cx.fillStyle; cx.shadowBlur = 8;
        cx.fillText(String(Math.ceil(this.count)), (mx0 + mx1) / 2, (ceil + this.top) / 2);
        cx.textBaseline = "alphabetic";
      }
      // The ship, docked at the top, or lifting away.
      if (this.phase !== "boom") {
        const sx = this.shipX, sy = this.top - this.lift, k = rh / 18;
        beam("#ffffff", 12); cx.lineWidth = 1.8;
        cx.beginPath();
        cx.moveTo(sx - 22 * k, sy - 3 * k); cx.lineTo(sx - 14 * k, sy - 14 * k); cx.lineTo(sx + 8 * k, sy - 14 * k); cx.lineTo(sx + 24 * k, sy - 6 * k);
        cx.lineTo(sx + 16 * k, sy - 3 * k); cx.closePath();
        cx.moveTo(sx - 10 * k, sy - 3 * k); cx.lineTo(sx - 14 * k, sy); cx.moveTo(sx + 8 * k, sy - 3 * k); cx.lineTo(sx + 12 * k, sy);
        cx.moveTo(sx - 6 * k, sy - 14 * k); cx.lineTo(sx - 2 * k, sy - 9 * k); cx.lineTo(sx + 8 * k, sy - 9 * k);
        cx.stroke();
        if (this.phase === "launch" && Math.sin(t * 50) > -.3) {
          beam("#ff4fd8", 12); cx.beginPath(); cx.moveTo(sx - 8 * k, sy); cx.lineTo(sx - 2 * k, sy + (10 + Math.random() * 10) * k); cx.lineTo(sx + 4 * k, sy); cx.stroke();
        }
      }
      beam("#ffffff", 8); cx.lineWidth = 1.4;
      cx.beginPath();
      for (const o of this.oxoids) if (!o.got) { cx.moveTo(o.x + rh * .16, o.y); cx.arc(o.x, o.y, rh * .16, 0, Math.PI * 2); }
      cx.stroke();
      // Robots, bouncing as they patrol.
      for (const b of this.robots) {
        const by = this.fy(b.floor) - Math.abs(Math.sin(b.ph)) * rh * .6, w = rh * .45;
        beam("#ff4a4a", 10); cx.lineWidth = 1.7;
        cx.beginPath();
        cx.moveTo(b.x - w, by); cx.lineTo(b.x - w, by - rh * .5); cx.arc(b.x, by - rh * .5, w, Math.PI, 0); cx.lineTo(b.x + w, by); cx.closePath();
        cx.moveTo(b.x, by - rh * .5 - w); cx.lineTo(b.x, by - rh * 1.15);
        cx.moveTo(b.x + b.dir * w * .2, by - rh * .55); cx.lineTo(b.x + b.dir * w * .7, by - rh * .55);
        cx.stroke();
      }
      // Fishoids.
      beam("#72ff8f", 10); cx.lineWidth = 1.6;
      cx.beginPath();
      for (const f of this.fish) {
        const fy = f.y + Math.sin(f.ph) * 6, d = f.dir, L = rh * .55;
        cx.moveTo(f.x + d * L, fy); cx.quadraticCurveTo(f.x, fy - L * .7, f.x - d * L * .6, fy); cx.quadraticCurveTo(f.x, fy + L * .7, f.x + d * L, fy);
        cx.moveTo(f.x - d * L * .6, fy); cx.lineTo(f.x - d * L * 1.2, fy - L * .45); cx.lineTo(f.x - d * L * 1.2, fy + L * .45); cx.closePath();
      }
      cx.stroke();
      const r = this.rex;
      if (r.alive && !r.gone && this.phase === "maze") this.drawRex(r);
    },
    // Major Havoc himself: a helmeted little running man.
    drawRex(r) {
      const { x, y } = r, s = this.rh, f = r.face, air = !r.plat, sw = air ? .6 : Math.sin(r.gait);
      const hip = [x, y - s * .45], neck = [x + f * s * .06, y - s * .78];
      beam("#ffffff", 12); cx.lineWidth = 1.8;
      cx.beginPath();
      // Legs: striding on the ground, tucked in the air.
      for (const side of [1, -1]) {
        const k = sw * side;
        const knee = air ? [x + f * s * .2 * side, y - s * .25] : [x + k * s * .2, y - s * .22];
        cx.moveTo(...hip); cx.lineTo(...knee); cx.lineTo(knee[0] + (air ? -f * s * .12 : k * s * .1), y - (air ? s * .02 : Math.max(0, -k) * s * .08));
      }
      cx.moveTo(...hip); cx.lineTo(...neck);
      for (const side of [1, -1]) { const k = sw * side; cx.moveTo(x + f * s * .04, y - s * .7); cx.lineTo(x + f * s * .04 - k * s * .25, y - s * .5); }
      cx.moveTo(neck[0] + s * .13, neck[1] - s * .12); cx.arc(neck[0], neck[1] - s * .12, s * .13, 0, Math.PI * 2);
      cx.stroke();
      // The visor.
      beam("#5ce1ff", 8); cx.lineWidth = 1.4;
      cx.beginPath(); cx.moveTo(neck[0] + f * s * .02, neck[1] - s * .14); cx.lineTo(neck[0] + f * s * .15, neck[1] - s * .12); cx.stroke();
    },
  };

  // ----- Robotron: 2084: a hero, the last human family, and a horde of robots closing in -----
  // Grunts march straight at the hero a jerky step at a time, quickening as the wave goes on; hulks wander
  // about and only get pushed back by his shots; electrodes sit still and kill whatever walks into them; and
  // spheroids drift about dropping enforcers, which fire sparks. The hero keeps his distance, runs to pick up
  // the family for 1000 up to 5000, and fires whichever of the eight ways is nearest the closest robot. The
  // wave starts again once the grunts are gone, or he is.
  const robotron = {
    name: "ROBOTRON: 2084",
    // The sprites: a letter a colour, two frames for the ones that walk.
    art: {
      hero: { col: { w: "#ffffff", c: "#5ce1ff", m: "#ff4fd8" },
        f: [["..www..", "..www..", "...w...", ".ccccc.", "c.ccc.c", "w.ccc.w", "..ccc..", "..m.m..", "..m.m..", ".mm.mm."],
            ["..www..", "..www..", "...w...", ".ccccc.", "c.ccc.c", "w.ccc.w", "..ccc..", "..m.m..", ".m...m.", "mm...mm"]] },
      grunt: { col: { r: "#ff4a4a", y: "#ffb347" },
        f: [["...rrr...", "..ryyyr..", "..rrrrr..", ".rrrrrrr.", "r.ryryr.r", "r.rrrrr.r", "..ryyyr..", "..r...r..", "..r...r..", ".rr...rr."],
            ["...rrr...", "..ryyyr..", "..rrrrr..", ".rrrrrrr.", "r.ryryr.r", "r.rrrrr.r", "..ryyyr..", "...r.r...", "...r.r...", "..rr.rr.."]] },
      hulk: { col: { g: "#72ff8f", w: "#ffffff" },
        f: [["....ggg....", "...gwgwg...", "....ggg....", ".ggggggggg.", "gggg.g.gggg", "gg.ggggg.gg", "gg.ggggg.gg", "ww.ggggg.ww", "...ggggg...", "...gg.gg...", "...gg.gg...", "..ggg.ggg.."],
            ["....ggg....", "...gwgwg...", "....ggg....", ".ggggggggg.", "gggg.g.gggg", "gg.ggggg.gg", "gg.ggggg.gg", "ww.ggggg.ww", "...ggggg...", "...gg.gg...", "..gg...gg..", ".ggg...ggg."]] },
      enforcer: { col: { w: "#ffffff", c: "#ffe14a" },
        f: [["...www...", "..wwwww..", "ccwwwwwcc", "..ccccc..", "...ccc...", "..c.c.c..", ".c..c..c."]] },
      mommy: { col: { y: "#ffb347", p: "#ffd8a0", m: "#ff4fd8" },
        f: [["..yyy..", ".yyppy.", ".yyppy.", "..ppp..", ".mmmmm.", "p.mmm.p", "..mmm..", ".mmmmm.", "mmmmmmm", "..p.p..", "..p.p.."],
            ["..yyy..", ".yyppy.", ".yyppy.", "..ppp..", ".mmmmm.", "p.mmm.p", "..mmm..", ".mmmmm.", "mmmmmmm", ".p...p.", ".p...p."]] },
      daddy: { col: { y: "#ffb347", p: "#ffd8a0", b: "#4a7dff", w: "#ffffff" },
        f: [["..yyy..", "..ppp..", "...p...", ".bbbbb.", "b.bbb.b", "p.bbb.p", "..bbb..", "..w.w..", "..w.w..", ".ww.ww."],
            ["..yyy..", "..ppp..", "...p...", ".bbbbb.", "b.bbb.b", "p.bbb.p", "..bbb..", "..w.w..", ".w...w.", "ww...ww"]] },
      mikey: { col: { y: "#ff4a4a", p: "#ffd8a0", g: "#72ff8f" },
        f: [[".yyy.", ".ppp.", "ggggg", "p.g.p", ".ggg.", ".g.g.", ".g.g."],
            [".yyy.", ".ppp.", "ggggg", "p.g.p", ".ggg.", ".g.g.", "g...g"]] },
    },
    ELECTRODE: ["#5ce1ff", "#ffb347", "#72ff8f", "#ff4fd8", "#ffe14a"],
    layout() {
      const a = arena(18);
      this.a = a; this.px = Math.max(2, Math.min(3, Math.round(Math.min(a.w, a.h) / 230)));
      const m = 8 * this.px;
      this.f = { x0: a.x0 + m, y0: a.y0 + m, x1: a.x1 - m, y1: a.y1 - m };
      this.cache = new Map(); this.sparks = this.sparks ?? [];
      this.newWave(true);
    },
    start() { if (!this.f) this.layout(); },
    // A sprite drawn once as glowing outlines, at twice the size for sharp edges on high-density screens.
    pic(kind, frame) {
      const art = this.art[kind], px = this.px, key = `${kind}/${frame}/${px}`;
      let c = this.cache.get(key);
      if (c) return c;
      const rows = art.f[frame], w = rows[0].length, h = rows.length, pad = 6, k = 2;
      c = document.createElement("canvas");
      c.cw = w * px + pad * 2; c.ch = h * px + pad * 2; c.width = c.cw * k; c.height = c.ch * k;
      const g = c.getContext("2d");
      g.scale(k, k); g.lineWidth = 1.3; g.lineCap = "square"; g.shadowBlur = 5 * k;
      for (const [ch, colour] of Object.entries(art.col)) {
        g.strokeStyle = g.shadowColor = colour;
        g.beginPath();
        outline((x, y) => rows[y]?.[x] === ch, w, h, (x0, y0, x1, y1) => { g.moveTo(pad + x0 * px, pad + y0 * px); g.lineTo(pad + x1 * px, pad + y1 * px); });
        g.stroke();
      }
      this.cache.set(key, c);
      return c;
    },
    put(kind, frame, x, y) { const c = this.pic(kind, frame); cx.drawImage(c, x - c.cw / 2, y - c.ch / 2, c.cw, c.ch); },
    // A sprite as rows of light pulled apart by `spread` (1 is whole): how robots come in and blow apart.
    slices(kind, frame, x, y, spread) {
      const art = this.art[kind], rows = art.f[frame], px = this.px, w = rows[0].length, h = rows.length;
      cx.lineWidth = Math.max(1.2, px * .7);
      for (const [ch, colour] of Object.entries(art.col)) {
        beam(colour, 8);
        cx.beginPath();
        rows.forEach((row, r) => {
          const yy = y + (r - h / 2 + .5) * px * spread;
          for (let c = 0; c < w; c++) {
            if (row[c] !== ch || row[c - 1] === ch) continue;
            let e = c; while (row[e] === ch) e++;
            cx.moveTo(x + (c - w / 2) * px, yy); cx.lineTo(x + (e - w / 2) * px, yy);
          }
        });
        cx.stroke();
      }
    },
    newWave(again) {
      const f = this.f, px = this.px, mx = (f.x0 + f.x1) / 2, my = (f.y0 + f.y1) / 2;
      if (!again || !this.wave) this.wave = (this.wave ?? 0) + 1;
      const fw = f.x1 - f.x0, fh = f.y1 - f.y0, clear = Math.min(fw, fh) * .32;
      // Somewhere in the field, clear of the hero's spot in the middle.
      const spot = (gap = clear) => {
        let x, y, n = 0;
        do { x = rand(f.x0 + 6 * px, f.x1 - 6 * px); y = rand(f.y0 + 6 * px, f.y1 - 6 * px); } while (Math.hypot(x - mx, y - my) < gap && ++n < 60);
        return { x, y };
      };
      const n = Math.max(10, Math.min(34, Math.round(fw * fh / 17000)));
      this.hero = { x: mx, y: my, alive: true, fire: 0, walk: 0, d: 0, alt: 0 };
      this.grunts = Array.from({ length: n }, () => ({ ...spot(), wait: rand(0, .5), frame: 0 }));
      this.hulks = Array.from({ length: W < 700 ? 2 : 3 }, () => ({ ...spot(clear * .8), d: Math.floor(rand(0, 4)), turn: 0, vx: 0, vy: 0, walk: 0 }));
      this.electrodes = Array.from({ length: Math.max(4, Math.min(9, Math.round(n / 4))) }, () => spot(clear * .5));
      this.spheroids = Array.from({ length: 2 }, () => ({ ...spot(), tx: 0, ty: 0, drop: rand(1.5, 3), left: 3 }));
      this.family = ["mommy", "daddy", "mikey"].map(kind => ({ ...spot(clear * .6), kind, d: Math.floor(rand(0, 4)), turn: rand(.5, 2), walk: 0 }));
      this.enforcers = []; this.zaps = []; this.shots = []; this.booms = []; this.pops = [];
      this.gruntStep = .3; this.rescued = 0; this.clock = 0; this.over = 0; this.clearing = 0;
      this.intro = still ? 0 : .9;
    },
    near(list, x, y) {
      let best = null, bd = Infinity;
      for (const o of list) { const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; } }
      return [best, bd];
    },
    keepIn(o, m) { const f = this.f; o.x = Math.max(f.x0 + m, Math.min(f.x1 - m, o.x)); o.y = Math.max(f.y0 + m, Math.min(f.y1 - m, o.y)); },
    step(dt) {
      const h = this.hero, px = this.px, f = this.f;
      for (const p of this.pops) { p.age += dt; p.y -= 14 * dt; }
      this.pops = this.pops.filter(p => p.age < 1.4);
      for (const b of this.booms) b.age += dt;
      this.booms = this.booms.filter(b => b.age < .7);
      if (this.intro > 0) { this.intro -= dt; return; }
      if (this.over > 0) { this.over -= dt; this.clearing = Math.max(0, this.clearing - dt); if (this.over <= 0) this.newWave(!h.alive); return; }
      this.clock += dt;
      // Grunts: a step at a time straight at the hero, more often as the wave goes on.
      this.gruntStep = Math.max(.08, this.gruntStep - dt * .006);
      for (const g of this.grunts) {
        if ((g.wait -= dt) > 0) continue;
        g.wait = this.gruntStep * rand(.8, 1.3); g.frame ^= 1;
        const dx = h.x - g.x, dy = h.y - g.y;
        g.x += Math.sign(dx) * Math.min(Math.abs(dx), 3 * px); g.y += Math.sign(dy) * Math.min(Math.abs(dy), 3 * px);
      }
      // Walking into an electrode is the end of a grunt.
      this.grunts = this.grunts.filter(g => {
        if (!this.electrodes.some(e => Math.hypot(e.x - g.x, e.y - g.y) < 7 * px)) return true;
        this.booms.push({ kind: "grunt", frame: 0, x: g.x, y: g.y, age: 0 });
        return false;
      });
      // Hulks plod about after the family, a quarter turn now and then, and crush whoever they catch.
      for (const k of this.hulks) {
        if ((k.turn -= dt) <= 0) {
          k.turn = rand(.8, 2);
          const [m] = this.near(this.family, k.x, k.y);
          k.d = m && Math.random() < .6 ? (Math.abs(m.x - k.x) > Math.abs(m.y - k.y) ? (m.x > k.x ? 0 : 2) : (m.y > k.y ? 1 : 3)) : Math.floor(rand(0, 4));
        }
        k.x += (DIRS[k.d][0] * 9 * px + k.vx) * dt; k.y += (DIRS[k.d][1] * 9 * px + k.vy) * dt;
        k.vx *= 1 - Math.min(1, 5 * dt); k.vy *= 1 - Math.min(1, 5 * dt); k.walk += dt;
        const x = k.x, y = k.y; this.keepIn(k, 7 * px);
        if (x !== k.x || y !== k.y) k.d = (k.d + 2) % 4;
        this.family = this.family.filter(m => {
          if (Math.hypot(m.x - k.x, m.y - k.y) > 7 * px) return true;
          sparkBurst(this.sparks, m.x, m.y, 14, 90, "255,79,216");
          return false;
        });
      }
      // The family wanders, not knowing which way to go.
      for (const m of this.family) {
        if ((m.turn -= dt) <= 0) { m.turn = rand(.8, 2.2); m.d = Math.floor(rand(0, 4)); }
        m.x += DIRS[m.d][0] * 8 * px * dt; m.y += DIRS[m.d][1] * 8 * px * dt; m.walk += dt;
        const x = m.x, y = m.y; this.keepIn(m, 6 * px);
        if (x !== m.x || y !== m.y) m.d = (m.d + 2) % 4;
      }
      // Spheroids drift from spot to spot, dropping an enforcer every few seconds, three at most each.
      for (const s of this.spheroids) {
        if (!s.tx || Math.hypot(s.tx - s.x, s.ty - s.y) < 8) { s.tx = rand(f.x0 + 20, f.x1 - 20); s.ty = rand(f.y0 + 20, f.y1 - 20); }
        const d = Math.hypot(s.tx - s.x, s.ty - s.y) || 1;
        s.x += (s.tx - s.x) / d * 22 * px * dt; s.y += (s.ty - s.y) / d * 22 * px * dt;
        if ((s.drop -= dt) <= 0 && s.left > 0 && this.enforcers.length < 6) {
          s.drop = rand(2.5, 4); s.left--;
          this.enforcers.push({ x: s.x, y: s.y, vx: 0, vy: 0, fire: rand(1, 2.5), ox: rand(-40, 40) * px / 3, oy: rand(-40, 40) * px / 3 });
        }
      }
      // Enforcers swing in on the hero, never quite straight, and fire sparks where he's heading.
      for (const e of this.enforcers) {
        const dx = h.x + e.ox - e.x, dy = h.y + e.oy - e.y, d = Math.hypot(dx, dy) || 1;
        e.vx += dx / d * 60 * px * dt; e.vy += dy / d * 60 * px * dt;
        const sp = Math.hypot(e.vx, e.vy), top = 30 * px;
        if (sp > top) { e.vx *= top / sp; e.vy *= top / sp; }
        e.x += e.vx * dt; e.y += e.vy * dt; this.keepIn(e, 5 * px);
        if ((e.fire -= dt) <= 0 && this.zaps.length < 6 && h.alive) {
          e.fire = rand(1.6, 3);
          const a = Math.atan2(h.y - e.y, h.x - e.x) + rand(-.3, .3);
          this.zaps.push({ x: e.x, y: e.y, vx: Math.cos(a) * 45 * px, vy: Math.sin(a) * 45 * px, age: 0 });
        }
      }
      for (const z of this.zaps) {
        z.x += z.vx * dt; z.y += z.vy * dt; z.age += dt;
        if (z.x < f.x0 || z.x > f.x1) z.vx = -z.vx;
        if (z.y < f.y0 || z.y > f.y1) z.vy = -z.vy;
      }
      this.zaps = this.zaps.filter(z => z.age < 3.5);
      if (h.alive) this.play(dt);
      // The hero's shots: grunts blow apart, hulks get shoved back, anything else is knocked out.
      for (const s of this.shots) {
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.x < f.x0 || s.x > f.x1 || s.y < f.y0 || s.y > f.y1) { s.dead = true; continue; }
        const hit = (list, r) => list.findIndex(o => Math.hypot(o.x - s.x, o.y - s.y) < r);
        let i;
        if ((i = hit(this.grunts, 5.5 * px)) >= 0) {
          const g = this.grunts.splice(i, 1)[0];
          this.booms.push({ kind: "grunt", frame: g.frame, x: g.x, y: g.y, age: 0 });
        } else if ((i = hit(this.hulks, 6.5 * px)) >= 0) {
          this.hulks[i].vx += s.vx * .35; this.hulks[i].vy += s.vy * .35;
        } else if ((i = hit(this.enforcers, 5 * px)) >= 0) {
          const e = this.enforcers.splice(i, 1)[0]; sparkBurst(this.sparks, e.x, e.y, 12, 100, "255,225,74");
        } else if ((i = hit(this.spheroids, 6 * px)) >= 0) {
          const e = this.spheroids.splice(i, 1)[0]; sparkBurst(this.sparks, e.x, e.y, 16, 110, "255,74,74");
        } else if ((i = hit(this.electrodes, 5 * px)) >= 0) {
          const e = this.electrodes.splice(i, 1)[0]; sparkBurst(this.sparks, e.x, e.y, 8, 70, "92,225,255");
        } else if ((i = hit(this.zaps, 4 * px)) >= 0) this.zaps.splice(i, 1);
        else continue;
        s.dead = true;
      }
      this.shots = this.shots.filter(s => !s.dead);
      if (!h.alive) return;
      // Anything that touches him is the end of him.
      const touch = (list, r) => list.some(o => Math.hypot(o.x - h.x, o.y - h.y) < r);
      if (touch(this.grunts, 7 * px) || touch(this.hulks, 8 * px) || touch(this.electrodes, 6 * px) || touch(this.enforcers, 6 * px)
          || touch(this.zaps, 4.5 * px) || touch(this.spheroids, 6 * px)) {
        h.alive = false; this.over = 2.2;
        this.booms.push({ kind: "hero", frame: 0, x: h.x, y: h.y, age: 0 });
        sparkBurst(this.sparks, h.x, h.y, 20, 120, "92,225,255");
        return;
      }
      if (!this.grunts.length || this.clock > 50) { this.over = this.clearing = 1.8; }
    },
    // The hero: pushed away from whatever's close, drawn to the nearest of the family, and off the walls; the
    // stick only goes eight ways. He fires at the nearest robot, alternating between the two nearest ways.
    play(dt) {
      const h = this.hero, px = this.px, f = this.f;
      let vx = 0, vy = 0;
      const away = (list, r, w) => {
        for (const o of list) {
          const dx = h.x - o.x, dy = h.y - o.y, d = Math.hypot(dx, dy) || 1;
          if (d < r) { const k = w * (r - d) / r / d; vx += dx * k; vy += dy * k; }
        }
      };
      away(this.grunts, 30 * px, 1.5); away(this.hulks, 34 * px, 2.2); away(this.electrodes, 14 * px, 3);
      away(this.enforcers, 26 * px, 1.4); away(this.zaps, 22 * px, 3); away(this.spheroids, 18 * px, 1.2);
      const [m] = this.near(this.family, h.x, h.y);
      if (m) { const dx = m.x - h.x, dy = m.y - h.y, d = Math.hypot(dx, dy) || 1; vx += dx / d * .8; vy += dy / d * .8; }
      vx += ((f.x0 + f.x1) / 2 - h.x) / (f.x1 - f.x0) * 1.2; vy += ((f.y0 + f.y1) / 2 - h.y) / (f.y1 - f.y0) * 1.2;
      if (Math.hypot(vx, vy) > .2) {
        const d8 = Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) * Math.PI / 4;
        h.x += Math.cos(d8) * 52 * px * dt; h.y += Math.sin(d8) * 52 * px * dt; h.walk += dt;
        this.keepIn(h, 6 * px);
      }
      // Picking up one of the family: 1000 for the first, up to 5000.
      this.family = this.family.filter(m => {
        if (Math.hypot(m.x - h.x, m.y - h.y) > 7 * px) return true;
        this.rescued = Math.min(5, this.rescued + 1);
        this.pops.push({ x: m.x, y: m.y - 6 * px, text: String(this.rescued * 1000), age: 0 });
        return false;
      });
      h.fire -= dt;
      const [t, td] = this.near([...this.grunts, ...this.enforcers, ...this.spheroids, ...this.zaps], h.x, h.y);
      const [k, kd] = this.near(this.hulks, h.x, h.y);
      const aim = k && kd < 30 * px && kd < td ? k : t;
      if (aim && h.fire <= 0 && this.shots.length < 6) {
        const q = Math.atan2(aim.y - h.y, aim.x - h.x) / (Math.PI / 4);
        const d = Math.abs(q - Math.round(q)) < .2 ? Math.round(q) : (h.alt ^= 1) ? Math.floor(q) : Math.ceil(q);
        h.d = d; h.fire = .1;
        this.shots.push({ x: h.x, y: h.y, vx: Math.cos(d * Math.PI / 4) * 270 * px, vy: Math.sin(d * Math.PI / 4) * 270 * px });
      }
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      const a = this.a, px = this.px, h = this.hero;
      // The frame, its colour always on the move.
      beam(`hsl(${Math.floor(t * 140) % 360},100%,62%)`, 10); cx.lineWidth = 2.2;
      cx.strokeRect(a.x0, a.y0, a.w, a.h); cx.strokeRect(a.x0 + 4, a.y0 + 4, a.w - 8, a.h - 8);
      // A wave cleared: rectangles rushing out from the hero.
      if (this.clearing > 0) {
        cx.lineWidth = 1.6;
        for (let i = 0; i < 5; i++) {
          const k = ((1.8 - this.clearing) * 1.4 + i * .2) % 1, rw = a.w * k / 2, rh = a.h * k / 2;
          beam(`hsl(${(i * 70 + t * 300) % 360},100%,60%)`, 10);
          cx.strokeRect(h.x - rw, h.y - rh, rw * 2, rh * 2);
        }
      }
      // Electrodes, a different shape and colour each wave.
      const shape = this.wave % 4, r = 4.5 * px;
      beam(this.ELECTRODE[this.wave % this.ELECTRODE.length], 10); cx.lineWidth = 1.6;
      cx.beginPath();
      for (const e of this.electrodes) {
        const { x, y } = e;
        if (shape === 0) for (let i = 0; i < 4; i++) { const q = i * Math.PI / 4; cx.moveTo(x - Math.cos(q) * r, y - Math.sin(q) * r); cx.lineTo(x + Math.cos(q) * r, y + Math.sin(q) * r); }
        else if (shape === 1) { cx.rect(x - r, y - r, r * 2, r * 2); cx.rect(x - r / 2, y - r / 2, r, r); }
        else if (shape === 2) { cx.moveTo(x, y - r); cx.lineTo(x + r, y); cx.lineTo(x, y + r); cx.lineTo(x - r, y); cx.closePath(); cx.moveTo(x - r / 2, y); cx.lineTo(x + r / 2, y); }
        else { cx.moveTo(x, y - r); cx.lineTo(x + r, y + r * .8); cx.lineTo(x - r, y + r * .8); cx.closePath(); }
      }
      cx.stroke();
      // Spheroids: rings swelling out from the middle.
      cx.lineWidth = 1.5;
      for (const s of this.spheroids)
        for (let i = 0; i < 3; i++) {
          beam(i % 2 ? "#ffb347" : "#ff4a4a", 10);
          cx.beginPath(); cx.arc(s.x, s.y, .5 + wrap(t * 1.6 + i / 3, 0, 1) * 6 * px, 0, Math.PI * 2); cx.stroke();
        }
      // Everyone else; while a wave comes in, they gather out of strips of light.
      const spread = this.intro > 0 ? 1 + 9 * (this.intro / .9) ** 2 : 1;
      const show = (kind, frame, x, y) => spread > 1 ? this.slices(kind, frame, x, y, spread) : this.put(kind, frame, x, y);
      const step = o => Math.floor(o.walk * 6) % 2;
      for (const m of this.family) show(m.kind, step(m), m.x, m.y);
      for (const k of this.hulks) show("hulk", step(k), k.x, k.y);
      for (const g of this.grunts) show("grunt", g.frame, g.x, g.y);
      for (const e of this.enforcers) this.put("enforcer", 0, e.x, e.y);
      if (h.alive) show("hero", step(h), h.x, h.y);
      // Sparks from the enforcers: little spinning crosses.
      cx.lineWidth = 1.6;
      for (const z of this.zaps) {
        beam(Math.sin(t * 30 + z.x) > 0 ? "#ffffff" : "#ff4fd8", 10);
        const q = t * 9 + z.age, s = 3 * px;
        cx.beginPath();
        cx.moveTo(z.x - Math.cos(q) * s, z.y - Math.sin(q) * s); cx.lineTo(z.x + Math.cos(q) * s, z.y + Math.sin(q) * s);
        cx.moveTo(z.x + Math.sin(q) * s, z.y - Math.cos(q) * s); cx.lineTo(z.x - Math.sin(q) * s, z.y + Math.cos(q) * s);
        cx.stroke();
      }
      // The hero's shots: short streaks.
      beam("#ffffff", 8); cx.lineWidth = 2;
      cx.beginPath();
      for (const s of this.shots) { const sp = Math.hypot(s.vx, s.vy); cx.moveTo(s.x, s.y); cx.lineTo(s.x - s.vx / sp * 6 * px, s.y - s.vy / sp * 6 * px); }
      cx.stroke();
      // Blown apart: the sprite's rows flung up and down, fading.
      const alpha = cx.globalAlpha;
      for (const b of this.booms) {
        cx.globalAlpha = alpha * (1 - b.age / .7);
        this.slices(b.kind, b.frame, b.x, b.y, 1 + b.age * 14);
      }
      cx.globalAlpha = alpha;
      // What a rescue was worth.
      cx.font = `${10 + 4 * px}px VT323, monospace`; cx.textAlign = "center"; cx.textBaseline = "middle";
      for (const p of this.pops) {
        const c = ["#ffffff", "#ffe14a", "#ff4fd8", "#5ce1ff"][Math.floor(p.age * 12) % 4];
        cx.shadowColor = c; cx.shadowBlur = 8; cx.fillStyle = c;
        cx.fillText(p.text, p.x, p.y);
      }
      cx.shadowBlur = 0;
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Centipede: a bug blaster at the foot of a mushroom field, and a centipede winding down to it -----
  // The centipede runs along a row until a mushroom or the edge turns it down a row and back; every segment
  // keeps to the same rules, so the body follows the head, and a segment shot from the middle leaves a
  // mushroom that turns the ones behind it into a centipede of their own. The spider zigzags through the
  // bottom eating mushrooms, and now and then a flea drops down the field sowing more. The blaster lines up
  // under the lowest segment and fires, keeping out of the spider's way. Each wave comes in new colours.
  const centipede = {
    name: "CENTIPEDE",
    SCHEMES: [
      { cap: "#ff4fd8", stem: "#5ce1ff", body: "#72ff8f", head: "#ffb347", spider: "#ff4fd8", gnome: "#ffe14a" },
      { cap: "#5ce1ff", stem: "#ff4fd8", body: "#ffb347", head: "#72ff8f", spider: "#72ff8f", gnome: "#ffffff" },
      { cap: "#ffb347", stem: "#72ff8f", body: "#ff4fd8", head: "#5ce1ff", spider: "#5ce1ff", gnome: "#ffe14a" },
      { cap: "#72ff8f", stem: "#ffb347", body: "#5ce1ff", head: "#ff4fd8", spider: "#ffb347", gnome: "#ff4fd8" },
      { cap: "#ff4a4a", stem: "#ffe14a", body: "#5ce1ff", head: "#ffffff", spider: "#72ff8f", gnome: "#5ce1ff" },
      { cap: "#ffe14a", stem: "#4a7dff", body: "#ff4fd8", head: "#72ff8f", spider: "#5ce1ff", gnome: "#ffffff" },
    ],
    // The sprites, 8 cells to a grid square; the mushroom loses two rows off the bottom for every hit.
    art: {
      mush: ["..aaaa..", ".aaaaaa.", "aaaaaaaa", "aaaaaaaa", "..bbbb..", "..bbbb..", "..bbbb..", "..bbbb.."],
      body: [["..aaaa..", ".aaaaaa.", "aaaaaaaa", "aaaaaaaa", "aaaaaaaa", ".aaaaaa.", "..aaaa..", "a.a..a.a"],
             ["..aaaa..", ".aaaaaa.", "aaaaaaaa", "aaaaaaaa", "aaaaaaaa", ".aaaaaa.", "..aaaa..", ".a.aa.a."]],
      head: [["..hhhh..", ".hhhhhh.", "hhehhehh", "hhhhhhhh", "hhhhhhhh", ".hhhhhh.", "..hhhh..", "h.h..h.h"],
             ["..hhhh..", ".hhhhhh.", "hhehhehh", "hhhhhhhh", "hhhhhhhh", ".hhhhhh.", "..hhhh..", ".h.hh.h."]],
      gnome: ["...e....", "..eee...", "..ebe...", ".aaaaa..", "aaaaaaa.", "aaaaaaa.", ".aaaaa..", "..a.a..."],
      flea: [".aaaa...", "aaaaaa..", "aeaaea..", "aaaaaa..", ".aaaa...", ".a..a...", "a....a..", "........"],
    },
    layout() {
      const a = arena(14);
      this.cs = Math.max(12, Math.min(26, Math.floor(a.h / 30)));
      this.cols = Math.floor(a.w / this.cs); this.rows = Math.floor(a.h / this.cs);
      this.ox = a.x0 + (a.w - this.cols * this.cs) / 2; this.oy = a.y0 + (a.h - this.rows * this.cs) / 2;
      this.zone = this.rows - 6; // the blaster's patch at the bottom
      this.cache = new Map(); this.wave = this.wave ?? 0; this.sparks = this.sparks ?? [];
      this.sow();
      this.newWave();
    },
    start() { if (!this.mush) this.layout(); },
    sow() {
      const { cols, rows } = this;
      this.mush = new Int8Array(cols * rows);
      for (let r = 1; r < rows - 1; r++)
        for (let c = 0; c < cols; c++) if (Math.random() < (r < this.zone ? .085 : .03)) this.mush[r * cols + c] = 4;
    },
    newWave() {
      const { cols, cs } = this, n = Math.min(12, cols - 2), c0 = Math.floor((cols + n) / 2) - 1;
      this.segs = [];
      for (let i = 0; i < n; i++) {
        const s = { c: c0 - i, r: 0, pc: c0 - i, pr: 0, dir: 1, vd: 1, lead: this.segs[i - 1] ?? null };
        this.segs.push(s);
      }
      this.clock = 0; this.speed = 9 + Math.min(4, this.wave * .5);
      this.gnome = { x: this.ox + cols * cs / 2, y: this.oy + (this.rows - 1.5) * cs, alive: true };
      this.shot = null; this.flea = null; this.fleaWait = rand(5, 9); this.pops = [];
      this.spider = still ? { x: this.ox + cols * cs * .25, y: this.oy + (this.zone + 2) * cs, vx: 1, vy: 1, turn: 1 } : null;
      this.spiderWait = rand(2, 4); this.dying = 0; this.next = 0;
    },
    pic(rows, col) {
      const px = this.cs / 9, key = rows.join("") + Object.values(col).join("") + px;
      let c = this.cache.get(key);
      if (c) return c;
      const w = rows[0].length, h = rows.length, pad = 6, k = 2;
      c = document.createElement("canvas");
      c.cw = w * px + pad * 2; c.ch = h * px + pad * 2; c.width = c.cw * k; c.height = c.ch * k;
      const g = c.getContext("2d");
      g.scale(k, k); g.lineWidth = 1.3; g.lineCap = "square"; g.shadowBlur = 5 * k;
      for (const [ch, colour] of Object.entries(col)) {
        g.strokeStyle = g.shadowColor = colour;
        g.beginPath();
        outline((x, y) => rows[y]?.[x] === ch, w, h, (x0, y0, x1, y1) => { g.moveTo(pad + x0 * px, pad + y0 * px); g.lineTo(pad + x1 * px, pad + y1 * px); });
        g.stroke();
      }
      this.cache.set(key, c);
      return c;
    },
    put(rows, col, x, y) { const c = this.pic(rows, col); cx.drawImage(c, x - c.cw / 2, y - c.ch / 2, c.cw, c.ch); },
    // Where a segment is between its last cell and this one.
    at(s) {
      const p = this.clock, cs = this.cs;
      return [this.ox + (s.pc + (s.c - s.pc) * p + .5) * cs, this.oy + (s.pr + (s.r - s.pr) * p + .5) * cs];
    },
    move(s) {
      const { cols, rows } = this;
      s.pc = s.c; s.pr = s.r;
      const nc = s.c + s.dir;
      if (nc >= 0 && nc < cols && !this.mush[s.r * cols + nc]) { s.c = nc; return; }
      // Turned: down a row (up again once it's reached the bottom, as far as the blaster's patch) and back.
      if (s.r + s.vd >= rows || (s.vd < 0 && s.r + s.vd < this.zone)) s.vd = -s.vd;
      s.r += s.vd; s.dir = -s.dir;
    },
    kill(s) {
      this.segs.splice(this.segs.indexOf(s), 1);
      for (const o of this.segs) if (o.lead === s) o.lead = null;
      if (s.r > 0 && s.r < this.rows) this.mush[s.r * this.cols + s.c] = 4;
      const [x, y] = this.at(s);
      sparkBurst(this.sparks, x, y, 8, 80, "255,255,255");
    },
    step(dt) {
      const { cs, cols, rows, ox, oy } = this, g = this.gnome;
      for (const p of this.pops) p.age += dt;
      this.pops = this.pops.filter(p => p.age < 1.2);
      if (this.next > 0) { this.next -= dt; if (this.next <= 0) this.newWave(); return; }
      if (this.dying > 0) {
        this.dying -= dt;
        // Back again: the damaged mushrooms made good, and the centipede starts over from the top.
        if (this.dying <= 0) { for (let k = 0; k < this.mush.length; k++) if (this.mush[k]) this.mush[k] = 4; this.newWave(); }
        return;
      }
      this.clock += dt * this.speed;
      while (this.clock >= 1) { this.clock -= 1; for (const s of this.segs) this.move(s); }
      // The spider: in from one side, bouncing up and down through the bottom, eating mushrooms, out the other.
      const top = oy + (this.zone - 1) * cs, bottom = oy + (rows - .5) * cs;
      if (!this.spider && (this.spiderWait -= dt) <= 0) {
        const side = Math.random() < .5 ? -1 : 1;
        this.spider = { x: side < 0 ? ox - cs : ox + (cols + 1) * cs, y: rand(top, bottom), vx: -side * rand(3, 5) * cs, vy: rand(6, 9) * cs, turn: rand(.3, 1) };
      }
      const sp = this.spider;
      if (sp) {
        // Now a zigzag, now straight up and down for a moment.
        if ((sp.turn -= dt) <= 0) { sp.turn = rand(.3, 1.2); sp.still = Math.random() < .3; }
        if (!sp.still) sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        if (sp.y < top) { sp.y = top; sp.vy = Math.abs(sp.vy); } else if (sp.y > bottom) { sp.y = bottom; sp.vy = -Math.abs(sp.vy); }
        const c = Math.floor((sp.x - ox) / cs), r = Math.floor((sp.y - oy) / cs);
        if (c >= 0 && c < cols && r >= this.zone && r < rows && Math.random() < 3 * dt) this.mush[r * cols + c] = 0;
        if (sp.x < ox - 2 * cs || sp.x > ox + (cols + 2) * cs) { this.spider = null; this.spiderWait = rand(2, 5); }
      }
      // The flea: straight down a column, leaving mushrooms behind it.
      if (!this.flea && (this.fleaWait -= dt) <= 0) this.flea = { x: ox + (Math.floor(rand(0, cols)) + .5) * cs, y: oy - cs, r: -1, hp: 2, vy: 13 * cs };
      const fl = this.flea;
      if (fl) {
        fl.y += fl.vy * dt;
        const r = Math.floor((fl.y - oy) / cs), c = Math.floor((fl.x - ox) / cs);
        if (r !== fl.r) { fl.r = r; if (r > 0 && r < rows - 1 && Math.random() < .3) this.mush[r * cols + c] = 4; }
        if (fl.y > oy + rows * cs + cs) { this.flea = null; this.fleaWait = rand(6, 12); }
      }
      // The blaster: under the lowest segment, a little ahead of it; away from the spider when it comes close,
      // or after it when it's above and in reach.
      const low = this.segs.reduce((b, s) => !b || s.r > b.r || (s.r === b.r && Math.abs(this.at(s)[0] - g.x) < Math.abs(this.at(b)[0] - g.x)) ? s : b, null);
      let wx = low ? this.at(low)[0] + low.dir * cs * .6 : ox + cols * cs / 2, wy = oy + (rows - 1.5) * cs;
      if (sp) {
        const dx = g.x - sp.x, dy = g.y - sp.y;
        if (Math.abs(dx) < 4 * cs && Math.abs(dy) < 3 * cs) { wx = g.x + Math.sign(dx || 1) * 4 * cs; wy = sp.y > g.y ? top + cs : bottom; }
        else if (dy > 0 && Math.abs(dx) < 6 * cs) wx = sp.x + sp.vx * .15;
      }
      for (const s of this.segs) {
        const [x, y] = this.at(s);
        if (Math.abs(y - g.y) < 1.6 * cs && Math.abs(x - g.x) < 3 * cs) wy = y > g.y ? top + cs : bottom;
      }
      wx = Math.max(ox + cs / 2, Math.min(ox + (cols - .5) * cs, wx));
      g.x += Math.max(-13 * cs * dt, Math.min(13 * cs * dt, wx - g.x));
      g.y += Math.max(-8 * cs * dt, Math.min(8 * cs * dt, wy - g.y));
      g.y = Math.max(oy + (this.zone + .5) * cs, Math.min(bottom, g.y));
      if (!this.shot) this.shot = { x: g.x, y: g.y - cs * .5 };
      // The shot, very fast, a little at a time so it can't skip over anything.
      let go = 60 * cs * dt;
      while (this.shot && go > 0) {
        const s = this.shot, d = Math.min(go, cs * .4);
        go -= d; s.y -= d;
        if (s.y < oy) { this.shot = null; break; }
        const seg = this.segs.find(o => { const [x, y] = this.at(o); return Math.abs(x - s.x) < cs * .5 && Math.abs(y - s.y) < cs * .5; });
        if (seg) { this.kill(seg); this.shot = null; break; }
        if (sp && Math.abs(sp.x - s.x) < cs * .9 && Math.abs(sp.y - s.y) < cs * .6) {
          const near = Math.hypot(sp.x - g.x, sp.y - g.y);
          this.pops.push({ x: sp.x, y: sp.y, text: near < 3 * cs ? "900" : near < 6 * cs ? "600" : "300", age: 0 });
          sparkBurst(this.sparks, sp.x, sp.y, 14, 100, "255,255,255");
          this.spider = null; this.spiderWait = rand(2, 5); this.shot = null; break;
        }
        if (fl && Math.abs(fl.x - s.x) < cs * .5 && Math.abs(fl.y - s.y) < cs * .6) {
          if (--fl.hp <= 0) { sparkBurst(this.sparks, fl.x, fl.y, 10, 90, "255,255,255"); this.flea = null; this.fleaWait = rand(6, 12); }
          else fl.vy *= 2;
          this.shot = null; break;
        }
        const c = Math.floor((s.x - ox) / cs), r = Math.floor((s.y - oy) / cs), k = r * cols + c;
        if (c >= 0 && c < cols && r >= 0 && this.mush[k] > 0) { this.mush[k]--; this.shot = null; }
      }
      // Caught by the spider, the flea or the centipede.
      const caught = (x, y, rr) => Math.abs(x - g.x) < rr && Math.abs(y - g.y) < rr;
      if ((this.spider && caught(this.spider.x, this.spider.y, cs * .8)) || (this.flea && caught(this.flea.x, this.flea.y, cs * .6))
          || this.segs.some(s => caught(...this.at(s), cs * .7))) {
        sparkBurst(this.sparks, g.x, g.y, 22, 120, "255,225,74");
        this.dying = 2; this.shot = null;
        return;
      }
      // Wave cleared: new colours, and a fresh field now and then.
      if (!this.segs.length) {
        this.wave++; this.next = .8;
        const n = this.mush.reduce((a, m) => a + (m > 0), 0);
        if (n > cols * rows * .16 || n < cols * rows * .03) this.sow();
      }
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      const { cs, cols, rows, ox, oy } = this, sc = this.SCHEMES[this.wave % this.SCHEMES.length];
      // Mushrooms, cut down from the bottom as they're shot.
      const cuts = [0, 1, 2, 3, 4].map(h => this.art.mush.map((row, i) => i < h * 2 ? row : "........"));
      const mc = { a: sc.cap, b: sc.stem };
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const h = this.mush[r * cols + c];
          if (h > 0) this.put(cuts[h], mc, ox + (c + .5) * cs, oy + (r + .5) * cs);
        }
      // The centipede: heads with eyes, legs paddling.
      const legs = Math.floor(wrap(t * 10, 0, 2)), bc = { a: sc.body }, hc = { h: sc.head, e: "#ffffff" };
      for (const s of this.segs) {
        const [x, y] = this.at(s);
        if (s.lead) this.put(this.art.body[legs], bc, x, y); else this.put(this.art.head[legs], hc, x, y);
      }
      // The spider: a round body, eyes, and four legs a side scrabbling.
      const sp = this.spider;
      if (sp) {
        beam(sc.spider, 10); cx.lineWidth = 1.6;
        cx.beginPath(); cx.ellipse(sp.x, sp.y, cs * .42, cs * .3, 0, 0, Math.PI * 2);
        for (const side of [-1, 1])
          for (let i = 0; i < 4; i++) {
            const lift = Math.sin(t * 22 + i * 1.7 + side) * cs * .18, bx = sp.x + side * cs * .3, by = sp.y + (i - 1.5) * cs * .12;
            cx.moveTo(bx, by); cx.lineTo(bx + side * cs * .35, by - cs * .35 + lift); cx.lineTo(bx + side * cs * (.55 + i * .08), by + cs * .3 + lift);
          }
        cx.stroke();
        cx.shadowBlur = 0; cx.fillStyle = "#ffffff";
        cx.fillRect(sp.x - cs * .17, sp.y - cs * .08, 2.5, 2.5); cx.fillRect(sp.x + cs * .12, sp.y - cs * .08, 2.5, 2.5);
      }
      if (this.flea) this.put(this.art.flea, { a: sc.head, e: "#ffffff" }, this.flea.x, this.flea.y);
      if (this.dying <= 0) this.put(this.art.gnome, { a: sc.gnome, b: "#ff4a4a", e: "#ffffff" }, this.gnome.x, this.gnome.y);
      if (this.shot) {
        beam("#ffffff", 8); cx.lineWidth = 2;
        cx.beginPath(); cx.moveTo(this.shot.x, this.shot.y); cx.lineTo(this.shot.x, this.shot.y + cs * .5); cx.stroke();
      }
      // What the spider was worth.
      cx.font = `${Math.round(cs * .8)}px VT323, monospace`; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.shadowColor = cx.fillStyle = "#ffffff"; cx.shadowBlur = 8;
      for (const p of this.pops) cx.fillText(p.text, p.x, p.y);
      cx.shadowBlur = 0;
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Thrust: a ship going down into a planet for the Klystron pod, and towing it out -----
  // The cavern drops from the surface, past the reactor, in a shaft with limpet guns on its ledges, to a chamber
  // with a fuel tank and the pod on its pedestal. The ship feels gravity and keeps its momentum: it sinks down
  // the shaft, stops to shoot the guns it can see, tops up its fuel with the tow-beam, then locks on to the pod.
  // Ship and pod are two masses on a rigid rod, swinging about their common centre all the way up and out.
  // The guns' slow shots meet the shield. Out of the planet, the next one comes up.
  const thrust = {
    name: "THRUST",
    layout() {
      this.x0 = W < 700 ? 16 : W * .46; this.x1 = W - 16;
      this.planet = this.planet ?? 0;
      this.reset();
    },
    reset() {
      const { x0, x1 } = this, A = x1 - x0, mid = (x0 + x1) / 2;
      const wide = Math.max(170, Math.min(280, A * .5)), narrow = Math.max(132, wide - 80);
      this.D = Math.max(760, H * 1.3);
      const chamberH = 170, end = this.D - chamberH;
      // The shaft walls, top to bottom: jagged, with a shelf now and then where it narrows (a gun sits on
      // each) and an overhang where it opens out again.
      let left = mid - wide / 2, right = mid + wide / 2, y = 0;
      const L = [[left, 0]], R = [[right, 0]], guns = [];
      while (y < end - 60) {
        const h = Math.min(end - y, rand(80, 120));
        L.push([left - rand(0, 16), y + h * .5]); R.push([right + rand(0, 16), y + h * .5]);
        y += h;
        L.push([left, y]); R.push([right, y]);
        const s = rand(45, 70), side = Math.random() < .5 ? -1 : 1;
        if (right - left > narrow + 40) {
          const step = Math.min(s, right - left - narrow);
          if (side < 0) { guns.push({ x: left + step / 2, y: y + 1.5, side: -1 }); left += step; L.push([left, y + 3]); }
          else { guns.push({ x: right - step / 2, y: y + 1.5, side: 1 }); right -= step; R.push([right, y + 3]); }
        } else {
          const canL = left - s > x0 + 8, canR = right + s < x1 - 8;
          if (canL && (side < 0 || !canR)) { left -= s; L.push([left, y + 3]); }
          else if (canR) { right += s; R.push([right, y + 3]); }
        }
      }
      // The chamber at the bottom, with the pod on its pedestal and a fuel tank on the floor.
      const cw = Math.min(A - 16, wide * 1.7), cl = Math.max(x0 + 8, mid - cw / 2), cr = Math.min(x1 - 8, mid + cw / 2);
      L.push([cl, y + 12], [cl - rand(0, 12), (y + this.D) / 2], [cl, this.D]);
      R.push([cr, y + 12], [cr + rand(0, 12), (y + this.D) / 2], [cr, this.D]);
      this.L = L; this.R = R; this.top = y;
      const flip = Math.random() < .5 ? 1 : -1;
      this.pod = { x: mid + flip * cw * .12, y: this.D - 25, vx: 0, vy: 0 };
      this.ped = this.pod.x;
      this.fuel = { x: mid - flip * cw * .3, y: this.D, left: 1 };
      // The surface: hills out to the sides, flat by the hole, for the reactor and a gun.
      const hl = L[0][0], hr = R[0][0];
      this.reactor = { x: Math.min(x1 - 36, hr + Math.min(110, (x1 - hr) * .5)), y: 0 };
      const sg = { x: Math.max(x0 + 14, hl - Math.min(80, (hl - x0) * .5)), y: 0, side: 0 };
      guns.unshift(sg);
      const surf = [];
      for (let x = -10; x < hl; x += 34) surf.push([x, Math.abs(x - sg.x) < 30 || hl - x < 30 ? 0 : -rand(4, 40)]);
      surf.push([hl, 0]);
      this.surfL = surf;
      const sr = [[hr, 0]];
      for (let x = hr + 34; x < W + 44; x += 34) sr.push([x, Math.abs(x - this.reactor.x) < 50 || x - hr < 30 ? 0 : -rand(4, 40)]);
      this.surfR = sr;
      this.guns = guns.map(g => ({ ...g, alive: true, fire: rand(1, 3), a: -Math.PI / 2, skip: false }));
      const c = ["#72ff8f", "#ff4fd8", "#ffb347", "#5ce1ff"][this.planet % 4];
      this.land = c; this.obj = c === "#ffb347" ? "#ff4fd8" : "#ffb347";
      this.ship = { x: mid, y: -H * .25, vx: 0, vy: 20, a: -Math.PI / 2, power: 0, fire: 0, shield: 0, beam: 0, mode: "down", hold: null, lock: 0 };
      this.rod = 0; this.camY = -H * .4; this.shots = []; this.bolts = []; this.sparks = this.sparks ?? []; this.next = 0;
    },
    start() { if (!this.L) this.layout(); },
    // The wall's x at depth y, read off the polyline.
    wallAt(p, y) {
      if (y <= p[0][1]) return p[0][0];
      for (let i = 1; i < p.length; i++) if (p[i][1] >= y) { const [ax, ay] = p[i - 1], [bx, by] = p[i]; return ax + (bx - ax) * (y - ay) / Math.max(.01, by - ay); }
      return p[p.length - 1][0];
    },
    surfAt(x) {
      const p = x < this.L[0][0] ? this.surfL : this.surfR;
      for (let i = 1; i < p.length; i++) if (p[i][0] >= x) { const [ax, ay] = p[i - 1], [bx, by] = p[i]; return ay + (by - ay) * (x - ax) / Math.max(.01, bx - ax); }
      return 0;
    },
    solid(x, y) {
      if (y <= 0) return x > this.L[0][0] && x < this.R[0][0] ? false : y > this.surfAt(x);
      return y > this.D || x < this.wallAt(this.L, y) || x > this.wallAt(this.R, y);
    },
    clear(ax, ay, bx, by) {
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 4);
      for (let i = 1; i < n - 3; i++) if (this.solid(ax + (bx - ax) * i / n, ay + (by - ay) * i / n)) return false;
      return true;
    },
    // A safe x at depth y: the middle of the narrowest gap a little above and below.
    safeX(y) {
      let l = -1e9, r = 1e9;
      for (let k = -80; k <= 80; k += 20) { const yy = Math.max(1, y + k); l = Math.max(l, this.wallAt(this.L, yy)); r = Math.min(r, this.wallAt(this.R, yy)); }
      return y < -20 ? (this.L[0][0] + this.R[0][0]) / 2 : (l + r) / 2;
    },
    keepOut(b, pad) {
      // Pushed back off the rock rather than wrecked: this ship's pilot doesn't crash.
      if (b.y > 0) {
        const l = this.wallAt(this.L, b.y) + pad, r = this.wallAt(this.R, b.y) - pad;
        if (b.x < l) { b.x = l; b.vx = Math.abs(b.vx) * .3; } else if (b.x > r) { b.x = r; b.vx = -Math.abs(b.vx) * .3; }
        if (b.y > this.D - pad) { b.y = this.D - pad; b.vy = Math.min(0, b.vy); }
      }
    },
    step(dt) {
      const s = this.ship, p = this.pod, G = 45, F = 190, M2 = 1.25;
      if (this.next > 0) { this.next -= dt; if (this.next <= 0) { this.planet++; this.reset(); } return; }
      const towing = this.rod > 0, M = towing ? 1 + M2 : 1;
      const cxm = towing ? (s.x + p.x * M2) / M : s.x, cym = towing ? (s.y + p.y * M2) / M : s.y;
      const cvx = towing ? (s.vx + p.vx * M2) / M : s.vx, cvy = towing ? (s.vy + p.vy * M2) / M : s.vy;
      // Where to be: down the shaft, over the tank, over the pod, then back up and away.
      let tx, ty, aimAt = null;
      s.beam = 0;
      if (s.mode === "down") {
        const gun = this.guns.find(g => g.alive && !g.skip && g.y > s.y - 30 && Math.hypot(g.x - s.x, g.y - s.y) < 300 && this.clear(s.x, s.y, g.x, g.y - 6));
        if (gun) {
          const v = Math.max(0, s.vy);
          if (s.hold?.g !== gun) s.hold = { y: s.y + v * v / 80 + v * .3, t: 0, aim: false, g: gun };
          if ((s.hold.t += dt) > 4) { gun.skip = true; s.hold = null; }
          aimAt = s.hold && gun;
        } else s.hold = null;
        if (s.hold) { tx = this.safeX(s.hold.y); ty = s.hold.y; }
        else if (s.y < this.top + 20) { ty = Math.min(s.y + 130, this.top + 60); tx = this.safeX(ty); }
        else { s.mode = this.fuel.left > 0 ? "fuel" : "pod"; }
      }
      if (s.mode === "fuel" || s.mode === "pod") {
        const goal = s.mode === "fuel" ? [this.fuel.x, this.D - 58] : [p.x, p.y - 52];
        tx = goal[0]; ty = Math.min(goal[1], s.y + 80);
        if (Math.hypot(s.x - goal[0], s.y - goal[1]) < 14 && Math.hypot(s.vx, s.vy) < 25) {
          s.beam = 1;
          if (s.mode === "fuel") { this.fuel.left -= dt / 1.4; if (this.fuel.left <= 0) s.mode = "pod"; }
          else if ((s.lock += dt) > 1) { s.lock = 0; this.rod = Math.hypot(p.x - s.x, p.y - s.y); s.mode = "up"; }
        }
      }
      if (s.mode === "up") {
        ty = cym - 150; tx = this.safeX(cym - 60);
        if (cym < -30) tx = s.x;
        // Gently across, so as not to set the pod swinging any more than it must.
        tx = s.tx = (s.tx ?? cxm) + (tx - (s.tx ?? cxm)) * Math.min(1, dt * 1.2);
        if (s.y < this.camY - 40) this.next = 1.5;
      }
      // Steer: the push the ship (or ship and pod together) needs, turned into a heading and a throttle.
      // With the pod on, the ship also leans after it as it swings, which steadies it the way a pilot would.
      const lean = towing ? 2 * (p.vx - s.vx) + .8 * (p.x - s.x) : 0;
      const ax = Math.max(-60, Math.min(60, 1.8 * (tx - cxm) - 2.4 * cvx + lean));
      const ay = Math.max(-60, Math.min(60, 1.8 * (ty - cym) - 2.4 * cvy - (s.mode === "up" ? 30 : 0)));
      const nx = M * ax, ny = M * (ay - G);
      let want = Math.atan2(ny, nx);
      // Turn on the gun and fire while sinking, then nose up and climb back before trying again.
      if (aimAt) {
        const hd = s.hold;
        if (hd.aim && (s.y > hd.y + 45 || s.vy > 70)) hd.aim = false;
        else if (!hd.aim && s.y < hd.y + 12 && Math.abs(s.vy) < 30) hd.aim = true;
      }
      const aiming = aimAt && s.hold.aim;
      if (aiming) want = Math.atan2(aimAt.y - 6 - s.y, aimAt.x - s.x);
      const err = angleTo(s.a, want);
      s.a += Math.max(-4 * dt, Math.min(4 * dt, err));
      s.power = Math.max(0, Math.min(F, nx * Math.cos(s.a) + ny * Math.sin(s.a)));
      s.fire -= dt;
      if (aiming && Math.abs(err) < .06 && s.fire <= 0) {
        s.fire = .3;
        this.shots.push({ x: s.x + Math.cos(s.a) * 12, y: s.y + Math.sin(s.a) * 12, vx: Math.cos(s.a) * 340, vy: Math.sin(s.a) * 340, age: 0 });
      }
      // Two masses on a rigid rod: each moves on its own, then the rod pulls them back to its length,
      // the heavier pod giving less, and takes out whatever speed they had along it.
      const n = 4, h = dt / n;
      for (let k = 0; k < n; k++) {
        s.vx += Math.cos(s.a) * s.power * h; s.vy += (Math.sin(s.a) * s.power + G) * h;
        s.x += s.vx * h; s.y += s.vy * h;
        if (towing) {
          p.vy += G * h; p.x += p.vx * h; p.y += p.vy * h;
          const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
          const wS = 1 / (1 + 1 / M2), wP = 1 - wS, e = d - this.rod;
          s.x += ux * e * wS; s.y += uy * e * wS; p.x -= ux * e * wP; p.y -= uy * e * wP;
          const rel = (p.vx - s.vx) * ux + (p.vy - s.vy) * uy;
          s.vx += ux * rel * wS; s.vy += uy * rel * wS; p.vx -= ux * rel * wP; p.vy -= uy * rel * wP;
          this.keepOut(p, 10);
        }
        this.keepOut(s, 9);
      }
      // The guns turn on the ship and lob slow shots at it, not too carefully.
      s.shield = Math.max(0, s.shield - dt);
      for (const g of this.guns) {
        if (!g.alive) continue;
        const d = Math.hypot(s.x - g.x, s.y - g.y);
        g.a = Math.atan2(s.y - g.y + 6, s.x - g.x);
        if ((g.fire -= dt) <= 0) {
          g.fire = rand(1.8, 3.2);
          if (d < 340 && this.clear(g.x, g.y - 6, s.x, s.y)) {
            const a = g.a + rand(-.2, .2);
            this.bolts.push({ x: g.x + Math.cos(a) * 10, y: g.y - 6 + Math.sin(a) * 10, vx: Math.cos(a) * 75, vy: Math.sin(a) * 75, age: 0 });
          }
        }
      }
      for (const z of this.shots) {
        z.x += z.vx * dt; z.y += z.vy * dt; z.age += dt;
        const hit = this.guns.find(g => g.alive && Math.hypot(g.x - z.x, g.y - 6 - z.y) < 13);
        if (hit) { hit.alive = false; z.dead = true; sparkBurst(this.sparks, hit.x, hit.y - 6, 20, 120, "255,179,71"); }
        else if (z.age > 1.4 || this.solid(z.x, z.y)) z.dead = true;
      }
      this.shots = this.shots.filter(z => !z.dead);
      for (const z of this.bolts) {
        z.x += z.vx * dt; z.y += z.vy * dt; z.age += dt;
        const near = Math.min(Math.hypot(z.x - s.x, z.y - s.y), towing ? Math.hypot(z.x - p.x, z.y - p.y) : 1e9);
        if (near < 34) s.shield = .35;
        if (near < 17 || z.age > 6 || this.solid(z.x, z.y)) z.dead = true;
      }
      this.bolts = this.bolts.filter(z => !z.dead);
      // The camera follows the ship down and up, never above the sky nor below the floor.
      const fy = towing ? cym : s.y, want2 = Math.max(-H * .4, Math.min(this.D + 30 - H, fy - H * .45));
      this.camY += (want2 - this.camY) * Math.min(1, dt * 3);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      const s = this.ship, p = this.pod, cy = this.camY;
      // Stars only in the sky.
      if (-cy > 0) { cx.save(); cx.beginPath(); cx.rect(0, 0, W, -cy); cx.clip(); drawStars(t, 1); cx.restore(); }
      cx.save(); cx.translate(0, -cy);
      // The rock: surface, the shaft's walls and the chamber floor.
      beam(this.land, 10); cx.lineWidth = 1.6;
      cx.beginPath();
      this.surfL.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y));
      for (const q of this.L) cx.lineTo(...q);
      for (let i = this.R.length - 1; i >= 0; i--) cx.lineTo(...this.R[i]);
      for (const q of this.surfR) cx.lineTo(...q);
      cx.stroke();
      // The reactor, with smoke from its chimney.
      const r = this.reactor;
      beam(this.obj, 10); cx.lineWidth = 1.6;
      cx.beginPath();
      cx.moveTo(r.x - 26, r.y); cx.lineTo(r.x - 26, r.y - 18); cx.arc(r.x - 4, r.y - 18, 22, Math.PI, 0); cx.lineTo(r.x + 18, r.y);
      cx.moveTo(r.x + 12, r.y - 18); cx.lineTo(r.x + 12, r.y - 48); cx.lineTo(r.x + 22, r.y - 48); cx.lineTo(r.x + 22, r.y);
      cx.moveTo(r.x - 12, r.y); cx.lineTo(r.x - 12, r.y - 10); cx.lineTo(r.x - 2, r.y - 10); cx.lineTo(r.x - 2, r.y);
      cx.stroke();
      cx.lineWidth = 1.2;
      for (let k = 0; k < 4; k++) {
        const ph = (t * .45 + k / 4) % 1;
        beam(`rgba(200,210,225,${(1 - ph) * .6})`, 6);
        cx.beginPath(); cx.arc(r.x + 17 + ph * 14, r.y - 54 - ph * 40, 3 + ph * 7, 0, Math.PI * 2); cx.stroke();
      }
      // Limpet guns: a squat dome on its ledge, the barrel turned on the ship.
      beam(this.obj, 10); cx.lineWidth = 1.6;
      cx.beginPath();
      for (const g of this.guns) {
        if (!g.alive) continue;
        cx.moveTo(g.x - 10, g.y); cx.lineTo(g.x - 7, g.y - 6); cx.lineTo(g.x + 7, g.y - 6); cx.lineTo(g.x + 10, g.y); cx.closePath();
        cx.moveTo(g.x, g.y - 6); cx.lineTo(g.x + Math.cos(g.a) * 13, g.y - 6 + Math.sin(g.a) * 13);
      }
      cx.stroke();
      // The fuel tank, fading as it's drained.
      const f = this.fuel;
      if (f.left > 0) {
        cx.globalAlpha *= .3 + .7 * f.left;
        beam("#72ff8f", 10); cx.lineWidth = 1.6;
        cx.beginPath();
        cx.moveTo(f.x - 12, f.y); cx.lineTo(f.x - 12, f.y - 22); cx.lineTo(f.x + 12, f.y - 22); cx.lineTo(f.x + 12, f.y);
        cx.moveTo(f.x - 12, f.y - 6); cx.lineTo(f.x + 12, f.y - 6);
        cx.stroke();
        cx.font = "11px VT323, monospace"; cx.textAlign = "center"; cx.textBaseline = "alphabetic";
        cx.fillStyle = "#72ff8f"; cx.fillText("FUEL", f.x, f.y - 9);
        cx.globalAlpha /= .3 + .7 * f.left;
      }
      // The pedestal, and the pod (on it, or on the end of the rod).
      beam("#ffffff", 10); cx.lineWidth = 1.6;
      cx.beginPath();
      const px0 = this.ped;
      cx.moveTo(px0 - 12, this.D); cx.lineTo(px0 - 6, this.D - 16); cx.lineTo(px0 + 6, this.D - 16); cx.lineTo(px0 + 12, this.D);
      cx.moveTo(p.x + 9, p.y); cx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      cx.moveTo(p.x + 4, p.y); cx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      if (this.rod > 0) { cx.moveTo(s.x, s.y); cx.lineTo(p.x, p.y); }
      cx.stroke();
      // The tow-beam: flickering lines down to whatever it's locked on.
      if (s.beam && Math.sin(t * 40) > -.4) {
        const goal = s.mode === "fuel" ? [f.x, f.y - 22] : [p.x, p.y - 9];
        beam("rgba(255,255,255,.75)", 12); cx.lineWidth = 1.2;
        cx.beginPath();
        for (const k of [-1, 1]) { cx.moveTo(s.x + k * 3, s.y + 4); cx.lineTo(goal[0] + k * 10, goal[1]); }
        cx.stroke();
      }
      beam(this.obj, 8); cx.fillStyle = this.obj;
      for (const z of this.bolts) { cx.beginPath(); cx.arc(z.x, z.y, 2.5, 0, Math.PI * 2); cx.fill(); }
      beam("#ffffff", 8); cx.fillStyle = "#ffffff";
      for (const z of this.shots) cx.fillRect(z.x - 1.5, z.y - 1.5, 3, 3);
      // The ship: a triangle with its flame, and the shield round it when a shot gets close.
      const c = Math.cos(s.a), sn = Math.sin(s.a), P = (fw, side) => [s.x + c * fw - sn * side, s.y + sn * fw + c * side];
      beam("#5ce1ff", 12); cx.lineWidth = 1.6;
      cx.beginPath(); cx.moveTo(...P(12, 0)); cx.lineTo(...P(-8, -8)); cx.lineTo(...P(-8, 8)); cx.closePath(); cx.stroke();
      if (s.power > 20 && Math.sin(t * 50) > -.2) {
        beam("#ff4fd8", 12);
        cx.beginPath(); cx.moveTo(...P(-9, -4)); cx.lineTo(...P(-13 - s.power / 190 * 8 - Math.random() * 4, 0)); cx.lineTo(...P(-9, 4)); cx.stroke();
      }
      if (s.shield > 0) {
        beam("rgba(255,255,255,.8)", 14); cx.lineWidth = 1.4;
        cx.beginPath(); cx.arc(s.x, s.y, 17, 0, Math.PI * 2);
        if (this.rod > 0) { cx.moveTo(p.x + 15, p.y); cx.arc(p.x, p.y, 15, 0, Math.PI * 2); }
        cx.stroke();
      }
      drawSparks(this.sparks, still ? 0 : dt);
      cx.restore();
    },
  };

  // ----- Tetris: the well filling up as the pieces come down, and the lines that go -----
  // The pieces come from a shuffled bag of seven. For each one the player tries every turn and every column,
  // drops it in its head and scores what's left (how high the stack stands, the holes under it, how ragged
  // its top is, the lines made), then turns and slides the piece there a step at a time and drops it.
  // Full lines flash and the rows above fall in. Topping out, or a long run of lines, starts a fresh well.
  const tetris = {
    name: "TETRIS",
    // Each piece as cells in its turning box, its box size and its colour: I O T S Z J L.
    pieces: [
      [[[0, 1], [1, 1], [2, 1], [3, 1]], 4, "#5ce1ff"], [[[0, 0], [1, 0], [0, 1], [1, 1]], 2, "#ffe14d"],
      [[[1, 0], [0, 1], [1, 1], [2, 1]], 3, "#ff4fd8"], [[[1, 0], [2, 0], [0, 1], [1, 1]], 3, "#72ff8f"],
      [[[0, 0], [1, 0], [1, 1], [2, 1]], 3, "#ff5a5a"], [[[0, 0], [0, 1], [1, 1], [2, 1]], 3, "#5a7dff"],
      [[[2, 0], [0, 1], [1, 1], [2, 1]], 3, "#ffb347"],
    ],
    layout() {
      // The four turns of every piece, worked out once.
      this.rots = this.pieces.map(([cells, n]) => {
        const out = [cells];
        for (let k = 1; k < 4; k++) out.push(out[k - 1].map(([x, y]) => [n - 1 - y, x]));
        return out;
      });
      const a = arena(16);
      this.s = Math.max(8, Math.floor(Math.min((H - 64) / 20, a.w / 16.5)));
      const s = this.s, span = 16 * s;
      this.ox = a.x0 + Math.max(0, (a.w - span) / 2); this.oy = Math.round((H - 20 * s) / 2);
      this.reset();
    },
    reset() {
      // A few ragged rows of rubble at the bottom to get things going.
      this.board = Array.from({ length: 20 }, () => new Array(10).fill(-1));
      for (let r = 20 - Math.floor(rand(4, 8)); r < 20; r++) {
        const gap = Math.floor(rand(0, 10));
        for (let c = 0; c < 10; c++) if (c !== gap && Math.random() < .82) this.board[r][c] = Math.floor(rand(0, 7));
      }
      this.bag = []; this.lines = 0; this.flash = null; this.over = 0; this.drop = new Array(20).fill(0);
      this.next = this.draw7();
      this.spawn();
      if (still) this.piece.r = 5;
    },
    start() { if (!this.board) this.layout(); },
    draw7() {
      if (!this.bag.length) {
        this.bag = [0, 1, 2, 3, 4, 5, 6];
        for (let i = 6; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; }
      }
      return this.bag.pop();
    },
    fits(board, k, rot, c, r) {
      for (const [x, y] of this.rots[k][rot]) {
        const cc = c + x, rr = r + y;
        if (cc < 0 || cc > 9 || rr > 19 || (rr >= 0 && board[rr][cc] >= 0)) return false;
      }
      return true;
    },
    spawn() {
      const k = this.next;
      this.next = this.draw7();
      this.piece = { k, rot: 0, c: k === 1 ? 4 : 3, r: 0, fall: 0, tick: 0, dropping: false };
      if (!this.fits(this.board, k, 0, this.piece.c, 0)) { this.over = 2.2; return; }
      this.plan();
    },
    // Try every turn and column, and keep the placement that leaves the best-looking stack.
    plan() {
      const p = this.piece, b = this.board;
      let best = null, score = -Infinity;
      for (let rot = 0; rot < 4; rot++) for (let c = -3; c < 10; c++) {
        if (!this.fits(b, p.k, rot, c, p.r)) continue;
        let r = p.r;
        while (this.fits(b, p.k, rot, c, r + 1)) r++;
        const g = b.map(row => row.slice());
        for (const [x, y] of this.rots[p.k][rot]) if (r + y >= 0) g[r + y][c + x] = p.k;
        const kept = g.filter(row => row.some(v => v < 0)), made = 20 - kept.length;
        let agg = 0, holes = 0, bump = 0, prev = -1;
        for (let x = 0; x < 10; x++) {
          let top = 0; while (top < kept.length && kept[top][x] < 0) top++;
          const h = kept.length - top;
          for (let y = top; y < kept.length; y++) if (kept[y][x] < 0) holes++;
          agg += h; if (prev >= 0) bump += Math.abs(h - prev); prev = h;
        }
        const sc = -.51 * agg + .76 * made - .36 * holes - .18 * bump + rand(0, .05);
        if (sc > score) { score = sc; best = { rot, c }; }
      }
      p.goal = best ?? { rot: p.rot, c: p.c };
    },
    lock() {
      const p = this.piece;
      for (const [x, y] of this.rots[p.k][p.rot]) {
        if (p.r + y < 0) { this.over = 2.2; return; }
        this.board[p.r + y][p.c + x] = p.k;
      }
      const full = [];
      this.board.forEach((row, r) => { if (row.every(v => v >= 0)) full.push(r); });
      this.piece = null;
      if (full.length) this.flash = { rows: full, t: .45 };
      else this.spawn();
    },
    collapse() {
      const rows = this.flash.rows;
      // Each row left standing falls by the number of full rows below it, and eases down into place.
      const kept = [], fall = [];
      this.board.forEach((row, r) => { if (!rows.includes(r)) { kept.push(row); fall.push(rows.filter(f => f > r).length); } });
      while (kept.length < 20) { kept.unshift(new Array(10).fill(-1)); fall.unshift(0); }
      this.board = kept; this.drop = fall.map(n => n * this.s);
      this.lines += rows.length; this.flash = null;
      if (this.lines >= 60) { this.over = 1.2; return; }
      this.spawn();
    },
    step(dt) {
      for (let r = 0; r < 20; r++) this.drop[r] = Math.max(0, this.drop[r] - dt * this.s * 18);
      if (this.over > 0) { this.over -= dt; if (this.over <= 0) this.reset(); return; }
      if (this.flash) { if ((this.flash.t -= dt) <= 0) this.collapse(); return; }
      const p = this.piece;
      if (!p) return;
      // Slide and turn toward the plan a step at a time, falling slowly as it goes; once there, drop it.
      if (p.dropping) {
        p.fall += dt;
        while (p.fall >= .022) {
          p.fall -= .022;
          if (this.fits(this.board, p.k, p.rot, p.c, p.r + 1)) p.r++; else { this.lock(); return; }
        }
        return;
      }
      p.tick += dt; p.fall += dt;
      if (p.fall >= .5) {
        p.fall = 0;
        if (this.fits(this.board, p.k, p.rot, p.c, p.r + 1)) p.r++; else { this.lock(); return; }
      }
      if (p.tick < .11) return;
      p.tick = 0;
      const g = p.goal;
      if (p.rot !== g.rot) {
        const rot = (p.rot + 1) % 4;
        if (this.fits(this.board, p.k, rot, p.c, p.r)) p.rot = rot; else p.dropping = true;
      } else if (p.c !== g.c) {
        const c = p.c + Math.sign(g.c - p.c);
        if (this.fits(this.board, p.k, p.rot, c, p.r)) p.c = c; else p.dropping = true;
      } else { p.dropping = true; p.fall = 0; }
    },
    // Outlined squares, one path per colour so the glow is drawn once for each.
    cells(list, x0, y0, s) {
      const by = new Map();
      for (const [c, r, k, off = 0] of list) { if (!by.has(k)) by.set(k, []); by.get(k).push([x0 + c * s, y0 + r * s - off]); }
      const inset = Math.max(1.5, s * .08), inner = s * .32;
      cx.lineWidth = s > 20 ? 1.8 : 1.4;
      for (const [k, sq] of by) {
        beam(k < 0 ? "rgba(150,165,185,.7)" : this.pieces[k][2], 9);
        cx.beginPath();
        for (const [x, y] of sq) {
          cx.rect(x + inset, y + inset, s - inset * 2, s - inset * 2);
          if (s > 14) cx.rect(x + inner, y + inner, s - inner * 2, s - inner * 2);
        }
        cx.stroke();
      }
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      const { s, ox, oy } = this, b = this.board;
      // The well: a faint grid inside, and its walls.
      beam("rgba(30,60,110,.55)", 0); cx.lineWidth = 1;
      cx.beginPath();
      for (let c = 1; c < 10; c++) { cx.moveTo(ox + c * s, oy); cx.lineTo(ox + c * s, oy + 20 * s); }
      for (let r = 1; r < 20; r++) { cx.moveTo(ox, oy + r * s); cx.lineTo(ox + 10 * s, oy + r * s); }
      cx.stroke();
      beam("#5ce1ff", 10); cx.lineWidth = 2;
      cx.beginPath();
      cx.moveTo(ox - 4, oy); cx.lineTo(ox - 4, oy + 20 * s + 4); cx.lineTo(ox + 10 * s + 4, oy + 20 * s + 4); cx.lineTo(ox + 10 * s + 4, oy);
      cx.moveTo(ox - 9, oy); cx.lineTo(ox - 9, oy + 20 * s + 9); cx.lineTo(ox + 10 * s + 9, oy + 20 * s + 9); cx.lineTo(ox + 10 * s + 9, oy);
      cx.stroke();
      // The stack; topping out greys it over from the bottom up.
      const greyFrom = this.over > 0 && this.lines < 60 ? 20 - Math.floor(20 * Math.min(1, (2.2 - this.over) / 1.4)) : 99;
      const flashRows = this.flash?.rows ?? [], lit = this.flash && Math.sin(this.flash.t * 40) > 0;
      const list = [];
      for (let r = 0; r < 20; r++) {
        if (flashRows.includes(r)) continue;
        for (let c = 0; c < 10; c++) if (b[r][c] >= 0 || r >= greyFrom) list.push([c, r, r >= greyFrom ? -1 : b[r][c], this.drop[r]]);
      }
      const p = this.piece;
      if (p) for (const [x, y] of this.rots[p.k][p.rot]) if (p.r + y >= 0) list.push([p.c + x, p.r + y, p.k]);
      this.cells(list, ox, oy, s);
      // Full rows flash white before they go.
      if (flashRows.length && lit) {
        beam("#ffffff", 14); cx.lineWidth = 2;
        cx.beginPath();
        for (const r of flashRows) for (let c = 0; c < 10; c++) cx.rect(ox + c * s + 2, oy + r * s + 2, s - 4, s - 4);
        cx.stroke();
      }
      // The next piece, and the count of lines.
      const nx = ox + 11 * s + 6, ny = oy + s * .6, ps = Math.round(s * .8);
      cx.font = `${Math.max(14, Math.round(s * .7))}px VT323, monospace`; cx.textAlign = "left"; cx.textBaseline = "top";
      cx.shadowColor = "#ffb347"; cx.shadowBlur = 6; cx.fillStyle = "#ffb347";
      cx.fillText("NEXT", nx, oy);
      beam("rgba(92,225,255,.6)", 6); cx.lineWidth = 1.4; cx.strokeRect(nx, ny + 6, ps * 4.6, ps * 3.2);
      const cells = this.rots[this.next][0], w = Math.max(...cells.map(c => c[0])) + 1, h = Math.max(...cells.map(c => c[1])) + 1;
      const miny = Math.min(...cells.map(c => c[1]));
      this.cells(cells.map(([x, y]) => [x, y - miny, this.next]), nx + (ps * 4.6 - w * ps) / 2, ny + 6 + (ps * 3.2 - (h - miny) * ps) / 2, ps);
      cx.shadowColor = "#ffb347"; cx.shadowBlur = 6; cx.fillStyle = "#ffb347";
      cx.fillText("LINES", nx, ny + ps * 3.2 + s);
      cx.fillStyle = "#ffffff"; cx.shadowColor = "#ffffff";
      cx.fillText(String(this.lines).padStart(3, "0"), nx, ny + ps * 3.2 + s * 1.8);
      cx.shadowBlur = 0;
      // An onion dome, for where it all came from.
      const dx = nx + ps * 2.3, dw = ps * 2.2, base = oy + 20 * s + 4;
      if (base - dw * 4.2 > ny + ps * 3.2 + s * 3.2) {
        beam("rgba(255,179,71,.55)", 8); cx.lineWidth = 1.4;
        const top = base - dw * 1.5, neck = top - dw * .15;
        cx.beginPath();
        cx.rect(dx - dw * .42, top, dw * .84, dw * 1.5);
        cx.moveTo(dx - dw * .5, top); cx.lineTo(dx + dw * .5, top);
        cx.moveTo(dx - dw * .3, neck);
        cx.bezierCurveTo(dx - dw * .75, neck - dw * .35, dx - dw * .2, neck - dw * .9, dx, neck - dw * 1.35);
        cx.bezierCurveTo(dx + dw * .2, neck - dw * .9, dx + dw * .75, neck - dw * .35, dx + dw * .3, neck);
        cx.closePath();
        cx.moveTo(dx, neck - dw * 1.35); cx.lineTo(dx, neck - dw * 1.75);
        cx.moveTo(dx - dw * .12, neck - dw * 1.6); cx.lineTo(dx + dw * .12, neck - dw * 1.6);
        cx.moveTo(dx - dw * .14, top + dw * 1.5); cx.lineTo(dx - dw * .14, top + dw * 1.1); cx.arc(dx, top + dw * 1.1, dw * .14, Math.PI, 0); cx.lineTo(dx + dw * .14, top + dw * 1.5);
        for (const k of [-1, 1]) { cx.moveTo(dx + k * dw * .25, top + dw * .35); cx.lineTo(dx + k * dw * .25, top + dw * .7); }
        cx.stroke();
      }
    },
  };

  const scenes = [lander, asteroids, invaders, tempest, battlezone, castle, missiles, wars, pacman, qix, defender, tron, gravitar,
    elite, tailgunner, redbaron, omegarace, blackwidow, majorhavoc, robotron, centipede, thrust, tetris];
  // The scenes come round in a shuffled order: each plays once before any plays again, and the same one never
  // plays twice running, even across a reshuffle.
  let deck = [];
  function deal(after) {
    if (!deck.length) {
      deck = scenes.map((_, i) => i);
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      if (deck[deck.length - 1] === after) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
    }
    return deck.pop();
  }
  let showing = deal(-1), sceneClock = 0, fading = null; // fading: the scene on its way out, and how far

  function layout() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round(W * H / 9000) }, () => [rand(0, W), rand(0, H), rand(.3, 1)]);
    for (const sc of scenes) sc.layout();
    scenes[showing].start();
  }

  function frame(now) {
    const t = (now - t0) / 1000;
    // Seconds since the last frame, so things move at the same speed on 60 Hz and 144 Hz screens.
    // Capped so a long pause (hidden tab, scrolled away) doesn't make them jump.
    const dt = last ? Math.min((now - last) / 1000, .05) : 0;
    last = now;
    cx.clearRect(0, 0, W, H);
    cx.shadowBlur = 0;

    // Every SCENE_SECONDS another scene takes over, the old one fading out as the new one fades in.
    if (!still) {
      sceneClock += dt;
      if (sceneClock > SCENE_SECONDS && !fading) {
        fading = { scene: scenes[showing], k: 0 };
        showing = deal(showing);
        scenes[showing].start();
        sceneClock = 0;
      }
    }
    if (fading) {
      fading.k += dt / FADE;
      cx.globalAlpha = Math.max(0, 1 - fading.k);
      fading.scene.draw(t, dt);
      if (fading.k >= 1) fading = null;
    }
    cx.globalAlpha = fading ? Math.min(1, fading.k) : 1;
    scenes[showing].draw(t, dt);
    cx.globalAlpha = 1;

    // fade the left side so the hero text stays readable
    cx.shadowBlur = 0;
    const g = cx.createLinearGradient(0, 0, W * .75, 0);
    g.addColorStop(0, "rgba(5,8,13,.82)"); g.addColorStop(1, "rgba(5,8,13,0)");
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);

    // The name of what's playing, small in the corner, like a cabinet's marquee.
    if (!still) {
      cx.font = "18px VT323, monospace"; cx.textAlign = "right"; cx.textBaseline = "bottom";
      cx.shadowColor = "#ffb347"; cx.shadowBlur = 6;
      cx.fillStyle = `rgba(255,179,71,${fading ? .35 + .35 * Math.abs(1 - 2 * fading.k) : .7})`;
      cx.fillText(`ATTRACT MODE: ${scenes[showing].name}`, W - 14, H - 8);
      cx.shadowBlur = 0;
    }
  }

  // One animation loop at most: it stops while the hero is off screen and restarts when it's back.
  function loop(now) {
    frame(now);
    if (!still && visible) requestAnimationFrame(loop);
    else { running = false; last = 0; }
  }
  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(loop);
  }

  layout();
  start();
  // Stop drawing while the hero is scrolled out of view.
  new IntersectionObserver(([e]) => {
    const was = visible; visible = e.isIntersecting;
    if (visible && !was) start();
  }).observe(cv);
  let rz;
  addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => { layout(); if (still || !visible) requestAnimationFrame(frame); else start(); }, 150);
  });
})();

// ---------- Copy buttons on the NuGet install lines ----------
(() => {
  for (const btn of document.querySelectorAll("button.copy[data-copy]")) {
    btn.hidden = false;
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = "Copied";
        btn.classList.add("done");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("done"); }, 1600);
      } catch {
        // No clipboard: select the command so it can be copied by hand.
        const code = btn.parentElement.querySelector("code");
        const range = document.createRange();
        range.selectNodeContents(code);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }
    });
  }
})();
