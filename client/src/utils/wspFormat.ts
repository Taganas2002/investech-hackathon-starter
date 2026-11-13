export function formatMoney(value?: number | null, currency = "C$") {
  if (value == null || Number.isNaN(value)) return "—"
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  if (abs >= 1e9) return `${sign}${currency}${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}${currency}${(abs / 1e6).toFixed(0)}M`
  if (abs >= 1e3) return `${sign}${currency}${(abs / 1e3).toFixed(0)}K`
  return `${sign}${currency}${abs.toFixed(0)}`
}

export function formatPercent(value?: number | null, alreadyPercent = false) {
  if (value == null || Number.isNaN(value)) return "—"
  const pct = alreadyPercent ? value : value * 100
  return `${pct.toFixed(1)}%`
}

export function formatRatio(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—"
  return `${value.toFixed(1)}x`
}

export function formatIndex(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—"
  return Math.round(value).toString()
}

export function formatShares(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—"
  return `${(value / 1e6).toFixed(1)}M`
}

export function formatPrice(value?: number | null, currency = "C$") {
  if (value == null || Number.isNaN(value)) return "—"
  return `${currency}${value.toFixed(2)}`
}

export function tooltipFormatter(kind: "money" | "percent" | "ratio" | "index" | "shares" | "price" | "number") {
  return (value: unknown) => {
    const numeric = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(numeric)) return "—"
    if (kind === "money") return formatMoney(numeric)
    if (kind === "percent") return formatPercent(numeric)
    if (kind === "ratio") return formatRatio(numeric)
    if (kind === "index") return formatIndex(numeric)
    if (kind === "shares") return formatShares(numeric)
    if (kind === "price") return formatPrice(numeric)
    return numeric.toFixed(1)
  }
}
