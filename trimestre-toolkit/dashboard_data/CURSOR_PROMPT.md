Important update to the hackathon project.

Do NOT throw away the existing application or architecture. Keep the existing CSV/API adapters, demo mode, charts,
normalized data model and error handling. Do not redesign unrelated working parts.

The company being analyzed is WSP Global (TSX: WSP).
Central product question: **"Should WSP be admitted to the investment index?"**
The dashboard must build an evidence-based argument, not show generic financial metrics.

Layout: a decision summary at the top, then SIX panels.
Panels 1–2 describe the company and its acquisitions. Panels 3–6 build the admission argument.

---

## STEP 0 — Data wiring (do this first)

Two kinds of data:
- **Live from the Onesheet API** (company profile, quotes, prices, statements, FX). Section A.
- **Curated CSV files** that the API does not provide (Dealroom extracts, press-release facts, verified earnings-call
  claims, peer headcount). Section B. Load them through the existing CSV adapter.

### A. Onesheet API

**Base URL:** `https://api.onesheet.pro/v1`
**Auth:** header `X-API-Key: <key>`. Read the key from an environment variable (e.g. `ONESHEET_API_KEY` in `.env`).
**Never ship the key to the browser and never commit it**: call the API from a server-side route / proxy
(or a build-time fetch script), not from client code.

**Response envelope (all endpoints):** `{ "success": true, "data": <payload>, "meta": {...} }`
**Errors:** `{ "success": false, "error": { "message", "code", "statusCode" } }`. Seen in practice:
`404 NOT_FOUND` (unknown symbol/key), `404 NO_DATA`, `400 VALIDATION_ERROR`, `500 EXTERNAL_API_ERROR`,
`429 ENDPOINT_RATE_LIMIT_EXCEEDED` (with a `Retry-After` header).

**Rate limits:** each endpoint has a weight against a per-minute budget; `/company-profiles/{key}` is additionally
limited to **10 calls per minute**. Make calls sequentially, retry on 429 and 503 after `Retry-After` seconds
(or exponential backoff), and **cache every response** (memory + disk/JSON) so a page reload does not refetch.
Lists are capped at 250 records per page.

**Identifiers — this matters, we got it wrong once:**
- Deep company profile uses the **company key**: `wsp` (not the ticker).
- Market data and statements use the **ticker with exchange suffix** for Canadian listings: `WSP.TO`.
  A bare `WSP`/`CSU`-style ticker can resolve to a different US company. Always check that the quote's `name`
  matches the expected company before using the data.
- US peers and index members use plain tickers: `ACM`, `J`, `TTEK`, `KBR`, `AME`, `WCN`, `BRO`, `IEX`, `ETN`, `ROP`,
  `TDY`, `TDG`, `HEI`, `POOL`, `WSO`, `DHR`. Stantec is expected to be `STN.TO`.
- Verified to work tonight: `wsp` (profile), `WSP.TO` (quote, prices, market cap, statements), and statements for
  ACM, J and all 14 index members. **Not yet verified:** STN.TO, TTEK, KBR statements and index-member price history.
  If a symbol fails, resolve it with `GET /stocks/symbols/search/{query}` (returns `[{symbol, name, exchange, currency, listings[]}]`).

#### Endpoints to use

