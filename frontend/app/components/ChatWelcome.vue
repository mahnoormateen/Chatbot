<script setup lang="ts">
/**
 * The empty state: shown instead of the transcript until the first turn
 * exists. It offers a few starting points so a blank input is not the
 * first thing a new user meets, and says what the composer accepts,
 * because a silent file limit is only discovered by hitting it.
 */
const emit = defineEmits<{ prompt: [text: string] }>()

const starters = [
  {
    icon: 'i-lucide-compass',
    title: 'Explain a topic',
    body: 'Describe how something works and ask for it in plain language.',
    prompt: 'Explain how retrieval augmented generation works, in plain language.',
  },
  {
    icon: 'i-lucide-code',
    title: 'Write and review code',
    body: 'Paste a snippet, or describe what you need built.',
    prompt: 'Write a TypeScript function that retries a fetch with backoff.',
  },
  {
    icon: 'i-lucide-file-text',
    title: 'Work from a document',
    body: 'Attach a PDF and ask questions about what is inside it.',
    prompt: 'Summarise the document I attached and list its key decisions.',
  },
]
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-12">
    <ChatLogo class="mb-6" />

    <h2 class="text-2xl font-semibold text-highlighted sm:text-3xl">
      What can I help you with?
    </h2>
    <p class="mt-2 max-w-prose text-muted">
      Ask a question, attach up to three images and three PDFs, and the answer
      streams back as it is written.
    </p>

    <div class="mt-8 grid gap-3 sm:grid-cols-3">
      <UButton
        v-for="starter in starters"
        :key="starter.title"
        variant="soft"
        color="neutral"
        class="h-auto items-start justify-start gap-1 p-4 text-left"
        @click="emit('prompt', starter.prompt)"
      >
        <UIcon :name="starter.icon" class="mt-0.5 size-4 shrink-0" />
        <span class="min-w-0">
          <span class="block text-sm font-medium text-highlighted">
            {{ starter.title }}
          </span>
          <span class="mt-0.5 block text-xs font-normal text-muted">
            {{ starter.body }}
          </span>
        </span>
      </UButton>
    </div>
  </div>
</template>
