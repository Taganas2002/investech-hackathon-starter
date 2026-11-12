# Competitive Edge

Hackathon starter for Investech. It turns company fundamentals and one sector-specific KPI into a peer ranking, a short list of strengths and risks, and a price chart.

This is not a price forecast. The demo should answer: **which company should I investigate first, and why?**

The app opens on fictional demo data so the pitch still works if the organizer API is down. Click **Demo Data** any time to get back there.

## Install frontend

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173

## Install backend

The Express server is optional. Use it when the organizer API blocks browser CORS or the API key must stay off the client.

```bash
cd server
npm install
copy .env.example .env
npm run dev
```

The proxy listens on http://localhost:3001. In dev, the React app calls `/api/...` and Vite forwards that to the proxy. You do not need the server running for demo data or CSV import.

## How to switch from mock data to an organizer CSV

1. Start the frontend.
2. Click **Import Organizer CSV**.
3. Choose the file. The app does not reload.
4. Company files replace the companies on screen. Price files update price history for the tickers in the file.
5. Click **Demo Data** to restore the fictional set.

Try these files before tonight:

| File | What it checks |
| --- | --- |
| `sample-data/organizer-companies.csv` | Different column names (`symbol`, `rev_growth`, `gm`, `sss_growth`). Peak Outfitters should move to the top. |
| `sample-data/organizer-prices.csv` | Daily closes. The NOVA / PEAK charts shorten to the imported dates. |
| `sample-data/partial-company.csv` | `N/A` and `not-a-number` do not crash. Ghost Goods stays in the list with missing metrics. |
| `sample-data/broken.csv` | Shows a mapping error and leaves the current dashboard in place. |

Flow:

```text
CSV -> PapaParse -> client/src/dataAdapter.ts -> CompanyMetrics[] -> dashboard
```

## How to map organizer API fields

Edit **`client/src/dataAdapter.ts`**. That is the mapping layer.

1. Add their JSON or CSV names to `FIELD_ALIASES`.
2. Add sector KPI names to `SECTOR_KPI_ALIASES`. The object key must match `primaryKpiKey` in `client/src/data/sectorConfig.ts`.
3. If the payload is wrapped (`{ data: { companies: [...] } }`), add the wrapper to `ENVELOPE_KEYS` if it is not already there.
4. If a percent arrives as a decimal (`0.184` instead of `18.4`), convert it in `applyTransforms`.

Example, if they send `symbol`, `name`, and `revGrowth`:

```ts
ticker: [..., "symbol"],
companyName: [..., "name"],
revenueGrowth: [..., "rev_growth"],
```

Names are case-insensitive. Spaces and hyphens match underscores. The rest of the app can stay as it is.

Percent values should stay in percentage points. `18.4` means 18.4%. Debt/equity stays a ratio such as `0.62`.

## Environment variables

### Frontend: `client/.env`

Copy `client/.env.example`.

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Leave empty in dev to use the Vite proxy (`/api` -> `localhost:3001`). Set a full origin only if the browser calls the organizer directly. |
| `VITE_API_KEY` | Optional browser key. It is visible in the built JavaScript. Prefer the server env for secrets. |

Restart `npm run dev` after changing Vite env vars.

### Backend: `server/.env`

Copy `server/.env.example`.

| Variable | Purpose |
| --- | --- |
| `PORT` | Proxy port. Default `3001`. |
| `ORGANIZER_API_URL` | Organizer base URL, without a secret in the path. |
| `ORGANIZER_API_KEY` | Secret key. Stays on the server. |
| `ORGANIZER_AUTH_HEADER` | `Authorization` or `x-api-key`. |
| `ORGANIZER_AUTH_SCHEME` | `Bearer`, or blank to send the raw key. |

Upstream paths are in `server/src/routes/organizer.ts` (`UPSTREAM`). The React service in `client/src/services/api.ts` keeps calling `/api/companies`, `/api/companies/:ticker`, `/api/sectors/:sector`, and `/api/prices/:ticker`.

`Load API` fails softly. If the proxy is down or the key is missing, the banner explains it and the companies already on screen stay there.

## What to edit tonight

Do not redesign the dashboard.

1. Inspect the real schema.
2. Update `client/src/dataAdapter.ts`.
3. Update `server/src/routes/organizer.ts` if their URL paths differ. Update `client/src/services/api.ts` only if the browser should call them directly.
4. Update sector KPIs in `client/src/data/sectorConfig.ts`.
5. Adjust weights in `client/src/utils/scoring.ts` (`DEFAULT_WEIGHTS`).
6. Reload the dashboard and confirm rank, score, chart, CSV, and **Demo Data**.

Weights are relative. `25` and `0.25` behave the same. A missing metric is dropped and the remaining weights are rescaled. A company needs at least 3 comparable metrics or its score stays 0.

## Scores

Companies are ranked only against the selected sector. Higher growth, margins, ROE, sector KPI, and 30-day price change score better. Lower debt/equity scores better. The number is a peer-relative score, not a fair-value price.

Strengths, risks, and the investment paragraph are generated from those comparisons. No external AI service is called.

## Scripts

```bash
cd client
npm run dev
npm run build
npx tsx scripts/checkDemo.ts
```

`checkDemo.ts` confirms the fictional ranking and that the sample CSVs map through the adapter. It does not start the website.

```bash
cd server
npm run dev
```
