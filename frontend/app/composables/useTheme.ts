/**
 * Note: the storage key below is repeated as a literal inside an inline
 * script in nuxt.config.ts. That script has to run before the first
 * paint, so it cannot import this file. Change both together.
 */
const THEME_STORAGE_KEY = 'gemini_chatbot.theme'

export type Theme = 'light' | 'dark'

/** "system" until the visitor actually touches the toggle. */
export type ThemePreference = Theme | 'system'

/**
 * Set once the operating system listener is attached. Module scope on
 * purpose: the listener should live for the page, not for whichever
 * component happened to mount first, and no component should have to
 * remember to detach it.
 */
let watchingSystem = false

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/**
 * Owns the light/dark choice.
 *
 * The choice is applied as a "data-theme" attribute on <html> rather
 * than a class, so the stylesheet can select it without depending on
 * specificity, and so the inline script in nuxt.config.ts can set the
 * same attribute before the app renders.
 *
 * This is purely a display preference stored next to the token in
 * localStorage. The Gemini API key never reaches the browser.
 */
export function useTheme() {
  const preference = useState<ThemePreference>('theme:preference', () => 'system')
  const theme = useState<Theme>('theme:resolved', () => 'dark')

  /** The palette the operating system asks for, dark unless it says light. */
  function systemTheme(): Theme {
    if (!import.meta.client) return 'dark'
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }

  /**
   * Paints the resolved palette onto the document. Runs after every
   * change and once on boot, so the ref always agrees with the
   * attribute the inline script already wrote.
   */
  function apply() {
    const resolved = preference.value === 'system' ? systemTheme() : preference.value
    theme.value = resolved

    if (!import.meta.client) return
    document.documentElement.dataset.theme = resolved
  }

  function setTheme(value: ThemePreference) {
    preference.value = value

    if (import.meta.client) {
      if (value === 'system') {
        // Nothing to remember: following the system is the default.
        localStorage.removeItem(THEME_STORAGE_KEY)
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, value)
      }
    }

    apply()
  }

  function toggle() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  /**
   * Reads the stored choice back and re-applies it. Client only, so it
   * is called from a ".client" plugin before the first render.
   */
  function restore() {
    if (!import.meta.client) return

    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (isTheme(stored)) preference.value = stored

    apply()

    if (!watchingSystem) {
      watchingSystem = true
      // A visitor who never chose explicitly still follows the
      // operating system when it switches at sunset.
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', apply)
    }
  }

  return { preference, theme, setTheme, toggle, restore }
}
