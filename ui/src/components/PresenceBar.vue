<template>
  <div class="presence">
    <div class="presence__left">
      <span class="status" :class="`status--${status}`" :title="statusTitle">
        <span class="status__dot"></span>
        {{ statusLabel }}
      </span>
      <span class="doc-chip" :title="docId">
        <span class="doc-chip__mode">{{ mode === 'plain' ? 'Plain text' : 'Rich text' }}</span>
        <code>{{ docId }}</code>
      </span>
      <button class="btn btn--ghost btn--sm" type="button" @click="copyLink">
        {{ copied ? 'Link copied ✓' : 'Copy link' }}
      </button>
    </div>

    <div class="presence__right">
      <div class="avatars">
        <span
          v-for="peer in peers"
          :key="peer.clientId"
          class="avatar"
          :class="{ 'avatar--typing': peer.typing }"
          :style="{ background: peer.color }"
          :title="peer.typing ? `${peer.name} is typing…` : peer.name"
        >
          {{ peer.name }}
          <span v-if="peer.typing" class="avatar__typing">✎</span>
        </span>
        <span v-if="peers.length === 0" class="avatars__empty">No one else here yet</span>
      </div>

      <form class="me" @submit.prevent="commitName">
        <span class="me__swatch" :style="{ background: user.color }"></span>
        <input
          v-if="editing"
          ref="nameInput"
          v-model="draft"
          class="me__input"
          maxlength="40"
          @blur="commitName"
          @keydown.esc.prevent="cancelEdit"
        />
        <button v-else class="me__name" type="button" title="Change your display name" @click="startEdit">
          {{ user.name }} <span class="me__edit">✎</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'

const props = defineProps({
  docId: { type: String, required: true },
  mode: { type: String, required: true },
  user: { type: Object, required: true },
  peers: { type: Array, required: true },
  status: { type: String, required: true },
  synced: { type: Boolean, required: true },
})
const emit = defineEmits(['rename'])

const statusLabel = computed(() => {
  if (props.status === 'connected') return props.synced ? 'Live' : 'Syncing…'
  if (props.status === 'connecting') return 'Connecting…'
  return 'Offline — reconnecting'
})
const statusTitle = computed(() =>
  props.status === 'connected'
    ? 'Connected to the collaboration server'
    : 'Edits are kept locally and merged when the connection returns',
)

const copied = ref(false)
async function copyLink() {
  const url = new URL(window.location.href)
  url.searchParams.set('doc', props.docId)
  url.searchParams.set('mode', props.mode)
  try {
    await navigator.clipboard.writeText(url.toString())
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    window.prompt('Copy this link', url.toString())
  }
}

const editing = ref(false)
const draft = ref('')
const nameInput = ref(null)
async function startEdit() {
  draft.value = props.user.name
  editing.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}
function commitName() {
  if (!editing.value) return
  editing.value = false
  if (draft.value.trim() && draft.value.trim() !== props.user.name) emit('rename', draft.value)
}
function cancelEdit() {
  editing.value = false
}
</script>

<style scoped>
.presence {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.presence__left,
.presence__right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
}
.status__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #adb5bd;
}
.status--connected .status__dot {
  background: #2f9e44;
  box-shadow: 0 0 0 3px rgba(47, 158, 68, 0.2);
}
.status--connecting .status__dot {
  background: #f08c00;
  animation: pulse 1s infinite;
}
.status--disconnected .status__dot {
  background: #e03131;
  animation: pulse 1s infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}

.doc-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.doc-chip__mode {
  color: var(--text-muted);
}
.doc-chip code {
  background: var(--surface-muted);
  border: 1px solid var(--border);
  padding: 2px 8px;
  border-radius: 6px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.avatars {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.avatars__empty {
  font-size: 13px;
  color: var(--text-muted);
}
.avatar {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  transition: box-shadow 0.2s;
}
.avatar--typing {
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.avatar__typing {
  animation: pulse 0.8s infinite;
}

.me {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-left: 10px;
  border-left: 1px solid var(--border);
}
.me__swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.me__name {
  background: none;
  border: none;
  padding: 2px 4px;
  font: inherit;
  font-size: 13px;
  color: var(--text);
  cursor: text;
  border-radius: 4px;
}
.me__name:hover {
  background: var(--surface-muted);
}
.me__edit {
  color: var(--text-muted);
  font-size: 11px;
}
.me__input {
  font: inherit;
  font-size: 13px;
  padding: 2px 6px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  width: 160px;
}
</style>
