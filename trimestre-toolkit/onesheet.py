"""
Minimal client for the Onesheet Public API (https://api.onesheet.pro/v1).

Built from the OpenAPI spec shared on Nov 12, 2026. The spec does not
document response fields (every 200 returns {"success", "data", "meta"} with
an untyped "data"), so this client returns the raw envelope and leaves
parsing to explore.py.

Usage:
    export ONESHEET_API_KEY=your_key
    from onesheet import Onesheet
    api = Onesheet()
    profile = api.company_profile("CSU.TO")["data"]
"""

import hashlib
import json
import os
import pathlib
import time
from collections import deque
from urllib.parse import quote

import requests

BASE_URL = os.environ.get("ONESHEET_BASE_URL", "https://api.onesheet.pro/v1")
CACHE_DIR = pathlib.Path(os.environ.get("ONESHEET_CACHE", "data/cache"))

# /company-profiles/{symbol} has its own limit: 10 calls per minute per client.
PROFILE_CALLS_PER_MIN = 10


class OnesheetError(Exception):
    pass


def _seg(value):
    """URL-encode a path segment (tickers like 'CSU.TO' or 'BRK/B')."""
    return quote(str(value), safe="")


class Onesheet:
    def __init__(self, api_key=None, base_url=BASE_URL, use_cache=True,
                 max_retries=5, timeout=60, verbose=True):
        self.api_key = api_key or os.environ.get("ONESHEET_API_KEY")
        if not self.api_key:
            raise OnesheetError(
                "No API key. Run: export ONESHEET_API_KEY=your_key "
                "(Windows PowerShell: $env:ONESHEET_API_KEY='your_key')"
            )
        self.base_url = base_url.rstrip("/")
        self.use_cache = use_cache
        self.max_retries = max_retries
        self.timeout = timeout
        self.verbose = verbose
        self.session = requests.Session()
        self.session.headers.update({"X-API-Key": self.api_key,
                                     "Accept": "application/json"})
        self._profile_calls = deque()
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ core
    def _log(self, msg):
        if self.verbose:
            print(msg, flush=True)

    def _cache_path(self, path, params):
        key = path + "?" + json.dumps(params or {}, sort_keys=True)
        return CACHE_DIR / (hashlib.sha1(key.encode()).hexdigest() + ".json")

    def _throttle_profiles(self):
        now = time.time()
        while self._profile_calls and now - self._profile_calls[0] > 60:
            self._profile_calls.popleft()
        if len(self._profile_calls) >= PROFILE_CALLS_PER_MIN:
            wait = 60 - (now - self._profile_calls[0]) + 0.5
            self._log(f"  profile limit reached, waiting {wait:.0f}s")
            time.sleep(wait)
        self._profile_calls.append(time.time())

    def get(self, path, params=None, use_cache=None):
        """GET a path like '/stocks/quotes/AAPL'. Returns the full envelope."""
        use_cache = self.use_cache if use_cache is None else use_cache
        cache_file = self._cache_path(path, params)
        if use_cache and cache_file.exists():
            return json.loads(cache_file.read_text())["body"]

        url = self.base_url + path
        for attempt in range(self.max_retries):
            if path.startswith("/company-profiles/"):
                self._throttle_profiles()
            try:
                r = self.session.get(url, params=params, timeout=self.timeout)
            except requests.RequestException as e:
                wait = 2 ** attempt
                self._log(f"  network error ({e}); retry in {wait}s")
                time.sleep(wait)
                continue

            if r.status_code in (429, 503):
                retry_after = r.headers.get("Retry-After")
                try:
                    wait = float(retry_after)
                except (TypeError, ValueError):
                    wait = 2 ** (attempt + 1)
                self._log(f"  {r.status_code} on {path}; retry in {wait:.0f}s")
                time.sleep(wait)
                continue

            try:
                body = r.json()
            except ValueError:
                raise OnesheetError(f"{r.status_code} non-JSON from {path}: {r.text[:200]}")

            if not r.ok or body.get("success") is False:
                err = body.get("error") or {}
                raise OnesheetError(
                    f"{err.get('statusCode', r.status_code)} {err.get('code', '')}: "
                    f"{err.get('message', r.text[:200])} ({path})"
                )

            cache_file.write_text(json.dumps(
                {"path": path, "params": params,
                 "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "body": body}))
            return body

        raise OnesheetError(f"Gave up on {path} after {self.max_retries} attempts")

    # -------------------------------------------------------- deep profiles
    def company_profiles_list(self, page=0, limit=250):
        return self.get("/company-profiles", {"page": page, "limit": limit})

    def company_profile(self, symbol):
        """Deep profile: business lines, dated events, ~100 sourced metrics."""
        return self.get(f"/company-profiles/{_seg(symbol)}")

    # --------------------------------------------------------------- stocks
    def quote(self, symbol):
        return self.get(f"/stocks/quotes/{_seg(symbol)}")

    def quotes(self, symbols):
        if len(symbols) > 50:
            raise OnesheetError("Max 50 symbols per batch quote")
        return self.get("/stocks/quotes", {"symbols": ",".join(symbols)})

    def historical(self, symbol):
        return self.get(f"/stocks/historical/{_seg(symbol)}")

    def historical_metric(self, symbol, metric):
        """metric: summary | marketcap | pe | ps | pb | eps"""
        return self.get(f"/stocks/historical/{_seg(symbol)}/{metric}")

    def fundamentals(self, symbol):
        return self.get(f"/stocks/fundamentals/{_seg(symbol)}")

    def profile(self, symbol):
        return self.get(f"/stocks/fundamentals/{_seg(symbol)}/profile")

    def estimates(self, symbol):
        return self.get(f"/stocks/fundamentals/{_seg(symbol)}/estimates")

    def search(self, query):
        return self.get(f"/stocks/symbols/search/{_seg(query)}", use_cache=False)

    def peers(self, symbol):
        return self.get(f"/stocks/peers/{_seg(symbol)}")

    def dividends(self, symbol):
        return self.get(f"/stocks/dividends/{_seg(symbol)}")

    def exchanges(self):
        return self.get("/stocks/symbols/exchanges")

    # ----------------------------------------------------------- financials
    def statement(self, symbol, statement):
        """statement name is not documented in the spec; see SETUP.md."""
        return self.get(f"/financials/statements/{_seg(symbol)}/{_seg(statement)}")

    def ratios(self, symbol):
        return self.get(f"/financials/ratios/{_seg(symbol)}")

    def ratios_summary(self, symbol):
        return self.get(f"/financials/ratios/{_seg(symbol)}/summary")

    def growth(self, symbol):
        return self.get(f"/financials/growth/{_seg(symbol)}")

    def growth_metrics(self, symbol):
        return self.get(f"/financials/growth/{_seg(symbol)}/metrics")

    def eps_merged(self, symbol):
        return self.get(f"/financials/eps/{_seg(symbol)}/merged")

    def kpis(self, symbol):
        """Segments and KPIs. Heaviest endpoint in the spec (weight 100)."""
        return self.get(f"/kpis/segments-and-kpis/{_seg(symbol)}")

    # ---------------------------------------------------------- transcripts
    def transcript_dates(self, symbol):
        return self.get(f"/financials/transcripts/{_seg(symbol)}/dates")

    def transcript(self, symbol, year, quarter):
        return self.get(f"/financials/transcripts/{_seg(symbol)}/{_seg(year)}/{_seg(quarter)}")

    # ------------------------------------------------------- market & other
    def news(self, symbol, page=0, limit=100):
        return self.get(f"/market/news/{_seg(symbol)}", {"page": page, "limit": limit})

    def insider(self, symbol, page=0, limit=100):
        return self.get(f"/insider-trading/{_seg(symbol)}", {"page": page, "limit": limit})

    def fx_at_date(self, from_ccy, to_ccy, date, today):
        """from/to: USD, CAD, EUR, GBP. Dates as YYYY-MM-DD."""
        return self.get("/forex/rate-at-date",
                        {"from": from_ccy, "to": to_ccy, "date": date, "today": today})

    def fx_spot(self, pair):
        return self.get(f"/forex/{_seg(pair)}")
