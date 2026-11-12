/**
 * =============================================================================
 * ORGANIZER DATA ADAPTER
 * =============================================================================
 * Edit this file when the hackathon CSV or API arrives.
 * The dashboard, charts, and scoring only understand CompanyMetrics and PricePoint.
 *
 * Tonight, in order:
 *   1. Add the organizer's column / JSON names to FIELD_ALIASES or SECTOR_KPI_ALIASES.
 *   2. If a number uses a different unit (0.184 instead of 18.4), convert it in applyTransforms.
 *   3. If the JSON is nested in a new envelope, add that key to ENVELOPE_KEYS.
 *   4. Register sector KPI labels in data/sectorConfig.ts.
 *
 * Do not rewrite the React components for a new field name.
 *
 * Matching rules:
 *   - Names are case-insensitive.
 *   - Spaces and hyphens match underscores.
 *     "Rev Growth", "rev-growth", and "rev_growth" all match "rev_growth".
 *   - Percent fields stay in percentage points. 18.4 means 18.4%, not 0.184.
 *   - Blank, "N/A", "null", and non-numeric text become missing data. They do not crash scoring.
 *   - Dates should be YYYY-MM-DD. Other date text is parsed with Date and can shift by a timezone.
 * =============================================================================
 */

import { canonicalizeSector, findSector } from "./data/sectorConfig.ts"
import type {
  AdaptCompaniesResult,
  AdaptPricesResult,
  CompanyMetrics,
  PricePoint,
} from "./types/index.ts"
import { isBlankMetric, isRecord, parseNumber } from "./utils/numbers.ts"

/** Left side is our field. Right side is every organizer name we should recognize. */
export const FIELD_ALIASES = {
  ticker: ["ticker", "symbol", "stock", "stock_symbol", "code"],
  companyName: ["company_name", "companyname", "company", "name", "security_name"],
  sector: ["sector", "industry", "sector_name", "gics_sector"],
  revenueGrowth: ["revenue_growth", "revenuegrowth", "rev_growth", "revenue_growth_pct", "sales_growth", "yoy_revenue_growth"],
  grossMargin: ["gross_margin", "grossmargin", "gm", "gross_profit_margin"],
  ebitdaMargin: ["ebitda_margin", "ebitdamargin", "ebitda_m", "ebitda_margin_pct"],
  netMargin: ["net_margin", "netmargin", "profit_margin", "net_income_margin"],
  roe: ["roe", "return_on_equity"],
  roa: ["roa", "return_on_assets"],
  debtToEquity: ["debt_to_equity", "debttoequity", "de_ratio", "debt_equity", "d_e", "leverage"],
  peRatio: ["pe_ratio", "peratio", "pe", "p_e", "price_to_earnings"],
  currentPrice: ["current_price", "currentprice", "price", "px", "last", "last_price"],
  priceChange1D: ["price_change_1d", "pricechange1d", "change_1d", "chg_1d", "return_1d", "day_change"],
  priceChange30D: ["price_change_30d", "pricechange30d", "change_30d", "chg_30d", "return_30d", "momentum_30d"],
  priceChange1Y: ["price_change_1y", "pricechange1y", "change_1y", "chg_1y", "return_1y", "momentum_1y"],
  source: ["source", "citation", "data_source", "filing"],
} as const

/**
 * Keys must match sectorConfig.primaryKpiKey.
 * Add a new entry when the organizers introduce a sector KPI.
 */
export const SECTOR_KPI_ALIASES: Record<string, string[]> = {
  sameStoreSalesGrowth: [
    "same_store_sales_growth",
    "sss_growth",
    "comp_sales",
    "comp_sales_growth",
    "comparable_sales_growth",
    "same_store_sales",
  ],
  inventoryTurnover: ["inventory_turnover", "inv_turnover", "inventory_turns"],
}