| # | Endpoint | Used for | Payload (`data`) |
| --- | --- | --- | --- |
| 1 | `GET /company-profiles/wsp` | Panels 1, 2, 5 | Deep profile, see structure below |
| 2 | `GET /stocks/quotes/WSP.TO` | Panel 1 quote card, Panel 4 issue-price card | `{symbol, name, price, change, changesPercentage, dayLow, dayHigh, yearHigh, yearLow, marketCap, priceAvg50, priceAvg200, volume, exchange, open, previousClose, timestamp}` (price and marketCap in CAD for WSP.TO) |
| 3 | `GET /stocks/historical/{symbol}` | Panel 1 price chart (WSP.TO), Panel 6 (WSP.TO + 14 members) | Array of `{date, open, high, low, close, adjClose, volume, change, changePercent, vwap}`; returns the **~100 most recent trading days** (no documented parameter for more) |
| 4 | `GET /stocks/historical/WSP.TO/marketcap` | Panel 1 market-cap chart | Array of `{date, value}` (~1 year, daily, CAD) |
| 5 | `GET /financials/statements/{symbol}/income` | Panels 1, 3, 4 | Array, one object per fiscal year (`period: "FY"`, newest first, ~5 years): `date, calendarYear, reportedCurrency, revenue, ebitda, operatingIncome, incomeBeforeTax, incomeTaxExpense, netIncome, eps, epsdiluted, weightedAverageShsOut, weightedAverageShsOutDil` |
| 6 | `GET /financials/statements/{symbol}/balance` | Panels 1, 3 | Same shape: `date, totalStockholdersEquity, totalDebt, netDebt, cashAndCashEquivalents, goodwill, intangibleAssets` |
| 7 | `GET /financials/statements/{symbol}/cash` | Panels 1, 2, 3, 4 | Same shape: `date, operatingCashFlow, capitalExpenditure (negative), freeCashFlow, acquisitionsNet (negative = cash spent), commonStockIssued, commonStockRepurchased (negative), dividendsPaid (negative)` |
| 8 | `GET /forex/{pair}` | Currency conversion if ever needed | `{pair, rate, timestamp}`. **Only USD-based pairs:** USDCAD, USDEUR, USDGBP, USDJPY, USDCNY, USDTWD. EUR→CAD = USDCAD / USDEUR |
| 9 | `GET /stocks/symbols/search/{query}` | Resolving tickers | See above |

Statement endpoint names are exactly `income`, `balance`, `cash`. Join the three statements on fiscal year (`date`).

**Do NOT use:** `/financials/growth/{symbol}/metrics` (needs an undocumented `metric` parameter → 400),
`/kpis/segments-and-kpis/{symbol}` (heaviest endpoint, returned empty in tests), `/financials/ratios/{symbol}`
(definitions differ from ours; we compute our own ratios).

#### Deep profile structure (`GET /company-profiles/wsp` → `data`)

```
schemaVersion: "company-profile-consumer-v2"
profile:
  identity: { key, name, cik, sedarProfile, listings: [{symbol, exchange, market}], fiscalYearEnd, reportingCurrency }
  overview: { description, entityCounts, slots: [...] }
  entities: [ { name, kind, aliases, description, segmentBasis, path } ]   # kind: company | segment | business-line | subsidiary | other ...
events: [ {
  type,            # acquisition | financing | capital-return | milestone | partnership | divestiture | discontinuation ...
  status,
  date: { occurredOn (YYYY-MM-DD or null), precision (day | month | null), expectedBy, periodLabel },
  entity: { name, kind }, related: [],
  summary,
  attributes: { amount (TEXT as written; units vary), counterparty, currency, ... },
  sources: [ { source, formType, filedOn, quote } ]
} ]
metrics: [ { metricId, metricName, metricFormat, isCurrency, isPerShare, isKeyMetric, slotKey } ]   # definitions
data: [ {          # one object per period
  periodId, periodType,   # Quarterly | Annual | PointInTime | NineMonths | SemiAnnual
  reportDate (YYYY-MM-DD, calendar quarter end), fiscalYear, fiscalQuarter, calendarYear, calendarQuarter,
  metricValues: { <metricId>: { value, unit, currency, adjusted, origin, sources: [ { source, formType, filedOn, quote } ] } }
} ]
```

Flatten it once into a long table: one row per (period × metricId) with
`metric_id, metric_name (from metrics[]), period_type, report_date, fiscal_year, fiscal_quarter, value, unit, currency, quote (sources[0].quote), form, filed_on`.
Flatten events into `date, precision, type, status, summary, counterparty, amount_as_written, amount_currency, quote, filed_on`.

