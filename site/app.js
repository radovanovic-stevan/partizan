/* Partizan Stats: single-page app, no dependencies. */
(() => {
  "use strict";

  // ------------------------------------------------------------------ state
  const S = { games: [], players: [], plog: [], byId: {}, byKey: {}, box: {}, meta: {} };
  const COMPS = ["ABA League", "EuroLeague", "EuroCup", "KLS", "Korać Cup", "ABA Supercup"];
  const COMP_VAR = { "ABA League": "--c-aba", EuroLeague: "--c-el", EuroCup: "--c-ec", "ABA Supercup": "--c-sc", KLS: "--c-kls", "Korać Cup": "--c-kup" };
  const COMP_SHORT = { "ABA League": "ABA", EuroLeague: "EL", EuroCup: "EC", "ABA Supercup": "SC", KLS: "KLS", "Korać Cup": "Cup" };
  const STAT = ["pts", "f2m", "f2a", "f3m", "f3a", "ftm", "fta", "or", "dr", "reb", "ast", "stl", "tov", "blk", "blka", "pf", "fd", "pm", "pir"];
  const main = document.getElementById("main");

  // ------------------------------------------------------------------ utils
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const compColor = (c) => `var(${COMP_VAR[c] || "--muted"})`;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDate = (d, short) => {
    const [y, m, day] = d.slice(0, 10).split("-").map(Number);
    return short ? `${MONTHS[m - 1]} ${day}` : `${MONTHS[m - 1]} ${day}, ${y}`;
  };
  const fmt1 = (v) => (v == null || isNaN(v) ? "-" : v.toFixed(1));
  const pct = (m, a) => (a ? ((100 * m) / a).toFixed(1) : "-");
  const fmtMin = (m) => {
    if (!m) return "DNP";
    const s = Math.round(m * 60);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const int = (n) => (n == null ? "-" : Math.round(n).toLocaleString("en-US"));
  const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
  const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
  const opp = (g) => (g.parHome ? g.away : g.home);
  const par = (g) => (g.parHome ? g.home : g.away);
  const margin = (g) => par(g).score - opp(g).score;
  // the sources spell some clubs differently ("Zvezda" / "Crvena zvezda", "Barca" / "Barcelona")
  const OPP_ALIASES = { zvezda: "crvenazvezda", barca: "barcelona" };
  const oppKey = (name) => {
    const k = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/\b(basketball|bc|kk|bk|club)\b/g, "").replace(/[^a-z]/g, "");
    return OPP_ALIASES[k] || k;
  };
  // forfeits count in the record but not in scoring stats, margins or records
  const scored = (games) => games.filter((g) => !g.forfeit);
  const seasonsList = () => [...new Set(S.games.map((g) => g.season))].sort();
  const compsIn = (games) => COMPS.filter((c) => games.some((g) => g.comp === c));
  const wl = (win) => `<span class="wl ${win ? "w" : "l"}" title="${win ? "Win" : "Loss"}">${win ? "W" : "L"}</span>`;
  const logo = (t, cls = "logo") => (t.logo ? `<img class="${cls}" src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="${cls}"></span>`);
  const record = (games) => {
    const w = games.filter((g) => g.win).length;
    return { w, l: games.length - w, n: games.length, pct: games.length ? w / games.length : 0 };
  };
  const avatar = (p, cls = "avatar") =>
    `<div class="${cls}">${p && p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.remove()">` : ""}${p && !p.img ? esc(initials(p.n)) : ""}</div>`;
  const pLink = (k, n) => (S.byKey[k] ? `<a href="#/player/${encodeURIComponent(k)}">${esc(n || S.byKey[k].n)}</a>` : esc(n));

  // per-game player rows -> objects
  function sumRows(rows) {
    const t = { gp: 0, gs: 0, min: 0, w: 0 };
    STAT.forEach((s) => (t[s] = 0));
    for (const r of rows) {
      t.gp++;
      t.gs += r.st;
      t.min += r.min;
      t.w += S.byId[r.g].win ? 1 : 0;
      for (const s of STAT) t[s] += r[s];
    }
    return t;
  }

  // ------------------------------------------------------------------ data
  async function load() {
    const [games, players, plog, meta] = await Promise.all(
      ["games", "players", "plog", "meta"].map((f) => fetch(`data/${f}.json`).then((r) => r.json()))
    );
    S.games = games;
    S.players = players;
    S.meta = meta;
    games.forEach((g) => (S.byId[g.id] = g));
    players.forEach((p) => (S.byKey[p.k] = p));
    const cols = plog.cols;
    S.plog = plog.rows.map((r) => {
      const o = {};
      cols.forEach((c, i) => (o[c] = r[i]));
      return o;
    });
  }
  async function loadBox(id) {
    if (!S.box[id]) S.box[id] = await fetch(`data/box/${encodeURIComponent(id)}.json`).then((r) => r.json());
    return S.box[id];
  }

  // season finish per competition, derived from the games themselves
  function finish(games) {
    if (!games.length) return "";
    const sorted = [...games].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    const ph = last.phase;
    const pg = games.filter((g) => g.phase === ph);
    const r = record(pg);
    if (last.season === S.meta.current) return "In progress";
    if (ph === "Regular Season") return "Regular season";
    if (ph === "Finals" || ph === "Final") return last.win && r.w >= r.l ? "Champions" : "Runner-up";
    return r.w > r.l ? `Reached ${ph}` : `Out in ${ph}`;
  }

  // ------------------------------------------------------------------ tooltip
  const tip = document.createElement("div");
  tip.className = "tip";
  document.body.appendChild(tip);
  function showTip(evt, nodes) {
    tip.replaceChildren(...nodes);
    tip.classList.add("show");
    const pad = 14;
    const r = tip.getBoundingClientRect();
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
    tip.style.left = `${x + scrollX}px`;
    tip.style.top = `${y + scrollY}px`;
  }
  const hideTip = () => tip.classList.remove("show");
  const tnode = (cls, text) => {
    const d = document.createElement("div");
    d.className = cls;
    d.textContent = text;
    return d;
  };

  // ------------------------------------------------------------------ charts
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const niceStep = (max, ticks = 4) => {
    const raw = max / ticks;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
  };
  // rounded-top bar path anchored to a baseline
  function barPath(x, w, y0, y1, r = 3) {
    const up = y1 < y0;
    const h = Math.abs(y1 - y0);
    r = Math.min(r, w / 2, h);
    if (h < 0.5) return "";
    if (up) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
    return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
  }

  /** Columns per game (chronological). value(g) -> number; color(g) -> css color. */
  function columnChart(host, items, { value, color, tipFor, onClick, height = 220, bands = null, yLabel = "" }) {
    host.innerHTML = "";
    host.classList.add("chart");
    const W = Math.max(host.clientWidth || 800, 320), H = height;
    const m = { t: bands ? 26 : 10, r: 8, b: 22, l: 36 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": yLabel });
    host.appendChild(svg);
    const vals = items.map(value);
    let max = Math.max(1, ...vals), min = Math.min(0, ...vals);
    const step = niceStep(Math.max(max, -min) || 1);
    max = Math.ceil(max / step) * step;
    min = Math.floor(min / step) * step;
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const y = (v) => m.t + ih - ((v - min) / (max - min)) * ih;
    const slot = iw / items.length;
    const bw = Math.max(1, Math.min(24, slot - (slot > 4 ? 2 : 1)));
    for (let v = min; v <= max + 1e-9; v += step) {
      el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? "baseline" : "gridline" }, svg);
      const t = el("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end" }, svg);
      t.textContent = v;
    }
    if (bands) {
      bands.forEach((b) => {
        const x0 = m.l + b.from * slot;
        if (b.from > 0) el("line", { x1: x0, x2: x0, y1: m.t - 18, y2: H - m.b, class: "gridline" }, svg);
        const t = el("text", { x: x0 + 4, y: m.t - 10 }, svg);
        t.textContent = b.label;
        t.style.fill = cssVar("--ink-2");
        t.style.fontWeight = 600;
      });
    }
    const g = el("g", {}, svg);
    items.forEach((it, i) => {
      const x = m.l + i * slot + (slot - bw) / 2;
      const p = el("path", { d: barPath(x, bw, y(0), y(vals[i]), bw > 6 ? 4 : 1) }, g);
      p.style.fill = color(it);
    });
    // hover layer: nearest column
    const hl = el("rect", { y: m.t, height: ih, width: Math.max(slot, 2), fill: cssVar("--ink"), opacity: 0 }, svg);
    hl.style.opacity = 0;
    hl.style.fillOpacity = 0.06;
    const hit = el("rect", { x: m.l, y: 0, width: iw, height: H, fill: "transparent" }, svg);
    const idxAt = (evt) => {
      const r = svg.getBoundingClientRect();
      const px = ((evt.clientX - r.left) / r.width) * W;
      return Math.max(0, Math.min(items.length - 1, Math.floor((px - m.l) / slot)));
    };
    hit.addEventListener("pointermove", (evt) => {
      const i = idxAt(evt);
      hl.setAttribute("x", m.l + i * slot);
      hl.style.opacity = 1;
      showTip(evt, tipFor(items[i]));
    });
    hit.addEventListener("pointerleave", () => { hideTip(); hl.style.opacity = 0; });
    if (onClick) {
      hit.style.cursor = "pointer";
      hit.addEventListener("click", (evt) => { hideTip(); onClick(items[idxAt(evt)]); });
    }
  }

  const gameTip = (g) => [
    tnode("tv", `${signed(margin(g))}  ·  ${par(g).score}-${opp(g).score}`),
    tnode("", `${g.win ? "Win" : "Loss"} ${g.parHome ? "vs" : "at"} ${opp(g).name}`),
    tnode("ts", `${g.comp} · ${g.round}`),
    tnode("ts", fmtDate(g.date)),
  ];

  function marginChart(host, games, withBands) {
    let bands = null;
    if (withBands) {
      bands = [];
      games.forEach((g, i) => {
        if (!bands.length || bands[bands.length - 1].label !== g.season) bands.push({ label: g.season, from: i });
      });
    }
    columnChart(host, games, {
      value: margin,
      color: (g) => (g.win ? "var(--pos)" : "var(--neg)"),
      tipFor: gameTip,
      onClick: (g) => (location.hash = `#/game/${g.id}`),
      bands,
      yLabel: "Point margin per game",
    });
  }

  // ------------------------------------------------------------------ sortable table
  function table(host, cols, rows, opts = {}) {
    let sortKey = opts.sort || null, asc = !!opts.asc;
    const render = () => {
      const data = [...rows];
      if (sortKey) {
        const c = cols.find((c) => c.key === sortKey);
        const get = c.sortVal || c.val || ((r) => r[c.key]);
        data.sort((a, b) => {
          const va = get(a), vb = get(b);
          const d = typeof va === "string" ? va.localeCompare(vb) : (va ?? -1e9) - (vb ?? -1e9);
          return asc ? d : -d;
        });
      }
      const head = cols.map((c) => `<th class="${c.num ? "n " : ""}${c.sortable !== false ? "sortable " : ""}${c.key === sortKey ? "sorted " + (asc ? "asc" : "") : ""}${c.cls || ""}" data-k="${c.key}" ${c.title ? `title="${esc(c.title)}"` : ""}>${esc(c.label)}</th>`).join("");
      const body = data.map((r) => `<tr class="${opts.rowCls ? opts.rowCls(r) : ""}" ${opts.href ? `data-href="${esc(opts.href(r))}"` : ""}>${cols.map((c) => `<td class="${c.num ? "n " : ""}${c.cls || ""}">${c.html ? c.html(r) : esc(c.val ? c.val(r) : r[c.key])}</td>`).join("")}</tr>`).join("");
      const foot = opts.foot ? `<tr class="total">${cols.map((c) => `<td class="${c.num ? "n " : ""}${c.cls || ""}">${opts.foot[c.key] ?? ""}</td>`).join("")}</tr>` : "";
      host.innerHTML = `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}${foot}</tbody></table></div>`;
      host.querySelectorAll("th.sortable").forEach((th) =>
        th.addEventListener("click", () => {
          const k = th.dataset.k;
          if (sortKey === k) asc = !asc;
          else { sortKey = k; asc = cols.find((c) => c.key === k).num ? false : true; }
          render();
        })
      );
      host.querySelectorAll("tr[data-href]").forEach((tr) => {
        tr.classList.add("clickable");
        tr.addEventListener("click", (e) => { if (!e.target.closest("a")) location.hash = tr.dataset.href; });
      });
    };
    render();
  }

  // player aggregate columns (per game or totals)
  function statCols(mode, first) {
    const pg = mode === "avg";
    const v = (k) => (r) => (pg ? (r.gp ? r[k] / r.gp : 0) : r[k]);
    const f = (k) => (r) => (pg ? fmt1(v(k)(r)) : int(r[k]));
    const shoot = (m, a) => ({ html: (r) => `${pg ? fmt1(r[m] / r.gp) : r[m]}-${pg ? fmt1(r[a] / r.gp) : r[a]} <span class="muted">${pct(r[m], r[a])}</span>`, sortVal: (r) => (r[a] ? r[m] / r[a] : -1) });
    return [
      ...first,
      { key: "gp", label: "GP", num: true },
      { key: "gs", label: "GS", num: true },
      { key: "min", label: "MIN", num: true, val: (r) => (pg ? fmt1(r.min / r.gp) : int(r.min)), sortVal: v("min") },
      { key: "pts", label: "PTS", num: true, val: f("pts"), sortVal: v("pts"), cls: "strong" },
      { key: "reb", label: "REB", num: true, val: f("reb"), sortVal: v("reb") },
      { key: "ast", label: "AST", num: true, val: f("ast"), sortVal: v("ast") },
      { key: "stl", label: "STL", num: true, val: f("stl"), sortVal: v("stl") },
      { key: "blk", label: "BLK", num: true, val: f("blk"), sortVal: v("blk") },
      { key: "tov", label: "TO", num: true, val: f("tov"), sortVal: v("tov") },
      { key: "fg2", label: "2P", num: true, title: "Two-pointers made-attempted, %", ...shoot("f2m", "f2a") },
      { key: "fg3", label: "3P", num: true, title: "Three-pointers made-attempted, %", ...shoot("f3m", "f3a") },
      { key: "ft", label: "FT", num: true, title: "Free throws made-attempted, %", ...shoot("ftm", "fta") },
      { key: "pm", label: "+/-", num: true, val: (r) => (pg ? fmt1(r.pm / r.gp) : signed(r.pm)), sortVal: v("pm") },
      { key: "pir", label: "PIR", num: true, val: f("pir"), sortVal: v("pir"), title: "Performance index rating" },
    ];
  }

  function aggregateBy(rows, keyFn) {
    const groups = new Map();
    rows.forEach((r) => {
      const k = keyFn(r);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });
    return [...groups].map(([k, rs]) => ({ key: k, ...sumRows(rs) }));
  }

  // ------------------------------------------------------------------ chips
  function chips(host, options, current, onPick) {
    host.innerHTML = options.map((o) => `<button class="chip ${o.value === current ? "on" : ""}" data-v="${esc(o.value)}">${o.dot ? `<span class="dot" style="background:${o.dot}"></span>` : ""}${esc(o.label)}</button>`).join("");
    host.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => onPick(b.dataset.v)));
  }

  // ------------------------------------------------------------------ views
  function gameRow(g) {
    const o = opp(g);
    return `<a class="game-row" href="#/game/${g.id}">
      <div class="date">${fmtDate(g.date, true)}<br>${g.date.slice(0, 4)}</div>
      <div class="opp">${logo(o)}<div style="min-width:0"><div class="opp-name">${g.parHome ? "" : '<span class="muted">@ </span>'}${esc(o.name)}</div>
        <div class="meta"><span class="dot" style="background:${compColor(g.comp)}"></span> ${esc(g.comp)} · ${esc(g.round)}</div></div></div>
      <div class="score">${par(g).score}-${o.score}${g.forfeit ? '<div class="meta">Forfeit</div>' : ""}</div>
      ${wl(g.win)}
    </a>`;
  }

  function gamesList(games, groupByMonth = true) {
    let out = "", lastMonth = "";
    for (const g of games) {
      const mk = g.date.slice(0, 7);
      if (groupByMonth && mk !== lastMonth) {
        const [y, m] = mk.split("-").map(Number);
        out += `<div class="month-head">${MONTHS[m - 1]} ${y}</div>`;
        lastMonth = mk;
      }
      out += gameRow(g);
    }
    return `<div class="card games">${out || '<div class="empty">No games</div>'}</div>`;
  }

  // ---------------- home
  function viewHome() {
    const all = S.games;
    const r = record(all);
    const seasons = seasonsList();
    const pts = all.reduce((s, g) => s + par(g).score, 0);
    const titles = [];
    seasons.forEach((s) => COMPS.forEach((c) => {
      const gs = all.filter((g) => g.season === s && g.comp === c);
      if (finish(gs) === "Champions") titles.push(`${c} ${s}`);
    }));
    const career = aggregateBy(S.plog, (r) => r.k);
    const leaders = (stat, n = 5) => [...career].sort((a, b) => b[stat] - a[stat]).slice(0, n);
    const leadList = (stat, label) => `<div class="card pad"><h3>${label}</h3><ol class="lead-list">${leaders(stat).map((p, i) => `<li><span class="rk">${i + 1}</span><span>${pLink(p.key)}<span class="ctx">${p.gp} games</span></span><span class="val">${int(p[stat])}</span></li>`).join("")}</ol></div>`;

    main.innerHTML = `
      <section class="hero">
        <div class="kicker">KK Partizan Belgrade · ${seasons[0]} to ${seasons[seasons.length - 1]}</div>
        <h1>Partizan<br>Stats</h1>
        <p class="lede">Results, box scores and player stats from the EuroLeague, EuroCup, ABA League, KLS, Korać Cup and ABA Supercup.</p>
        <div class="hero-stats">
          <div class="hero-stat"><div class="v">${r.n}</div><div class="l">Games</div></div>
          <div class="hero-stat"><div class="v">${r.w}-${r.l}</div><div class="l">Record</div></div>
          <div class="hero-stat"><div class="v">${(r.pct * 100).toFixed(1)}%</div><div class="l">Win rate</div></div>
          <div class="hero-stat"><div class="v">${int(pts)}</div><div class="l">Points scored</div></div>
          <div class="hero-stat"><div class="v">${S.players.length}</div><div class="l">Players</div></div>
          ${titles.length ? `<div class="hero-stat"><div class="v">${titles.length}</div><div class="l">Trophies · ${esc(titles.join(", "))}</div></div>` : ""}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Seasons</h2></div>
        <div class="grid g5">${seasons.map(seasonCard).join("")}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Point margin by game</h2><span class="sub">Click a bar to open the game</span></div>
        <div class="card pad">
          <div class="legend"><span><i class="sw" style="background:var(--pos)"></i>Win margin</span><span><i class="sw" style="background:var(--neg)"></i>Loss margin</span></div>
          <div id="margin-all"></div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Leaders</h2><a class="sub" href="#/records">All records</a></div>
        <div class="grid g4">
          ${leadList("pts", "Points")}${leadList("reb", "Rebounds")}${leadList("ast", "Assists")}${leadList("pir", "PIR")}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Latest games</h2><a class="sub" href="#/season/${seasons[seasons.length - 1]}">Full season</a></div>
        ${gamesList([...all].slice(-8).reverse(), false)}
      </section>`;
    marginChart(document.getElementById("margin-all"), scored(all), true);
  }

  function seasonCard(s) {
    const gs = S.games.filter((g) => g.season === s);
    const r = record(gs);
    const lines = compsIn(gs).map((c) => {
      const cg = gs.filter((g) => g.comp === c);
      const cr = record(cg);
      const fin = finish(cg);
      return `<div class="comp-line"><span class="dot" style="background:${compColor(c)}"></span>
        <span class="nm">${esc(c)}<span class="finish">${fin === "Champions" ? "🏆 " : ""}${esc(fin)}</span></span>
        <span class="num">${cr.w}-${cr.l}</span></div>`;
    }).join("");
    return `<a class="card season-card" href="#/season/${s}">
      <div class="yr">${s}</div>
      <div class="rec">${r.w}-${r.l} · ${(r.pct * 100).toFixed(0)}% wins</div>
      <div class="bar-track"><div class="bar-fill" style="width:${r.pct * 100}%;background:var(--ink)"></div></div>
      ${lines}</a>`;
  }

  // ---------------- season
  function viewSeason(season, comp) {
    const seasons = seasonsList();
    if (!seasons.includes(season)) season = seasons[seasons.length - 1];
    const sg = S.games.filter((g) => g.season === season);
    const comps = compsIn(sg);
    if (comp && !comps.includes(comp)) comp = "";
    const games = comp ? sg.filter((g) => g.comp === comp) : sg;
    const r = record(games);
    const home = record(games.filter((g) => g.parHome)), away = record(games.filter((g) => !g.parHome));
    const sg2 = scored(games);
    const ppg = sg2.reduce((s, g) => s + par(g).score, 0) / (sg2.length || 1);
    const oppg = sg2.reduce((s, g) => s + opp(g).score, 0) / (sg2.length || 1);
    const att = games.filter((g) => g.parHome && g.att);
    const avgAtt = att.reduce((s, g) => s + g.att, 0) / (att.length || 1);
    const coaches = [...new Set(games.map((g) => g.coach).filter(Boolean))];

    main.innerHTML = `
      <div class="crumb"><a href="#/">Home</a> / Season</div>
      <div class="section-head" style="margin-bottom:6px"><h2 style="font-size:40px">${season}</h2>
        <span class="sub">${comps.map((c) => `${esc(c)}: <b>${esc(finish(sg.filter((g) => g.comp === c)))}</b>`).join(" · ")}</span></div>
      <div class="filters" id="season-pick"></div>
      <div class="filters" id="comp-pick"></div>
      <div class="grid g4">
        <div class="card tile"><div class="l">Record</div><div class="v">${r.w}-${r.l}</div><div class="d">${(r.pct * 100).toFixed(1)}% wins</div></div>
        <div class="card tile"><div class="l">Home / away</div><div class="v">${home.w}-${home.l} <span class="muted" style="font-weight:400">/</span> ${away.w}-${away.l}</div><div class="d">at home / on the road</div></div>
        <div class="card tile"><div class="l">Points per game</div><div class="v">${fmt1(ppg)}</div><div class="d">${fmt1(oppg)} allowed · ${signed(+(ppg - oppg).toFixed(1))} net</div></div>
        <div class="card tile"><div class="l">Home attendance</div><div class="v">${att.length ? int(avgAtt) : "-"}</div><div class="d">average over ${att.length} home game${att.length === 1 ? "" : "s"}</div></div>
        ${coaches.length ? `<div class="card tile"><div class="l">Head coach</div><div class="v" style="font-size:20px">${esc(coaches.join(", "))}</div></div>` : ""}
        <div class="card tile"><div class="l">Form · last 10</div><div class="v"><div class="form">${games.slice(-10).map((g) => wl(g.win)).join("")}</div></div></div>
      </div>
      <section class="section">
        <div class="section-head"><h2>Game by game</h2><span class="sub">Point margin</span></div>
        <div class="card pad"><div class="legend"><span><i class="sw" style="background:var(--pos)"></i>Win margin</span><span><i class="sw" style="background:var(--neg)"></i>Loss margin</span></div><div id="margin-season"></div></div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Player stats</h2><div class="filters" id="mode-pick" style="margin:0"></div></div>
        <div class="card" id="season-players"></div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Results</h2><span class="sub">${games.length} games</span></div>
        ${gamesList(games)}
      </section>`;

    chips(document.getElementById("season-pick"), seasons.map((s) => ({ value: s, label: s })), season, (v) => (location.hash = `#/season/${v}${comp ? "/" + encodeURIComponent(comp) : ""}`));
    chips(document.getElementById("comp-pick"), [{ value: "", label: "All competitions" }, ...comps.map((c) => ({ value: c, label: c, dot: compColor(c) }))], comp || "", (v) => (location.hash = `#/season/${season}${v ? "/" + encodeURIComponent(v) : ""}`));
    marginChart(document.getElementById("margin-season"), scored(games), false);

    const ids = new Set(games.map((g) => g.id));
    const rows = aggregateBy(S.plog.filter((r) => ids.has(r.g)), (r) => r.k);
    let mode = "avg";
    const renderPlayers = () => {
      chips(document.getElementById("mode-pick"), [{ value: "avg", label: "Per game" }, { value: "tot", label: "Totals" }], mode, (v) => { mode = v; renderPlayers(); });
      table(document.getElementById("season-players"), statCols(mode, [{ key: "name", label: "Player", cls: "sticky-col", html: (r) => pLink(r.key), sortVal: (r) => S.byKey[r.key]?.n || r.key }]), rows, { sort: "pts" });
    };
    renderPlayers();
  }

  // ---------------- game
  async function viewGame(id) {
    const g = S.byId[id];
    if (!g) return notFound();
    main.innerHTML = `<div class="loading">Loading</div>`;
    const box = g.hasBox ? await loadBox(id) : { teams: [], shots: [] };
    const h = g.home, a = g.away;
    const ot = g.q.length > 4;
    const sameSeason = S.games.filter((x) => x.season === g.season && x.comp === g.comp);
    const idx = sameSeason.indexOf(g);
    const prev = sameSeason[idx - 1], next = sameSeason[idx + 1];
    const qHead = g.q.map((_, i) => `<th class="n">${i < 4 ? "Q" + (i + 1) : "OT" + (g.q.length > 5 ? i - 3 : "")}</th>`).join("");
    const qRow = (side, t) => `<tr><td><div class="team-cell">${logo(t)}${esc(t.name)}</div></td>${g.q.map((q) => `<td class="n">${q[side] ?? "-"}</td>`).join("")}<td class="n strong">${t.score}</td></tr>`;
    const h2h = S.games.filter((x) => oppKey(opp(x).name) === oppKey(opp(g).name));
    const h2hR = record(h2h);

    main.innerHTML = `
      <div class="crumb"><a href="#/">Home</a> / <a href="#/season/${g.season}/${encodeURIComponent(g.comp)}">${g.season} ${esc(g.comp)}</a> / ${esc(g.round)}</div>
      <div class="card">
        <div class="scoreboard">
          <div class="sb-team">${logo(h, "logo-lg")}<div class="nm">${esc(h.name)}</div></div>
          <div><div class="sb-score"><span class="${h.score > a.score ? "win" : "lose"}">${h.score}</span><span class="muted"> : </span><span class="${a.score > h.score ? "win" : "lose"}">${a.score}</span></div>
            <div class="sb-meta">${wl(g.win)} &nbsp;${fmtDate(g.date)} · ${g.date.slice(11, 16)}${ot ? " · OT" : ""}</div>
            <div class="sb-meta"><span class="dot" style="background:${compColor(g.comp)}"></span> ${esc(g.comp)} · ${esc(g.round)}</div></div>
          <div class="sb-team">${logo(a, "logo-lg")}<div class="nm">${esc(a.name)}</div></div>
        </div>
      </div>
      <div class="grid g2" style="margin-top:14px">
        <div class="card"><div class="table-wrap"><table><thead><tr><th>Team</th>${qHead}<th class="n">Final</th></tr></thead><tbody>${qRow(0, h)}${qRow(1, a)}</tbody></table></div></div>
        <div class="card pad"><div class="info-grid">
          ${g.venue ? `<div><div class="k">Venue</div>${esc(g.venue)}</div>` : ""}
          ${g.att ? `<div><div class="k">Attendance</div>${int(g.att)}</div>` : ""}
          ${g.refs.length ? `<div><div class="k">Referees</div>${esc(g.refs.join(", "))}</div>` : ""}
          ${g.coach && box.teams.length ? `<div><div class="k">Coaches</div>${esc(box.teams[0].coach)} · ${esc(box.teams[1].coach)}</div>` : ""}
          <div><div class="k">Head to head</div>${h2hR.w}-${h2hR.l} vs ${esc(opp(g).name)}</div>
          <div><div class="k">Source</div><a href="${esc(g.src)}" target="_blank" rel="noopener">Source page ↗</a></div>
        </div></div>
      </div>
      ${box.teams.length ? `<section class="section"><div class="section-head"><h2>Team comparison</h2></div><div class="card pad" id="cmp"></div></section>`
        : `<div class="card pad empty" style="margin-top:14px">${g.forfeit ? "Awarded 20-0 by forfeit. There is no box score." : "No box score is available for this game."}</div>`}
      ${box.teams.map((t, i) => `<section class="section"><div class="section-head"><h2>${esc(t.name)}</h2>${t.coach ? `<span class="sub">Coach: ${esc(t.coach)}</span>` : ""}</div><div class="card" id="box-${i}"></div></section>`).join("")}
      ${box.shots && box.shots.length ? `<section class="section"><div class="section-head"><h2>Shot chart</h2><span class="sub">Filled = made, ring = missed</span></div>
        <div class="card pad"><div class="filters" id="shot-team"></div><div class="filters" id="shot-player"></div><div class="grid g2" style="align-items:center"><div class="court-wrap" id="court"></div><div id="shot-summary"></div></div></div></section>` : ""}
      <div class="filters" style="margin-top:28px;justify-content:space-between">
        ${prev ? `<a class="chip" href="#/game/${prev.id}">Previous: ${esc(opp(prev).name)} · ${fmtDate(prev.date, true)}</a>` : "<span></span>"}
        ${next ? `<a class="chip" href="#/game/${next.id}">Next: ${esc(opp(next).name)} · ${fmtDate(next.date, true)}</a>` : ""}
      </div>`;

    if (!box.teams.length) return;
    // comparison bars
    const T = box.teams.map((t) => t.tot);
    const cmpRows = [
      ["2P%", (t) => (t.f2a ? (100 * t.f2m) / t.f2a : 0), (v) => v.toFixed(1)],
      ["3P%", (t) => (t.f3a ? (100 * t.f3m) / t.f3a : 0), (v) => v.toFixed(1)],
      ["FT%", (t) => (t.fta ? (100 * t.ftm) / t.fta : 0), (v) => v.toFixed(1)],
      ["Rebounds", (t) => t.reb], ["Off. reb", (t) => t.or], ["Assists", (t) => t.ast], ["Steals", (t) => t.stl],
      ["Turnovers", (t) => t.tov], ["Blocks", (t) => t.blk], ["Fouls", (t) => t.pf], ["PIR", (t) => t.pir],
    ];
    if (T[0].pPaint != null) cmpRows.push(["Paint pts", (t) => t.pPaint ?? 0], ["2nd chance", (t) => t.p2nd ?? 0], ["Fast break", (t) => t.pFb ?? 0]);
    const colA = box.teams[0].par ? "var(--ink)" : "var(--muted)", colB = box.teams[1].par ? "var(--ink)" : "var(--muted)";
    document.getElementById("cmp").innerHTML =
      `<div class="cmp" style="padding-bottom:10px"><span class="v">${esc(COMP_SHORT[g.comp] && h.code === "PAR" ? "PAR" : h.name.slice(0, 3).toUpperCase())}</span><span></span><span></span><span></span><span class="v r">${esc(a.code === "PAR" ? "PAR" : a.name.slice(0, 3).toUpperCase())}</span></div>` +
      cmpRows.filter(([, f]) => f(T[0]) != null && f(T[1]) != null).map(([lbl, f, fm]) => {
        const va = f(T[0]), vb = f(T[1]), mx = Math.max(va, vb, 1e-9);
        const show = fm || ((v) => v);
        return `<div class="cmp"><span class="v">${show(va)}</span><div class="track l"><div class="fill" style="width:${(100 * va) / mx}%;background:${colA}"></div></div><span class="lbl">${lbl}</span><div class="track"><div class="fill" style="width:${(100 * vb) / mx}%;background:${colB}"></div></div><span class="v r">${show(vb)}</span></div>`;
      }).join("");

    // box scores
    box.teams.forEach((t, i) => {
      const cols = [
        { key: "no", label: "#", sortVal: (r) => +r.no || 0 },
        { key: "n", label: "Player", cls: "sticky-col", html: (r) => `${r.st ? "<b>" : ""}${t.par && r.k ? pLink(r.k, r.n) : esc(r.n)}${r.st ? "</b>" : ""}`, sortVal: (r) => r.n },
        { key: "min", label: "MIN", num: true, val: (r) => fmtMin(r.min) },
        { key: "pts", label: "PTS", num: true, cls: "strong" },
        { key: "f2", label: "2P", num: true, val: (r) => `${r.f2m}/${r.f2a}`, sortVal: (r) => r.f2m },
        { key: "f3", label: "3P", num: true, val: (r) => `${r.f3m}/${r.f3a}`, sortVal: (r) => r.f3m },
        { key: "ft", label: "FT", num: true, val: (r) => `${r.ftm}/${r.fta}`, sortVal: (r) => r.ftm },
        { key: "or", label: "OR", num: true }, { key: "dr", label: "DR", num: true }, { key: "reb", label: "REB", num: true },
        { key: "ast", label: "AST", num: true }, { key: "stl", label: "STL", num: true }, { key: "tov", label: "TO", num: true },
        { key: "blk", label: "BLK", num: true }, { key: "pf", label: "PF", num: true }, { key: "fd", label: "FD", num: true },
        { key: "pm", label: "+/-", num: true, val: (r) => (r.dnp || r.pm == null ? "" : signed(r.pm)) },
        { key: "pir", label: "PIR", num: true },
      ];
      const tt = t.tot;
      const foot = { n: "Team", pts: tt.pts, f2: `${tt.f2m}/${tt.f2a}`, f3: `${tt.f3m}/${tt.f3a}`, ft: `${tt.ftm}/${tt.fta}`, or: tt.or, dr: tt.dr, reb: tt.reb, ast: tt.ast, stl: tt.stl, tov: tt.tov, blk: tt.blk, pf: tt.pf, fd: tt.fd, pir: tt.pir };
      table(document.getElementById(`box-${i}`), cols, t.players, { rowCls: (r) => (r.dnp ? "dnp" : ""), foot });
    });

    if (box.shots && box.shots.length) shotChart(g, box);
  }

  function shotChart(g, box) {
    let side = box.teams.findIndex((t) => t.par);
    if (side < 0) side = 0;
    let player = "";
    const names = {};
    box.teams.forEach((t) => t.players.forEach((p) => { if (p.pid) names[p.pid] = p.n; }));
    const render = () => {
      chips(document.getElementById("shot-team"), box.teams.map((t, i) => ({ value: String(i), label: t.name })), String(side), (v) => { side = +v; player = ""; render(); });
      const shots = box.shots.filter((s) => s[0] === side);
      const shooters = [...new Set(shots.map((s) => s[1]))].sort((x, y) => (names[x] || "").localeCompare(names[y] || ""));
      chips(document.getElementById("shot-player"), [{ value: "", label: "All players" }, ...shooters.map((p) => ({ value: p, label: names[p] || p }))], player, (v) => { player = v; render(); });
      const sel = shots.filter((s) => !player || s[1] === player);
      drawCourt(document.getElementById("court"), sel, names);
      const m2 = sel.filter((s) => s[5] === 2), m3 = sel.filter((s) => s[5] === 3);
      const made = (a) => a.filter((s) => s[4]).length;
      const zone = (f) => { const a = sel.filter(f); return `${made(a)}/${a.length} <span class="muted">${pct(made(a), a.length)}%</span>`; };
      const dist = (s) => Math.hypot(s[2], s[3]);
      document.getElementById("shot-summary").innerHTML = `<table><tbody>
        <tr><td>All field goals</td><td class="n">${zone(() => true)}</td></tr>
        <tr><td>Two-pointers</td><td class="n">${made(m2)}/${m2.length} <span class="muted">${pct(made(m2), m2.length)}%</span></td></tr>
        <tr><td>&nbsp;&nbsp;Restricted area (&lt;1.25 m)</td><td class="n">${zone((s) => s[5] === 2 && dist(s) < 125)}</td></tr>
        <tr><td>&nbsp;&nbsp;Mid-range</td><td class="n">${zone((s) => s[5] === 2 && dist(s) >= 125)}</td></tr>
        <tr><td>Three-pointers</td><td class="n">${made(m3)}/${m3.length} <span class="muted">${pct(made(m3), m3.length)}%</span></td></tr>
      </tbody></table>`;
    };
    render();
  }

  // EuroLeague coordinates: centimetres, basket at (0,0), baseline ~ y=-157
  function drawCourt(host, shots, names) {
    host.innerHTML = "";
    host.classList.add("chart");
    const svg = el("svg", { viewBox: "-760 -170 1520 1100", class: "court", role: "img", "aria-label": "Shot chart" });
    host.appendChild(svg);
    el("rect", { x: -750, y: -157, width: 1500, height: 1080 }, svg);
    el("rect", { x: -245, y: -157, width: 490, height: 580 }, svg);
    el("circle", { cx: 0, cy: 423, r: 180, class: "c" }, svg);
    el("path", { d: "M-125,0 A125,125 0 0 0 125,0" , transform: "scale(1,-1)" }, svg);
    el("circle", { cx: 0, cy: 0, r: 23, class: "c" }, svg);
    el("line", { x1: -90, x2: 90, y1: -37, y2: -37 }, svg);
    const yc = Math.sqrt(675 * 675 - 660 * 660);
    el("path", { d: `M-660,-157 V${yc} A675,675 0 0 0 660,${yc} V-157`, transform: "" }, svg);
    const flip = (y) => y; // basket at top: y grows toward half court
    for (const s of shots) {
      const [, pid, x, y, made, val, minute] = s;
      const g = el("g", {}, svg);
      g.style.cursor = "default";
      if (made) el("circle", { cx: x, cy: flip(y), r: 26, class: "shot-made" }, g);
      else el("circle", { cx: x, cy: flip(y), r: 20, class: "shot-miss" }, g);
      const hit = el("circle", { cx: x, cy: flip(y), r: 40, fill: "transparent" }, g);
      hit.addEventListener("pointermove", (evt) => showTip(evt, [tnode("tv", `${made ? "Made" : "Missed"} ${val}PT`), tnode("", names[pid] || ""), tnode("ts", `Minute ${minute} · ${(Math.hypot(x, y) / 100).toFixed(1)} m`)]));
      hit.addEventListener("pointerleave", hideTip);
    }
    if (!shots.length) { const t = el("text", { x: 0, y: 600, "text-anchor": "middle" }, svg); t.textContent = "No shots"; t.style.fontSize = "60px"; }
  }

  // ---------------- players index
  function viewPlayers() {
    const seasons = seasonsList();
    const SORTS = [
      { value: "gp", label: "Games", show: (t) => `${t.gp} GP` },
      { value: "pts", label: "Points", show: (t) => `${fmt1(t.pts / t.gp)} PPG` },
      { value: "reb", label: "Rebounds", show: (t) => `${fmt1(t.reb / t.gp)} RPG` },
      { value: "ast", label: "Assists", show: (t) => `${fmt1(t.ast / t.gp)} APG` },
      { value: "stl", label: "Steals", show: (t) => `${fmt1(t.stl / t.gp)} SPG` },
      { value: "blk", label: "Blocks", show: (t) => `${fmt1(t.blk / t.gp)} BPG` },
      { value: "f3m", label: "Threes", show: (t) => `${fmt1(t.f3m / t.gp)} 3PM` },
      { value: "pir", label: "PIR", show: (t) => `${fmt1(t.pir / t.gp)} PIR` },
      { value: "min", label: "Minutes", show: (t) => `${fmt1(t.min / t.gp)} MIN` },
      { value: "name", label: "Name" },
    ];
    let season = "", q = "", sort = "gp";
    main.innerHTML = `
      <div class="section-head"><h2 style="font-size:40px">Players</h2><span class="sub">${S.players.length} players</span></div>
      <div class="filters"><input class="search" id="pq" placeholder="Search players" aria-label="Search players"><span class="sep"></span><span id="ps"></span></div>
      <div class="filters"><span class="sub">Sort by</span><span id="psort"></span></div>
      <div class="grid g5" id="plist"></div>`;
    const render = () => {
      chips(document.getElementById("ps"), [{ value: "", label: "All seasons" }, ...seasons.map((s) => ({ value: s, label: s }))], season, (v) => { season = v; render(); });
      chips(document.getElementById("psort"), SORTS.map(({ value, label }) => ({ value, label: value === "gp" || value === "name" ? label : `${label} per game` })), sort, (v) => { sort = v; render(); });
      const fq = q.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const list = S.players
        .filter((p) => (!season || p.lines.some((l) => l.season === season)) &&
          (!fq || p.n.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(fq)))
        .map((p) => {
          const t = { gp: 0 };
          (season ? p.lines.filter((l) => l.season === season) : p.lines).forEach((l) => {
            for (const k in l) if (typeof l[k] === "number") t[k] = (t[k] || 0) + l[k];
          });
          return { p, t };
        });
      if (sort === "name") list.sort((a, b) => a.p.n.localeCompare(b.p.n));
      else if (sort === "gp") list.sort((a, b) => b.t.gp - a.t.gp);
      else list.sort((a, b) => (b.t[sort] || 0) / b.t.gp - (a.t[sort] || 0) / a.t.gp || b.t.gp - a.t.gp);
      const extra = SORTS.find((x) => x.value === sort && x.show && x.value !== "gp" && x.value !== "pts");
      document.getElementById("plist").innerHTML = list.map(({ p, t }) => {
        const ss = [...new Set(p.lines.map((l) => l.season))];
        return `<a class="card player-card" href="#/player/${encodeURIComponent(p.k)}">${avatar(p)}<div><div class="pn">${esc(p.n)}</div>
          <div class="ps">${ss.length > 1 ? `${ss[0]} to ${ss[ss.length - 1]}` : ss[0]}${p.pos ? " · " + esc(p.pos) : ""}</div>
          <div class="ps">${t.gp} GP · ${fmt1(t.pts / (t.gp || 1))} PPG${extra ? " · " + extra.show(t) : ""}</div></div></a>`;
      }).join("") || '<div class="empty">No players match</div>';
    };
    document.getElementById("pq").addEventListener("input", (e) => { q = e.target.value; render(); });
    render();
  }

  // ---------------- player
  function viewPlayer(key) {
    const p = S.byKey[key];
    if (!p) return notFound();
    const rows = S.plog.filter((r) => r.k === key).sort((a, b) => S.byId[a.g].date.localeCompare(S.byId[b.g].date));
    const tot = sumRows(rows);
    const age = p.born ? Math.floor((Date.now() - new Date(p.born)) / 3.15576e10) : null;
    const highs = ["pts", "reb", "ast", "pir", "f3m", "stl"].map((s) => {
      const best = [...rows].sort((a, b) => b[s] - a[s])[0];
      return { s, best };
    });
    const HL = { pts: "Points", reb: "Rebounds", ast: "Assists", pir: "PIR", f3m: "Threes made", stl: "Steals" };

    main.innerHTML = `
      <div class="crumb"><a href="#/players">Players</a> / ${esc(p.n)}</div>
      <div class="player-head">${avatar(p, "avatar lg")}
        <div><h1>${esc(p.n)}</h1>
          <div class="bio">
            ${p.pos ? `<span>Position <b>${esc(p.pos)}</b></span>` : ""}
            ${p.height ? `<span>Height <b>${p.height} cm</b></span>` : ""}
            ${p.born ? `<span>Born <b>${fmtDate(p.born)}</b>${age ? ` (${age})` : ""}</span>` : ""}
            ${p.birthplace ? `<span>From <b>${esc(p.birthplace)}</b></span>` : ""}
            ${p.nat ? `<span>Nationality <b>${esc(p.nat)}</b></span>` : ""}
          </div></div></div>
      <div class="grid g4" style="margin-top:22px">
        <div class="card tile"><div class="l">Games</div><div class="v">${tot.gp}</div><div class="d">${tot.gs} starts · ${tot.w}-${tot.gp - tot.w} record</div></div>
        <div class="card tile"><div class="l">Points</div><div class="v">${fmt1(tot.pts / tot.gp)}</div><div class="d">per game · ${int(tot.pts)} total</div></div>
        <div class="card tile"><div class="l">Rebounds · assists</div><div class="v">${fmt1(tot.reb / tot.gp)} · ${fmt1(tot.ast / tot.gp)}</div><div class="d">per game</div></div>
        <div class="card tile"><div class="l">Shooting</div><div class="v">${pct(tot.f3m, tot.f3a)}%</div><div class="d">3P · ${pct(tot.f2m, tot.f2a)}% 2P · ${pct(tot.ftm, tot.fta)}% FT</div></div>
        <div class="card tile"><div class="l">PIR</div><div class="v">${fmt1(tot.pir / tot.gp)}</div><div class="d">per game · ${fmt1(tot.min / tot.gp)} min</div></div>
      </div>
      <section class="section"><div class="section-head"><h2>Season by season</h2><div class="filters" id="pmode" style="margin:0"></div></div><div class="card" id="plines"></div></section>
      <section class="section"><div class="section-head"><h2>Points per game</h2><span class="sub">${rows.length} games</span></div>
        <div class="card pad"><div class="legend">${compsIn(rows.map((r) => S.byId[r.g])).map((c) => `<span><i class="sw" style="background:${compColor(c)}"></i>${esc(c)}</span>`).join("")}</div><div id="ppts"></div></div></section>
      <section class="section"><div class="section-head"><h2>Career highs</h2></div>
        <div class="grid g4">${highs.filter((h) => h.best).map(({ s, best }) => { const bg = S.byId[best.g]; return `<a class="card tile" href="#/game/${bg.id}"><div class="l">${HL[s]}</div><div class="v">${best[s]}</div><div class="d">${bg.parHome ? "vs" : "at"} ${esc(opp(bg).name)} · ${fmtDate(bg.date)}</div></a>`; }).join("")}</div></section>
      <section class="section"><div class="section-head"><h2>Game log</h2></div><div class="card" id="plog"></div></section>`;

    let mode = "avg";
    const lines = aggregateBy(rows, (r) => `${S.byId[r.g].season}|${S.byId[r.g].comp}`);
    const renderLines = () => {
      chips(document.getElementById("pmode"), [{ value: "avg", label: "Per game" }, { value: "tot", label: "Totals" }], mode, (v) => { mode = v; renderLines(); });
      table(document.getElementById("plines"), statCols(mode, [
        { key: "season", label: "Season", val: (r) => r.key.split("|")[0], sortVal: (r) => r.key },
        { key: "comp", label: "Competition", html: (r) => `<span class="dot" style="background:${compColor(r.key.split("|")[1])}"></span> ${esc(r.key.split("|")[1])}`, sortVal: (r) => r.key.split("|")[1] },
      ]), lines, { sort: "season", asc: true });
    };
    renderLines();
    columnChart(document.getElementById("ppts"), rows, {
      value: (r) => r.pts,
      color: (r) => compColor(S.byId[r.g].comp),
      tipFor: (r) => { const g = S.byId[r.g]; return [tnode("tv", `${r.pts} pts`), tnode("", `${r.reb} reb · ${r.ast} ast · ${r.pir} PIR`), tnode("ts", `${g.win ? "W" : "L"} ${par(g).score}-${opp(g).score} ${g.parHome ? "vs" : "at"} ${opp(g).name}`), tnode("ts", `${g.comp} · ${fmtDate(g.date)}`)]; },
      onClick: (r) => (location.hash = `#/game/${r.g}`),
      yLabel: "Points per game",
    });
    table(document.getElementById("plog"), [
      { key: "date", label: "Date", val: (r) => fmtDate(S.byId[r.g].date), sortVal: (r) => S.byId[r.g].date },
      { key: "opp", label: "Opponent", html: (r) => { const g = S.byId[r.g]; return `<div class="team-cell">${logo(opp(g))}${g.parHome ? "" : "@ "}${esc(opp(g).name)}</div>`; }, sortVal: (r) => opp(S.byId[r.g]).name },
      { key: "comp", label: "Comp", html: (r) => `<span class="dot" style="background:${compColor(S.byId[r.g].comp)}"></span> ${COMP_SHORT[S.byId[r.g].comp]}`, sortVal: (r) => S.byId[r.g].comp },
      { key: "res", label: "Result", html: (r) => { const g = S.byId[r.g]; return `${wl(g.win)} ${par(g).score}-${opp(g).score}`; }, sortVal: (r) => margin(S.byId[r.g]) },
      { key: "min", label: "MIN", num: true, val: (r) => fmtMin(r.min) },
      { key: "pts", label: "PTS", num: true, cls: "strong" },
      { key: "f2", label: "2P", num: true, val: (r) => `${r.f2m}/${r.f2a}`, sortVal: (r) => r.f2m },
      { key: "f3", label: "3P", num: true, val: (r) => `${r.f3m}/${r.f3a}`, sortVal: (r) => r.f3m },
      { key: "ft", label: "FT", num: true, val: (r) => `${r.ftm}/${r.fta}`, sortVal: (r) => r.ftm },
      { key: "reb", label: "REB", num: true }, { key: "ast", label: "AST", num: true }, { key: "stl", label: "STL", num: true },
      { key: "tov", label: "TO", num: true }, { key: "blk", label: "BLK", num: true },
      { key: "pm", label: "+/-", num: true, val: (r) => signed(r.pm) }, { key: "pir", label: "PIR", num: true },
    ], [...rows].reverse(), { href: (r) => `#/game/${r.g}` });
  }

  // ---------------- records
  function viewRecords() {
    const seasons = seasonsList();
    let comp = "", season = "";
    main.innerHTML = `
      <div class="section-head"><h2 style="font-size:40px">Records</h2></div>
      <div class="filters" id="rc"></div><div class="filters" id="rs"></div>
      <div id="rbody"></div>`;
    const render = () => {
      chips(document.getElementById("rc"), [{ value: "", label: "All competitions" }, ...compsIn(S.games).map((c) => ({ value: c, label: c, dot: compColor(c) }))], comp, (v) => { comp = v; render(); });
      chips(document.getElementById("rs"), [{ value: "", label: "All seasons" }, ...seasons.map((s) => ({ value: s, label: s }))], season, (v) => { season = v; render(); });
      const games = S.games.filter((g) => (!comp || g.comp === comp) && (!season || g.season === season));
      const ids = new Set(games.map((g) => g.id));
      const rows = S.plog.filter((r) => ids.has(r.g));
      const career = aggregateBy(rows, (r) => r.k);
      const ctx = (g) => `${g.parHome ? "vs" : "at"} ${esc(opp(g).name)} · ${fmtDate(g.date)}`;
      const single = (stat, label) => `<div class="card pad"><h3>${label}</h3><ol class="lead-list">${[...rows].sort((a, b) => b[stat] - a[stat] || b.pir - a.pir).slice(0, 8).map((r, i) => `<li><span class="rk">${i + 1}</span><span>${pLink(r.k)}<a class="ctx" href="#/game/${r.g}">${ctx(S.byId[r.g])}</a></span><span class="val">${r[stat]}</span></li>`).join("")}</ol></div>`;
      const careerList = (stat, label, per) => `<div class="card pad"><h3>${label}</h3><ol class="lead-list">${[...career].filter((p) => !per || p.gp >= 15).sort((a, b) => (per ? b[stat] / b.gp - a[stat] / a.gp : b[stat] - a[stat])).slice(0, 8).map((p, i) => `<li><span class="rk">${i + 1}</span><span>${pLink(p.key)}<span class="ctx">${p.gp} games</span></span><span class="val">${per ? fmt1(p[stat] / p.gp) : int(p[stat])}</span></li>`).join("")}</ol></div>`;
      const teamList = (label, sorted, val) => `<div class="card pad"><h3>${label}</h3><ol class="lead-list">${sorted.slice(0, 8).map((g, i) => `<li><span class="rk">${i + 1}</span><span><a href="#/game/${g.id}">${g.parHome ? "vs" : "at"} ${esc(opp(g).name)}</a><span class="ctx">${esc(g.comp)} · ${fmtDate(g.date)}</span></span><span class="val">${val(g)}</span></li>`).join("")}</ol></div>`;
      const score = (g) => `${par(g).score}-${opp(g).score}`;
      document.getElementById("rbody").innerHTML = `
        <section class="section"><div class="section-head"><h2>Single-game highs</h2></div>
          <div class="grid g4">${single("pts", "Points")}${single("reb", "Rebounds")}${single("ast", "Assists")}${single("pir", "PIR")}${single("f3m", "Threes made")}${single("stl", "Steals")}${single("blk", "Blocks")}${single("fd", "Fouls drawn")}</div></section>
        <section class="section"><div class="section-head"><h2>Totals</h2></div>
          <div class="grid g4">${careerList("gp", "Games played")}${careerList("pts", "Points")}${careerList("reb", "Rebounds")}${careerList("ast", "Assists")}${careerList("f3m", "Threes made")}${careerList("stl", "Steals")}${careerList("blk", "Blocks")}${careerList("pir", "PIR")}</div></section>
        <section class="section"><div class="section-head"><h2>Per game</h2><span class="sub">Minimum 15 games</span></div>
          <div class="grid g4">${careerList("pts", "Points", 1)}${careerList("reb", "Rebounds", 1)}${careerList("ast", "Assists", 1)}${careerList("pir", "PIR", 1)}</div></section>
        <section class="section"><div class="section-head"><h2>Team</h2></div>
          <div class="grid g4">
            ${teamList("Biggest wins", scored(games).sort((a, b) => margin(b) - margin(a)), (g) => signed(margin(g)))}
            ${teamList("Heaviest losses", scored(games).sort((a, b) => margin(a) - margin(b)), (g) => signed(margin(g)))}
            ${teamList("Most points scored", scored(games).sort((a, b) => par(b).score - par(a).score), score)}
            ${teamList("Biggest crowds", [...games].filter((g) => g.att).sort((a, b) => b.att - a.att), (g) => int(g.att))}
          </div></section>`;
    };
    render();
  }

  // ---------------- opponents
  function viewOpponents() {
    const map = new Map();
    for (const g of S.games) {
      const o = opp(g), k = oppKey(o.name);
      if (!map.has(k)) map.set(k, { key: k, name: o.name, logo: o.logo, games: [] });
      const e = map.get(k);
      e.games.push(g);
      if (o.logo) e.logo = o.logo;
      e.name = o.name;
    }
    const rows = [...map.values()].map((e) => {
      const r = record(e.games);
      const last = e.games[e.games.length - 1];
      return { ...e, n: r.n, w: r.w, l: r.l, pct: r.pct, diff: scored(e.games).reduce((s, g) => s + margin(g), 0) / (scored(e.games).length || 1),
        comps: compsIn(e.games), last };
    });
    main.innerHTML = `
      <div class="section-head"><h2 style="font-size:40px">Opponents</h2><span class="sub">${rows.length} clubs</span></div>
      <div class="card" id="otab"></div>
      <section class="section" id="odetail"></section>`;
    table(document.getElementById("otab"), [
      { key: "name", label: "Opponent", cls: "sticky-col", html: (r) => `<div class="team-cell">${logo(r)}${esc(r.name)}</div>`, sortVal: (r) => r.name },
      { key: "comps", label: "Competitions", html: (r) => r.comps.map((c) => `<span class="dot" style="background:${compColor(c)}" title="${esc(c)}"></span>`).join(" "), sortable: false },
      { key: "n", label: "GP", num: true },
      { key: "w", label: "W", num: true }, { key: "l", label: "L", num: true },
      { key: "pct", label: "Win %", num: true, val: (r) => (r.pct * 100).toFixed(0) },
      { key: "diff", label: "Avg margin", num: true, val: (r) => signed(+r.diff.toFixed(1)) },
      { key: "last", label: "Last meeting", html: (r) => `${wl(r.last.win)} ${par(r.last).score}-${opp(r.last).score} <span class="muted">${fmtDate(r.last.date)}</span>`, sortVal: (r) => r.last.date },
    ], rows, { sort: "n", href: (r) => `#/opponents/${r.key}` });
    const sel = location.hash.split("/")[2];
    if (sel && map.has(sel)) {
      const e = map.get(sel);
      const r = record(e.games);
      const d = document.getElementById("odetail");
      d.innerHTML = `<div class="section-head"><h2>vs ${esc(e.name)}</h2><span class="sub">${r.w}-${r.l}</span></div>${gamesList([...e.games].reverse(), false)}`;
      d.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function notFound() {
    main.innerHTML = `<div class="empty">Not found. <a href="#/">Back home</a></div>`;
  }

  // ------------------------------------------------------------------ router
  function route() {
    hideTip();
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const [view, a, b] = parts;
    document.querySelectorAll(".nav a").forEach((n) => n.classList.toggle("on", n.dataset.v === (view || "home")));
    if (view !== "opponents" || !a) window.scrollTo(0, 0);
    switch (view) {
      case "season": return viewSeason(a, b);
      case "game": return viewGame(a);
      case "players": return viewPlayers();
      case "player": return viewPlayer(a);
      case "records": return viewRecords();
      case "opponents": return viewOpponents();
      default: return viewHome();
    }
  }

  // theme toggle (per-viewer convenience only)
  // burger menu (shown on narrow screens only)
  const nav = document.getElementById("nav"), menuBtn = document.getElementById("menu");
  const setMenu = (open) => {
    nav.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  menuBtn.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".top")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  const btn = document.getElementById("theme");
  const applyTheme = (t) => {
    if (t) document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  };
  try { applyTheme(localStorage.getItem("theme")); } catch (e) { /* storage unavailable */ }
  btn.addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const t = dark ? "light" : "dark";
    applyTheme(t);
    try { localStorage.setItem("theme", t); } catch (e) { /* ignore */ }
    route();
  });

  addEventListener("hashchange", route);
  load().then(() => {
    document.getElementById("built").textContent = S.meta.built || "";
    route();
  }).catch((e) => {
    main.innerHTML = `<div class="empty">Could not load data (${esc(e.message)}).</div>`;
  });
})();
