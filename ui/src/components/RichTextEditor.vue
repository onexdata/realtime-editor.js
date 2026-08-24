<template>
  <div class="editor-shell">
    <PresenceBar
      :doc-id="documentId"
      mode="rich"
      :user="user"
      :peers="peers"
      :status="status"
      :synced="synced"
      @rename="setUserName"
    />

    <div class="rich-editor" :class="{ 'is-offline': status !== 'connected' }">
      <div v-if="!ready" class="rich-editor__loading">
        {{ status === 'connected' ? 'Loading document…' : 'Connecting to server…' }}
      </div>
      <div ref="holder" class="rich-editor__holder" :class="{ hidden: !ready }"></div>

      <!-- Per-block presence badges, positioned over the block a peer is editing -->
      <div class="block-badges" aria-hidden="true">
        <div
          v-for="badge in badges"
          :key="badge.key"
          class="block-badge"
          :style="{ top: badge.top + 'px', background: badge.color }"
          :title="badge.names.join(', ')"
        >
          {{ badge.label }}
        </div>
      </div>
    </div>

    <p class="hint">
      Blocks are shared individually through Yjs: people editing different blocks never conflict.
      If two people edit the <em>same</em> block at the same instant, the last edit wins for that
      block only.
    </p>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import EditorJS from '@editorjs/editorjs'
import Header from '@editorjs/header'
import Paragraph from '@editorjs/paragraph'
import List from '../lib/list-tool.js'
import { useCollab } from '../composables/useCollab.js'
import { EditorJsBinding, BLOCKS_KEY, blocksFromYArray, focusedBlockId } from '../lib/editorjs-binding.js'
import PresenceBar from './PresenceBar.vue'

const props = defineProps({
  documentId: { type: String, required: true },
})

const holder = ref(null)
const ready = ref(false)
const { ydoc, awareness, user, peers, status, synced, setUserName, markTyping } = useCollab(
  props.documentId,
)
const yblocks = ydoc.getArray(BLOCKS_KEY)

let editor = null
let binding = null
let resizeObserver = null

// ----------------------------------------------------------------- lifecycle

onMounted(() => {
  // Create the editor once the initial document state has arrived so the
  // first paint already shows the shared content.
  const stop = watch(
    synced,
    async (isSynced) => {
      if (!isSynced) return
      stop()
      await initEditor()
    },
    { immediate: true },
  )
})

async function initEditor() {
  const blocks = blocksFromYArray(yblocks)
  editor = new EditorJS({
    holder: holder.value,
    minHeight: 200,
    placeholder: 'Start writing — press Tab for block types.',
    data: blocks.length ? { blocks } : undefined,
    tools: {
      header: {
        class: Header,
        inlineToolbar: true,
        config: { placeholder: 'Heading', levels: [1, 2, 3, 4], defaultLevel: 2 },
      },
      paragraph: { class: Paragraph, inlineToolbar: true },
      list: { class: List, inlineToolbar: true, config: { defaultStyle: 'unordered' } },
    },
    onChange: (api, events) => {
      binding?.handleLocalChange(api, events)
      markTyping()
      scheduleBadgeLayout()
    },
  })
  await editor.isReady
  binding = new EditorJsBinding(editor, yblocks, {
    holder: holder.value,
    onAfterRemoteApply: scheduleBadgeLayout,
  })
  ready.value = true

  // Dev convenience: inspect the live editor from the browser console.
  if (import.meta.env.DEV) window.__editor = editor

  document.addEventListener('selectionchange', onSelectionChange)
  // The binding syncs typing from raw input events (faster than Editor.js's
  // debounced onChange) — drive the typing indicator from the same signal.
  holder.value.addEventListener('input', onLocalInput)
  resizeObserver = new ResizeObserver(() => {
    updateNarrowMode()
    scheduleBadgeLayout()
  })
  resizeObserver.observe(holder.value)
  await nextTick()
  scheduleBadgeLayout()
}

function onLocalInput() {
  markTyping()
  scheduleBadgeLayout()
}

/**
 * Editor.js only ever *adds* its narrow-mode class (at initialisation) and
 * never removes it, so growing the viewport leaves the +/⋮⋮ toolbar stuck in
 * its mobile position until the next interaction. Keep the class in sync with
 * the actual width ourselves and hide the stale toolbar when the mode flips.
 */
const NARROW_BREAKPOINT = 650
function updateNarrowMode() {
  const wrapper = holder.value?.querySelector('.codex-editor')
  if (!wrapper) return
  const shouldBeNarrow = holder.value.offsetWidth < NARROW_BREAKPOINT
  if (wrapper.classList.contains('codex-editor--narrow') !== shouldBeNarrow) {
    wrapper.classList.toggle('codex-editor--narrow', shouldBeNarrow)
    try {
      editor?.toolbar?.close()
    } catch {
      /* toolbar may not be ready yet */
    }
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', onSelectionChange)
  holder.value?.removeEventListener('input', onLocalInput)
  resizeObserver?.disconnect()
  binding?.destroy()
  if (editor?.destroy) editor.destroy()
})

// ------------------------------------------------------------------ presence

let lastFocusedBlock = null
function onSelectionChange() {
  const id = focusedBlockId(holder.value)
  if (id === lastFocusedBlock) return
  lastFocusedBlock = id
  awareness.setLocalStateField('block', id)
}

/** Block positions (top offset inside the holder) for badge placement. */
const blockTops = ref({})
let layoutTimer = null
function scheduleBadgeLayout() {
  clearTimeout(layoutTimer)
  layoutTimer = setTimeout(measureBlocks, 60)
}
function measureBlocks() {
  if (!holder.value) return
  const origin = holder.value.getBoundingClientRect().top
  const tops = {}
  holder.value.querySelectorAll('.ce-block[data-id]').forEach((el) => {
    tops[el.dataset.id] = el.getBoundingClientRect().top - origin
  })
  blockTops.value = tops
}

watch(peers, scheduleBadgeLayout)

const badges = computed(() => {
  const byBlock = new Map()
  for (const peer of peers.value) {
    if (!peer.block || blockTops.value[peer.block] === undefined) continue
    if (!byBlock.has(peer.block)) byBlock.set(peer.block, [])
    byBlock.get(peer.block).push(peer)
  }
  const list = []
  for (const [blockId, users] of byBlock) {
    const names = users.map((u) => u.name)
    list.push({
      key: blockId,
      top: blockTops.value[blockId],
      color: users[0].color,
      names,
      label: users.length === 1 ? names[0] : `${names[0]} +${users.length - 1}`,
    })
  }
  return list
})
</script>

<style>
.rich-editor {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 56px 8px 8px;
  min-height: 420px;
  transition: border-color 0.2s;
}
.rich-editor.is-offline {
  border-style: dashed;
}
.rich-editor__loading {
  padding: 48px 0;
  text-align: center;
  color: var(--text-muted);
}
.rich-editor__holder.hidden {
  visibility: hidden;
  height: 0;
  overflow: hidden;
}
.rich-editor .codex-editor__redactor {
  padding-bottom: 120px !important;
}
.rich-editor .ce-block__content,
.rich-editor .ce-toolbar__content {
  max-width: none;
}
.rich-editor .ce-toolbar__actions {
  right: -4px;
}

.block-badges {
  position: absolute;
  top: 8px;
  right: 8px;
  bottom: 0;
  width: 0;
  pointer-events: none;
}
.block-badge {
  position: absolute;
  right: 0;
  transform: translateY(2px);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding: 4px 7px;
  border-radius: 999px;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: top 0.12s ease-out;
}
</style>
