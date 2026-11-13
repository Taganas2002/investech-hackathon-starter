"""
Export everything the WSP dashboard needs into ONE clean folder: dashboard_data/

    python export_dashboard_data.py

Re-run it after every new pull (peers, prices). The dashboard reads only dashboard_data/,
never data/raw/. Every file has fixed columns; dashboard_data/manifest.json lists
files, columns, row counts, coverage and what is missing.
"""

import csv
import json
import pathlib
import shutil
from datetime import date

import numpy as np
import pandas as pd

from profiles import load_all

RAW = pathlib.Path("data/raw")
EXT = pathlib.Path("data/external")
OUT = pathlib.Path("dashboard_data")

WSP_KEY, WSP_TICKER = "wsp", "WSP.TO"
PEERS = ["ACM", "J", "STN.TO", "TTEK", "KBR"]
INDEX_MEMBERS = ["AME", "WCN", "BRO", "IEX", "ETN", "ROP", "TDY", "TDG", "ACM", "HEI", "J", "POOL", "WSO", "DHR"]
NAMES = {"WSP.TO": "WSP Global", "ACM": "AECOM", "J": "Jacobs", "STN.TO": "Stantec", "TTEK": "Tetra Tech", "KBR": "KBR",
         "AME": "AMETEK", "WCN": "Waste Connections", "BRO": "Brown & Brown", "IEX": "IDEX", "ETN": "Eaton",
         "ROP": "Roper Technologies", "TDY": "Teledyne", "TDG": "TransDigm", "HEI": "HEICO", "POOL": "Pool Corp",
         "WSO": "Watsco", "DHR": "Danaher"}

manifest = {"generated_on": str(date.today()), "files": {}, "missing": []}


def body(path):
    b = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    return b["data"] if isinstance(b, dict) and "success" in b else b


def write(df, name, description, source, key_columns=None):
    path = OUT / name
    df.to_csv(path, index=False)
    manifest["files"][name] = {"description": description, "source": source, "rows": len(df),
                               "columns": list(df.columns), **({"key_columns": key_columns} if key_columns else {})}
    print(f"  {name:28} {len(df):>6} rows")


def miss(what, fix):
    manifest["missing"].append({"what": what, "how_to_fix": fix})


# ---------------------------------------------------------------- statements
def annual_statements(ticker):
    files = {s: RAW / ticker / f"statement_{s}.json" for s in ("income", "balance", "cash")}
    if not all(f.exists() for f in files.values()):
        return None
    inc, bal, cf = ({r["date"][:4]: r for r in body(files[s]) if r.get("period", "FY") == "FY"} for s in ("income", "balance", "cash"))
    rows = []
    for y in sorted(set(inc) & set(bal) & set(cf)):
        i, b, c = inc[y], bal[y], cf[y]
        pretax = i.get("incomeBeforeTax") or 0
        tax_rate = (i.get("incomeTaxExpense") or 0) / pretax if pretax > 0 else np.nan
        tax_rate = min(max(tax_rate, 0), 0.5) if pd.notna(tax_rate) else 0.26  # 26% assumed when not computable
        op = i.get("operatingIncome")
        nopat = op * (1 - tax_rate) if op is not None else np.nan
        equity, net_debt = b.get("totalStockholdersEquity"), b.get("netDebt")
        ic = (equity + net_debt) if equity is not None and net_debt is not None else np.nan
        rows.append({
            "ticker": ticker, "company": NAMES.get(ticker, ticker), "fiscal_year": int(y), "period_end": i.get("date"),
            "currency": i.get("reportedCurrency"),
            "revenue": i.get("revenue"), "ebitda": i.get("ebitda"), "operating_income": op,
            "net_income": i.get("netIncome"), "eps": i.get("eps"), "eps_diluted": i.get("epsdiluted"),
            "shares_diluted": i.get("weightedAverageShsOutDil"), "shares_basic": i.get("weightedAverageShsOut"),
            "operating_cash_flow": c.get("operatingCashFlow"), "capex": c.get("capitalExpenditure"),
            "free_cash_flow": c.get("freeCashFlow"),
            "acquisitions_cash": -(c.get("acquisitionsNet") or 0),          # positive = cash spent on acquisitions
            "shares_issued_cash": c.get("commonStockIssued") or 0, "buybacks": -(c.get("commonStockRepurchased") or 0),
            "dividends": -(c.get("dividendsPaid") or 0),
            "equity": equity, "total_debt": b.get("totalDebt"), "cash": b.get("cashAndCashEquivalents"),
            "net_debt": net_debt, "goodwill_and_intangibles": (b.get("goodwill") or 0) + (b.get("intangibleAssets") or 0),
            "tax_rate_used": round(tax_rate, 4), "nopat": nopat, "invested_capital": ic,
            "roic": nopat / ic if ic and ic > 0 and pd.notna(nopat) else np.nan,
            "source": f"Onesheet API /financials/statements/{ticker}/(income|balance|cash), annual (FY)",
        })
    return pd.DataFrame(rows)


