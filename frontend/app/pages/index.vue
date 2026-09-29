<script setup lang="ts">
/**
 * Gemini chat client.
 *
 * The browser only ever talks to the AdonisJS backend through
 * runtimeConfig.public.apiBase. The Gemini API key stays on the server:
 * this app has no knowledge of it and never sends one.
 */
import type { ChatMessage } from '~/composables/useChat'

const { user, isAuthenticated, logout, refresh } = useAuth()

const {
  conversations,
  activeId,
  activeConversation,
  messages,
  models,
  selectedModel,
  loadingConversations,
  loadingMessages,
  loadingModels,
  sending,
  sendPhase,
  activeModelName,
  error,
  canRetry,
  loadConversations,
  loadModels,
  openConversation,
  createConversation,
  deleteConversation,
  renameConversation,
  sendMessage,
  retryLastMessage,
  clearError,
  reset,
} = useChat()

/** False until the stored token has been validated, avoids a login flash. */
const ready = ref(false)
const showSidebar = ref(true)
const transcript = ref<HTMLElement | null>(null)

/**
 * Auto-following the stream. As soon as the user scrolls up the reading
 * position is theirs; it only re-attaches when they scroll back to the
 * bottom (or a new message is sent).
 */
const stickToBottom = ref(true)

async function loadEverything() {
  await Promise.all([loadConversations(), loadModels()])

  const mostRecent = conversations.value[0]
  if (mostRecent) await openConversation(mostRecent.id)
}

async function boot() {
  await refresh()
  ready.value = true
}

onMounted(boot)

/**
 * Loads the conversations and model list whenever a session starts.
 *
 * The auth panel used to signal a successful sign in/up with an
 * "authenticated" event. That wiring was racy: useAuth sets the session
 * state just before the event fires, which schedules the page re-render,
 * and Vue's scheduled render can unmount <AuthPanel> before the promise
 * continuation in its submit() reaches emit(). Vue then skips the emit
 * silently (an unmounted component cannot dispatch), so loadEverything
 * never ran and a freshly signed in user saw an empty conversation list.
 *
 * Watching the session state instead ties the initial load to the state
 * change itself, so it cannot be skipped by component lifetimes. The
 * false -> true edge fires once per real session: restored (boot), login
 * or register.
 */
watch(isAuthenticated, (signedIn, wasSignedIn) => {
  if (signedIn && !wasSignedIn) loadEverything()
})

async function onCreate() {
  await createConversation()
  if (window.innerWidth <= 760) showSidebar.value = false
}

async function signOut() {
  await logout()

  // Drop the transcript too, so the next person to sign in on this
  // browser never sees the previous conversation.
  reset()
}

/** Keep the newest message in view as the reply streams in. */
async function scrollToBottom() {
  await nextTick()
  const element = transcript.value
  if (element) element.scrollTop = element.scrollHeight
}

/** Whether the user is reading near the latest message again. */
function onTranscriptScroll() {
  const element = transcript.value
  if (!element) return
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight
  stickToBottom.value = distance < 90
}

function jumpToBottom() {
  stickToBottom.value = true
  scrollToBottom()
}

// A fresh conversation always starts pinned to the bottom.
watch(activeId, () => {
  stickToBottom.value = true
  scrollToBottom()
})

// New messages (sent or loaded) always pull the view back to the bottom;
// during streaming the transcript only follows while still pinned there.
watch(
  () => messages.value.length,
  (count, previous) => {
    if (typeof previous === 'number' && count > previous) {
      stickToBottom.value = true
      scrollToBottom()
    }
  }
)

watch(
  () => messages.value.map((message) => message.content.length).join(','),
  () => {
    if (stickToBottom.value) scrollToBottom()
  }
)

onMounted(scrollToBottom)

/** A transcript row is either a date separator or a message. */
type TranscriptRow =
  | { kind: 'separator'; label: string; key: string }
  | { kind: 'message'; message: ChatMessage; key: string }

