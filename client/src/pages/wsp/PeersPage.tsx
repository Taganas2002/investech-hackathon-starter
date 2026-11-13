import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { formatPercent, formatRatio, tooltipFormatter } from "../../utils/wspFormat.ts"
import { useWspPage } from "./useWspPage.ts"

type MetricKey = "revenueCagr" | "fcfMargin" | "reinvestment" | "roic" | "netDebtToEbitda"

const METRICS: Array<{ key: MetricKey; label: string; rankKey: string; lowerBetter?: boolean }> = [
  { key: "revenueCagr", label: "Revenue CAGR", rankKey: "rankRevenueCagr" },
  { key: "fcfMargin", label: "FCF margin", rankKey: "rankFcfMargin" },
  { key: "reinvestment", label: "Reinvestment", rankKey: "rankReinvestment" },
  { key: "roic", label: "ROIC", rankKey: "rankRoic" },
  { key: "netDebtToEbitda", label: "Net debt / EBITDA", rankKey: "rankNetDebtToEbitda", lowerBetter: true },
]

export function PeersPage({ offline }: { offline: boolean }) {
  const { data, loading, error } = useWspPage<PeersPayload>("peers", offline)
  const [metric, setMetric] = useState<MetricKey>("fcfMargin")

  const rows = useMemo(() => {
    const list = data?.rows ?? []
    return [...list].sort((a, b) => {
      const av = a[metric]
      const bv = b[metric]
      if (av == null) return 1
      if (bv == null) return -1
      return METRICS.find((item) => item.key === metric)?.lowerBetter ? av - bv : bv - av
    })
  }, [data, metric])

  if (loading) return <div className="panel skeleton-panel">Loading peer comparison…</div>
  if (error || !data) return <div className="panel">{error || "Not enough data yet."}</div>
  if (data.status !== "OK") return <div className="panel">Not enough data yet.</div>

  const selected = METRICS.find((item) => item.key === metric)!
  const chartData = rows.map((row) => ({
    name: row.ticker,
    value: row[metric],
    fill: row.ticker === "WSP.TO" ? "#5ec8c0" : "#7aa2ff",
  }))

  return (
    <section className="panel wsp-panel">
      <h2>Peer comparison</h2>
      <div className="filter-row">
        {METRICS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={metric === item.key ? "chip selected" : "chip"}
            onClick={() => setMetric(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="chart-block">
        <h3>{selected.label}</h3>
        <ResponsiveContainer width="100%" height={280} minWidth={0}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
            <XAxis dataKey="name" stroke="#8b9bb4" />
            <YAxis
              stroke="#8b9bb4"
              tickFormatter={selected.key === "netDebtToEbitda" ? tooltipFormatter("ratio") : tooltipFormatter("percent")}
            />
            <Tooltip
              formatter={selected.key === "netDebtToEbitda" ? tooltipFormatter("ratio") : tooltipFormatter("percent")}
            />
            <Bar dataKey="value">
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Rev CAGR</th>
              <th>FCF margin</th>
              <th>Reinvestment</th>
              <th>ROIC</th>
              <th>Net debt / EBITDA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ticker} className={row.ticker === "WSP.TO" ? "highlight-row" : undefined}>
                <td>
                  {row.company} ({row.ticker})
                </td>
                <td>{formatPercent(row.revenueCagr)}</td>
                <td>{formatPercent(row.fcfMargin)}</td>
                <td>{formatPercent(row.reinvestment)}</td>
                <td>{formatPercent(row.roic)}</td>
                <td>{formatRatio(row.netDebtToEbitda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

interface PeersPayload {
  mode: string
  status?: string
  rows?: Array<{
    ticker: string
    company: string
    revenueCagr?: number
    fcfMargin?: number
    reinvestment?: number
    roic?: number
    netDebtToEbitda?: number
  }>
}
