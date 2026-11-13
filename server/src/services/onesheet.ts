import axios from "axios"
import { fetchOrganizer } from "./organizerClient.js"

export interface NormalizedCompany {
  ticker: string
  companyName: string
  sector: string
  revenueGrowth?: number
  grossMargin?: number
  ebitdaMargin?: number
  netMargin?: number
  roe?: number
  debtToEquity?: number
  peRatio?: number
  sectorKpis?: Record<string, number | string | null>
  currentPrice?: number
  priceChange1D?: number
  priceChange30D?: number
  source?: string
}

export interface NormalizedPrice {
  date: string
  ticker: string
  close: number
}

interface Dataset {
  at: number
  companies: NormalizedCompany[]
  prices: NormalizedPrice[]
}

interface Listing {
  symbol: string
  exchange: string
}

interface ProfileCompany {
  name?: string
  listings?: Listing[]
}

interface Quote {
  symbol?: string
  name?: string
  price?: number
  changesPercentage?: number
}

interface MarketProfile {
  companyName?: string
  sector?: string
  industry?: string
  exchangeShortName?: string
}

interface RatioSummary {
  profitability?: { grossMargin?: number; operatingMargin?: number; netMargin?: number; roe?: number }
  leverage?: { debtToEquity?: number }
  valuation?: { peRatio?: number }
}

interface GrowthRow {
  date?: string
  period?: string
  growthRevenue?: number
}

interface IncomeRow {
  date?: string
  period?: string
  revenue?: number
  ebitda?: number
  ebitdaratio?: number
  netIncome?: number
}

interface BalanceRow {
  date?: string
  period?: string
  totalStockholdersEquity?: number
}

interface KpiMetric {
  metricId?: string
  metricName?: string
}

interface KpiPeriod {
  periodType?: string
  reportDate?: string
  metricsValues?: Record<string, number>
}

const CACHE_MS = 5 * 60 * 1000
const MAX_IN_FLIGHT = 1
let cache: Dataset | null = null
let inflight: Promise<Dataset> | null = null
let activeRequests = 0
const requestQueue: Array<() => void> = []

export function usesOnesheet(): boolean {
  return (process.env.ORGANIZER_API_URL ?? "").includes("onesheet.pro")
}

export async function getOnesheetDataset(): Promise<Dataset> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache
  if (!inflight) {
    inflight = buildDataset().finally(() => {
      inflight = null
    })
  }
  return inflight
}

export async function getOnesheetCompanies(): Promise<NormalizedCompany[]> {
  return (await getOnesheetDataset()).companies
}

export async function getOnesheetPrices(ticker: string): Promise<NormalizedPrice[]> {
  const dataset = await getOnesheetDataset()
  const wanted = ticker.trim().toUpperCase()
  return dataset.prices.filter((point) => point.ticker.toUpperCase() === wanted)
}

async function buildDataset(): Promise<Dataset> {
  const listed = await readData<ProfileCompany[]>("/company-profiles?limit=50")
  const companies = await mapPool(listed ?? [], 4, loadCompany)
  const ready = companies.filter((company): company is NormalizedCompany => company !== null)
  if (ready.length === 0) throw new Error("Onesheet returned no companies for this key.")
  const prices = (
    await mapPool(ready, 4, async (company) => loadPrices(company.ticker))
  ).flat()
  for (const company of ready) {
    const history = prices.filter((point) => point.ticker === company.ticker)
    company.priceChange30D = changeOver(history, 21)
  }
  await fillGaps(ready, prices)
  const dataset = { at: Date.now(), companies: ready, prices }
  const priced = ready.filter((company) => company.currentPrice != null).length
  if (priced >= 8 && prices.length > 0) cache = dataset
  return dataset
}

