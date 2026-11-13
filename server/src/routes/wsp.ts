import { Router } from "express"
import { onesheetConfigured } from "../services/onesheetLive.js"
import { toolkitReady } from "../services/toolkit.js"
import {
  getAcquisitionsLive,
  getDealsLive,
  getDecisionLive,
  getGlanceLive,
  getIndexFitLive,
  getOfflineDashboard,
  getPeersLive,
  getPerShareLive,
} from "../services/wspLive.js"

export const wspRouter = Router()

wspRouter.get("/ready", (_req, res) => {
  res.json({
    live: onesheetConfigured(),
    offlineAvailable: toolkitReady(),
  })
})

wspRouter.get("/decision", async (req, res, next) => {
  try {
    res.json(wantOffline(req) ? await offlineDecision() : await getDecisionLive())
  } catch (error) {
    next(error)
  }
})

wspRouter.get("/glance", async (req, res, next) => {
  try {
    res.json(wantOffline(req) ? offlineGlance() : await getGlanceLive())
  } catch (error) {
    next(error)
  }
})

wspRouter.get("/per-share", async (req, res, next) => {
  try {
    res.json(wantOffline(req) ? offlinePerShare() : await getPerShareLive())
  } catch (error) {
    next(error)
  }
})

wspRouter.get("/peers", async (req, res, next) => {
  try {
    res.json(wantOffline(req) ? offlinePeers() : await getPeersLive())
  } catch (error) {
    next(error)
  }
})

wspRouter.get("/acquisitions", async (req, res, next) => {
  try {
    res.json(wantOffline(req) ? offlineAcquisitions() : await getAcquisitionsLive())
  } catch (error) {
    next(error)
  }
})

wspRouter.get("/deals", async (req, res, next) => {
  try {
    res.json(wantOffline(req) ? offlineDeals() : await getDealsLive())
  } catch (error) {
    next(error)
  }
})

wspRouter.get("/index-fit", async (req, res, next) => {
  try {
    res.json(wantOffline(req) ? offlineIndexFit() : await getIndexFitLive())
  } catch (error) {
    next(error)
  }
})

async function offlineDecision() {
  return {
    mode: "live",
    perShare: offlinePerShare(),
    peers: offlinePeers(),
    deals: offlineDeals(),
    indexFit: offlineIndexFit(),
  }
}

function offlinePerShare() {
  const pack = getOfflineDashboard()
  const series = pack.perShare.map((row) => ({
    fiscalYear: Number(row.fiscal_year),
    fcfIndex: Number(row.free_cash_flow_index_first_year_100),
    fcfPerShareIndex: Number(row.free_cash_flow_per_share_index_first_year_100),
    revenueIndex: Number(row.revenue_index_first_year_100),
    revenuePerShareIndex: Number(row.revenue_per_share_index_first_year_100),
    netIncomeIndex: Number(row.net_income_index_first_year_100),
    epsIndex: Number(row.eps_diluted_index_first_year_100),
    sharesIndex: Number(row.shares_diluted_index_first_year_100),
    revenue: Number(row.revenue),
    revenuePerShare: Number(row.revenue_per_share),
    freeCashFlow: Number(row.free_cash_flow),
    freeCashFlowPerShare: Number(row.free_cash_flow_per_share),
    netIncome: Number(row.net_income),
    epsDiluted: Number(row.eps_diluted),
    sharesDiluted: Number(row.shares_diluted),
  }))
  const first = series[0]
  const last = series.at(-1)
  const years = first && last ? last.fiscalYear - first.fiscalYear : 0
  const cagr = (start?: number, end?: number) =>
    start && end && years > 0 && start > 0 && end > 0 ? (end / start) ** (1 / years) - 1 : undefined
  const quote = (pack.company.quote as { price?: number } | undefined) ?? {}
  return {
    mode: "live",
    series,
    summary: {
      revenueTotalCagr: cagr(first?.revenue, last?.revenue),
      revenuePerShareCagr: cagr(first?.revenuePerShare, last?.revenuePerShare),
      fcfTotalCagr: cagr(first?.freeCashFlow, last?.freeCashFlow),
      fcfPerShareCagr: cagr(first?.freeCashFlowPerShare, last?.freeCashFlowPerShare),
      earningsTotalCagr: cagr(first?.netIncome, last?.netIncome),
      epsDilutedCagr: cagr(first?.epsDiluted, last?.epsDiluted),
      shareCountCagr: cagr(first?.sharesDiluted, last?.sharesDiluted),
      firstYear: first?.fiscalYear,
      lastYear: last?.fiscalYear,
    },
    equityRaises: [],
    issueVsToday: {
      issuePrice: 232.8,
      currentPrice: quote.price,
      percentDifference: quote.price != null ? ((quote.price - 232.8) / 232.8) * 100 : undefined,
      sharesIssuedPublic: 3_145_000,
    },
  }
}

