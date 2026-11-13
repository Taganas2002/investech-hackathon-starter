# WSP Global — Index Admission Analysis

*Trimestre Q4 · Investech Hackathon (Onesheet × Deck, Montréal, November 12, 2026)*

**Question:** should WSP Global (TSX: WSP) be admitted to Onesheet's *Serial Acquirers & Consolidators* index?

Instead of a stock pitch, we built a tool that answers that question with evidence: it measures a Canadian candidate exactly like the companies already in the index, checks whether its growth actually reaches shareholders, and checks whether management does what it says.

---

## 1. The challenge

Onesheet runs two live indexes: *REITs across borders* and *Serial acquirers & consolidators* (15 holdings, mostly US: AMETEK, Waste Connections, Brown & Brown, IDEX, Eaton, Roper, Teledyne, TransDigm, AECOM, HEICO, Jacobs, Pool, Watsco, Danaher, plus one Italian holding). Both are built by "capped market cap → multi-signal tilt → min-vol optimization".

The mission: **complete these indexes with Canadian companies**, five candidates per index, "all 5 or just 1". The organizers stressed that *the pick isn't what matters most*: every stock in their indexes was selected by a custom tool that revealed why the business is attractive.

Serial acquirer candidates: Constellation Software (CSU), Topicus.com (TOI), TFI International (TFII), WSP Global (WSP), Aecon Group (ARE).

## 2. Our approach

### Step 1 — Screen all five candidates against the index
Each candidate and each current index member was measured the same way, from standardized financial statements (last 3 fiscal years):

| Test | Measure |
| --- | --- |
| Is it a serial acquirer? | Acquisition spend ÷ free cash flow |
| Does buying produce growth? | Revenue growth per year |
| Does it generate cash? | Free cash flow margin |
| Are returns good? | Return on invested capital (ROIC) |
| Is the balance sheet safe? | Net debt ÷ EBITDA |
| Does management deliver? | Earnings-call promises checked against later filings |

A candidate passes a test if it is at least as good as the weakest quarter of the current members.

| Candidate | Result |
| --- | --- |
| Constellation Software | Passes every test |
| Topicus | Passes every financial test (no recent earnings calls in the data) |
| WSP | Fails only free cash flow margin |
| TFI International | Fails margins, returns, leverage and management delivery |
| Aecon | Net seller of businesses: not a serial acquirer |

### Step 2 — Why WSP
Constellation and Topicus are the obvious picks. WSP is the interesting one:
- Canada's most aggressive consolidator: it reinvested **88% of its free cash flow** into acquisitions (index median 52%) and grew revenue **~15% a year** (index median 7%). Recent deals: POWER Engineers (2024), Ricardo (2025), TRC (2026), plus a rejected bid for Arcadis (2026).
- It failed only the free cash flow margin test (7% vs a bar of 11%). That test isn't fair to an engineering firm: it sells people's time, so margins are structurally thinner than at a software company like Constellation.
- It partly funded deals by issuing new shares.

So the real question became: **is WSP's growth real, and does it reach existing shareholders?**

### Step 3 — Build a dashboard that answers it
Each section responds to one issue raised by the screen:

| Issue | Section | What it does |
| --- | --- | --- |
| A margin test built around software companies | **Peer comparison** | Compares WSP with engineering peers: AECOM and Jacobs (already in the index), Stantec, Tetra Tech, KBR |
| Growth partly funded by issuing shares | **Value per share** | Revenue, free cash flow and earnings per diluted share vs totals; share count over time; TRC issue price vs today |
| Growth depends on big deals | **Acquisitions** and **Deal execution** | What WSP bought, what it paid, how it funded each deal; management's promises vs what later filings showed |
| The index minimizes volatility | **Index fit** | Whether adding WSP raises or lowers the volatility of the current members |
| Context | **WSP at a glance** | Business mix, backlog, margins, growth mix, leverage, employees, events |

A **Decision** page combines four pillars into a verdict (rules in §5).

## 3. Findings (data as of November 12, 2026)

