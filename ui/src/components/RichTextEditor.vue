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
    onChange: handleEditorChange,
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
    const newBlocks = ymap.get('blocks')
    const time = ymap.get('time')
    const version = ymap.get('version')
    
    if (!newBlocks || !Array.isArray(newBlocks)) return
    
    // Save current cursor position before making changes
    const savedCursorState = await saveCursorPosition()
    
    // Get current blocks from editor
    const currentData = await editor.value.save()
    const currentBlocks = currentData.blocks || []
    
    // Compare and apply surgical updates
    await applySurgicalUpdates(currentBlocks, newBlocks)
    
    // Restore cursor position
    await restoreCursorPosition(savedCursorState, newBlocks)
    
  } catch (error) {
    console.warn('Failed to update editor from Yjs:', error)
    // Fallback to full render if surgical update fails
    try {
      const editorData = {
        blocks: ymap.get('blocks'),
        time: ymap.get('time') || Date.now(),
        version: ymap.get('version') || '2.28.0'
      }
      await editor.value.render(editorData)
    } catch (fallbackError) {
      console.error('Fallback render also failed:', fallbackError)
    }
  }
}

async function saveCursorPosition() {
  try {
    const focusedElement = document.activeElement
    const blockElement = focusedElement?.closest('.ce-block')
    
    if (!blockElement) return null
    
    const blocks = editorRef.value?.querySelectorAll('.ce-block')
    const blockIndex = blocks ? Array.from(blocks).indexOf(blockElement) : -1
    
    if (blockIndex < 0) return null
    
    // Try to get the actual cursor position within the contenteditable element
    let textOffset = 0
    let hasSelection = false
    let selectionStart = 0
    let selectionEnd = 0
    
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const contentElement = blockElement.querySelector('[contenteditable="true"]')
      
      if (contentElement && contentElement.contains(range.startContainer)) {
        // Calculate text offset from start of content
        textOffset = getTextOffset(contentElement, range.startContainer, range.startOffset)
        
        // Check if there's a selection
        if (!range.collapsed) {
          hasSelection = true
          selectionStart = textOffset
          selectionEnd = getTextOffset(contentElement, range.endContainer, range.endOffset)
        }
      }
    }
    
    return {
      blockIndex,
      textOffset,
      hasSelection,
      selectionStart,
      selectionEnd,
      hasFocus: true
    }
  } catch (error) {
    console.warn('Failed to save cursor position:', error)
    return null
  }
}

function getTextOffset(root, node, offset) {
  let textOffset = 0
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    null,
    false
  )
  
  let currentNode
  while (currentNode = walker.nextNode()) {
    if (currentNode === node) {
      return textOffset + offset
    }
    textOffset += currentNode.textContent.length
  }
  
  return textOffset
}

function setTextOffset(element, offset) {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  )
  
  let currentOffset = 0
  let currentNode
  
  while (currentNode = walker.nextNode()) {
    const nodeLength = currentNode.textContent.length
    if (currentOffset + nodeLength >= offset) {
      const range = document.createRange()
      const selection = window.getSelection()
      range.setStart(currentNode, offset - currentOffset)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return true
    }
    currentOffset += nodeLength
  }
  
  // Fallback: place at end
  const range = document.createRange()
  const selection = window.getSelection()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
  return false
}

async function applySurgicalUpdates(currentBlocks, newBlocks) {
  // Check if we need to update at all
  if (blocksEqual(currentBlocks, newBlocks)) {
    return // No changes needed
  }
  
  // For now, use render but preserve focus more intelligently
  // This avoids the complex surgical approach that uses non-existent APIs
  const editorData = {
    blocks: newBlocks,
    time: ymap.get('time') || Date.now(),
    version: ymap.get('version') || '2.28.0'
  }
  
  try {
    await editor.value.render(editorData)
  } catch (error) {
    console.warn('Failed to render editor data:', error)
  }
}

function blocksEqual(currentBlocks, newBlocks) {
  if (!Array.isArray(currentBlocks) || !Array.isArray(newBlocks)) {
    return false
  }
  
  if (currentBlocks.length !== newBlocks.length) {
    return false
  }
  
  // Deep compare the entire blocks arrays
  return JSON.stringify(currentBlocks) === JSON.stringify(newBlocks)
}

