import { useState } from "react"
import { formatPercent } from "../../utils/wspFormat.ts"
import { useWspPage } from "./useWspPage.ts"

export function IndexFitPage({ offline }: { offline: boolean }) {
  const { data, loading, error } = useWspPage<IndexFitPayload>("index-fit", offline)
  const [mode, setMode] = useState<"equal" | "minvar">("equal")

  if (loading) return <div className="panel skeleton-panel">Loading index fit…</div>
  if (error || !data) return <div className="panel">{error || "Not enough data yet."}</div>
  if (data.status !== "OK") return <div className="panel">Not enough data yet.</div>

  const active =
    mode === "equal"
      ? {
          without: data.equalWeight?.withoutWsp,
          with: data.equalWeight?.withWsp,
          weight: data.equalWeight?.wspWeight,
        }
      : {
          without: data.minVariance?.withoutWspVol,
          with: data.minVariance?.withWspVol,
          weight: data.minVariance?.wspWeight,
        }

  return (
    <section className="panel wsp-panel">
      <h2>Index fit</h2>
      <p className="muted">
        Simplified analysis on about {data.overlapDays} overlapping days
        {data.dateRange?.min ? ` (${data.dateRange.min} to ${data.dateRange.max})` : ""}. WSP is CAD; members are USD.
      </p>
      <div className="filter-row">
        <button type="button" className={mode === "equal" ? "chip selected" : "chip"} onClick={() => setMode("equal")}>
          Equal weight
        </button>
        <button type="button" className={mode === "minvar" ? "chip selected" : "chip"} onClick={() => setMode("minvar")}>
          Min variance
        </button>
      </div>
      <div className="metric-grid">
        <article className="metric-card">
          <p>Vol without WSP</p>
          <strong>{formatPercent(active.without)}</strong>
        </article>
        <article className="metric-card">
          <p>Vol with WSP</p>
          <strong>{formatPercent(active.with)}</strong>
        </article>
        <article className="metric-card">
          <p>WSP weight</p>
          <strong>{formatPercent(active.weight)}</strong>
        </article>
        <article className="metric-card">
          <p>Avg correlation</p>
          <strong>{data.averageCorrelation != null ? data.averageCorrelation.toFixed(2) : "—"}</strong>
        </article>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Correlation with WSP</th>
            </tr>
          </thead>
          <tbody>
            {(data.correlations ?? []).map((row) => (
              <tr key={row.ticker}>
                <td>{row.ticker}</td>
                <td>{row.correlation != null ? row.correlation.toFixed(2) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

interface IndexFitPayload {
  mode: string
  status?: string
  overlapDays?: number
  dateRange?: { min?: string; max?: string }
  averageCorrelation?: number
  correlations?: Array<{ ticker: string; correlation?: number }>
  equalWeight?: { withoutWsp?: number; withWsp?: number; wspWeight?: number }
  minVariance?: { withoutWspVol?: number; withWspVol?: number; wspWeight?: number }
}