- **WSP beats its engineering peers on growth:** ~15% a year vs ~7% for AECOM and Jacobs, with a higher FCF margin than both. It trails them on return on capital and carries more debt, the usual trade-off of a serial acquirer (acquisitions add goodwill to invested capital and are partly debt-funded).
- **Growth reached shareholders despite dilution:** 2021–2025, diluted shares grew ~3% a year; free cash flow per share still grew ~16% a year (vs ~19% in total) and revenue per share ~12% (vs ~15%).
- **Acquisitions outran cash flow:** WSP spent ~1.35x its free cash flow on acquisitions over 2021–2025, funded with debt and new shares. TRC (paid February 2026) is not yet in these annual figures. The TRC shares were issued at C$232.80; the stock traded around C$184 on November 12, 2026.
- **Management is on track, not yet proven:** leverage was 2.2x in September 2026 against a promise of under 2.0x within 12 months of the TRC closing (~February 2027). Most TRC promises (EPS accretion, synergies) are measurable only in 2027.

**Verdict: admit WSP, with leverage in February 2027 as the proof point to watch.**

These findings are sensitive to the peer set (only AECOM and Jacobs were loaded when they were computed) and to the time window. The index-fit result depends on index-member price data being available.

## 4. Data sources

| Source | Used for |
| --- | --- |
| **Onesheet API** (live, primary) | Deep company profile (segments, events, ~100 metrics, each value linked to a filing quote), quotes, daily prices, market cap history, annual financial statements, earnings call transcripts, FX rates |
| **WSP press releases** | Deal terms and promises: TRC (Dec 15, 2025), Arcadis proposal (Jul 24, 2026), GCM Corpo (Oct 1, 2026), Hulley & Kirkwood (Sep 29, 2026), e2m (Oct 7, 2026) |
| **Dealroom** (exports, Nov 12, 2026) | WSP financing history and EV/EBITDA history; profiles of acquired/targeted companies (POWER, TRC, Ricardo, Arcadis, GCM, Hulley & Kirkwood, e2m) |
| **Earnings call transcripts** (via Onesheet) | Management claims, each quote verified word for word against the transcript |
| **Team research** | Peer headcount (approximate, to be sourced) |

### API notes learned during the build
- Base URL `https://api.onesheet.pro/v1`, header `X-API-Key`; responses `{success, data, meta}`.
- The deep profile uses a **company key** (`wsp`); market data and statements use the **exchange-suffixed ticker** (`WSP.TO`). A bare `CSU` returned a US company (Capital Senior Living), so every quote's name is checked.
- `/company-profiles/{key}` is limited to 10 calls/minute; price history returns ~100 trading days.
- Forex supports only USD-based pairs (EUR→CAD = USDCAD ÷ USDEUR).

## 5. Methodology

**Statement-based measures** (same definitions for every company):
- tax rate = income tax ÷ pre-tax income, capped 0–50% (26% assumed if not computable)
- NOPAT = operating income × (1 − tax rate); invested capital = equity + net debt; ROIC = NOPAT ÷ invested capital
- reinvestment = 3-year acquisition spend ÷ 3-year free cash flow
- FCF margin = 3-year free cash flow ÷ 3-year revenue
- revenue growth = 3-year compound annual growth rate
- per share = total ÷ diluted weighted-average shares

**Decision rules** (team judgment, adjustable in one config):

| Pillar | PASS | FAIL | Otherwise |
| --- | --- | --- | --- |
| Peer quality | Top half among peers on ≥ 3 of 5 measures | Top half on ≤ 1 | WATCH |
| Value per share | FCF per share and diluted EPS growing, and share count growing slower than revenue | FCF per share not growing | WATCH |
| Deal execution | No missed promises (excluding abandoned deals) and ≥ 2 delivered or on track | ≥ 2 missed | WATCH; insufficient if < 3 measurable |
| Index fit | Volatility with WSP ≤ without | — | WATCH |

**ADMIT** if ≥ 3 pass and none fail; **REJECT** if ≥ 2 fail; **INSUFFICIENT DATA** if ≥ 2 pillars lack data; otherwise **WATCH**.

**Index fit** is a *simplified* analysis: equal-weighted members vs members plus WSP, and a long-only minimum-variance comparison capped at 10% per stock. It does not reproduce Onesheet's proprietary methodology.

## 6. Data quality rules

