<template>
  <div class="selector">
    <header class="selector__header">
      <h1>Realtime Editor</h1>
      <p>Collaborative editing on Yjs — open the same document in two windows to try it.</p>
    </header>

    <form class="card" @submit.prevent="start">
      <fieldset class="modes">
        <legend>Editor</legend>
        <label class="mode" :class="{ 'mode--active': mode === 'plain' }">
          <input v-model="mode" type="radio" name="mode" value="plain" />
          <span class="mode__title">Plain text</span>
          <span class="mode__desc">
            CodeMirror 6 with character-level merging, remote carets and selections.
          </span>
        </label>
        <label class="mode" :class="{ 'mode--active': mode === 'rich' }">
          <input v-model="mode" type="radio" name="mode" value="rich" />
          <span class="mode__title">Rich text</span>
          <span class="mode__desc">
            Editor.js blocks (headings, paragraphs, lists) shared block-by-block.
          </span>
        </label>
      </fieldset>

      <div class="field">
        <label for="docId">Document ID</label>
        <div class="field__row">
          <input
            id="docId"
            v-model.trim="docId"
            class="input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="e.g. team-notes"
            :aria-invalid="docId && !valid"
          />
          <button class="btn btn--ghost" type="button" @click="docId = generateDocumentId()">
            Random
          </button>
        </div>
        <p class="field__help" :class="{ 'field__help--error': docId && !valid }">
          Anyone who opens the same ID joins the same document. Letters, numbers, <code>.</code>
          <code>_</code> <code>-</code>; up to 100 characters.
        </p>
      </div>

      <button class="btn btn--primary" type="submit" :disabled="!valid">Open document</button>
    </form>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { generateDocumentId } from '../lib/user.js'
import { isValidDocId } from '../lib/config.js'

const emit = defineEmits(['open'])

const mode = ref('rich')
const docId = ref('demo')
const valid = computed(() => isValidDocId(docId.value))

function start() {
  if (!valid.value) return
  emit('open', { mode: mode.value, docId: docId.value })
}
</script>

<style scoped>
.selector {
  max-width: 640px;
  margin: 0 auto;
}
.selector__header {
  text-align: center;
  margin: 24px 0 28px;
}
.selector__header h1 {
  font-size: 2rem;
  margin-bottom: 6px;
}
.selector__header p {
  color: var(--text-muted);
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 24px;
  display: grid;
  gap: 22px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
}

.modes {
  border: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.modes legend {
  font-weight: 600;
  margin-bottom: 10px;
}
.mode {
  display: grid;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.mode input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.mode--active {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.mode__title {
  font-weight: 600;
}
.mode__desc {
  font-size: 13px;
  color: var(--text-muted);
}

.field {
  display: grid;
  gap: 6px;
}
.field label {
  font-weight: 600;
}
.field__row {
  display: flex;
  gap: 8px;
}
.field__help {
  font-size: 13px;
  color: var(--text-muted);
}
.field__help--error {
  color: #e03131;
}
.field__help code {
  background: var(--surface-muted);
  padding: 0 4px;
  border-radius: 3px;
}

@media (max-width: 560px) {
  .modes {
    grid-template-columns: 1fr;
  }
}
</style>