export const PRICE_FIELD_ALIASES = {
  date: ["date", "timestamp", "trading_date", "price_date", "day"],
  ticker: ["ticker", "symbol", "stock"],
  close: ["close", "adj_close", "adjusted_close", "adjclose", "price", "px"],
} as const

/** Wrappers we unwrap before mapping rows. Add the organizer's wrapper key here. */
const ENVELOPE_KEYS = [
  "companies",
  "data",
  "results",
  "items",
  "records",
  "rows",
  "fundamentals",
  "prices",
  "history",
  "series",
  "quotes",
]

const COMPANY_HINTS = [
  ...FIELD_ALIASES.companyName,
  ...FIELD_ALIASES.revenueGrowth,
  ...FIELD_ALIASES.grossMargin,
  ...FIELD_ALIASES.sector,
  ...FIELD_ALIASES.roe,
  ...FIELD_ALIASES.ebitdaMargin,
]

export function normalizeKey(key: string): string {
  return key
    .trim()
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
}

export function pickField(raw: Record<string, unknown>, aliases: readonly string[]): unknown {
  const wanted = new Set(aliases.map((alias) => normalizeKey(alias)))
  for (const [key, value] of Object.entries(raw)) {
    if (wanted.has(normalizeKey(key))) return value
  }
  return undefined
}

export function extractRecords(input: unknown): unknown[] {
  if (Array.isArray(input)) return input
  if (!isRecord(input)) return []

  const direct = arrayFromEnvelope(input)
  if (direct) return direct

  if (pickField(input, FIELD_ALIASES.ticker) !== undefined) return [input]
  if (pickField(input, PRICE_FIELD_ALIASES.date) !== undefined) return [input]
  return []
}

export type TabularKind = "companies" | "prices" | "unknown"

export function detectTabularKind(rows: unknown[]): TabularKind {
  const records = rows.filter(isRecord)
  if (records.length === 0) return "unknown"

  const keys = new Set<string>()
  for (const record of records) {
    for (const key of Object.keys(record)) keys.add(normalizeKey(key))
  }

  const has = (aliases: readonly string[]) => aliases.some((alias) => keys.has(normalizeKey(alias)))
  const hasDate = has(PRICE_FIELD_ALIASES.date)
  const hasClose = has(PRICE_FIELD_ALIASES.close)
  const hasCompanyHint = has(COMPANY_HINTS)

  if (hasDate && hasClose && !hasCompanyHint) return "prices"
  if (hasCompanyHint || has(FIELD_ALIASES.ticker)) return "companies"
  return "unknown"
}

export function adaptCompanies(input: unknown): AdaptCompaniesResult {
  const records = extractRecords(input)
  if (records.length === 0) {
    return {
      companies: [],
      errors: [
        "No company rows were found. If the JSON is nested, add the wrapper name to ENVELOPE_KEYS in dataAdapter.ts.",
      ],
      warnings: [],
    }
  }

  const companies: CompanyMetrics[] = []
  const errors: string[] = []
  const warnings: string[] = []
  const seen = new Map<string, number>()

  records.forEach((record, index) => {
    const adapted = adaptCompany(record, `Record ${index + 1}`)
    warnings.push(...adapted.warnings)
    if (!adapted.company) {
      errors.push(adapted.error ?? `Record ${index + 1} could not be mapped.`)
      return
    }
    const existing = seen.get(adapted.company.ticker)
    if (existing !== undefined) {
      companies[existing] = adapted.company
      warnings.push(`${adapted.company.ticker} appeared more than once. The last row was kept.`)
      return
    }
    seen.set(adapted.company.ticker, companies.length)
    companies.push(adapted.company)
  })

  if (companies.length === 0) {
    errors.unshift(
      "This file could not be mapped to companies. Add the organizer column names in client/src/dataAdapter.ts.",
    )
  }

  return { companies, errors, warnings: warnings.slice(0, 8) }
}

