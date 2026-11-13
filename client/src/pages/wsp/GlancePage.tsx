import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatMoney, formatPercent, formatPrice, formatRatio, tooltipFormatter } from "../../utils/wspFormat.ts"
import { useWspPage } from "./useWspPage.ts"

export function GlancePage({ offline }: { offline: boolean }) {
  const { data, loading, error } = useWspPage<GlancePayload>("glance", offline)
  const [period, setPeriod] = useState<"Quarterly" | "Annual">("Quarterly")
  const [region, setRegion] = useState("total")
  const [eventType, setEventType] = useState("all")
  const [expanded, setExpanded] = useState<string | null>(null)

  const quote = data?.quote
  const latest = data?.series?.latest
  const belowHigh =
    quote?.price != null && quote.yearHigh ? ((quote.yearHigh - quote.price) / quote.yearHigh) * 100 : undefined

  const regionBars = useMemo(() => pivotByDate(data?.series?.regionRevenue ?? [], period), [data, period])
  const sectorBars = useMemo(() => pivotByDate(data?.series?.sectorRevenue ?? [], period), [data, period])
  const ebitdaSeries = useMemo(() => {
    const rows = data?.series?.adjustedEbitda ?? []
    const ebitdaId = region === "total" ? "adjusted_ebitda" : `adjusted_${region}_ebitda`
    const marginId = region === "total" ? "adjusted_ebitda_margin" : `adjusted_${region}_ebitda_margin`
    const dates = [...new Set(rows.map((row) => row.reportDate))].sort()
    return dates.map((date) => ({
      date,
      ebitda: rows.find((row) => row.reportDate === date && row.metricId === ebitdaId)?.value,
      margin: rows.find((row) => row.reportDate === date && row.metricId === marginId)?.value,
    }))
  }, [data, region])

  if (loading) return <div className="panel skeleton-panel">Loading WSP at a glance…</div>
  if (error || !data) return <div className="panel">{error || "Not enough data yet."}</div>

  const events = (data.events ?? []).filter((event) => eventType === "all" || event.type === eventType)
  const eventTypes = [...new Set((data.events ?? []).map((event) => event.type).filter(Boolean))]

  return (
    <section className="panel wsp-panel">
      <h2>WSP at a glance</h2>
      <div className="metric-grid">
        <Card label="Price" value={formatPrice(quote?.price)} />
        <Card label="Market cap" value={formatMoney(quote?.marketCap)} />
        <Card label="% below 52-week high" value={belowHigh != null ? formatPercent(belowHigh / 100) : "—"} />
        <Card label="Backlog" value={formatMoney(latest?.backlog?.value)} />
        <Card label="Employees" value={latest?.employees?.value != null ? Math.round(latest.employees.value).toLocaleString() : "—"} />
        <Card label="Leverage" value={formatRatio(latest?.leverage?.value)} />
        <Card label="Adj. EBITDA margin" value={formatPercent(latest?.adjustedEbitdaMargin?.value)} />
        <Card label="Net revenue growth" value={formatPercent(latest?.netRevenueGrowth?.value)} />
      </div>

      <div className="filter-row">
        <button type="button" className={period === "Quarterly" ? "chip selected" : "chip"} onClick={() => setPeriod("Quarterly")}>
          Quarterly
        </button>
        <button type="button" className={period === "Annual" ? "chip selected" : "chip"} onClick={() => setPeriod("Annual")}>
          Annual
        </button>
      </div>

      <div className="chart-row">
        <ChartOrEmpty title="Price" empty={!data.prices?.length}>
          <LineChart data={data.prices}>
            <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
            <XAxis dataKey="date" hide />
            <YAxis stroke="#8b9bb4" tickFormatter={tooltipFormatter("price")} domain={["auto", "auto"]} />
            <Tooltip formatter={tooltipFormatter("price")} />
            <Line type="monotone" dataKey="close" stroke="#5ec8c0" dot={false} name="Price" />
            <ReferenceLine y={data.issuePrice} stroke="#f0b429" strokeDasharray="4 4" />
          </LineChart>
        </ChartOrEmpty>
        <ChartOrEmpty title="Market cap" empty={!data.marketCap?.length}>
          <LineChart data={data.marketCap}>
            <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
            <XAxis dataKey="date" hide />
            <YAxis stroke="#8b9bb4" tickFormatter={tooltipFormatter("money")} />
            <Tooltip formatter={tooltipFormatter("money")} />
            <Line type="monotone" dataKey="marketCap" stroke="#7aa2ff" dot={false} name="Market cap" />
          </LineChart>
        </ChartOrEmpty>
      </div>

      <ChartOrEmpty title="Net revenue by region" empty={!regionBars.length}>
        <BarChart data={regionBars}>
          <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
          <XAxis dataKey="date" hide />
          <YAxis stroke="#8b9bb4" tickFormatter={tooltipFormatter("money")} />
          <Tooltip formatter={tooltipFormatter("money")} />
          <Legend />
          {Object.keys(regionBars[0] || {})
            .filter((key) => key !== "date")
            .map((key, index) => (
              <Bar key={key} dataKey={key} stackId="a" fill={palette[index % palette.length]} />
            ))}
        </BarChart>
      </ChartOrEmpty>

      <ChartOrEmpty title="Net revenue by sector" empty={!sectorBars.length}>
        <BarChart data={sectorBars}>
          <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
          <XAxis dataKey="date" hide />
          <YAxis stroke="#8b9bb4" tickFormatter={tooltipFormatter("money")} />
          <Tooltip formatter={tooltipFormatter("money")} />
          <Legend />
          {Object.keys(sectorBars[0] || {})
            .filter((key) => key !== "date")
            .map((key, index) => (
              <Bar key={key} dataKey={key} stackId="a" fill={palette[index % palette.length]} />
            ))}
        </BarChart>
      </ChartOrEmpty>

      <div className="filter-row">
        {["total", "americas", "canada", "emeia", "apac"].map((item) => (
          <button key={item} type="button" className={region === item ? "chip selected" : "chip"} onClick={() => setRegion(item)}>
            {item}
          </button>
        ))}
      </div>
      <ChartOrEmpty title="Adjusted EBITDA and margin" empty={!ebitdaSeries.some((row) => row.ebitda != null || row.margin != null)}>
        <ComposedChart data={ebitdaSeries}>
          <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
          <XAxis dataKey="date" hide />
          <YAxis yAxisId="left" stroke="#8b9bb4" tickFormatter={tooltipFormatter("money")} />
          <YAxis yAxisId="right" orientation="right" stroke="#8b9bb4" tickFormatter={tooltipFormatter("percent")} />
          <Tooltip />
          <Legend />
          <Bar yAxisId="left" dataKey="ebitda" fill="#5ec8c0" name="Adj. EBITDA" />
          <Line yAxisId="right" type="monotone" dataKey="margin" stroke="#f0b429" name="Margin" dot={false} />
        </ComposedChart>
      </ChartOrEmpty>

      <ChartOrEmpty title="Leverage" empty={!(data.series?.leverage?.length)}>
        <LineChart data={data.series?.leverage ?? []}>
          <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
          <XAxis dataKey="reportDate" hide />
          <YAxis stroke="#8b9bb4" tickFormatter={tooltipFormatter("ratio")} domain={[0, "auto"]} />
          <Tooltip formatter={tooltipFormatter("ratio")} />
          <ReferenceLine y={1} stroke="#5ec8c0" strokeDasharray="3 3" />
          <ReferenceLine y={2} stroke="#5ec8c0" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="value" stroke="#f0b429" dot={false} name="Net debt / adj. EBITDA" />
        </LineChart>
      </ChartOrEmpty>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>FY</th>
              <th>Revenue</th>
              <th>EBITDA</th>
              <th>Net income</th>
              <th>Diluted EPS</th>
              <th>FCF</th>
              <th>Net debt</th>
            </tr>
          </thead>
          <tbody>
            {(data.annualSummary ?? []).map((row) => (
              <tr key={row.fiscalYear}>
                <td>{row.fiscalYear}</td>
                <td>{formatMoney(row.revenue)}</td>
                <td>{formatMoney(row.ebitda)}</td>
                <td>{formatMoney(row.netIncome)}</td>
                <td>{row.epsDiluted?.toFixed(2) ?? "—"}</td>
                <td>{formatMoney(row.freeCashFlow)}</td>
                <td>{formatMoney(row.netDebt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="chip-columns">
        <EntityCards title="Regions" items={entitiesOf(data.entities, "segment")} />
        <EntityCards title="Business lines" items={entitiesOf(data.entities, "business-line")} />
      </div>
      <EntityCards title="Subsidiaries" items={entitiesOf(data.entities, "subsidiary")} />

      <div className="filter-row">
        <button type="button" className={eventType === "all" ? "chip selected" : "chip"} onClick={() => setEventType("all")}>
          All
        </button>
        {eventTypes.map((type) => (
          <button
            key={type}
            type="button"
            className={eventType === type ? "chip selected" : "chip"}
            onClick={() => setEventType(type || "all")}
          >
            {type}
          </button>
        ))}
      </div>
      <ul className="event-list">
        {events.map((event, index) => {
          const key = `${event.date}-${event.summary}-${index}`
          return (
            <li key={key}>
              <button type="button" className="event-row" onClick={() => setExpanded(expanded === key ? null : key)}>
                <strong>{event.date || "Undated"}</strong> · {event.type}
                <div>{event.summary}</div>
              </button>
              {expanded === key && event.quote ? <blockquote>“{event.quote}”</blockquote> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

function ChartOrEmpty({
  title,
  empty,
  children,
}: {
  title: string
  empty: boolean
  children: React.ReactElement
}) {
  return (
    <div className="chart-block">
      <h3>{title}</h3>
      {empty ? (
        <p className="muted">Not enough data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260} minWidth={0}>
          {children}
        </ResponsiveContainer>
      )}
    </div>
  )
}

function EntityCards({ title, items }: { title: string; items: Array<{ name?: string; description?: string | null }> }) {
  if (!items.length) return null
  return (
    <div>
      <h3>{title}</h3>
      <div className="entity-grid">
        {items.map((item) => (
          <article key={item.name} className="entity-card">
            <strong>{item.name}</strong>
            <p className="muted">{item.description}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

function entitiesOf(entities: GlancePayload["entities"], kind: string) {
  return (entities ?? []).filter((entity) => entity.kind === kind)
}

function pivotByDate(
  rows: Array<{ metricId: string; reportDate: string; value: number; periodType?: string }>,
  period: string,
) {
  const filtered = rows.filter((row) => !row.periodType || row.periodType === period)
  const dates = [...new Set(filtered.map((row) => row.reportDate))].sort()
  return dates.map((date) => {
    const point: Record<string, string | number> = { date }
    for (const row of filtered.filter((item) => item.reportDate === date)) {
      point[row.metricId] = row.value
    }
    return point
  })
}

const palette = ["#5ec8c0", "#7aa2ff", "#f0b429", "#ff7b72", "#c084fc", "#34d399"]

interface GlancePayload {
  mode: string
  quote?: {
    price?: number
    marketCap?: number
    yearHigh?: number
  }
  prices?: Array<{ date: string; close: number }>
  marketCap?: Array<{ date?: string; marketCap?: number }>
  issuePrice?: number
  entities?: Array<{ name?: string; kind?: string; description?: string | null }>
  series?: {
    regionRevenue?: Array<{ metricId: string; reportDate: string; value: number; periodType?: string }>
    sectorRevenue?: Array<{ metricId: string; reportDate: string; value: number; periodType?: string }>
    adjustedEbitda?: Array<{ metricId: string; reportDate: string; value: number }>
    leverage?: Array<{ reportDate: string; value: number }>
    latest?: {
      backlog?: { value?: number }
      employees?: { value?: number }
      leverage?: { value?: number }
      adjustedEbitdaMargin?: { value?: number }
      netRevenueGrowth?: { value?: number }
    }
  }
  annualSummary?: Array<{
    fiscalYear: number
    revenue?: number
    ebitda?: number
    netIncome?: number
    epsDiluted?: number
    freeCashFlow?: number
    netDebt?: number
  }>
  events?: Array<{ date?: string | null; type?: string; summary?: string; quote?: string }>
}
