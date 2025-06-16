<template>
  <div class="plain-text-editor">
    <div class="editor-header">
      <h3>Plain Text Collaborative Editor</h3>
      <div class="active-users">
        <div 
          v-for="user in activeUsers" 
          :key="user.id"
          class="user-indicator"
          :style="{ backgroundColor: user.color }"
        >
          {{ user.name }}
        </div>
      </div>
    </div>
    
    <div class="editor-container">
      <textarea
        ref="textareaRef"
        v-model="content"
        @input="onInput"
        @selectionchange="onSelectionChange"
        @keyup="onSelectionChange"
        @mouseup="onSelectionChange"
        placeholder="Start typing to collaborate..."
        class="collaborative-textarea"
      ></textarea>
      
      <!-- Remote cursors -->
      <div class="cursors-overlay">
        <div
          v-for="(cursor, userId) in remoteCursors"
          :key="userId"
          class="remote-cursor"
          :style="{
            left: cursor.x + 'px',
            top: cursor.y + 'px',
            borderColor: cursor.color
          }"
        >
          <div 
            class="cursor-label"
            :style="{ backgroundColor: cursor.color }"
          >
            {{ cursor.name }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { generateRandomUser } from '../utils/userUtils.js'

const props = defineProps({
  documentId: {
    type: String,
    required: true
  }
})

// Yjs setup
const ydoc = new Y.Doc()
const provider = new WebsocketProvider('ws://localhost:1234', props.documentId, ydoc)
const ytext = ydoc.getText('shared-text')
const awareness = provider.awareness

// User and state management
const currentUser = ref(generateRandomUser())
const content = ref('')
const textareaRef = ref(null)
const activeUsers = ref([])
const remoteCursors = ref({})

// Origin tag for our own changes
const ORIGIN = Symbol('local-origin')

onMounted(() => {
  // Set our user info in awareness
  awareness.setLocalStateField('user', currentUser.value)
  awareness.setLocalStateField('cursor', { position: 0, selection: { start: 0, end: 0 } })
  
  // Initialize content from Yjs
  content.value = ytext.toString()
  
  // Listen for text changes
  ytext.observe(event => {
    if (event.transaction.origin !== ORIGIN) {
      content.value = ytext.toString()
      nextTick(() => {
        updateRemoteCursors()
      })
    }
  })
  
  // Listen for awareness changes (users joining/leaving, cursor updates)
  awareness.on('change', ({ added, updated, removed }) => {
    updateActiveUsers()
    updateRemoteCursors()
  })
  
  // Initial updates
  updateActiveUsers()
})

function onInput(e) {
  const newVal = e.target.value
  
  ydoc.transact(() => {
    ytext.delete(0, ytext.length)
    ytext.insert(0, newVal)
  }, ORIGIN)
  
  // Update cursor position in awareness
  updateCursorPosition()
}

function onSelectionChange() {
  nextTick(() => {
    updateCursorPosition()
  })
}

function updateCursorPosition() {
  if (!textareaRef.value) return
  
  const textarea = textareaRef.value
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  
  // Calculate approximate cursor position for visual display
  const rect = textarea.getBoundingClientRect()
  const style = window.getComputedStyle(textarea)
  const lineHeight = parseInt(style.lineHeight) || 20
  
  // Simple approximation - in a real implementation, you'd want more precise positioning
  const lines = content.value.substring(0, start).split('\n')
  const currentLine = lines.length - 1
  const currentCol = lines[lines.length - 1].length
  
  const cursorData = {
    position: start,
    selection: { start, end },
    x: currentCol * 8, // Approximate character width
    y: currentLine * lineHeight
  }
  
  awareness.setLocalStateField('cursor', cursorData)
}

function updateActiveUsers() {
  const users = []
  awareness.getStates().forEach((state, clientId) => {
    if (state.user && clientId !== awareness.clientID) {
      users.push(state.user)
    }
  })
  activeUsers.value = users
}

function updateRemoteCursors() {
  const cursors = {}
  awareness.getStates().forEach((state, clientId) => {
    if (state.user && state.cursor && clientId !== awareness.clientID) {
      cursors[clientId] = {
        ...state.cursor,
        name: state.user.name,
        color: state.user.color
      }
    }
  })
  remoteCursors.value = cursors
}

onBeforeUnmount(() => {
  provider.disconnect()
  ydoc.destroy()
})
</script>

<style scoped>
.plain-text-editor {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding: 1rem;
  background: #f5f5f5;
  border-radius: 8px;
}

.editor-header h3 {
  margin: 0;
  color: #333;
}

.active-users {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.user-indicator {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  color: white;
  font-size: 0.8rem;
  font-weight: bold;
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

.editor-container {
  position: relative;
}

.collaborative-textarea {
  width: 100%;
  height: 400px;
  padding: 1rem;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  line-height: 20px;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
}

.collaborative-textarea:focus {
  border-color: #45B7D1;
}

.cursors-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  padding: 1rem;
}

.remote-cursor {
  position: absolute;
  width: 2px;
  height: 20px;
  background-color: currentColor;
  border-left: 2px solid;
  animation: blink 1s infinite;
  z-index: 10;
}

.cursor-label {
  position: absolute;
  top: -25px;
  left: -5px;
  padding: 2px 6px;
  border-radius: 4px;
  color: white;
  font-size: 11px;
  font-weight: bold;
  white-space: nowrap;
  text-shadow: none;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
</style>
