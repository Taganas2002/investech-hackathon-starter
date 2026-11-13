"""
Understand and flatten the JSON you pulled.

    python explore.py tree data/raw/CSU.TO/company_profile.json     # see the structure
    python explore.py find data/raw/CSU.TO/company_profile.json acquisition
    python explore.py flatten                                        # all raw files -> CSV

`flatten` turns every list of records (and every dict of records) it finds
into a CSV table, per symbol in data/tables/<SYMBOL>/ and stacked across
symbols in data/tables/combined/ with a `symbol` column, ready for a
spreadsheet, pandas or an AI tool.
"""

import argparse
import json
import pathlib
import sys

import pandas as pd

RAW = pathlib.Path("data/raw")
OUT = pathlib.Path("data/tables")


def load(path):
    body = json.loads(pathlib.Path(path).read_text())
    # unwrap the Onesheet envelope if present
    if isinstance(body, dict) and "data" in body and "success" in body:
        return body["data"]
    return body


# ------------------------------------------------------------------ tree
def tree(obj, path="", depth=0, max_depth=6, out=None):
    out = out if out is not None else []
    pad = "  " * depth
    if isinstance(obj, dict):
        out.append(f"{pad}{path or '<root>'}: dict ({len(obj)} keys)")
        if depth < max_depth:
            for k, v in list(obj.items())[:40]:
                tree(v, k, depth + 1, max_depth, out)
            if len(obj) > 40:
                out.append(f"{pad}  ... {len(obj) - 40} more keys")
    elif isinstance(obj, list):
        kind = type(obj[0]).__name__ if obj else "empty"
        out.append(f"{pad}{path}: list[{len(obj)}] of {kind}")
        if obj and depth < max_depth and isinstance(obj[0], (dict, list)):
            tree(obj[0], "[0]", depth + 1, max_depth, out)
    else:
        val = repr(obj)
        out.append(f"{pad}{path}: {type(obj).__name__} = {val[:80]}{'...' if len(val) > 80 else ''}")
    return out


def find(obj, text, path="", hits=None):
    hits = hits if hits is not None else []
    t = text.lower()
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f"{path}.{k}" if path else k
            if t in str(k).lower():
                hits.append((p, "key", str(v)[:120]))
            find(v, text, p, hits)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            find(v, text, f"{path}[{i}]", hits)
    elif isinstance(obj, str) and t in obj.lower():
        hits.append((path, "value", obj[:160]))
    return hits


# --------------------------------------------------------------- flatten
def is_records(x):
    return isinstance(x, list) and len(x) > 0 and all(isinstance(i, dict) for i in x)


def flat(d, prefix=""):
    """Flatten nested dicts into dotted columns; lists become text."""
    row = {}
    for k, v in d.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            row.update(flat(v, key + "."))
        elif isinstance(v, list):
            if all(not isinstance(i, (dict, list)) for i in v):
                row[key] = "; ".join(map(str, v))
            else:
                row[key] = f"[{len(v)} items, see own table]"
        else:
            row[key] = v
    return row


def collect(obj, path, tables, parent=None):
    def add(name, rows):
        if parent is not None:
            for r in rows:
                r["_parent_index"] = parent
        tables.setdefault(name or "root", []).extend(rows)

    if isinstance(obj, dict):
        vals = list(obj.values())
        # dict of records (e.g. {"revenue": [...], "ebitda": [...]}) -> one long table
        if len(obj) > 1 and all(is_records(v) for v in vals):
            add(f"{path}{{*}}", [{"_key": k, **flat(r)} for k, v in obj.items() for r in v])
        # dict of similar dicts (e.g. {"revenue": {"value":..,"source":..}, ...})
        elif len(obj) >= 3 and all(isinstance(v, dict) for v in vals):
            add(f"{path}{{*}}", [{"_key": k, **flat(v)} for k, v in obj.items()])
        for k, v in obj.items():
            collect(v, f"{path}.{k}" if path else str(k), tables, parent)
    elif is_records(obj):
        add(path, [flat(r) for r in obj])
        for i, r in enumerate(obj):
            for k, v in r.items():
                if isinstance(v, (list, dict)):
                    collect(v, f"{path}[].{k}", tables, parent=i)


