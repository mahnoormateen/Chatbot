import { ApiError } from '~/composables/useApi'
import { toFriendlyError } from '~/utils/errors'
import type { FriendlyError } from '~/utils/errors'
import type { ApiUser, AuthPayload } from '~/types/api'

/**
 * Session state: the bearer token and the signed in user.
 * The token is managed by useToken so it can be persisted and restored.
 */
export function useAuth() {
  const api = useApi()
  const { token, setToken } = useToken()

  const user = useState<ApiUser | null>('auth:user', () => null)
  const loading = useState('auth:loading', () => false)
  const error = ref<FriendlyError | null>(null)

  const isAuthenticated = computed(() => Boolean(token.value && user.value))

  function clear() {
    setToken(null)
    user.value = null
  }

  /**
   * Loads the current user. Used on boot to validate a restored token and
   * as a fallback for a client that lost its user state.
   */
  async function refresh(): Promise<void> {
    if (!token.value) return

    try {
      user.value = await api.get<ApiUser>('/api/auth/me')
    } catch (caught) {
      // A rejected or expired token must not leave the UI in a half signed in state.
      if (caught instanceof ApiError && [401, 403].includes(caught.status)) clear()
    }
  }

  async function login(email: string, password: string): Promise<boolean> {
    return run(() => api.post<AuthPayload>('/api/auth/login', { email, password }), 'signing in')
  }

  async function register(input: {
    fullName: string
    email: string
    password: string
    passwordConfirmation: string
  }): Promise<boolean> {
    return run(() => api.post<AuthPayload>('/api/auth/register', input), 'creating your account')
  }

  async function logout(): Promise<void> {
    try {
      if (token.value) await api.post('/api/auth/logout')
    } catch {
      // Logging out locally matters more than the server side result.
    } finally {
      clear()
    }
  }

  /**
   * Shared sign in / sign up flow: store the token, cache the user and
   * normalise failures into something worth reading.
   */
  async function run(call: () => Promise<AuthPayload>, action: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const payload = await call()
      setToken(payload.token)
      user.value = payload.user
      return true
    } catch (caught) {
      /**
       * A 401 on the sign in screen is a rejected credential, not an
       * expired session, so it is handled before the generic mapping
       * would claim the session ended.
       */
      if (caught instanceof ApiError && caught.status === 401) {
        error.value = {
          title: 'Could not sign in',
          detail: 'That email and password combination was not recognised.',
          items: [],
          retryable: false,
        }
        return false
      }

      // Wrong credentials arrive as a 400 with a plain message, and a
      // fielded 422 is a form problem. The headline is set here so
      // neither is reported as an expired session.
      error.value = toFriendlyError(caught, {
        action,
        title: action === 'signing in' ? 'Could not sign in' : 'Could not create your account',
      })
      return false
    } finally {
      loading.value = false
    }
  }

  return { user, token, loading, error, isAuthenticated, login, register, logout, refresh, clear }
}
