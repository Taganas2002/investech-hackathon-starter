import { readToolkitCsv, readToolkitCsvOptional, readToolkitJson, toolkitReady } from "./toolkit.js"
import { mapPool, onesheetGet } from "./onesheetLive.js"

const PEERS = [
  { ticker: "ACM", name: "AECOM" },
  { ticker: "J", name: "Jacobs" },
  { ticker: "STN.TO", name: "Stantec" },
  { ticker: "TTEK", name: "Tetra Tech" },
  { ticker: "KBR", name: "KBR" },
] as const

const INDEX_MEMBERS = [
  "AME",
  "WCN",
  "BRO",
  "IEX",
  "ETN",
  "ROP",
  "TDY",
  "TDG",
  "ACM",
  "HEI",
  "J",
  "POOL",
  "WSO",
  "DHR",
] as const

const REGIONS = ["americas", "canada", "emeia", "apac"] as const

interface IncomeRow {
  date?: string
  period?: string
  calendarYear?: string | number
  reportedCurrency?: string
  revenue?: number
  ebitda?: number
  operatingIncome?: number
  incomeBeforeTax?: number
  incomeTaxExpense?: number
  netIncome?: number
  eps?: number
  epsdiluted?: number
  weightedAverageShsOut?: number
  weightedAverageShsOutDil?: number
}

interface BalanceRow {
  date?: string
  period?: string
  totalStockholdersEquity?: number
  totalDebt?: number
  netDebt?: number
  cashAndCashEquivalents?: number
  goodwill?: number
  intangibleAssets?: number
}

interface CashRow {
  date?: string
  period?: string
  operatingCashFlow?: number
  capitalExpenditure?: number
  freeCashFlow?: number
  acquisitionsNet?: number
  commonStockIssued?: number
  commonStockRepurchased?: number
  dividendsPaid?: number
}

interface Quote {
  symbol?: string
  name?: string
  price?: number
  marketCap?: number
  yearHigh?: number
  yearLow?: number
  priceAvg50?: number
  priceAvg200?: number
  changesPercentage?: number
}

interface ProfilePayload {
  profile?: {
    identity?: Record<string, unknown>
    overview?: { description?: string; slots?: unknown[] }
    entities?: Array<{ name?: string; kind?: string; description?: string | null }>
  }
  events?: Array<Record<string, unknown>>
  metrics?: Array<{ metricId?: string; metricName?: string }>
  data?: Array<{
    periodId?: string
    periodType?: string
    reportDate?: string
    fiscalYear?: number
    fiscalQuarter?: number
    metricValues?: Record<string, { value?: number; unit?: string; currency?: string; sources?: Array<{ quote?: string }> }>
  }>
}

let profilePromise: Promise<ProfilePayload> | null = null

export async function getWspProfile(): Promise<ProfilePayload> {
  if (!profilePromise) {
    profilePromise = onesheetGet<ProfilePayload>("/company-profiles/wsp").finally(() => {
      // keep resolved promise for process lifetime via onesheet disk cache; allow refresh after TTL by clearing after long wait
    })
  }
  return profilePromise
}

export async function getDecisionLive() {
  const [perShare, peers, deals, indexFit] = await Promise.all([
    getPerShareLive(),
    getPeersLive(),
    getDealsLive(),
    getIndexFitLive(),
  ])
  return {
    mode: "live" as const,
    perShare,
    peers,
    deals,
    indexFit,
  }
}

