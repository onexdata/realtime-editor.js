// Enhanced collaborative server with awareness tracking
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import { createYjsServer } from 'yjs-server'

const wss = new WebSocketServer({ port: 1234 })

// Store document instances and their awareness data
const documentSessions = new Map()

// Store mapping from socket to actual document name
const socketToDocName = new Map()

// Enhanced Yjs server with awareness tracking
const yjsServer = createYjsServer({
  createDoc: (docName) => {
    console.log(`\n🆕 createDoc called with docName: "${docName}" (type: ${typeof docName})`)
    
    // Handle undefined or empty docName - we'll fix this with socket mapping
    if (!docName || docName === 'undefined') {
      console.log(`⚠️  Invalid docName received, will use socket mapping`)
      docName = 'temp-doc'
    }
    
    console.log(`🆕 Creating new document: "${docName}"`)
    
    const doc = new Y.Doc()
    const awareness = new Map() // Track awareness data for this document
    
    // Store document session info
    documentSessions.set(docName, {
      doc,
      awareness,
      users: new Map(),
      createdAt: new Date().toISOString()
    })
    
    // Listen for document updates
    doc.on('update', (update, origin, doc) => {
      // Find the real document name from socket mapping
      let realDocName = docName
      for (const [socket, mappedName] of socketToDocName.entries()) {
        if (socket.readyState === 1) { // WebSocket.OPEN
          realDocName = mappedName
          break
        }
      }
      
      const session = documentSessions.get(realDocName)
      if (session) {
        logDocumentActivity(realDocName, 'update', { origin, updateSize: update.length })
      }
    })
    
    // Listen for destroyed documents
    doc.on('destroy', () => {
      console.log(`🗑️  Document "${docName}" destroyed`)
      documentSessions.delete(docName)
    })
    
    return doc
  }
})

