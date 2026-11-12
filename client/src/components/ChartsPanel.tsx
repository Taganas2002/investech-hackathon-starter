import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { CompanyScore, PricePoint } from "../types/index.ts"
import { shortDate } from "../utils/format.ts"

interface ChartsPanelProps {
  scores: CompanyScore[]
  selectedTicker: string
  prices: PricePoint[]
  onSelect: (ticker: string) => void
}

export function ChartsPanel({ scores, selectedTicker, prices, onSelect }: ChartsPanelProps) {
  const scoreData = scores.map((score) => ({ ticker: score.ticker, score: score.totalScore }))
  const priceData = [...prices]
    .filter((point) => point.ticker === selectedTicker)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point) => ({ date: point.date, close: point.close }))

  return (
    <div className="chart-grid">
      <section className="panel">
        <div className="panel-title">
          <h2>Opportunity scores</h2>
          <p>Click a bar to open that company. Scores are peer-relative, not a price target.</p>
        </div>
        <div className="chart-frame">
          {scoreData.length === 0 ? (
            <p className="muted chart-empty">No scores to chart.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={scoreData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(158,184,224,0.15)" vertical={false} />
                <XAxis dataKey="ticker" stroke="#93a7c4" tick={{ fill: "#93a7c4", fontSize: 12 }} />
                <YAxis domain={[0, 100]} stroke="#93a7c4" tick={{ fill: "#93a7c4", fontSize: 12 }} />
                <Tooltip
                  cursor={{ fill: "rgba(142,182,255,0.08)" }}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: "#e8f0fb" }}
                />
                <Bar
                  dataKey="score"
                  radius={[6, 6, 0, 0]}
                  onClick={(bar) => {
                    const ticker = typeof bar.payload?.ticker === "string" ? bar.payload.ticker : undefined
                    if (ticker) onSelect(ticker)
                  }}
                >
                  {scoreData.map((entry) => (
                    <Cell
                      key={entry.ticker}
                      fill={entry.ticker === selectedTicker ? "#3ee0a0" : "#8eb6ff"}
                      cursor="pointer"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>{selectedTicker ? `${selectedTicker} price` : "Price"}</h2>
          <p>Recent closes from the loaded price history. Not a forecast.</p>
        </div>
        <div className="chart-frame">
          {priceData.length < 2 ? (
            <p className="muted chart-empty">
              No price history for {selectedTicker || "this company"} yet. Import a price CSV or return to demo data.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={priceData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(158,184,224,0.15)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#93a7c4"
                  tick={{ fill: "#93a7c4", fontSize: 12 }}
                  minTickGap={28}
                  tickFormatter={shortDate}
                />
                <YAxis
                  stroke="#93a7c4"
                  tick={{ fill: "#93a7c4", fontSize: 12 }}
                  domain={["auto", "auto"]}
                  tickFormatter={(value: number) => `$${Number(value).toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: "#e8f0fb" }}
                  formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Close"]}
                />
                <Line type="monotone" dataKey="close" stroke="#3ee0a0" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  )
}

const tooltipStyle = {
  background: "#10213a",
  border: "1px solid rgba(158,184,224,0.3)",
  borderRadius: 8,
  color: "#e8f0fb",
}
