import { describe, it, expect } from 'vitest'
import {
  listItemsToLines,
  listConversionExport,
  listConversionImport,
} from '../list-tool.js'

const item = (content, children = []) => ({ content, meta: {}, items: children })

describe('list conversion (line-preserving)', () => {
  it('exports items joined with newlines (survives Editor.js sanitisation)', () => {
    expect(listConversionExport({ items: [item('one'), item('two'), item('three')] })).toBe(
      'one\ntwo\nthree',
    )
  })

  it('flattens nested items depth-first on export', () => {
    const items = [item('a', [item('a1'), item('a2')]), item('b')]
    expect(listItemsToLines(items)).toEqual(['a', 'a1', 'a2', 'b'])
  })

  it('imports newline- or <br>-separated content as separate items', () => {
    const viaNewlines = listConversionImport('one\ntwo\nthree', { defaultStyle: 'checklist' })
    expect(viaNewlines.style).toBe('checklist')
    expect(viaNewlines.items.map((i) => i.content)).toEqual(['one', 'two', 'three'])

    const viaBr = listConversionImport('one<br>two<br />three', {})
    expect(viaBr.items.map((i) => i.content)).toEqual(['one', 'two', 'three'])
  })

  it('round-trips a multi-item list through export -> import', () => {
    const original = { items: [item('one'), item('two'), item('three')] }
    const back = listConversionImport(listConversionExport(original), {})
    expect(back.items.map((i) => i.content)).toEqual(['one', 'two', 'three'])
  })

  it('imports plain paragraph text as a single item', () => {
    const data = listConversionImport('just a sentence', {})
    expect(data.items).toHaveLength(1)
    expect(data.items[0].content).toBe('just a sentence')
    expect(data.style).toBe('unordered')
  })

  it('handles empty content', () => {
    const data = listConversionImport('', {})
    expect(data.items).toHaveLength(1)
    expect(data.items[0].content).toBe('')
  })
})
