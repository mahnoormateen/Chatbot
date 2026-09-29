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

/** Free text search over the conversation titles. */
const query = ref('')

/** Conversation awaiting confirmation before it is deleted. */
const confirmDelete = ref<ApiConversation | null>(null)

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

function confirmRemove() {
  const target = confirmDelete.value
  confirmDelete.value = null
  if (target) emit('remove', target.id)
}

type ConversationGroup = { label: string; conversations: ApiConversation[] }

/** Midnight timestamps, so "Today" does not drift by the clock time. */
function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * Titles that match the query. When a search is active the flat list is
 * shown without date groups, because a match mid-title reads oddly under
 * a "yesterday" header.
 */
const filteredConversations = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return props.conversations
  return props.conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(needle)
  )
})

/** Conversations bucketed by how recently they were updated. */
const groups = computed<ConversationGroup[]>(() => {
  if (query.value.trim()) return []

  const today = dayStart(new Date())
  const buckets: { label: string; conversations: ApiConversation[] }[] = []
  const getBucket = (updatedAt: string) => {
    const days = Math.floor((today - dayStart(new Date(updatedAt))) / 86_400_000)
    if (days <= 0) return 0
    if (days === 1) return 1
    if (days < 7) return 2
    return 3
  }
  const labels = ['Today', 'Yesterday', 'Previous 7 days', 'Older']

  for (const conversation of props.conversations) {
    const index = getBucket(conversation.updatedAt)
    const existing = buckets[index]
    if (existing) existing.conversations.push(conversation)
    else buckets[index] = { label: labels[index] ?? '', conversations: [conversation] }
  }

  // Buckets can be sparse (no "Yesterday"); fill from latest to oldest.
  return buckets
    .filter((bucket) => bucket !== undefined)
    .sort((a, b) => labels.indexOf(a.label) - labels.indexOf(b.label))
})
</script>

<template>
  <aside class="sidebar">
    <button class="btn btn-primary new" type="button" @click="emit('create')">
      <span aria-hidden="true">+</span>
      New conversation
    </button>

    <label class="search">
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
      </svg>
      <input
        v-model="query"
        type="search"
        placeholder="Search conversations"
        aria-label="Search conversations"
      />
    </label>

    <nav class="list" aria-label="Conversations">
      <p v-if="loading" class="hint">Loading...</p>
      <p v-else-if="!props.conversations.length" class="hint">No conversations yet.</p>
      <p v-else-if="query.trim() && !filteredConversations.length" class="hint">
        No titles match “{{ query }}”.
      </p>

      <template v-else>
        <template v-if="groups.length">
          <section v-for="group in groups" :key="group.label" class="group">
            <p class="group-label">{{ group.label }}</p>
            <ul>
              <li v-for="conversation in group.conversations" :key="conversation.id">
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
                        @click="confirmDelete = conversation"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
                      </button>
                    </div>
                  </template>
                </div>
              </li>
            </ul>
          </section>
        </template>

        <ul v-else class="flat">
          <li v-for="conversation in filteredConversations" :key="conversation.id">
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
                    @click="confirmDelete = conversation"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
                  </button>
                </div>
              </template>
            </div>
          </li>
        </ul>
      </template>
    </nav>

    <Teleport to="body">
      <div
        v-if="confirmDelete"
        class="backdrop"
        role="presentation"
        @mousedown.self="confirmDelete = null"
      >
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <h3 id="delete-title">Delete this conversation?</h3>
          <p>
            “<strong>{{ confirmDelete.title }}</strong>” and any attached
            files will be removed. This cannot be undone.
          </p>
          <div class="dialog-actions">
            <button class="btn" type="button" @click="confirmDelete = null">Cancel</button>
            <button class="btn btn-danger" type="button" @click="confirmRemove">Delete</button>
          </div>
        </div>
      </div>
    </Teleport>
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

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-faint);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
  color: var(--text-muted);
}

.search input {
  min-width: 0;
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13.5px;
}

.search input::placeholder {
  color: var(--text-faint);
}

.search input::-webkit-search-cancel-button {
  cursor: pointer;
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

.group-label {
  margin: 0;
  padding: 10px 10px 4px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.group + .group {
  margin-top: 4px;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

ul.flat {
  margin-top: 4px;
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

/* Delete confirmation dialog, shown over the whole app. */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.45);
}

.dialog {
  width: min(420px, 100%);
  padding: 20px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg-raised);
  box-shadow: 0 18px 50px var(--shadow-color);
  animation: dialog-in 0.18s ease both;
}

.dialog h3 {
  margin: 0 0 8px;
  font-size: 16px;
}

.dialog p {
  margin: 0 0 18px;
  font-size: 14px;
  color: var(--text-muted);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>