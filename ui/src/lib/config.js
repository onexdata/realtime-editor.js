/**
 * WebSocket endpoint resolution.
 *
 * Set VITE_WS_URL (e.g. in ui/.env) to point at a deployed server:
 *   VITE_WS_URL=wss://collab.example.com
 * Otherwise we assume the server runs on port 1234 of the current host.
 */
export function getWsUrl() {
  const configured = import.meta.env.VITE_WS_URL
  if (configured) return configured.replace(/\/+$/, '')
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.hostname}:1234`
}

/** Document ids must be URL-path safe; this is what the UI allows. */
export const DOC_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

export function isValidDocId(id) {
  return DOC_ID_PATTERN.test(id)
}
