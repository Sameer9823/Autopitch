import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Track whether the viewport is below the mobile breakpoint.
 *
 * The viewport is an external store, so it is read with `useSyncExternalStore`
 * rather than a `useState` seeded inside an effect. That removes the extra
 * render pass on mount (the hook returned `false` for one frame before
 * correcting itself) and gives React the correct server snapshot, so the first
 * client render already agrees with the markup.
 */
export function useIsMobile() {
  const query = React.useMemo(
    () => `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
    []
  )

  const subscribe = React.useCallback((onChange: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])

  // No server-side viewport to read, so the snapshot during SSR is always false.
  const getServerSnapshot = React.useCallback(() => false, [])

  const getSnapshot = React.useCallback(
    () => window.matchMedia(query).matches,
    [query]
  )

  return React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )
}
