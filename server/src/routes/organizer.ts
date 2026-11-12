import { Router } from "express"
import { fetchOrganizer, isProxyConfigured, publicError } from "../services/organizerClient.js"
import { getOnesheetCompanies, getOnesheetPrices, usesOnesheet } from "../services/onesheet.js"

/**
 * TONIGHT: change UPSTREAM paths to match the organizer documentation.
 * These are appended to ORGANIZER_API_URL.
 *
 * Example:
 *   ORGANIZER_API_URL=https://api.example.com/v1
 *   companies: "/equities"
 *   requests https://api.example.com/v1/equities
 *
 * The React app keeps calling /api/companies. Only this file needs the real upstream path.
 */
const UPSTREAM = {
  companies: "/companies",
  company: (ticker: string) => `/companies/${encodeURIComponent(ticker)}`,
  sector: (sector: string) => `/sectors/${encodeURIComponent(sector)}`,
  prices: (ticker: string) => `/prices/${encodeURIComponent(ticker)}`,
}

export const organizerRouter = Router()

organizerRouter.get("/companies", async (_req, res) => {
  if (usesOnesheet()) {
    await sendOnesheet(res, async () => ({ companies: await getOnesheetCompanies() }))
    return
  }
  await sendUpstream(res, UPSTREAM.companies)
})

organizerRouter.get("/companies/:ticker", async (req, res) => {
  const ticker = routeParam(req.params.ticker)
  if (usesOnesheet()) {
    await sendOnesheet(res, async () => {
      const companies = (await getOnesheetCompanies()).filter((company) => company.ticker.toUpperCase() === ticker.toUpperCase())
      return { companies }
    })
    return
  }
  await sendUpstream(res, UPSTREAM.company(ticker))
})

organizerRouter.get("/sectors/:sector", async (req, res) => {
  const sector = routeParam(req.params.sector)
  if (usesOnesheet()) {
    await sendOnesheet(res, async () => {
      const companies = (await getOnesheetCompanies()).filter((company) => company.sector.toLowerCase() === sector.toLowerCase())
      return { companies }
    })
    return
  }
  await sendUpstream(res, UPSTREAM.sector(sector))
})

organizerRouter.get("/prices/:ticker", async (req, res) => {
  const ticker = routeParam(req.params.ticker)
  if (usesOnesheet()) {
    await sendOnesheet(res, async () => ({ prices: await getOnesheetPrices(ticker) }))
    return
  }
  await sendUpstream(res, UPSTREAM.prices(ticker))
})

async function sendOnesheet(
  res: { status: (code: number) => { json: (body: unknown) => void }; json: (body: unknown) => void },
  load: () => Promise<unknown>,
) {
  try {
    res.json(await load())
  } catch (error) {
    res.status(502).json({ error: publicError(error) })
  }
}

async function sendUpstream(res: { status: (code: number) => { json: (body: unknown) => void }; json: (body: unknown) => void }, path: string) {
  if (!isProxyConfigured()) {
    res.status(503).json({
      error:
        "ORGANIZER_API_URL is not set. Use Demo Data in the app, or copy server/.env.example to server/.env.",
    })
    return
  }
  try {
    const data = await fetchOrganizer(path)
    res.json(data)
  } catch (error) {
    res.status(502).json({ error: publicError(error) })
  }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}
