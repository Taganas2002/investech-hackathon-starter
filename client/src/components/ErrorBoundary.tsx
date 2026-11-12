import { Component, type ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  message: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : "Unexpected display error"
    return { message }
  }

  render() {
    if (!this.state.message) return this.props.children
    return (
      <main className="crash">
        <p className="eyebrow">Competitive Edge</p>
        <h1>The dashboard hit a display error.</h1>
        <p>{this.state.message}</p>
        <button type="button" className="btn primary" onClick={() => window.location.reload()}>
          Reload demo
        </button>
      </main>
    )
  }
}
