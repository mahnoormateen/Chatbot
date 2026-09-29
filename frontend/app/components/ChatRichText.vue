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
    // Only highlight when the language is known; the fallback colours
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

<!-- Global, not scoped: the rendered markdown (v-html) lives outside the
     scoped-data attribute, so scoped styles cannot reach it. The classes
     are prefixed with "rich-" to avoid colliding with anything else. -->
<style>
.rich-text {
  overflow-wrap: anywhere;
  line-height: 1.65;
}

.rich-text > :first-child {
  margin-top: 0;
}

.rich-text > :last-child {
  margin-bottom: 0;
}

.rich-text p {
  margin: 0 0 10px;
}

.rich-text h1,
.rich-text h2,
.rich-text h3,
.rich-text h4 {
  margin: 16px 0 8px;
  line-height: 1.3;
  font-weight: 650;
}

.rich-text h1 {
  font-size: 1.3em;
}

.rich-text h2 {
  font-size: 1.18em;
}

.rich-text h3 {
  font-size: 1.08em;
}

.rich-text h4 {
  font-size: 1em;
}

.rich-text ul,
.rich-text ol {
  margin: 0 0 10px;
  padding-left: 22px;
}

.rich-text li {
  margin: 3px 0;
}

.rich-text blockquote {
  margin: 0 0 10px;
  padding: 2px 12px;
  border-left: 3px solid var(--accent-border);
  color: var(--text-muted);
}

.rich-text a {
  color: var(--accent-strong);
  text-decoration: none;
}

.rich-text a:hover {
  text-decoration: underline;
}

.rich-text hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 14px 0;
}

.rich-text img {
  max-width: 100%;
  border-radius: var(--radius);
}

.rich-text :not(pre) > code {
  padding: 1px 5px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-raised);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.9em;
}

.rich-text table {
  margin: 0 0 10px;
  border-collapse: collapse;
}

.rich-text th,
.rich-text td {
  padding: 6px 10px;
  border: 1px solid var(--border);
  text-align: left;
}

.rich-text th {
  background: var(--bg-raised);
  font-weight: 600;
}

/* Code block shell with the language label and copy button. */
.rich-code {
  margin: 10px 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-raised);
  overflow: hidden;
}

.rich-code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 8px 5px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated);
}

.rich-code-lang {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--text-faint);
}

.rich-code-copy {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11.5px;
  color: var(--text-muted);
}

.rich-code-copy:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.rich-code-copy.done {
  color: var(--accent-strong);
}

.rich-code-pre {
  margin: 0;
  overflow-x: auto;
}

.rich-code-pre code {
  display: block;
  padding: 12px 14px;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  tab-size: 4;
}

/* Syntax token colours, theme aware through the --code-* variables. */
.rich-text .hljs-comment,
.rich-text .hljs-quote {
  color: var(--code-comment);
  font-style: italic;
}

.rich-text .hljs-keyword,
.rich-text .hljs-selector-tag,
.rich-text .hljs-literal,
.rich-text .hljs-doctag {
  color: var(--code-keyword);
}

.rich-text .hljs-string,
.rich-text .hljs-regexp,
.rich-text .hljs-addition {
  color: var(--code-string);
}

.rich-text .hljs-number,
.rich-text .hljs-symbol,
.rich-text .hljs-bullet {
  color: var(--code-number);
}

.rich-text .hljs-title,
.rich-text .hljs-title.function_,
.rich-text .hljs-section {
  color: var(--code-title);
}

.rich-text .hljs-attr,
.rich-text .hljs-attribute,
.rich-text .hljs-variable,
.rich-text .hljs-template-variable,
.rich-text .hljs-built_in,
.rich-text .hljs-type,
.rich-text .hljs-params {
  color: var(--code-builtin);
}

.rich-text .hljs-meta,
.rich-text .hljs-selector-id,
.rich-text .hljs-selector-class {
  color: var(--code-meta);
}

.rich-text .hljs-deletion {
  color: var(--code-deletion);
}

.rich-text .hljs-emphasis {
  font-style: italic;
}

.rich-text .hljs-strong {
  font-weight: 700;
}
</style>