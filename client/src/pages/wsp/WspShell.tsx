import { useEffect, useState } from "react"
import { getWspReady } from "../../services/wspApi.ts"
import { AcquisitionsPage } from "./AcquisitionsPage.tsx"
import { DecisionPage } from "./DecisionPage.tsx"
import { DealsPage } from "./DealsPage.tsx"
import { GlancePage } from "./GlancePage.tsx"
import { IndexFitPage } from "./IndexFitPage.tsx"
import { PeersPage } from "./PeersPage.tsx"
import { PerSharePage } from "./PerSharePage.tsx"
import { clearWspCache } from "./useWspPage.ts"
import { routeFromHash, setRouteHash, WSP_NAV, type WspRoute } from "./routes.ts"

interface WspShellProps {
  onBack: () => void
}

export default function WspShell({ onBack }: WspShellProps) {
  const [route, setRoute] = useState<WspRoute>(routeFromHash)
  /** Default to offline — live Onesheet keys were revoked for the hackathon. */
  const [offline, setOffline] = useState(true)
  const [offlineAvailable, setOfflineAvailable] = useState(false)

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash())
    window.addEventListener("hashchange", onHash)
    if (!window.location.hash) setRouteHash("decision")
    void getWspReady()
      .then((ready) => {
        setOfflineAvailable(ready.offlineAvailable)
        if (ready.offlineAvailable) {
          setOffline(true)
          clearWspCache()
        }
      })
      .catch(() => setOfflineAvailable(false))
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  function go(next: WspRoute) {
    setRoute(next)
    setRouteHash(next)
  }

  function toggleOffline(next: boolean) {
    clearWspCache()
    setOffline(next)
  }

  return (
    <div className="app-shell wsp-shell">
      <header className="site-header">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            WSP
          </span>
          <div>
            <h1>WSP Global — Index Admission Analysis</h1>
            <p>Evidence-based argument for index admission.</p>
          </div>
        </div>
        <div className="header-actions">
          <label className="offline-toggle">
            <input
              type="checkbox"
              checked={offline}
              disabled={!offlineAvailable}
              onChange={(event) => toggleOffline(event.target.checked)}
            />
            Offline snapshot
          </label>
          <button type="button" className="btn" onClick={onBack}>
            Competitive Edge
          </button>
        </div>
      </header>

      {offline ? (
        <p className="banner banner-info wsp-offline-note" role="status">
          Showing the saved offline snapshot. Live Onesheet API access was stopped for this demo — leave Offline
          snapshot on to explore all WSP panels.
        </p>
      ) : null}

      <nav className="wsp-nav" aria-label="WSP sections">
        {WSP_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={route === item.id ? "nav-link selected" : "nav-link"}
            onClick={() => go(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {route === "decision" ? <DecisionPage offline={offline} onOpen={go} /> : null}
      {route === "glance" ? <GlancePage offline={offline} /> : null}
      {route === "acquisitions" ? <AcquisitionsPage offline={offline} /> : null}
      {route === "peers" ? <PeersPage offline={offline} /> : null}
      {route === "per-share" ? <PerSharePage offline={offline} /> : null}
      {route === "deals" ? <DealsPage offline={offline} /> : null}
      {route === "index-fit" ? <IndexFitPage offline={offline} /> : null}
    </div>
  )
}
