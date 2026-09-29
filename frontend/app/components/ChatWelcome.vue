<script setup lang="ts">
const emit = defineEmits<{ send: [prompt: string] }>()

/**
 * Clickable starters that put a full prompt into the chat. They are the
 * same shape as a typed message, so the send flow never knows the
 * difference.
 */
const suggestions: { title: string; body: string; glyph: string }[] = [
  {
    glyph: '📄',
    title: 'Summarize a PDF',
    body: 'Upload a document and ask for the key points',
  },
  {
    glyph: '🖼️',
    title: 'Describe an image',
    body: 'Attach a photo and ask what is in it',
  },
  {
    glyph: '💻',
    title: 'Write me code',
    body: '“Build a Python function that parses CSV files”',
  },
  {
    glyph: '🗺️',
    title: 'Plan a trip',
    body: '“Sketch a 3-day itinerary for Tokyo”',
  },
]

const example = [
  { prompt: 'Explain machine learning in simple terms', label: 'Explain ML simply' },
  { prompt: 'Draft a short email turning down an invitation', label: 'Draft an email' },
  { prompt: 'Give me 5 ideas for a science fair project', label: 'Science fair ideas' },
  { prompt: 'Translate “where is the train station?” to French', label: 'Translate a phrase' },
] as const
</script>

<template>
  <div class="welcome">
    <div class="logo" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="34"
        height="34"
        fill="currentColor"
        stroke="none"
      >
        <path d="M12 2c.6 5.4 4.6 9.4 10 10-5.4.6-9.4 4.6-10 10-.6-5.4-4.6-9.4-10-10 5.4-.6 9.4-4.6 10-10Z" />
      </svg>
    </div>

    <h2>How can I help?</h2>
    <p class="subtitle">
      Ask anything. You can attach up to 3 images or PDFs per message, and
      the Gemini API key never leaves the backend.
    </p>

    <div class="cards">
      <button
        v-for="suggestion in suggestions"
        :key="suggestion.title"
        class="card"
        type="button"
        :aria-label="`Start with: ${suggestion.title}`"
        @click="emit('send', suggestion.title)"
      >
        <span class="glyph" aria-hidden="true">{{ suggestion.glyph }}</span>
        <span class="card-title">{{ suggestion.title }}</span>
        <span class="card-body">{{ suggestion.body }}</span>
      </button>
    </div>

    <div class="examples">
      <button
        v-for="item in example"
        :key="item.prompt"
        class="example"
        type="button"
        @click="emit('send', item.prompt)"
      >
        {{ item.label }}
      </button>
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
  border-radius: 20px;
  background: linear-gradient(135deg, var(--accent-soft), transparent 70%),
    var(--bg-elevated);
  border: 1px solid var(--accent-border);
  color: var(--accent-strong);
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
  color: var(--text-muted);
}

.cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 14px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.card:hover {
  border-color: var(--accent-border);
  background: var(--bg-hover);
  transform: translateY(-1px);
}

.glyph {
  font-size: 20px;
  line-height: 1;
  margin-bottom: 6px;
}

.card-title {
  font-size: 14.5px;
  font-weight: 600;
}

.card-body {
  font-size: 12.5px;
  color: var(--text-faint);
  line-height: 1.45;
}

.examples {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 26px;
}

.example {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 12.5px;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.example:hover {
  border-color: var(--accent-border);
  color: var(--accent-strong);
  background: var(--accent-soft);
}

@media (max-width: 520px) {
  .cards {
    grid-template-columns: 1fr;
  }
}
</style>