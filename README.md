# Partizan · five seasons

Every official BC Partizan game from **2021-22 to 2025-26**, archived once and presented as a static site
for GitHub Pages: results, full box scores for both teams, EuroLeague shot charts, player bios and
per-season stats, records and head-to-head records against every opponent.

| Competition   | Seasons            | Source |
|---------------|--------------------|--------|
| EuroLeague    | 2022-23 – 2025-26  | `api-live.euroleague.net`, `live.euroleague.net/api` (box score, header, shot locations) |
| EuroCup       | 2021-22            | same API as EuroLeague |
| ABA League    | 2021-22 – 2025-26  | `aba-liga.com` match pages (box score, quarters, venue, attendance, referees) |
| ABA Supercup  | 2023-24            | `aba-liga.com` |

That is 342 games and 52 players. The Serbian league (KLS) and the Radivoj Korać Cup aren't
included because the federation publishes them only through a JavaScript widget.

## Layout

```
data/raw/          gzipped responses exactly as downloaded (the one-time archive)
scraper/fetch.py   downloads everything into data/raw; files already present are never re-fetched
scraper/build.py   parses data/raw into site/data (no network)
site/              the static site (index.html, app.js, style.css, data/)
```

`site/data` contains `games.json` (every game), `players.json` (bios + season lines),
`plog.json` (every Partizan player-game row) and `box/<game>.json` (full box score + shots).

## Rebuild

```sh
python3 scraper/fetch.py   # only needed if data/raw is missing something
python3 scraper/build.py
cd site && python3 -m http.server   # open http://localhost:8000
```

Python 3.9+, standard library only.

## Deploy

`.github/workflows/pages.yml` publishes `site/` to GitHub Pages on every push to `main` (and to the branch this was built on).
In the repository settings, set **Pages → Source** to **GitHub Actions** if the workflow can't enable it itself.
