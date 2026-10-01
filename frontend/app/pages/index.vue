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
import {useAuth} from '~/composables/useAuth'
import {useChat} from '~/composables/useChat'
import {toUiMessages} from '~/utils/uiMessages'

const {user, isAuthenticated, refresh} = useAuth()

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
  editMessage,
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
    {immediate: true}
)

const uiMessages = computed(() => toUiMessages(messages.value))

/** Monogram for the user's own messages, taken from what the API knows. */
const initials = computed(() => user.value?.initials || '')

/** Heading in the panel header; blank until a conversation is open. */
const title = computed(() => activeConversation.value?.title || '')

/**
 * Whether the conversation list is open on mobile.
 *
 * Only meaningful below the "lg" breakpoint, where the sidebar is an
 * off-canvas slideover. On a wide screen the sidebar is always visible
 * and this flag is ignored.
 */
const sidebarOpen = ref(false)
</script>

<template>
  <div v-if="!ready" class="grid min-h-svh place-items-center">
    <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted"/>
  </div>

  <AuthPanel v-else-if="!isAuthenticated" class="min-h-svh"/>

  <UDashboardGroup v-else>
    <ChatSidebar
        :conversations="conversations"
        :active-id="activeId"
        :loading="loadingConversations"
        v-model:open="sidebarOpen"
        @select="openConversation"
        @create="createConversation"
        @remove="deleteConversation"
        @rename="renameConversation"
    />

    <div class="relative flex min-w-0 flex-1 flex-col">
      <!--
        "min-h-0" replaces "min-h-svh" on the panel. The group this sits in
        is "fixed inset-0", so the panel already measures exactly one
        viewport tall by stretch; the minimum was redundant, and it became
        actively harmful once the top safe inset was added as padding,
        because a box that is at-least-viewport-tall *including* that
        padding overflows the group by that much and gets clipped.

        The top padding is what keeps the navbar out from under a notch.
        It goes on the panel rather than the navbar because the navbar has
        a fixed height from the theme: padding inside it would eat the
        height of its own contents.
      -->
      <UDashboardPanel
          id="chat"
          class="flex-1 pt-[var(--safe-top)]"
          :ui="{
          body: 'app-canvas flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0 sm:p-0',
        }"
      >
        <template #header>
          <!--
            Glass rather than a solid bar. The transcript scrolls right up
            under this, and an opaque strip would cut the conversation in
            half; the veil keeps the title readable while letting the
            bubbles show faintly through it.
          -->
          <UDashboardNavbar class="app-glass">
            <template #left>
              <UButton
                icon="i-lucide-menu"
                color="neutral"
                variant="ghost"
                size="sm"
                class="lg:hidden cursor-pointer"
                aria-label="Open conversations"
                @click="sidebarOpen = true"
              />
              <h1 class="truncate text-sm font-semibold text-highlighted">
                {{ title || 'New conversation' }}
              </h1>
            </template>

            <template #right>
              <UColorModeButton class="cursor-pointer"/>
            </template>
          </UDashboardNavbar>
        </template>

        <template #body>
          <!--
            The panel body is a column, not a scroller: the transcript
            has to be the element that scrolls, because UChatMessages
            attaches its auto-scroll behaviour to whatever scroll parent
            it finds when it mounts.

            The side insets are added here rather than on the transcript
            and the composer separately, because they wrap both: in
            landscape on a notched phone this is the strip beside the
            camera housing that would otherwise hold the send button.
          -->
          <div class="flex min-h-0 flex-1 flex-col ps-[var(--safe-left)] pe-[var(--safe-right)]">
            <!--
              The skeleton sits in the same capped column as the
              transcript, so the page does not visibly change width the
              moment the conversation arrives.
            -->
            <div
              v-if="loadingMessages"
              class="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6 sm:px-6"
            >
              <USkeleton v-for="turn in 2" :key="turn" class="h-24 w-full" />
            </div>

            <!--
              The transcript and the composer share one width cap so the
              column of conversation stays put. Without it a long answer on
              a wide screen stretched edge to edge while the input sat at a
              fixed size below, and the two stopped agreeing on where the
              conversation begins.
            -->
            <div
                v-else-if="messages.length"
                class="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto"
            >
              <ChatTranscript
                  :messages="uiMessages"
                  :status="status"
                  :model-name="activeModelName"
                  :user-initials="initials"
                  :spacing-offset="200"
                  @edit="editMessage"
              />
            </div>

            <ChatWelcome v-else @prompt="sendMessage"/>

            <!--
              The bottom inset is the home indicator on an iPhone. Without
              it the send button sits under the swipe bar, which is a
              control that looks reachable and is not.
            -->
            <footer class="mx-auto w-full max-w-3xl shrink-0 pb-[var(--safe-bottom)]">
              <ErrorBanner
                  v-if="error"
                  :error="error"
                  :retryable="error.retryable && canRetry"
                  class="mb-2"
                  @dismiss="clearError"
                  @retry="retryLastMessage"
              />

              <div class="px-4 sm:px-6">
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

              <p class="mt-2 px-2.5 pb-2 text-center text-xs text-dimmed">
                Models can be wrong. Verify anything that matters.
              </p>
            </footer>
          </div>
        </template>
      </UDashboardPanel>
    </div>
  </UDashboardGroup>
</template>
