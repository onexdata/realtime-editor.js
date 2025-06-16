<template>
  <div id="app">
    <div v-if="!currentSession" class="app-container">
      <DocumentSelector @start-editing="startEditing" />
    </div>
    
    <div v-else class="app-container">
      <div class="session-header">
        <div class="session-info">
          <h4>{{ currentSession.editorType === 'plain' ? 'Plain Text' : 'Rich Text' }} Editor</h4>
          <span class="document-id">Document: {{ currentSession.documentId }}</span>
        </div>
        <button @click="endSession" class="end-session-button">
          ← Back to Selector
        </button>
      </div>
      
      <PlainTextEditor 
        v-if="currentSession.editorType === 'plain'"
        :document-id="currentSession.documentId"
      />
      
      <RichTextEditor 
        v-if="currentSession.editorType === 'rich'"
        :document-id="currentSession.documentId"
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import DocumentSelector from './components/DocumentSelector.vue'
import PlainTextEditor from './components/PlainTextEditor.vue'
import RichTextEditor from './components/RichTextEditor.vue'

const currentSession = ref(null)

function startEditing(sessionData) {
  currentSession.value = sessionData
}

function endSession() {
  currentSession.value = null
}
</script>

<style>
#app {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app-container {
  min-height: 100vh;
  padding: 2rem;
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.95);
  padding: 1rem 2rem;
  border-radius: 12px;
  margin-bottom: 2rem;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
}

.session-info h4 {
  margin: 0 0 0.25rem 0;
  color: #333;
  font-size: 1.2rem;
}

.document-id {
  color: #666;
  font-size: 0.9rem;
  font-family: 'Courier New', monospace;
  background: #f8f9fa;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.end-session-button {
  background: #6c757d;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.3s ease;
}

.end-session-button:hover {
  background: #5a6268;
}

@media (max-width: 768px) {
  .app-container {
    padding: 1rem;
  }
  
  .session-header {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }
}
</style>