export async function getGlanceLive() {
  const [profile, quote, prices, marketCap, income, balance, cash] = await Promise.all([
    getWspProfile(),
    onesheetGet<Quote>("/stocks/quotes/WSP.TO"),
    onesheetGet<Array<Record<string, number | string>>>("/stocks/historical/WSP.TO"),
    onesheetGet<Array<{ date?: string; value?: number }>>("/stocks/historical/WSP.TO/marketcap"),
    onesheetGet<IncomeRow[]>("/financials/statements/WSP.TO/income"),
    onesheetGet<BalanceRow[]>("/financials/statements/WSP.TO/balance"),
    onesheetGet<CashRow[]>("/financials/statements/WSP.TO/cash"),
  ])
  assertQuoteName(quote, "WSP")
  const flat = flattenMetrics(profile)
  const annual = joinStatements("WSP.TO", "WSP Global", income, balance, cash)
  const dealroom = toolkitReady() ? readToolkitCsvOptional("dealroom_wsp.csv") : []
  return {
    mode: "live" as const,
    identity: profile.profile?.identity,
    description: profile.profile?.overview?.description,
    entities: profile.profile?.entities ?? [],
    quote,
    prices: (prices ?? []).map((row) => ({
      date: String(row.date ?? ""),
      close: Number(row.close),
      adjClose: Number(row.adjClose ?? row.close),
    })),
    marketCap: (marketCap ?? []).map((row) => ({ date: row.date, marketCap: row.value })),
    metrics: flat,
    series: {
      regionRevenue: seriesByIds(flat, REGIONS.map((region) => `${region}_net_revenue`), "Quarterly"),
      sectorRevenue: sectorRevenueSeries(flat),
      backlog: seriesByIds(flat, ["backlog", ...flat.map((row) => row.metricId).filter((id) => id.endsWith("_backlog_by_segment"))], "PointInTime"),
      adjustedEbitda: regionEbitdaSeries(flat),
      organic: seriesContaining(flat, "organic", "Quarterly"),
      acquisitionGrowth: seriesByIds(flat, ["net_revenue_acquisition_growth_change_pct"], "Quarterly"),
      fcf: seriesByIds(flat, ["free_cash_flow"], "Quarterly"),
      leverage: seriesByIds(flat, ["net_debt_to_adjusted_ebitda_ratio"], "PointInTime"),
      employees: seriesByIds(flat, ["employees"], "PointInTime"),
      guidance: guidanceSeries(flat),
      latest: latestMetrics(flat),
    },
    annualSummary: annual,
    valuation: dealroom.filter((row) => row.dataset === "valuation" && row.metric === "ev_to_ebitda"),
    events: flattenEvents(profile.events ?? []),
    issuePrice: 232.8,
  }
}

export async function getPerShareLive() {
  const [income, cash, quote, profile] = await Promise.all([
    onesheetGet<IncomeRow[]>("/financials/statements/WSP.TO/income"),
    onesheetGet<CashRow[]>("/financials/statements/WSP.TO/cash"),
    onesheetGet<Quote>("/stocks/quotes/WSP.TO"),
    getWspProfile(),
  ])
  assertQuoteName(quote, "WSP")
  const rows = joinIncomeCash(income, cash)
  const series = perShareSeries(rows)
  const first = series[0]
  const last = series.at(-1)
  const years = first && last ? last.fiscalYear - first.fiscalYear : 0
  const cagr = (start?: number, end?: number) =>
    start && end && years > 0 && start > 0 && end > 0 ? (end / start) ** (1 / years) - 1 : undefined

  const equityRaises = flattenEvents(profile.events ?? [])
    .filter((event) => event.type === "financing")
    .map((event) => ({
      date: event.date,
      year: event.date ? Number(event.date.slice(0, 4)) : undefined,
      deal: event.counterparty || event.summary,
      summary: event.summary,
    }))
    .filter((event) => event.year && event.year >= (first?.fiscalYear ?? 0) && event.year <= (last?.fiscalYear ?? 9999))

  return {
    mode: "live" as const,
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
    equityRaises,
    issueVsToday: {
      issuePrice: 232.8,
      currentPrice: quote.price,
      percentDifference:
        quote.price != null ? ((quote.price - 232.8) / 232.8) * 100 : undefined,
      sharesIssuedPublic: 3_145_000,
    },
  }
}

export async function getPeersLive() {
  const tickers = [{ ticker: "WSP.TO", name: "WSP Global" }, ...PEERS]
  const rows = await mapPool(tickers, 3, async (item) => {
    try {
      const [income, balance, cash, quote] = await Promise.all([
        onesheetGet<IncomeRow[]>(`/financials/statements/${encodeURIComponent(item.ticker)}/income`),
        onesheetGet<BalanceRow[]>(`/financials/statements/${encodeURIComponent(item.ticker)}/balance`),
        onesheetGet<CashRow[]>(`/financials/statements/${encodeURIComponent(item.ticker)}/cash`),
        onesheetGet<Quote>(`/stocks/quotes/${encodeURIComponent(item.ticker)}`),
      ])
      if (quote?.name && !quote.name.toLowerCase().includes(item.name.split(" ")[0]!.toLowerCase()) && item.ticker !== "J") {
        // soft check; Jacobs ticker is J
      }
      const annual = joinStatements(item.ticker, item.name, income, balance, cash)
      return computePeerRow(item.ticker, item.name, annual)
    } catch (error) {
      return {
        ticker: item.ticker,
        company: item.name,
        error: error instanceof Error ? error.message : "failed",
      }
    }
  })
  const ok = rows.filter((row) => !("error" in row && row.error))
  const scored = rankPeers(ok as PeerMetric[])
  return {
    mode: "live" as const,
    status: scored.length >= 3 ? "OK" : "INSUFFICIENT DATA",
    reason: scored.length >= 3 ? undefined : `Only ${scored.length} companies with statements.`,
    rows: scored,
    failed: rows.filter((row) => "error" in row && row.error),
  }
}

