import { GoogleGenAI, type Content, type Model } from '@google/genai'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { geminiConfig, type TierConfig } from '#config/gemini'
import GeminiError from '#exceptions/gemini_error'
import type Message from '#models/message'

/**
 * Shape returned to the client for the model picker dropdown.
 */
export type GeminiModelSummary = {
  id: string
  displayName: string
  description: string | null
  inputTokenLimit: number | null
  outputTokenLimit: number | null
}

/**
 * Availability a model has for this key right now.
 *
 * "ready" answered a confirmation request. "rateLimited" is a quota state
 * that lifts on its own, so the model is worth offering but the client is
 * told, rather than letting the user pick it and meet an error. Retired
 * models never reach the client at all.
 */
export type ModelAvailability = 'ready' | 'rateLimited'

/**
 * A model as offered to the client, with the availability attached.
 */
export type SelectableModel = GeminiModelSummary & { status: ModelAvailability }

/**
 * A named tier with the model it currently resolves to.
 *
 * "exact" is false when the tier's first choice was not usable for this
 * key and resolution landed on another model of the same family. The
 * client shows that state rather than silently pretending the preferred
 * model was used.
 */
export type GeminiModelTier = {
  key: string
  title: string
  note: string
  model: SelectableModel
  exact: boolean
}

type ReplyPayload = {
  model: string
  prompt: string
  history: Message[]
}

/**
 * Upstream statuses that are worth retrying: rate limits and transient
 * service faults. Anything else fails fast.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

/**
 * Upstream statuses that mean "this model cannot be used, try another".
 *
 * A 404 joins the retryable set here because on a model call it almost
 * always means the model was retired or was never available to this key.
 * That is exactly the state a conversation saved earlier is in: it still
 * names the model it was created with, so failing the whole turn over a
 * stale name would be the opposite of graceful.
 */
const FAILOVER_STATUSES = new Set([404, ...RETRYABLE_STATUSES])

/**
 * Model families that the API lists as text capable but that cannot hold
 * a chat turn.
 *
 * The list endpoint advertises "generateContent" for speech synthesis
 * and image models too, so the method list alone still leaves models
 * that answer a text prompt with a sound file. They are matched out by
 * name.
 */
const NON_CHAT_MODEL = /image|-tts|tts-|live|transcribe|robotics|computer-use|native-audio|omni|embedding|aqa/

/**
 * What confirming a model with a real request found out.
 *
 * "unavailable" is permanent for the life of the key, which is what a
 * retired model reports. "limited" is a quota or capacity state that can
 * lift again, so those models stay worth trying as a fallback.
 */
type ModelVerdict = 'usable' | 'limited' | 'unavailable'

type ModelEntry = GeminiModelSummary & { verdict: ModelVerdict }

/**
 * Order the picker is shown in, best suited for an everyday chat first.
 *
 * Flash is the balance the app asks for, flash lite is the cheap fast
 * option, and pro is the most capable but slowest and priciest. Anything
 * unrecognised sorts last. The number after the dash only breaks ties
 * inside a family, so a newer flash outranks an older one.
 */
function rankModel(id: string): number {
  const family = NON_CHAT_MODEL.test(id)
    ? 9
    : /flash-lite|flashlite/.test(id)
      ? 1
      : /flash/.test(id)
        ? 0
        : /pro/.test(id)
          ? 2
          : 3

  const version = id.match(/(\d+)(?:\.(\d+))?/)?.[0] ?? '0'
  const parts = version.split('.').map(Number)

  return family * 1_000_000 + (parts[0] ?? 0) * 1_000 + (parts[1] ?? 0)
}

/**
 * Wraps the Google GenAI SDK. The client is stateless, so the service is
 * registered as a singleton on the container.
 */
export default class GeminiService {
  #client: GoogleGenAI

  /**
   * Last confirmed model list. The service is a singleton, so the
   * discovery cost is paid once per process instead of per request.
   */
  #registry: { at: number; entries: ModelEntry[] } | null = null

