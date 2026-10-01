<script setup lang="ts">
import type { ApiConversation } from '~/types/api'

/**
 * The conversation list.
 *
 * It is a dashboard sidebar so the group around it owns the mobile
 * drawer and remembers the width between visits. Below the large
 * breakpoint the same markup is shown inside a slideover, which is what
 * hides the list until the toggle is pressed.
 *
 * Above it the header button collapses the rail to a narrow strip and
 * expands it again. That only works because the sidebar is marked
 * "collapsible": the resize composable drops every collapsed write
 * otherwise, so the button would render and do nothing.
 *
 * Each row is an explicit UButton with a sibling dropdown rather than a
 * UNavigationMenu: that component renders every row as a button of its
 * own, so a menu button nested inside one would be invalid markup and
 * unreachable from the keyboard.
 */
const props = defineProps<{
  conversations: ApiConversation[]
  activeId: number | null
  loading: boolean
  /**
   * Whether the mobile slideover is showing.
   *
   * Owned by the page rather than here because the button that opens it
   * lives in the panel header, which is a sibling of this component. Below
   * the "lg" breakpoint the sidebar is hidden off-canvas and this flag is
   * the only thing that brings it back.
   */
  open?: boolean
}>()

const emit = defineEmits<{
  select: [id: number]
  create: []
  remove: [id: number]
  rename: [id: number, title: string]
  'update:open': [value: boolean]
}>()

/**
 * Whether the mobile slideover is showing.
 *
 * Owned by the page rather than here because the button that opens it
 * lives in the panel header, which is a sibling of this component. Below
 * the "lg" breakpoint the sidebar is hidden off-canvas and this flag is
 * the only thing that brings it back.
 *
 * Written through a computed so the sidebar's "v-model:open" keeps
 * working while the state itself lives one level up.
 */
const sidebarOpen = computed({
  get: () => props.open ?? false,
  set: (value) => emit('update:open', value),
})

/**
 * Whether the desktop rail is collapsed to the narrow strip.
 *
 * Held here rather than only inside the sidebar slots so the header
 * padding can react to it: the collapsed rail is 4rem wide, and at the
 * usual "px-4" a 32px icon button no longer fits next to both margins.
 */
const collapsed = ref(false)

const query = ref('')

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return props.conversations
  return props.conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(needle)
  )
})

/**
 * The slideover has to close on selection, otherwise the answer arrives
 * behind a list nobody can see past. On a wide screen the sidebar is not
 * a menu at all, and an open model nobody reads changes nothing.
 */
function select(id: number) {
  emit('update:open', false)
  emit('select', id)
}

interface Group {
  label: string
  conversations: ApiConversation[]
}

/**
 * Date groups, so a long list is navigable. Anything older than the last
 * month is bucketed by month and year rather than by exact date, which
 * keeps the number of headings bounded.
 *
 * The boundaries are starts of days, not offsets from now. A conversation
 * sent twenty minutes ago belongs to today even though its timestamp is
 * earlier than the current instant, which is the opposite of what a plain
 * "updated >= now" test would conclude.
 */
const groups = computed<Group[]>(() => {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const daysBefore = (from: Date, days: number) => {
    const boundary = new Date(from)
    boundary.setDate(boundary.getDate() - days)
    return boundary
  }

  const startOfYesterday = daysBefore(startOfToday, 1)
  const startOfWeek = daysBefore(startOfToday, 7)

  const startOfMonth = new Date(startOfToday)
  startOfMonth.setMonth(startOfMonth.getMonth() - 1)

  const buckets = new Map<string, ApiConversation[]>()

  const push = (label: string, conversation: ApiConversation) => {
    const existing = buckets.get(label)
    if (existing) existing.push(conversation)
    else buckets.set(label, [conversation])
  }

  for (const conversation of filtered.value) {
    const updated = new Date(conversation.updatedAt)

    if (Number.isNaN(updated.getTime())) push('Earlier', conversation)
    else if (updated >= startOfToday) push('Today', conversation)
    else if (updated >= startOfYesterday) push('Yesterday', conversation)
    else if (updated >= startOfWeek) push('Previous 7 days', conversation)
    else if (updated >= startOfMonth) push('Previous 30 days', conversation)
    else
      push(
        updated.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        conversation
      )
  }

  return [...buckets].map(([label, entries]) => ({ label, conversations: entries }))
})

/** The row menu, built per conversation so each one acts on itself. */
function actionsFor(conversation: ApiConversation) {
  return [
    {
      label: 'Rename',
      icon: 'i-lucide-pencil',
      ui: {
        item: 'cursor-pointer',
      },
      onSelect: () => {
        renaming.value = conversation
        renameTitle.value = conversation.title
        renameOpen.value = true
      },
    },
    {
      label: 'Delete',
      icon: 'i-lucide-trash-2',
      ui: {
        item: 'cursor-pointer',
      },
      color: 'error' as const,
      onSelect: () => {
        deleting.value = conversation
        deleteOpen.value = true
      },
    },
  ]
}

const renaming = ref<ApiConversation | null>(null)
const renameTitle = ref('')
const renameOpen = ref(false)

