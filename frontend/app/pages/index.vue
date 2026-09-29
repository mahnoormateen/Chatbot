<script setup lang="ts">
/**
 * Gemini chat client.
 *
 * The browser only ever talks to the AdonisJS backend through
 * runtimeConfig.public.apiBase. The Gemini API key stays on the server:
 * this app has no knowledge of it and never sends one.
 */
import { toUiMessages } from '~/utils/uiMessages'

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
  status,
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

/**
 * The transcript in the shape the chat components expect. The conversion
 * is cheap and only runs when the message list changes, so the streaming
 * path is not paying for it on every chunk.
 */
const uiMessages = computed(() => toUiMessages(messages.value))

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
      :user-name="user?.fullName || user?.email || 'Signed in'"
      :user-initials="user?.initials || ''"
      :user-email="user?.email || ''"
      @select="openConversation"
      @create="onCreate"
      @remove="deleteConversation"
      @rename="renameConversation"
      @signout="signOut"
    />

    <main class="main">
      <header class="topbar">
        <UButton
          icon="i-lucide-panel-left"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :aria-expanded="showSidebar"
          :aria-label="showSidebar ? 'Hide conversation list' : 'Show conversation list'"
          @click="showSidebar = !showSidebar"
        />

        <h1 class="heading">{{ activeConversation?.title ?? 'New conversation' }}</h1>

        <ThemeToggle />
      </header>

      <div class="transcript">
        <div v-if="loadingMessages" class="skeletons" aria-hidden="true">
          <USkeleton class="mb-1 h-7 w-full rounded-lg" />
          <USkeleton class="mb-1 h-7 w-2/3 rounded-lg" />
          <USkeleton class="mb-1 h-7 w-1/2 rounded-lg" />
        </div>

        <ChatWelcome v-else-if="!hasMessages" @send="onPrompt" />

        <ChatTranscript
          v-else
          :messages="uiMessages"
          :status="status"
          :model-name="activeModelName"
          :user-initials="user?.initials"
        />
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
          v-model="selectedModel"
          :sending="sending"
          :status="status"
          :phase="sendPhase"
          :model="activeModelName"
          :models="models"
          :loading-models="loadingModels"
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
  color: var(--ui-text-dimmed);
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
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
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

.transcript {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.skeletons {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 22px 18px;
}

/*
 * The prompt used to sit on an opaque band with a hard top border, which
 * in the light palette read as a white strip bolted under the transcript.
 * It now has no background of its own: the composer card provides the only
 * surface, and the padding around it is plain page. The gradient above
 * dissolves the transcript into that padding, so messages scroll away
 * instead of being cut off by a line.
 */
.composer-wrap {
  position: relative;
  padding: 10px 18px 18px;
}

.composer-wrap::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: 30px;
  background: linear-gradient(to top, var(--ui-bg), transparent);
  pointer-events: none;
}

.composer-wrap :deep(.alert) {
  margin-bottom: 10px;
}
</style>