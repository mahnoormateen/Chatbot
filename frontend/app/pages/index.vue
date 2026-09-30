<script setup lang="ts">
/**
 * The single composition root of the chat.
 *
 * The sidebar, the transcript and the composer all need the same piece
 * of state, and useChat owns it in plain refs rather than a shared
 * store. A layout plus a page would therefore be two stores, and
 * picking a conversation in the sidebar would update a list the
 * transcript never looks at. So the whole shell is assembled here
 * instead, and there is exactly one call to useChat in the app.
 *
 * The browser only ever talks to the AdonisJS backend through
 * runtimeConfig.public.apiBase. The Gemini API key stays on the server:
 * this app has no knowledge of it and never sends one.
 */
import { useAuth } from '~/composables/useAuth'
import { useChat } from '~/composables/useChat'
import { toUiMessages } from '~/utils/uiMessages'

const { user, isAuthenticated, refresh } = useAuth()

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
  stop,
  clearError,
  reset,
} = useChat()

/**
 * False until the stored token has been validated, so a reload with a
 * good token does not flash the sign in form on the way past.
 */
const ready = ref(false)

onMounted(async () => {
  await refresh()
  ready.value = true
})

/**
 * Boot and sign in take the same path, so one watcher covers both: fill
 * the sidebar, load the models, and open the newest conversation so a
 * wide screen is not sitting empty. Signing out drops the previous
 * user's transcript instead, so the next person cannot see it.
 */
watch(
  isAuthenticated,
  async (signedIn, wasSignedIn) => {
    if (signedIn) {
      await Promise.all([loadConversations(), loadModels()])

      const newest = conversations.value[0]
      if (newest) await openConversation(newest.id)
    } else if (wasSignedIn) {
      reset()
    }
  },
  { immediate: true }
)

const uiMessages = computed(() => toUiMessages(messages.value))

/** Monogram for the user's own messages, taken from what the API knows. */
const initials = computed(() => user.value?.initials || '')

/** Heading in the panel header; blank until a conversation is open. */
const title = computed(() => activeConversation.value?.title || '')
</script>

<template>
  <div v-if="!ready" class="grid min-h-svh place-items-center">
    <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
  </div>

  <AuthPanel v-else-if="!isAuthenticated" class="min-h-svh" />

  <UDashboardGroup v-else>
    <ChatSidebar
      :conversations="conversations"
      :active-id="activeId"
      :loading="loadingConversations"
      @select="openConversation"
      @create="createConversation"
      @remove="deleteConversation"
      @rename="renameConversation"
    />

    <div class="relative flex min-w-0 flex-1 flex-col">
      <UDashboardPanel
        id="chat"
        class="min-h-svh flex-1"
        :ui="{
          body: 'flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0 sm:p-0',
        }"
      >
        <template #header>
          <UDashboardNavbar>
            <template #left>
              <h1 class="truncate text-sm font-semibold text-highlighted">
                {{ title || 'New conversation' }}
              </h1>
            </template>

            <template #right>
              <UColorModeButton />
            </template>
          </UDashboardNavbar>
        </template>

        <template #body>
          <!--
            The panel body is a column, not a scroller: the transcript
            has to be the element that scrolls, because UChatMessages
            attaches its auto-scroll behaviour to whatever scroll parent
            it finds when it mounts.
          -->
          <div class="flex min-h-0 flex-1 flex-col">
            <USkeleton v-if="loadingMessages" class="mx-2.5 h-24 w-full" />

            <div v-else-if="messages.length" class="min-h-0 flex-1 overflow-y-auto">
              <ChatTranscript
                :messages="uiMessages"
                :status="status"
                :model-name="activeModelName"
                :user-initials="initials"
                :spacing-offset="200"
              />
            </div>

            <ChatWelcome v-else @prompt="sendMessage" />

            <footer class="shrink-0 mx-auto">
              <ErrorBanner
                v-if="error"
                :error="error"
                :retryable="error.retryable && canRetry"
                class="mb-2"
                @dismiss="clearError"
                @retry="retryLastMessage"
              />
<div class="w-4xl">

              <ChatComposer
                v-model="selectedModel"
                :status="status"
                :models="models"
                :loading-models="loadingModels"
                :model="activeModelName"
                @send="sendMessage"
                @stop="stop"
              />
</div>

              <p class="mt-1 px-2.5 pb-2 text-center text-xs text-dimmed">
                Models can be wrong. Verify anything that matters.
              </p>
            </footer>
          </div>
        </template>
      </UDashboardPanel>
    </div>
  </UDashboardGroup>
</template>