// Enhanced connection handling with awareness
wss.on('connection', (socket, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`)
  const docName = url.pathname.slice(1) || 'default-doc'
  
  // Debug logging
  console.log(`\n🔗 Client connection attempt:`)
  console.log(`   Raw URL: ${request.url}`)
  console.log(`   Parsed pathname: "${url.pathname}"`)
  console.log(`   Extracted docName: "${docName}"`)
  console.log(`   Host: ${request.headers.host}`)
  
  // Track connection info and mapping
  socket.docName = docName
  socket.clientId = generateClientId()
  socket.connectedAt = new Date().toISOString()
  socketToDocName.set(socket, docName)
  
  // Add user to session immediately upon connection
  const session = documentSessions.get(docName)
  if (session) {
    // Track this connection
    session.users.set(socket.clientId, {
      name: `User ${Math.floor(Math.random() * 1000)}`,
      color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`,
      id: socket.clientId,
      connectedAt: socket.connectedAt
    })
    console.log(`👤 User added to "${docName}" - Total users: ${session.users.size}`)
  }
  
  // Ensure document session exists
  if (!documentSessions.has(docName)) {
    console.log(`🆕 Creating document session for: "${docName}"`)
    const doc = new Y.Doc()
    const newSession = {
      doc,
      awareness: new Map(),
      users: new Map(),
      createdAt: new Date().toISOString()
    }
    documentSessions.set(docName, newSession)
    
    // Add this user to the new session
    newSession.users.set(socket.clientId, {
      name: `User ${Math.floor(Math.random() * 1000)}`,
      color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`,
      id: socket.clientId,
      connectedAt: socket.connectedAt
    })
    console.log(`👤 User added to new document "${docName}" - Total users: ${newSession.users.size}`)
    
    // Listen for document updates with correct name
    doc.on('update', (update, origin, doc) => {
      logDocumentActivity(docName, 'update', { origin, updateSize: update.length })
    })
    
    // Listen for destroyed documents
    doc.on('destroy', () => {
      console.log(`🗑️  Document "${docName}" destroyed`)
      documentSessions.delete(docName)
    })
  }
  
  // Handle awareness updates from clients
  socket.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString())
      
      // Check if this is an awareness update
      if (message.type === 'awareness') {
        handleAwarenessUpdate(docName, socket.clientId, message.data)
      }
    } catch (e) {
      // Not JSON, probably binary Yjs data - let the regular handler deal with it
    }
  })
  
  // Handle client disconnect
  socket.on('close', () => {
    console.log(`\n🔴 Client disconnected from "${docName}" (ID: ${socket.clientId})`)
    handleUserLeave(docName, socket.clientId)
  })
  
  // Handle connection errors
  socket.on('error', (error) => {
    console.log(`❌ Connection error for "${docName}": ${error.message}`)
  })
  
  // Wire up the standard Yjs WebSocket handling with correct document name
  // Create a modified request object with the document name in the URL
  const modifiedRequest = {
    ...request,
    url: `/${docName}`
  }
  yjsServer.handleConnection(socket, modifiedRequest)
})

function handleAwarenessUpdate(docName, clientId, awarenessData) {
  const session = documentSessions.get(docName)
  if (!session) return
  
  // Update awareness data
  session.awareness.set(clientId, {
    ...awarenessData,
    lastUpdate: new Date().toISOString()
  })
  
  // Log user activity
  if (awarenessData.user) {
    session.users.set(clientId, awarenessData.user)
    
    if (awarenessData.cursor) {
      logUserActivity(docName, awarenessData.user, 'cursor', {
        position: awarenessData.cursor.position,
        selection: awarenessData.cursor.selection,
        coordinates: { x: awarenessData.cursor.x, y: awarenessData.cursor.y }
      })
    }
    
    if (awarenessData.isTyping) {
      logUserActivity(docName, awarenessData.user, 'typing', {})
    }
  }
}

function handleUserLeave(docName, clientId) {
  const session = documentSessions.get(docName)
  if (!session) return
  
  const user = session.users.get(clientId)
  if (user) {
    logUserActivity(docName, user, 'leave', {})
    session.users.delete(clientId)
  }
  
  session.awareness.delete(clientId)
}

function logDocumentActivity(docName, action, details = {}) {
  const timestamp = new Date().toLocaleTimeString()
  const session = documentSessions.get(docName)
  const activeUsers = session ? session.users.size : 0
  
  console.log(`\n📝 [${timestamp}] Document Activity`)
  console.log(`   Document: "${docName}"`)
  console.log(`   Action: ${action}`)
  console.log(`   Active Users: ${activeUsers}`)
  
  if (details.origin && typeof details.origin === 'symbol') {
    console.log(`   Origin: Local user change`)
  } else if (details.origin) {
    console.log(`   Origin: ${details.origin}`)
  }
  
  if (details.updateSize) {
    console.log(`   Update Size: ${details.updateSize} bytes`)
  }
  
  // Show active users
  if (session && session.users.size > 0) {
    console.log(`   Active Users:`)
    session.users.forEach((user, clientId) => {
      console.log(`   • ${user.name} (${user.color})`)
    })
  }
}

function logUserActivity(docName, user, action, details = {}) {
  const timestamp = new Date().toLocaleTimeString()
  const actionEmoji = {
    cursor: '🎯',
    typing: '⌨️',
    join: '🟢',
    leave: '🔴'
  }
  
  console.log(`\n${actionEmoji[action] || '👤'} [${timestamp}] User Activity`)
  console.log(`   Document: "${docName}"`)
  console.log(`   User: ${user.name}`)
  console.log(`   Color: ${user.color}`)
  console.log(`   Action: ${action}`)
  
  if (action === 'cursor' && details.position !== undefined) {
    console.log(`   Cursor Position: ${details.position}`)
    if (details.selection && details.selection.start !== details.selection.end) {
      console.log(`   Selection: ${details.selection.start}-${details.selection.end} (${details.selection.end - details.selection.start} chars)`)
    }
    if (details.coordinates) {
      console.log(`   Visual Position: (${details.coordinates.x}, ${details.coordinates.y})`)
    }
  }
}

function generateClientId() {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Log server startup
console.log('🚀 Enhanced Collaborative Server Started')
console.log('   Port: 1234')
console.log('   WebSocket URL: ws://localhost:1234')
console.log('   Features: Document tracking, User awareness, Cursor tracking')
console.log('   Timestamp:', new Date().toISOString())

// Periodic status report
setInterval(() => {
  if (documentSessions.size > 0) {
    console.log(`\n📊 Server Status Report - ${new Date().toLocaleTimeString()}`)
    console.log(`   Active Documents: ${documentSessions.size}`)
    
    documentSessions.forEach((session, docName) => {
      console.log(`   • "${docName}" - ${session.users.size} users`)
      session.users.forEach((user) => {
        console.log(`     └─ ${user.name} (${user.color})`)
      })
    })
  }
}, 30000) // Every 30 seconds