  /**
   * Discovery currently running, so callers that arrive while it is in
   * flight wait for that run instead of starting another one.
   */
  #discovery: Promise<ModelEntry[]> | null = null

  constructor() {
    this.#client = new GoogleGenAI({ apiKey: env.get('GEMINI_API_KEY') })

    /**
     * Discovery is warmed here rather than on the first request. It is
     * the difference between the model picker being ready when the UI
     * asks for it and the first visitor waiting on a round of probes.
     * The result is ignored because nobody is waiting on it yet.
     */
    this.#discovery = this.#discover().finally(() => {
      this.#discovery = null
    })
  }

  /**
   * Model used when neither the request nor the conversation picks one.
   *
   * Resolved against the discovered list, so a configured name that the
   * key cannot actually call falls through to a working model rather
   * than failing every turn. A tier key is accepted here too.
   */
  async defaultModel(): Promise<string> {
    const entries = await this.#ensureRegistry()
    const preferred = geminiConfig.model
    const usable = this.#selectable(entries)

    if (preferred) {
      const resolved = this.#resolve(preferred, usable)
      if (resolved) return resolved
    }

    if (usable.length) {
      return usable[0].id
    }

    /**
     * Nothing could be confirmed. The configured name is still returned
     * so the attempt produces a real upstream error to report rather
     * than a locally invented one.
     */
    return preferred
  }

  /**
   * The named tiers, each resolved to a model this key can call.
   *
   * A tier whose preferred model is retired or over quota still appears,
   * pointing at the best working model of the same family, because a tier
   * that disappears when its first choice is unavailable is a tier the
   * user cannot rely on. "exact" reports when that happened.
   */
  async listTiers(): Promise<GeminiModelTier[]> {
    const entries = await this.#settled(geminiConfig.discovery.initialWaitMs)
    const usable = this.#selectable(entries)

    if (!usable.length) {
      logger.warn(
        { checked: entries.length },
        'No Gemini tier could be resolved for this key yet'
      )
      return []
    }

    const tiers: GeminiModelTier[] = []

    /**
     * Models already spoken for by an earlier tier. A quota squeeze can
     * leave a key with only one usable model, in which case every tier
     * would otherwise resolve to that same model and "Reasoning" would
     * quietly be a flash lite. Preferring an unclaimed model keeps the
     * tiers telling each other apart for as long as the key allows.
     */
    const claimed = new Set<string>()

    for (const tier of geminiConfig.tiers) {
      const { id, exact } = this.#resolveTier(tier, usable, claimed)
      const model = usable.find((entry) => entry.id === id)

      if (!model) continue

      claimed.add(id)
      tiers.push({
        key: tier.key,
        title: tier.title,
        note: tier.note,
        model,
        exact,
      })
    }

    return tiers
  }

  /**
   * Resolves a name that may be a tier key or a model id.
   *
   * Returns null when the name is neither, which tells the caller to fall
   * back to the confirmed list rather than to send an unusable name.
   */
  #resolve(requested: string, usable: GeminiModelSummary[]): string | null {
    const tier = geminiConfig.tiers.find((entry) => entry.key === requested)
    if (tier) return this.#resolveTier(tier, usable).id

    return usable.some((model) => model.id === requested) ? requested : null
  }

  /**
   * Picks the model a tier should use right now.
   *
   * The ordered preferences come first, so a tier stays on the model it
   * was aimed at whenever that one is available. The family pattern is
   * the fallback, and only when the whole family is unusable does the
   * tier hand back the best model the key does have, which keeps a tier
   * selectable on a key that can only reach one model.
   */
  #resolveTier(
    tier: TierConfig,
    usable: GeminiModelSummary[],
    claimed: Set<string> = new Set()
  ): { id: string; exact: boolean } {
    for (const preferred of tier.prefer) {
      if (usable.some((model) => model.id === preferred)) {
        return { id: preferred, exact: true }
      }
    }

    const family = usable
      .filter((model) => tier.match.test(model.id))
      .sort((a, b) => rankModel(a.id) - rankModel(b.id))

    if (family.length) {
      return { id: family[0].id, exact: false }
    }

    /**
     * The whole family is unusable for this key. Rather than dropping the
     * tier, it falls through to the best model still available, preferring
     * one no other tier has taken so two tiers do not report the same
     * model as if it satisfied both.
     */
    const ranked = [...usable].sort((a, b) => rankModel(a.id) - rankModel(b.id))
    const unclaimed = ranked.find((model) => !claimed.has(model.id))

    return { id: (unclaimed ?? ranked[0]).id, exact: false }
  }

  /**
   * The models this key can actually answer with, which is what the
   * model picker in the UI shows.
   *
   * The list is read from the Gemini API and every entry is confirmed
   * with a minimal request, because the list endpoint advertises models
   * that the project is not allowed to call. That is exactly the case
   * this app ran into: a model can be listed as text capable and still
   * fail for a newly created key.
   */
  async listModels(): Promise<SelectableModel[]> {
    const entries = await this.#settled(geminiConfig.discovery.initialWaitMs)
    const models = this.#offer(entries)

    if (!models.length) {
      logger.warn(
        { checked: entries.length },
        'No Gemini model could be confirmed for this key yet'
      )
    }

    return models
  }

  /**
   * The confirmed list if it is ready, otherwise whatever has been
   * confirmed within the given budget.
   *
   * Unlike "#ensureRegistry" this does not block a turn on discovery, so
   * a slow or unreachable API cannot stop a chat from being sent.
   */
  async #settled(budgetMs: number): Promise<ModelEntry[]> {
    /**
     * A partial list is only good enough once it holds something usable.
     * An empty one means discovery is still warming up, and waiting the
     * budget is better than reporting that the account has no models.
     */
    if (this.#registry && this.#selectable(this.#registry.entries).length) {
      return this.#registry.entries
    }

    if (!this.#discovery) {
      this.#discovery = this.#discover().finally(() => {
        this.#discovery = null
      })
    }

    return Promise.race([
      this.#discovery,
      new Promise<ModelEntry[]>((resolve) => setTimeout(() => resolve([]), budgetMs)),
    ])
  }

  /**
   * Returns the whole answer at once, together with the model that
   * actually produced it. The model can differ from the requested one
   * when the service had to fall back, so callers must persist what is
   * returned here rather than what they asked for.
   */
  async generateReply(payload: ReplyPayload): Promise<{ model: string; text: string }> {
    const { model, result } = await this.#withFailover('generateContent', payload.model, (m) =>
      this.#client.models.generateContent({
        model: m,
        contents: this.#buildContents(payload.prompt, payload.history),
        config: this.#generationConfig(),
      })
    )

    return { model, text: result.text?.trim() || '' }
  }

  /**
   * Opens a streaming answer and resolves the model before the first
   * chunk is produced.
   *
   * The handshake is where failover happens: once chunks have been
   * handed to the client the stream cannot be restarted on another
   * model, so it is allowed to run to the end or fail.
   */
  async openStream(
    payload: ReplyPayload
  ): Promise<{ model: string; chunks: AsyncGenerator<string> }> {
    const { model, result: stream } = await this.#withFailover(
      'generateContentStream',
      payload.model,
      (m) =>
        this.#client.models.generateContentStream({
          model: m,
          contents: this.#buildContents(payload.prompt, payload.history),
          config: this.#generationConfig(),
        })
    )

    const service = this
    return {
      model,
      chunks: (async function* () {
        try {
          for await (const chunk of stream) {
            if (chunk.text) yield chunk.text
          }
        } catch (error) {
          throw service.#toUpstreamError('The Gemini answer stream failed', error)
        }
      })(),
    }
  }

  /**
   * Returns the confirmed model list, rebuilding it when the cache has
   * gone stale. Callers that arrive mid run share that run.
   */
  async #ensureRegistry(): Promise<ModelEntry[]> {
    const cached = this.#registry
    if (cached && Date.now() - cached.at < geminiConfig.discovery.cacheTtlMs) {
      return cached.entries
    }

    if (!this.#discovery) {
      this.#discovery = this.#discover().finally(() => {
        this.#discovery = null
      })
    }

    return this.#discovery
  }

  /**
   * Reads the model list and confirms each candidate with a real request.
   * Never throws: on failure the last known list is kept, so a transient
   * outage cannot empty the picker or block a chat turn.
   */
  async #discover(): Promise<ModelEntry[]> {
    try {
      const candidates = await this.#listCandidates()
      const entries = await this.#confirm(candidates, (partial) => {
        /**
         * Published as the picture fills in, so a request arriving while
         * discovery is still running can use what is already known
         * instead of waiting for the slowest probe to give up.
         */
        this.#registry = { at: Date.now(), entries: partial }
      })

      this.#registry = { at: Date.now(), entries }

      logger.info(
        {
          listed: candidates.length,
          usable: entries.filter((entry) => entry.verdict === 'usable').length,
        },
        'Confirmed the Gemini models this key can use'
      )

      return entries
    } catch (error) {
      logger.warn({ error }, 'Model discovery failed, keeping the last known list')
      return this.#registry?.entries ?? []
    }
  }

  /**
   * Every model the API lists that could plausibly hold a text turn,
   * ordered so the best default comes first.
   */
  async #listCandidates(): Promise<GeminiModelSummary[]> {
    const pager = await this.#client.models.list()
    const models: GeminiModelSummary[] = []

    for await (const model of pager as AsyncIterable<Model>) {
      const id = model.name?.replace(/^models\//, '')

      /**
       * Only Gemini models are of interest, and the families that answer
       * a text prompt with something other than text are dropped even
       * though they advertise "generateContent".
       */
      if (!id || !id.startsWith('gemini') || NON_CHAT_MODEL.test(id)) {
        continue
      }

      /**
       * The SDK maps the API's "supportedGenerationMethods" onto
       * "supportedActions". A model that will not accept generated
       * content cannot answer, so it is skipped. The field is read
       * defensively because older builds of the SDK omit it.
       */
      const actions = model.supportedActions
      if (actions && !actions.includes('generateContent')) {
        continue
      }

      models.push({
        id,
        displayName: model.displayName || id,
        description: model.description || null,
        inputTokenLimit: model.inputTokenLimit ?? null,
        outputTokenLimit: model.outputTokenLimit ?? null,
      })
    }

    return models.sort((a, b) => rankModel(a.id) - rankModel(b.id))
  }

  /**
   * Asks each candidate for a single token, which is the only reliable
   * way to learn whether this key may use it. The request is as small as
   * the API accepts and the whole run is bounded, so a slow endpoint
   * cannot stall the picker.
   */
  async #confirm(
    candidates: GeminiModelSummary[],
    onProgress: (entries: ModelEntry[]) => void
  ): Promise<ModelEntry[]> {
    const { probeConcurrency, probeDelayMs, timeoutMs } = geminiConfig.discovery
    const entries: ModelEntry[] = []
    let cursor = 0

    const runner = async (): Promise<void> => {
      while (cursor < candidates.length) {
        const model = candidates[cursor++]
        const verdict = await this.#probe(model.id)

        entries.push({ ...model, verdict })
        onProgress([...entries].sort((a, b) => rankModel(a.id) - rankModel(b.id)))

        if (probeDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, probeDelayMs))
        }
      }
    }

    await Promise.race([
      Promise.all(Array.from({ length: Math.min(probeConcurrency, candidates.length) }, runner)),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ])

    /**
     * A probe that never came back is not evidence that a model is
     * broken, so anything left unconfirmed is kept as a fallback rather
     * than dropped.
     */
    for (const model of candidates) {
      if (!entries.some((entry) => entry.id === model.id)) {
        entries.push({ ...model, verdict: 'limited' })
      }
    }

    return entries.sort((a, b) => rankModel(a.id) - rankModel(b.id))
  }

  /**
   * Confirms one model with the smallest request the API accepts.
   */
  async #probe(id: string): Promise<ModelVerdict> {
    const ask = (async (): Promise<ModelVerdict> => {
      try {
        await this.#client.models.generateContent({
          model: id,
          contents: [{ parts: [{ text: '.' }] }],
          config: { maxOutputTokens: 1, temperature: 0 },
        })

        return 'usable'
      } catch (error) {
        const status = this.#statusOf(error)

        /**
         * Rate limits and capacity faults lift on their own, so those
         * models stay eligible. Anything else, such as a retired model
         * answering 404, is closed to this key for good.
         */
        return status !== undefined && RETRYABLE_STATUSES.has(status) ? 'limited' : 'unavailable'
      }
    })()

    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<ModelVerdict>((resolve) => {
      timer = setTimeout(
        () => resolve('limited'),
        geminiConfig.discovery.probeTimeoutMs
      )
    })

    try {
      return await Promise.race([ask, deadline])
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * The models offered in the picker.
   *
   * Confirmed models are the whole point. Rate limited ones only appear
   * when nothing at all could be confirmed, because an empty dropdown is
   * a dead end for the user while a model whose quota is about to come
   * back is merely slow.
   */
  #selectable(entries: ModelEntry[]): SelectableModel[] {
    const usable = entries.filter((entry) => entry.verdict === 'usable')
    const pool = usable.length ? usable : entries.filter((entry) => entry.verdict === 'limited')

    return pool.map((entry) => ({
      id: entry.id,
      displayName: entry.displayName,
      description: entry.description,
      inputTokenLimit: entry.inputTokenLimit,
      outputTokenLimit: entry.outputTokenLimit,
      status: entry.verdict === 'usable' ? 'ready' : 'rateLimited',
    }))
  }

  /**
   * Everything the picker offers, ready models first.
   *
   * A rate limited model is still offered rather than hidden, because the
   * list endpoint and the picker are not the same thing: a hidden model
   * looks like it does not exist, while a marked one tells the truth about
   * a quota that lifts on its own. Retired models are the only ones
   * dropped, since for those the restriction is permanent.
   */
  #offer(entries: ModelEntry[]): SelectableModel[] {
    const usable = entries.filter((entry) => entry.verdict === 'usable')
    const limited = entries.filter((entry) => entry.verdict === 'limited')

    /**
     * Sorted in the same rank order the picker has always used, so the
     * everyday choice stays at the top of the list and the working models
     * do not move around when quota shifts underneath.
     */
    const byRank = (a: ModelEntry, b: ModelEntry) => rankModel(a.id) - rankModel(b.id)

    const describe = (entry: ModelEntry): SelectableModel => ({
      id: entry.id,
      displayName: entry.displayName,
      description: entry.description,
      inputTokenLimit: entry.inputTokenLimit,
      outputTokenLimit: entry.outputTokenLimit,
      status: entry.verdict === 'usable' ? 'ready' : 'rateLimited',
    })

    return [...usable.sort(byRank), ...limited.sort(byRank)].map(describe)
  }

  /**
   * Runs a Gemini call, retrying rate limits and transient upstream
   * faults with a linear backoff.
   */
  async #withRetry<T>(operation: string, task: () => Promise<T>): Promise<T> {
    const attempts = geminiConfig.retry.attempts
    let lastError: unknown

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await task()
      } catch (error) {
        lastError = error
        const status = this.#statusOf(error)

        if (status === undefined || !RETRYABLE_STATUSES.has(status) || attempt === attempts) {
          break
        }

        const delay = geminiConfig.retry.baseDelayMs * attempt
        logger.warn({ operation, attempt, status, delay }, 'Retrying the Gemini request')
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    throw this.#toUpstreamError(`Gemini could not complete the request`, lastError)
  }

  /**
   * The models to try for a turn, best first.
   *
   * The confirmed list is the source of truth, so no model name is ever
   * written into the code. A requested model that discovery found closed
   * to this key is dropped rather than tried, which is what stops a
   * retired model from failing every turn before the fallback helps.
   * A model that is merely rate limited still goes first, because the
   * user picked it and a quota can recover mid request.
   */
  async #candidatesFor(requested: string): Promise<string[]> {
    const entries = await this.#ensureRegistry()
    const closed = new Set(
      entries.filter((entry) => entry.verdict === 'unavailable').map((entry) => entry.id)
    )
    const usable = this.#selectable(entries)
    const ordered = usable.map((model) => model.id)

    /**
     * A tier key is not a model name, so it is resolved to the model the
     * tier points at right now and put first. Doing this here is what
     * lets the client send "fast" and get that tier's model without the
     * controller knowing anything about tiers.
     */
    const requestedId = this.#resolve(requested, usable) ?? requested

    /**
     * Nothing was confirmed at all, which means discovery could not
     * reach the API. The requested name is still worth attempting so the
     * failure surfaces as a real upstream error.
     */
    if (!ordered.length) return [requestedId]

    return [...new Set([...(closed.has(requestedId) ? [] : [requestedId]), ...ordered])]
  }

  /**
   * Runs a Gemini call against the requested model, and on a rate limit
   * or a transient upstream fault moves on to the next confirmed model
   * instead of giving up.
   *
   * Retrying the same model is what "#withRetry" does. This wrapper adds
   * the extra step of changing model, because quota is accounted per
   * model: a key that is over its limit on one alias is usually still
   * fine on another. Only statuses that suggest the model is unusable
   * trigger a switch, so a genuine bad request fails fast.
   */
  async #withFailover<T>(
    operation: string,
    requested: string,
    task: (model: string) => Promise<T>
  ): Promise<{ model: string; result: T }> {
    const candidates = await this.#candidatesFor(requested)

    let lastError: unknown

    for (const [index, model] of candidates.entries()) {
      try {
        return { model, result: await this.#withRetry(operation, () => task(model)) }
      } catch (error) {
        lastError = error
        const status = this.#upstreamStatus(error)
        const isLast = index === candidates.length - 1

        if (!FAILOVER_STATUSES.has(status as number) || isLast) break

        logger.warn(
          { operation, model, status, next: candidates[index + 1] },
          'Gemini model is unusable, trying the next one'
        )
      }
    }

    throw this.#toUpstreamError('Gemini could not complete the request', lastError)
  }

  /**
   * Turns the stored history plus the new prompt into the "contents"
   * array expected by the API, keeping only the most recent turns so a
   * long conversation cannot blow up the token budget.
   */
  #buildContents(prompt: string, history: Message[]): Content[] {
    const recent = history.slice(-geminiConfig.maxHistoryMessages)

    return [
      ...recent.map((message) => ({
        role: message.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: message.content }],
      })),
      {
        role: 'user' as const,
        parts: [{ text: prompt }],
      },
    ]
  }

  #generationConfig() {
    return {
      systemInstruction: geminiConfig.systemInstruction,
      temperature: geminiConfig.generation.temperature,
      topP: geminiConfig.generation.topP,
      maxOutputTokens: geminiConfig.generation.maxOutputTokens,
    }
  }

  #statusOf(error: unknown): number | undefined {
    const status = (error as { status?: unknown })?.status
    return typeof status === 'number' ? status : undefined
  }

  /**
   * Reads the upstream HTTP status from a failure, looking through the
   * wrapper as well. "#withRetry" raises a GeminiError that keeps the
   * original SDK error as its cause, so the status can sit on either one.
   */
  #upstreamStatus(error: unknown): number | undefined {
    return this.#statusOf(error) ?? this.#statusOf((error as { cause?: unknown })?.cause)
  }

  /**
   * Wraps an SDK failure in a GeminiError. Client side upstream statuses
   * (unknown model, bad key, rate limit) are surfaced as they are,
   * anything else is reported as a bad gateway because the failure came
   * from an upstream service rather than from the request.
   */
  #toUpstreamError(message: string, error: unknown): GeminiError {
    const status = this.#statusOf(error)
    const isClientError = status !== undefined && status >= 400 && status < 500

    return new GeminiError(message, {
      status: isClientError ? status : 502,
      cause: error as Error,
    })
  }
}
