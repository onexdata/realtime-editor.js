<template>
  <div class="editor-shell">
    <PresenceBar
      :doc-id="documentId"
      mode="plain"
      :user="user"
      :peers="peers"
      :status="status"
      :synced="synced"
      @rename="setUserName"
    />
    <div ref="host" class="plain-editor" :class="{ 'is-offline': status !== 'connected' }"></div>
    <p class="hint">
      Every keystroke is merged character-by-character with Yjs. Remote carets and selections are
      shown in each collaborator's colour. Undo (<kbd>Ctrl/⌘ Z</kbd>) only reverts your own changes.
    </p>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as Y from 'yjs'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  placeholder,
} from '@codemirror/view'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
// (history is provided by Y.UndoManager via yUndoManagerKeymap, not @codemirror/commands)
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import { useCollab } from '../composables/useCollab.js'
import PresenceBar from './PresenceBar.vue'

const props = defineProps({
  documentId: { type: String, required: true },
})

const host = ref(null)
const { ydoc, awareness, user, peers, status, synced, setUserName, markTyping } = useCollab(
  props.documentId,
)

const ytext = ydoc.getText('content')
const undoManager = new Y.UndoManager(ytext)
let view = null

onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: ytext.toString(),
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        EditorView.lineWrapping,
        placeholder('Start typing — everyone on this document sees it live.'),
        keymap.of([...yUndoManagerKeymap, ...defaultKeymap, indentWithTab]),
        yCollab(ytext, awareness, { undoManager }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) markTyping()
        }),
      ],
    }),
  })
})

onBeforeUnmount(() => {
  view?.destroy()
  undoManager.destroy()
})
</script>

<style>
.plain-editor .cm-editor {
  min-height: 420px;
  font-size: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.2s;
}
.plain-editor .cm-editor.cm-focused {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.plain-editor .cm-scroller {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  line-height: 1.6;
}
.plain-editor .cm-content {
  padding: 12px 0;
}
.plain-editor .cm-gutters {
  background: var(--surface-muted);
  border-right: 1px solid var(--border);
  color: var(--text-muted);
}
.plain-editor.is-offline .cm-editor {
  border-style: dashed;
}
/* y-codemirror.next remote caret tweaks */
.plain-editor .cm-ySelectionInfo {
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  opacity: 1;
  transition: none;
}
</style>
