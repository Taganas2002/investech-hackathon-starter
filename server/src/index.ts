import cors from "cors"
import dotenv from "dotenv"
import express, { type NextFunction, type Request, type Response } from "express"
import { organizerRouter } from "./routes/organizer.js"
import { wspRouter } from "./routes/wsp.js"
import { toolkitReady } from "./services/toolkit.js"

dotenv.config()

const app = express()
const port = Number(process.env.PORT) || 3001

app.use(cors())
app.use(express.json())

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    proxyConfigured: Boolean(process.env.ORGANIZER_API_URL?.trim()),
    toolkitReady: toolkitReady(),
  })
})

app.use("/api/wsp", wspRouter)
app.use("/api", organizerRouter)

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: number }).status === "number"
      ? (error as { status: number }).status
      : 502

  const message = error instanceof Error ? error.message : "Proxy request failed"
  res.status(status).json({ error: message })
})

export default app

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Competitive Edge proxy listening on http://localhost:${port}`)
  })
}
