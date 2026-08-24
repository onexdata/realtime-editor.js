/**
 * End-to-end server tests using Node's built-in test runner.
 *   node --test
 *
 * Spawns server.js as a child process and talks to it with the real
 * y-websocket client, so these exercise the actual wire protocol.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import WebSocket from 'ws'

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', 'server.js')

function startServer(env) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, HOST: '127.0.0.1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${output}`)), 8000)
    child.stdout.on('data', () => {
      if (output.includes('listening')) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.on('exit', (code) => reject(new Error(`server exited early (${code}):\n${output}`)))
  })
  const stop = () =>
    new Promise((resolve) => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', resolve)
      child.kill()
    })
  return { ready, stop, output: () => output }
}

async function withClient(port, room, fn) {
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(`ws://127.0.0.1:${port}`, room, doc, {
    WebSocketPolyfill: WebSocket,
    disableBc: true,
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sync timeout')), 5000)
    provider.on('sync', (synced) => {
      if (synced) {
        clearTimeout(timer)
        resolve()
      }
    })
  })
  try {
    return await fn(doc, provider)
  } finally {
    provider.destroy()
    doc.destroy()
  }
}

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms))

test('health endpoint reports status', async () => {
  const port = 14231
  const server = startServer({ PORT: String(port) })
  await server.ready
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.status, 'ok')
    assert.equal(body.persistence, 'memory')
  } finally {
    await server.stop()
  }
})

test('two clients on the same document see each other\'s edits', async () => {
  const port = 14232
  const server = startServer({ PORT: String(port) })
  await server.ready
  try {
    await withClient(port, 'shared', async (docA) => {
      await withClient(port, 'shared', async (docB) => {
        docA.getText('t').insert(0, 'hello')
        await settle()
        assert.equal(docB.getText('t').toString(), 'hello')

        docB.getText('t').insert(5, ' world')
        await settle()
        assert.equal(docA.getText('t').toString(), 'hello world')
      })
    })
  } finally {
    await server.stop()
  }
})

test('documents survive while the server is running (in-memory)', async () => {
  const port = 14233
  const server = startServer({ PORT: String(port) })
  await server.ready
  try {
    await withClient(port, 'mem-doc', async (doc) => {
      doc.getText('t').insert(0, 'kept in memory')
      await settle()
    })
    await withClient(port, 'mem-doc', async (doc) => {
      assert.equal(doc.getText('t').toString(), 'kept in memory')
    })
  } finally {
    await server.stop()
  }
})

test('documents survive a restart with YPERSISTENCE', async () => {
  const port = 14234
  const dir = mkdtempSync(join(tmpdir(), 'realtime-editor-'))
  let server = startServer({ PORT: String(port), YPERSISTENCE: dir })
  await server.ready
  try {
    await withClient(port, 'durable', async (doc) => {
      doc.getText('t').insert(0, 'persisted hello')
      await settle(500)
    })
    await settle(300) // let the server flush after the last client leaves
    await server.stop()

    server = startServer({ PORT: String(port), YPERSISTENCE: dir })
    await server.ready
    await withClient(port, 'durable', async (doc) => {
      assert.equal(doc.getText('t').toString(), 'persisted hello')
    })
  } finally {
    await server.stop()
    rmSync(dir, { recursive: true, force: true })
  }
})
