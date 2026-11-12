import { resolveSector, sameSector } from "../data/sectorConfig.ts"
import type {
  CompanyMetrics,
  CompanyScore,
  Direction,
  MetricContribution,
  MetricUnit,
  ScoreWeights,
  SectorDefinition,
} from "../types/index.ts"
import { shortLabel } from "./format.ts"
import { definedNumber, median } from "./numbers.ts"

/**
 * TONIGHT: change these weights when the finance teammate says what matters.
 * Numbers are relative. 25 and 0.25 behave the same because scores are rescaled.
 * They do not need to add up to 100.
 *
 * priceMomentum uses the 30-day price change.
 * sectorKpi uses the primary KPI from data/sectorConfig.ts.
 * debtToEquity is scored as lower-is-better. Every other weight is higher-is-better.
 *
 * A missing metric is dropped for that company and the other weights are rescaled.
 * Companies with fewer than MIN_METRICS_TO_SCORE comparable metrics get score 0
 * so one lucky field cannot rank them first.
 */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  revenueGrowth: 25,
  grossMargin: 15,
  ebitdaMargin: 15,
  roe: 15,
  sectorKpi: 15,
  priceMomentum: 10,
  debtToEquity: 5,
}

export const MIN_METRICS_TO_SCORE = 3

interface MetricDef {
  key: string
  weightKey: keyof ScoreWeights
  label: string
  shortLabel: string
  unit: MetricUnit
  direction: Direction
  read: (company: CompanyMetrics) => number | undefined
}

export function rankCompanies(
  companies: CompanyMetrics[],
  sector: SectorDefinition,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): CompanyScore[] {
  const defs = metricDefs(sector)
  const peerValues = new Map<string, number[]>()

  for (const def of defs) {
    peerValues.set(
      def.key,
      companies
        .map((company) => definedNumber(def.read(company)))
        .filter((value): value is number => value !== undefined),
    )
  }

  const scored = companies.map((company) => scoreOne(company, defs, peerValues, weights, companies.length))
  const ordered = [...scored].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    return a.ticker.localeCompare(b.ticker)
  })

  ordered.forEach((item, index) => {
    const previous = ordered[index - 1]
    if (previous && item.totalScore === previous.totalScore) item.rank = previous.rank
    else item.rank = index + 1
  })

  return ordered
}

export function topTicker(companies: CompanyMetrics[], sectorName: string): string {
  const peers = companies.filter((company) => sameSector(company.sector, sectorName))
  const ranked = rankCompanies(peers, resolveSector(sectorName, peers[0]))
  return ranked[0]?.ticker ?? ""
}

function scoreOne(
  company: CompanyMetrics,
  defs: MetricDef[],
  peerValues: Map<string, number[]>,
  weights: ScoreWeights,
  peerCount: number,
): CompanyScore {
  let weighted = 0
  let weightSum = 0
  let scoredMetricCount = 0
  const contributions: MetricContribution[] = []

  for (const def of defs) {
    const value = definedNumber(def.read(company))
    const values = peerValues.get(def.key) ?? []
    const weight = weights[def.weightKey]
    const peerMedian = values.length > 0 ? median(values) : undefined

    if (value === undefined || values.length === 0 || weight <= 0) {
      contributions.push({
        key: def.key,
        label: def.label,
        shortLabel: def.shortLabel,
        unit: def.unit,
        direction: def.direction,
        value,
        peerMedian,
        peersWithData: values.length,
        weight,
        included: false,
      })
      continue
    }

    const normalized = normalize(value, values, def.direction)
    weighted += normalized * weight
    weightSum += weight
    scoredMetricCount += 1
    contributions.push({
      key: def.key,
      label: def.label,
      shortLabel: def.shortLabel,
      unit: def.unit,
      direction: def.direction,
      value,
      peerMedian,
      normalized,
      rank: bestRank(value, values, def.direction),
      peersWithData: values.length,
      weight,
      included: true,
    })
  }

  const insufficientData = scoredMetricCount < MIN_METRICS_TO_SCORE
  const rawScore = insufficientData || weightSum === 0 ? 0 : Math.round((weighted / weightSum) * 100)
  const best = contributions
    .filter((item) => item.included && item.normalized !== undefined)
    .sort((a, b) => (b.normalized ?? 0) - (a.normalized ?? 0))[0]

  return {
    ticker: company.ticker,
    totalScore: Number.isFinite(rawScore) ? rawScore : 0,
    rank: 0,
    peerCount,
    scoredMetricCount,
    insufficientData,
    contributions,
    mainAdvantage: insufficientData
      ? "Not enough comparable data"
      : best && (best.normalized ?? 0) >= 0.6
        ? capitalizeAdvantage(best.shortLabel)
        : "No standout advantage",
  }
}

function metricDefs(sector: SectorDefinition): MetricDef[] {
  return [
    {
      key: "revenueGrowth",
      weightKey: "revenueGrowth",
      label: "Revenue growth",
      shortLabel: "revenue growth",
      unit: "percent",
      direction: "higher",
      read: (company) => company.revenueGrowth,
    },
    {
      key: "grossMargin",
      weightKey: "grossMargin",
      label: "Gross margin",
      shortLabel: "gross margin",
      unit: "percent",
      direction: "higher",
      read: (company) => company.grossMargin,
    },
    {
      key: "ebitdaMargin",
      weightKey: "ebitdaMargin",
      label: "EBITDA margin",
      shortLabel: "EBITDA margin",
      unit: "percent",
      direction: "higher",
      read: (company) => company.ebitdaMargin,
    },
    {
      key: "roe",
      weightKey: "roe",
      label: "ROE",
      shortLabel: "ROE",
      unit: "percent",
      direction: "higher",
      read: (company) => company.roe,
    },
    {
      key: "sectorKpi",
      weightKey: "sectorKpi",
      label: sector.primaryKpiLabel,
      shortLabel: shortLabel(sector.primaryKpiLabel),
      unit: sector.primaryKpiUnit,
      direction: sector.primaryKpiDirection,
      read: (company) => readKpi(company, sector.primaryKpiKey),
    },
    {
      key: "priceMomentum",
      weightKey: "priceMomentum",
      label: "30-day price change",
      shortLabel: "price momentum",
      unit: "percent",
      direction: "higher",
      read: (company) => company.priceChange30D,
    },
    {
      key: "debtToEquity",
      weightKey: "debtToEquity",
      label: "Debt / equity",
      shortLabel: "leverage",
      unit: "ratio",
      direction: "lower",
      read: (company) => company.debtToEquity,
    },
  ]
}

function readKpi(company: CompanyMetrics, key: string): number | undefined {
  const value = company.sectorKpis?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function normalize(value: number, values: number[], direction: Direction): number {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return 1
  const ratio = (value - min) / (max - min)
  return direction === "higher" ? ratio : 1 - ratio
}

function bestRank(value: number, values: number[], direction: Direction): number {
  const better = values.filter((other) => (direction === "higher" ? other > value : other < value)).length
  return better + 1
}

function capitalizeAdvantage(label: string | undefined): string {
  if (!label) return "No standout metric"
  if (label === label.toUpperCase()) return label
  return label.charAt(0).toUpperCase() + label.slice(1)
}
