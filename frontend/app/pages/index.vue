<script setup lang="ts">
/**
 * Gemini chat client.
 *
 * The browser only ever talks to the AdonisJS backend through
 * runtimeConfig.public.apiBase. The Gemini API key stays on the server:
 * this app has no knowledge of it and never sends one.
 */
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

watch(
  () => messages.value.map((message) => message.content.length).join(','),
  scrollToBottom
)

onMounted(scrollToBottom)
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
          <span class="avatar" aria-hidden="true">{{ user?.initials }}</span>
          <span class="name">{{ user?.fullName || user?.email }}</span>
          <button class="btn-ghost" type="button" @click="signOut">Sign out</button>
        </div>
      </header>

      <div ref="transcript" class="transcript">
        <div v-if="loadingMessages" class="skeletons" aria-hidden="true">
          <div class="skeleton skeleton-short" />
          <div class="skeleton" />
          <div class="skeleton skeleton-mid" />
        </div>

        <div v-else-if="!messages.length" class="empty">
          <h2>Ask Gemini something</h2>
          <p>Your conversation starts here. The API key stays on the backend.</p>
        </div>

        <ChatMessageItem v-for="message in messages" :key="message.id" :message="message" />
      </div>

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

.avatar {
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

.empty {
  margin: auto;
  text-align: center;
  color: var(--text-faint);
}

.empty h2 {
  margin: 0 0 4px;
  font-size: 17px;
  color: var(--text-muted);
}

.empty p {
  margin: 0;
  font-size: 14px;
}

.composer-wrap {
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
}

.composer-wrap .alert {
  margin-bottom: 10px;
}

@media (max-width: 760px) {
  .name {
    display: none;
  }
}
</style>