function dayKey(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function dayLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const startOfDay = (input: Date) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime()

  const daysAgo = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
  if (daysAgo <= 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  if (daysAgo < 7) return date.toLocaleDateString(undefined, { weekday: 'long' })
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** Messages with a friendly separator inserted whenever the day changes. */
const rows = computed<TranscriptRow[]>(() => {
  const transcript: TranscriptRow[] = []

  let lastDay = ''
  for (const message of messages.value) {
    const day = dayKey(message.createdAt)
    if (day && day !== lastDay) {
      lastDay = day
      transcript.push({ kind: 'separator', label: dayLabel(message.createdAt), key: `sep-${day}` })
    }
    transcript.push({
      kind: 'message',
      message,
      key: `msg-${message.id}`,
    })
  }

  return transcript
})

/** The welcome screen is replaced the moment the first message is sent. */
const hasMessages = computed(() => messages.value.length > 0)

/** Starter prompts on the welcome screen simply become a message. */
function onPrompt(prompt: string) {
  sendMessage(prompt)
}
</script>

<template>
  <div v-if="!ready" class="boot">
    <span class="spinner" aria-hidden="true" />
  </div>

  <AuthPanel v-else-if="!isAuthenticated" />

  <div v-else class="layout">
    <ChatSidebar
      v-show="showSidebar"
      :conversations="conversations"
      :active-id="activeId"
      :loading="loadingConversations"
      @select="openConversation"
      @create="onCreate"
      @remove="deleteConversation"
      @rename="renameConversation"
    />

    <main class="main">
      <header class="topbar">
        <button
          class="btn-ghost toggle"
          type="button"
          :aria-expanded="showSidebar"
          @click="showSidebar = !showSidebar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          <span class="sr-only">Toggle conversation list</span>
        </button>

        <h1 class="heading">{{ activeConversation?.title ?? 'New conversation' }}</h1>

        <ModelPicker
          v-model="selectedModel"
          :models="models"
          :disabled="sending"
          :loading="loadingModels"
        />

        <ThemeToggle />

        <div class="account">
          <span class="account-avatar" aria-hidden="true">{{ user?.initials }}</span>
          <span class="name">{{ user?.fullName || user?.email }}</span>
          <button class="btn-ghost" type="button" @click="signOut">Sign out</button>
        </div>
      </header>

      <div ref="transcript" class="transcript" @scroll="onTranscriptScroll">
        <div v-if="loadingMessages" class="skeletons" aria-hidden="true">
          <div class="skeleton skeleton-short" />
          <div class="skeleton" />
          <div class="skeleton skeleton-mid" />
        </div>

        <ChatWelcome v-else-if="!hasMessages" @send="onPrompt" />

        <template v-for="row in rows" :key="row.key">
          <div v-if="row.kind === 'separator'" class="day" aria-hidden="true">
            <span>{{ row.label }}</span>
          </div>
          <ChatMessageItem
            v-else
            :message="row.message"
            :user-initials="user?.initials"
          />
        </template>
      </div>

      <button
        v-if="hasMessages && !stickToBottom"
        class="jump"
        type="button"
        aria-label="Scroll to the latest message"
        title="Scroll to latest"
        @click="jumpToBottom"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
        <span class="sr-only">Scroll to latest</span>
      </button>

      <footer class="composer-wrap">
        <ErrorBanner
          v-if="error"
          :error="error"
          :retryable="error.retryable && canRetry"
          @dismiss="clearError"
          @retry="retryLastMessage"
        />

        <ChatComposer
          :sending="sending"
          :phase="sendPhase"
          :model="activeModelName"
          @send="sendMessage"
        />
      </footer>
    </main>
  </div>
</template>

<style scoped>
.boot {
  min-height: 100vh;
  display: grid;
  place-items: center;
  color: var(--text-faint);
}

.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated);
}

.toggle {
  font-size: 16px;
  line-height: 1;
}

.heading {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
}

.account-avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
}

.name {
  max-width: 160px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.transcript {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px 18px;
}

/* Day separator pinned between the surrounding bubbles. */
.day {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 2px 0;
  color: var(--text-faint);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.day::before,
.day::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.day span {
  white-space: nowrap;
}

/* Floating button that brings the reader back to the live end. */
.jump {
  position: absolute;
  right: 28px;
  bottom: 116px;
  z-index: 5;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  background: var(--bg-raised);
  color: var(--text-muted);
  box-shadow: 0 8px 24px var(--shadow-color);
  transition: color 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
  animation: rise 0.18s ease both;
}

.jump:hover {
  color: var(--accent-strong);
  border-color: var(--accent-border);
  transform: translateY(-2px);
}

.composer-wrap {
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
}

.composer-wrap .alert {
  margin-bottom: 10px;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 760px) {
  .name {
    display: none;
  }
}
</style>