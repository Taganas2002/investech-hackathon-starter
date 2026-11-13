export function money(value?: number | null, currency = "C$") {
  if (value == null || Number.isNaN(value)) return "—"
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  if (abs >= 1e9) return `${sign}${currency}${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}${currency}${Math.round(abs / 1e6)}M`
  if (abs >= 1e3) return `${sign}${currency}${Math.round(abs / 1e3)}K`
  return `${sign}${currency}${abs.toFixed(0)}`
}

export function percent(value?: number | null, alreadyPercent = false) {
  if (value == null || Number.isNaN(value)) return "—"
  const pct = alreadyPercent ? value : value * 100
  return `${pct.toFixed(1)}%`
}

export function ratio(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—"
  return `${value.toFixed(1)}x`
}

export function shares(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—"
  return `${(value / 1e6).toFixed(1)}M`
}

export function price(value?: number | null, currency = "C$") {
  if (value == null || Number.isNaN(value)) return "—"
  return `${currency}${value.toFixed(2)}`
}

export function indexWhole(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—"
  return `${Math.round(value)}`
}
