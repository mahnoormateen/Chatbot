/**
 * Restores the saved theme before the app renders, so the refs in
 * useTheme agree with the data-theme attribute that the inline script
 * in nuxt.config.ts already set.
 */
export default defineNuxtPlugin(() => {
  const { restore } = useTheme()
  restore()
})
