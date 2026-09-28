const TOKEN_STORAGE_KEY = 'gemini_chatbot.token'

/**
 * Holds the bearer token issued by the backend and mirrors it into
 * localStorage so a page refresh keeps the session.
 *
 * The value is kept in useState so it survives navigation, and the
 * token itself is the only thing persisted: the Gemini API key never
 * reaches the browser.
 */
export function useToken() {
  const token = useState<string | null>('auth:token', () => null)

  function setToken(value: string | null) {
    token.value = value

    if (!import.meta.client) return

    if (value) {
      localStorage.setItem(TOKEN_STORAGE_KEY, value)
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  }

  /**
   * Reads the persisted token. Client only, so it is called from a
   * ".client" plugin rather than during server rendering.
   */
  function restoreToken() {
    if (!import.meta.client) return
    setToken(localStorage.getItem(TOKEN_STORAGE_KEY))
  }

  return { token, setToken, restoreToken }
}
