# Trimestre toolkit: Windows + Anaconda cheat sheet

Pull Onesheet data for your 5 companies and turn it into tables in about 10 minutes.

| File | What it does |
| --- | --- |
| `onesheet.py` | API client: sends the key, retries on rate limits, caches every call to disk |
| `pull.py` | Pulls every useful endpoint for a list of tickers into `data/raw/` |
| `explore.py` | Shows the JSON structure, searches it, and flattens it into CSV tables |
| `analysis.ipynb` | Starter notebook: serial acquirer scorecard, charts, sources, Excel export |

## Every time you open a terminal

Use **Command Prompt**, not PowerShell (PowerShell blocks Anaconda on this laptop).

1. In VS Code's terminal panel: **⌄** next to **+** → **Command Prompt**.
   To make it the default: Ctrl+Shift+P → "Terminal: Select Default Profile" → Command Prompt.
2. The prompt should start with `(base)`. If not, run:
   ```
   C:\Users\eglan\anaconda3\Scripts\activate.bat
   ```
   If your 3.11 is a separate environment, then also run `conda activate ENV_NAME` (list them with `conda env list`).
3. Check: `python --version`

## Before 5 p.m. (once)

In that terminal, inside the `trimestre-toolkit` folder:

```
python -m pip install -r requirements.txt
python pull.py --help
```

If you see the usage text, you're ready. Use `python -m pip`, not plain `pip` (pip isn't on your PATH).

## At kickoff

**1. Set the key** (Command Prompt syntax: no quotes, no spaces around `=`):

```
set ONESHEET_API_KEY=paste_key_here
```

It lasts only for **this** terminal window. New terminal = set it again (and activate Anaconda again).

**2. Check the key works:**

```
python pull.py --smoke
```

**3. Find the exact ticker format.** Canadian tickers may be `CSU.TO`, `CSU:CA`, `CSU`, etc. Don't guess:

```
python pull.py --search "constellation software"
```

**4. Pull everything for your 5 tickers:**

```
python pull.py TICKER1 TICKER2 TICKER3 TICKER4 TICKER5 --transcripts 4
```

Deep profiles are limited to 10 calls per minute, so the script waits automatically. Check `data\raw\manifest.csv` for anything that failed. Tickers with characters Windows doesn't allow in folder names are saved with `_` instead (e.g. `CSU:CA` → folder `CSU_CA`); the script prints this.

**5. If you got the data pack instead (or as well).** Put the path in quotes if it has spaces:

```
python explore.py ingest "C:\Users\eglan\Downloads\data-pack"
```

**6. Look at the structure of a deep profile:**

```
python explore.py tree data/raw/TICKER1/company_profile.json
python explore.py find data/raw/TICKER1/company_profile.json acquisition
```

**7. Flatten everything into tables:**

```
python explore.py flatten
```

Open `data\tables\INDEX.csv` first. Tables in `data\tables\combined\` stack all companies with a `symbol` column, so they open directly in Excel.

**8. Analyze in the notebook.** Open `analysis.ipynb`, click **Select Kernel** (top right) and pick your Anaconda environment. Set your tickers in step 2 **using the folder names** in `data\raw\` (e.g. `CSU_CA`, not `CSU:CA`). Run cells top to bottom. Cells marked **SET ME** print their guesses about which tables and columns to use; fix them there if a guess is wrong.

## If something breaks

| You see | Fix |
| --- | --- |
| `'pip' is not recognized` | Use `python -m pip ...` |
| `Python was not found` / `conda is not recognized` | You're in PowerShell or Anaconda isn't activated. Switch to Command Prompt and run `activate.bat` (above) |
| `running scripts is disabled on this system` | That's PowerShell. Switch to Command Prompt |
| `No API key` | Run `set ONESHEET_API_KEY=...` in **this** terminal |
| `401` | Key typed wrong, or quotes included. Retype it with no quotes |
| `can't open file 'pull.py'` | Terminal is in the wrong folder. Right-click `trimestre-toolkit` in the sidebar → "Open in Integrated Terminal" |
| `PermissionError` while saving files | Possibly OneDrive syncing the `data` folder. Pause OneDrive syncing for the evening and rerun (cached calls are free) |
| `No module named ...` in the notebook | The notebook kernel isn't your Anaconda env. Select Kernel → pick it |

## Things the spec does not tell us (check on the night)

- **Response fields.** The spec documents no fields inside `data`. That's why the flattener is generic. Run `tree` before building anything on top.
- **Statement names.** `/financials/statements/{symbol}/{statement}` doesn't list valid values. The script tries `income`, `balance`, `cash`. If they fail in the manifest, ask the organizers and rerun with e.g. `--statements income-statement balance-sheet cash-flow-statement --only statement_income-statement statement_balance-sheet statement_cash-flow-statement`.
- **Overall rate limit.** Each endpoint has a "weight" (KPIs = 100, transcripts = 10, quotes = 1), which probably counts against a per-minute budget. The client retries on 429 automatically. If you hit it often, pull fewer endpoints with `--only`.
- **Data history.** Organizers said about 2 years for most profiles.

## Useful flags

```
python pull.py T1 --only company_profile kpis    # just these endpoints
python pull.py T1 --no-cache                     # force fresh data
```

Endpoint names for `--only`: company_profile, kpis, fundamentals, profile, ratios, growth, growth_metrics, quote, marketcap_history, price_history, estimates, peers, dividends, transcript_dates, news, insider, statement_income, statement_balance, statement_cash

## Calling the API from the notebook

The notebook does **not** see a key you `set` in the terminal. If you call the API from a notebook, set it in a cell first:

```python
import os
os.environ["ONESHEET_API_KEY"] = "paste_key_here"   # delete before sharing the notebook

from onesheet import Onesheet
api = Onesheet()
p = api.company_profile("CSU.TO")["data"]
t = api.transcript("CSU.TO", 2025, 2)["data"]
```

## Keep the key out of anything you share

Don't leave it in a notebook cell, slides, or a public GitHub repo. `data\cache\` doesn't contain the key, but it does contain the data, so check the hackathon's rules before publishing it.
