import type { CompanyMetrics, CompanyScore } from "../types/index.ts"
import { formatMetric, formatScore } from "../utils/format.ts"

interface RankingListProps {
  companies: CompanyMetrics[]
  scores: CompanyScore[]
  selectedTicker: string
  onSelect: (ticker: string) => void
}

export function RankingList({ companies, scores, selectedTicker, onSelect }: RankingListProps) {
  return (
    <section className="panel ranking-panel">
      <div className="panel-title">
        <h2>Sector ranking</h2>
        <p>Relative to the companies on screen</p>
      </div>
      <div className="rank-list">
        {scores.map((score) => {
          const company = companies.find((item) => item.ticker === score.ticker)
          if (!company) return null
          return (
            <button
              key={score.ticker}
              type="button"
              className={score.ticker === selectedTicker ? "rank-card selected" : "rank-card"}
              onClick={() => onSelect(score.ticker)}
              aria-pressed={score.ticker === selectedTicker}
            >
              <div className="rank-top">
                <span className="rank-num">#{score.rank}</span>
                <strong>{company.ticker}</strong>
                <span className="score">{formatScore(score.totalScore)}</span>
              </div>
              <p className="company-name">{company.companyName}</p>
              <p className="rank-meta">Revenue growth {formatMetric(company.revenueGrowth, "percent")}</p>
              <p className="advantage">{score.mainAdvantage}</p>
              <div className="score-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(100, score.totalScore))}%` }} />
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
