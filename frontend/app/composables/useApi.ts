/**
 * Error thrown for any non 2xx response, with the status and the
 * validation errors reported by the backend.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: unknown = null
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Digs a human readable message out of an AdonisJS error body.
 * Vine validation failures arrive as { errors: [{ message }] }.
 */
// function extractMessage(body: unknown): string | null {
//   if (!body) return null
//   if (typeof body === 'string') return body
//
//   const record = body as { errors?: Array<{ message?: string }>; message?: string }
//   const first = record.errors?.[0]?.message
//   if (first) return first
//   if (record.message) return record.message
//
//   return null
// }

/**
 * Thin wrapper around the backend API.
 *
 * Responsibilities:
 *  - prefix requests with runtimeConfig.public.apiBase
 *  - attach the bearer token
 *  - unwrap the "data" envelope every endpoint uses
 *  - normalise errors into ApiError
 */
// export function useApi() {
//   const config = useRuntimeConfig()
//   const { token } = useToken()
//   const base = String(config.public.apiBase).replace(/\/+$/, '')
//
//   function url(path: string) {
//     return `${base}${path.startsWith('/') ? path : `/${path}`}`
//   }
//
//   async function request<T>(
//     path: string,
//     options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {}
//   ): Promise<T> {
//     const headers: Record<string, string> = { Accept: 'application/json' }
//     if (options.body !== undefined) headers['Content-Type'] = 'application/json'
//     if (token.value) headers.Authorization = `Bearer ${token.value}`
//
//     let response: Response
//     try {
//       response = await fetch(url(path), {
//         method: options.method ?? 'GET',
//         headers,
//         body: options.body === undefined ? undefined : JSON.stringify(options.body),
//       })
//     } catch (cause) {
//       throw new ApiError(
//         `Cannot reach the API at ${base}. Is the backend running?`,
//         0,
//         cause
//       )
//     }
//
//     const text = await response.text()
//     let parsed: unknown = null
//     if (text) {
//       try {
//         parsed = JSON.parse(text)
//       } catch {
//         parsed = text
//       }
//     }
//
//     if (!response.ok) {
//       throw new ApiError(
//         extractMessage(parsed) ?? `Request failed with status ${response.status}`,
//         response.status,
//         parsed
//       )
//     }
//
//     return (parsed as { data: T } | null)?.data as T
//   }
//
//   return {
//     base,
//     get: <T>(path: string) => request<T>(path),
//     post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
//     patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
//     delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
//     url,
//   }
// }
