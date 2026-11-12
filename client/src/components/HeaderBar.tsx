import { Database, RotateCcw, Upload } from "lucide-react"
import type { ChangeEvent } from "react"
import type { DataMode } from "../types/index.ts"

interface HeaderBarProps {
  mode: DataMode
  loading: boolean
  onDemo: () => void
  onApi: () => void
  onFile: (file: File) => void
}

const MODE_LABEL: Record<DataMode, string> = {
  demo: "Demo data",
  csv: "Organizer CSV",
  api: "API",
}

export function HeaderBar({ mode, loading, onDemo, onApi, onFile }: HeaderBarProps) {
  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) onFile(file)
  }

  return (
    <header className="site-header">
      <div className="brand">
        <span className="mark" aria-hidden="true">
          CE
        </span>
        <div>
          <h1>Competitive Edge</h1>
          <p>Turn raw market data into investor-ready insights.</p>
        </div>
      </div>
      <div className="header-actions">
        <span className={`mode-pill mode-${mode}`}>{MODE_LABEL[mode]}</span>
        {loading ? <span className="busy">Working…</span> : null}
        <button type="button" className="btn primary" onClick={onDemo} disabled={loading}>
          <RotateCcw size={16} aria-hidden="true" />
          Demo Data
        </button>
        <button type="button" className="btn" onClick={onApi} disabled={loading}>
          <Database size={16} aria-hidden="true" />
          Load API
        </button>
        <label className={loading ? "btn file-btn disabled" : "btn file-btn"}>
          <Upload size={16} aria-hidden="true" />
          Import Organizer CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={chooseFile}
            disabled={loading}
            aria-label="Import Organizer CSV"
          />
        </label>
      </div>
    </header>
  )
}