def scalars(obj, path="", out=None):
    """Top-level scalar facts (not inside lists) as key/value rows."""
    out = out if out is not None else []
    if isinstance(obj, dict):
        for k, v in obj.items():
            scalars(v, f"{path}.{k}" if path else str(k), out)
    elif not isinstance(obj, list):
        out.append({"field": path, "value": obj})
    return out


def safe_name(s):
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in s)[:150]


def flatten_all():
    if not RAW.exists():
        sys.exit("No data/raw folder yet. Run pull.py first.")
    combined = {}
    n_files = 0
    for sym_dir in sorted(p for p in RAW.iterdir() if p.is_dir()):
        sym = sym_dir.name
        for f in sorted(sym_dir.glob("*.json")):
            data = load(f)
            tables = {}
            collect(data, "", tables)
            sc = scalars(data)
            if sc:
                tables["_scalars"] = sc
            for tname, rows in tables.items():
                if not rows:
                    continue
                df = pd.DataFrame(rows)
                name = safe_name(f"{f.stem}__{tname}")
                (OUT / sym).mkdir(parents=True, exist_ok=True)
                df.to_csv(OUT / sym / f"{name}.csv", index=False)
                n_files += 1
                df.insert(0, "symbol", sym)
                combined.setdefault(name, []).append(df)
    (OUT / "combined").mkdir(parents=True, exist_ok=True)
    index = []
    for name, dfs in combined.items():
        df = pd.concat(dfs, ignore_index=True)
        df.to_csv(OUT / "combined" / f"{name}.csv", index=False)
        index.append({"table": name, "rows": len(df), "cols": len(df.columns),
                      "symbols": df["symbol"].nunique(),
                      "columns": ", ".join(map(str, df.columns[:15]))})
    idx = pd.DataFrame(index).sort_values("rows", ascending=False) if index else pd.DataFrame()
    idx.to_csv(OUT / "INDEX.csv", index=False)
    print(f"Wrote {n_files} per-symbol tables and {len(combined)} combined tables to {OUT}/")
    print(f"Start with {OUT}/INDEX.csv (biggest tables first).")
    if not idx.empty:
        print(idx.head(15).to_string(index=False, max_colwidth=60))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")
    t = sub.add_parser("tree"); t.add_argument("file"); t.add_argument("--depth", type=int, default=6)
    fd = sub.add_parser("find"); fd.add_argument("file"); fd.add_argument("text")
    sub.add_parser("flatten")
    ing = sub.add_parser("ingest", help="copy the downloaded data pack into data/raw")
    ing.add_argument("path", help="a .json file or a folder of .json files")
    args = ap.parse_args()

    if args.cmd == "ingest":
        src = pathlib.Path(args.path)
        files = [src] if src.is_file() else sorted(src.rglob("*.json"))
        if not files:
            sys.exit(f"No .json files found in {src}")
        for f in files:
            # one file per company -> data/raw/<file name>/pack.json
            # one big file -> data/raw/_pack/<file name>.json (still flattened)
            target = RAW / (f.stem if len(files) > 1 else "_pack")
            target.mkdir(parents=True, exist_ok=True)
            (target / ("pack.json" if len(files) > 1 else f.name)).write_text(f.read_text())
            print(f"  {f.name} -> {target}/")
        print("Now run: python explore.py flatten")
        return

    if args.cmd == "tree":
        print("\n".join(tree(load(args.file), max_depth=args.depth)))
    elif args.cmd == "find":
        hits = find(load(args.file), args.text)
        for p, kind, val in hits[:60]:
            print(f"{kind:5} {p}\n      {val}")
        print(f"{len(hits)} hits" + (" (showing 60)" if len(hits) > 60 else ""))
    elif args.cmd == "flatten":
        flatten_all()
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
