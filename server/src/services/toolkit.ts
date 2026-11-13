import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(here, "../../../trimestre-toolkit/dashboard_data")

export function toolkitReady(): boolean {
  return existsSync(join(DATA_DIR, "manifest.json"))
}

export function toolkitRoot(): string {
  return DATA_DIR
}

export function readToolkitJson<T>(name: string): T {
  return JSON.parse(readToolkitText(name)) as T
}

export function readToolkitCsv(name: string): Record<string, string>[] {
  return parseCsv(readToolkitText(name))
}

export function readToolkitText(name: string): string {
  const path = join(DATA_DIR, name)
  if (!existsSync(path)) throw new Error(`Toolkit file missing: ${name}`)
  return readFileSync(path, "utf8")
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows = splitCsvRows(text)
  if (rows.length === 0) return []
  const headers = rows[0] ?? []
  return rows.slice(1).map((cells) => {
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? ""
    })
    return row
  })
}

function splitCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false
  const input = text.replace(/^\uFEFF/, "")

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === ",") {
      row.push(cell)
      cell = ""
      continue
    }
    if (char === "\n" || (char === "\r" && next === "\n")) {
      if (char === "\r") index += 1
      row.push(cell)
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      cell = ""
      continue
    }
    if (char === "\r") {
      row.push(cell)
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      cell = ""
      continue
    }
    cell += char
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    if (row.some((value) => value.length > 0)) rows.push(row)
  }
  return rows
}

export function num(value: string | undefined): number | undefined {
  if (value == null || value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
