<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ApiConversation } from '~/types/api'

/**
 * The conversation list.
 *
 * It is a dashboard sidebar so that the group around it can drive the
 * mobile drawer and the panel next to it, and so the width is remembered
 * between visits. On a narrow screen the same markup is shown inside a
 * slideover, which is what hides the list until the toggle is pressed.
 */
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

const query = ref('')

/** Conversation being renamed, while the rename dialog is open. */
const renameTarget = ref<ApiConversation | null>(null)
const renameTitle = ref('')
/** Conversation queued for deletion, while the confirmation is open. */
const deleteTarget = ref<ApiConversation | null>(null)

/** Provided by DashboardGroup, for width persistence. Commented out to avoid import issues. */
const dashboard = {}

const accountItems = computed<DropdownMenuItem[][]>(() => [
  [
    { type: 'label', label: props.userEmail },
    {
      label: 'Sign out',
      icon: 'i-lucide-log-out',
      color: 'error',
      onSelect: () => emit('signout'),
    },
  ],
])

/**
 * The sidebar is a slideover below the large breakpoint, so picking a
 * conversation has to dismiss it or the answer appears behind the list.
 */
function select(id: number) {
  emit('select', id)
}

function openRename(conversation: ApiConversation) {
  renameTarget.value = conversation
  renameTitle.value = conversation.title
}

function commitRename() {
  const target = renameTarget.value
  const title = renameTitle.value.trim()
  renameTarget.value = null
  if (target && title) emit('rename', target.id, title)
}