def scorecard(st, years=3):
    out = []
    for t, g in st.groupby("ticker"):
        g = g.sort_values("fiscal_year"); last = g.iloc[-1]; w = g.tail(years)
        first = g[g["fiscal_year"] == last["fiscal_year"] - years]
        r = {"ticker": t, "company": last["company"], "group": "WSP" if t == WSP_TICKER else "peer",
             "currency": last["currency"], "last_fiscal_year": int(last["fiscal_year"]), "years_window": years}
        r["revenue_cagr"] = ((last["revenue"] / first["revenue"].iloc[0]) ** (1 / years) - 1) if len(first) and first["revenue"].iloc[0] > 0 else np.nan
        r["fcf_margin"] = w["free_cash_flow"].sum() / w["revenue"].sum() if w["revenue"].sum() else np.nan
        r["reinvestment"] = w["acquisitions_cash"].sum() / w["free_cash_flow"].sum() if w["free_cash_flow"].sum() > 0 else np.nan
        r["roic"] = last["roic"]
        r["net_debt_to_ebitda"] = last["net_debt"] / last["ebitda"] if last["ebitda"] and last["ebitda"] > 0 else np.nan
        out.append(r)
    sc = pd.DataFrame(out)
    for col, higher in [("revenue_cagr", True), ("fcf_margin", True), ("reinvestment", True), ("roic", True), ("net_debt_to_ebitda", False)]:
        sc[f"rank_{col}"] = sc[col].rank(ascending=not higher, method="min")
    sc["n_companies"] = len(sc)
    return sc


def per_share(st):
    g = st[st["ticker"] == WSP_TICKER].sort_values("fiscal_year").copy()
    if g.empty:
        return g
    for col in ["revenue", "free_cash_flow", "net_income"]:
        g[f"{col}_per_share"] = g[col] / g["shares_diluted"]
    base = g.iloc[0]
    for col in ["revenue", "free_cash_flow", "net_income", "revenue_per_share", "free_cash_flow_per_share",
                "net_income_per_share", "eps_diluted", "shares_diluted"]:
        g[f"{col}_index_first_year_100"] = g[col] / base[col] * 100 if base[col] else np.nan
        g[f"{col}_yoy_growth"] = g[col].pct_change()
    keep = ["fiscal_year", "period_end", "currency", "shares_diluted", "revenue", "revenue_per_share", "free_cash_flow",
            "free_cash_flow_per_share", "net_income", "net_income_per_share", "eps_diluted"] + \
           [c for c in g.columns if c.endswith("_index_first_year_100") or c.endswith("_yoy_growth")] + ["source"]
    return g[keep]


