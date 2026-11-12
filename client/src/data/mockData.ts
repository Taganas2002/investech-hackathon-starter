import type { CompanyMetrics, PricePoint } from "../types/index.ts"

export const DEMO_AS_OF = "2026-11-11"
const TRADING_DAYS = 252
const DEMO_SOURCE = "Fictional demo dataset — not a real filing"

interface FundamentalSeed {
  ticker: string
  companyName: string
  sector: string
  revenueGrowth: number
  grossMargin: number
  ebitdaMargin: number
  netMargin?: number
  roe: number
  roa?: number
  debtToEquity: number
  peRatio?: number
  sectorKpis: Record<string, number>
}

interface WalkSpec {
  ticker: string
  endPrice: number
  yearChangePercent: number
  volatility: number
  seed: number
}

const FUNDAMENTALS: FundamentalSeed[] = [
  {
    ticker: "NOVA",
    companyName: "Nova Retail",
    sector: "Specialty Retail",
    revenueGrowth: 18.4,
    grossMargin: 42.1,
    ebitdaMargin: 15.2,
    netMargin: 8.1,
    roe: 21.3,
    roa: 9.4,
    debtToEquity: 0.92,
    peRatio: 24.5,
    sectorKpis: { sameStoreSalesGrowth: 5.8 },
  },
  {
    ticker: "PEAK",
    companyName: "Peak Outfitters",
    sector: "Specialty Retail",
    revenueGrowth: 11.2,
    grossMargin: 48.5,
    ebitdaMargin: 18.0,
    netMargin: 10.2,
    roe: 16.4,
    roa: 8.1,
    debtToEquity: 0.28,
    peRatio: 19.4,
    sectorKpis: { sameStoreSalesGrowth: 3.1 },
  },
  {
    ticker: "URBN",
    companyName: "Urban Thread Co.",
    sector: "Specialty Retail",
    revenueGrowth: 9.5,
    grossMargin: 39.0,
    ebitdaMargin: 12.4,
    netMargin: 6.4,
    roe: 14.1,
    roa: 6.8,
    debtToEquity: 0.41,
    peRatio: 21.0,
    sectorKpis: { sameStoreSalesGrowth: 4.4 },
  },
  {
    ticker: "RIVR",
    companyName: "River & Co.",
    sector: "Specialty Retail",
    revenueGrowth: 6.1,
    grossMargin: 33.2,
    ebitdaMargin: 9.8,
    netMargin: 3.8,
    roe: 11.0,
    roa: 4.2,
    debtToEquity: 0.7,
    peRatio: 16.5,
    sectorKpis: { sameStoreSalesGrowth: 1.2 },
  },
  {
    ticker: "MART",
    companyName: "Market & Main",
    sector: "Specialty Retail",
    revenueGrowth: 2.4,
    grossMargin: 28.6,
    ebitdaMargin: 7.1,
    netMargin: 2.1,
    roe: 8.4,
    roa: 2.6,
    debtToEquity: 1.35,
    peRatio: 11.8,
    sectorKpis: { sameStoreSalesGrowth: -0.6 },
  },
  {
    ticker: "HARB",
    companyName: "Harbor Grocer",
    sector: "Regional Grocery",
    revenueGrowth: 7.4,
    grossMargin: 26.8,
    ebitdaMargin: 6.4,
    roe: 18.2,
    debtToEquity: 0.48,
    sectorKpis: { inventoryTurnover: 14.6 },
  },
  {
    ticker: "LOOP",
    companyName: "Loop Market",
    sector: "Regional Grocery",
    revenueGrowth: 4.1,
    grossMargin: 24.2,
    ebitdaMargin: 5.1,
    roe: 12.6,
    debtToEquity: 0.77,
    sectorKpis: { inventoryTurnover: 11.2 },
  },
  {
    ticker: "CANA",
    companyName: "Cana Foods",
    sector: "Regional Grocery",
    revenueGrowth: 1.2,
    grossMargin: 21.4,
    ebitdaMargin: 3.3,
    roe: 7.5,
    debtToEquity: 1.55,
    sectorKpis: { inventoryTurnover: 8.1 },
  },
]

