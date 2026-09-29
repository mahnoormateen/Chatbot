<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { ApiConversation } from '~/types/api'

const props = defineProps<{
  conversations: ApiConversation[]
  activeId: number | null
  loading: boolean
  /** Name shown on the account row pinned to the bottom of the list. */
  userName: string
  /** Two letter monogram drawn in the account avatar. */
  userInitials: string
  /** Secondary line, so an account is identifiable at a glance. */
  userEmail: string
}>()

const emit = defineEmits<{
  select: [id: number]
  create: []
  remove: [id: number]
  rename: [id: number, title: string]
  signout: []
}>()

const editingId = ref<number | null>(null)
const draftTitle = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

/** Whether the account menu is expanded. */
const accountOpen = ref(false)
const accountRoot = ref<HTMLElement | null>(null)
const accountTrigger = ref<HTMLButtonElement | null>(null)

function toggleAccount() {
  accountOpen.value = !accountOpen.value
}

/** Closes the menu, returning focus to the trigger when it had focus. */
function closeAccount(restoreFocus = false) {
  if (!accountOpen.value) return
  accountOpen.value = false
  if (restoreFocus) accountTrigger.value?.focus()
}

function signOut() {
  closeAccount()
  emit('signout')
}

/**
 * A click anywhere outside the account row dismisses the menu. Pointer down
 * is used rather than click so the menu is already gone by the time the
 * click lands on whatever was underneath, which stops a tap on a
 * conversation from both selecting it and reopening the menu.
 */
function onDocumentPointerDown(event: PointerEvent) {
  if (!accountOpen.value) return
  if (accountRoot.value?.contains(event.target as Node)) return
  closeAccount()
}

/** Escape closes the menu and hands focus back to the trigger. */
function onDocumentKeydown(event: KeyboardEvent) {
  if (accountOpen.value && event.key === 'Escape') {
    event.stopPropagation()
    closeAccount(true)
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})

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

    <!--
      The account sits at the foot of the list rather than in the top bar,
      next to the content it belongs to. Its menu opens upwards because
      that is the only free space in a column filling the viewport.
    -->
    <div ref="accountRoot" class="account">
      <button
        ref="accountTrigger"
        class="account-trigger"
        type="button"
        :aria-expanded="accountOpen"
        aria-haspopup="true"
        aria-controls="account-popup"
        @click="toggleAccount"
      >
        <span class="account-avatar" aria-hidden="true">{{ props.userInitials }}</span>

        <span class="account-text">
          <span class="account-name">{{ props.userName }}</span>
          <span class="account-email">{{ props.userEmail }}</span>
        </span>

        <svg
          class="account-chevron"
          :class="{ open: accountOpen }"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      <!--
        A plain popup rather than role="menu": the trigger keeps focus and
        Tab walks into it, so claiming menu semantics would promise arrow
        key navigation that is not implemented.
      -->
      <div v-if="accountOpen" id="account-popup" class="account-menu">
        <button class="account-item" type="button" @click="signOut">
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Sign out</span>
        </button>
      </div>
    </div>

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

/* ------------------------------------------------------------------
   Account row, pinned to the foot of the list
   ------------------------------------------------------------------ */
.account {
  position: relative;
  flex: none;
  /* Only a hairline separates it from the list, so the row reads as part
     of the same column rather than as a second panel. */
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.account-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border-radius: var(--radius);
  text-align: left;
  transition: background 0.15s ease;
}

.account-trigger:hover,
.account-trigger[aria-expanded='true'] {
  background: var(--bg-hover);
}

.account-avatar {
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  color: var(--accent-strong);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

/* The name and email share a column and take the space left by the avatar. */
.account-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.account-name,
.account-email {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
}

.account-email {
  font-size: 11.5px;
  color: var(--text-faint);
}

.account-chevron {
  flex: none;
  color: var(--text-faint);
  transition: transform 0.18s ease, color 0.15s ease;
}

.account-chevron.open {
  transform: rotate(180deg);
  color: var(--text-muted);
}

/* Opens upward, anchored to the bottom of the row so it never covers the
   name it was opened from. */
.account-menu {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% - 2px);
  z-index: 20;
  padding: 4px;
  border-radius: var(--radius);
  border: 1px solid var(--border-strong);
  background: var(--bg-raised);
  box-shadow: 0 14px 38px var(--shadow-color);
  animation: account-in 0.14s ease both;
}

.account-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 7px;
  font-size: 13.5px;
  color: var(--text-muted);
  text-align: left;
  transition: background 0.15s ease, color 0.15s ease;
}

.account-item:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

@keyframes account-in {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
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