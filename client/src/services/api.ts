import axios from "axios"
import { adaptCompanies, adaptCompany, adaptPriceRows } from "../dataAdapter.ts"
import type { CompanyMetrics, PricePoint } from "../types/index.ts"
import { isRecord } from "../utils/numbers.ts"

/**
 * TONIGHT: keep these paths if React talks to the local Express proxy.
 * Change them only if the browser will call the organizer API directly.
 * Upstream organizer paths live in server/src/routes/organizer.ts.
 *
 * Leave VITE_API_BASE_URL empty in dev so Vite proxies /api to http://localhost:3001.
 * Put secret keys in server/.env, not here. VITE_ variables are visible in the browser.
 */
export const ENDPOINTS = {
  companies: "/api/companies",
  companyFundamentals: (ticker: string) => `/api/companies/${encodeURIComponent(ticker)}`,
  sectorMetrics: (sector: string) => `/api/sectors/${encodeURIComponent(sector)}`,
  historicalPrices: (ticker: string) => `/api/prices/${encodeURIComponent(ticker)}`,
}

function http() {
  const baseURL = import.meta.env.VITE_API_BASE_URL?.trim()
  const key = import.meta.env.VITE_API_KEY?.trim()
  return axios.create({
    baseURL: baseURL || undefined,
    timeout: 90000,
    headers: key
      ? {
          Authorization: `Bearer ${key}`,
          "x-api-key": key,
        }
      : {},
  })
}

export async function getCompanies(): Promise<CompanyMetrics[]> {
  try {
    const response = await http().get(ENDPOINTS.companies)
    const adapted = adaptCompanies(response.data)
    if (adapted.companies.length === 0) {
      throw new Error(adapted.errors[0] ?? "API response could not be mapped. Update dataAdapter.ts.")
    }
    return adapted.companies
  } catch (error) {
    throw new Error(failureMessage(error, "Could not load companies."))
  }
}

export async function getCompanyFundamentals(ticker: string): Promise<CompanyMetrics> {
  try {
    const response = await http().get(ENDPOINTS.companyFundamentals(ticker))
    const single = adaptCompany(response.data)
    if (single.company) return single.company
    const many = adaptCompanies(response.data)
    if (many.companies[0]) return many.companies[0]
    throw new Error(single.error ?? "Company payload could not be mapped. Update dataAdapter.ts.")
  } catch (error) {
    throw new Error(failureMessage(error, "Could not load company fundamentals."))
  }
}

export async function getSectorMetrics(sector: string): Promise<CompanyMetrics[]> {
  try {
    const response = await http().get(ENDPOINTS.sectorMetrics(sector))
    const adapted = adaptCompanies(response.data)
    if (adapted.companies.length === 0) {
      throw new Error(adapted.errors[0] ?? "Sector payload could not be mapped. Update dataAdapter.ts.")
    }
    return adapted.companies
  } catch (error) {
    throw new Error(failureMessage(error, "Could not load sector metrics."))
  }
}

export async function getHistoricalPrices(ticker: string): Promise<PricePoint[]> {
  try {
    const response = await http().get(ENDPOINTS.historicalPrices(ticker))
    const adapted = adaptPriceRows(response.data)
    if (adapted.prices.length === 0) {
      throw new Error(adapted.errors[0] ?? `No prices mapped for ${ticker}. Update dataAdapter.ts.`)
    }
    return adapted.prices
  } catch (error) {
    throw new Error(failureMessage(error, `Could not load prices for ${ticker}.`))
  }
}

function failureMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && !axios.isAxiosError(error)) return error.message || fallback
  if (!axios.isAxiosError(error)) return fallback
  if (error.code === "ECONNABORTED") return "The API timed out."
  const status = error.response?.status
  const data = error.response?.data
  const detail = isRecord(data) && typeof data.error === "string" ? data.error : ""
  if (!error.response) return "API unavailable. The server could not be reached."
  return `API unavailable (${status ?? "error"}). ${detail}`.trim()
}
