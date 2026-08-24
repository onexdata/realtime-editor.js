// @vitest-environment happy-dom
/**
 * Unit tests for the Editor.js ⇄ Yjs binding.
 *
 * Editor.js is replaced by a small mock that implements the subset of the
 * Blocks API the binding uses (including Editor.js's behaviour of inserting an
 * empty default paragraph when the last block is deleted). Yjs is real: most
 * tests run TWO documents relayed to each other, asserting both editors
 * converge to the same content — which is the binding's whole job.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as Y from 'yjs'
import { EditorJsBinding, BLOCKS_KEY, blocksFromYArray } from '../editorjs-binding.js'

let autoId = 0
const nextId = (prefix = 'blk') => `${prefix}${++autoId}`

class MockBlock {
  constructor(id, type, data) {
    this.id = id
    this.name = type
    this.data = structuredClone(data ?? {})
  }
  async save() {
    return { id: this.id, tool: this.name, data: structuredClone(this.data) }
  }
}

/** Minimal stand-in for Editor.js's `editor.blocks` API. */
class MockBlocksAPI {
  constructor() {
    this.list = []
  }
  getBlocksCount() {
    return this.list.length
  }
  getBlockByIndex(i) {
    return this.list[i]
  }
  getById(id) {
    return this.list.find((b) => b.id === id) ?? null
  }
  getBlockIndex(id) {
    return this.list.findIndex((b) => b.id === id)
  }
  insert(type, data, _config, index, _focus, replace, id) {
    const block = new MockBlock(id ?? nextId('gen'), type ?? 'paragraph', data)
    if (replace) this.list.splice(index, 1, block)
    else this.list.splice(index ?? this.list.length, 0, block)
    return block
  }
  delete(index) {
    this.list.splice(index, 1)
    // Editor.js never leaves the editor empty: it auto-inserts a default block.
    if (this.list.length === 0) {
      this.insert('paragraph', { text: '' }, undefined, 0, false, false, nextId('auto'))
    }
  }
  move(to, from) {
    this.list.splice(to, 0, this.list.splice(from, 1)[0])
  }
  async update(id, data) {
    const block = this.getById(id)
    if (block) block.data = structuredClone({ ...block.data, ...data })
    return block
  }
  /** test helper: current [{id, type, data}] */
  snapshot() {
    return this.list.map((b) => ({ id: b.id, type: b.name, data: b.data }))
  }
  /** test helper: simulate the user editing block contents locally */
  setData(id, data) {
    this.getById(id).data = structuredClone(data)
  }
  addBlock(type, data, index, id = nextId()) {
    return this.insert(type, data, undefined, index ?? this.list.length, false, false, id)
  }
}

function makeSide(name) {
  const ydoc = new Y.Doc()
  const yarray = ydoc.getArray(BLOCKS_KEY)
  const api = new MockBlocksAPI()
  const editor = { blocks: api }
  const holder = document.createElement('div')
  const binding = new EditorJsBinding(editor, yarray, { holder })
  return { name, ydoc, yarray, api, editor, binding }
}

/** Relay updates between two docs, like a (synchronous) server would. */
function connect(a, b) {
  const RELAY = 'relay'
  a.ydoc.on('update', (u, origin) => {
    if (origin !== RELAY) Y.applyUpdate(b.ydoc, u, RELAY)
  })
  b.ydoc.on('update', (u, origin) => {
    if (origin !== RELAY) Y.applyUpdate(a.ydoc, u, RELAY)
  })
}

const touch = (...ids) => ids.map((id) => ({ detail: { target: { id } } }))

/** Wait until both bindings' queues have fully drained. */
async function settle(...sides) {
  for (let i = 0; i < 6; i++) {
    await Promise.all(sides.map((s) => s.binding.queue))
    await new Promise((r) => setTimeout(r, 0))
  }
}

beforeEach(() => {
  autoId = 0
})

