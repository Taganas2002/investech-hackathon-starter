export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isBlankMetric(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed === "" || /^(n\/a|na|null|none|undefined|—|-|--)$/i.test(trimmed)
  }
  return false
}

/** Parses 18.4, "18.4%", "$1,234.50", and blanks. Invalid text returns undefined. */
export function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value !== "string") return undefined
  if (isBlankMetric(value)) return undefined
  const cleaned = value.trim().replace(/[$,%\s]/g, "").replace(/,/g, "")
  if (!cleaned) return undefined
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

export function slug(value: string): string {
  const result = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return result || "sector"
}

export function humanize(value: string): string {
  const spaced = value
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
  if (!spaced) return value
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function definedNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
