"""
Load Onesheet deep profiles (schema 'company-profile-consumer-v2') into tidy tables.

    from profiles import load_all
    t = load_all()            # reads data/raw/*/company_profile.json
    t["companies"]            # one row per company
    t["metrics"]              # long: one row per company x period x metric, with source quote
    t["events"]               # one row per dated event, with source quote
    t["deals"]                # acquisition events, de-duplicated where possible
    t["coverage"]             # which metrics each company actually has
    t["scorecard"]            # one row per company: TTM figures + ratios

Also runnable: `python profiles.py` writes all tables to data/tables/profiles/*.csv
"""

import json
import pathlib

import numpy as np
import pandas as pd

RAW = pathlib.Path("data/raw")
OUT = pathlib.Path("data/tables/profiles")

FLOW = ["revenue", "free_cash_flow", "acquisitions", "operating_cash_flow", "capex", "net_income"]
BALANCE = ["debt", "cash"]


def _profile_files(raw=RAW):
    for f in sorted(pathlib.Path(raw).glob("*/company_profile.json")):
        body = json.loads(f.read_text(encoding="utf-8"))
        # API files are wrapped {"success", "data", "meta"}; data-pack files may not be
        data = body["data"] if isinstance(body, dict) and "success" in body else body
        if isinstance(data, dict) and "profile" in data and "data" in data:
            yield f, data


def _first_source(sources):
    s = (sources or [{}])[0] or {}
    return s.get("quote"), s.get("formType"), s.get("filedOn"), s.get("source")


def load_all(raw=RAW):
    companies, metrics, events = [], [], []
    for f, d in _profile_files(raw):
        ident = d["profile"]["identity"]
        key = ident["key"]
        lst = (ident.get("listings") or [{}])[0]
        companies.append({
            "key": key, "name": ident.get("name"), "ticker": lst.get("symbol"),
            "exchange": lst.get("exchange"), "currency": ident.get("reportingCurrency"),
            "fiscal_year_end": ident.get("fiscalYearEnd"),
            "description": d["profile"].get("overview", {}).get("description"),
        })
        names = {m["metricId"]: m["metricName"] for m in d.get("metrics", [])}
        for p in d["data"]:
            for mid, mv in (p.get("metricValues") or {}).items():
                q, form, filed, src = _first_source(mv.get("sources"))
                metrics.append({
                    "key": key, "period_id": p["periodId"], "period_type": p["periodType"],
                    "report_date": p.get("reportDate"), "fiscal_year": p.get("fiscalYear"),
                    "fiscal_quarter": p.get("fiscalQuarter"), "metric_id": mid,
                    "metric_name": names.get(mid, mid), "value": mv.get("value"),
                    "unit": mv.get("unit"), "currency": mv.get("currency"),
                    "adjusted": mv.get("adjusted"), "quote": q, "form": form, "filed_on": filed,
                    "n_sources": len(mv.get("sources") or []),
                })
        for e in d.get("events", []):
            dt = e.get("date") or {}
            q, form, filed, src = _first_source(e.get("sources"))
            a = e.get("attributes") or {}
            events.append({
                "key": key, "type": e.get("type"), "status": e.get("status"),
                "date": dt.get("occurredOn"), "date_precision": dt.get("precision"),
                "period_label": dt.get("periodLabel"), "summary": e.get("summary"),
                "counterparty": a.get("counterparty"), "amount": a.get("amount"),
                "amount_currency": a.get("currency"), "attributes": json.dumps(a),
                "quote": q, "form": form, "filed_on": filed,
                "n_sources": len(e.get("sources") or []),
            })

    companies = pd.DataFrame(companies)
    metrics = pd.DataFrame(metrics)
    events = pd.DataFrame(events)
    if metrics.empty:
        raise SystemExit("No deep profiles found in data/raw/*/company_profile.json")
    metrics["report_date"] = pd.to_datetime(metrics["report_date"], errors="coerce")
    metrics["value"] = pd.to_numeric(metrics["value"], errors="coerce")
    events["date"] = pd.to_datetime(events["date"], errors="coerce")
    events["amount_num"] = pd.to_numeric(events["amount"], errors="coerce")  # millions, as written

    deals = _deals(events)
    coverage = (metrics.groupby(["metric_id", "key"])["period_id"].nunique()
                .unstack(fill_value=0))
    coverage["companies_with_it"] = (coverage > 0).sum(axis=1)
    coverage = coverage.sort_values("companies_with_it", ascending=False)

    scorecard = _scorecard(companies, metrics, deals)
    return {"companies": companies, "metrics": metrics, "events": events,
            "deals": deals, "coverage": coverage, "scorecard": scorecard}