export async function getAcquisitionsLive() {
  const [profile, cash] = await Promise.all([
    getWspProfile(),
    onesheetGet<CashRow[]>("/financials/statements/WSP.TO/cash"),
  ])
  const curated = toolkitReady() ? readToolkitCsv("deal_targets.csv") : []
  const events = flattenEvents(profile.events ?? [])
  const acquisitions = dedupeAcquisitions(events.filter((event) => event.type === "acquisition"))
  const financing = events.filter((event) => event.type === "financing")
  const cashRows = latestFyRows(cash).map((row) => ({
    fiscalYear: yearOf(row.date),
    acquisitionsCash: row.acquisitionsNet != null ? -row.acquisitionsNet : undefined,
    freeCashFlow: row.freeCashFlow,
  }))

  const deals = curated.map((deal) => enrichDeal(deal, events))

  return {
    mode: "live" as const,
    deals,
    acquisitions,
    financing,
    cashSpentVsFcf: cashRows,
    subsidiaries: (profile.profile?.entities ?? []).filter((entity) => entity.kind === "subsidiary"),
  }
}

export async function getDealsLive() {
  const [profile, promisesCsv, claimsCsv] = await Promise.all([
    getWspProfile(),
    Promise.resolve(toolkitReady() ? readToolkitCsv("deal_promises.csv") : []),
    Promise.resolve(toolkitReady() ? readToolkitCsv("claims_wsp.csv") : []),
  ])
  const flat = flattenMetrics(profile)
  const leverage = latestMetric(flat, "net_debt_to_adjusted_ebitda_ratio")
  const events = flattenEvents(profile.events ?? [])
  const transcripts = await loadTranscripts()

  const promises = promisesCsv.map((row) => {
    const next = { ...row }
    if (/trc/i.test(row.deal) && /leverage|debt/i.test(row.promise)) {
      if (leverage?.value != null) {
        next.result = `Net debt / adjusted EBITDA ${leverage.value.toFixed(1)}x`
        next.status =
          leverage.value < 2 ? "Delivered" : /passed|overdue/i.test(row.deadline) ? "Missed" : "On Track"
      }
    }
    if (/arcadis/i.test(row.deal)) {
      const hit = events.find((event) => /arcadis/i.test(event.summary || ""))
      if (hit) next.result = hit.summary
    }
    return next
  })

  const claims = claimsCsv
    .map((claim) => {
      const ok = transcripts.some((text) =>
        normalizeQuote(text).includes(normalizeQuote(String(claim.claim_quote ?? ""))),
      )
      if (!ok) return null
      const next = { ...claim }
      if (/acquisition/i.test(claim.target) || /acquisition/i.test(claim.claim_type)) {
        const acquisitions = latestMetric(flat, "acquisitions")
        if (acquisitions?.value != null) next.outcome = String(acquisitions.value)
      }
      if (/leverage|debt/i.test(claim.target) || /leverage|debt/i.test(claim.claim_type)) {
        if (leverage?.value != null) next.outcome = String(leverage.value)
      }
      return next
    })
    .filter(Boolean)

  return {
    mode: "live" as const,
    promises,
    claims,
    leverage,
  }
}

