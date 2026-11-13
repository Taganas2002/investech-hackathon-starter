import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const serverRoot = join(here, "..")
const source = join(serverRoot, "..", "trimestre-toolkit", "dashboard_data")
const target = join(serverRoot, "dashboard_data")

if (!existsSync(join(source, "manifest.json"))) {
  console.error(`Missing toolkit snapshot at ${source}`)
  process.exit(1)
}

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(source, target, { recursive: true })
console.log(`Synced dashboard_data -> ${target}`)
