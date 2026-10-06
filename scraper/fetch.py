"""Download raw data for BC Partizan games and store it under data/raw.

Sources:
  * EuroLeague / EuroCup  - api-live.euroleague.net (schedule, rosters) and
                             live.euroleague.net/api (box score, header, shots)
  * ABA League + Supercup  - www.aba-liga.com (calendar and match pages)
  * KLS playoffs + Korac Cup - api.sofascore.com (the Serbian federation does not
                             publish these in a scrapeable form)

Box scores are cached: a file that already exists is never fetched again. For the
season in progress (CURRENT) the schedule, calendar and roster are fetched again on
every run, so re-running the script picks up newly played games. Raw payloads are gzipped.
"""
import gzip
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

# (season label, EuroLeague-family competition code, season code)
EUROPE = [
    ("2021-22", "U", "U2021"),  # EuroCup
    ("2022-23", "E", "E2022"),
    ("2023-24", "E", "E2023"),
    ("2024-25", "E", "E2024"),
    ("2025-26", "E", "E2025"),
    ("2026-27", "E", "E2026"),
]
# aba-liga.com season ids: 21 = 2021/22 ... 26 = 2026/27
ABA_SEASONS = {21: "2021-22", 22: "2022-23", 23: "2023-24", 24: "2024-25", 25: "2025-26", 26: "2026-27"}
CURRENT = "2026-27"
# Sofascore: Partizan's team id and the unique-tournament ids we keep
SOFA_TEAM = 6637
SOFA_TOURNAMENTS = {754: "KLS", 10188: "Korac Cup"}
SOFA_SINCE = 1627776000  # 2021-08-01, start of the first season we cover

# Baskethotel (the Serbian federation's stats widgets): Korac Cup box scores. Only the
# 2022 tournament falls inside our range there; later cups are only on Sofascore.
BH_API = "334454ccfb85b545a571fb76ced66e268e8dc98c"
BH_CUP_LEAGUE = 34757
BH_CUP_SEASONS = {"2021-22": 124222}

# aba-liga.com competition ids
ABA_COMPS = {1: ("calendar", "ABA League"), 3: ("calendar-supercup", "ABA Supercup")}

UA = "Mozilla/5.0 (partizan-stats archive; one-off fetch)"


def get(url, retries=4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            wait = 2 ** (attempt + 1)
            print(f"  ! {url}: {e} (retry in {wait}s)", file=sys.stderr)
            time.sleep(wait)
        except Exception as e:  # noqa: BLE001
            wait = 2 ** (attempt + 1)
            print(f"  ! {url}: {e} (retry in {wait}s)", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"failed to fetch {url}")


def cached(path: Path, url: str, delay=0.4, refresh=False) -> bytes:
    if path.exists() and not refresh:
        return gzip.decompress(path.read_bytes())
    print(f"GET {url}")
    body = get(url)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(body, 9))
    time.sleep(delay)
    return body


def fetch_europe():
    for label, comp, code in EUROPE:
        base = RAW / "euroleague" / code
        live = label == CURRENT
        games = json.loads(cached(
            base / "games.json.gz",
            f"https://api-live.euroleague.net/v2/competitions/{comp}/seasons/{code}/games?teamCode=PAR",
            refresh=live))
        cached(base / "roster.json.gz",
               f"https://api-live.euroleague.net/v2/competitions/{comp}/seasons/{code}/clubs/PAR/people",
               refresh=live)
        played = [g for g in games["data"] if g["played"]]
        print(f"{code}: {len(played)} played games")
        for g in played:
            gc = g["gameCode"]
            for kind in ("Boxscore", "Header", "Points"):
                cached(base / f"{gc}_{kind.lower()}.json.gz",
                       f"https://live.euroleague.net/api/{kind}?gamecode={gc}&seasoncode={code}")


def played_aba_ids(html, sid, cid):
    """Partizan match ids from a calendar page, only for games that already have a score."""
    ids = set()
    for row in re.split(r"<tr[ >]", html):
        m = re.search(rf'/match/(\d+)/{sid}/{cid}/Overview/[^"]*partizan[^"]*"', row)
        score = re.search(r'class="scoretable">\s*<a[^>]*>\s*\d+\s*:\s*\d+', row)
        if m and score:
            ids.add(int(m.group(1)))
    return sorted(ids)


def fetch_aba():
    for sid in ABA_SEASONS:
        for cid, (cal, name) in ABA_COMPS.items():
            base = RAW / "aba" / f"{sid}_{cid}"
            html = cached(base / "calendar.html.gz", f"https://www.aba-liga.com/{cal}/{sid}/{cid}/",
                          refresh=ABA_SEASONS[sid] == CURRENT).decode("utf-8", "replace")
            ids = played_aba_ids(html, sid, cid)
            print(f"ABA {name} {sid}: {len(ids)} played Partizan games")
            for mid in ids:
                cached(base / f"{mid}.html.gz",
                       f"https://www.aba-liga.com/match/{mid}/{sid}/{cid}/Boxscore/")


