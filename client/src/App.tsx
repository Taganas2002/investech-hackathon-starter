import { useState } from "react"
import { ErrorBoundary } from "./components/ErrorBoundary.tsx"
import Dashboard from "./pages/Dashboard.tsx"
import WspShell from "./pages/wsp/WspShell.tsx"

export default function App() {
  const [view, setView] = useState<"edge" | "wsp">("wsp")

  return (
    <ErrorBoundary>
      {view === "wsp" ? (
        <WspShell onBack={() => setView("edge")} />
      ) : (
        <div>
          <div className="view-switch">
            <button type="button" className="btn primary" onClick={() => setView("wsp")}>
              WSP Index Admission
            </button>
          </div>
          <Dashboard />
        </div>
      )}
    </ErrorBoundary>
  )
}
