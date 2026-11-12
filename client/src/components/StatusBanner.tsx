interface StatusBannerProps {
  tone: "error" | "success" | "info"
  text: string
  onDismiss: () => void
}

export function StatusBanner({ tone, text, onDismiss }: StatusBannerProps) {
  return (
    <div className={`banner banner-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <p>{text}</p>
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}