function commitRename() {
  const target = renaming.value
  const title = renameTitle.value.trim()

  // Cleared on commit, not on close, so pressing Cancel discards the
  // edit instead of silently applying whatever was last typed.
  renameOpen.value = false
  renaming.value = null
  renameTitle.value = ''

  if (target && title && title !== target.title) emit('rename', target.id, title)
}

const deleting = ref<ApiConversation | null>(null)
const deleteOpen = ref(false)

function commitDelete() {
  const target = deleting.value
  deleteOpen.value = false
  deleting.value = null
  if (target) emit('remove', target.id)
}
</script>

<template>
  <UDashboardSidebar
    id="default"
    v-model:open="sidebarOpen"
    v-model:collapsed="collapsed"
    resizable
    collapsible
    :min-size="13"
    :max-size="28"
    :default-size="17"
    :ui="{
      body: 'gap-2',
      header: collapsed ? 'justify-center px-0' : '',
    }"
  >
    <template #header>
      <ChatLogo v-if="!collapsed" class="min-w-0 flex-1" />
      <UDashboardSidebarCollapse class="mx-auto cursor-pointer" />
    </template>

    <!--
      The collapsed rail is 4rem wide, so there is no room for the list.
      The body is hidden rather than squeezed: a visible expand button is
      what makes the state reversible, and the button lives in the header
      above this slot.
    -->
    <template #default>
      <template v-if="!collapsed">
        <!--
          The one saturated element in the rail. A gradient and a shadow
          give it the same weight as the app mark at the top, so the two
          ends of the sidebar are visibly the same kind of thing.
        -->
        <UButton
          icon="i-lucide-square-pen"
          label="New conversation"
          block
          class="justify-start cursor-pointer bg-linear-to-r from-primary from-40% to-primary/80 text-white shadow-sm ring-1 ring-primary/20 transition hover:shadow-md"
          @click="emit('create')"
        />

        <UInput
          v-model="query"
          icon="i-lucide-search"
          placeholder="Search"
          size="sm"
          autocomplete="off"
          :ui="{ base: 'bg-elevated/50 ring-1 ring-default' }"
        />

        <USkeleton v-if="props.loading" class="h-9 w-full" />

        <UAlert
          v-else-if="!filtered.length"
          :title="query.trim() ? 'Nothing matches that search' : 'No conversations yet'"
          :description="query.trim() ? undefined : 'Start one above and it will appear here.'"
          icon="i-lucide-message-square"
          color="neutral"
          variant="soft"
        />

        <template v-else>
          <section v-for="group in groups" :key="group.label">
            <p class="px-2 pt-3 pb-1 text-xs font-semibold tracking-wide text-dimmed uppercase">
              {{ group.label }}
            </p>

            <ul class="flex flex-col">
              <li
                v-for="conversation in group.conversations"
                :key="conversation.id"
                class="group/row relative"
              >
                <!--
                  A marker in the gutter marks the open conversation, so
                  which thread is being read survives a long list and does
                  not depend on spotting a tinted row.
                -->
                <span
                  v-if="conversation.id === props.activeId"
                  class="pointer-events-none absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-primary"
                  aria-hidden="true"
                />

                <UButton
                  :label="conversation.title"
                  :active="conversation.id === props.activeId"
                  :active-variant="conversation.id === props.activeId ? 'soft' : undefined"
                  color="neutral"
                  variant="ghost"
                  block
                  class="w-full cursor-pointer justify-start ps-3 pe-9 transition-colors hover:bg-elevated/60"
                  :title="conversation.title"
                  @click="select(conversation.id)"
                />

                <UDropdownMenu
                  :items="actionsFor(conversation)"
                  :content="{ align: 'end' }"
                  class="absolute cursor-pointer inset-e-1 top-1/2 -translate-y-1/2 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100"
                >
                  <UButton
                    icon="i-lucide-ellipsis"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    aria-label="Conversation actions"
                  />
                </UDropdownMenu>
              </li>
            </ul>
          </section>
        </template>
      </template>
    </template>

    <template #footer>
      <UserMenu v-if="!collapsed" class="w-full" />
    </template>
  </UDashboardSidebar>

  <UModal
    v-model:open="renameOpen"
    title="Rename conversation"
    description="Pick a new title for this conversation."
    :ui="{ footer: 'flex-row-reverse justify-start cursor-pointer' }"
  >
    <template #body>
      <UInput
        v-model="renameTitle"
        autofocus
        placeholder="Conversation title"
        class="w-full cursor-pointer"
      />
    </template>

    <template #footer>
      <UButton label="Save" :disabled="!renameTitle.trim()" @click="commitRename" />
      <UButton
        color="neutral"
        variant="ghost"
        label="Cancel"
        @click="renameOpen = false"
      />
    </template>
  </UModal>

  <UModal
    v-model:open="deleteOpen"
    title="Delete conversation"
    description="This removes the conversation and everything in it. It cannot be undone."
    :ui="{ footer: 'flex-row-reverse justify-start cursor-pointer' }"
  >
    <template #footer>
      <UButton color="error" label="Delete" @click="commitDelete" />
      <UButton
        color="neutral"
        variant="ghost"
        label="Cancel"
        @click="deleteOpen = false"
      />
    </template>
  </UModal>
</template>
