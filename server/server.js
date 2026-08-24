/**
 * Yjs WebSocket server.
 *
 * Built on the official @y/websocket-server backend (the same code that powers
 * `npx y-websocket`), which implements the sync + awareness protocols for any
 * y-websocket client. This file adds:
 *   - an HTTP health endpoint
 *   - optional LevelDB persistence that is fully loaded *before* a client is
 *     synced (the stock backend loads lazily, so a reload could briefly show an
 *     empty document)
 *   - environment-based configuration, connection logging, graceful shutdown
 *
 * Environment variables:
 *   PORT          port to listen on                       (default: 1234)
 *   HOST          interface to bind                       (default: 0.0.0.0)
 *   YPERSISTENCE  directory for LevelDB persistence; when unset, documents
 *                 live in memory for the lifetime of the process
 *   GC            set to "false" to disable Yjs garbage collection
 */
import http from 'node:http'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'

const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number.parseInt(process.env.PORT || '1234', 10)
const PERSIST_DIR = process.env.YPERSISTENCE || ''

// The backend reads YPERSISTENCE at import time and would open the database
// itself; we manage persistence below instead, so hide the variable first.
delete process.env.YPERSISTENCE
const { setupWSConnection, setPersistence, getYDoc, docs } = await import(
  '@y/websocket-server/utils'
)

// --------------------------------------------------------------- persistence

/** docName -> promise that resolves once the persisted state is applied */
const loading = new Map()
const PERSISTENCE_ORIGIN = 'persistence'

if (PERSIST_DIR) {
  const { LeveldbPersistence } = await import('y-leveldb')
  const ldb = new LeveldbPersistence(PERSIST_DIR)

  setPersistence({
    provider: ldb,
    bindState: (docName, ydoc) => {
      // Store every update as it happens (but not the ones we load ourselves).
      ydoc.on('update', (update, origin) => {
        if (origin !== PERSISTENCE_ORIGIN) ldb.storeUpdate(docName, update)
      })
      const promise = ldb
        .getYDoc(docName)
        .then((persisted) => {
          Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persisted), PERSISTENCE_ORIGIN)
        })
        .catch((err) => console.error(`failed to load "${docName}" from disk`, err))
      loading.set(docName, promise)
      return promise
    },
    // Updates are written incrementally, nothing left to flush when the last
    // client leaves. (The backend destroys the in-memory doc after this.)
    writeState: async () => {},
  })
}

/** Resolve when `docName` is in memory with its persisted state applied. */
function ensureLoaded(docName) {
  if (!docs.has(docName)) getYDoc(docName) // triggers bindState above
  return loading.get(docName) ?? Promise.resolve()
}

// ------------------------------------------------------------------- helpers

function docNameFromRequest(req) {
  const path = (req.url || '/').slice(1).split('?')[0]
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

function connectionCount() {
  let n = 0
  for (const doc of docs.values()) n += doc.conns.size
  return n
}

// ---------------------------------------------------------------------- HTTP

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'ok',
        documents: docs.size,
        connections: connectionCount(),
        persistence: PERSIST_DIR ? 'leveldb' : 'memory',
        uptimeSeconds: Math.round(process.uptime()),
      }),
    )
    return
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('not found')
})

// ----------------------------------------------------------------- WebSocket

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', async (conn, req) => {
  const docName = docNameFromRequest(req)
  if (!docName) {
    conn.close(1008, 'missing document name')
    return
  }

  // Hold incoming frames until the document is ready so the very first sync
  // the client receives already contains the persisted content.
  conn.pause()
  await ensureLoaded(docName)
  if (conn.readyState !== conn.OPEN) return
  setupWSConnection(conn, req, { docName })
  conn.resume()

  console.log(`+ ${docName}  (${docs.get(docName)?.conns.size ?? 1} connected, ${docs.size} docs)`)
  conn.on('close', () => {
    const remaining = docs.get(docName)?.conns.size ?? 0
    console.log(`- ${docName}  (${remaining} connected, ${docs.size} docs)`)
  })
})

server.on('upgrade', (req, socket, head) => {
  // Authentication hook: inspect cookies / query params here and call
  // `socket.destroy()` to reject before the upgrade completes.
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
})

server.listen(PORT, HOST, () => {
  const shownHost = HOST === '0.0.0.0' ? 'localhost' : HOST
  console.log(`Yjs server listening on ws://${shownHost}:${PORT}`)
  console.log(`Health: http://${shownHost}:${PORT}/health`)
  console.log(`Persistence: ${PERSIST_DIR ? `leveldb (${PERSIST_DIR})` : 'in-memory'}`)
})

// ------------------------------------------------------------------ shutdown

function shutdown(signal) {
  console.log(`\n${signal} received, closing ${connectionCount()} connection(s)…`)
  for (const client of wss.clients) client.close(1001, 'server shutting down')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