**Units:** `value` is in **actual units** (18285000000 = 18.285 billion). Percent-type metrics are **decimals**
(`*_change_pct`, `*_margin`: 0.215 = 21.5%). Ratios such as `net_debt_to_adjusted_ebitda_ratio` are plain numbers (2.2 = 2.2x).
`attributes.amount` in events is free text with mixed units: display as written, **never sum or compute with it**.

**Currencies:** WSP reports in **CAD**; US peers in **USD**. Never add or compare absolute amounts across currencies;
ratios are fine.

**Sources:** every number shown needs a visible source: the filing `quote` for profile data, or the endpoint name
(e.g. "Onesheet /financials/statements/WSP.TO/cash, FY2025") for API data.

### B. Curated CSV files (not available from the API)

Location: `trimestre-toolkit/data/external/` (and `output/claims.csv`). Copy into the app's static data folder.

| File | What it is | Panel |
| --- | --- | --- |
| `dealroom_wsp.csv` | WSP equity/debt raises, EV/EBITDA history, headcount (flagged unreliable) | 1, 2, 4 |
| `deal_targets.csv` | One row per acquired/targeted company (POWER, Ricardo, TRC, Arcadis, GCM Corpo, Hulley & Kirkwood, e2m), from press releases + Dealroom | 2, 4 |
| `deal_promises.csv` | Management promises with deadline, result, status, sources (press releases, earnings calls) | 5 |
| `deal_target_headcount.csv` | Dealroom monthly headcount per target (context only) | 2 |
| `peer_headcount.csv` | Employees for WSP and the 5 peers | 3 (optional) |
| `output/claims.csv` (filter `key == "wsp"`) | Earnings-call claims with quotes verified against transcripts | 5 |

**quality_flag rules:** `ok`, `rounded_to_100` → use normally; `currency_unverified` → dated events/context only, never
in calculations; `unconfirmed`, `not_relevant`, `no_amount` → show with `note`, or skip; `forecast` → label "Forecast";
`conflicts_with_filings`, `linkedin_style_estimate` → never use as headcount, context only with `note` visible.
Never sum financing amounts across rows (mixed currencies; some raises split in two rows).

### C. Offline fallback (demo safety)

`trimestre-toolkit/dashboard_data/` holds a snapshot of the same API data as clean CSVs (generated by
`python export_dashboard_data.py`, columns listed in its `manifest.json`). If the API is unreachable or rate-limited
during the demo, load the snapshot instead and show a small "Snapshot data as of <date>" badge. Demo Mode must keep working.

### D. Missing data
If an endpoint fails or returns empty for a panel's inputs, that panel (or element) shows **"Insufficient data"** with
the reason (endpoint + error code). Never estimate or fill gaps.

---

## Calculations (do these in the app, exactly as defined)

Per company and fiscal year, from endpoints 5–7:
- `tax_rate = incomeTaxExpense / incomeBeforeTax`, clamped to [0, 0.5]; if incomeBeforeTax ≤ 0 use 0.26 (show "assumed")
- `nopat = operatingIncome × (1 − tax_rate)`
- `invested_capital = totalStockholdersEquity + netDebt`; `roic = nopat / invested_capital` (blank if invested_capital ≤ 0)
- `acquisitions_cash = −acquisitionsNet` (positive = spent)

Over the last 3 fiscal years (window = last FY − 3 → last FY):
- `revenue_cagr = (revenue_last / revenue_first)^(1/3) − 1`
- `fcf_margin = Σ freeCashFlow / Σ revenue` (last 3 FY)
- `reinvestment = Σ acquisitions_cash / Σ freeCashFlow` (last 3 FY; blank if Σ FCF ≤ 0)
- `roic` = last FY; `net_debt_to_ebitda = netDebt / ebitda` (last FY)
- rank each metric among WSP + peers (1 = best; for net_debt_to_ebitda lower is better)

