/**
 * Pure helpers that turn "current list of block ids" + "target list of block
 * ids" into a minimal, ordered sequence of operations. Used in both directions
 * of the Editor.js ⇄ Yjs binding so the two sides always converge.
 *
 * Operation order is deliberate:
 *   1. inserts are appended at the end (the editor is never left empty, which
 *      would make Editor.js auto-insert a placeholder block mid-sequence)
 *   2. deletes, highest index first (indices stay valid)
 *   3. moves, walking from the front
 *
 * Each op carries the index it must be applied at *given the previous ops have
 * already been applied*. `applyOps` is the reference simulation and is what
 * the tests check against.
 */

/**
 * @param {string[]} current
 * @param {string[]} target
 * @returns {Array<{type:'insert',id:string,index:number}|{type:'delete',id:string,index:number}|{type:'move',id:string,from:number,to:number}>}
 */
export function planReconcile(current, target) {
  const ops = []
  const working = current.slice()
  const targetSet = new Set(target)
  const currentSet = new Set(current)

  // 1. append missing ids
  for (const id of target) {
    if (!currentSet.has(id)) {
      ops.push({ type: 'insert', id, index: working.length })
      working.push(id)
    }
  }

  // 2. delete ids that are no longer wanted, from the back
  for (let i = working.length - 1; i >= 0; i--) {
    if (!targetSet.has(working[i])) {
      ops.push({ type: 'delete', id: working[i], index: i })
      working.splice(i, 1)
    }
  }

  // 3. fix ordering
  for (let i = 0; i < target.length; i++) {
    if (working[i] === target[i]) continue
    const from = working.indexOf(target[i], i + 1)
    if (from === -1) continue // duplicate ids in target; ignore
    ops.push({ type: 'move', id: target[i], from, to: i })
    working.splice(i, 0, working.splice(from, 1)[0])
  }

  return ops
}

/** Reference implementation of how ops are meant to be applied. */
export function applyOps(current, ops) {
  const list = current.slice()
  for (const op of ops) {
    if (op.type === 'insert') list.splice(op.index, 0, op.id)
    else if (op.type === 'delete') list.splice(op.index, 1)
    else if (op.type === 'move') list.splice(op.to, 0, list.splice(op.from, 1)[0])
  }
  return list
}

/** Stable deep equality for plain JSON block data. */
export function dataEqual(a, b) {
  return stableStringify(a) === stableStringify(b)
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

/** Editor.js inserts an empty paragraph when the document is empty; it is never synced. */
export function isPlaceholderBlock(block) {
  if (!block || block.type !== 'paragraph') return false
  const text = block.data?.text
  return text === undefined || text === null || String(text).replace(/<br\s*\/?>/gi, '').trim() === ''
}
