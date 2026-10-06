"""Download raw data for BC Partizan's last five seasons and store it under data/raw.

Sources:
  * EuroLeague / EuroCup  - api-live.euroleague.net (schedule, rosters) and
                             live.euroleague.net/api (box score, header, shots)
  * ABA League + Supercup  - www.aba-liga.com (calendar and match pages)

Everything is cached: a file that already exists is never fetched again, so the
script can be re-run safely to fill gaps. Raw payloads are gzipped.
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
]
# aba-liga.com season ids: 21 = 2021/22 ... 25 = 2025/26
ABA_SEASONS = {21: "2021-22", 22: "2022-23", 23: "2023-24", 24: "2024-25", 25: "2025-26"}
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


def cached(path: Path, url: str, delay=0.4) -> bytes:
    if path.exists():
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
        games = json.loads(cached(
            base / "games.json.gz",
            f"https://api-live.euroleague.net/v2/competitions/{comp}/seasons/{code}/games?teamCode=PAR"))
        cached(base / "roster.json.gz",
               f"https://api-live.euroleague.net/v2/competitions/{comp}/seasons/{code}/clubs/PAR/people")
        played = [g for g in games["data"] if g["played"]]
        print(f"{code}: {len(played)} played games")
        for g in played:
            gc = g["gameCode"]
            for kind in ("Boxscore", "Header", "Points"):
                cached(base / f"{gc}_{kind.lower()}.json.gz",
                       f"https://live.euroleague.net/api/{kind}?gamecode={gc}&seasoncode={code}")


def fetch_aba():
    for sid in ABA_SEASONS:
        for cid, (cal, name) in ABA_COMPS.items():
            base = RAW / "aba" / f"{sid}_{cid}"
            html = cached(base / "calendar.html.gz",
                          f"https://www.aba-liga.com/{cal}/{sid}/{cid}/").decode("utf-8", "replace")
            ids = sorted({int(m) for m in re.findall(
                rf'/match/(\d+)/{sid}/{cid}/Overview/[^"]*partizan[^"]*"', html)})
            print(f"ABA {name} {sid}: {len(ids)} Partizan games")
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
