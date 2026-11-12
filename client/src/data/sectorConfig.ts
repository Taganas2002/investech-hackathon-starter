import type { CompanyMetrics, SectorDefinition } from "../types/index.ts"
import { humanize, slug } from "../utils/numbers.ts"

/**
 * TONIGHT: add a block here for each sector the organizers give you.
 * primaryKpiKey must match a key produced by SECTOR_KPI_ALIASES in dataAdapter.ts.
 * Scoring reads only the primary KPI. Extra KPIs can still be stored on the company.
 */
export const SECTORS: SectorDefinition[] = [
  {
    id: "specialty-retail",
    label: "Specialty Retail",
    aliases: ["specialty retail", "specialty_retail", "retail"],
    primaryKpiKey: "sameStoreSalesGrowth",
    primaryKpiLabel: "Same-store sales growth",
    primaryKpiDirection: "higher",
    primaryKpiUnit: "percent",
  },
  {
    id: "regional-grocery",
    label: "Regional Grocery",
    aliases: ["regional grocery", "grocery"],
    primaryKpiKey: "inventoryTurnover",
    primaryKpiLabel: "Inventory turnover",
    primaryKpiDirection: "higher",
    primaryKpiUnit: "number",
  },
]

export function findSector(name: string | undefined): SectorDefinition | undefined {
  const key = (name ?? "").trim().toLowerCase()
  if (!key) return undefined
  return SECTORS.find(
    (sector) => sector.label.toLowerCase() === key || sector.aliases.includes(key),
  )
}

export function canonicalizeSector(name: string | undefined): string {
  const trimmed = (name ?? "").trim()
  const known = findSector(trimmed)
  if (known) return known.label
  return trimmed || "Uncategorized"
}

/**
 * Known sectors use the config above.
 * Unknown sectors still work: the first numeric sector KPI on the sample company is used.
 */
export function resolveSector(name: string, sample?: CompanyMetrics): SectorDefinition {
  const known = findSector(name)
  if (known) return known

  const label = name.trim() || "Uncategorized"
  const entries = Object.entries(sample?.sectorKpis ?? {})
  const customLabel = entries.find(([key, value]) => key === "__label" && typeof value === "string")?.[1]
  const firstKpi = entries.find(
    ([key, value]) => key !== "__label" && typeof value === "number" && Number.isFinite(value),
  )
  const kpiLabel = typeof customLabel === "string" ? customLabel : firstKpi ? humanize(firstKpi[0]) : "Sector KPI"

  return {
    id: slug(label),
    label,
    aliases: [label.toLowerCase()],
    primaryKpiKey: firstKpi?.[0] ?? "primary",
    primaryKpiLabel: kpiLabel,
    primaryKpiDirection: "higher",
    primaryKpiUnit: /occupancy|growth|margin|percent/i.test(kpiLabel) ? "percent" : "number",
  }
}

export function sameSector(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function uniqueSectors(companies: CompanyMetrics[]): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const company of companies) {
    const key = company.sector.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    labels.push(company.sector)
  }
  return labels.sort((a, b) => {
    if (a.toLowerCase() === "specialty retail") return -1
    if (b.toLowerCase() === "specialty retail") return 1
    return a.localeCompare(b)
  })
}
