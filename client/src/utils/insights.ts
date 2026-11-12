import type { CompanyExplanation, CompanyMetrics, CompanyScore, MetricContribution } from "../types/index.ts"
import { countWord, joinAnd, ordinalWord, sentenceLabel } from "./format.ts"

const STRONG_NORMALIZED = 0.67

export function explainCompany(company: CompanyMetrics, score: CompanyScore): CompanyExplanation {
  if (score.insufficientData) {
    return {
      strengths: [],
      weaknesses: [
        {
          key: "coverage",
          text: "Fewer than 3 comparable metrics are available, so this company was not fully scored.",
        },
      ],
      summary: `${company.ticker} does not have enough comparable metrics to rank reliably against the other ${company.sector} companies.`,
    }
  }

  const included = score.contributions.filter(
    (item) =>
      item.included &&
      item.value !== undefined &&
      item.peerMedian !== undefined &&
      item.normalized !== undefined &&
      item.rank !== undefined,
  )

  let strengthItems = included
    .filter((item) => favorable(item) && (item.rank === 1 || (item.normalized ?? 0) >= STRONG_NORMALIZED))
    .sort((a, b) => (b.normalized ?? 0) - (a.normalized ?? 0))

  if (strengthItems.length === 0) {
    const best = included
      .filter((item) => favorable(item))
      .sort((a, b) => (b.normalized ?? 0) - (a.normalized ?? 0))[0]
    if (best) strengthItems = [best]
  }
  strengthItems = strengthItems.slice(0, 3)

  const weaknessItems = included
    .filter((item) => !favorable(item))
    .sort((a, b) => (a.normalized ?? 0) - (b.normalized ?? 0))
    .slice(0, 3)

  return {
    strengths: strengthItems.map((item) => ({ key: item.key, text: strengthText(item) })),
    weaknesses: weaknessItems.map((item) => ({ key: item.key, text: weaknessText(item) })),
    summary: summaryText(company, score, strengthItems, weaknessItems),
  }
}

function favorable(item: MetricContribution): boolean {
  if (item.value === undefined || item.peerMedian === undefined) return false
  if (item.value === item.peerMedian) return false
  return item.direction === "higher" ? item.value > item.peerMedian : item.value < item.peerMedian
}

function strengthText(item: MetricContribution): string {
  if (item.key === "debtToEquity" && item.rank === 1) {
    return "Debt-to-equity is the lowest among the selected competitors."
  }
  if (item.key === "debtToEquity") {
    return "Debt-to-equity is below the peer median."
  }
  if (item.rank === 1) {
    return `${sentenceLabel(item.label)} ranks #1 among the selected competitors.`
  }
  if (item.unit === "percent" && item.value !== undefined && item.peerMedian !== undefined) {
    const delta = Math.abs(item.value - item.peerMedian)
    return `${sentenceLabel(item.label)} is ${delta.toFixed(1)} percentage points above the peer median.`
  }
  const share = shareBeaten(item)
  if (share >= 0.6) {
    return `${sentenceLabel(item.label)} is stronger than ${Math.round(share * 100)}% of peers.`
  }
  return `${sentenceLabel(item.label)} is ahead of the peer median.`
}

function weaknessText(item: MetricContribution): string {
  if (item.key === "debtToEquity") return "Debt-to-equity is above the peer median."
  if (item.key === "priceMomentum") return "Recent price momentum is weaker than peers."
  if (item.unit === "percent" && item.value !== undefined && item.peerMedian !== undefined) {
    const delta = Math.abs(item.value - item.peerMedian)
    return `${sentenceLabel(item.label)} is ${delta.toFixed(1)} percentage points below the peer median.`
  }
  return `${sentenceLabel(item.label)} is weaker than the peer median.`
}

function summaryText(
  company: CompanyMetrics,
  score: CompanyScore,
  strengths: MetricContribution[],
  weaknesses: MetricContribution[],
): string {
  const advantage = strengths.length
    ? `Its strongest advantages are ${joinAnd(strengths.map((item) => item.shortLabel))}.`
    : "No single metric stands clearly above this peer group."

  const topRisk = weaknesses[0]
  let risk = "No primary risk stands out against this peer median."
  if (topRisk?.key === "debtToEquity") {
    risk = "Its primary risk is leverage, with debt-to-equity above the peer median."
  } else if (topRisk?.key === "priceMomentum") {
    risk = "Its primary risk is price momentum, which is weaker than its peers."
  } else if (topRisk) {
    risk = `Its primary risk is ${topRisk.shortLabel}.`
  }

  return `${company.ticker} currently ranks ${ordinalWord(score.rank)} among the ${countWord(score.peerCount)} ${company.sector} companies analyzed. ${advantage} ${risk}`
}

function shareBeaten(item: MetricContribution): number {
  if (item.peersWithData <= 1 || item.rank === undefined) return 1
  return (item.peersWithData - item.rank) / (item.peersWithData - 1)
}