Per share (WSP.TO, every FY available), diluted shares = `weightedAverageShsOutDil`:
- `revenue_per_share`, `fcf_per_share = freeCashFlow / shares`, `net_income_per_share`, plus `epsdiluted` as reported
- rebased series: each series ÷ its first-year value × 100
- CAGR over the full window for totals, per-share series and share count

Deal de-duplication (profile events with `type = "acquisition"`):
- aggregate line if counterparty or summary matches `/number of|multiple|various|additional acquisitions/i`
- named deals: key = first word of the lower-cased counterparty; keep one row per (key, date); drop undated rows whose
  key already has a dated row; prefer rows with an amount

---

## Panel 1 — WSP at a glance (descriptive)

| Element | Source |
| --- | --- |
| Identity card (name, exchange, reporting currency, fiscal year end, description) | Endpoint 1: `profile.identity`, `profile.overview.description` |
| Quote card (price, market cap, 52-week high/low, 200-day avg, % below 52-week high) | Endpoint 2 |
| Business structure (4 regions, sector business lines) | Endpoint 1: `profile.entities` where kind = segment / business-line |
| Market cap, last year (line) | Endpoint 4 |
| Price, last ~100 trading days (line) + horizontal reference line at the TRC issue price (see Panel 4) | Endpoint 3, symbol WSP.TO |
| Net revenue by region (stacked bars, Quarterly) | Profile metrics `americas_net_revenue`, `canada_net_revenue`, `emeia_net_revenue`, `apac_net_revenue` |
| Net revenue by sector (if present) | Profile metric ids ending in `_net_revenue` that are not regions (e.g. `earth_environment_net_revenue`); skip silently if none |
| Backlog total + by region | `backlog`, and ids ending in `_backlog_by_segment` (PointInTime) |
| Adjusted EBITDA + margin, total and by region | `adjusted_ebitda`, `adjusted_ebitda_margin`, `adjusted_{americas,canada,emeia,apac}_ebitda(_margin)` (Quarterly) |
| Organic vs acquisition growth per quarter | ids containing `organic`; `net_revenue_acquisition_growth_change_pct` |
| Free cash flow per quarter | `free_cash_flow` (Quarterly) |
| Leverage with the company's 1.0x–2.0x target band | `net_debt_to_adjusted_ebitda_ratio` (PointInTime) |
| Debt, cash, DSO | `debt`, `cash`, `days_sales_outstanding` |
| Guidance ranges | `adjusted_ebitda_guidance_low/high`, `capex_guidance_low/high` |
| Employees | `employees` (PointInTime). **Do not use Dealroom headcount for WSP** |
| 5-year annual summary | Endpoints 5–7 for WSP.TO: revenue, ebitda, netIncome, epsdiluted, freeCashFlow, netDebt |
| Valuation context card | `dealroom_wsp.csv`: dataset = valuation, metric = ev_to_ebitda, is_forecast = "no" |
| Event timeline (filter by type) | Endpoint 1 `events`, newest first; undated events in an "Undated" list; summary + quote |

## Panel 2 — Acquired companies (descriptive)

| Element | Source |
| --- | --- |
| Deal cards/table (status, dates, price + basis, focus, employees, HQ, founded) | `deal_targets.csv` (Arcadis = "Abandoned", GCM Corpo = "Announced") |
| Price paid | `deal_targets.csv` multiple_paid **always with** multiple_basis (TRC = forward EBITDA; Ricardo = trailing, computed) |
| How each deal was funded | `deal_targets.csv` funding_of_deal; Endpoint 1 events type = financing; `dealroom_wsp.csv` dataset = financing with linked_deal |
| Full acquisition timeline incl. tuck-ins | Endpoint 1 events type = acquisition, de-duplicated (rules above); aggregate lines shown as "multiple small deals" |
| Subsidiaries list | Endpoint 1 `profile.entities` where kind = subsidiary |
| Cash spent on acquisitions vs FCF per year | Endpoint 7 (WSP.TO): acquisitions_cash, freeCashFlow |
| Acquisition growth contribution per quarter | Profile metric `net_revenue_acquisition_growth_change_pct` |
| Target headcount sparklines (context only) | `deal_target_headcount.csv`, note visible; never labelled as attrition |

