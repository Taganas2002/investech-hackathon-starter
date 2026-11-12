import * as PapaNamespace from "papaparse"
import { adaptCompanies, adaptPriceRows, detectTabularKind } from "../dataAdapter.ts"
import type { CompanyMetrics, PricePoint } from "../types/index.ts"
import { isRecord } from "./numbers.ts"

export interface CsvImportSuccess {
  ok: true
  kind: "companies" | "prices"
  companies: CompanyMetrics[]
  prices: PricePoint[]
  warnings: string[]
  message: string
}

export interface CsvImportFailure {
  ok: false
  message: string
}

const MAPPING_HELP =
  "Expected company columns (ticker or symbol, plus metrics) or price columns (date, ticker, close). Add the organizer's names in client/src/dataAdapter.ts."

export function parseOrganizerCsv(file: File): Promise<CsvImportSuccess | CsvImportFailure> {
  return new Promise((resolve) => {
    loadPapa().parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      dynamicTyping: false,
      transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
      complete: (result) => {
        const rows = result.data.filter(isUsableRow)
        if (rows.length === 0) {
          const detail = result.errors[0]?.message
          resolve({
            ok: false,
            message: detail
              ? `This CSV could not be parsed. ${detail}`
              : "The CSV has no data rows.",
          })
          return
        }

        const kind = detectTabularKind(rows)
        if (kind === "unknown") {
          resolve({ ok: false, message: `This CSV could not be mapped. ${MAPPING_HELP}` })
          return
        }

        if (kind === "prices") {
          const adapted = adaptPriceRows(rows)
          if (adapted.prices.length === 0) {
            resolve({
              ok: false,
              message: adapted.errors[0] ?? `This price CSV could not be mapped. ${MAPPING_HELP}`,
            })
            return
          }
          const note = adapted.warnings[0] ? ` ${adapted.warnings[0]}` : ""
          resolve({
            ok: true,
            kind: "prices",
            companies: [],
            prices: adapted.prices,
            warnings: adapted.warnings,
            message: `Imported ${adapted.prices.length} price rows.${note}`,
          })
          return
        }

        const adapted = adaptCompanies(rows)
        if (adapted.companies.length === 0) {
          resolve({
            ok: false,
            message: adapted.errors[0] ?? `This company CSV could not be mapped. ${MAPPING_HELP}`,
          })
          return
        }
        const note = adapted.warnings[0] ? ` ${adapted.warnings[0]}` : ""
        resolve({
          ok: true,
          kind: "companies",
          companies: adapted.companies,
          prices: [],
          warnings: adapted.warnings,
          message: `Imported ${adapted.companies.length} companies from CSV.${note}`,
        })
      },
      error: (error) => {
        const message = "message" in error && typeof error.message === "string" ? error.message : ""
        resolve({
          ok: false,
          message: message ? `This CSV could not be read. ${message}` : "This CSV could not be read.",
        })
      },
    })
  })
}

interface PapaLike {
  parse: (
    input: File | string,
    config: {
      header?: boolean
      skipEmptyLines?: boolean | "greedy"
      dynamicTyping?: boolean
      transformHeader?: (header: string) => string
      complete?: (result: { data: Record<string, unknown>[]; errors: Array<{ message?: string }> }) => void
      error?: (error: { message?: string }) => void
    },
  ) => { data: Record<string, unknown>[]; errors: Array<{ message?: string }> }
}

/** PapaParse is CommonJS. Vite and Node expose it slightly differently. */
export function loadPapa(): PapaLike {
  const namespace = PapaNamespace as unknown as PapaLike & { default?: PapaLike }
  const api = typeof namespace.parse === "function" ? namespace : namespace.default
  if (!api?.parse) throw new Error("PapaParse failed to load.")
  return api
}

function isUsableRow(row: unknown): row is Record<string, unknown> {
  if (!isRecord(row)) return false
  return Object.values(row).some((value) => {
    if (value === undefined || value === null) return false
    if (typeof value === "string") return value.trim() !== ""
    return true
  })
}