def fetch_aba_players():
    """Bio pages (height, birth date, nationality) for every Partizan player in ABA box scores."""
    ids = {}
    for f in sorted((RAW / "aba").glob("*_*/[0-9]*.html.gz")):
        page = gzip.decompress(f.read_bytes()).decode("utf-8", "replace")
        bs = page[page.find('id="Boxscore"'):]
        for team in re.split(r'<h4 class="main_title mb-0">', bs)[1:]:
            head = team[:300].lower()
            if 'class="team"' not in head or "partizan" not in head:
                continue
            for path, pid in re.findall(r"href='(/player/(\d+)/[^']+)'", team.split("</table>")[0]):
                ids.setdefault(pid, path)
    print(f"ABA: {len(ids)} Partizan players")
    for pid, path in sorted(ids.items()):
        cached(RAW / "aba" / "players" / f"{pid}.html.gz", "https://www.aba-liga.com" + path)


def fetch_sofascore():
    """KLS playoff and Korac Cup games. The team's game list is paged newest first and
    re-fetched on every run; per-game detail and box scores are cached once finished."""
    base = RAW / "sofascore"
    events, page = [], 0
    while True:
        print(f"GET sofascore team events page {page}")
        data = json.loads(get(f"https://api.sofascore.com/api/v1/team/{SOFA_TEAM}/events/last/{page}"))
        time.sleep(0.5)
        batch = data.get("events", [])
        events += [e for e in batch if e["startTimestamp"] >= SOFA_SINCE
                   and e["tournament"].get("uniqueTournament", {}).get("id") in SOFA_TOURNAMENTS]
        if not batch or not data.get("hasNextPage") or min(e["startTimestamp"] for e in batch) < SOFA_SINCE:
            break
        page += 1
    events.sort(key=lambda e: e["startTimestamp"])
    base.mkdir(parents=True, exist_ok=True)
    (base / "events.json.gz").write_bytes(gzip.compress(json.dumps(events).encode(), 9))
    done = [e for e in events if e["status"]["type"] == "finished"]
    print(f"Sofascore: {len(done)} finished KLS / Korac Cup games")
    for e in done:
        cached(base / f"{e['id']}_event.json.gz", f"https://api.sofascore.com/api/v1/event/{e['id']}")
        # forfeits (20-0) have no box score; some older games have none either
        missing = base / f"{e['id']}_lineups.missing"
        if e.get("homeScore", {}).get("current") and e.get("awayScore", {}).get("current") and not missing.exists():
            try:
                cached(base / f"{e['id']}_lineups.json.gz", f"https://api.sofascore.com/api/v1/event/{e['id']}/lineups")
            except urllib.error.HTTPError as err:
                if err.code != 404:
                    raise
                print(f"  no box score for event {e['id']}")
                missing.touch()


def bh_widget(widget, params, part=None, state=None, container="c"):
    q = [("api", BH_API), ("lang", "en"), ("nnav", "1"), ("nav_object", "0"), ("hide_full_birth_date", "0"),
         ("flash", "0"), ("request[0][container]", container), ("request[0][widget]", str(widget))]
    if part:
        q.append(("request[0][part]", part))
    if state:
        q.append(("request[0][state]", state))
    q += [(f"request[0][param]{k}", str(v)) for k, v in params]
    return "https://widgets.baskethotel.com/widget-service/show?" + urllib.parse.urlencode(q)


def bh_state(body):
    m = re.search(r"state: \\?'([A-Za-z0-9+/=]+)", body)
    return m.group(1) if m else None


def fetch_baskethotel_cup():
    base = RAW / "baskethotel"
    for label, season in BH_CUP_SEASONS.items():
        ids = [("[league_id]", BH_CUP_LEAGUE), ("[season_id]", season)]
        first = cached(base / f"cup_{season}_schedule.js.gz", bh_widget(303, ids)).decode("utf-8", "replace")
        results = cached(base / f"cup_{season}_results.js.gz", bh_widget(
            303, [("[season_id]", season), ("[filter][month]", "all"), ("[filter][type]", "results_only"),
                  ("[page]", "1")], part="schedule_and_results", state=bh_state(first),
            container="293-303-container")).decode("utf-8", "replace")
        games = set()
        for gid, row in re.findall(r'schedule-line-container-(\d+)(.*?)<\\?/tr>', results, re.S):
            if "partizan" in row.lower():
                games.add(gid)
        print(f"Baskethotel cup {label}: {len(games)} Partizan games")
        for gid in sorted(games):
            gp = ids + [("[game_id]", gid)]
            card = cached(base / f"{gid}_game.js.gz", bh_widget(400, gp)).decode("utf-8", "replace")
            cached(base / f"{gid}_box.js.gz", bh_widget(400, [("[team_id]", gid)], part="boxscore",
                                                         state=bh_state(card), container="293-400-tab-container"))


if __name__ == "__main__":
    what = sys.argv[1:] or ["europe", "aba", "sofascore", "baskethotel"]
    if "europe" in what:
        fetch_europe()
    if "aba" in what:
        fetch_aba()
        fetch_aba_players()
    if "sofascore" in what:
        fetch_sofascore()
    if "baskethotel" in what:
        fetch_baskethotel_cup()
