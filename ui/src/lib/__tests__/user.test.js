import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRandomUser, loadUser, saveUser, generateDocumentId } from '../user.js'

function fakeStorage() {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _store: store,
  }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('createRandomUser', () => {
  it('produces a name, a colour and a matching light colour', () => {
    for (let i = 0; i < 20; i++) {
      const u = createRandomUser()
      expect(u.name).toMatch(/^[A-Z][a-z]+-\d{4}$/)
      expect(u.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(u.colorLight).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('loadUser / saveUser', () => {
  it('persists the identity across loads', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    const first = loadUser()
    const again = loadUser()
    expect(again).toEqual(first)
  })

  it('regenerates when the stored value is corrupt', () => {
    const storage = fakeStorage()
    storage.setItem('realtime-editor:user', '{not json')
    vi.stubGlobal('localStorage', storage)
    const u = loadUser()
    expect(u.name).toBeTruthy()
    expect(u.color).toBeTruthy()
  })

  it('regenerates when required fields are missing', () => {
    const storage = fakeStorage()
    storage.setItem('realtime-editor:user', JSON.stringify({ name: 'x' }))
    vi.stubGlobal('localStorage', storage)
    const u = loadUser()
    expect(u.colorLight).toBeTruthy()
  })

  it('survives an unavailable localStorage (private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    const u = loadUser()
    expect(u.name).toBeTruthy()
    expect(() => saveUser(u)).not.toThrow()
  })
})

describe('generateDocumentId', () => {
  it('generates unique, url-safe ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateDocumentId()))
    expect(ids.size).toBe(100)
    for (const id of ids) expect(id).toMatch(/^doc-[a-z0-9]+-[a-z0-9]+$/)
  })
})
