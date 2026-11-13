export type WspRoute =
  | "decision"
  | "glance"
  | "acquisitions"
  | "peers"
  | "per-share"
  | "deals"
  | "index-fit"

export const WSP_NAV: Array<{ id: WspRoute; label: string }> = [
  { id: "decision", label: "Decision" },
  { id: "glance", label: "WSP at a glance" },
  { id: "acquisitions", label: "Acquisitions" },
  { id: "peers", label: "Peer comparison" },
  { id: "per-share", label: "Value per share" },
  { id: "deals", label: "Deal execution" },
  { id: "index-fit", label: "Index fit" },
]

export function routeFromHash(): WspRoute {
  const raw = window.location.hash.replace(/^#\/?/, "") || "decision"
  const match = WSP_NAV.find((item) => item.id === raw)
  return match?.id ?? "decision"
}

export function setRouteHash(route: WspRoute) {
  window.location.hash = `/${route}`
}
