import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatIndex, formatPercent, formatPrice, formatShares, tooltipFormatter } from "../../utils/wspFormat.ts"
import { useWspPage } from "./useWspPage.ts"

export function PerSharePage({ offline }: { offline: boolean }) {
  const { data, loading, error } = useWspPage<PerSharePayload>("per-share", offline)
  if (loading) return <div className="panel skeleton-panel">Loading value per share…</div>
  if (error || !data) {
    return <div className="panel">{error || "Not enough data yet."}</div>
  }

  const chartData = data.series.map((row) => ({
    year: row.fiscalYear,
    fcfTotal: row.fcfIndex,
    fcfPerShare: row.fcfPerShareIndex,
    revenueTotal: row.revenueIndex,
    revenuePerShare: row.revenuePerShareIndex,
    netIncomeTotal: row.netIncomeIndex,
    eps: row.epsIndex,
    shares: row.sharesIndex,
  }))
  const raiseYears = new Set(
    (data.equityRaises ?? [])
      .map((raise) => raise.year)
      .filter((year): year is number => typeof year === "number" && year >= 2022 && year <= 2025),
  )

  return (
    <section className="panel wsp-panel">
      <h2>Value per share</h2>
      <div className="metric-grid">
        <article className="metric-card">
          <p>FCF / share CAGR</p>
          <strong>{formatPercent(data.summary.fcfPerShareCagr)}</strong>
        </article>
        <article className="metric-card">
          <p>Diluted EPS CAGR</p>
          <strong>{formatPercent(data.summary.epsDilutedCagr)}</strong>
        </article>
        <article className="metric-card">
          <p>Share count CAGR</p>
          <strong>{formatPercent(data.summary.shareCountCagr)}</strong>
        </article>
        <article className="metric-card">
          <p>Revenue CAGR</p>
          <strong>{formatPercent(data.summary.revenueTotalCagr)}</strong>
        </article>
      </div>

      <ChartBlock title="Total FCF vs FCF per share">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
          <XAxis dataKey="year" stroke="#8b9bb4" />
          <YAxis stroke="#8b9bb4" tickFormatter={tooltipFormatter("index")} />
          <Tooltip formatter={tooltipFormatter("index")} />
          <Legend />
          <Line type="monotone" dataKey="fcfTotal" name="Total FCF" stroke="#5ec8c0" dot={false} />
          <Line type="monotone" dataKey="fcfPerShare" name="FCF / share" stroke="#f0b429" dot={false} />
        </LineChart>
      </ChartBlock>

      <ChartBlock title="Share count">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
          <XAxis dataKey="year" stroke="#8b9bb4" />
          <YAxis stroke="#8b9bb4" tickFormatter={tooltipFormatter("index")} />
          <Tooltip
            formatter={tooltipFormatter("index")}
            labelFormatter={(year) => {
              const raise = data.equityRaises?.find((item) => item.year === Number(year))
              return raise ? `${year} · Equity raise to fund ${raise.deal || "transaction"}` : String(year)
            }}
          />
          <Legend />
          <Line type="monotone" dataKey="shares" name="Diluted shares" stroke="#7aa2ff" dot />
          {[...raiseYears].map((year) => (
            <ReferenceLine key={year} x={year} stroke="#f0b429" strokeDasharray="4 4" />
          ))}
        </LineChart>
      </ChartBlock>

      <div className="chart-row">
        <ChartBlock title="Revenue vs revenue per share">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
            <XAxis dataKey="year" stroke="#8b9bb4" />
            <YAxis stroke="#8b9bb4" tickFormatter={tooltipFormatter("index")} />
            <Tooltip formatter={tooltipFormatter("index")} />
            <Legend />
            <Line type="monotone" dataKey="revenueTotal" name="Total revenue" stroke="#5ec8c0" dot={false} />
            <Line type="monotone" dataKey="revenuePerShare" name="Revenue / share" stroke="#f0b429" dot={false} />
          </LineChart>
        </ChartBlock>
        <ChartBlock title="Net income vs diluted EPS">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
            <XAxis dataKey="year" stroke="#8b9bb4" />
            <YAxis stroke="#8b9bb4" tickFormatter={tooltipFormatter("index")} />
            <Tooltip formatter={tooltipFormatter("index")} />
            <Legend />
            <Line type="monotone" dataKey="netIncomeTotal" name="Net income" stroke="#5ec8c0" dot={false} />
            <Line type="monotone" dataKey="eps" name="Diluted EPS" stroke="#f0b429" dot={false} />
          </LineChart>
        </ChartBlock>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <p>TRC issue price</p>
          <strong>{formatPrice(data.issueVsToday.issuePrice)}</strong>
        </article>
        <article className="metric-card">
          <p>Current price</p>
          <strong>{formatPrice(data.issueVsToday.currentPrice)}</strong>
        </article>
        <article className="metric-card">
          <p>Difference</p>
          <strong>{data.issueVsToday.percentDifference != null ? formatPercent(data.issueVsToday.percentDifference / 100) : "—"}</strong>
        </article>
        <article className="metric-card">
          <p>Public shares issued</p>
          <strong>{formatShares(data.issueVsToday.sharesIssuedPublic)}</strong>
        </article>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Total CAGR</th>
              <th>Per-share CAGR</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Revenue</td>
              <td>{formatPercent(data.summary.revenueTotalCagr)}</td>
              <td>{formatPercent(data.summary.revenuePerShareCagr)}</td>
            </tr>
            <tr>
              <td>Free cash flow</td>
              <td>{formatPercent(data.summary.fcfTotalCagr)}</td>
              <td>{formatPercent(data.summary.fcfPerShareCagr)}</td>
            </tr>
            <tr>
              <td>Earnings / diluted EPS</td>
              <td>{formatPercent(data.summary.earningsTotalCagr)}</td>
              <td>{formatPercent(data.summary.epsDilutedCagr)}</td>
            </tr>
            <tr>
              <td>Share count</td>
              <td colSpan={2}>{formatPercent(data.summary.shareCountCagr)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted">Indexes rebased to {formatIndex(100)} in {data.summary.firstYear}.</p>
    </section>
  )
}

function ChartBlock({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="chart-block">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={260} minWidth={0}>
        {children}
      </ResponsiveContainer>
    </div>
  )
}

interface PerSharePayload {
  mode: string
  series: Array<{
    fiscalYear: number
    fcfIndex?: number
    fcfPerShareIndex?: number
    revenueIndex?: number
    revenuePerShareIndex?: number
    netIncomeIndex?: number
    epsIndex?: number
    sharesIndex?: number
  }>
  summary: {
    revenueTotalCagr?: number
    revenuePerShareCagr?: number
    fcfTotalCagr?: number
    fcfPerShareCagr?: number
    earningsTotalCagr?: number
    epsDilutedCagr?: number
    shareCountCagr?: number
    firstYear?: number
  }
  equityRaises?: Array<{ year?: number; deal?: string }>
  issueVsToday: {
    issuePrice?: number
    currentPrice?: number
    percentDifference?: number
    sharesIssuedPublic?: number
  }
}