export function adaptCompany(
  input: unknown,
  recordLabel = "Record",
): { company: CompanyMetrics | null; error?: string; warnings: string[] } {
  if (!isRecord(input)) {
    return { company: null, error: `${recordLabel} is not an object.`, warnings: [] }
  }

  const ticker = cleanString(pickField(input, FIELD_ALIASES.ticker)).toUpperCase()
  if (!ticker) {
    return { company: null, error: `${recordLabel} is missing a ticker or symbol.`, warnings: [] }
  }

  const warnings: string[] = []
  const companyName = cleanString(pickField(input, FIELD_ALIASES.companyName))
  if (!companyName) warnings.push(`${ticker} has no company name. The ticker was used instead.`)

  const sector = canonicalizeSector(cleanString(pickField(input, FIELD_ALIASES.sector)) || "Uncategorized")
  const sectorKpis = readSectorKpis(input, sector)

  const company: CompanyMetrics = {
    ticker,
    companyName: companyName || ticker,
    sector,
    sectorKpis,
  }

  assignMetric(company, "revenueGrowth", input, FIELD_ALIASES.revenueGrowth, "Revenue growth", warnings)
  assignMetric(company, "grossMargin", input, FIELD_ALIASES.grossMargin, "Gross margin", warnings)
  assignMetric(company, "ebitdaMargin", input, FIELD_ALIASES.ebitdaMargin, "EBITDA margin", warnings)
  assignMetric(company, "netMargin", input, FIELD_ALIASES.netMargin, "Net margin", warnings)
  assignMetric(company, "roe", input, FIELD_ALIASES.roe, "ROE", warnings)
  assignMetric(company, "roa", input, FIELD_ALIASES.roa, "ROA", warnings)
  assignMetric(company, "debtToEquity", input, FIELD_ALIASES.debtToEquity, "Debt/equity", warnings)
  assignMetric(company, "peRatio", input, FIELD_ALIASES.peRatio, "P/E", warnings)
  assignMetric(company, "currentPrice", input, FIELD_ALIASES.currentPrice, "Price", warnings)
  assignMetric(company, "priceChange1D", input, FIELD_ALIASES.priceChange1D, "1-day change", warnings)
  assignMetric(company, "priceChange30D", input, FIELD_ALIASES.priceChange30D, "30-day change", warnings)
  assignMetric(company, "priceChange1Y", input, FIELD_ALIASES.priceChange1Y, "1-year change", warnings)

  const source = cleanString(pickField(input, FIELD_ALIASES.source))
  if (source) company.source = source

  return { company: applyTransforms(company, input), warnings }
}

export function adaptPriceRows(input: unknown): AdaptPricesResult {
  const records = extractRecords(input)
  if (records.length === 0) {
    return {
      prices: [],
      errors: ["No price rows were found. Expected date, ticker, and close columns."],
      warnings: [],
    }
  }

  const prices: PricePoint[] = []
  const errors: string[] = []
  const warnings: string[] = []

  records.forEach((record, index) => {
    const label = `Price row ${index + 1}`
    if (!isRecord(record)) {
      errors.push(`${label} is not an object.`)
      return
    }
    const date = parseDate(pickField(record, PRICE_FIELD_ALIASES.date))
    const ticker = cleanString(pickField(record, PRICE_FIELD_ALIASES.ticker)).toUpperCase()
    const closeRaw = pickField(record, PRICE_FIELD_ALIASES.close)
    const close = parseNumber(closeRaw)

    if (!date || !ticker || close === undefined) {
      const problem = !ticker
        ? "missing ticker"
        : !date
          ? "missing date"
          : isBlankMetric(closeRaw)
            ? "missing close"
            : `close "${String(closeRaw)}" is not a number`
      errors.push(`${label} skipped (${problem}).`)
      return
    }

    prices.push({ date, ticker, close })
  })

  if (prices.length === 0) {
    errors.unshift("This file could not be mapped to prices. Check PRICE_FIELD_ALIASES in dataAdapter.ts.")
  } else if (errors.length > 0) {
    warnings.push(...errors.slice(0, 6))
  }

  return { prices, errors: prices.length === 0 ? errors : [], warnings }
}