describe('local → Yjs', () => {
  it('pushes new blocks into the shared array in editor order', async () => {
    const a = makeSide('a')
    a.api.addBlock('paragraph', { text: 'one' }, 0, 'p1')
    a.api.addBlock('header', { text: 'title', level: 2 }, 1, 'h1')
    await a.binding.handleLocalChange(a.editor, touch('p1', 'h1'))

    expect(blocksFromYArray(a.yarray)).toEqual([
      { id: 'p1', type: 'paragraph', data: { text: 'one' } },
      { id: 'h1', type: 'header', data: { text: 'title', level: 2 } },
    ])
  })

  it('never shares the empty placeholder paragraph', async () => {
    const a = makeSide('a')
    a.api.addBlock('paragraph', { text: '' }, 0, 'ph')
    await a.binding.handleLocalChange(a.editor, touch('ph'))
    expect(a.yarray.length).toBe(0)

    // …until it has content
    a.api.setData('ph', { text: 'now real' })
    await a.binding.handleLocalChange(a.editor, touch('ph'))
    expect(blocksFromYArray(a.yarray)).toEqual([
      { id: 'ph', type: 'paragraph', data: { text: 'now real' } },
    ])
  })

  it('writes nothing when the editor already matches the shared state', async () => {
    const a = makeSide('a')
    a.api.addBlock('paragraph', { text: 'stable' }, 0, 'p1')
    await a.binding.handleLocalChange(a.editor, touch('p1'))

    const before = Y.encodeStateVector(a.ydoc)
    await a.binding.handleLocalChange(a.editor, touch('p1')) // echo — no changes
    expect(Y.encodeStateVector(a.ydoc)).toEqual(before)
  })

  it('propagates deletes and reorders', async () => {
    const a = makeSide('a')
    a.api.addBlock('paragraph', { text: '1' }, 0, 'p1')
    a.api.addBlock('paragraph', { text: '2' }, 1, 'p2')
    a.api.addBlock('paragraph', { text: '3' }, 2, 'p3')
    await a.binding.handleLocalChange(a.editor, touch('p1', 'p2', 'p3'))

    a.api.delete(1) // remove p2
    a.api.move(0, 1) // p3 before p1
    await a.binding.handleLocalChange(a.editor, touch('p2'))

    expect(blocksFromYArray(a.yarray).map((b) => b.id)).toEqual(['p3', 'p1'])
  })
})

