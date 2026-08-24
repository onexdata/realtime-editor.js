import { describe, it, expect, afterEach, vi } from 'vitest'
import { getWsUrl, isValidDocId } from '../config.js'

afterEach(() => {
  delete import.meta.env.VITE_WS_URL
  vi.unstubAllGlobals()
})

describe('isValidDocId', () => {
  it('accepts letters, digits, dot, underscore, dash', () => {
    for (const id of ['demo', 'team-notes', 'a', 'A1._-x', 'doc-123-abc', 'x'.repeat(100)]) {
      expect(isValidDocId(id), id).toBe(true)
    }
  })

  it('rejects empty, leading punctuation, spaces, slashes and over-long ids', () => {
    for (const id of ['', '-starts-bad', '.hidden', 'has space', 'a/b', 'a?b', 'ü', 'x'.repeat(101)]) {
      expect(isValidDocId(id), JSON.stringify(id)).toBe(false)
    }
  })
})

describe('getWsUrl', () => {
  it('uses VITE_WS_URL when configured, stripping trailing slashes', () => {
    import.meta.env.VITE_WS_URL = 'wss://collab.example.com//'
    expect(getWsUrl()).toBe('wss://collab.example.com')
  })

  it('falls back to ws://<hostname>:1234 on http pages', () => {
    vi.stubGlobal('window', { location: { protocol: 'http:', hostname: 'myhost' } })
    expect(getWsUrl()).toBe('ws://myhost:1234')
  })

  it('uses wss:// on https pages', () => {
    vi.stubGlobal('window', { location: { protocol: 'https:', hostname: 'secure.app' } })
    expect(getWsUrl()).toBe('wss://secure.app:1234')
  })
})