- **Missing data is shown as missing**, never estimated.
- **Filings win over third-party data.** Example: Dealroom shows ~74,000 WSP employees; filings show ~85,500 (September 2026). We use the filings.
- **Company-defined metrics are not compared across companies.** Example: Constellation's own "free cash flow" (FCFA2S) was US$1.68B in 2025 vs US$2.57B standard FCF; peer measures therefore use standardized statements.
- **No sums across currencies or units.** Deal amounts in filings mix millions and thousands; they are displayed as written.
- **Third-party rows carry a quality flag** (e.g. currency unverified, forecast, conflicts with filings) that controls how they may be used.
- **Dealroom target headcount is never presented as attrition:** declines can reflect staff re-listing under WSP.

## 7. Repository structure (`trimestre-toolkit/`)

| Path | Purpose |
| --- | --- |
| `onesheet.py` | API client: authentication, retries on rate limits, disk cache |
| `pull.py` | Bulk download of endpoints for a list of tickers into `data/raw/` |
| `explore.py` | Inspect JSON structure, search it, flatten it to CSV, ingest data packs |
| `profiles.py` | Loaders: deep profiles → tidy tables; statements → standardized measures and scorecards |
| `export_dashboard_data.py` | Builds the `dashboard_data/` snapshot (offline fallback) |
| `index_screen.ipynb` | Admission screen of the 5 candidates vs the 14 index members |
| `scorecard.ipynb` | Serial-acquirer scorecard of the 5 candidates |
| `claims.ipynb` | Management claims vs results (earnings calls) |
| `data/external/` | Curated CSVs: `dealroom_wsp.csv`, `deal_targets.csv`, `deal_promises.csv`, `deal_target_headcount.csv`, `peer_headcount.csv` |
| `output/claims.csv` | Verified earnings-call claims for all candidates |
| `dashboard_data/` | Offline snapshot + `CURSOR_PROMPT.md` / `CURSOR_FIX_PROMPT.md` (dashboard build specifications) |

The dashboard application itself lives in the team's app repository and calls the Onesheet API live (server-side; the API key never reaches the browser).

## 8. How to run

Requirements: Python 3.9+ with `requests`, `pandas`, `openpyxl` (`python -m pip install -r requirements.txt`).

```
set ONESHEET_API_KEY=your_key            # Windows Command Prompt (export … on Mac/Linux)
python pull.py --smoke                    # check the key
python pull.py wsp --only company_profile
python pull.py WSP.TO ACM J STN.TO TTEK KBR --only quote statement_income statement_balance statement_cash price_history
python pull.py AME WCN BRO IEX ETN ROP TDY TDG HEI POOL WSO DHR --only quote statement_income statement_balance statement_cash price_history
python export_dashboard_data.py           # optional offline snapshot
```

Notebooks: open in VS Code / Jupyter with the same environment and run top to bottom.

Dashboard app: *[to complete: install and run commands from the app repository, and where to put `ONESHEET_API_KEY`]*.

Never commit the API key: keep it in `.env` (listed in `.gitignore`) or set it in the terminal.

## 9. Limitations

- **Short price history** (~100 trading days): index-fit results are indicative only.
- **Simplified index method:** we do not know Onesheet's signals, caps or optimizer settings.
- **Three to five years of statements:** per-share results depend on the window (FCF per share dipped in 2022–2023 before rising).
- **Standardized statements are third-party data**, not quote-backed like the deep profile; a few values look inconsistent (e.g. Constellation's 2025 operating income).
- **Management-reported results** (e.g. "double-digit growth" for POWER and TRC) are self-reported and labelled as such.
- **Thresholds are judgment calls**, shown with each pillar and adjustable.

## 10. Next steps

1. Complete the data: all five engineering peers and the index members' prices.
2. Run the same deep dive on Constellation and Topicus, to recommend the full Canadian basket ("all 5 or just 1").
3. Adapt the tool to the REIT index with real-estate measures (occupancy, same-property NOI, AFFO per unit, leverage).
4. Re-check management promises automatically as new results come out (next checkpoint: WSP Q4 2026 results, ~February 2027).
5. Estimate WSP's acquisition runway (private targets left at its current pace) using private-company data.
6. With a longer price history and the organizers' exact method, compute WSP's actual index weight.

---

*Not investment advice. Figures are as of November 12, 2026 and come from the sources above; see each source for definitions.*
