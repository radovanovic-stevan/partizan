# Partizan Stats

BC Partizan results, box scores, shot charts, player stats and records from 2007-08 onward,
published as a static site on GitHub Pages at [partizan.stevan.co.rs](https://partizan.stevan.co.rs).

| Competition  | Seasons            | Source |
|--------------|--------------------|--------|
| EuroLeague   | 2007-08 to 2013-14, 2022-23 to 2026-27 | `api-live.euroleague.net`, `live.euroleague.net/api` |
| EuroCup      | 2014-15, 2017-18 to 2021-22 | same as EuroLeague |
| ABA League   | 2007-08 to 2026-27 | `aba-liga.com` match pages |
| ABA Supercup | 2017-18 to 2019-20, 2023-24 | `aba-liga.com` |
| KLS playoffs | 2021-22 to 2025-26 | `api.sofascore.com` |
| Korać Cup    | 2021-22 to 2025-26 | `api.sofascore.com`; 2022 box scores from the federation's Baskethotel widgets |

Notes on the older seasons:
- Partizan played in neither European competition in 2015-16 and 2016-17.
- Before 2015 the EuroLeague play-by-play splits two-pointers into layups, dunks and blocked shots,
  and its box scores have no coaches; those come from the v2 game stats endpoint.
- Old ABA pages have no venue and don't mark starters. One 2013-14 ABA game has no box score and
  is left out.

Notes on the Serbian competitions:
- Partizan only plays the KLS playoffs. Sofascore lists no Partizan KLS games in 2022-23.
- Two KLS games were forfeits (2022 semifinal vs FMP, 2024 final game 2 vs Crvena zvezda). They
  count in the record but not in points, margins or records.
- The 2023, 2024 and 2025 cups have results and quarter scores but no box scores.
- Sofascore box scores have no fouls drawn or blocks against.

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
