import { readFileSync } from "node:fs"
import { adaptCompanies, adaptPriceRows, detectTabularKind } from "../src/dataAdapter.ts"
import { loadPapa } from "../src/utils/importCsv.ts"
import { getDemoDataset } from "../src/data/mockData.ts"
import { resolveSector } from "../src/data/sectorConfig.ts"
import { explainCompany } from "../src/utils/insights.ts"
import { rankCompanies } from "../src/utils/scoring.ts"

const demo = getDemoDataset()
let failed = 0

function check(name: string, ok: boolean, detail = "") {
  if (!ok) {
    failed += 1
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`)
    return
  }
  console.log(`ok   ${name}`)
}

for (const sectorName of ["Specialty Retail", "Regional Grocery"]) {
  const peers = demo.companies.filter((company) => company.sector === sectorName)
  const sector = resolveSector(sectorName, peers[0])
  const scores = rankCompanies(peers, sector)
  console.log(`\n${sectorName}`)
  for (const score of scores) {
    const company = peers.find((item) => item.ticker === score.ticker)
    if (!company) continue
    const explanation = explainCompany(company, score)
    console.log(`#${score.rank} ${score.ticker} ${score.totalScore} — ${score.mainAdvantage}`)
    console.log(`   ${explanation.summary}`)
  }
  check(`${sectorName} has companies`, peers.length >= 3)
  check(`${sectorName} scores are finite`, scores.every((score) => Number.isFinite(score.totalScore)))
  check(`${sectorName} rank 1 exists`, scores[0]?.rank === 1)
}

const retail = rankCompanies(
  demo.companies.filter((company) => company.sector === "Specialty Retail"),
  resolveSector("Specialty Retail"),
)
check("NOVA is rank 1 in Specialty Retail", retail[0]?.ticker === "NOVA", retail.map((score) => score.ticker).join(","))

const nova = demo.companies.find((company) => company.ticker === "NOVA")
const novaScore = retail.find((score) => score.ticker === "NOVA")
if (nova && novaScore) {
  const explanation = explainCompany(nova, novaScore)
  check("NOVA has a strength", explanation.strengths.length > 0)
  check(
    "NOVA calls out leverage",
    explanation.weaknesses.some((item) => item.key === "debtToEquity") || explanation.summary.includes("leverage"),
  )
  check("NOVA price history matches the quote", nova.currentPrice === 44.02)
}

const companyCsv = readFileSync(new URL("../../sample-data/organizer-companies.csv", import.meta.url), "utf8")
const parseCsv = loadPapa().parse
const companyRows = parseCsv(companyCsv, { header: true, skipEmptyLines: "greedy" }).data
check("sample company CSV detected", detectTabularKind(companyRows) === "companies")
const mapped = adaptCompanies(companyRows)
check("sample company CSV maps 5 rows", mapped.companies.length === 5, mapped.errors.join(" | "))
const peak = mapped.companies.find((company) => company.ticker === "PEAK")
check("rev_growth maps to revenueGrowth", peak?.revenueGrowth === 17.8)
check("sss_growth maps to the sector KPI", peak?.sectorKpis?.sameStoreSalesGrowth === 6.4)
const importedScores = rankCompanies(mapped.companies, resolveSector("Specialty Retail", mapped.companies[0]))
check(
  "sample CSV ranks PEAK first",
  importedScores[0]?.ticker === "PEAK",
  importedScores.map((score) => `${score.ticker}:${score.totalScore}`).join(", "),
)

const priceCsv = readFileSync(new URL("../../sample-data/organizer-prices.csv", import.meta.url), "utf8")
const priceRows = parseCsv(priceCsv, { header: true, skipEmptyLines: "greedy" }).data
check("sample price CSV detected", detectTabularKind(priceRows) === "prices")
check("sample price CSV maps rows", adaptPriceRows(priceRows).prices.length === 6)

const partialCsv = readFileSync(new URL("../../sample-data/partial-company.csv", import.meta.url), "utf8")
const partialRows = parseCsv(partialCsv, { header: true, skipEmptyLines: "greedy" }).data
const partial = adaptCompanies(partialRows)
const ghost = partial.companies.find((company) => company.ticker === "GHOST")
check("partial CSV keeps both companies", partial.companies.length === 2)
check("invalid GHOST metrics are missing", ghost?.revenueGrowth === undefined && ghost?.grossMargin === undefined)

const brokenCsv = readFileSync(new URL("../../sample-data/broken.csv", import.meta.url), "utf8")
const brokenRows = parseCsv(brokenCsv, { header: true, skipEmptyLines: "greedy" }).data
check("broken CSV is unknown", detectTabularKind(brokenRows) === "unknown")

if (failed > 0) {
  console.error(`\n${failed} checks failed`)
  process.exit(1)
}
console.log("\nAll checks passed")
