import { AlertTriangle, TrendingUp } from "lucide-react"
import type { CompanyExplanation, CompanyMetrics, CompanyScore, SectorDefinition } from "../types/index.ts"
import { formatMetric, formatPrice, formatScore, formatSignedPercent } from "../utils/format.ts"

interface CompanyPanelProps {
  company?: CompanyMetrics
  score?: CompanyScore
  sector: SectorDefinition
  explanation?: CompanyExplanation
}

export function CompanyPanel({ company, score, sector, explanation }: CompanyPanelProps) {
  if (!company || !score || !explanation) {
    return (
      <section className="panel company-panel">
        <h2>Selected company</h2>
        <p className="muted">Choose a company from the ranking to see its peer analysis.</p>
      </section>
    )
  }

  const kpiRaw = company.sectorKpis?.[sector.primaryKpiKey]
  const kpiNumber = typeof kpiRaw === "number" ? kpiRaw : undefined
  const kpiText = typeof kpiRaw === "string" ? kpiRaw : formatMetric(kpiNumber, sector.primaryKpiUnit)

  const cards: Array<{ label: string; value: string; tone?: string }> = [
    { label: "Revenue growth", value: formatMetric(company.revenueGrowth, "percent") },
    { label: "Gross margin", value: formatMetric(company.grossMargin, "percent") },
    { label: "EBITDA margin", value: formatMetric(company.ebitdaMargin, "percent") },
    { label: "ROE", value: formatMetric(company.roe, "percent") },
    { label: sector.primaryKpiLabel, value: kpiText },
    { label: "Debt / equity", value: formatMetric(company.debtToEquity, "ratio") },
    { label: "Price", value: formatPrice(company.currentPrice) },
    {
      label: "30-day change",
      value: formatSignedPercent(company.priceChange30D),
      tone: toneFor(company.priceChange30D),
    },
  ]

  const extras = [
    company.netMargin !== undefined ? `Net margin ${formatMetric(company.netMargin, "percent")}` : null,
    company.roa !== undefined ? `ROA ${formatMetric(company.roa, "percent")}` : null,
    company.peRatio !== undefined ? `P/E ${formatMetric(company.peRatio, "ratio")}` : null,
    company.priceChange1D !== undefined ? `1-day ${formatSignedPercent(company.priceChange1D)}` : null,
    company.priceChange1Y !== undefined ? `1-year ${formatSignedPercent(company.priceChange1Y)}` : null,
  ].filter((item): item is string => Boolean(item))

  return (
    <section className="panel company-panel">
      <div className="company-heading">
        <div>
          <p className="eyebrow">{company.sector}</p>
          <h2>
            {company.ticker}
            <span>{company.companyName}</span>
          </h2>
        </div>
        <div className="score-pair">
          <div>
            <strong>{formatScore(score.totalScore)}</strong>
            <span>/100</span>
            <p>Opportunity score</p>
          </div>
          <div>
            <strong>
              #{score.rank}
              <span className="of"> / {score.peerCount}</span>
            </strong>
            <p>Sector rank</p>
          </div>
        </div>
      </div>

      <p className="advantage-line">Main advantage: {score.mainAdvantage}</p>
      {company.source ? <p className="source">Source: {company.source}</p> : null}

      <div className="metric-grid">
        {cards.map((card) => (
          <article key={card.label} className="metric-card">
            <p>{card.label}</p>
            <strong className={card.tone}>{card.value}</strong>
          </article>
        ))}
      </div>

      {extras.length > 0 ? (
        <div className="chips">
          {extras.map((extra) => (
            <span key={extra}>{extra}</span>
          ))}
        </div>
      ) : null}

      <div className="insight-grid">
        <div>
          <h3>
            <TrendingUp size={16} aria-hidden="true" /> Strengths
          </h3>
          {explanation.strengths.length > 0 ? (
            <ul>
              {explanation.strengths.map((item) => (
                <li key={item.key}>{item.text}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No standout strength versus this peer set.</p>
          )}
        </div>
        <div>
          <h3 className="risk">
            <AlertTriangle size={16} aria-hidden="true" /> Risks
          </h3>
          {explanation.weaknesses.length > 0 ? (
            <ul>
              {explanation.weaknesses.map((item) => (
                <li key={item.key}>{item.text}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No metric is weaker than the peer median.</p>
          )}
        </div>
      </div>

      <div className="summary">
        <h3>Investment insight</h3>
        <p>{explanation.summary}</p>
      </div>
    </section>
  )
}

function toneFor(value: number | undefined): string | undefined {
  if (value === undefined || value === 0) return undefined
  return value > 0 ? "good" : "bad"
}