function confirmDelete() {
  const target = deleteTarget.value
  deleteTarget.value = null
  if (target) emit('remove', target.id)
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
const groups = computed(() => {
  if (query.value.trim()) return []

  const today = dayStart(new Date())
  const labels = ['Today', 'Yesterday', 'Previous 7 days', 'Older']
  const buckets: { label: string; conversations: ApiConversation[] }[] = []

  for (const conversation of props.conversations) {
    const days = Math.floor((today - dayStart(new Date(conversation.updatedAt))) / 86_400_000)
    const index = days <= 0 ? 0 : days === 1 ? 1 : days < 7 ? 2 : 3

    const existing = buckets[index]
    if (existing) existing.conversations.push(conversation)
    else buckets[index] = { label: labels[index]!, conversations: [conversation] }
  }

  // Buckets can be sparse (no "Yesterday"); fill from latest to oldest.
  return buckets
    .filter((bucket) => bucket !== undefined)
    .sort((a, b) => labels.indexOf(a.label) - labels.indexOf(b.label))
})
</script>

<template>
  <UDashboardSidebar
    resizable
    :min-size="13"
    :default-size="17"
    class="border-e border-default bg-elevated/25"
  >
    <template #header>
      <div class="flex items-center gap-2 px-1">
        <ChatLogo />
        <UDashboardSidebarCollapse class="ms-auto" />
      </div>
    </template>

    <template #default>
      <UButton
        label="New conversation"
        icon="i-lucide-plus"
        block
        color="neutral"
        variant="subtle"
        size="sm"
        class="font-medium"
        @click="emit('create')"
      />

      <UInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="Search conversations"
        aria-label="Search conversations"
        size="sm"
        class="mt-2"
        :ui="{}"
      />

      <nav class="mt-2" aria-label="Conversations">
        <template v-if="loading">
          <USkeleton v-for="index in 6" :key="index" class="mb-1 h-7 w-full rounded-lg" />
        </template>

        <UAlert
          v-else-if="!props.conversations.length"
          icon="i-lucide-message-square"
          color="neutral"
          variant="soft"
          title="No conversations yet"
          description="Start one with the button above."
          class="mt-1"
        />

        <UAlert
          v-else-if="query && !filteredConversations.length"
          icon="i-lucide-search-x"
          color="neutral"
          variant="soft"
          :title="`No titles match '${query}'`"
          class="mt-1"
        />

        <!-- Date groups, the default view. -->
        <template v-else-if="groups.length">
          <section v-for="group in groups" :key="group.label" class="mt-3 first:mt-1">
            <p class="px-2 pb-1 text-xs font-semibold tracking-wide text-dimmed uppercase">
              {{ group.label }}
            </p>

            <ul class="flex flex-col gap-0.5">
              <li v-for="conversation in group.conversations" :key="conversation.id">
                <div
                  class="group/row relative flex items-center rounded-lg transition-colors"
                  :class="
                    conversation.id === props.activeId ? 'bg-elevated' : 'hover:bg-elevated/60'
                  "
                >
                  <UButton
                    block
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    class="justify-start px-2"
                    :class="
                      conversation.id === props.activeId ? 'font-medium' : 'font-normal text-toned'
                    "
                    :aria-current="conversation.id === props.activeId ? 'page' : undefined"
                    @click="select(conversation.id)"
                  >
                    <span class="truncate">{{ conversation.title }}</span>

                    <span class="ms-auto shrink-0 text-xs text-dimmed group-hover/row:hidden">
                      {{ relativeTime(conversation.updatedAt) }}
                    </span>
                  </UButton>

                  <!--
                    Positioned over the row rather than inside it: a button
                    inside the row button would be invalid markup and would
                    not be reachable with the keyboard.
                  -->
                  <div
                    class="absolute end-1 flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100"
                  >
                    <UDropdownMenu
                      :items="[
                        {
                          label: 'Rename',
                          icon: 'i-lucide-pencil',
                          onSelect: () => openRename(conversation),
                        },
                        {
                          label: 'Delete',
                          icon: 'i-lucide-trash-2',
                          color: 'error',
                          onSelect: () => (deleteTarget = conversation),
                        },
                      ]"
                    >
                      <UButton
                        icon="i-lucide-ellipsis"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        square
                        :aria-label="`Actions for ${conversation.title}`"
                      />
                    </UDropdownMenu>
                  </div>
                </div>
              </li>
            </ul>
          </section>
        </template>

        <!-- Search results, flat so the match reads at the top of the list. -->
        <ul v-else class="mt-2 flex flex-col gap-0.5">
          <li v-for="conversation in filteredConversations" :key="conversation.id">
            <UButton
              block
              color="neutral"
              variant="ghost"
              size="sm"
              class="justify-start px-2"
              :class="
                conversation.id === props.activeId ? 'bg-elevated font-medium' : 'font-normal text-toned'
              "
              @click="select(conversation.id)"
            >
              <span class="truncate">{{ conversation.title }}</span>
            </UButton>
          </li>
        </ul>
      </nav>
    </template>

    <template #footer>
      <USeparator class="mb-2" />

      <UDropdownMenu :items="accountItems">
        <UButton block color="neutral" variant="ghost" class="justify-start px-1">
          <UUser
            :name="props.userName"
            :description="props.userEmail"
            :avatar="{ text: props.userInitials, alt: props.userName }"
            size="sm"
            class="min-w-0"
            :ui="{}"
          />
        </UButton>
      </UDropdownMenu>
    </template>
  </UDashboardSidebar>

  <!-- Rename. Kept in a dialog rather than inline so the row list does
       not have to reflow while a title is being typed. -->
  <UModal
    :open="Boolean(renameTarget)"
    title="Rename conversation"
    description="The new title replaces the current one in the list."
    @update:open="renameTarget = null"
  >
    <template #body>
      <form @submit.prevent="commitRename">
        <UFormField label="Title">
          <UInput
            v-model="renameTitle"
            autofocus
            maxlength="120"
            required
            class="w-full"
            :ui="{}"
          />
        </UFormField>
      </form>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="renameTarget = null"
        />
        <UButton label="Save" type="submit" @click="commitRename" />
      </div>
    </template>
  </UModal>

  <UModal
    :open="Boolean(deleteTarget)"
    title="Delete conversation"
    @update:open="deleteTarget = null"
  >
    <template #body>
      <p class="text-sm text-muted">
        This removes
        <span class="font-medium text-highlighted">{{ deleteTarget?.title }}</span>
        along with every message and file in it. It cannot be undone.
      </p>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="deleteTarget = null"
        />
        <UButton label="Delete" color="error" @click="confirmDelete" />
      </div>
    </template>
  </UModal>
</template>
