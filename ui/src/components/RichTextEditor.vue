<template>
  <div class="rich-text-editor">
    <div class="editor-header">
      <h3>Rich Text Collaborative Editor</h3>
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
      <div ref="editorRef" class="editor-js-container"></div>
      
      <!-- User typing indicators -->
      <div class="typing-indicators">
        <div
          v-for="user in typingUsers"
          :key="user.id"
          class="typing-indicator"
          :style="{ color: user.color }"
        >
          {{ user.name }} is typing...
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
import EditorJS from '@editorjs/editorjs'
import Header from '@editorjs/header'
import Paragraph from '@editorjs/paragraph'
import List from '@editorjs/list'

const props = defineProps({
  documentId: {
    type: String,
    required: true
  }
})

// Yjs setup
const ydoc = new Y.Doc()
const provider = new WebsocketProvider('ws://localhost:1234', props.documentId, ydoc)
const ymap = ydoc.getMap('editor-content')
const awareness = provider.awareness

// Component state
const currentUser = ref(generateRandomUser())
const editorRef = ref(null)
const activeUsers = ref([])
const typingUsers = ref([])
const activeBlocks = ref({}) // Track which users are editing which blocks
const editor = ref(null)
const currentBlockId = ref(null)

// Debounce timer for typing indicators
let typingTimeout = null

// Origin tag for our own changes
const ORIGIN = Symbol('local-origin')

onMounted(async () => {
  // Set user info in awareness
  awareness.setLocalStateField('user', currentUser.value)
  awareness.setLocalStateField('isTyping', false)
  
  // Initialize Editor.js
  await initializeEditor()
  
  // Listen for Yjs changes
  ymap.observe(event => {
    if (event.transaction.origin !== ORIGIN) {
      updateEditorFromYjs()
    }
  })
  
  // Listen for awareness changes
  awareness.on('change', ({ added, updated, removed }) => {
    updateActiveUsers()
    updateTypingUsers()
    updateActiveBlocks()
  })
  
  // Initial updates
  updateActiveUsers()
  updateEditorFromYjs()
  
  // Set up block tracking after editor is ready
  await nextTick()
  setupBlockTracking()
})

async function initializeEditor() {
  editor.value = new EditorJS({
    holder: editorRef.value,
    tools: {
      header: {
        class: Header,
        config: {
          placeholder: 'Enter a header',
          levels: [1, 2, 3, 4, 5, 6],
          defaultLevel: 2
        }
      },
      paragraph: {
        class: Paragraph,
        inlineToolbar: true,
        config: {
          placeholder: 'Start writing...'
        }
      },
      list: {
        class: List,
        inlineToolbar: true,
        config: {
          defaultStyle: 'unordered'
        }
      }
    },
    onChange: debounce(handleEditorChange, 300),
    placeholder: 'Start collaborating with rich text...'
  })
  
  // Wait for editor to be ready
  await editor.value.isReady
}

async function handleEditorChange() {
  try {
    const outputData = await editor.value.save()
    
    // Update Yjs document
    ydoc.transact(() => {
      ymap.set('blocks', outputData.blocks)
      ymap.set('time', outputData.time)
      ymap.set('version', outputData.version || '2.28.0')
    }, ORIGIN)
    
    // Set typing indicator
    awareness.setLocalStateField('isTyping', true)
    
    // Clear typing indicator after a delay
    clearTimeout(typingTimeout)
    typingTimeout = setTimeout(() => {
      awareness.setLocalStateField('isTyping', false)
    }, 1000)
    
  } catch (error) {
    console.warn('Failed to save editor content:', error)
  }
}