def _deals(events):
    """Acquisitions that are actual named deals: dated, one per counterparty.
    Aggregate lines ('a number of additional acquisitions') are kept separately
    flagged, because they count many small deals as one row."""
    d = events[events["type"] == "acquisition"].copy()
    if d.empty:
        return d
    agg_words = r"number of|multiple|various|additional acquisitions"
    d["is_aggregate"] = (d["counterparty"].fillna("").str.contains(agg_words, case=False)
                         | d["summary"].fillna("").str.contains(agg_words, case=False))
    d["is_dated"] = d["date"].notna()
    # first word of the counterparty name, lowercased: "Synchronoss Technologies, Inc." -> "synchronoss"
    d["cp_norm"] = (d["counterparty"].fillna("").str.lower()
                    .str.replace(r"[^a-z0-9 ]", "", regex=True).str.split().str[0].fillna(""))
    named = d[~d["is_aggregate"] & (d["cp_norm"] != "")].copy()
    named["_score"] = named["amount_num"].notna().astype(int)
    # dated deals: one row per counterparty per date (separate deals with the same party stay)
    dated = (named[named["is_dated"]].sort_values("_score", ascending=False)
             .drop_duplicates(["key", "cp_norm", "date"]))
    # undated mentions: dropped when the same counterparty already has a dated deal
    seen = set(zip(dated["key"], dated["cp_norm"]))
    undated = named[~named["is_dated"]]
    undated = undated[[(k, c) not in seen for k, c in zip(undated["key"], undated["cp_norm"])]]
    undated = undated.drop_duplicates(["key", "cp_norm"])
    named = pd.concat([dated, undated]).drop(columns="_score")
    rest = d[d["is_aggregate"] | (d["cp_norm"] == "")]
    out = pd.concat([named, rest], ignore_index=True)
    return out.sort_values(["key", "date"], ascending=[True, False])


def _ttm(q, metric, offset=0):
    """Sum of 4 consecutive quarters, skipping `offset` most recent. NaN if a gap."""
    s = q[q["metric_id"] == metric].sort_values("report_date", ascending=False)
    s = s.drop_duplicates("report_date")
    window = s.iloc[offset:offset + 4]
    if len(window) < 4:
        return np.nan, None
    span = (window["report_date"].iloc[0] - window["report_date"].iloc[-1]).days
    if span > 300:  # quarters not consecutive (a quarter is missing)
        return np.nan, None
    return window["value"].sum(), window["report_date"].iloc[0]


def _latest_annual(m, metric, offset=0):
    s = m[(m["metric_id"] == metric) & (m["period_type"] == "Annual")].sort_values("report_date", ascending=False)
    return (s["value"].iloc[offset], s["report_date"].iloc[offset]) if len(s) > offset else (np.nan, None)


def _flow(m, metric, offset=0):
    """TTM from quarters; falls back to annual. offset=1 -> the prior year."""
    q = m[m["period_type"] == "Quarterly"]
    v, dt = _ttm(q, metric, offset * 4)
    if pd.isna(v):
        v, dt = _latest_annual(m, metric, offset)
        basis = "annual" if pd.notna(v) else None
    else:
        basis = "ttm"
    return v, dt, basis


