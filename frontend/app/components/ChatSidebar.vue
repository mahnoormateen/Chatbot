<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { ApiConversation } from '~/types/api'

const props = defineProps<{
  conversations: ApiConversation[]
  activeId: number | null
  loading: boolean
}>()

const emit = defineEmits<{
  select: [id: number]
  create: []
  remove: [id: number]
  rename: [id: number, title: string]
}>()

const editingId = ref<number | null>(null)
const draftTitle = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

/**
 * Callback ref for the rename input. A plain "ref" here would be typed as
 * an array because the input lives inside a v-for, and renameInput.value
 * would then be an array instead of the element, breaking the .focus()
 * call that follows next tick.
 */
function setRenameInput(element: Element | ComponentPublicInstance | null) {
  renameInput.value = element instanceof HTMLInputElement ? element : null
}

async function startRename(conversation: ApiConversation) {
  editingId.value = conversation.id
  draftTitle.value = conversation.title

  // The input only exists after this tick, so focus it once rendered.
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

function commitRename(id: number) {
  const title = draftTitle.value
  editingId.value = null
  if (title.trim()) emit('rename', id, title)
}

function cancelRename() {
  editingId.value = null
}

/** "just now", "5m", "3h", then a date once it is more than a week old. */
function relativeTime(value: string): string {
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''

  const minutes = Math.floor((Date.now() - then) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / (60 * 24))}d`

  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <aside class="sidebar">
    <button class="btn btn-primary new" type="button" @click="emit('create')">
      <span aria-hidden="true">+</span>
      New conversation
    </button>

    <nav class="list" aria-label="Conversations">
      <p v-if="loading" class="hint">Loading...</p>
      <p v-else-if="!props.conversations.length" class="hint">No conversations yet.</p>

      <ul v-else>
        <li v-for="conversation in props.conversations" :key="conversation.id">
          <div class="row" :class="{ active: conversation.id === props.activeId }">
            <form
              v-if="editingId === conversation.id"
              class="rename"
              @submit.prevent="commitRename(conversation.id)"
            >
              <input
                :ref="setRenameInput"
                v-model="draftTitle"
                type="text"
                maxlength="120"
                aria-label="Conversation title"
                @blur="commitRename(conversation.id)"
                @keyup.escape="cancelRename"
              />
            </form>

            <template v-else>
              <button class="open" type="button" @click="emit('select', conversation.id)">
                <span class="title">{{ conversation.title }}</span>
                <span class="meta">
                  <span>{{ relativeTime(conversation.updatedAt) }}</span>
                  <span v-if="conversation.messageCount" aria-hidden="true">&middot;</span>
                  <span v-if="conversation.messageCount">{{ conversation.messageCount }} msg</span>
                </span>
              </button>

              <div class="actions">
                <button
                  class="btn-ghost"
                  type="button"
                  :aria-label="`Rename ${conversation.title}`"
                  title="Rename"
                  @click="startRename(conversation)"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button
                  class="btn-ghost danger"
                  type="button"
                  :aria-label="`Delete ${conversation.title}`"
                  title="Delete"
                  @click="emit('remove', conversation.id)"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
                </button>
              </div>
            </template>
          </div>
        </li>
      </ul>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-right: 1px solid var(--border);
  background: var(--bg-elevated);
  overflow: hidden;
}

.new {
  width: 100%;
}

.list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.hint {
  margin: 0;
  padding: 8px;
  color: var(--text-faint);
  font-size: 13px;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--radius);
  padding-right: 4px;
}

.row:hover {
  background: var(--bg-hover);
}

.row.active {
  background: var(--accent-soft);
}

.open {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 10px;
  text-align: left;
  border-radius: var(--radius);
}

.title {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  display: flex;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-faint);
}

.actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.row:hover .actions,
.row:focus-within .actions {
  opacity: 1;
}

.actions .btn-ghost {
  padding: 4px 6px;
  font-size: 12px;
  line-height: 1;
}

.actions .danger:hover {
  color: var(--danger);
}

.rename {
  flex: 1;
  padding: 4px;
}

.rename input {
  width: 100%;
  padding: 5px 8px;
  border-radius: 7px;
  border: 1px solid var(--accent);
  background: var(--bg);
  outline: none;
  font-size: 14px;
}
</style>
