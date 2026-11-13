import { useWspPage } from "./useWspPage.ts"
import { formatPercent } from "../../utils/wspFormat.ts"
import type { WspRoute } from "./routes.ts"

interface DecisionPageProps {
  offline: boolean
  onOpen: (route: WspRoute) => void
}

export function DecisionPage({ offline, onOpen }: DecisionPageProps) {
  const { data, loading, error } = useWspPage<DecisionPayload>("decision", offline)

  if (loading) return <Skeleton />
  if (error || !data) return <QuietError text={error} />

  const pillars = scoreVerdict(data)

  return (
    <section className="panel verdict-panel">
      <p className="eyebrow">Decision</p>
      <h2>
        Verdict: <span className={`verdict-${pillars.final.toLowerCase().replaceAll(" ", "-")}`}>{pillars.final}</span>
      </h2>
      <p className="muted">Based on peer quality, value per share, deal execution and index fit.</p>
      <div className="pillar-grid">
        {pillars.pillars.map((pillar) => (
          <button
            key={pillar.name}
            type="button"
            className="pillar-card clickable"
            onClick={() => onOpen(pillar.route)}
          >
            <p className="eyebrow">{pillar.name}</p>
            <strong className={`pillar-${pillar.status.toLowerCase().replaceAll(" ", "-")}`}>{pillar.status}</strong>
            <p>{pillar.rule}</p>
            <p className="muted">{pillar.detail}</p>
          </button>
        ))}
      </div>
    </section>
  )
}

interface DecisionPayload {
  mode: string
  perShare?: {
    summary?: {
      fcfPerShareCagr?: number
      epsDilutedCagr?: number
      shareCountCagr?: number
      revenueTotalCagr?: number
    }
  }
  peers?: {
    status?: string
    reason?: string
    rows?: Array<{
      ticker: string
      rankRevenueCagr?: number
      rankFcfMargin?: number
      rankReinvestment?: number
      rankRoic?: number
      rankNetDebtToEbitda?: number
      nCompanies?: number
    }>
  }
  deals?: {
    promises?: Array<{ deal?: string; status?: string }>
  }
  indexFit?: {
    status?: string
    reason?: string
    equalWeight?: { withWsp?: number; withoutWsp?: number }
  }
  offline?: unknown
}

function scoreVerdict(data: DecisionPayload) {
  const peer = scorePeer(data.peers)
  const value = scoreValue(data.perShare?.summary)
  const deals = scoreDeals(data.deals?.promises ?? [])
  const fit = scoreFit(data.indexFit)
  const pillars = [peer, value, deals, fit]
  const pass = pillars.filter((pillar) => pillar.status === "PASS").length
  const fail = pillars.filter((pillar) => pillar.status === "FAIL").length
  const insufficient = pillars.filter((pillar) => pillar.status === "INSUFFICIENT DATA").length
  let final = "WATCH"
  if (insufficient >= 2) final = "INSUFFICIENT DATA"
  else if (fail >= 2) final = "REJECT"
  else if (pass >= 3 && fail === 0) final = "ADMIT"
  return { final, pillars }
}

function scorePeer(peers: DecisionPayload["peers"]) {
  const rule = "Top half on at least 3 of 5 metrics"
  if (!peers || peers.status !== "OK") {
    return { name: "Peer quality", status: "INSUFFICIENT DATA", rule, detail: peers?.reason || "Not enough peer statements yet.", route: "peers" as WspRoute }
  }
  const wsp = peers.rows?.find((row) => row.ticker === "WSP.TO")
  const n = wsp?.nCompanies ?? peers.rows?.length ?? 0
  const cutoff = Math.ceil(n / 2)
  const ranks = [wsp?.rankRevenueCagr, wsp?.rankFcfMargin, wsp?.rankReinvestment, wsp?.rankRoic, wsp?.rankNetDebtToEbitda].filter(
    (value): value is number => typeof value === "number",
  )
  const topHalf = ranks.filter((rank) => rank <= cutoff).length
  const status = topHalf >= 3 ? "PASS" : topHalf <= 1 ? "FAIL" : "WATCH"
  return {
    name: "Peer quality",
    status,
    rule,
    detail: `Top half on ${topHalf} of ${ranks.length} metrics.`,
    route: "peers" as WspRoute,
  }
}

function scoreValue(summary?: {
  fcfPerShareCagr?: number
  epsDilutedCagr?: number
  shareCountCagr?: number
  revenueTotalCagr?: number
}) {
  const rule = "FCF/share and EPS grow; share count grows slower than revenue"
  if (!summary || summary.fcfPerShareCagr == null || summary.epsDilutedCagr == null || summary.shareCountCagr == null || summary.revenueTotalCagr == null) {
    return { name: "Value per share", status: "INSUFFICIENT DATA", rule, detail: "Per-share history incomplete.", route: "per-share" as WspRoute }
  }
  const status =
    summary.fcfPerShareCagr <= 0
      ? "FAIL"
      : summary.fcfPerShareCagr > 0 && summary.epsDilutedCagr > 0 && summary.shareCountCagr < summary.revenueTotalCagr
        ? "PASS"
        : "WATCH"
  return {
    name: "Value per share",
    status,
    rule,
    detail: `FCF/share ${formatPercent(summary.fcfPerShareCagr)}, EPS ${formatPercent(summary.epsDilutedCagr)}.`,
    route: "per-share" as WspRoute,
  }
}

function scoreDeals(promises: Array<{ status?: string }>) {
  const rule = "No misses and at least two delivered or on track"
  const measurable = promises.filter((row) => row.status && !/not yet measurable/i.test(row.status))
  if (measurable.length < 3) {
    return { name: "Deal execution", status: "INSUFFICIENT DATA", rule, detail: "Too few measurable promises.", route: "deals" as WspRoute }
  }
  const missed = promises.filter((row) => /Missed/i.test(row.status || "") && !/abandoned/i.test(row.status || ""))
  const delivered = promises.filter((row) => /Delivered|On Track/i.test(row.status || "")).length
  const status = missed.length >= 2 ? "FAIL" : missed.length === 0 && delivered >= 2 ? "PASS" : "WATCH"
  return {
    name: "Deal execution",
    status,
    rule,
    detail: `${delivered} delivered/on track; ${missed.length} missed.`,
    route: "deals" as WspRoute,
  }
}

function scoreFit(indexFit: DecisionPayload["indexFit"]) {
  const rule = "Volatility with WSP no higher than without"
  if (!indexFit || indexFit.status !== "OK" || indexFit.equalWeight?.withWsp == null || indexFit.equalWeight.withoutWsp == null) {
    return { name: "Index fit", status: "INSUFFICIENT DATA", rule, detail: indexFit?.reason || "Price history incomplete.", route: "index-fit" as WspRoute }
  }
  const status = indexFit.equalWeight.withWsp <= indexFit.equalWeight.withoutWsp ? "PASS" : "WATCH"
  return {
    name: "Index fit",
    status,
    rule,
    detail: `Equal-weight vol ${formatPercent(indexFit.equalWeight.withWsp)} with WSP vs ${formatPercent(indexFit.equalWeight.withoutWsp)} without.`,
    route: "index-fit" as WspRoute,
  }
}

function Skeleton() {
  return <div className="panel skeleton-panel">Loading decision…</div>
}

function QuietError({ text }: { text?: string | null }) {
  return <div className="panel">{text || "Not enough data yet."}</div>
}