async function loadCompany(company: ProfileCompany): Promise<NormalizedCompany | null> {
  const listing = company.listings?.[0]
  if (!listing?.symbol) return null
  const found = await firstWorkingSymbol(listing)
  if (!found) return null
  const { ticker, quote } = found

  const [profile, ratios, growth, incomeRows, balanceRows, kpis] = await Promise.all([
    readData<MarketProfile>(`/stocks/fundamentals/${encodeURIComponent(ticker)}/profile`),
    readData<RatioSummary>(`/financials/ratios/${encodeURIComponent(ticker)}/summary`),
    readData<GrowthRow[]>(`/financials/growth/${encodeURIComponent(ticker)}`),
    readData<IncomeRow[]>(`/financials/statements/${encodeURIComponent(ticker)}/income`),
    readData<BalanceRow[]>(`/financials/statements/${encodeURIComponent(ticker)}/balance`),
    readData<{ metrics?: KpiMetric[]; data?: KpiPeriod[] }>(`/kpis/segments-and-kpis/${encodeURIComponent(ticker)}`),
  ])

  const latestGrowth = latestFy(growth)
  const latestIncome = latestFy(incomeRows)
  const latestBalance = latestFy(balanceRows)
  const sectorKpi = pickSectorKpi(kpis)
  const industry = profile?.industry
  const exchange = profile?.exchangeShortName || listing.exchange

  return {
    ticker,
    companyName: profile?.companyName || quote?.name || company.name || ticker,
    sector: profile?.sector || "Uncategorized",
    revenueGrowth: asPercent(latestGrowth?.growthRevenue),
    grossMargin: asPercent(ratios?.profitability?.grossMargin),
    ebitdaMargin: ebitdaMarginFrom(latestIncome),
    netMargin: asPercent(ratios?.profitability?.netMargin),
    roe: roeFrom(ratios, latestIncome, latestBalance),
    sectorKpis: sectorKpi ? { sectorKpi: sectorKpi.value, __label: sectorKpi.label } : undefined,
    debtToEquity: asRatio(ratios?.leverage?.debtToEquity),
    peRatio: asRatio(ratios?.valuation?.peRatio),
    currentPrice: finite(quote?.price),
    priceChange1D: finite(quote?.changesPercentage),
    source: ["Onesheet", exchange, industry].filter(Boolean).join(" · "),
  }
}

async function loadPrices(ticker: string): Promise<NormalizedPrice[]> {
  const rows = await readData<Array<{ date?: string; close?: number }>>(
    `/stocks/historical/${encodeURIComponent(ticker)}`,
  )
  return (rows ?? [])
    .filter((row) => row.date && typeof row.close === "number" && Number.isFinite(row.close))
    .map((row) => ({ date: row.date as string, ticker, close: row.close as number }))
}

async function firstWorkingSymbol(listing: Listing): Promise<{ ticker: string; quote: Quote } | null> {
  for (const candidate of symbolCandidates(listing)) {
    const quote = await readData<Quote>(`/stocks/quotes/${encodeURIComponent(candidate)}`)
    if (typeof quote?.price === "number") return { ticker: candidate, quote }
  }
  return null
}

function symbolCandidates(listing: Listing): string[] {
  const compact = listing.symbol.trim().toUpperCase().replaceAll(".", "-")
  const exchange = listing.exchange.trim().toUpperCase()
  if (exchange === "TSX") return [`${compact}.TO`]
  if (exchange === "TSXV") return [`${compact}.V`, `${compact}.TO`]
  return [compact]
}

function latestFy<T extends { date?: string; period?: string }>(rows: T[] | undefined): T | undefined {
  return [...(rows ?? [])]
    .filter((row) => row.period === "FY" && row.date)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0]
}

function ebitdaMarginFrom(row: IncomeRow | undefined): number | undefined {
  if (!row) return undefined
  if (typeof row.ebitdaratio === "number" && row.ebitdaratio !== 0 && Number.isFinite(row.ebitdaratio)) {
    return asPercent(row.ebitdaratio)
  }
  if (typeof row.ebitda === "number" && typeof row.revenue === "number" && row.revenue !== 0) {
    return round1((row.ebitda / row.revenue) * 100)
  }
  return undefined
}

function roeFrom(ratios: RatioSummary | undefined, income: IncomeRow | undefined, balance: BalanceRow | undefined): number | undefined {
  const reported = asPercent(ratios?.profitability?.roe)
  if (reported !== undefined) return reported
  const equity = balance?.totalStockholdersEquity
  const netIncome = income?.netIncome
  if (typeof netIncome === "number" && typeof equity === "number" && equity !== 0) {
    return round1((netIncome / equity) * 100)
  }
  return undefined
}

function pickSectorKpi(payload: { metrics?: KpiMetric[]; data?: KpiPeriod[] } | undefined): { label: string; value: number } | undefined {
  const annual = [...(payload?.data ?? [])]
    .filter((row) => row.periodType === "Annual" && row.metricsValues)
    .sort((a, b) => (b.reportDate ?? "").localeCompare(a.reportDate ?? ""))
  const latest = annual[0]?.metricsValues
  if (!latest) return undefined
  const prior = annual[1]?.metricsValues
  const names = new Map((payload?.metrics ?? []).map((metric) => [metric.metricId, metric.metricName]))

  const occupancy = Object.entries(latest).find(
    ([key, value]) => key.includes("occupancy") && value > 1 && value <= 100,
  )
  if (occupancy) return { label: names.get(occupancy[0]) || "Occupancy", value: round1(occupancy[1]) }

  const growth = yearOverYear(latest, prior, "service_backlogs")
  if (growth !== undefined) return { label: "Service backlog growth", value: growth }

  const noiKey = Object.keys(latest).find((key) => key.includes("noi"))
  if (noiKey) {
    const noiGrowth = yearOverYear(latest, prior, noiKey)
    if (noiGrowth !== undefined) return { label: `${names.get(noiKey) || "NOI"} growth`, value: noiGrowth }
  }
  return undefined
}

