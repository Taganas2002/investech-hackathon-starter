import { useEffect, useMemo, useState } from "react"
import { ChartsPanel } from "../components/ChartsPanel.tsx"
import { CompanyPanel } from "../components/CompanyPanel.tsx"
import { ComparisonTable } from "../components/ComparisonTable.tsx"
import { HeaderBar } from "../components/HeaderBar.tsx"
import { RankingList } from "../components/RankingList.tsx"
import { StatusBanner } from "../components/StatusBanner.tsx"
import { getDemoDataset } from "../data/mockData.ts"
import { resolveSector, sameSector, uniqueSectors } from "../data/sectorConfig.ts"
import { getCompanies, getHistoricalPrices } from "../services/api.ts"
import type { CompanyMetrics, DataMode, PricePoint } from "../types/index.ts"
import { explainCompany } from "../utils/insights.ts"
import { parseOrganizerCsv } from "../utils/importCsv.ts"
import { rankCompanies, topTicker } from "../utils/scoring.ts"

interface Banner {
  tone: "error" | "success" | "info"
  text: string
}

const initialDemo = getDemoDataset()

export default function Dashboard() {
  const [companies, setCompanies] = useState<CompanyMetrics[]>(initialDemo.companies)
  const [prices, setPrices] = useState<PricePoint[]>(initialDemo.prices)
  const [sector, setSector] = useState(initialDemo.defaultSector)
  const [selectedTicker, setSelectedTicker] = useState(() =>
    topTicker(initialDemo.companies, initialDemo.defaultSector),
  )
  const [mode, setMode] = useState<DataMode>("demo")
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState<Banner | null>(null)

  const sectors = useMemo(() => uniqueSectors(companies), [companies])
  const peers = useMemo(
    () => companies.filter((company) => sameSector(company.sector, sector)),
    [companies, sector],
  )
  const sectorDef = useMemo(() => resolveSector(sector, peers[0]), [sector, peers])
  const scores = useMemo(() => rankCompanies(peers, sectorDef), [peers, sectorDef])
  const selected = peers.find((company) => company.ticker === selectedTicker) ?? peers[0]
  const selectedScore = scores.find((score) => score.ticker === selected?.ticker)
  const explanation = selected && selectedScore ? explainCompany(selected, selectedScore) : undefined
  const selectedPrices = useMemo(
    () => prices.filter((point) => point.ticker === selected?.ticker),
    [prices, selected],
  )

  function focusSector(nextCompanies: CompanyMetrics[], preferred: string, currentTicker: string) {
    const options = uniqueSectors(nextCompanies)
    const nextSector =
      options.find((option) => sameSector(option, preferred)) ??
      options.slice().sort((a, b) => {
        const size = (label: string) => nextCompanies.filter((company) => sameSector(company.sector, label)).length
        return size(b) - size(a)
      })[0] ??
      ""
    const nextPeers = nextCompanies.filter((company) => sameSector(company.sector, nextSector))
    const ranked = rankCompanies(nextPeers, resolveSector(nextSector, nextPeers[0]))
    const stillThere = nextPeers.some((company) => company.ticker === currentTicker)
    setSector(nextSector)
    setSelectedTicker(stillThere ? currentTicker : ranked[0]?.ticker ?? "")
  }

  function loadDemo() {
    const demo = getDemoDataset()
    setCompanies(demo.companies)
    setPrices(demo.prices)
    setMode("demo")
    setBanner({ tone: "success", text: "Demo data restored. These companies are fictional." })
    focusSector(demo.companies, demo.defaultSector, "")
  }

  function chooseSector(nextSector: string) {
    setSector(nextSector)
    const nextPeers = companies.filter((company) => sameSector(company.sector, nextSector))
    const ranked = rankCompanies(nextPeers, resolveSector(nextSector, nextPeers[0]))
    setSelectedTicker(ranked[0]?.ticker ?? "")
  }

  async function importFile(file: File) {
    setLoading(true)
    try {
      const result = await parseOrganizerCsv(file)
      if (!result.ok) {
        setBanner({ tone: "error", text: result.message })
        return
      }
      if (result.kind === "companies") {
        setCompanies(result.companies)
        setMode("csv")
        focusSector(result.companies, sector, selectedTicker)
        setBanner({ tone: result.warnings.length ? "info" : "success", text: result.message })
        return
      }
      setPrices((current) => mergePrices(current, result.prices))
      setBanner({ tone: "success", text: result.message })
    } catch (error) {
      const message = error instanceof Error ? error.message : "The CSV could not be imported."
      setBanner({ tone: "error", text: message })
    } finally {
      setLoading(false)
    }
  }

  async function loadApi() {
    setLoading(true)
    setBanner(null)
    try {
      const nextCompanies = await getCompanies()
      const batches = await Promise.all(
        nextCompanies.map(async (company) => {
          try {
            return await getHistoricalPrices(company.ticker)
          } catch {
            return [] as PricePoint[]
          }
        }),
      )
      const nextPrices = batches.flat()
      setCompanies(nextCompanies)
      setPrices(nextPrices)
      setMode("api")
      focusSector(nextCompanies, sector, selectedTicker)
      setBanner({
        tone: nextPrices.length === 0 ? "info" : "success",
        text:
          nextPrices.length === 0
            ? `Loaded ${nextCompanies.length} companies. Price history was not available, so the price chart is empty.`
            : `Loaded ${nextCompanies.length} companies from the API.`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "API unavailable."
      setBanner({
        tone: "error",
        text: `${message} The current data is still on screen.`,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadApi()
  }, [])

  return (
    <div className="app-shell">
      <HeaderBar mode={mode} loading={loading} onDemo={loadDemo} onApi={() => void loadApi()} onFile={(file) => void importFile(file)} />

      <section className="sector-row">
        <div>
          <p className="eyebrow">Sector</p>
          <div className="sector-buttons">
            {sectors.map((option) => (
              <button
                key={option}
                type="button"
                className={sameSector(option, sector) ? "sector-btn selected" : "sector-btn"}
                onClick={() => chooseSector(option)}
                aria-pressed={sameSector(option, sector)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <p className="peer-count">
          {peers.length === 0 ? "No companies" : `${peers.length} ${peers.length === 1 ? "company" : "companies"}`}
        </p>
      </section>

      {banner ? <StatusBanner tone={banner.tone} text={banner.text} onDismiss={() => setBanner(null)} /> : null}

      {peers.length === 0 ? (
        <section className="panel empty-state">
          <h2>No companies to compare</h2>
          <p>Load demo data or import an organizer CSV with a ticker column.</p>
          <button type="button" className="btn primary" onClick={loadDemo}>
            Demo Data
          </button>
        </section>
      ) : (
        <>
          <div className="layout">
            <RankingList
              companies={peers}
              scores={scores}
              selectedTicker={selected?.ticker ?? ""}
              onSelect={setSelectedTicker}
            />
            <CompanyPanel company={selected} score={selectedScore} sector={sectorDef} explanation={explanation} />
          </div>
          <ComparisonTable
            companies={peers}
            scores={scores}
            sector={sectorDef}
            selectedTicker={selected?.ticker ?? ""}
            onSelect={setSelectedTicker}
          />
          <ChartsPanel
            scores={scores}
            selectedTicker={selected?.ticker ?? ""}
            prices={selectedPrices}
            onSelect={setSelectedTicker}
          />
        </>
      )}

      <footer className="site-footer">
        <p>
          Competitive Edge ranks companies against their sector peers using fundamentals and one sector-specific KPI.
          It does not predict which stock will go up.
        </p>
      </footer>
    </div>
  )
}

function mergePrices(current: PricePoint[], incoming: PricePoint[]): PricePoint[] {
  const tickers = new Set(incoming.map((point) => point.ticker))
  return [...current.filter((point) => !tickers.has(point.ticker)), ...incoming]
}
