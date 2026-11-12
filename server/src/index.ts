import cors from "cors"
import dotenv from "dotenv"
import express from "express"
import { organizerRouter } from "./routes/organizer.js"

dotenv.config()

const app = express()
const port = Number(process.env.PORT) || 3001

app.use(cors())
app.use(express.json())

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    proxyConfigured: Boolean(process.env.ORGANIZER_API_URL?.trim()),
  })
})

app.use("/api", organizerRouter)

app.use("/api", (_req, res) => {
  res.status(404).json({
    error: "Unknown proxy route. See server/src/routes/organizer.ts.",
  })
})

app.listen(port, () => {
  console.log(`Competitive Edge proxy listening on http://localhost:${port}`)
})
