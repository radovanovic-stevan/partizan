"""Turn the raw downloads in data/raw into the compact JSON the website reads.

Output (site/data):
  games.json            every Partizan game: result, quarters, venue, refs ...
  players.json          every Partizan player: bio + per season/competition lines
  box/<game id>.json    full box score for both teams (+ shot chart for EuroLeague)
"""
import gzip
import html
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from fetch import ABA_COMPS, ABA_SEASONS, CURRENT, EUROPE, RAW

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data"

STAT_KEYS = ["pts", "f2m", "f2a", "f3m", "f3a", "ftm", "fta", "or", "dr", "reb",
             "ast", "stl", "tov", "blk", "blka", "pf", "fd", "pm", "pir"]


def load(path):
    return gzip.decompress(path.read_bytes())


def fold(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.replace("đ", "dj").replace("Đ", "Dj").lower()


def name_key(*parts):
    """Order-independent key so 'LEDAY, ZACH' and 'zach-leday' match."""
    toks = re.findall(r"[a-z]+", fold(" ".join(parts)))
    return "-".join(sorted(t for t in toks if t not in ("jr", "ii", "iii")))


def title_name(el_name):
    """'PUNTER, KEVIN' -> 'Kevin Punter'."""
    if "," in el_name:
        last, first = [p.strip() for p in el_name.split(",", 1)]
        el_name = f"{first} {last}"
    return " ".join(w.capitalize() if not w.endswith(".") else w.capitalize()
                    for w in el_name.split()).replace("Mc", "Mc")


# the EuroLeague feed sometimes spells the same coach differently
COACH_ALIASES = {"Zelimir Obradovic": "Zeljko Obradovic"}


def coach_name(raw):
    name = title_name(raw)
    return COACH_ALIASES.get(name, name)


def minutes(s):
    if not s or s in ("DNP",):
        return 0.0
    m, _, sec = s.strip().partition(":")
    try:
        return int(m) + int(sec or 0) / 60
    except ValueError:
        return 0.0


def is_par(name):
    return "partizan" in fold(name)


# --------------------------------------------------------------------------- Europe

EL_PHASES = {"RS": "Regular Season", "PI": "Play-In", "PO": "Playoffs", "FF": "Final Four",
             "8F": "Eighthfinals", "4F": "Quarterfinals", "2F": "Semifinals", "Final": "Final"}


def el_player(p):
    pts = p["Points"] or 0
    row = {
        "n": title_name(p["Player"]), "no": (p["Dorsal"] or "").strip(),
        "st": bool(p["IsStarter"]), "min": round(minutes(p["Minutes"]), 2),
        "pts": pts,
        "f2m": p["FieldGoalsMade2"], "f2a": p["FieldGoalsAttempted2"],
        "f3m": p["FieldGoalsMade3"], "f3a": p["FieldGoalsAttempted3"],
        "ftm": p["FreeThrowsMade"], "fta": p["FreeThrowsAttempted"],
        "or": p["OffensiveRebounds"], "dr": p["DefensiveRebounds"], "reb": p["TotalRebounds"],
        "ast": p["Assistances"], "stl": p["Steals"], "tov": p["Turnovers"],
        "blk": p["BlocksFavour"], "blka": p["BlocksAgainst"],
        "pf": p["FoulsCommited"], "fd": p["FoulsReceived"],
        "pm": p["Plusminus"] or 0, "pir": p["Valuation"],
        "pid": "EL" + p["Player_ID"].strip(),
    }
    row["dnp"] = row["min"] == 0
    return row


def el_totals(t):
    return {"pts": t["Points"], "f2m": t["FieldGoalsMade2"], "f2a": t["FieldGoalsAttempted2"],
            "f3m": t["FieldGoalsMade3"], "f3a": t["FieldGoalsAttempted3"],
            "ftm": t["FreeThrowsMade"], "fta": t["FreeThrowsAttempted"],
            "or": t["OffensiveRebounds"], "dr": t["DefensiveRebounds"], "reb": t["TotalRebounds"],
            "ast": t["Assistances"], "stl": t["Steals"], "tov": t["Turnovers"],
            "blk": t["BlocksFavour"], "blka": t["BlocksAgainst"],
            "pf": t["FoulsCommited"], "fd": t["FoulsReceived"], "pir": t["Valuation"]}


def build_europe(games, boxes, bios):
    for label, comp, code in EUROPE:
        base = RAW / "euroleague" / code
        sched = json.loads(load(base / "games.json.gz"))["data"]
        for person in json.loads(load(base / "roster.json.gz")):
            if person.get("typeName") != "Player":
                continue
            pp = person["person"]
            key = name_key(pp["name"])
            b = bios.setdefault(key, {})
            b.setdefault("height", pp.get("height") or None)
            b.setdefault("born", (pp.get("birthDate") or "")[:10] or None)
            b.setdefault("nat", (pp.get("country") or {}).get("name"))
            b.setdefault("pos", person.get("positionName"))
            img = (person.get("images") or {}).get("headshot") or (pp.get("images") or {}).get("headshot")
            if img:
                b["img"] = img
        for g in sched:
            if not g["played"]:
                continue
            gc = g["gameCode"]
            box = json.loads(load(base / f"{gc}_boxscore.json.gz"))
            head = json.loads(load(base / f"{gc}_header.json.gz"))
            gid = f"{code}-{gc}"
            sides = {}
            for side in ("local", "road"):
                c = g[side]
                parts = c["partials"]
                q = [parts.get(f"partials{i}") for i in range(1, 5)]
                q += [v for _, v in sorted((parts.get("extraPeriods") or {}).items(), key=lambda kv: int(kv[0]))]
                sides[side] = {"name": c["club"].get("editorialName") or c["club"].get("abbreviatedName") or c["club"]["name"], "full": c["club"]["name"],
                               "code": c["club"]["code"], "score": c["score"],
                               "logo": c["club"]["images"].get("crest"), "q": q}
            home, away = sides["local"], sides["road"]
            par_home = home["code"] == "PAR"
            refs = [g[f"referee{i}"]["name"] for i in range(1, 5) if g.get(f"referee{i}")]
            phase = EL_PHASES.get(g["phaseType"]["code"], g["phaseType"]["name"])
            rnd = g["roundAlias"] if g["phaseType"]["code"] == "RS" else f"{phase}"
            game = {
                "id": gid, "comp": "EuroLeague" if comp == "E" else "EuroCup",
                "season": label, "phase": phase, "round": rnd,
                "date": g["localDate"][:16],
                "venue": (g.get("venue") or {}).get("name", "").title(),
                "att": g.get("audience") or None,
                "home": {k: home[k] for k in ("name", "code", "score", "logo")},
                "away": {k: away[k] for k in ("name", "code", "score", "logo")},
                "q": [list(x) for x in zip(home["q"], away["q"])],
                "refs": [title_name(r) for r in refs],
                "parHome": par_home,
                "src": f"https://www.euroleaguebasketball.net/{'euroleague' if comp == 'E' else 'eurocup'}/game-center/{code[1:]}/x/x/{gc}/",
                "hasShots": False,
            }
            game["win"] = (home["score"] > away["score"]) == par_home
            teams = []
            for st in box["Stats"]:
                plist = [el_player(p) for p in st["PlayersStats"]]
                tcode = st["PlayersStats"][0]["Team"].strip() if st["PlayersStats"] else ""
                tot = el_totals(st["totr"])
                tot["teamReb"] = (st.get("tmr") or {}).get("TotalRebounds", 0)
                teams.append({"name": home["name"] if tcode == home["code"] else away["name"],
                              "code": tcode, "coach": coach_name(st.get("Coach") or ""),
                              "players": plist, "tot": tot, "par": tcode == "PAR"})
            teams.sort(key=lambda t: 0 if t["code"] == home["code"] else 1)
            shots = []
            try:
                pts = json.loads(load(base / f"{gc}_points.json.gz")).get("Rows") or []
            except (json.JSONDecodeError, FileNotFoundError):
                pts = []
            for r in pts:
                a = r["ID_ACTION"].strip()
                if a not in ("2FGM", "2FGA", "3FGM", "3FGA") or r["COORD_X"] is None:
                    continue
                shots.append([0 if r["TEAM"].strip() == home["code"] else 1,
                              "EL" + r["ID_PLAYER"].strip(), r["COORD_X"], r["COORD_Y"],
                              1 if a.endswith("M") else 0, int(a[0]), r["MINUTE"]])
            game["hasShots"] = bool(shots)
            game["coach"] = next((t["coach"] for t in teams if t["par"]), None)
            game["oppCoach"] = next((t["coach"] for t in teams if not t["par"]), None)
            games.append(game)
            boxes[gid] = {"teams": teams, "shots": shots}
            _ = head  # header kept in raw for completeness (timeouts, fouls)


# --------------------------------------------------------------------------- ABA

def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def parse_calendar(page, sid, cid):
    """Map match id -> (section heading, date string) from the calendar."""
    out = {}
    parts = re.split(r'aria-controls="#collapse_\d+">', page)
    for part in parts[1:]:
        heading = re.sub(r"\s+", " ", part.split("<i", 1)[0]).strip()
        for m in re.finditer(rf'/match/(\d+)/{sid}/{cid}/Overview/[^"]*"', part):
            out.setdefault(int(m.group(1)), heading)
    return out


def aba_phase(heading, cid):
    h = heading.lower()
    if cid == 3:  # Supercup: eight-team knockout over three rounds
        return {"round 1": ("Quarterfinals", "Quarterfinal"), "round 2": ("Semifinals", "Semifinal")}.get(
            h, ("Final", "Final"))
    if h.startswith("top8"):
        n = re.search(r"(\d+)\s*$", heading)
        return "Top 8", f"Top 8 · Round {n.group(1) if n else ''}".strip()
    if h.startswith("round"):
        return "Regular Season", heading.title()
    n = re.search(r"(\d+)\s*$", heading)
    game_no = f" · Game {n.group(1)}" if n else ""
    for k, v in (("play-in", "Play-In"), ("preliminary", "Play-In"), ("quarter", "Quarterfinals"),
                 ("semi", "Semifinals"), ("final", "Finals")):
        if k in h:
            return v, v + game_no
    return "Playoffs", heading


def attendance(txt):
    n = int(re.sub(r"\D", "", txt) or 0)
    return n if n > 50 else None  # placeholders like 0/1 for closed-door games


def parse_box_table(tbl):
    head_rows = re.findall(r"<tr>(.*?)</tr>", tbl.split("<tbody>")[0], re.S)
    cols = [strip_tags(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", head_rows[-1], re.S)]
    # first header cell spans number+name
    cols = ["no", "name"] + cols[1:]
    rows = []
    body = tbl.split("<tbody>", 1)[1]
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", body, re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        rows.append((cells, tr))
    return cols, rows


ABA_MAP = {"Pts": "pts", "D": "dr", "O": "or", "T": "reb", "Ass": "ast", "St": "stl", "To": "tov",
           "Fv": "blk", "Ag": "blka", "Cm": "pf", "Rv": "fd", "+/-": "pm", "Val": "pir"}


def aba_row(cols, cells):
    vals = {}
    pct_seen = 0
    for i, c in enumerate(cols):
        if i >= len(cells):
            break
        v = strip_tags(cells[i])
        if c == "M" or c == "A":
            grp = ["f2", "f3", "ft"][min(pct_seen - 1, 2)] if pct_seen else "f2"
            vals[grp + c.lower()] = v
        elif c == "%":
            pct_seen += 1
        elif c in ABA_MAP:
            vals[ABA_MAP[c]] = v
        elif c == "Min":
            vals["min"] = v
        elif c in ("Paint", "2ndCh", "FstBr"):
            vals[c] = v
    out = {}
    for k in STAT_KEYS:
        try:
            out[k] = int(vals.get(k, "0") or 0)
        except ValueError:
            out[k] = 0
    for k, dst in (("Paint", "pPaint"), ("2ndCh", "p2nd"), ("FstBr", "pFb")):
        if vals.get(k, "").lstrip("-").isdigit():
            out[dst] = int(vals[k])
    return vals.get("min", ""), out


def build_aba(games, boxes, aba_players):
    for sid, label in ABA_SEASONS.items():
        for cid, (_, comp) in ABA_COMPS.items():
            base = RAW / "aba" / f"{sid}_{cid}"
            cal = load(base / "calendar.html.gz").decode("utf-8", "replace")
            headings = parse_calendar(cal, sid, cid)
            for f in sorted(base.glob("[0-9]*.html.gz"), key=lambda p: int(p.name.split(".")[0])):
                mid = int(f.name.split(".")[0])
                page = load(f).decode("utf-8", "replace")
                gid = f"ABA{sid}{cid}-{mid}"
                info = re.search(r'dateAndVenue_container">(.*?)</div>', page, re.S)
                info_txt = info.group(1) if info else ""
                dm = re.search(r"(\d\d)\.(\d\d)\.(\d{4})\s+(\d\d:\d\d)", info_txt)
                if not dm:
                    continue
                date = f"{dm.group(3)}-{dm.group(2)}-{dm.group(1)}T{dm.group(4)}"
                att = re.search(r"fa-users\"></i>\s*([\d.,]+)", info_txt)
                venue = re.search(r"Venue:\s*([^<]+)", info_txt)
                score = re.search(r'class="gameScore">\s*(\d+)\s*:\s*(\d+)', page)
                if not score:
                    continue
                qtab = re.search(r'id="match_cetrtine_rezultat".*?</table>', page, re.S)
                qrows = re.findall(r"<tr>(.*?)</tr>", qtab.group(0), re.S) if qtab else []
                quarters = []
                if len(qrows) >= 2:
                    for cell in re.findall(r"<td>(.*?)</td>", qrows[1], re.S):
                        a, _, b = strip_tags(cell).partition(":")
                        if a.strip().isdigit():
                            quarters.append([int(a), int(b)])
                refs = re.search(r"Referees: </span>([^<]+)", page)
                # box score tab
                bs = page[page.find('id="Boxscore"'):]
                team_names = [strip_tags(t) for t in re.findall(
                    r'<h4 class="main_title mb-0">\s*<a class="team"[^>]*>(.*?)</a>', bs, re.S)][:2]
                tables = re.findall(r'<table class="[^"]*match_boxscore_team_table">(.*?)</table>', bs, re.S)[:2]
                cmp_tbl = re.search(r'match_boxscore_teams_compare_table">(.*?)</table>', bs, re.S)
                if len(tables) < 2 or len(team_names) < 2:
                    print("  ! no box score for", gid)
                    continue
                teams = []
                cmp_rows = []
                if cmp_tbl:
                    ccols, crows = parse_box_table(cmp_tbl.group(1))
                    for cells, _ in crows:
                        # compare rows have one colspan=2 name cell
                        _, tot = aba_row(ccols, ["", ""] + cells[1:])
                        cmp_rows.append(tot)
                for ti, (tname, tbl) in enumerate(zip(team_names, tables)):
                    cols, rows = parse_box_table(tbl)
                    plist = []
                    for cells, tr in rows:
                        link = re.search(r"/player/(\d+)/\d+/\d+/([^/']+)/'>(.*?)</a>", tr)
                        if not link:
                            continue
                        pid, slug, short = link.group(1), link.group(2), strip_tags(link.group(3))
                        mins, st = aba_row(cols, cells)
                        row = {"n": short, "no": strip_tags(cells[0]), "st": "<strong>" in cells[1],
                               "min": round(minutes(mins), 2), **st, "pid": "ABA" + pid}
                        row["dnp"] = row["min"] == 0
                        plist.append(row)
                        if is_par(tname):
                            aba_players.setdefault(pid, {"slug": slug, "short": short, "sid": sid, "cid": cid})
                    tot = cmp_rows[ti] if ti < len(cmp_rows) else {
                        k: sum(p.get(k, 0) for p in plist) for k in STAT_KEYS}
                    tot.pop("pm", None)
                    teams.append({"name": tname, "code": "PAR" if is_par(tname) else "",
                                  "coach": None, "players": plist, "tot": tot, "par": is_par(tname)})
                if not any(t["par"] for t in teams):
                    continue
                hs, as_ = int(score.group(1)), int(score.group(2))
                par_home = teams[0]["par"]
                heading = headings.get(mid, "")
                phase, rnd = aba_phase(heading, cid)
                logos = re.findall(r'images/club/100x100/(\d+)\.png', page[:page.find('id="Boxscore"')])
                game = {
                    "id": gid, "comp": comp, "season": label, "phase": phase, "round": rnd,
                    "date": date, "venue": strip_tags(venue.group(1)) if venue else "",
                    "att": attendance(att.group(1)) if att else None,
                    "home": {"name": short_club(team_names[0]), "code": teams[0]["code"], "score": hs,
                             "logo": f"https://www.aba-liga.com/images/club/100x100/{logos[0]}.png" if logos else None},
                    "away": {"name": short_club(team_names[1]), "code": teams[1]["code"], "score": as_,
                             "logo": f"https://www.aba-liga.com/images/club/100x100/{logos[1]}.png" if len(logos) > 1 else None},
                    "q": quarters,
                    "refs": [r.strip() for r in refs.group(1).split(",")] if refs else [],
                    "parHome": par_home,
                    "src": f"https://www.aba-liga.com/match/{mid}/{sid}/{cid}/Boxscore/",
                    "hasShots": False, "coach": None, "oppCoach": None,
                }
                game["win"] = (hs > as_) == par_home
                for t, side in zip(teams, ("home", "away")):
                    t["name"] = game[side]["name"]
                games.append(game)
                boxes[gid] = {"teams": teams, "shots": []}


SPONSORS = [" Mozzart Bet", " MozzartBet", " mts", " Meridianbet", " Superbet", " Soccerbet", " m:tel",
            " BH Telecom", " Office Shoes", " Voli", " VOLI", " NIS", " Mozzart", " Igokea", " TT Kabeli",
            " Ilirija", " Admiral"]


def short_club(name):
    n = name.strip()
    for s in SPONSORS:
        if n.endswith(s) and n != s.strip():
            n = n[: -len(s)].strip()
    return n or name


# --------------------------------------------------------------------------- players

def aba_bio(pid):
    f = RAW / "aba" / "players" / f"{pid}.html.gz"
    if not f.exists():
        return {}
    page = load(f).decode("utf-8", "replace")
    name = re.search(r'<h1 class="main_title">\s*(.*?)\s*</h1>', page, re.S)
    bio = {"name": strip_tags(name.group(1)) if name else None}
    for label, key in (("Position", "pos"), ("Height", "height"), ("Date of Birth", "born"),
                       ("Place of Birth", "birthplace"), ("Nationality", "nat")):
        m = re.search(rf"{label}:\s*</[^>]+>\s*<[^>]+>\s*([^<]+)", page) or \
            re.search(rf"{label}:(?:\s|<[^>]+>)*([^<]+)", page)
        if m:
            bio[key] = html.unescape(m.group(1)).strip()
    if bio.get("height"):
        h = re.sub(r"\D", "", bio["height"])
        bio["height"] = int(h) if h else None
    if bio.get("born") and re.match(r"\d\d\.\d\d\.\d{4}", bio["born"]):
        d, m_, y = bio["born"].split(".")
        bio["born"] = f"{y}-{m_}-{d}"
    return bio


NAT = {"SRB": "Serbia", "USA": "United States of America", "MNE": "Montenegro", "GRC": "Greece",
       "NGA": "Nigeria", "DNK": "Denmark", "FRA": "France", "AUS": "Australia", "BIH": "Bosnia and Herzegovina",
       "CRO": "Croatia", "HRV": "Croatia", "SLO": "Slovenia", "SVN": "Slovenia"}


def main():
    games, boxes, bios, aba_players = [], {}, {}, {}
    build_europe(games, boxes, bios)
    build_aba(games, boxes, aba_players)
    games.sort(key=lambda g: g["date"])

    # ---- unify Partizan player identities
    pid_to_key, key_name = {}, {}
    for pid, info in aba_players.items():
        bio = aba_bio(pid)
        full = bio.get("name") or " ".join(w.capitalize() for w in info["slug"].split("-"))
        key = name_key(info["slug"])
        pid_to_key["ABA" + pid] = key
        key_name.setdefault(key, full)
        b = bios.setdefault(key, {})
        for k, v in bio.items():
            if k != "name" and v and not b.get(k):
                b[k] = v
    for gid, box in boxes.items():
        for t in box["teams"]:
            if not t["par"]:
                continue
            for p in t["players"]:
                if p["pid"].startswith("EL"):
                    key = name_key(p["n"])
                    pid_to_key[p["pid"]] = key
                    key_name.setdefault(key, p["n"])

    # ---- the two sources spell some names differently (Andjusic / Anđušić, Nick / Nicholas
    # Calathes): treat keys with the same birth date and a shared name token as one player
    def toks(k):
        return {re.sub(r"d[jz]", "d", t) for t in k.split("-")}
    used = sorted(set(pid_to_key.values()))
    alias = {}
    for i, a in enumerate(used):
        for b in used[i + 1:]:
            ba, bb = bios.get(a, {}).get("born"), bios.get(b, {}).get("born")
            if ba and ba == bb and toks(a) & toks(b) and b not in alias:
                alias[b] = alias.get(a, a)
    for pid, k in pid_to_key.items():
        if k in alias:
            canon = alias[k]
            a, b = key_name.get(canon), key_name.get(k)
            # same spelling once folded -> keep the accented one, else the shorter common name
            if toks(name_key(a)) == toks(name_key(b)):
                key_name[canon] = max(a, b, key=lambda n: sum(ord(c) > 127 for c in n))
            else:
                key_name[canon] = min(a, b, key=len)
            for f, v in bios.get(k, {}).items():
                cur = bios.setdefault(canon, {}).get(f)
                if not cur or (f == "nat" and len(cur) == 3):
                    bios[canon][f] = v
            pid_to_key[pid] = canon

    # ---- attach keys to box score rows and aggregate player lines
    lines = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    logs = defaultdict(list)
    plog = []
    gmap = {g["id"]: g for g in games}
    for gid, box in boxes.items():
        g = gmap.get(gid)
        if not g:
            continue
        for t in box["teams"]:
            for p in t["players"]:
                if t["par"]:
                    key = pid_to_key.get(p["pid"], name_key(p["n"]))
                    p["k"] = key
                    p["n"] = key_name.get(key, p["n"])
                    if p["dnp"]:
                        continue
                    agg = lines[key][(g["season"], g["comp"])]
                    agg["gp"] += 1
                    agg["gs"] += 1 if p["st"] else 0
                    agg["min"] += p["min"]
                    for s in STAT_KEYS:
                        agg[s] += p.get(s, 0) or 0
                    agg["w"] += 1 if g["win"] else 0
                    logs[key].append(gid)
                    plog.append([gid, key, round(p["min"], 1)] + [p.get(s, 0) or 0 for s in STAT_KEYS] + [1 if p["st"] else 0])
                if not p["pid"].startswith("EL"):
                    del p["pid"]

    players = []
    for key, by in lines.items():
        b = bios.get(key, {})
        if b.get("nat") in NAT:
            b["nat"] = NAT[b["nat"]]
        rows = []
        for (season, comp), agg in sorted(by.items()):
            rows.append({"season": season, "comp": comp,
                         **{k: round(v, 2) if k == "min" else int(v) for k, v in agg.items()}})
        players.append({"k": key, "n": key_name.get(key, key), **{k: v for k, v in b.items() if v},
                        "lines": rows})
    players.sort(key=lambda p: -sum(r["gp"] for r in p["lines"]))

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "box").mkdir(exist_ok=True)
    for gid, box in boxes.items():
        if gid in gmap:
            (OUT / "box" / f"{gid}.json").write_text(json.dumps(box, separators=(",", ":"), ensure_ascii=False))
    (OUT / "games.json").write_text(json.dumps(games, separators=(",", ":"), ensure_ascii=False))
    (OUT / "plog.json").write_text(json.dumps({"cols": ["g", "k", "min"] + STAT_KEYS + ["st"], "rows": plog},
                                              separators=(",", ":"), ensure_ascii=False))
    (OUT / "players.json").write_text(json.dumps(players, separators=(",", ":"), ensure_ascii=False))
    meta = {"built": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "current": CURRENT, "seasons": [s for s, *_ in EUROPE], "games": len(games), "players": len(players)}
    (OUT / "meta.json").write_text(json.dumps(meta))
    print(f"{len(games)} games, {len(players)} players")


if __name__ == "__main__":
    main()
