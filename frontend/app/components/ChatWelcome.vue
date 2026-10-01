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
  <!--
    This lives in a column that does not scroll -- the transcript does
    that -- so it has to be its own scroller or the third starter card is
    simply unreachable on a short phone. It is also why the vertical
    centring is dropped below "sm": a centred flex child that overflows is
    clipped at the top as well as the bottom, and the heading would go
    first. Above the breakpoint there is room for the content and it is
    centred as before.
  -->
  <div
    class="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-start overflow-y-auto px-6 py-8 sm:justify-center sm:py-12"
  >
    <ChatLogo class="mb-6" />

    <!--
      The gradient is clipped to the text, so the type itself carries the
      accent and the page below it stays neutral. "bg-clip-text" is what
      moves the paint from the box to the glyphs.
    -->
    <h2 class="text-2xl font-semibold text-highlighted sm:text-3xl">
      <span class="bg-linear-to-r from-primary from-40% to-primary/60 bg-clip-text text-transparent">
        What can I help you with?
      </span>
    </h2>
    <p class="mt-2 max-w-prose text-muted">
      Ask a question, attach up to three images and three PDFs, and the answer
      streams back as it is written.
    </p>

    <div class="mt-8 grid gap-3 sm:grid-cols-3">
      <!--
        Each card is its own surface with a tint that deepens on hover, so
        the three read as a row of options rather than as three pieces of
        loose body text. The lift is two pixels: enough to feel clickable,
        small enough that a row of three does not look like it is floating
        away.
      -->
      <UButton
        v-for="starter in starters"
        :key="starter.title"
        variant="outline"
        color="neutral"
        class="group h-auto items-start justify-start gap-3 bg-default/60 p-4 text-left ring-1 ring-default transition duration-200 hover:-translate-y-0.5 hover:bg-primary/5 hover:shadow-md hover:ring-primary/30"
        @click="emit('prompt', starter.prompt)"
      >
        <!-- The icon tile keeps the glyph from crowding the title. -->
        <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary/15">
          <UIcon :name="starter.icon" class="size-4" />
        </span>
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
