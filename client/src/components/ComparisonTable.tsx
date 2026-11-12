import type { CompanyMetrics, CompanyScore, Direction, MetricUnit, SectorDefinition } from "../types/index.ts"
import { formatMetric, formatScore, formatSignedPercent } from "../utils/format.ts"

interface ComparisonTableProps {
  companies: CompanyMetrics[]
  scores: CompanyScore[]
  sector: SectorDefinition
  selectedTicker: string
  onSelect: (ticker: string) => void
}

interface Column {
  key: string
  label: string
  direction: Direction
  value: (company: CompanyMetrics, score: CompanyScore) => number | undefined
  text: (company: CompanyMetrics, score: CompanyScore) => string
}

export function ComparisonTable({ companies, scores, sector, selectedTicker, onSelect }: ComparisonTableProps) {
  const columns: Column[] = [
    {
      key: "score",
      label: "Score",
      direction: "higher",
      value: (_company, score) => score.totalScore,
      text: (_company, score) => formatScore(score.totalScore),
    },
    {
      key: "revenue",
      label: "Rev growth",
      direction: "higher",
      value: (company) => company.revenueGrowth,
      text: (company) => formatMetric(company.revenueGrowth, "percent"),
    },
    {
      key: "gross",
      label: "Gross margin",
      direction: "higher",
      value: (company) => company.grossMargin,
      text: (company) => formatMetric(company.grossMargin, "percent"),
    },
    {
      key: "ebitda",
      label: "EBITDA margin",
      direction: "higher",
      value: (company) => company.ebitdaMargin,
      text: (company) => formatMetric(company.ebitdaMargin, "percent"),
    },
    {
      key: "roe",
      label: "ROE",
      direction: "higher",
      value: (company) => company.roe,
      text: (company) => formatMetric(company.roe, "percent"),
    },
    {
      key: "kpi",
      label: sector.primaryKpiLabel,
      direction: sector.primaryKpiDirection,
      value: (company) => kpiNumber(company, sector.primaryKpiKey),
      text: (company) => kpiText(company, sector.primaryKpiKey, sector.primaryKpiUnit),
    },
    {
      key: "debt",
      label: "Debt / equity",
      direction: "lower",
      value: (company) => company.debtToEquity,
      text: (company) => formatMetric(company.debtToEquity, "ratio"),
    },
    {
      key: "momentum",
      label: "30-day",
      direction: "higher",
      value: (company) => company.priceChange30D,
      text: (company) => formatSignedPercent(company.priceChange30D),
    },
  ]

  const rows = scores
    .map((score) => {
      const company = companies.find((item) => item.ticker === score.ticker)
      return company ? { company, score } : undefined
    })
    .filter((row): row is { company: CompanyMetrics; score: CompanyScore } => Boolean(row))

  const best = new Map<string, number | undefined>()
  for (const column of columns) {
    const values = rows
      .map((row) => column.value(row.company, row.score))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    best.set(column.key, values.length === 0 ? undefined : column.direction === "lower" ? Math.min(...values) : Math.max(...values))
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Competitor comparison</h2>
        <p>Best value in each column is highlighted. Debt / equity highlights the lowest leverage.</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Company</th>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ company, score }) => (
              <tr
                key={company.ticker}
                className={company.ticker === selectedTicker ? "selected" : undefined}
                onClick={() => onSelect(company.ticker)}
              >
                <td>#{score.rank}</td>
                <td>
                  <strong>{company.ticker}</strong>
                  <span className="table-name">{company.companyName}</span>
                </td>
                {columns.map((column) => {
                  const value = column.value(company, score)
                  const winner = best.get(column.key)
                  const isBest = value !== undefined && winner !== undefined && value === winner
                  return (
                    <td key={column.key} className={isBest ? "best" : undefined}>
                      {column.text(company, score)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function kpiNumber(company: CompanyMetrics, key: string): number | undefined {
  const value = company.sectorKpis?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function kpiText(company: CompanyMetrics, key: string, unit: MetricUnit): string {
  const value = company.sectorKpis?.[key]
  if (typeof value === "string") return value
  return formatMetric(kpiNumber(company, key), unit)
}
