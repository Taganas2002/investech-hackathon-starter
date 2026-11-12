import { ErrorBoundary } from "./components/ErrorBoundary.tsx"
import Dashboard from "./pages/Dashboard.tsx"

export default function App() {
  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  )
}