export async function getIndexFitLive() {
  const symbols = ["WSP.TO", ...INDEX_MEMBERS]
  const loaded = await mapPool([...symbols], 3, async (ticker) => {
    try {
      const rows = await onesheetGet<Array<{ date?: string; adjClose?: number; close?: number }>>(
        `/stocks/historical/${encodeURIComponent(ticker)}`,
      )
      const points = (rows ?? [])
        .map((row) => ({
          date: String(row.date ?? ""),
          adjClose: Number(row.adjClose ?? row.close),
        }))
        .filter((row) => row.date && Number.isFinite(row.adjClose))
        .sort((a, b) => a.date.localeCompare(b.date))
      return { ticker, points }
    } catch {
      return { ticker, points: [] as Array<{ date: string; adjClose: number }> }
    }
  })

  const wsp = loaded.find((item) => item.ticker === "WSP.TO")?.points ?? []
  const members = loaded.filter((item) => item.ticker !== "WSP.TO" && item.points.length >= 60)
  if (members.length < 5 || wsp.length < 60) {
    return {
      mode: "live" as const,
      status: "INSUFFICIENT DATA",
      reason: "Not enough overlapping price history yet.",
      wspDays: wsp.length,
      memberCount: members.length,
    }
  }

  const memberReturns = members.map((member) => {
    const aligned = alignedReturns(wsp, member.points)
    return { ticker: member.ticker, returns: aligned.returns, wspReturns: aligned.wspReturns }
  })
  const wspReturns = dailyReturns(wsp)
  const overlaps = memberReturns.map((item) => item.returns.length)
  const usable = memberReturns.filter((item) => item.returns.length >= 60)
  if (usable.length < 5) {
    return {
      mode: "live" as const,
      status: "INSUFFICIENT DATA",
      reason: "Not enough overlapping price history yet.",
      wspDays: wsp.length,
      memberCount: usable.length,
    }
  }

  const vol = (returns: number[]) => stdev(returns) * Math.sqrt(252)
  const equalBefore = vol(equalWeightReturns(usable.map((item) => item.returns)))
  const withWspSeries = usable.map((item) => item.returns)
  const wspAligned = usable[0] ? alignToLength(wspReturns, usable[0].returns.length) : wspReturns
  const equalAfter = vol(equalWeightReturns([...withWspSeries, wspAligned]))
  const correlations = usable.map((item) => ({
    ticker: item.ticker,
    correlation: correlation(wspAligned.slice(0, item.returns.length), item.returns),
  }))
  const avgCorr =
    correlations.reduce((sum, item) => sum + (item.correlation ?? 0), 0) / Math.max(correlations.length, 1)

  const minVar = minVarianceWeights(
    usable.map((item) => item.returns),
    wspAligned,
  )

  return {
    mode: "live" as const,
    status: "OK",
    dateRange: { min: wsp[0]?.date, max: wsp.at(-1)?.date },
    overlapDays: Math.min(...overlaps),
    wspVolatility: vol(wspAligned),
    correlations,
    averageCorrelation: avgCorr,
    equalWeight: {
      withoutWsp: equalBefore,
      withWsp: equalAfter,
      difference: equalAfter - equalBefore,
      wspWeight: 1 / (usable.length + 1),
    },
    minVariance: minVar,
    members: usable.map((item) => item.ticker),
  }
}

export function getOfflineDashboard() {
  if (!toolkitReady()) throw Object.assign(new Error("Offline snapshot is not available."), { status: 503 })
  const company = readToolkitJson<Record<string, unknown>>("wsp_company.json")
  return {
    mode: "offline" as const,
    company,
    perShare: readToolkitCsv("wsp_per_share.csv"),
    peers: readToolkitCsv("peer_scorecard.csv"),
    deals: readToolkitCsv("deal_targets.csv"),
    promises: readToolkitCsv("deal_promises.csv"),
    claims: readToolkitCsv("claims_wsp.csv"),
    prices: readToolkitCsv("prices_daily.csv"),
    statements: readToolkitCsv("statements_annual.csv"),
    events: readToolkitCsv("wsp_events.csv"),
    metrics: readToolkitCsv("wsp_metrics.csv"),
    marketCap: readToolkitCsv("wsp_marketcap_daily.csv"),
    dealroom: readToolkitCsvOptional("dealroom_wsp.csv"),
  }
}

function enrichDeal(deal: Record<string, string>, events: ReturnType<typeof flattenEvents>) {
  const next = { ...deal }
  const power = events.find((event) => /power/i.test(event.summary || "") || /power/i.test(event.counterparty || ""))
  const trc = events.find((event) => /\btrc\b/i.test(event.summary || "") || /\btrc\b/i.test(event.counterparty || ""))
  if (/power/i.test(deal.target) && power) {
    next.price = power.amountAsWritten || next.price
    next.price_source = "live event"
  }
  if (/trc/i.test(deal.target) && trc) {
    next.price = trc.amountAsWritten || next.price
    next.price_source = "live event"
  }
  return next
}