def _latest_point(m, metric):
    s = m[(m["metric_id"] == metric) & (m["period_type"] == "PointInTime")].sort_values("report_date")
    return (s["value"].iloc[-1], s["report_date"].iloc[-1]) if len(s) else (np.nan, None)


def _scorecard(companies, metrics, deals):
    rows = []
    for _, c in companies.iterrows():
        m = metrics[metrics["key"] == c["key"]]
        r = {"key": c["key"], "name": c["name"], "currency": c["currency"]}
        for met in FLOW:
            v, dt, basis = _flow(m, met)
            r[f"{met}_ttm"] = v
            if met == "revenue":
                r["as_of"], r["basis"] = (dt.date() if dt is not None else None), basis
        rev_prior, _, _ = _flow(m, "revenue", 1)
        r["revenue_growth"] = r["revenue_ttm"] / rev_prior - 1 if rev_prior else np.nan
        acq2 = sum(_flow(m, "acquisitions", i)[0] for i in (0, 1))
        fcf2 = sum(_flow(m, "free_cash_flow", i)[0] for i in (0, 1))
        r["acq_spend_2y"] = abs(acq2) if pd.notna(acq2) else np.nan
        r["fcf_2y"] = fcf2
        r["reinvestment_2y"] = r["acq_spend_2y"] / fcf2 if pd.notna(fcf2) and fcf2 > 0 else np.nan
        r["fcf_margin"] = r["free_cash_flow_ttm"] / r["revenue_ttm"] if r["revenue_ttm"] else np.nan
        debt, _ = _latest_point(m, "debt")
        cash, _ = _latest_point(m, "cash")
        r["net_debt"] = debt - cash if pd.notna(debt) and pd.notna(cash) else np.nan
        fcf = r["free_cash_flow_ttm"]
        r["net_debt_to_fcf"] = r["net_debt"] / fcf if pd.notna(fcf) and fcf > 0 else np.nan
        org = m[m["metric_id"].str.contains("organic", na=False)].sort_values("report_date")
        r["organic_growth_latest"] = org["value"].iloc[-1] if len(org) else np.nan
        dk = deals[deals["key"] == c["key"]] if len(deals) else deals
        named = dk[~dk["is_aggregate"]] if len(dk) else dk
        r["named_deals"] = len(named)
        r["named_deals_dated"] = int(named["is_dated"].sum()) if len(named) else 0
        r["named_deal_value_m"] = named["amount_num"].sum() if len(named) else 0
        rows.append(r)
    return pd.DataFrame(rows).set_index("key")



# ---------------------------------------------------------------------------
# Standard financial statements (same definitions for every company)
# ---------------------------------------------------------------------------
def _stmt(ticker, name, raw=RAW):
    f = pathlib.Path(raw) / ticker / f"statement_{name}.json"
    if not f.exists():
        return pd.DataFrame()
    body = json.loads(f.read_text(encoding="utf-8"))
    rows = body["data"] if isinstance(body, dict) and "success" in body else body
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df = df[df.get("period", "FY") == "FY"] if "period" in df else df
    df["year"] = pd.to_datetime(df["date"]).dt.year
    return df.drop_duplicates("year").set_index("year")


