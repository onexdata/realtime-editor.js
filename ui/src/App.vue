<template>
  <main class="page">
    <template v-if="session">
      <div class="topbar">
        <button class="btn btn--ghost" type="button" @click="leave">← All documents</button>
      </div>
      <PlainTextEditor
        v-if="session.mode === 'plain'"
        :key="`plain:${session.docId}`"
        :document-id="session.docId"
      />
      <RichTextEditor v-else :key="`rich:${session.docId}`" :document-id="session.docId" />
    </template>
    <DocumentSelector v-else @open="open" />
  </main>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue'
import DocumentSelector from './components/DocumentSelector.vue'
import { isValidDocId } from './lib/config.js'

// Each editor pulls in its own heavy dependency (CodeMirror / Editor.js);
// load only the one that is actually opened.
const PlainTextEditor = defineAsyncComponent(() => import('./components/PlainTextEditor.vue'))
const RichTextEditor = defineAsyncComponent(() => import('./components/RichTextEditor.vue'))

/** { mode: 'plain' | 'rich', docId: string } | null */
const session = ref(null)

function sessionFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const docId = params.get('doc') || ''
  const mode = params.get('mode') === 'plain' ? 'plain' : 'rich'
  return isValidDocId(docId) ? { mode, docId } : null
}

function open({ mode, docId }) {
  session.value = { mode, docId }
  const url = new URL(window.location.href)
  url.searchParams.set('doc', docId)
  url.searchParams.set('mode', mode)
  window.history.pushState(null, '', url)
  document.title = `${docId} · Realtime Editor`
}

function leave() {
  session.value = null
  const url = new URL(window.location.href)
  url.searchParams.delete('doc')
  url.searchParams.delete('mode')
  window.history.pushState(null, '', url)
  document.title = 'Realtime Editor'
}

function onPopState() {
  session.value = sessionFromUrl()
}

onMounted(() => {
  session.value = sessionFromUrl()
  if (session.value) document.title = `${session.value.docId} · Realtime Editor`
  window.addEventListener('popstate', onPopState)
})
onBeforeUnmount(() => window.removeEventListener('popstate', onPopState))
</script>