## Panel 3 — Peer-relative admission test

Peers: AECOM (`ACM`), Jacobs (`J`), Stantec (`STN.TO`), Tetra Tech (`TTEK`), KBR (`KBR`).
- Call endpoints 5–7 for WSP.TO and each peer; compute the 3-year metrics and ranks (Calculations section).
- Table + rank chart, WSP highlighted, "#k of n".
- Optional, secondary, caveated: revenue per employee = latest revenue ÷ `peer_headcount.csv` employees (gross revenue includes
  subcontractor pass-through; fiscal years differ). Not used in the verdict.
- Goal: whether WSP failed an absolute threshold because engineering firms structurally run thinner margins than
  high-margin businesses. Compute; do not hard-code conclusions.
- Fewer than 3 peers with data → pillar = INSUFFICIENT DATA, listing which peers failed and why.

## Panel 4 — Value creation PER SHARE (HIGHEST PRIORITY)

Source: endpoints 5 and 7 for WSP.TO (all fiscal years returned).

Charts:
1. **Total FCF vs FCF per share** (rebased to 100)
2. **Share count over time** (`weightedAverageShsOutDil`), with vertical markers at each equity raise from
   `dealroom_wsp.csv` (dataset = financing, metric starts with "equity", label = linked_deal; amounts from
   linked_deal_confirmed_by, not Dealroom amounts)
3. Total revenue vs revenue per share (rebased)
4. Total net income vs diluted EPS (rebased)
5. **Issue price vs today:** TRC equity raise price C$232.80 and shares issued (3,145,000 public + ~C$118M private
   placement at the same price), from `deal_targets.csv` row "TRC Companies" (funding_of_deal, source in funding_source),
   vs current price from Endpoint 2. Show issue price, current price, % difference.

Summary table: total CAGR vs per-share CAGR for revenue, FCF and earnings, plus share-count CAGR. Also show the
year-by-year path (per-share values can fall in some years even if the full window is positive).
Key question: did growth translate into per-share value creation, or was much of it bought through dilution?
Do NOT manufacture an answer.

## Panel 5 — Deal tracker: Promise vs Result

Rows from `deal_promises.csv` (primary) + `claims.csv` filtered to key = "wsp" (secondary).
Columns: Deal, Management Promise, Actual Result, Status, Deadline, Source.
- deal_promises.csv: deal, promise, result, status, deadline, promise_source + result_source.
- claims.csv: target → Promise (claim_quote shown as quote), outcome → Result, verdict mapped: Kept → Delivered;
  "Kept, with dilution" → Delivered (note: partly funded with new shares); At risk → Mixed; Abandoned → Missed.
  "Quote verified" tick when quote_verified is True.
- Same promise in both files → keep the deal_promises.csv row.
- Where a result references a profile metric (e.g. leverage), show the latest live value from Endpoint 1 next to it.
- Statuses: Delivered / Delivered (management-reported) / On Track / Mixed / Not Yet Measurable / Missed (deal abandoned).
- Do not invent promises or results.

## Panel 6 — Index fit (label: **Simplified index-fit analysis**)