/**
 * Unit fixes live here so the rest of the app keeps using percentage points and ratios as-is.
 * Example: if revGrowthDecimal is 0.184, set revenueGrowth to 18.4.
 */
function applyTransforms(company: CompanyMetrics, raw: Record<string, unknown>): CompanyMetrics {
  if (Object.keys(raw).length === 0) return company
  return company
}

function assignMetric(
  company: CompanyMetrics,
  key: NumericCompanyKey,
  raw: Record<string, unknown>,
  aliases: readonly string[],
  label: string,
  warnings: string[],
) {
  const rawValue = pickField(raw, aliases)
  if (isBlankMetric(rawValue)) return
  const parsed = parseNumber(rawValue)
  if (parsed === undefined) {
    warnings.push(`${company.ticker}: "${label}" value "${String(rawValue)}" is not a number and was skipped.`)
    return
  }
  company[key] = parsed
}

type NumericCompanyKey =
  | "revenueGrowth"
  | "grossMargin"
  | "ebitdaMargin"
  | "netMargin"
  | "roe"
  | "roa"
  | "debtToEquity"
  | "peRatio"
  | "currentPrice"
  | "priceChange1D"
  | "priceChange30D"
  | "priceChange1Y"

function readSectorKpis(raw: Record<string, unknown>, sector: string): Record<string, number | string | null> {
  const sectorKpis: Record<string, number | string | null> = {}
  const nested = pickField(raw, ["sector_kpis", "sectorkpis", "kpis", "sector_kpi_values"])
  Object.assign(sectorKpis, normalizeKpiMap(nested))

  for (const [key, aliases] of Object.entries(SECTOR_KPI_ALIASES)) {
    const rawValue = pickField(raw, aliases)
    if (isBlankMetric(rawValue)) continue
    const parsed = parseNumber(rawValue)
    if (parsed !== undefined) sectorKpis[key] = parsed
  }

  const generic = parseNumber(pickField(raw, ["sector_kpi", "primary_kpi", "kpi"]))
  if (generic !== undefined) {
    const known = findSector(sector)
    const target = known?.primaryKpiKey ?? "primary"
    if (sectorKpis[target] == null) sectorKpis[target] = generic
  }

  return sectorKpis
}

function normalizeKpiMap(value: unknown): Record<string, number | string | null> {
  if (!isRecord(value)) return {}
  const output: Record<string, number | string | null> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || isBlankMetric(entry)) {
      output[key] = null
      continue
    }
    const parsed = parseNumber(entry)
    output[key] = parsed !== undefined ? parsed : typeof entry === "string" ? entry : null
  }
  return output
}

function arrayFromEnvelope(input: Record<string, unknown>): unknown[] | undefined {
  for (const key of ENVELOPE_KEYS) {
    const value = findValue(input, key)
    if (Array.isArray(value)) return value
  }
  for (const key of ENVELOPE_KEYS) {
    const nested = findValue(input, key)
    if (!isRecord(nested)) continue
    for (const innerKey of ENVELOPE_KEYS) {
      const inner = findValue(nested, innerKey)
      if (Array.isArray(inner)) return inner
    }
  }
  return undefined
}

function findValue(raw: Record<string, unknown>, key: string): unknown {
  const wanted = normalizeKey(key)
  for (const [candidate, value] of Object.entries(raw)) {
    if (normalizeKey(candidate) === wanted) return value
  }
  return undefined
}

function cleanString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (/^(n\/a|na|null|none|undefined|—|-|--)$/i.test(trimmed)) return ""
  return trimmed
}

function parseDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const text = cleanString(value)
  if (!text) return undefined
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text)
  if (iso) return iso[1]
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toISOString().slice(0, 10)
}
