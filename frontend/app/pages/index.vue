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
  <UDashboardPanel
    id="chat"
    class="relative min-h-0"
    :ui="{ body: 'p-0 sm:p-0 overscroll-none' }"
  >
    <template #header>
      <Navbar>
        <template #title>
          <h1 class="text-sm font-medium text-highlighted truncate min-w-0 max-w-3xs">
            {{ activeConversation?.title ?? 'New conversation' }}
          </h1>
        </template>

        <ModelSelect
          :models="models"
          :model-value="selectedModel"
          :loading="loadingModels"
          :disabled="sending"
          @update:model-value="selectedModel = $event"
        />
      </Navbar>
    </template>

    <template #body>
      <UContainer class="flex-1 flex flex-col gap-4 sm:gap-6">
        <div v-if="loadingMessages" class="flex flex-col gap-4 p-6">
          <USkeleton class="h-7 w-full rounded-lg" />
          <USkeleton class="h-7 w-2/3 rounded-lg" />
          <USkeleton class="h-7 w-1/2 rounded-lg" />
        </div>

        <ChatWelcome v-else-if="!hasMessages" @send="onPrompt" />

        <ChatTranscript
          v-else
          :messages="uiMessages"
          :status="status"
          :model-name="activeModelName"
          :user-initials="user?.initials"
        />

        <footer class="sticky bottom-0 z-10 px-4 pb-4 sm:px-6 sm:pb-6">
          <ErrorBanner
            v-if="error"
            :error="error"
            :retryable="error.retryable && canRetry"
            class="mb-3"
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
      </UContainer>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* Panel body handles its own padding; the container inside provides it. */
</style>