function flattenMetrics(profile: ProfilePayload) {
  const names = new Map((profile.metrics ?? []).map((metric) => [metric.metricId, metric.metricName]))
  const rows: Array<{
    metricId: string
    metricName: string
    periodType: string
    reportDate: string
    fiscalYear?: number
    fiscalQuarter?: number
    value: number
    unit?: string
    currency?: string
    quote?: string
  }> = []
  for (const period of profile.data ?? []) {
    for (const [metricId, cell] of Object.entries(period.metricValues ?? {})) {
      if (typeof cell?.value !== "number" || !Number.isFinite(cell.value)) continue
      rows.push({
        metricId,
        metricName: names.get(metricId) || metricId,
        periodType: period.periodType || "",
        reportDate: period.reportDate || "",
        fiscalYear: period.fiscalYear,
        fiscalQuarter: period.fiscalQuarter,
        value: cell.value,
        unit: cell.unit,
        currency: cell.currency,
        quote: cell.sources?.[0]?.quote,
      })
    }
  }
  return rows
}

function flattenEvents(events: Array<Record<string, unknown>>) {
  return events.map((event) => {
    const dateObj = (event.date as { occurredOn?: string; precision?: string } | undefined) ?? {}
    const entity = (event.entity as { name?: string } | undefined) ?? {}
    const attributes = (event.attributes as Record<string, unknown> | undefined) ?? {}
    const sources = (event.sources as Array<{ quote?: string; formType?: string; filedOn?: string }> | undefined) ?? []
    return {
      type: String(event.type ?? ""),
      status: String(event.status ?? ""),
      date: dateObj.occurredOn || null,
      precision: dateObj.precision || null,
      summary: String(event.summary ?? ""),
      counterparty: String(attributes.counterparty ?? entity.name ?? ""),
      amountAsWritten: attributes.amount != null ? String(attributes.amount) : "",
      quote: sources[0]?.quote || "",
      form: sources[0]?.formType || "",
      filedOn: sources[0]?.filedOn || "",
    }
  })
}

function dedupeAcquisitions(events: ReturnType<typeof flattenEvents>) {
  const named = new Map<string, (typeof events)[number]>()
  const aggregates: typeof events = []
  for (const event of events) {
    if (/number of|multiple|various|additional acquisitions/i.test(event.summary || event.counterparty)) {
      aggregates.push(event)
      continue
    }
    const key = `${(event.counterparty || event.summary).toLowerCase().split(/\s+/)[0]}|${event.date || "undated"}`
    const existing = named.get(key)
    if (!existing || (event.amountAsWritten && !existing.amountAsWritten)) named.set(key, event)
  }
  return [...named.values(), ...aggregates]
}

function seriesByIds(
  rows: ReturnType<typeof flattenMetrics>,
  ids: string[],
  periodType?: string,
) {
  const wanted = new Set(ids)
  return rows
    .filter((row) => wanted.has(row.metricId) && (!periodType || row.periodType === periodType))
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
}

function seriesContaining(rows: ReturnType<typeof flattenMetrics>, needle: string, periodType?: string) {
  return rows
    .filter((row) => row.metricId.includes(needle) && (!periodType || row.periodType === periodType))
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
}

function sectorRevenueSeries(rows: ReturnType<typeof flattenMetrics>) {
  const regionIds = new Set(REGIONS.map((region) => `${region}_net_revenue`))
  return rows
    .filter(
      (row) =>
        row.metricId.endsWith("_net_revenue") &&
        !regionIds.has(row.metricId) &&
        row.periodType === "Quarterly",
    )
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
}

function regionEbitdaSeries(rows: ReturnType<typeof flattenMetrics>) {
  return rows
    .filter((row) => /adjusted_.*(ebitda|ebitda_margin)/.test(row.metricId) || row.metricId === "adjusted_ebitda" || row.metricId === "adjusted_ebitda_margin")
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
}

function guidanceSeries(rows: ReturnType<typeof flattenMetrics>) {
  return rows.filter((row) =>
    [
      "adjusted_ebitda_guidance_low",
      "adjusted_ebitda_guidance_high",
      "capex_guidance_low",
      "capex_guidance_high",
    ].includes(row.metricId),
  )
}

