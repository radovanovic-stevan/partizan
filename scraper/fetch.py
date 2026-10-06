"""Download raw data for BC Partizan games and store it under data/raw.

Sources:
  * EuroLeague / EuroCup  - api-live.euroleague.net (schedule, rosters) and
                             live.euroleague.net/api (box score, header, shots)
  * ABA League + Supercup  - www.aba-liga.com (calendar and match pages)

Box scores are cached: a file that already exists is never fetched again. For the
season in progress (CURRENT) the schedule, calendar and roster are fetched again on
every run, so re-running the script picks up newly played games. Raw payloads are gzipped.
"""
import gzip
import json
import re
import sys
import time
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
# aba-liga.com competition ids
ABA_COMPS = {1: ("calendar", "ABA League"), 3: ("calendar-supercup", "ABA Supercup")}

UA = "Mozilla/5.0 (partizan-stats archive; one-off fetch)"


def get(url, retries=4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
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


if __name__ == "__main__":
    what = sys.argv[1:] or ["europe", "aba"]
    if "europe" in what:
        fetch_europe()
    if "aba" in what:
        fetch_aba()
        fetch_aba_players()
