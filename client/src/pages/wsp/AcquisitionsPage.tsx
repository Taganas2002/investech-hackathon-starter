import { useMemo, useState } from "react"
import { formatMoney } from "../../utils/wspFormat.ts"
import { useWspPage } from "./useWspPage.ts"

export function AcquisitionsPage({ offline }: { offline: boolean }) {
  const { data, loading, error } = useWspPage<AcquisitionsPayload>("acquisitions", offline)
  const [selected, setSelected] = useState<string | null>(null)
  const deal = useMemo(
    () => data?.deals?.find((item) => item.target === selected) ?? null,
    [data, selected],
  )

  if (loading) return <div className="panel skeleton-panel">Loading acquisitions…</div>
  if (error || !data) return <div className="panel">{error || "Not enough data yet."}</div>

  return (
    <section className="panel wsp-panel">
      <h2>Acquisitions</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Target</th>
              <th>Status</th>
              <th>Price</th>
              <th>Multiple</th>
              <th>Funding</th>
            </tr>
          </thead>
          <tbody>
            {(data.deals ?? []).map((item) => (
              <tr key={item.target} className={selected === item.target ? "highlight-row" : undefined} onClick={() => setSelected(item.target)}>
                <td>
                  <strong>{item.target}</strong>
                  <div className="muted">{item.focus}</div>
                </td>
                <td>{item.status}</td>
                <td>
                  {item.price} {item.price_currency}
                  <div className="muted">{item.price_basis}</div>
                </td>
                <td>
                  {item.multiple_paid || "—"}
                  <div className="muted">{item.multiple_basis}</div>
                </td>
                <td>{item.funding_of_deal || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deal ? (
        <div className="drawer">
          <h3>{deal.target}</h3>
          <p>{deal.funding_of_deal}</p>
          <p className="muted">{deal.note}</p>
          <button type="button" className="btn" onClick={() => setSelected(null)}>
            Close
          </button>
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>FY</th>
              <th>Acquisitions cash</th>
              <th>Free cash flow</th>
            </tr>
          </thead>
          <tbody>
            {(data.cashSpentVsFcf ?? []).map((row) => (
              <tr key={row.fiscalYear}>
                <td>{row.fiscalYear}</td>
                <td>{formatMoney(row.acquisitionsCash)}</td>
                <td>{formatMoney(row.freeCashFlow)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

interface AcquisitionsPayload {
  mode: string
  deals?: Array<Record<string, string>>
  cashSpentVsFcf?: Array<{ fiscalYear: number; acquisitionsCash?: number; freeCashFlow?: number }>
}
