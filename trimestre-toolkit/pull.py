"""
Pull everything for a list of tickers into data/raw/<SYMBOL>/<endpoint>.json.

    python pull.py --smoke                      # check the key works (cheap calls)
    python pull.py --search "constellation"     # find the right ticker format
    python pull.py CSU.TO TOI.V LMN.V           # pull all endpoints for these
    python pull.py CSU.TO --transcripts 4       # also fetch the 4 latest transcripts
    python pull.py CSU.TO --only company_profile kpis

Every call is cached in data/cache, so re-running is free and fast.
A manifest (data/raw/manifest.csv) lists what worked and what failed.
"""

import argparse
import csv
import json
import pathlib
import re
import sys
import time

from onesheet import Onesheet, OnesheetError

RAW = pathlib.Path("data/raw")

# Statement names are NOT documented in the spec. These are guesses; failures
# are logged, not fatal. Check the manifest and fix with --statements.
DEFAULT_STATEMENTS = ["income", "balance", "cash"]


def endpoints(api, statements):
    """name -> function(symbol). Order = most important first."""
    eps = {
        "company_profile": api.company_profile,      # the deep profile
        "kpis": api.kpis,                            # segments + KPIs
        "fundamentals": api.fundamentals,
        "profile": api.profile,
        "ratios": api.ratios,
        "growth": api.growth,
        "quote": api.quote,
        "marketcap_history": lambda s: api.historical_metric(s, "marketcap"),
        "price_history": api.historical,
        "estimates": api.estimates,
        "peers": api.peers,
        "dividends": api.dividends,
        "transcript_dates": api.transcript_dates,
        "news": api.news,
        "insider": api.insider,
    }
    for st in statements:
        eps[f"statement_{st}"] = (lambda s, st=st: api.statement(s, st))
    return eps


def find_periods(obj):
    """Best-effort: pull (year, quarter) pairs out of a transcript-dates response
    whose format is undocumented. Returns newest first."""
    found = set()

    def walk(x):
        if isinstance(x, dict):
            low = {k.lower(): v for k, v in x.items()}
            y = low.get("year") or low.get("fiscalyear")
            q = low.get("quarter") or low.get("period") or low.get("fiscalquarter")
            if y is not None and q is not None:
                qm = re.search(r"\d", str(q))
                if qm:
                    found.add((int(str(y)[:4]), int(qm.group())))
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
        elif isinstance(x, str):
            m = (re.search(r"(\d{4})\D{0,3}Q([1-4])", x, re.I)
                 or re.search(r"Q([1-4])\D{0,3}(\d{4})", x, re.I))
            if m:
                a, b = m.groups()
                found.add((int(a), int(b)) if len(a) == 4 else (int(b), int(a)))

    walk(obj)
    return sorted(found, reverse=True)


def folder_name(symbol):
    """Windows can't use \\ / : * ? " < > | in folder names, so CSU:CA -> CSU_CA."""
    return re.sub(r'[\\/:*?"<>|]', "_", symbol)


def save(symbol, name, body):
    folder = RAW / folder_name(symbol)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{name}.json").write_text(json.dumps(body, indent=2))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("symbols", nargs="*")
    ap.add_argument("--smoke", action="store_true", help="test the key with cheap calls")
    ap.add_argument("--search", help="search for a ticker by name")
    ap.add_argument("--only", nargs="+", help="only these endpoint names")
    ap.add_argument("--statements", nargs="+", default=DEFAULT_STATEMENTS)
    ap.add_argument("--transcripts", type=int, default=0,
                    help="also fetch the N most recent transcripts per symbol")
    ap.add_argument("--no-cache", action="store_true")
    args = ap.parse_args()

    try:
        api = Onesheet(use_cache=not args.no_cache)
    except OnesheetError as e:
        sys.exit(str(e))

    if args.smoke:
        for label, fn in [("exchanges", api.exchanges),
                          ("company-profiles list", lambda: api.company_profiles_list(limit=5))]:
            try:
                body = fn()
                print(f"OK  {label}: {json.dumps(body.get('data'))[:300]}")
            except OnesheetError as e:
                print(f"FAIL {label}: {e}")
        return

    if args.search:
        print(json.dumps(api.search(args.search).get("data"), indent=2)[:3000])
        return

    if not args.symbols:
        ap.print_help()
        return

    eps = endpoints(api, args.statements)
    if args.only:
        unknown = set(args.only) - set(eps)
        if unknown:
            sys.exit(f"Unknown endpoint names: {unknown}. Options: {list(eps)}")
        eps = {k: v for k, v in eps.items() if k in args.only}

    RAW.mkdir(parents=True, exist_ok=True)
    manifest_path = RAW / "manifest.csv"
    rows = []
    for sym in args.symbols:
        print(f"\n== {sym}" + (f"  (saved as folder {folder_name(sym)})" if folder_name(sym) != sym else ""))
        for name, fn in eps.items():
            try:
                body = fn(sym)
                save(sym, name, body)
                data = body.get("data")
                size = len(json.dumps(data))
                if data in (None, [], {}, ""):
                    print(f"  EMPTY {name} (no data returned)")
                    rows.append([sym, name, "empty", size, ""])
                else:
                    print(f"  ok   {name} ({size:,} chars)")
                    rows.append([sym, name, "ok", size, ""])
            except OnesheetError as e:
                print(f"  FAIL {name}: {e}")
                rows.append([sym, name, "fail", 0, str(e)])

        if args.transcripts:
            dates_file = RAW / folder_name(sym) / "transcript_dates.json"
            if not dates_file.exists():
                try:
                    save(sym, "transcript_dates", api.transcript_dates(sym))
                except OnesheetError as e:
                    print(f"  FAIL transcript_dates: {e}")
            if dates_file.exists():
                periods = find_periods(json.loads(dates_file.read_text()))[: args.transcripts]
                if not periods:
                    print("  could not read periods from transcript_dates.json; "
                          "open it and call api.transcript(sym, year, q) by hand")
                for y, q in periods:
                    name = f"transcript_{y}_Q{q}"
                    try:
                        save(sym, name, api.transcript(sym, y, q))
                        print(f"  ok   {name}")
                        rows.append([sym, name, "ok", "", ""])
                    except OnesheetError as e:
                        print(f"  FAIL {name}: {e}")
                        rows.append([sym, name, "fail", 0, str(e)])

    new_file = not manifest_path.exists()
    with manifest_path.open("a", newline="") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow(["symbol", "endpoint", "status", "data_chars", "error"])
        w.writerows(rows)
    ok = sum(r[2] == "ok" for r in rows)
    print(f"\nDone: {ok}/{len(rows)} calls ok. Files in {RAW}/, log in {manifest_path}")


if __name__ == "__main__":
    t0 = time.time()
    main()
    print(f"({time.time() - t0:.0f}s)")