describe('Yjs → local (two connected editors)', () => {
  it('replicates inserts to the other editor with the same ids', async () => {
    const a = makeSide('a')
    const b = makeSide('b')
    connect(a, b)

    a.api.addBlock('paragraph', { text: 'hello' }, 0, 'p1')
    a.api.addBlock('header', { text: 'title', level: 3 }, 1, 'h1')
    await a.binding.handleLocalChange(a.editor, touch('p1', 'h1'))
    await settle(a, b)

    expect(b.api.snapshot()).toEqual(a.api.snapshot())
    expect(b.api.snapshot().map((x) => x.id)).toEqual(['p1', 'h1'])
  })

  it('replicates data updates without touching other blocks', async () => {
    const a = makeSide('a')
    const b = makeSide('b')
    connect(a, b)

    a.api.addBlock('paragraph', { text: 'one' }, 0, 'p1')
    a.api.addBlock('paragraph', { text: 'two' }, 1, 'p2')
    await a.binding.handleLocalChange(a.editor, touch('p1', 'p2'))
    await settle(a, b)

    const untouched = b.api.getById('p2')
    a.api.setData('p1', { text: 'one edited' })
    await a.binding.handleLocalChange(a.editor, touch('p1'))
    await settle(a, b)

    expect(b.api.getById('p1').data).toEqual({ text: 'one edited' })
    expect(b.api.getById('p2')).toBe(untouched) // instance not replaced
  })

  it('replicates deletes, and a full clear leaves only the local placeholder', async () => {
    const a = makeSide('a')
    const b = makeSide('b')
    connect(a, b)

    a.api.addBlock('paragraph', { text: 'only' }, 0, 'p1')
    await a.binding.handleLocalChange(a.editor, touch('p1'))
    await settle(a, b)
    expect(b.api.getById('p1')).toBeTruthy()

    a.api.delete(0) // auto-inserts placeholder on side a
    await a.binding.handleLocalChange(a.editor, touch('p1'))
    await settle(a, b)

    expect(a.yarray.length).toBe(0)
    expect(b.yarray.length).toBe(0)
    // each side keeps its own (unshared) placeholder
    expect(b.api.getBlocksCount()).toBe(1)
    expect(b.api.snapshot()[0].data).toEqual({ text: '' })
  })

  it('replicates reorders as moves', async () => {
    const a = makeSide('a')
    const b = makeSide('b')
    connect(a, b)

    for (const [i, id] of ['p1', 'p2', 'p3'].entries()) {
      a.api.addBlock('paragraph', { text: id }, i, id)
    }
    await a.binding.handleLocalChange(a.editor, touch('p1', 'p2', 'p3'))
    await settle(a, b)

    a.api.move(2, 0) // p1 to the end
    await a.binding.handleLocalChange(a.editor, [])
    await settle(a, b)

    expect(b.api.snapshot().map((x) => x.id)).toEqual(['p2', 'p3', 'p1'])
  })

  it('replaces the block when its type changes', async () => {
    const a = makeSide('a')
    const b = makeSide('b')
    connect(a, b)

    a.api.addBlock('paragraph', { text: 'plain' }, 0, 'p1')
    await a.binding.handleLocalChange(a.editor, touch('p1'))
    await settle(a, b)

    // simulate "convert to heading" (same id, new type) on side a
    a.api.list[0] = new MockBlock('p1', 'header', { text: 'plain', level: 2 })
    await a.binding.handleLocalChange(a.editor, touch('p1'))
    await settle(a, b)

    expect(b.api.getById('p1').name).toBe('header')
    expect(b.api.getById('p1').data).toEqual({ text: 'plain', level: 2 })
  })

  it('does not echo remote changes back (no write loops)', async () => {
    const a = makeSide('a')
    const b = makeSide('b')
    connect(a, b)

    a.api.addBlock('paragraph', { text: 'ping' }, 0, 'p1')
    await a.binding.handleLocalChange(a.editor, touch('p1'))
    await settle(a, b)

    // Editor.js fires onChange after the binding applies remote ops;
    // replaying those events must not produce new Yjs writes.
    const before = Y.encodeStateVector(b.ydoc)
    await b.binding.handleLocalChange(b.editor, touch('p1'))
    await settle(a, b)
    expect(Y.encodeStateVector(b.ydoc)).toEqual(before)
  })

  it('converges when both sides edit different blocks concurrently', async () => {
    const a = makeSide('a')
    const b = makeSide('b')

    a.api.addBlock('paragraph', { text: 'alpha' }, 0, 'pa')
    a.api.addBlock('paragraph', { text: 'beta' }, 1, 'pb')
    await a.binding.handleLocalChange(a.editor, touch('pa', 'pb'))
    // bring b up to date, then go "offline" (no live relay)
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc))
    await settle(a, b)

    // concurrent, disconnected edits to different blocks
    a.api.setData('pa', { text: 'alpha edited by A' })
    b.api.setData('pb', { text: 'beta edited by B' })
    await a.binding.handleLocalChange(a.editor, touch('pa'))
    await b.binding.handleLocalChange(b.editor, touch('pb'))

    // reconnect: exchange updates both ways
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc))
    Y.applyUpdate(a.ydoc, Y.encodeStateAsUpdate(b.ydoc))
    await settle(a, b)

    const expected = [
      { id: 'pa', type: 'paragraph', data: { text: 'alpha edited by A' } },
      { id: 'pb', type: 'paragraph', data: { text: 'beta edited by B' } },
    ]
    expect(a.api.snapshot()).toEqual(expected)
    expect(b.api.snapshot()).toEqual(expected)
  })

  it('stops applying anything after destroy()', async () => {
    const a = makeSide('a')
    const b = makeSide('b')
    connect(a, b)

    a.api.addBlock('paragraph', { text: 'x' }, 0, 'p1')
    await a.binding.handleLocalChange(a.editor, touch('p1'))
    await settle(a, b)

    b.binding.destroy()
    a.api.setData('p1', { text: 'changed after destroy' })
    await a.binding.handleLocalChange(a.editor, touch('p1'))
    await settle(a, b)

    expect(b.api.getById('p1').data).toEqual({ text: 'x' })
  })
})