function offlinePeers() {
  const pack = getOfflineDashboard()
  return {
    mode: "live",
    status: pack.peers.length >= 3 ? "OK" : "INSUFFICIENT DATA",
    rows: pack.peers.map((row) => ({
      ticker: row.ticker,
      company: row.company,
      revenueCagr: Number(row.revenue_cagr),
      fcfMargin: Number(row.fcf_margin),
      reinvestment: Number(row.reinvestment),
      roic: Number(row.roic),
      netDebtToEbitda: Number(row.net_debt_to_ebitda),
      rankRevenueCagr: Number(row.rank_revenue_cagr),
      rankFcfMargin: Number(row.rank_fcf_margin),
      rankReinvestment: Number(row.rank_reinvestment),
      rankRoic: Number(row.rank_roic),
      rankNetDebtToEbitda: Number(row.rank_net_debt_to_ebitda),
      nCompanies: Number(row.n_companies),
    })),
  }
}

function offlineAcquisitions() {
  const pack = getOfflineDashboard()
  return {
    mode: "live",
    deals: pack.deals,
    cashSpentVsFcf: pack.statements
      .filter((row) => row.ticker === "WSP.TO")
      .map((row) => ({
        fiscalYear: Number(row.fiscal_year),
        acquisitionsCash: Number(row.acquisitions_cash),
        freeCashFlow: Number(row.free_cash_flow),
      })),
  }
}

function offlineDeals() {
  const pack = getOfflineDashboard()
  return {
    mode: "live",
    promises: pack.promises,
    claims: pack.claims,
  }
}

function offlineIndexFit() {
  return {
    mode: "live",
    status: "INSUFFICIENT DATA",
    reason: "Not enough data yet.",
  }
}

function offlineGlance() {
  const pack = getOfflineDashboard()
  const company = pack.company as {
    identity?: Record<string, unknown>
    description?: string
    segments?: Array<{ name: string; description?: string }>
    business_lines?: Array<{ name: string; description?: string }>
    subsidiaries?: Array<{ name: string; description?: string }>
    quote?: Record<string, number | string>
  }
  return {
    mode: "live",
    identity: company.identity,
    description: company.description,
    entities: [
      ...(company.segments ?? []).map((item) => ({ ...item, kind: "segment" })),
      ...(company.business_lines ?? []).map((item) => ({ ...item, kind: "business-line" })),
      ...(company.subsidiaries ?? []).map((item) => ({ ...item, kind: "subsidiary" })),
    ],
    quote: company.quote,
    prices: pack.prices
      .filter((row) => row.ticker === "WSP.TO")
      .map((row) => ({ date: row.date, close: Number(row.close), adjClose: Number(row.adj_close) })),
    marketCap: pack.marketCap.map((row) => ({ date: row.date, marketCap: Number(row.market_cap) })),
    series: {
      regionRevenue: [],
      sectorRevenue: [],
      adjustedEbitda: [],
      leverage: [],
      latest: {},
    },
    annualSummary: pack.statements
      .filter((row) => row.ticker === "WSP.TO")
      .map((row) => ({
        fiscalYear: Number(row.fiscal_year),
        revenue: Number(row.revenue),
        ebitda: Number(row.ebitda),
        netIncome: Number(row.net_income),
        epsDiluted: Number(row.eps_diluted),
        freeCashFlow: Number(row.free_cash_flow),
        netDebt: Number(row.net_debt),
      })),
    events: pack.events.map((row) => ({
      date: row.date,
      type: row.type,
      summary: row.summary,
      quote: row.quote,
    })),
    issuePrice: 232.8,
  }
}

function wantOffline(req: { query: Record<string, unknown> }) {
  const value = String(req.query.offline ?? "0")
  return value === "1" || value === "true"
}
