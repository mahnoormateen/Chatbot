/**
 * Dictation for the composer, on top of the browser's Web Speech API.
 *
 * Recognition happens in the browser and never reaches the backend, so a
 * voice prompt costs nothing beyond the permission the user grants, and the
 * dictated text joins whatever was already typed before it goes through the
 * ordinary send path. That also means the feature is only as good as the
 * engine behind it: Chrome and Edge ship a good one, Safari's is weaker,
 * and Firefox has never implemented the API at all. Nothing here pretends
 * otherwise -- "supported" is reported honestly and the caller hides the
 * control rather than offering a button that cannot work.
 *
 * Three engine behaviours shape the code, and all three are quirks rather
 * than documented contract:
 *
 * - A session ends by itself. Even with "continuous" set, Chrome closes the
 *   recognizer after a pause in speech, so the microphone has to be reopened
 *   without asking the user again. That is what "wanted" is for: it
 *   separates "the user wants the mic on" from "the engine happens to be
 *   running", and only the former survives an "end" event.
 * - A phrase arrives twice. The engine emits a guess while a sentence is
 *   still being spoken and then the settled text for the same words, so
 *   every result has to be classified by "isFinal" before it is handed on.
 *   Writing both into the field would double the sentence.
 * - Silence is reported as an error. "no-speech" arrives whenever the
 *   engine hears nothing for a while, which for someone pausing mid
 *   sentence is indistinguishable from working, so it is counted towards
 *   giving up rather than complained about.
 */

import type { FriendlyError } from '~/utils/errors'

export interface SpeechRecognitionOptions {
  /**
   * Language to recognise, as a BCP 47 tag. Defaults to whatever the browser
   * reports, which is the language the user has already chosen for
   * everything else they read.
   */
  lang?: string
  /**
   * Called once per settled phrase, with the engine's final transcript.
   * Interim guesses are never passed here, only text it has committed to.
   */
  onFinal?: (transcript: string) => void
}

/**
 * How long to wait before reopening a session the engine closed on its own.
 *
 * Long enough that the previous recognizer has certainly finished closing,
 * because calling "start" on one that is still stopping throws. Short enough
 * that the gap is not noticed.
 */
const REOPEN_DELAY_MS = 250

/**
 * How many consecutive silent stretches are tolerated before the microphone
 * gives up on its own.
 *
 * One stretch means nothing at all, because a speaker thinking mid sentence
 * is not a failure and Chrome closes the session every time they pause. Three
 * in a row means nobody has spoken for the better part of half a minute,
 * which is a microphone left on rather than a dictation. The count resets as
 * soon as anything at all is heard, so this cannot accumulate across a long
 * dictation that merely happens to contain several pauses.
 */
const SILENT_STRECH_LIMIT = 3

