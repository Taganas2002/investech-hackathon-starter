export type Direction = "higher" | "lower"
export type MetricUnit = "percent" | "ratio" | "price" | "number"
export type DataMode = "demo" | "csv" | "api"

/**
 * Normalized company record used by the whole app.
 * External CSV/API fields are converted into this shape in dataAdapter.ts.
 * Missing metrics stay undefined and must not crash the UI.
 */
export interface CompanyMetrics {
  ticker: string
  companyName: string
  sector: string

  revenueGrowth?: number
  grossMargin?: number
  ebitdaMargin?: number
  netMargin?: number
  roe?: number
  roa?: number

  debtToEquity?: number
  peRatio?: number

  sectorKpis?: Record<string, number | string | null>

  currentPrice?: number
  priceChange1D?: number
  priceChange30D?: number
  priceChange1Y?: number

  source?: string
}

export interface PricePoint {
  date: string
  ticker: string
  close: number
}

export interface SectorDefinition {
  id: string
  label: string
  aliases: string[]
  primaryKpiKey: string
  primaryKpiLabel: string
  primaryKpiDirection: Direction
  primaryKpiUnit: MetricUnit
}

/** Relative weights. They do not have to sum to 100. */
export interface ScoreWeights {
  revenueGrowth: number
  grossMargin: number
  ebitdaMargin: number
  roe: number
  sectorKpi: number
  priceMomentum: number
  debtToEquity: number
}

export interface MetricContribution {
  key: string
  label: string
  shortLabel: string
  unit: MetricUnit
  direction: Direction
  value?: number
  peerMedian?: number
  normalized?: number
  rank?: number
  peersWithData: number
  weight: number
  included: boolean
}

export interface CompanyScore {
  ticker: string
  totalScore: number
  rank: number
  peerCount: number
  scoredMetricCount: number
  insufficientData: boolean
  contributions: MetricContribution[]
  mainAdvantage: string
}

export interface InsightItem {
  key: string
  text: string
}

export interface CompanyExplanation {
  strengths: InsightItem[]
  weaknesses: InsightItem[]
  summary: string
}

export interface AdaptCompaniesResult {
  companies: CompanyMetrics[]
  errors: string[]
  warnings: string[]
}

export interface AdaptPricesResult {
  prices: PricePoint[]
  errors: string[]
  warnings: string[]
}
