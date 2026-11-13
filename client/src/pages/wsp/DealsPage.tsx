import { useMemo, useState } from "react"
import { useWspPage } from "./useWspPage.ts"

export function DealsPage({ offline }: { offline: boolean }) {
  const { data, loading, error } = useWspPage<DealsPayload>("deals", offline)
  const [deal, setDeal] = useState("all")
  const [status, setStatus] = useState("all")

  const promises = useMemo(() => {
    return (data?.promises ?? []).filter((row) => {
      if (deal !== "all" && row.deal !== deal) return false
      if (status !== "all" && row.status !== status) return false
      return true
    })
  }, [data, deal, status])

  if (loading) return <div className="panel skeleton-panel">Loading deal execution…</div>
  if (error || !data) return <div className="panel">{error || "Not enough data yet."}</div>

  const deals = [...new Set((data.promises ?? []).map((row) => row.deal).filter(Boolean))]
  const statuses = [...new Set((data.promises ?? []).map((row) => row.status).filter(Boolean))]

  return (
    <section className="panel wsp-panel">
      <h2>Deal execution</h2>
      <div className="filter-row">
        <select value={deal} onChange={(event) => setDeal(event.target.value)}>
          <option value="all">All deals</option>
          {deals.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Deal</th>
              <th>Promise</th>
              <th>Result</th>
              <th>Status</th>
              <th>Deadline</th>
            </tr>
          </thead>
          <tbody>
            {promises.map((row) => (
              <tr key={`${row.deal}-${row.promise}`}>
                <td>{row.deal}</td>
                <td>{row.promise}</td>
                <td>{row.result}</td>
                <td>{row.status}</td>
                <td>{row.deadline}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(data.claims ?? []).length > 0 ? (
        <>
          <h3>Earnings-call claims</h3>
          <ul>
            {(data.claims ?? []).map((claim) => (
              <li key={`${claim.call}-${claim.target}`}>
                <strong>{claim.target}</strong> — {claim.verdict}
                <div className="muted">“{claim.claim_quote}”</div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}

interface DealsPayload {
  mode: string
  promises?: Array<Record<string, string>>
  claims?: Array<Record<string, string>>
}