def load_statements(tickers, raw=RAW):
    """tickers: {"csu": "CSU.TO", ...}. Returns one row per company x fiscal year,
    in each company's reporting currency, with consistent definitions:
      fcf = operating cash flow - capex           (not the company's own FCF definition)
      acq_spend = cash paid for acquisitions, net (positive = spent)
      nopat = operating income x (1 - effective tax rate)
      invested_capital = equity + net debt;  roic = nopat / invested capital
    """
    out = []
    for key, tk in tickers.items():
        inc, bal, cf = _stmt(tk, "income", raw), _stmt(tk, "balance", raw), _stmt(tk, "cash", raw)
        if inc.empty or bal.empty or cf.empty:
            print(f"{key}: missing a statement for {tk}; skipped")
            continue
        for y in sorted(set(inc.index) & set(bal.index) & set(cf.index)):
            i, b, c = inc.loc[y], bal.loc[y], cf.loc[y]
            pretax = i.get("incomeBeforeTax") or np.nan
            tax_rate = i.get("incomeTaxExpense", np.nan) / pretax if pretax and pretax > 0 else np.nan
            tax_rate = min(max(tax_rate, 0), 0.5) if pd.notna(tax_rate) else 0.26  # 0.26 ~ a typical Canadian combined rate (assumption)
            nopat = i.get("operatingIncome", np.nan) * (1 - tax_rate)
            ic = b.get("totalStockholdersEquity", np.nan) + b.get("netDebt", np.nan)
            out.append({
                "key": key, "ticker": tk, "year": y, "currency": i.get("reportedCurrency"),
                "revenue": i.get("revenue"), "operating_income": i.get("operatingIncome"),
                "ebitda": i.get("ebitda"), "tax_rate": tax_rate, "nopat": nopat,
                "equity": b.get("totalStockholdersEquity"), "net_debt": b.get("netDebt"),
                "goodwill_intangibles": (b.get("goodwill") or 0) + (b.get("intangibleAssets") or 0),
                "invested_capital": ic, "roic": nopat / ic if ic and ic > 0 else np.nan,
                "ocf": c.get("operatingCashFlow"), "capex": c.get("capitalExpenditure"),
                "fcf": c.get("freeCashFlow"), "acq_spend": -(c.get("acquisitionsNet") or 0),
                "buybacks": -(c.get("commonStockRepurchased") or 0),
                "dividends": -(c.get("dividendsPaid") or 0),
                "shares_issued": c.get("commonStockIssued") or 0,
            })
    return pd.DataFrame(out)


def statement_scorecard(st, years=3):
    """One row per company over the last `years` fiscal years."""
    rows = []
    for key, g in st.groupby("key"):
        g = g.sort_values("year")
        last, w = g.iloc[-1], g.tail(years)
        first = g[g["year"] == last["year"] - years]
        r = {"key": key, "currency": last["currency"], "last_fy": int(last["year"])}
        r["revenue_cagr"] = ((last["revenue"] / first["revenue"].iloc[0]) ** (1 / years) - 1
                             if len(first) and first["revenue"].iloc[0] > 0 else np.nan)
        r["fcf_margin"] = w["fcf"].sum() / w["revenue"].sum()
        r["reinvestment"] = w["acq_spend"].sum() / w["fcf"].sum() if w["fcf"].sum() > 0 else np.nan
        r["roic"] = last["roic"]
        if len(first):
            d_nopat = last["nopat"] - first["nopat"].iloc[0]
            d_ic = last["invested_capital"] - first["invested_capital"].iloc[0]
            r["incremental_roic"] = d_nopat / d_ic if d_ic > 0 else np.nan
        else:
            r["incremental_roic"] = np.nan
        r["net_debt_to_ebitda"] = last["net_debt"] / last["ebitda"] if last["ebitda"] and last["ebitda"] > 0 else np.nan
        r["fcf_last"] = last["fcf"]
        r["acq_spend_window"] = w["acq_spend"].sum()
        r["fcf_window"] = w["fcf"].sum()
        rows.append(r)
    return pd.DataFrame(rows).set_index("key")


if __name__ == "__main__":
    t = load_all()
    OUT.mkdir(parents=True, exist_ok=True)
    for name, df in t.items():
        df.to_csv(OUT / f"{name}.csv", index=name in ("coverage", "scorecard"))
    print(f"{len(t['companies'])} companies, {len(t['metrics'])} metric values, "
          f"{len(t['events'])} events, {len(t['deals'])} deal rows -> {OUT}/")
    pd.set_option("display.width", 200)
    print(t["scorecard"][["as_of", "basis", "revenue_ttm", "revenue_growth", "fcf_margin",
                          "reinvestment_2y", "net_debt_to_fcf", "named_deals"]].round(3))