Source: Endpoint 3 for `WSP.TO` and the 14 index members: AME, WCN, BRO, IEX, ETN, ROP, TDY, TDG, ACM, HEI, J, POOL, WSO, DHR.
1. Daily returns from adjClose; keep dates where WSP.TO and the member both have prices.
2. WSP annualized volatility = stdev(daily returns) × √252.
3. Correlation of WSP with each member, and the average.
4. Equal-weighted members vs members + WSP at w = 1/(n+1): annualized volatility before, after, difference.
5. If feasible: long-only minimum-variance weights capped at 10% per stock, with and without WSP; WSP's suggested weight.
6. Show the date range and number of overlapping days (~100 days from this endpoint). Fewer than 5 members with ≥ 60
   overlapping days → INSUFFICIENT DATA.
7. State that we do not know the organizer's exact methodology (capped market cap → multi-signal tilt → min-vol), and
   that WSP prices are in CAD and members in USD (per-stock returns; FX effect not removed).

---

## FINAL DECISION (top of page)

WSP GLOBAL — INDEX ADMISSION ANALYSIS. Four pillars, each PASS / WATCH / FAIL / INSUFFICIENT DATA
(show the rule under each pillar; thresholds in one config object the team can tune):

| Pillar | PASS | FAIL | Otherwise |
| --- | --- | --- | --- |
| Peer Quality (Panel 3) | WSP in the top half (rank ≤ ceil(n/2)) on ≥ 3 of 5 metrics | top half on ≤ 1 metric | WATCH |
| Value Per Share (Panel 4) | FCF-per-share CAGR > 0 AND diluted-EPS CAGR > 0 AND share-count CAGR < revenue CAGR | FCF-per-share CAGR ≤ 0 | WATCH |
| Deal Execution (Panel 5) | no "Missed" excluding "(deal abandoned)", and Delivered + On Track ≥ 2 | ≥ 2 Missed (excluding abandoned) | WATCH; INSUFFICIENT if < 3 measurable rows |
| Portfolio Fit (Panel 6) | volatility with WSP ≤ without | — | WATCH |

FINAL VERDICT: **ADMIT** if ≥ 3 PASS and no FAIL; **REJECT** if ≥ 2 FAIL; **INSUFFICIENT DATA** if ≥ 2 pillars are
insufficient; otherwise **WATCH**. Panels 1–2 never affect the verdict.

---

## Acceptance checks (verify the wiring; do not hard-code)

Live values change daily; these were observed on 2026-11-12:
- Endpoint 2 (WSP.TO): name "WSP Global Inc.", price ≈ **184.33**, marketCap ≈ **24.85B**, yearHigh **275.24**
- Endpoint 1: latest `backlog` **20.3B** (2026-09-30), latest `net_debt_to_adjusted_ebitda_ratio` **2.2**, latest `employees` **85,500**
- Panel 4 (statements): diluted shares **116.9M (FY2021) → 131.0M (FY2025)**; FCF per share **7.92 → 14.26**; diluted EPS **4.05 → 7.36**
- Panel 3 with ACM and J only: WSP ranks **#1 of 3 on fcf_margin (0.073)**
- Panel 5: TRC leverage promise **On Track**; Arcadis **Missed (deal abandoned)**
- A wrong identifier (e.g. quote for `WSP` instead of `WSP.TO`) must be caught by the name check, not displayed

## VERY IMPORTANT

Do NOT implement yet (stretch goals): external macroeconomic demand panel; Deck agent acquisition runway.

Priority:
1. Step 0 data wiring (API client with caching, retries, key on the server, CSV loading, snapshot fallback)
2. Per-share value creation (Panel 4)
3. Peer-relative analysis (Panel 3)
4. WSP at a glance (Panel 1)
5. Acquired companies (Panel 2)
6. Deal execution (Panel 5)
7. Index fit (Panel 6)
8. Final verdict

Keep the existing generic Competitive Edge infrastructure (we may still need organizer CSV/API data).

After implementing:
- run tests and `npm build`
- verify Demo Mode still works, and that the snapshot fallback works with the network off
- verify each acceptance check
- verify a failing endpoint produces "Insufficient data" with the reason
- confirm the API key is not present in the client bundle
- report which symbols/endpoints failed and which panels they block
