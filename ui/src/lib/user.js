/**
 * Stable per-browser user identity (name + colour), persisted in localStorage
 * so a reload keeps the same identity.
 */
const STORAGE_KEY = 'realtime-editor:user'

const ANIMALS = [
  'Owl', 'Fox', 'Hawk', 'Bear', 'Wolf', 'Eagle', 'Lion', 'Tiger', 'Panda', 'Deer',
  'Rabbit', 'Falcon', 'Lynx', 'Otter', 'Seal', 'Whale', 'Shark', 'Raven', 'Swan', 'Crane',
]

// Saturated colours that stay legible as cursor/label backgrounds with white text,
// paired with a light tint used for selection highlights.
const PALETTE = [
  ['#e03131', '#ffe3e3'], ['#c2255c', '#ffdeeb'], ['#9c36b5', '#f3d9fa'],
  ['#6741d9', '#e5dbff'], ['#3b5bdb', '#dbe4ff'], ['#1971c2', '#d0ebff'],
  ['#0c8599', '#c5f6fa'], ['#099268', '#c3fae8'], ['#2f9e44', '#d3f9d8'],
  ['#e8590c', '#ffe8cc'], ['#f08c00', '#fff3bf'], ['#5c940d', '#e9fac8'],
]

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

export function createRandomUser() {
  const [color, colorLight] = pick(PALETTE)
  return {
    name: `${pick(ANIMALS)}-${Math.floor(Math.random() * 9000) + 1000}`,
    color,
    colorLight,
  }
}

export function loadUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.name === 'string' && parsed.color && parsed.colorLight) {
        return parsed
      }
    }
  } catch {
    /* ignore storage errors (private mode, etc.) */
  }
  const user = createRandomUser()
  saveUser(user)
  return user
}

export function saveUser(user) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  } catch {
    /* ignore */
  }
}

export function generateDocumentId() {
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `doc-${stamp}-${rand}`
}