const WALKS: WalkSpec[] = [
  { ticker: "NOVA", endPrice: 44.02, yearChangePercent: 36, volatility: 0.006, seed: 101 },
  { ticker: "PEAK", endPrice: 57.4, yearChangePercent: 14, volatility: 0.005, seed: 202 },
  { ticker: "URBN", endPrice: 31.8, yearChangePercent: 22, volatility: 0.006, seed: 303 },
  { ticker: "RIVR", endPrice: 16.4, yearChangePercent: -8, volatility: 0.005, seed: 404 },
  { ticker: "MART", endPrice: 19.75, yearChangePercent: -18, volatility: 0.005, seed: 505 },
  { ticker: "HARB", endPrice: 28.15, yearChangePercent: 11, volatility: 0.004, seed: 606 },
  { ticker: "LOOP", endPrice: 22.4, yearChangePercent: 4, volatility: 0.004, seed: 707 },
  { ticker: "CANA", endPrice: 15.05, yearChangePercent: -12, volatility: 0.005, seed: 808 },
]

const DATES = businessDaysEnding(DEMO_AS_OF, TRADING_DAYS)
const DEMO_PRICES: PricePoint[] = WALKS.flatMap((spec) => buildSeries(spec, DATES))

const DEMO_COMPANIES: CompanyMetrics[] = FUNDAMENTALS.map((seed) => {
  const history = DEMO_PRICES.filter((point) => point.ticker === seed.ticker)
  const last = history[history.length - 1]
  const previous = history[history.length - 2]
  const monthAgo = history[history.length - 1 - 21]
  const first = history[0]
  return {
    ticker: seed.ticker,
    companyName: seed.companyName,
    sector: seed.sector,
    revenueGrowth: seed.revenueGrowth,
    grossMargin: seed.grossMargin,
    ebitdaMargin: seed.ebitdaMargin,
    netMargin: seed.netMargin,
    roe: seed.roe,
    roa: seed.roa,
    debtToEquity: seed.debtToEquity,
    peRatio: seed.peRatio,
    sectorKpis: { ...seed.sectorKpis },
    currentPrice: last?.close,
    priceChange1D: percentChange(last?.close, previous?.close),
    priceChange30D: percentChange(last?.close, monthAgo?.close),
    priceChange1Y: percentChange(last?.close, first?.close),
    source: DEMO_SOURCE,
  }
})

export function getDemoDataset(): {
  companies: CompanyMetrics[]
  prices: PricePoint[]
  defaultSector: string
} {
  return {
    companies: DEMO_COMPANIES.map(cloneCompany),
    prices: DEMO_PRICES.map((point) => ({ ...point })),
    defaultSector: "Specialty Retail",
  }
}

function cloneCompany(company: CompanyMetrics): CompanyMetrics {
  return {
    ...company,
    sectorKpis: company.sectorKpis ? { ...company.sectorKpis } : undefined,
  }
}

function buildSeries(spec: WalkSpec, dates: string[]): PricePoint[] {
  const random = mulberry32(spec.seed)
  const steps = dates.length - 1
  const shocks: number[] = []
  for (let index = 0; index < steps; index += 1) shocks.push((random() - 0.5) * spec.volatility)
  const desiredLog = Math.log(1 + spec.yearChangePercent / 100)
  const shockSum = shocks.reduce((sum, shock) => sum + shock, 0)
  const drift = (desiredLog - shockSum) / steps
  let price = spec.endPrice / Math.exp(desiredLog)
  const closes = [price]
  for (const shock of shocks) {
    price *= Math.exp(drift + shock)
    closes.push(price)
  }
  closes[closes.length - 1] = spec.endPrice
  return dates.map((date, index) => ({
    date,
    ticker: spec.ticker,
    close: Math.round((closes[index] ?? price) * 100) / 100,
  }))
}

function percentChange(latest: number | undefined, past: number | undefined): number | undefined {
  if (latest === undefined || past === undefined || past === 0) return undefined
  return Math.round(((latest - past) / past) * 1000) / 10
}

function businessDaysEnding(endIso: string, count: number): string[] {
  const dates: string[] = []
  const cursor = new Date(`${endIso}T00:00:00Z`)
  while (dates.length < count) {
    const day = cursor.getUTCDay()
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return dates.reverse()
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
