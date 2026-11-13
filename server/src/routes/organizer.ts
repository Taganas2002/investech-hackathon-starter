import { Router } from "express";
import { fetchOrganizer } from "../services/organizerClient.js";
import { getOnesheetCompanies, getOnesheetPrices, usesOnesheet } from "../services/onesheet.js";

/**
 * UPDATE THESE PATHS TONIGHT when the organizer publishes real endpoints.
 * The React app calls this proxy; this proxy calls the organizer.
 * Response JSON is returned unchanged. Field mapping stays in
 * client/src/dataAdapter.ts.
 */
export const ORGANIZER_PATHS = {
  companies: "/companies",
  company: (ticker: string) => `/companies/${encodeURIComponent(ticker)}`,
  sector: (sector: string) => `/sectors/${encodeURIComponent(sector)}`,
  prices: (ticker: string) => `/prices/${encodeURIComponent(ticker)}`,
};

export const organizerRouter = Router();

organizerRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    organizerConfigured: Boolean(process.env.ORGANIZER_API_URL?.trim()),
  });
});

organizerRouter.get("/companies", async (_req, res, next) => {
  try {
    if (usesOnesheet()) {
      res.json({ companies: await getOnesheetCompanies() });
      return;
    }
    res.json(await fetchOrganizer(ORGANIZER_PATHS.companies));
  } catch (error) {
    next(error);
  }
});

organizerRouter.get("/companies/:ticker", async (req, res, next) => {
  try {
    const ticker = routeParam(req.params.ticker);
    if (usesOnesheet()) {
      const companies = (await getOnesheetCompanies()).filter(
        (company) => company.ticker.toUpperCase() === ticker.toUpperCase(),
      );
      res.json({ companies });
      return;
    }
    res.json(await fetchOrganizer(ORGANIZER_PATHS.company(ticker)));
  } catch (error) {
    next(error);
  }
});

organizerRouter.get("/sectors/:sector", async (req, res, next) => {
  try {
    const sector = routeParam(req.params.sector);
    if (usesOnesheet()) {
      const companies = (await getOnesheetCompanies()).filter(
        (company) => company.sector.toLowerCase() === sector.toLowerCase(),
      );
      res.json({ companies });
      return;
    }
    res.json(await fetchOrganizer(ORGANIZER_PATHS.sector(sector)));
  } catch (error) {
    next(error);
  }
});

organizerRouter.get("/prices/:ticker", async (req, res, next) => {
  try {
    const ticker = routeParam(req.params.ticker);
    if (usesOnesheet()) {
      res.json({ prices: await getOnesheetPrices(ticker) });
      return;
    }
    res.json(await fetchOrganizer(ORGANIZER_PATHS.prices(ticker)));
  } catch (error) {
    next(error);
  }
});

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