function latestMetrics(rows: ReturnType<typeof flattenMetrics>) {
  const pick = (id: string) => latestMetric(rows, id)
  return {
    backlog: pick("backlog"),
    employees: pick("employees"),
    leverage: pick("net_debt_to_adjusted_ebitda_ratio"),
    adjustedEbitdaMargin: pick("adjusted_ebitda_margin"),
    netRevenueGrowth: pick("net_revenue_growth_change_pct") || pick("organic_net_revenue_growth_change_pct"),
  }
}

function latestMetric(rows: ReturnType<typeof flattenMetrics>, id: string) {
  return [...rows]
    .filter((row) => row.metricId === id)
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0]
}

function joinStatements(
  ticker: string,
  company: string,
  income: IncomeRow[] | undefined,
  balance: BalanceRow[] | undefined,
  cash: CashRow[] | undefined,
) {
  const incomeRows = latestFyRows(income)
  const balanceMap = new Map(latestFyRows(balance).map((row) => [row.date, row]))
  const cashMap = new Map(latestFyRows(cash).map((row) => [row.date, row]))
  return incomeRows.map((row) => {
    const bal = balanceMap.get(row.date)
    const cf = cashMap.get(row.date)
    const taxRate = taxRateOf(row)
    const nopat = row.operatingIncome != null ? row.operatingIncome * (1 - taxRate) : undefined
    const invested =
      bal?.totalStockholdersEquity != null && bal.netDebt != null
        ? bal.totalStockholdersEquity + bal.netDebt
        : undefined
    return {
      ticker,
      company,
      fiscalYear: yearOf(row.date),
      periodEnd: row.date,
      currency: row.reportedCurrency,
      revenue: row.revenue,
      ebitda: row.ebitda,
      operatingIncome: row.operatingIncome,
      netIncome: row.netIncome,
      epsDiluted: row.epsdiluted,
      sharesDiluted: row.weightedAverageShsOutDil,
      freeCashFlow: cf?.freeCashFlow,
      acquisitionsCash: cf?.acquisitionsNet != null ? -cf.acquisitionsNet : undefined,
      equity: bal?.totalStockholdersEquity,
      netDebt: bal?.netDebt,
      cash: bal?.cashAndCashEquivalents,
      taxRateUsed: taxRate,
      nopat,
      investedCapital: invested,
      roic: nopat != null && invested && invested > 0 ? nopat / invested : undefined,
    }
  })
}

function joinIncomeCash(income: IncomeRow[] | undefined, cash: CashRow[] | undefined) {
  const cashMap = new Map(latestFyRows(cash).map((row) => [row.date, row]))
  return latestFyRows(income).map((row) => ({
    ...row,
    freeCashFlow: cashMap.get(row.date)?.freeCashFlow,
  }))
}

function perShareSeries(rows: Array<IncomeRow & { freeCashFlow?: number }>) {
  const ordered = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const firstShares = ordered[0]?.weightedAverageShsOutDil
  const firstRevenue = ordered[0]?.revenue
  const firstFcf = ordered[0]?.freeCashFlow
  const firstNi = ordered[0]?.netIncome
  const firstEps = ordered[0]?.epsdiluted
  return ordered.map((row) => {
    const shares = row.weightedAverageShsOutDil
    const revenuePerShare = row.revenue != null && shares ? row.revenue / shares : undefined
    const fcfPerShare = row.freeCashFlow != null && shares ? row.freeCashFlow / shares : undefined
    const niPerShare = row.netIncome != null && shares ? row.netIncome / shares : undefined
    return {
      fiscalYear: yearOf(row.date),
      periodEnd: row.date,
      currency: row.reportedCurrency,
      sharesDiluted: shares,
      revenue: row.revenue,
      revenuePerShare,
      freeCashFlow: row.freeCashFlow,
      freeCashFlowPerShare: fcfPerShare,
      netIncome: row.netIncome,
      netIncomePerShare: niPerShare,
      epsDiluted: row.epsdiluted,
      revenueIndex: index(row.revenue, firstRevenue),
      fcfIndex: index(row.freeCashFlow, firstFcf),
      netIncomeIndex: index(row.netIncome, firstNi),
      revenuePerShareIndex: index(revenuePerShare, firstRevenue && firstShares ? firstRevenue / firstShares : undefined),
      fcfPerShareIndex: index(fcfPerShare, firstFcf && firstShares ? firstFcf / firstShares : undefined),
      epsIndex: index(row.epsdiluted, firstEps),
      sharesIndex: index(shares, firstShares),
    }
  })
}

function index(value?: number, first?: number) {
  if (value == null || first == null || first === 0) return undefined
  return (value / first) * 100
}

