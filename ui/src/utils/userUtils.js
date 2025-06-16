// Generate random user names and colors for collaborative editing

const animals = [
  'Owl', 'Fox', 'Hawk', 'Bear', 'Wolf', 'Eagle', 'Lion', 'Tiger', 'Panda', 'Deer',
  'Rabbit', 'Falcon', 'Lynx', 'Otter', 'Seal', 'Whale', 'Shark', 'Raven', 'Swan', 'Crane'
]

const colors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', 
  '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA', '#F1948A', '#85CDCA',
  '#D7DBDD', '#AED6F1', '#A9DFBF', '#F9E79F', '#D2B4DE', '#AEB6BF'
]

export function generateRandomUser() {
  const animal = animals[Math.floor(Math.random() * animals.length)]
  const number = Math.floor(Math.random() * 9000) + 1000
  const color = colors[Math.floor(Math.random() * colors.length)]
  
  return {
    name: `${animal}-${number}`,
    color: color,
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export function generateDocumentId() {
  return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}