async function updateEditorFromYjs() {
  if (!editor.value) return
  
  try {
    const blocks = ymap.get('blocks')
    const time = ymap.get('time')
    const version = ymap.get('version')
    
    if (blocks && Array.isArray(blocks)) {
      const editorData = {
        blocks,
        time: time || Date.now(),
        version: version || '2.28.0'
      }
      
      await editor.value.render(editorData)
    }
  } catch (error) {
    console.warn('Failed to update editor from Yjs:', error)
  }
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

function updateTypingUsers() {
  const typing = []
  awareness.getStates().forEach((state, clientId) => {
    if (state.user && state.isTyping && clientId !== awareness.clientID) {
      typing.push(state.user)
    }
  })
  typingUsers.value = typing
}

function updateActiveBlocks() {
  const blocks = {}
  awareness.getStates().forEach((state, clientId) => {
    if (state.user && state.activeBlockId && clientId !== awareness.clientID) {
      blocks[state.activeBlockId] = {
        user: state.user,
        clientId
      }
    }
  })
  activeBlocks.value = blocks
  updateBlockIndicators()
}

function setupBlockTracking() {
  if (!editorRef.value) return
  
  // Add event listener to the editor container to detect block focus
  const editorContainer = editorRef.value
  
  editorContainer.addEventListener('click', handleBlockFocus)
  editorContainer.addEventListener('keyup', handleBlockFocus)
  editorContainer.addEventListener('focus', handleBlockFocus, true)
}

function handleBlockFocus(event) {
  // Find the closest block element
  const blockElement = event.target.closest('.ce-block')
  if (!blockElement) return
  
  // Get the block index as an identifier
  const blocks = editorRef.value.querySelectorAll('.ce-block')
  const blockIndex = Array.from(blocks).indexOf(blockElement)
  
  if (blockIndex !== -1 && blockIndex !== currentBlockId.value) {
    currentBlockId.value = blockIndex
    
    // Update awareness with the active block
    awareness.setLocalStateField('activeBlockId', blockIndex)
  }
}

function updateBlockIndicators() {
  if (!editorRef.value) return
  
  // Clear existing indicators
  const existingIndicators = editorRef.value.querySelectorAll('.block-user-indicator')
  existingIndicators.forEach(indicator => indicator.remove())
  
  // Add new indicators
  Object.entries(activeBlocks.value).forEach(([blockId, blockData]) => {
    const blockIndex = parseInt(blockId)
    const blocks = editorRef.value.querySelectorAll('.ce-block')
    const blockElement = blocks[blockIndex]
    
    if (blockElement && !blockElement.querySelector('.block-user-indicator')) {
      const indicator = document.createElement('div')
      indicator.className = 'block-user-indicator'
      indicator.style.backgroundColor = blockData.user.color
      indicator.title = `${blockData.user.name} is editing this block`
      
      // Position the indicator
      blockElement.style.position = 'relative'
      blockElement.appendChild(indicator)
    }
  })
}

function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

onBeforeUnmount(() => {
  if (editor.value) {
    editor.value.destroy()
  }
  clearTimeout(typingTimeout)
  provider.disconnect()
  ydoc.destroy()
})
</script>

<style scoped>
.rich-text-editor {
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

.editor-js-container {
  min-height: 400px;
  border: 2px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  background: white;
  transition: border-color 0.2s;
}

.editor-js-container:focus-within {
  border-color: #45B7D1;
}

.typing-indicators {
  margin-top: 0.5rem;
  min-height: 20px;
}

.typing-indicator {
  font-size: 0.8rem;
  font-style: italic;
  opacity: 0.8;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0.4; }
}

/* Override Editor.js styles for better collaboration */
:deep(.ce-block__content) {
  max-width: none;
}

:deep(.ce-toolbar__content) {
  max-width: none;
}

:deep(.codex-editor) {
  z-index: 1;
}

:deep(.ce-block) {
  padding: 0.5rem 0;
}

:deep(.ce-paragraph) {
  line-height: 1.6;
}

:deep(.ce-header) {
  margin: 1rem 0 0.5rem 0;
}

:deep(.ce-list) {
  padding-left: 1rem;
}

/* Block user indicators */
:deep(.block-user-indicator) {
  position: absolute;
  left: -20px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  z-index: 10;
  animation: blockPulse 2s infinite;
}

@keyframes blockPulse {
  0%, 100% { 
    opacity: 1;
    transform: translateY(-50%) scale(1);
  }
  50% { 
    opacity: 0.7;
    transform: translateY(-50%) scale(1.1);
  }
}

/* Ensure blocks have space for indicators */
:deep(.ce-block) {
  position: relative;
  margin-left: 30px;
}
</style>