export function useSpeechRecognition(options: SpeechRecognitionOptions = {}) {
  /**
   * Whether this browser can do recognition at all. Null until the component
   * is mounted, because the constructors only exist on the client and the
   * answer must not be baked into the server rendered markup.
   */
  const supported = ref<boolean | null>(null)

  /** True from the moment the microphone is switched on until it is off. */
  const listening = ref(false)

  /** The guess currently being spoken, shown while listening. */
  const interim = ref('')

  /** The last refusal, cleared by the next attempt. */
  const failure = ref<FriendlyError | null>(null)

  /** The recognizer currently holding the microphone, if any. */
  let recognition: SpeechRecognition | null = null

  /**
   * Whether the user wants the microphone on, which outlives any single
   * recognizer. An "end" event checks this: the engine closing on its own is
   * reopened, the user closing it is not.
   */
  let wanted = false

  /** Pending reopen, so a second "end" cannot schedule a second one. */
  let reopenTimer: ReturnType<typeof setTimeout> | null = null

  /** Consecutive silent stretches within the current dictation. */
  let silentStretches = 0

  /**
   * Resolves the constructor under either name, or null when the browser has
   * neither. Both are declared on Window in app/types/speech.d.ts, since
   * lib.dom.d.ts knows neither.
   */
  function resolveFactory(): SpeechRecognitionFactory | null {
    if (import.meta.server) return null
    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
  }

  /**
   * Whether an event still comes from the recognizer holding the
   * microphone.
   *
   * Closing a session does not silence the one already in flight: its
   * queued events can still arrive afterwards, and the user may well have
   * switched the microphone back on by then. Acting on a stale event would
   * either write words from a session that was already abandoned into the
   * field, or blame the new session for a refusal the old one earned.
   */
  function owns(mine: SpeechRecognition): boolean {
    return recognition === mine
  }

  /**
   * Hands each result to the caller, split by whether the engine has
   * committed to it.
   *
   * Only results from "resultIndex" onwards are new, and walking the whole
   * list would re-announce every phrase of the session, so the walk starts
   * where the event says the change began.
   */
  function handleResult(mine: SpeechRecognition, event: SpeechRecognitionEvent): void {
    if (!owns(mine)) return

    let guess = ''

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      const alternative = result?.[0]
      if (!alternative) continue

      const words = alternative.transcript.trim()
      if (!words) continue

      // Anything heard at all means the user is still speaking, so the
      // patience with silence starts over here rather than in "start".
      silentStretches = 0

      if (result.isFinal) {
        options.onFinal?.(words)
      } else {
        guess += `${words} `
      }
    }

    interim.value = guess.trim()
  }

  /**
   * Turns an engine error into something worth reading, or into nothing at
   * all when it is not a failure.
   *
   * "no-speech" is the interesting one: the engine reports it whenever it
   * hears nothing for a while, which for someone pausing mid sentence is
   * indistinguishable from working. It counts towards giving up instead of
   * being raised.
   */
  function handleError(mine: SpeechRecognition, event: SpeechRecognitionErrorEvent): void {
    if (!owns(mine)) return

    switch (event.error) {
      case 'no-speech':
        silentStretches += 1
        if (silentStretches < SILENT_STRECH_LIMIT) return

        // Nobody has spoken for a while. Drop the microphone rather than
        // reopening forever against a room that has gone quiet.
        wanted = false
        listening.value = false
        failure.value = {
          title: 'Stopped listening',
          detail: 'Nothing was picked up for a while, so the microphone was switched off.',
          items: [],
          retryable: true,
        }
        return

      case 'aborted':
        // Both "stop" and "abort" raise this. It is the expected consequence
        // of switching the microphone off, never something to report.
        return

      case 'not-allowed':
      case 'service-not-allowed':
        wanted = false
        listening.value = false
        failure.value = {
          title: 'Microphone blocked',
          detail:
            'The browser is not allowed to use the microphone. Allow it for this site, then try again.',
          items: [],
          retryable: true,
        }
        return

      case 'audio-capture':
        wanted = false
        listening.value = false
        failure.value = {
          title: 'No microphone found',
          detail: 'No microphone is available, or another application is holding it.',
          items: [],
          retryable: true,
        }
        return

      default:
        // "network" and anything unrecognised. The engine's own wording is
        // passed on only when it actually says something, because the code
        // on its own reads as a developer note rather than an explanation.
        wanted = false
        listening.value = false
        failure.value = {
          title: 'Dictation stopped',
          detail: event.message?.trim() || `Speech recognition failed (${event.error}).`,
          items: [],
          retryable: true,
        }
    }
  }

  /**
   * Reopens a session the engine closed by itself.
   *
   * Guarded on ownership for the same reason as the other two handlers, but
   * stated separately because it is load bearing here in a way it is not
   * elsewhere: without the check, switching the microphone off and straight
   * back on would leave two recognizers running at once.
   */
  function handleEnd(ended: SpeechRecognition): void {
    if (!owns(ended)) return

    recognition = null
    interim.value = ''

    if (!wanted) {
      listening.value = false
      return
    }

    if (reopenTimer) return

    reopenTimer = setTimeout(() => {
      reopenTimer = null
      if (wanted) open()
    }, REOPEN_DELAY_MS)
  }

  /**
   * Builds a recognizer, wires it up and starts it.
   *
   * A new instance is built for every session rather than reused, because
   * reusing one means calling "start" on a recognizer that may still be
   * closing, which throws. The cost is one object per pause.
   */
  function open(): void {
    const factory = resolveFactory()
    if (!factory) {
      wanted = false
      listening.value = false
      failure.value = {
        title: 'Dictation unavailable',
        detail: 'This browser cannot recognise speech. Typing works as usual.',
        items: [],
        retryable: false,
      }
      return
    }

    const instance = new factory()
    recognition = instance

    instance.lang = options.lang?.trim() || window.navigator.language || 'en-US'
    instance.continuous = true
    instance.interimResults = true
    instance.maxAlternatives = 1

    instance.onresult = (event) => handleResult(instance, event)
    instance.onerror = (event) => handleError(instance, event)
    instance.onend = () => handleEnd(instance)

    try {
      instance.start()
    } catch {
      // "start" rejects a recognizer that is already running, which happens
      // if the previous one has not finished closing. Treated as a failed
      // attempt rather than a crash: the user can simply try again.
      recognition = null
      wanted = false
      listening.value = false
      failure.value = {
        title: 'Could not start the microphone',
        detail: 'The browser refused to start listening. Try again in a moment.',
        items: [],
        retryable: true,
      }
    }
  }

  /** Switches the microphone on. Does nothing when it is already on. */
  function start(): void {
    if (wanted || supported.value === false) return

    failure.value = null
    interim.value = ''
    silentStretches = 0
    wanted = true
    listening.value = true

    open()
  }

  /**
   * Switches the microphone off.
   *
   * "abort" is used rather than "stop" because there is nothing to salvage:
   * the interim guess never reached the field and the settled text has
   * already been handed over. It also takes effect at once, which matters
   * because the composer is frequently about to unmount.
   */
  function stop(): void {
    wanted = false
    listening.value = false
    interim.value = ''

    if (reopenTimer) {
      clearTimeout(reopenTimer)
      reopenTimer = null
    }

    const current = recognition
    recognition = null

    // Cleared before aborting so the event this raises finds no owner to act
    // on, which is what stops a stale session reopening anything.
    current?.abort()
  }

  function toggle(): void {
    if (wanted) stop()
    else start()
  }

  /**
   * Asked once the component is on the client, so the server rendered markup
   * does not claim a feature this browser may not have.
   */
  onMounted(() => {
    supported.value = resolveFactory() !== null
  })

  /**
   * The microphone follows the component, so navigating away must switch it
   * off. "abort" alone is enough, because it fires no "end" that could
   * reopen anything.
   */
  onScopeDispose(stop)

  return {
    supported,
    listening,
    interim,
    failure,
    start,
    stop,
    toggle,
  }
}