/**
 * Editor.js ⇄ Yjs binding.
 *
 * Shared structure: a Y.Array of Y.Map blocks, each `{ id, type, data }`,
 * mirroring Editor.js's own OutputBlockData. Block ids are Editor.js's ids, so
 * the same block has the same id on every client.
 *
 * Granularity is the block: users editing *different* blocks merge perfectly;
 * two users editing the *same* block at the same moment resolve last-writer-
 * wins for that block only. Everything else in the document is untouched.
 *
 * Both directions are idempotent and run through a single promise queue, so a
 * remote change that triggers Editor.js's `onChange` is recognised as already
 * synced and produces no write (no echo loops).
 */
import * as Y from 'yjs'
import { planReconcile, dataEqual, isPlaceholderBlock } from './reconcile.js'

export const BLOCKS_KEY = 'blocks'

/**
 * Editor.js batches its `onChange` behind a 400ms debounce that resets on
 * every keystroke, so continuous typing would not sync until the writer
 * pauses. The binding therefore also listens to raw `input` events and
 * syncs the affected block this quickly:
 */
export const INPUT_SYNC_MS = 50

/** Current document as Editor.js OutputData blocks. */
export function blocksFromYArray(yarray) {
  return yarray.toJSON()
}

function makeYBlock({ id, type, data }) {
  const m = new Y.Map()
  m.set('id', id)
  m.set('type', type)
  m.set('data', data ?? {})
  return m
}

export class EditorJsBinding {
  /**
   * @param {import('@editorjs/editorjs').default} editor  a ready Editor.js instance
   * @param {Y.Array} yarray  shared block array
   * @param {{ holder: HTMLElement, onAfterRemoteApply?: () => void }} opts
   */
  constructor(editor, yarray, { holder, onAfterRemoteApply } = {}) {
    this.editor = editor
    this.yarray = yarray
    this.holder = holder
    this.onAfterRemoteApply = onAfterRemoteApply
    this.destroyed = false
    this.queue = Promise.resolve()
    /** ids currently known to exist in the shared array */
    this.syncedIds = new Set(yarray.map((m) => m.get('id')))
    /** ids whose data/type changed remotely and still need applying */
    this.pendingChanged = new Set()

    this._observer = (events, txn) => {
      if (txn.origin === this) return
      for (const ev of events) {
        if (ev.target instanceof Y.Map) {
          const id = ev.target.get('id')
          if (id) this.pendingChanged.add(id)
        }
      }
      this.enqueue(() => this.applyRemote())
    }
    yarray.observeDeep(this._observer)

    // Realtime fast path (see INPUT_SYNC_MS above): push the block being
    // typed in within ~50ms instead of waiting out Editor.js's onChange
    // debounce. The batched onChange stays wired up as the authoritative
    // safety net for structural changes that emit no input event.
    this._inputPending = new Set()
    this._inputTimer = null
    this._onInput = (event) => {
      const target = event.target
      const el = target instanceof Element ? target : target?.parentElement
      const id = el?.closest?.('.ce-block')?.dataset?.id
      if (id) this.scheduleInputSync(id)
    }
    holder?.addEventListener('input', this._onInput, true)
  }

  scheduleInputSync(id) {
    this._inputPending.add(id)
    if (this._inputTimer) return
    this._inputTimer = setTimeout(() => {
      this._inputTimer = null
      const touched = this._inputPending
      this._inputPending = new Set()
      this.enqueue(() => this.pushLocal(touched))
    }, INPUT_SYNC_MS)
  }

  destroy() {
    this.destroyed = true
    clearTimeout(this._inputTimer)
    this.holder?.removeEventListener('input', this._onInput, true)
    this.yarray.unobserveDeep(this._observer)
  }

  enqueue(fn) {
    this.queue = this.queue
      .then(() => (this.destroyed ? undefined : fn()))
      .catch((err) => console.error('[editorjs-yjs] sync step failed', err))
    return this.queue
  }