async function restoreCursorPosition(savedState, newBlocks) {
  if (!savedState || !newBlocks) return
  
  try {
    const { blockIndex, textOffset, hasSelection, selectionStart, selectionEnd, hasFocus } = savedState
    
    if (!hasFocus) return
    
    // Wait for the editor to finish rendering
    await nextTick()
    
    // Get the new blocks after rendering
    const blocks = editorRef.value?.querySelectorAll('.ce-block')
    if (!blocks || blocks.length === 0) return
    
    // Find the block to focus on
    let targetBlockIndex = blockIndex
    if (targetBlockIndex >= blocks.length) {
      targetBlockIndex = blocks.length - 1
    }
    if (targetBlockIndex < 0) {
      targetBlockIndex = 0
    }
    
    const targetBlock = blocks[targetBlockIndex]
    if (targetBlock) {
      // Find the contenteditable element within the block
      const contentElement = targetBlock.querySelector('[contenteditable="true"]')
      
      if (contentElement) {
        contentElement.focus()
        
        // Restore precise cursor position
        if (hasSelection && selectionStart !== selectionEnd) {
          // Restore selection
          const startSet = setTextOffset(contentElement, selectionStart)
          if (startSet) {
            const selection = window.getSelection()
            const range = selection.getRangeAt(0)
            const endNode = range.startContainer
            const endOffset = range.startOffset
            
            // Extend selection to end position
            const walker = document.createTreeWalker(
              contentElement,
              NodeFilter.SHOW_TEXT,
              null,
              false
            )
            
            let currentOffset = selectionStart
            let currentNode = endNode
            
            // Find the end position
            while (currentNode && currentOffset < selectionEnd) {
              const remaining = selectionEnd - currentOffset
              if (currentNode.textContent.length >= remaining) {
                range.setEnd(currentNode, remaining)
                break
              }
              currentOffset += currentNode.textContent.length
              currentNode = walker.nextNode()
            }
            
            selection.removeAllRanges()
            selection.addRange(range)
          }
        } else {
          // Restore single cursor position
          if (textOffset !== undefined) {
            setTextOffset(contentElement, textOffset)
          }
        }
      }
    }
  } catch (error) {
    console.warn('Failed to restore cursor position:', error)
    
    // Fallback to simple focus
    try {
      const blocks = editorRef.value?.querySelectorAll('.ce-block')
      if (blocks && savedState.blockIndex < blocks.length) {
        const targetBlock = blocks[savedState.blockIndex]
        const contentElement = targetBlock?.querySelector('[contenteditable="true"]')
        if (contentElement) {
          contentElement.focus()
        }
      }
    } catch (fallbackError) {
      console.warn('Fallback cursor restoration also failed:', fallbackError)
    }
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
    if (state.user && state.activeBlockId !== undefined && clientId !== awareness.clientID) {
      const blockId = state.activeBlockId
      if (!blocks[blockId]) {
        blocks[blockId] = []
      }
      blocks[blockId].push({
        user: state.user,
        clientId
      })
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
  
  if (blockIndex !== -1) {
    currentBlockId.value = blockIndex
    
    // Get detailed cursor position if available
    try {
      const currentRange = editor.value?.caret?.getCurrentRange()
      const cursorData = {
        blockIndex,
        offset: currentRange?.offset || 0,
        hasSelection: currentRange ? (currentRange.startOffset !== currentRange.endOffset) : false
      }
      
      // Update awareness with detailed cursor position
      awareness.setLocalStateField('activeBlockId', blockIndex)
      awareness.setLocalStateField('cursorPosition', cursorData)
    } catch (error) {
      // Fallback to just block tracking
      awareness.setLocalStateField('activeBlockId', blockIndex)
    }
  }
}

function updateBlockIndicators() {
  if (!editorRef.value) return
  
  const blocks = editorRef.value.querySelectorAll('.ce-block')
  
  // Track which blocks currently have indicators
  const activeBlockIds = new Set(Object.keys(activeBlocks.value).map(id => parseInt(id)))
  
  // Remove indicators for blocks that are no longer active
  blocks.forEach((blockElement, index) => {
    const existingIndicator = blockElement.querySelector('.block-user-indicator')
    if (existingIndicator && !activeBlockIds.has(index)) {
      existingIndicator.remove()
    }
  })
  
  // Update or create indicators for active blocks
  Object.entries(activeBlocks.value).forEach(([blockId, usersArray]) => {
    const blockIndex = parseInt(blockId)
    const blockElement = blocks[blockIndex]
    
    if (!blockElement || usersArray.length === 0) return
    
    let indicator = blockElement.querySelector('.block-user-indicator')
    
    // Create indicator if it doesn't exist
    if (!indicator) {
      indicator = document.createElement('div')
      indicator.className = 'block-user-indicator'
      blockElement.style.position = 'relative'
      blockElement.appendChild(indicator)
    }
    
    // Update indicator styling and content
    if (usersArray.length === 1) {
      // Single user - use their color
      indicator.style.background = usersArray[0].user.color
      indicator.title = `${usersArray[0].user.name} is editing this block`
      indicator.classList.remove('multiple-users')
    } else {
      // Multiple users - create gradient and list all names
      const colors = usersArray.map(userData => userData.user.color)
      const names = usersArray.map(userData => userData.user.name)
      
      if (colors.length === 2) {
        indicator.style.background = `linear-gradient(45deg, ${colors[0]} 50%, ${colors[1]} 50%)`
      } else {
        // For 3+ users, create a multi-stop gradient
        const stops = colors.map((color, index) => {
          const percentage = (index / colors.length) * 100
          const nextPercentage = ((index + 1) / colors.length) * 100
          return `${color} ${percentage}%, ${color} ${nextPercentage}%`
        }).join(', ')
        indicator.style.background = `linear-gradient(45deg, ${stops})`
      }
      
      indicator.title = `Multiple users editing: ${names.join(', ')}`
      indicator.classList.add('multiple-users')
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
  cursor: help;
}

/* Multiple users indicator styling */
:deep(.block-user-indicator.multiple-users) {
  border: 3px solid white;
  width: 14px;
  height: 14px;
  animation: multiUserPulse 1.5s infinite;
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

@keyframes multiUserPulse {
  0%, 100% { 
    opacity: 1;
    transform: translateY(-50%) scale(1) rotate(0deg);
  }
  50% { 
    opacity: 0.8;
    transform: translateY(-50%) scale(1.15) rotate(180deg);
  }
}

/* Ensure blocks have space for indicators */
:deep(.ce-block) {
  position: relative;
  margin-left: 30px;
}
</style>
