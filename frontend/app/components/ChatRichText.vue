<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'

const props = defineProps<{ text: string }>()

/**
 * Model answers come back as plain text, but the UI is richer when the
 * structure of that text (headings, lists, tables, code) is shown instead
 * of a flat paragraph. Rendering is intentionally safe:
 *  - raw HTML is not produced ("html: false"), so the model cannot inject
 *    markup, scripts or images
 *  - every link is forced to open in a new tab with noopener
 *  - code is syntax highlighted client side with highlight.js and the
 *    original language name is shown beside a copy button
 */
const renderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, lang): string {
    // Only highlight when the language is known; the fallback colors
    // generic code with the auto detector.
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value
      } catch {
        /* fall through to auto */
      }
    }
    try {
      return hljs.highlightAuto(code).value
    } catch {
      return renderer.utils.escapeHtml(code)
    }
  },
})

const defaultLinkOpen =
  renderer.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

renderer.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]!
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen(tokens, idx, options, env, self)
}

/**
 * The default fence rule already applies "options.highlight"; this rule
 * wraps the result in a header bar showing the language and a copy
 * button. The button has no listener of its own - clicks are delegated
 * from the component root, because v-html content is not compiled by Vue.
 */
renderer.renderer.rules.fence = (tokens, idx, options) => {
  const token = tokens[idx]!

  const info = token.info ? renderer.utils.unescapeAll(token.info).trim() : ''
  const language = info.split(/\s+/g)[0] ?? ''
  const languageClass = language ? ` language-${renderer.utils.escapeHtml(language)}` : ''
  const label = language ? renderer.utils.escapeHtml(language) : 'code'

  const highlighted = options.highlight?.(token.content, language, language) ?? ''

  return (
    `<div class="rich-code">` +
    `<div class="rich-code-head">` +
    `<span class="rich-code-lang">${label}</span>` +
    `<button type="button" class="rich-code-copy" aria-label="Copy code">Copy</button>` +
    `</div>` +
    `<pre class="rich-code-pre"><code class="hljs${languageClass}">${highlighted}</code></pre>` +
    `</div>`
  )
}

const html = computed(() => renderer.render(props.text))

const copyTimer: { current: ReturnType<typeof setTimeout> | null } = { current: null }

/** Delegated handler: any "Copy" button inside the rendered markdown. */
async function onCodeClick(event: MouseEvent) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.rich-code-copy')
  if (!button) return

  const code = button.closest('.rich-code')?.querySelector<HTMLElement>('.rich-code-pre code')
  const text = code?.textContent ?? ''
  if (!text) return

  try {
    await navigator.clipboard.writeText(text)
  } catch {
    return
  }

  button.textContent = 'Copied'
  button.classList.add('done')
  if (copyTimer.current) clearTimeout(copyTimer.current)
  copyTimer.current = setTimeout(() => {
    button.textContent = 'Copy'
    button.classList.remove('done')
  }, 1500)
}
</script>

<template>
  <div class="rich-text" @click="onCodeClick">
    <div v-html="html" />
  </div>
</template>