interface PeerMetric {
  ticker: string
  company: string
  revenueCagr?: number
  fcfMargin?: number
  reinvestment?: number
  roic?: number
  netDebtToEbitda?: number
  lastFiscalYear?: number
}

function computePeerRow(
  ticker: string,
  company: string,
  annual: ReturnType<typeof joinStatements>,
): PeerMetric {
  const ordered = [...annual].sort((a, b) => a.fiscalYear - b.fiscalYear)
  const last = ordered.at(-1)
  const window = ordered.filter((row) => last && row.fiscalYear >= last.fiscalYear - 3)
  const first = window[0]
  const years = first && last ? last.fiscalYear - first.fiscalYear : 0
  const revenueCagr =
    first?.revenue && last?.revenue && years > 0 ? (last.revenue / first.revenue) ** (1 / years) - 1 : undefined
  const sumFcf = sum(window.map((row) => row.freeCashFlow))
  const sumRev = sum(window.map((row) => row.revenue))
  const sumAcq = sum(window.map((row) => row.acquisitionsCash))
  return {
    ticker,
    company,
    lastFiscalYear: last?.fiscalYear,
    revenueCagr,
    fcfMargin: sumFcf != null && sumRev ? sumFcf / sumRev : undefined,
    reinvestment: sumAcq != null && sumFcf && sumFcf > 0 ? sumAcq / sumFcf : undefined,
    roic: last?.roic,
    netDebtToEbitda: last?.netDebt != null && last.ebitda ? last.netDebt / last.ebitda : undefined,
  }
}

function rankPeers(rows: PeerMetric[]) {
  const n = rows.length
  const rank = (values: Array<number | undefined>, lowerBetter = false) => {
    const scored = values
      .map((value, index) => ({ value, index }))
      .filter((item) => item.value != null) as Array<{ value: number; index: number }>
    scored.sort((a, b) => (lowerBetter ? a.value - b.value : b.value - a.value))
    const ranks = new Array<number | undefined>(values.length)
    scored.forEach((item, order) => {
      ranks[item.index] = order + 1
    })
    return ranks
  }
  const revenueRanks = rank(rows.map((row) => row.revenueCagr))
  const fcfRanks = rank(rows.map((row) => row.fcfMargin))
  const reinvestmentRanks = rank(rows.map((row) => row.reinvestment))
  const roicRanks = rank(rows.map((row) => row.roic))
  const leverageRanks = rank(rows.map((row) => row.netDebtToEbitda), true)
  return rows.map((row, index) => ({
    ...row,
    rankRevenueCagr: revenueRanks[index],
    rankFcfMargin: fcfRanks[index],
    rankReinvestment: reinvestmentRanks[index],
    rankRoic: roicRanks[index],
    rankNetDebtToEbitda: leverageRanks[index],
    nCompanies: n,
  }))
}