function yearOverYear(latest: Record<string, number>, prior: Record<string, number> | undefined, key: string): number | undefined {
  const current = latest[key]
  const previous = prior?.[key]
  if (typeof current !== "number" || typeof previous !== "number" || previous === 0) return undefined
  const growth = ((current - previous) / Math.abs(previous)) * 100
  return Number.isFinite(growth) ? round1(growth) : undefined
}

async function fillGaps(companies: NormalizedCompany[], prices: NormalizedPrice[]) {
  const thin = companies.filter(
    (company) =>
      company.currentPrice == null ||
      company.grossMargin == null ||
      !prices.some((point) => point.ticker === company.ticker),
  )
  if (thin.length === 0) return
  await wait(3000)
  for (const company of thin) {
    if (company.currentPrice == null || company.grossMargin == null) {
      const [quote, ratios, growth] = await Promise.all([
        company.currentPrice == null
          ? readData<Quote>(`/stocks/quotes/${encodeURIComponent(company.ticker)}`)
          : Promise.resolve(undefined),
        company.grossMargin == null
          ? readData<RatioSummary>(`/financials/ratios/${encodeURIComponent(company.ticker)}/summary`)
          : Promise.resolve(undefined),
        company.revenueGrowth == null
          ? readData<GrowthRow[]>(`/financials/growth/${encodeURIComponent(company.ticker)}`)
          : Promise.resolve(undefined),
      ])
      company.currentPrice = company.currentPrice ?? finite(quote?.price)
      company.priceChange1D = company.priceChange1D ?? finite(quote?.changesPercentage)
      company.grossMargin = company.grossMargin ?? asPercent(ratios?.profitability?.grossMargin)
      company.netMargin = company.netMargin ?? asPercent(ratios?.profitability?.netMargin)
      company.roe = company.roe ?? asPercent(ratios?.profitability?.roe)
      company.debtToEquity = company.debtToEquity ?? asRatio(ratios?.leverage?.debtToEquity)
      company.peRatio = company.peRatio ?? asRatio(ratios?.valuation?.peRatio)
      const latestGrowth = [...(growth ?? [])]
        .filter((row) => row.period === "FY" && row.date)
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0]
      company.revenueGrowth = company.revenueGrowth ?? asPercent(latestGrowth?.growthRevenue)
    }
    if (!prices.some((point) => point.ticker === company.ticker)) {
      const rows = await loadPrices(company.ticker)
      prices.push(...rows)
      company.priceChange30D = changeOver(rows, 21)
    }
  }
}

async function readData<T>(path: string): Promise<T | undefined> {
  return limit(async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const payload = await fetchOrganizer(path)
        if (!payload || typeof payload !== "object" || !("data" in payload)) return undefined
        return (payload as { data?: T }).data
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined
        if (status === 401 || status === 403) {
          throw new Error(onesheetMessage(error) ?? "Onesheet rejected this API key. It is invalid or revoked.")
        }
        const retryable =
          status === 429 ||
          status === 502 ||
          status === 503 ||
          (axios.isAxiosError(error) && error.code === "ECONNABORTED")
        if (retryable && attempt < 4) {
          await wait(1000 * (attempt + 1))
          continue
        }
        const label = status ?? (axios.isAxiosError(error) ? error.code : "error")
        if (status !== 404) console.warn(`Onesheet ${label} ${path}`)
        return undefined
      }
    }
    return undefined
  })
}

function onesheetMessage(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined
  const data = error.response?.data
  if (!data || typeof data !== "object" || !("error" in data)) return undefined
  const inner = (data as { error: unknown }).error
  if (typeof inner === "string") return inner
  if (inner && typeof inner === "object" && "message" in inner && typeof (inner as { message: unknown }).message === "string") {
    return (inner as { message: string }).message
  }
  return undefined
}

function limit<T>(work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeRequests += 1
      work()
        .then(resolve, reject)
        .finally(() => {
          activeRequests -= 1
          requestQueue.shift()?.()
        })
    }
    if (activeRequests < MAX_IN_FLIGHT) run()
    else requestQueue.push(run)
  })
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()))
  return results
}

function asPercent(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return undefined
  return round1(Math.abs(value) <= 2 ? value * 100 : value)
}

function asRatio(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return undefined
  return Math.round(value * 100) / 100
}

function finite(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function changeOver(prices: NormalizedPrice[], sessionsBack: number): number | undefined {
  const ordered = [...prices].sort((a, b) => a.date.localeCompare(b.date))
  const latest = ordered.at(-1)?.close
  const past = ordered.at(-1 - sessionsBack)?.close
  if (!latest || !past) return undefined
  return round1(((latest - past) / past) * 100)
}
