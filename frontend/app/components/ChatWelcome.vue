<script setup lang="ts">
const emit = defineEmits<{ send: [prompt: string] }>()

/**
 * Clickable starters that put a full prompt into the chat. They are the
 * same shape as a typed message, so the send flow never knows the
 * difference.
 */
const suggestions: { title: string; body: string; icon: string }[] = [
  {
    icon: 'i-lucide-file-text',
    title: 'Summarize a PDF',
    body: 'Upload a document and ask for the key points',
  },
  {
    icon: 'i-lucide-image',
    title: 'Describe an image',
    body: 'Attach a photo and ask what is in it',
  },
  {
    icon: 'i-lucide-code',
    title: 'Write me code',
    body: 'Build a Python function that parses CSV files',
  },
  {
    icon: 'i-lucide-map',
    title: 'Plan a trip',
    body: 'Sketch a 3-day itinerary for Tokyo',
  },
]

const examples = [
  { prompt: 'Explain machine learning in simple terms', label: 'Explain ML simply' },
  { prompt: 'Draft a short email turning down an invitation', label: 'Draft an email' },
  { prompt: 'Give me 5 ideas for a science fair project', label: 'Science fair ideas' },
  { prompt: 'Translate "where is the train station?" to French', label: 'Translate a phrase' },
] as const
</script>

<template>
  <div class="welcome">
    <div class="logo" aria-hidden="true">
      <UIcon name="i-lucide-sparkles" class="size-8 text-primary" />
    </div>

    <h2>How can I help?</h2>
    <p class="subtitle">
      Ask anything. You can attach up to 3 images or PDFs per message, and
      the Gemini API key never leaves the backend.
    </p>

    <div class="cards">
      <UButton
        v-for="suggestion in suggestions"
        :key="suggestion.title"
        :icon="suggestion.icon"
        color="neutral"
        variant="subtle"
        size="lg"
        block
        class="justify-start"
        :aria-label="`Start with: ${suggestion.title}`"
        @click="emit('send', suggestion.title)"
      >
        <template #leading>
          <UIcon :name="suggestion.icon" class="size-5" />
        </template>

        <span class="flex flex-col items-start">
          <span class="font-medium">{{ suggestion.title }}</span>
          <span class="text-xs text-muted">{{ suggestion.body }}</span>
        </span>
      </UButton>
    </div>

    <div class="examples">
      <UButton
        v-for="item in examples"
        :key="item.prompt"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="emit('send', item.prompt)"
      >
        {{ item.label }}
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.welcome {
  margin: auto;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 12px 8px;
}

.logo {
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
  margin-bottom: 18px;
  border-radius: var(--ui-radius, 12px);
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  color: var(--ui-primary);
}

h2 {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 650;
}

.subtitle {
  margin: 0 auto 26px;
  max-width: 460px;
  font-size: 14px;
  color: var(--ui-text-muted);
}

.cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

.examples {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 26px;
}

@media (max-width: 520px) {
  .cards {
    grid-template-columns: 1fr;
  }
}
</style>