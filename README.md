# Partizan Stats

BC Partizan results, box scores, shot charts, player stats and records from 2021-22 onward,
published as a static site on GitHub Pages.

| Competition  | Seasons            | Source |
|--------------|--------------------|--------|
| EuroLeague   | 2022-23 to 2026-27 | `api-live.euroleague.net`, `live.euroleague.net/api` |
| EuroCup      | 2021-22            | same as EuroLeague |
| ABA League   | 2021-22 to 2026-27 | `aba-liga.com` match pages |
| ABA Supercup | 2023-24            | `aba-liga.com` |

The Serbian league (KLS) and the Radivoj Korać Cup are not included. The federation only
publishes them through a JavaScript widget.

## Layout

```
data/raw/          gzipped responses as downloaded
scraper/fetch.py   downloads into data/raw
scraper/build.py   parses data/raw into site/data (no network)
site/              the static site
```

## Updating the current season

`CURRENT` in `scraper/fetch.py` names the season in progress. For that season the schedule,
calendar and roster are downloaded again on every run, and box scores are fetched for any newly
played game. Finished games are never downloaded twice.

```sh
python3 scraper/fetch.py
python3 scraper/build.py
cd site && python3 -m http.server   # http://localhost:8000
```

Python 3.9+, standard library only. When a new season starts, add it to `EUROPE` and
`ABA_SEASONS` in `fetch.py` and move `CURRENT`.

## Deploy

`.github/workflows/pages.yml` publishes `site/` on every push to `main`.
