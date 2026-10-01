```vue
<script setup lang="ts">
import type {DropdownMenuItem} from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const {user, logout} = useAuth()

const colorMode = useColorMode()
const appConfig = useAppConfig()

const colors = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose'
]

const neutrals = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone'
]

const items = computed<DropdownMenuItem[][]>(() => [
  [
    {
      type: 'label',
      label: user.value?.fullName || user.value?.email || 'Account',
      avatar: {
        text: user.value?.initials || '?',
        alt: user.value?.fullName || user.value?.email || 'Account'
      }
    }
  ],

  [
    {
      label: 'Theme',
      icon: 'i-lucide-palette',
      class: 'cursor-pointer',
      children: [
        {
          label: 'Primary',
          slot: 'chip',
          class: 'cursor-pointer',
          chip: appConfig.ui.colors.primary,
          content: {
            align: 'center',
            collisionPadding: 16
          },
          children: colors.map(color => ({
            label: color,
            chip: color,
            slot: 'chip',
            class: 'cursor-pointer',
            checked: appConfig.ui.colors.primary === color,
            type: 'checkbox' as const,

            onSelect: (event: Event) => {
              event.preventDefault()
              appConfig.ui.colors.primary = color
            }
          }))
        },

        {
          label: 'Neutral',
          slot: 'chip',
          class: 'cursor-pointer',
          chip:
              appConfig.ui.colors.neutral === 'neutral'
                  ? 'old-neutral'
                  : appConfig.ui.colors.neutral,
          content: {
            align: 'end',
            collisionPadding: 16
          },
          children: neutrals.map(color => ({
            label: color,
            chip: color === 'neutral' ? 'old-neutral' : color,
            slot: 'chip',
            class: 'cursor-pointer',
            checked: appConfig.ui.colors.neutral === color,
            type: 'checkbox' as const,

            onSelect: (event: Event) => {
              event.preventDefault()
              appConfig.ui.colors.neutral = color
            }
          }))
        }
      ]
    },

    {
      label: 'Appearance',
      icon: 'i-lucide-sun-moon',
      class: 'cursor-pointer',
      children: [
        {
          label: 'Light',
          icon: 'i-lucide-sun',
          type: 'checkbox' as const,
          checked: colorMode.value === 'light',

          onSelect: (event: Event) => {
            event.preventDefault()
            colorMode.preference = 'light'
          }
        },

        {
          label: 'Dark',
          icon: 'i-lucide-moon',
          type: 'checkbox' as const,
          class: 'cursor-pointer',
          checked: colorMode.value === 'dark',

          onSelect: (event: Event) => {
            event.preventDefault()
            colorMode.preference = 'dark'
          }
        }
      ]
    }
  ],

  [
    {
      label: 'Sign out',
      icon: 'i-lucide-log-out',
      class: 'cursor-pointer',

      onSelect: () => {
        logout()
      }
    }
  ]
])
</script>

<template>
  <UDropdownMenu
      :items="items"
      :content="{
      align: 'center',
      collisionPadding: 12
    }"
      :ui="{
      content: collapsed
        ? 'w-48'
        : 'w-(--reka-dropdown-menu-trigger-width)'
    }"
  >
    <UButton
        :label="collapsed
        ? undefined
        : (user?.fullName || user?.email || 'Account')"
        :trailing-icon="
        collapsed
          ? undefined
          : 'i-lucide-chevrons-up-down'
      "
        :avatar="{
          text: user?.initials || '?',
          alt: user?.fullName || user?.email || 'Account',
          class: 'bg-primary text-white',
          ui: {
            fallback: 'text-white'
          }
        }"
        color="neutral"
        variant="ghost"
        block
        :square="collapsed"
        class="data-[state=open]:bg-elevated cursor-pointer"
        :ui="{
        trailingIcon: 'text-dimmed'
      }"
    />

    <template #chip-leading="{ item }">
      <div class="inline-flex items-center justify-center shrink-0 size-5">
        <span
            class="rounded-full ring ring-bg dark:bg-(--chip-dark) size-2"
            :style="{
            '--chip-light': `var(--color-${(item as any).chip}-500)`,
            '--chip-dark': `var(--color-${(item as any).chip}-400)`
          }"
        />
      </div>
    </template>
  </UDropdownMenu>
</template>