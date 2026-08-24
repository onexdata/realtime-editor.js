import { ref, onBeforeUnmount, readonly } from 'vue'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { getWsUrl } from '../lib/config.js'
import { loadUser, saveUser } from '../lib/user.js'

/**
 * Creates a Y.Doc + y-websocket provider for `docId` and exposes reactive
 * presence/connection state. Everything is torn down when the calling
 * component unmounts.
 */
export function useCollab(docId) {
  const ydoc = new Y.Doc()
  const provider = new WebsocketProvider(getWsUrl(), docId, ydoc)
  const awareness = provider.awareness

  const user = ref(loadUser())
  awareness.setLocalStateField('user', user.value)

  /** 'connecting' | 'connected' | 'disconnected' */
  const status = ref('connecting')
  /** true once the initial document state has been received from the server */
  const synced = ref(false)
  /** other connected clients: [{ clientId, name, color, colorLight, typing, block }] */
  const peers = ref([])

  const onStatus = ({ status: s }) => {
    status.value = s
  }
  const onSync = (isSynced) => {
    if (isSynced) synced.value = true
  }
  const refreshPeers = () => {
    const list = []
    awareness.getStates().forEach((state, clientId) => {
      if (clientId === awareness.clientID || !state.user) return
      list.push({ clientId, ...state.user, typing: !!state.typing, block: state.block ?? null })
    })
    list.sort((a, b) => a.clientId - b.clientId)
    peers.value = list
  }

  provider.on('status', onStatus)
  provider.on('sync', onSync)
  awareness.on('change', refreshPeers)
  refreshPeers()

  // Dev convenience: inspect the live document from the browser console.
  if (import.meta.env.DEV) window.__collab = { ydoc, provider, awareness }

  function setUserName(name) {
    const trimmed = String(name ?? '').trim().slice(0, 40)
    if (!trimmed) return
    user.value = { ...user.value, name: trimmed }
    saveUser(user.value)
    awareness.setLocalStateField('user', user.value)
  }

  let typingTimer = null
  /** Flag this client as typing for a short window (call on every local edit). */
  function markTyping() {
    if (!awareness.getLocalState()?.typing) awareness.setLocalStateField('typing', true)
    clearTimeout(typingTimer)
    typingTimer = setTimeout(() => awareness.setLocalStateField('typing', false), 1200)
  }

  onBeforeUnmount(() => {
    clearTimeout(typingTimer)
    awareness.off('change', refreshPeers)
    provider.off('status', onStatus)
    provider.off('sync', onSync)
    provider.destroy() // closes the socket, broadcast channel and internal timers
    ydoc.destroy()
  })

  return {
    ydoc,
    provider,
    awareness,
    user: readonly(user),
    status: readonly(status),
    synced: readonly(synced),
    peers: readonly(peers),
    setUserName,
    markTyping,
  }
}
