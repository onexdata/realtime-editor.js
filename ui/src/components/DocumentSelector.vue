<template>
  <div class="document-selector">
    <div class="selector-header">
      <h2>Collaborative Document Editor</h2>
      <p>Choose your editor type and start collaborating in real-time</p>
    </div>
    
    <div class="editor-types">
      <div class="editor-type-card">
        <h3>Plain Text Editor</h3>
        <p>Simple collaborative text editing with cursor tracking</p>
        <div class="features">
          <span class="feature">✨ Real-time collaboration</span>
          <span class="feature">👥 Live cursors</span>
          <span class="feature">🎨 User indicators</span>
        </div>
        <button 
          @click="selectEditor('plain')"
          class="select-button"
          :class="{ active: selectedEditor === 'plain' }"
        >
          Use Plain Text Editor
        </button>
      </div>
      
      <div class="editor-type-card">
        <h3>Rich Text Editor</h3>
        <p>Advanced collaborative editing with rich formatting</p>
        <div class="features">
          <span class="feature">📝 Rich text formatting</span>
          <span class="feature">👥 Live typing indicators</span>
          <span class="feature">🎯 Block-based editing</span>
        </div>
        <button 
          @click="selectEditor('rich')"
          class="select-button"
          :class="{ active: selectedEditor === 'rich' }"
        >
          Use Rich Text Editor
        </button>
      </div>
    </div>
    
    <div v-if="selectedEditor" class="document-options">
      <div class="document-id-section">
        <label for="documentId">Document ID:</label>
        <input 
          id="documentId"
          v-model="documentId" 
          type="text" 
          placeholder="Enter document ID or leave blank for new document"
          class="document-input"
        />
        <button @click="generateNewDocumentId" class="generate-button">
          Generate New ID
        </button>
      </div>
      
      <button @click="startEditing" class="start-button">
        Start Collaborating
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { generateDocumentId } from '../utils/userUtils.js'

const emit = defineEmits(['start-editing'])

const selectedEditor = ref('')
const documentId = ref('')

function selectEditor(type) {
  selectedEditor.value = type
  if (!documentId.value) {
    generateNewDocumentId()
  }
}

function generateNewDocumentId() {
  documentId.value = generateDocumentId()
}

function startEditing() {
  if (selectedEditor.value && documentId.value) {
    emit('start-editing', {
      editorType: selectedEditor.value,
      documentId: documentId.value
    })
  }
}
</script>

<style scoped>
.document-selector {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
}

.selector-header {
  text-align: center;
  margin-bottom: 3rem;
}

.selector-header h2 {
  color: #333;
  margin-bottom: 0.5rem;
  font-size: 2.5rem;
}

.selector-header p {
  color: #666;
  font-size: 1.2rem;
}

.editor-types {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  margin-bottom: 2rem;
}

.editor-type-card {
  background: white;
  border: 2px solid #e9ecef;
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  transition: all 0.3s ease;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.editor-type-card:hover {
  border-color: #45B7D1;
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}

.editor-type-card h3 {
  color: #333;
  margin-bottom: 1rem;
  font-size: 1.5rem;
}

.editor-type-card p {
  color: #666;
  margin-bottom: 1.5rem;
  line-height: 1.5;
}

.features {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 2rem;
}

.feature {
  color: #45B7D1;
  font-size: 0.9rem;
  font-weight: 500;
}

.select-button {
  background: #f8f9fa;
  border: 2px solid #e9ecef;
  color: #333;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
  width: 100%;
}

.select-button:hover {
  background: #e9ecef;
  border-color: #45B7D1;
}

.select-button.active {
  background: #45B7D1;
  border-color: #45B7D1;
  color: white;
}

.document-options {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 2rem;
  margin-top: 2rem;
}

.document-id-section {
  margin-bottom: 2rem;
}

.document-id-section label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #333;
}

.document-input {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  font-size: 1rem;
  margin-bottom: 1rem;
  outline: none;
  transition: border-color 0.3s ease;
}

.document-input:focus {
  border-color: #45B7D1;
}

.generate-button {
  background: #6c757d;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.3s ease;
}

.generate-button:hover {
  background: #5a6268;
}

.start-button {
  background: #28a745;
  color: white;
  border: none;
  padding: 1rem 2rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.1rem;
  font-weight: 600;
  width: 100%;
  transition: background-color 0.3s ease;
}

.start-button:hover {
  background: #218838;
}

@media (max-width: 768px) {
  .editor-types {
    grid-template-columns: 1fr;
  }
  
  .document-selector {
    padding: 1rem;
  }
  
  .selector-header h2 {
    font-size: 2rem;
  }
}
</style>
