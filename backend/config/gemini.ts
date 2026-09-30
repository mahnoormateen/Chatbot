import env from '#start/env'

/**
 * A named kind of model, resolved against the models this key can call.
 */
export interface TierConfig {
  /** Stable identifier used by the client and by GEMINI_MODEL. */
  key: string

  /** Short label for a picker. */
  title: string

  /** One line describing the trade off, for a picker tooltip. */
  note: string

  /**
   * Model names in order of preference. The first one confirmed usable
   * for this key wins, so naming a model that is currently closed to the
   * key costs nothing.
   */
  prefer: string[]

  /**
   * Family used when none of the preferred names is usable, so the tier
   * still resolves to the right kind of model on a different day.
   */
  match: RegExp
}

/**
 * Configuration for the Gemini service.
 *
 * The API key is deliberately *not* part of this object. It is read
 * straight from the environment by the service itself, so that it can
 * never be serialized into an HTTP response by accident.
 */
export interface GeminiConfig {
  /**
   * Preferred model, used to answer a request when neither the client nor
   * the conversation specifies one.
   *
   * This is a preference and not a guarantee. The name is only honoured
   * when the discovered list says the key can actually call it, so a
   * retired or quota limited model here degrades to the best working
   * alternative instead of breaking every turn. It may also be a tier key
   * such as "fast" or "cheap".
   */
  model: string

  /**
   * Instructions prepended to every conversation. The model uses them to
   * decide the tone and the language of its answers.
   */
  systemInstruction: string

  /**
   * Sampling parameters forwarded to the Gemini API as they are.
   */
  generation: {
    temperature: number
    topP: number
    maxOutputTokens: number
  }

  /**
   * Maximum number of previous messages taken from the conversation.
   * Anything older is dropped so a long chat cannot blow up the token
   * budget.
   */
  maxHistoryMessages: number

  /**
   * The Gemini API rate limits aggressively and answers 429/503 under
   * load, so a failed turn is retried a couple of times before the error
   * reaches the client.
   */
  retry: {
    attempts: number
    baseDelayMs: number
  }

  /**
   * Named tiers, so a caller can ask for a *kind* of model instead of a
   * model name.
   *
   * A tier is not a fixed "this key" mapping. "prefer" is an ordered
   * wish list, and "match" is the family to fall back on, so a tier keeps
   * resolving to something as Google adds and retires models. Every tier
   * is resolved against the list confirmed for this key, so a tier whose
   * first choice is retired or over quota lands on the next working model
   * rather than failing. That is the difference between this and a plain
   * constant map of model names, which goes stale the moment any one of
   * its entries is closed to the key.
   */
  tiers: TierConfig[]

  /**
   * How the usable model list is discovered.
   *
   * Google keeps adding and retiring models, and which ones a given key
   * may call is not a property of the model itself: the same model can
   * be open to one project and closed to a new one. The list is therefore
   * read from the API and confirmed with a minimal request, instead of
   * being written down here.
   */
  discovery: {
    /**
     * How long a confirmed list is trusted before it is rebuilt. Long
     * enough not to re-probe on every page load, short enough that a
     * model whose quota comes back reappears on its own.
     */
    cacheTtlMs: number

    /**
     * How many models are confirmed at the same time. Kept small so a
     * cold start cannot trip the free tier request rate.
     */
    probeConcurrency: number

    /**
     * Pause between confirmations within a single slot.
     */
    probeDelayMs: number

    /**
     * Deadline for a single confirmation.
     *
     * A model under heavy load holds the connection open for a long time
     * before it admits to being busy, which would otherwise let one slow
     * model decide how long discovery takes. A probe is only a yes or no
     * question, so an unanswered one counts as unconfirmed.
     */
    probeTimeoutMs: number

    /**
     * Upper bound for a whole discovery run. On expiry the partially
     * confirmed list is used, so a slow API cannot hang a request.
     */
    timeoutMs: number

    /**
     * How long a request for the model list waits on a cold cache.
     *
     * Discovery is warmed at startup, so this only decides how long a
     * request can be made to wait when the API is slow. Waiting longer
     * than this and the caller gets whatever is confirmed so far.
     */
    initialWaitMs: number
  }

  /**
   * Limits on documents a user can attach to a message.
   *
   * These exist because the files travel as inline base64 inside the very
   * request that asks the question, so an unbounded upload would become an
   * unbounded request. The total is kept under the inline request ceiling
   * the API applies, leaving room for the history sent alongside it.
   */
  attachments: {
    /** Ceiling for a single file. */
    maxFileSizeBytes: number

    /** Ceiling for one turn, summed across the files attached to it. */
    maxTotalSizeBytes: number

    /** How many files one message may carry. */
    maxPerMessage: number
  }
}

export const geminiConfig: GeminiConfig = {
  model: env.get('GEMINI_MODEL'),

  systemInstruction:
    'You are a helpful assistant. Answer in the same language as the question and keep the answer short and to the point.',

  generation: {
    temperature: 0.7,
    topP: 0.95,
    maxOutputTokens: 2048,
  },

  maxHistoryMessages: 20,

  retry: {
    attempts: 3,
    baseDelayMs: 500,
  },

  /**
   * The three tiers the app offers.
   *
   * The "prefer" lists are ordered newest first, which is why they hold
   * more than one name: a model that is rate limited today is commonly
   * back tomorrow, and the next entry is already waiting.
   */
  tiers: [
    {
      key: 'fast',
      title: 'Fast',
      note: 'Flash, for everyday chat',
      prefer: [
        'gemini-3.8-flash',
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-flash-latest',
      ],
      match: /flash(?!-lite)/,
    },
    {
      key: 'reasoning',
      title: 'Reasoning',
      note: 'Pro, for harder questions',
      prefer: ['gemini-2.5-pro', 'gemini-3.1-pro-preview', 'gemini-pro-latest'],
      match: /pro/,
    },
    {
      key: 'cheap',
      title: 'Cheap',
      note: 'Flash Lite, lowest cost per token',
      prefer: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'],
      match: /flash-lite|flashlite/,
    },
  ],

  discovery: {
    /**
     * Short enough that a model coming back out of a rate limit shows
     * up while someone is still looking at the picker. Quota on a free
     * key moves quickly, and a list that is an hour stale is worse than
     * a handful of extra one token probes.
     */
    cacheTtlMs: 10 * 60 * 1000,
    probeConcurrency: 8,
    probeDelayMs: 100,
    probeTimeoutMs: 4_000,
    timeoutMs: 20_000,
    initialWaitMs: 8_000,
  },

  attachments: {
    /**
     * A single PDF is capped well under the request ceiling so that a
     * large file cannot be the reason every turn starts failing.
     */
    maxFileSizeBytes: 8 * 1024 * 1024,

    /**
     * The inline request ceiling is roughly 20 MB once base64 inflation is
     * accounted for. This leaves headroom for the conversation history,
     * which is sent in the same request.
     */
    maxTotalSizeBytes: 12 * 1024 * 1024,

    maxPerMessage: 3,
  },
}

export default geminiConfig
