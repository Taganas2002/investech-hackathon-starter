import type { MetricUnit } from "../types/index.ts"

const COUNT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
]

const RANK_WORDS = [
  "zeroth",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
]

export function formatMetric(value: number | undefined, unit: MetricUnit): string {
  if (value === undefined || Number.isNaN(value)) return "—"
  if (unit === "percent") return `${value.toFixed(1)}%`
  if (unit === "ratio") return value.toFixed(2)
  if (unit === "price") return formatPrice(value)
  return value.toFixed(1)
}

export function formatSignedPercent(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "—"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

export function formatPrice(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "—"
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })
}

export function formatScore(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—"
  return String(Math.round(value))
}

export function ordinalWord(rank: number): string {
  if (rank >= 0 && rank < RANK_WORDS.length) return RANK_WORDS[rank] ?? String(rank)
  const mod100 = rank % 100
  const mod10 = rank % 10
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? "th" : mod10 === 1 ? "st" : mod10 === 2 ? "nd" : mod10 === 3 ? "rd" : "th"
  return `${rank}${suffix}`
}

export function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count)
}

export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

export function sentenceLabel(label: string): string {
  if (!label) return label
  if (label === label.toUpperCase()) return label
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** "EBITDA margin" stays "EBITDA margin". "Revenue growth" becomes "revenue growth". */
export function shortLabel(label: string): string {
  const [first, ...rest] = label.split(" ")
  if (!first) return label
  const firstWord =
    first.length > 1 && first === first.toUpperCase()
      ? first
      : first.charAt(0).toLowerCase() + first.slice(1)
  return [firstWord, ...rest].join(" ")
}

export function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return iso
  return `${match[2]}/${match[3]}`
}