  /** Wire this to Editor.js's `onChange` config option. */
  handleLocalChange(api, eventOrEvents) {
    const events = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents]
    const touched = new Set()
    for (const ev of events) {
      const id = ev?.detail?.target?.id
      if (id) touched.add(id)
    }
    return this.enqueue(() => this.pushLocal(touched))
  }

  editorIds() {
    const api = this.editor.blocks
    const ids = []
    const n = api.getBlocksCount()
    for (let i = 0; i < n; i++) {
      const b = api.getBlockByIndex(i)
      if (b) ids.push(b.id)
    }
    return ids
  }

  yIds() {
    return this.yarray.map((m) => m.get('id'))
  }

  yMapById(id) {
    for (const m of this.yarray) if (m.get('id') === id) return m
    return null
  }

  // ---------------------------------------------------------------- local → Y

  async pushLocal(touched) {
    const api = this.editor.blocks
    const yIdSet = new Set(this.yIds())
    const editorIds = this.editorIds()

    // Serialise only blocks that are new to Y or were reported as touched.
    const saved = new Map()
    for (const id of editorIds) {
      if (yIdSet.has(id) && !touched.has(id)) continue
      const block = api.getById(id)
      if (!block) continue
      const out = await block.save()
      if (!out) continue
      saved.set(id, { type: out.tool, data: out.data ?? {} })
    }
    if (this.destroyed) return

    // Editor.js's auto-inserted empty paragraph is never shared until it has content.
    const target = editorIds.filter(
      (id) => yIdSet.has(id) || (saved.has(id) && !isPlaceholderBlock(saved.get(id))),
    )

    const yIdsNow = this.yIds()
    const ops = planReconcile(yIdsNow, target)

    const changes = []
    for (const [id, blk] of saved) {
      if (!yIdSet.has(id)) continue
      const m = this.yMapById(id)
      if (!m) continue
      if (m.get('type') !== blk.type || !dataEqual(m.get('data'), blk.data)) changes.push([id, blk])
    }

    if (ops.length === 0 && changes.length === 0) return

    this.yarray.doc.transact(() => {
      for (const op of ops) {
        if (op.type === 'insert') {
          const blk = saved.get(op.id)
          this.yarray.insert(op.index, [makeYBlock({ id: op.id, ...blk })])
        } else if (op.type === 'delete') {
          this.yarray.delete(op.index, 1)
        } else if (op.type === 'move') {
          // Yjs has no move: re-create the block at its new position.
          const json = this.yarray.get(op.from).toJSON()
          this.yarray.delete(op.from, 1)
          this.yarray.insert(op.to, [makeYBlock(json)])
        }
      }
      for (const [id, blk] of changes) {
        const m = this.yMapById(id)
        if (!m) continue
        if (m.get('type') !== blk.type) m.set('type', blk.type)
        m.set('data', blk.data)
      }
    }, this)

    this.syncedIds = new Set(target)
  }

  // ---------------------------------------------------------------- Y → local

  async applyRemote() {
    const api = this.editor.blocks
    const changed = this.pendingChanged
    this.pendingChanged = new Set()

    const yBlocks = this.yarray.toJSON()
    const byId = new Map(yBlocks.map((b) => [b.id, b]))
    const targetIds = yBlocks.map((b) => b.id)
    let editorIds = this.editorIds()

    // A lone never-synced block is Editor.js's placeholder; leave it alone.
    if (targetIds.length === 0 && editorIds.length === 1 && !this.syncedIds.has(editorIds[0])) {
      editorIds = []
    }

    const caret = captureCaret(this.holder)
    const ops = planReconcile(editorIds, targetIds)

    for (const op of ops) {
      if (op.type === 'insert') {
        const b = byId.get(op.id)
        api.insert(b.type, b.data, undefined, op.index, false, false, b.id)
      } else if (op.type === 'delete') {
        api.delete(op.index)
      } else if (op.type === 'move') {
        api.move(op.to, op.from)
      }
    }

    const updatedIds = []
    for (const id of changed) {
      const b = byId.get(id)
      if (!b) continue
      const existing = api.getById(id)
      if (!existing) continue
      if (existing.name !== b.type) {
        api.insert(b.type, b.data, undefined, api.getBlockIndex(id), false, true, id)
      } else {
        const current = await existing.save()
        if (current && dataEqual(current.data, b.data)) continue
        await api.update(id, b.data)
      }
      updatedIds.push(id)
    }

    this.syncedIds = new Set(targetIds)

    if (caret && updatedIds.includes(caret.id)) restoreCaret(this.holder, caret)
    this.onAfterRemoteApply?.()
  }
}

// ------------------------------------------------------------------ caret utils

/** Block id (from `.ce-block[data-id]`) that currently holds the selection, or null. */
export function focusedBlockId(holder) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const node = sel.getRangeAt(0).startContainer
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
  const block = el?.closest('.ce-block')
  if (!block || !holder?.contains(block)) return null
  return block.dataset.id || null
}

function captureCaret(holder) {
  if (!holder) return null
  // Only meaningful while this editor actually has focus. Without this guard,
  // restoring a *stale* selection after a remote update would call .focus()
  // and steal focus from wherever the user is really working (another
  // window, iframe, or input).
  const doc = holder.ownerDocument
  if (!doc.hasFocus() || !holder.contains(doc.activeElement)) return null
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const node = range.startContainer
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
  const block = el?.closest('.ce-block')
  if (!block || !holder?.contains(block)) return null
  const content = block.querySelector('[contenteditable="true"]')
  if (!content || !content.contains(node)) return null
  return { id: block.dataset.id, offset: textOffset(content, node, range.startOffset) }
}

function restoreCaret(holder, { id, offset }) {
  const block = holder?.querySelector(`.ce-block[data-id="${CSS.escape(id)}"]`)
  const content = block?.querySelector('[contenteditable="true"]')
  if (!content) return
  content.focus()
  setTextOffset(content, offset)
}

function textOffset(root, node, offset) {
  if (node === root) {
    // selection anchored on the element itself: count text in preceding children
    let total = 0
    for (let i = 0; i < offset && i < root.childNodes.length; i++) {
      total += root.childNodes[i].textContent.length
    }
    return total
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let total = 0
  let current
  while ((current = walker.nextNode())) {
    if (current === node) return total + offset
    total += current.textContent.length
  }
  return total
}

function setTextOffset(root, offset) {
  const sel = window.getSelection()
  const range = document.createRange()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let current
  let last = null
  while ((current = walker.nextNode())) {
    last = current
    const len = current.textContent.length
    if (remaining <= len) {
      range.setStart(current, remaining)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    remaining -= len
  }
  if (last) range.setStart(last, last.textContent.length)
  else range.selectNodeContents(root)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}