function latestFyRows<T extends { date?: string; period?: string }>(rows: T[] | undefined) {
  return [...(rows ?? [])]
    .filter((row) => row.period === "FY" && row.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

function yearOf(date?: string) {
  return date ? Number(date.slice(0, 4)) : 0
}

function taxRateOf(row: IncomeRow) {
  if (row.incomeBeforeTax != null && row.incomeBeforeTax > 0 && row.incomeTaxExpense != null) {
    return Math.min(0.5, Math.max(0, row.incomeTaxExpense / row.incomeBeforeTax))
  }
  return 0.26
}

function sum(values: Array<number | undefined>) {
  const present = values.filter((value): value is number => typeof value === "number")
  if (!present.length) return undefined
  return present.reduce((total, value) => total + value, 0)
}

function assertQuoteName(quote: Quote | undefined, expected: string) {
  if (quote?.name && !quote.name.toLowerCase().includes(expected.toLowerCase())) {
    throw Object.assign(new Error(`Quote name mismatch for ${quote.symbol}: ${quote.name}`), { status: 502 })
  }
}

async function loadTranscripts() {
  const calls: Array<[number, number]> = [
    [2025, 3],
    [2025, 4],
    [2026, 2],
    [2026, 3],
  ]
  const texts = await mapPool(calls, 2, async ([year, quarter]) => {
    try {
      const data = await onesheetGet<{ content?: string }>(
        `/financials/transcripts/WSP.TO/${year}/${quarter}`,
      )
      return data?.content || ""
    } catch {
      return ""
    }
  })
  return texts.filter(Boolean)
}

function normalizeQuote(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function dailyReturns(points: Array<{ date: string; adjClose: number }>) {
  const returns: number[] = []
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]?.adjClose
    const next = points[index]?.adjClose
    if (prev && next) returns.push(next / prev - 1)
  }
  return returns
}

function alignedReturns(
  wsp: Array<{ date: string; adjClose: number }>,
  member: Array<{ date: string; adjClose: number }>,
) {
  const map = new Map(member.map((point) => [point.date, point.adjClose]))
  const paired: Array<{ date: string; wsp: number; member: number }> = []
  for (const point of wsp) {
    const other = map.get(point.date)
    if (other != null) paired.push({ date: point.date, wsp: point.adjClose, member: other })
  }
  const returns: number[] = []
  const wspReturns: number[] = []
  for (let index = 1; index < paired.length; index += 1) {
    const prev = paired[index - 1]
    const next = paired[index]
    if (!prev || !next) continue
    returns.push(next.member / prev.member - 1)
    wspReturns.push(next.wsp / prev.wsp - 1)
  }
  return { returns, wspReturns, dates: paired.map((point) => point.date) }
}

function equalWeightReturns(series: number[][]) {
  const length = Math.min(...series.map((item) => item.length))
  const output: number[] = []
  for (let index = 0; index < length; index += 1) {
    let total = 0
    for (const item of series) total += item[index] ?? 0
    output.push(total / series.length)
  }
  return output
}

function alignToLength(values: number[], length: number) {
  return values.slice(Math.max(0, values.length - length))
}

function stdev(values: number[]) {
  if (values.length < 2) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function correlation(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length)
  if (length < 3) return undefined
  const aa = a.slice(0, length)
  const bb = b.slice(0, length)
  const meanA = aa.reduce((sum, value) => sum + value, 0) / length
  const meanB = bb.reduce((sum, value) => sum + value, 0) / length
  let numr = 0
  let denA = 0
  let denB = 0
  for (let index = 0; index < length; index += 1) {
    const da = (aa[index] ?? 0) - meanA
    const db = (bb[index] ?? 0) - meanB
    numr += da * db
    denA += da * da
    denB += db * db
  }
  if (!denA || !denB) return undefined
  return numr / Math.sqrt(denA * denB)
}

function minVarianceWeights(memberReturns: number[][], wspReturns: number[]) {
  const assets = [...memberReturns, alignToLength(wspReturns, Math.min(...memberReturns.map((item) => item.length)))]
  const n = assets.length
  const cov = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const a = assets[i] ?? []
      const b = assets[j] ?? []
      const length = Math.min(a.length, b.length)
      const aa = a.slice(0, length)
      const bb = b.slice(0, length)
      const meanA = aa.reduce((sum, value) => sum + value, 0) / length
      const meanB = bb.reduce((sum, value) => sum + value, 0) / length
      let total = 0
      for (let index = 0; index < length; index += 1) total += ((aa[index] ?? 0) - meanA) * ((bb[index] ?? 0) - meanB)
      return total / Math.max(length - 1, 1)
    }),
  )

  let best = { weights: Array(n).fill(1 / n) as number[], vol: Number.POSITIVE_INFINITY }
  for (let trial = 0; trial < 800; trial += 1) {
    const raw = Array.from({ length: n }, () => Math.random())
    const sumRaw = raw.reduce((total, value) => total + value, 0)
    const weights = raw.map((value) => Math.min(0.1, value / sumRaw))
    const weightSum = weights.reduce((total, value) => total + value, 0)
    const normalized = weights.map((value) => value / weightSum)
    const vol = portfolioVol(normalized, cov)
    if (vol < best.vol) best = { weights: normalized, vol }
  }
  return {
    withoutWspVol: portfolioVol(Array(n - 1).fill(1 / (n - 1)), cov.slice(0, n - 1).map((row) => row.slice(0, n - 1))),
    withWspVol: best.vol,
    wspWeight: best.weights.at(-1),
  }
}

function portfolioVol(weights: number[], cov: number[][]) {
  let variance = 0
  for (let i = 0; i < weights.length; i += 1) {
    for (let j = 0; j < weights.length; j += 1) {
      variance += (weights[i] ?? 0) * (weights[j] ?? 0) * (cov[i]?.[j] ?? 0)
    }
  }
  return Math.sqrt(Math.max(variance, 0)) * Math.sqrt(252)
}