# ---------------------------------------------------------------- main
def main():
    OUT.mkdir(exist_ok=True)
    print(f"Writing {OUT}/")

    # 1. WSP deep profile (company, metrics, events, deals)
    t = load_all()
    prof_path = RAW / WSP_KEY / "company_profile.json"
    prof = body(prof_path)
    ents = prof["profile"].get("entities", [])
    q = body(RAW / WSP_TICKER / "quote.json") if (RAW / WSP_TICKER / "quote.json").exists() else {}
    company = {
        "identity": prof["profile"]["identity"], "description": prof["profile"]["overview"].get("description"),
        "segments": [{"name": e["name"], "description": e.get("description")} for e in ents if e["kind"] == "segment"],
        "business_lines": [{"name": e["name"], "description": e.get("description")} for e in ents if e["kind"] == "business-line"],
        "subsidiaries": [{"name": e["name"], "description": e.get("description")} for e in ents if e["kind"] == "subsidiary"],
        "quote": {k: q.get(k) for k in ["symbol", "name", "price", "marketCap", "yearHigh", "yearLow", "priceAvg50",
                                        "priceAvg200", "exchange", "timestamp"]},
        "quote_currency": "CAD (TSX listing)",
        "source": {"profile": "Onesheet /company-profiles/wsp", "quote": "Onesheet /stocks/quotes/WSP.TO"},
    }
    (OUT / "wsp_company.json").write_text(json.dumps(company, indent=2, default=str), encoding="utf-8")
    manifest["files"]["wsp_company.json"] = {"description": "Identity, description, segments, business lines, subsidiaries, latest quote",
                                             "source": company["source"]}
    print("  wsp_company.json")

    m = t["metrics"][t["metrics"]["key"] == WSP_KEY].copy()
    m["report_date"] = m["report_date"].dt.strftime("%Y-%m-%d")
    m = m.drop(columns=["key"]).sort_values(["metric_id", "period_type", "report_date"])
    write(m, "wsp_metrics.csv", "WSP deep-profile metrics, long format: one row per metric x period. Filter by metric_id and period_type "
          "(Quarterly, Annual, PointInTime, NineMonths, SemiAnnual). value is in actual units (not millions) unless unit says otherwise.",
          "Onesheet /company-profiles/wsp (each row has its filing quote)", ["metric_id", "period_type", "report_date"])

    ev = t["events"][t["events"]["key"] == WSP_KEY].copy()
    ev["date"] = ev["date"].dt.strftime("%Y-%m-%d")
    ev = ev.rename(columns={"amount": "amount_as_written"}).drop(columns=["key", "amount_num"]).sort_values("date", ascending=False)
    write(ev, "wsp_events.csv", "All dated/undated WSP events (acquisition, financing, capital-return, milestone, discontinuation, ...). "
          "amount_as_written is text as in the filing: units vary, never sum.", "Onesheet /company-profiles/wsp")

    d = t["deals"][t["deals"]["key"] == WSP_KEY].copy()
    d["date"] = d["date"].dt.strftime("%Y-%m-%d")
    d = d.rename(columns={"amount": "amount_as_written"})[["date", "counterparty", "amount_as_written", "amount_currency", "is_aggregate",
                                                           "is_dated", "summary", "quote", "form", "filed_on"]]
    write(d, "wsp_deals.csv", "Acquisition events de-duplicated (one row per counterparty and date). is_aggregate = many small deals "
          "reported as one line.", "Onesheet /company-profiles/wsp, de-duplicated by profiles.py")

    # 2. Statements: WSP + peers + index members
    frames = []
    for tk in dict.fromkeys([WSP_TICKER] + PEERS + INDEX_MEMBERS):
        s = annual_statements(tk)
        if s is None:
            miss(f"Statements for {tk}", f"python pull.py {tk} --only quote statement_income statement_balance statement_cash")
            continue
        s.insert(2, "group", "WSP" if tk == WSP_TICKER else ("peer" if tk in PEERS else "") +
                 ("+index" if tk in INDEX_MEMBERS and tk in PEERS else ("index" if tk in INDEX_MEMBERS else "")))
        frames.append(s)
    st = pd.concat(frames, ignore_index=True)
    write(st, "statements_annual.csv", "Annual statements for WSP, peers and index members; one row per ticker x fiscal year, "
          "in each company's reporting currency (see currency). acquisitions_cash is positive when cash was spent.",
          "Onesheet /financials/statements", ["ticker", "fiscal_year"])

    sc = scorecard(st[st["ticker"].isin([WSP_TICKER] + PEERS)])
    write(sc, "peer_scorecard.csv", "Panel 3: WSP vs engineering peers over the last 3 fiscal years. revenue_cagr, fcf_margin "
          "(3y FCF / 3y revenue), reinvestment (3y acquisition cash / 3y FCF), roic (last year, NOPAT / (equity + net debt)), "
          "net_debt_to_ebitda (last year). rank_* = 1 is best. All ratios, so currency does not matter.",
          "Computed from statements_annual.csv")
    for p in PEERS:
        if p not in set(sc["ticker"]):
            miss(f"{p} missing from peer_scorecard.csv", f"pull its statements, then rerun this script")

    ps = per_share(st)
    write(ps, "wsp_per_share.csv", "Panel 4: WSP per-share series by fiscal year. *_per_share = total / shares_diluted. "
          "*_index_first_year_100 rebases each series to 100 in the first year so total vs per-share lines share one chart. "
          "*_yoy_growth = change vs previous year.", "Computed from statements_annual.csv (WSP.TO)")

    # 3. Daily prices
    pr = []
    for tk in dict.fromkeys([WSP_TICKER] + INDEX_MEMBERS):
        f = RAW / tk / "price_history.json"
        if not f.exists():
            miss(f"Daily prices for {tk}", f"python pull.py {tk} --only price_history")
            continue
        x = body(f)
        x = x if isinstance(x, list) else next(v for v in x.values() if isinstance(v, list))
        for r in x:
            pr.append({"ticker": tk, "date": r["date"], "close": r.get("close"), "adj_close": r.get("adjClose", r.get("close"))})
    prices = pd.DataFrame(pr, columns=["ticker", "date", "close", "adj_close"]).sort_values(["ticker", "date"])
    write(prices, "prices_daily.csv", "Panel 6 + Panel 1 price chart: daily prices, one row per ticker x date. Use adj_close for returns. "
          "WSP.TO is in CAD, index members in USD (returns are currency-free per stock; note FX effect if mixing).",
          "Onesheet /stocks/historical/{ticker}", ["ticker", "date"])
    if len(prices):
        span = prices.groupby("ticker")["date"].agg(["min", "max", "count"])
        manifest["price_coverage"] = span.reset_index().to_dict("records")

    mc = RAW / WSP_TICKER / "marketcap_history.json"
    if mc.exists():
        write(pd.DataFrame(body(mc)).rename(columns={"value": "market_cap"}).sort_values("date"), "wsp_marketcap_daily.csv",
              "WSP market cap by date, CAD.", "Onesheet /stocks/historical/WSP.TO/marketcap")

    # 4. External CSVs (copied unchanged) + WSP claims
    for f in ["dealroom_wsp.csv", "peer_headcount.csv", "deal_targets.csv", "deal_promises.csv", "deal_target_headcount.csv"]:
        if (EXT / f).exists():
            shutil.copy(EXT / f, OUT / f)
            manifest["files"][f] = {"description": "Copied from data/external (see its source and quality_flag columns)",
                                    "rows": sum(1 for _ in open(OUT / f, encoding="utf-8")) - 1}
            print(f"  {f}")
        else:
            miss(f"data/external/{f}", "copy the file into data/external")
    cl = pathlib.Path("output/claims.csv")
    if cl.exists():
        c = pd.read_csv(cl); c = c[c["key"] == WSP_KEY]
        write(c, "claims_wsp.csv", "Panel 5: earnings-call claims for WSP with verified quotes (quote_verified).",
              "WSP earnings call transcripts (Onesheet) + profile evidence")

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    print(f"\nmanifest.json written. Missing items: {len(manifest['missing'])}")
    for x in manifest["missing"]:
        print("  -", x["what"], "->", x["how_to_fix"])


if __name__ == "__main__":
    main()
