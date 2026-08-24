import { describe, it, expect } from 'vitest'
import { planReconcile, applyOps, dataEqual, isPlaceholderBlock } from '../reconcile.js'

function check(current, target) {
  const ops = planReconcile(current, target)
  expect(applyOps(current, ops)).toEqual(target)
  return ops
}

describe('planReconcile', () => {
  it('produces no ops when lists are equal', () => {
    expect(check(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual([])
    expect(check([], [])).toEqual([])
  })

  it('inserts at the end first so the editor is never emptied', () => {
    const ops = check(['a'], ['b'])
    expect(ops[0]).toEqual({ type: 'insert', id: 'b', index: 1 })
    expect(ops[1]).toEqual({ type: 'delete', id: 'a', index: 0 })
  })

  it('handles insert in the middle', () => {
    check(['a', 'c'], ['a', 'b', 'c'])
  })

  it('handles deletes from the back with valid indices', () => {
    const ops = check(['a', 'b', 'c', 'd'], ['b', 'd'])
    expect(ops).toEqual([
      { type: 'delete', id: 'c', index: 2 },
      { type: 'delete', id: 'a', index: 0 },
    ])
  })

  it('handles pure reorder', () => {
    check(['a', 'b', 'c'], ['c', 'a', 'b'])
    check(['a', 'b', 'c'], ['b', 'a', 'c'])
    check(['a', 'b', 'c', 'd'], ['d', 'c', 'b', 'a'])
  })

  it('handles full replacement', () => {
    check(['a', 'b'], ['x', 'y', 'z'])
    check(['a', 'b'], [])
    check([], ['x'])
  })

  it('handles mixed insert/delete/move', () => {
    check(['a', 'b', 'c', 'd', 'e'], ['e', 'x', 'a', 'd', 'y'])
  })

  it('converges on random inputs', () => {
    let seed = 42
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
    const pool = 'abcdefghij'.split('')
    const pickSet = () => {
      const s = pool.filter(() => rand() < 0.6)
      for (let i = s.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        const tmp = s[i]
        s[i] = s[j]
        s[j] = tmp
      }
      return s
    }
    for (let round = 0; round < 500; round++) {
      check(pickSet(), pickSet())
    }
  })
})

describe('dataEqual', () => {
  it('ignores key order', () => {
    expect(dataEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(dataEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(dataEqual({ text: 'x' }, { text: 'x', level: 2 })).toBe(false)
  })
})

describe('isPlaceholderBlock', () => {
  it('detects empty default paragraphs only', () => {
    expect(isPlaceholderBlock({ type: 'paragraph', data: { text: '' } })).toBe(true)
    expect(isPlaceholderBlock({ type: 'paragraph', data: { text: '<br>' } })).toBe(true)
    expect(isPlaceholderBlock({ type: 'paragraph', data: {} })).toBe(true)
    expect(isPlaceholderBlock({ type: 'paragraph', data: { text: 'hi' } })).toBe(false)
    expect(isPlaceholderBlock({ type: 'header', data: { text: '' } })).toBe(false)
  })
})
