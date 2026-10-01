/**
 * The parts of the Web Speech API that TypeScript does not ship.
 *
 * lib.dom.d.ts declares the shape of a recognition result
 * (SpeechRecognitionAlternative, SpeechRecognitionResult and
 * SpeechRecognitionResultList) but not the recognizer itself, the events it
 * fires or the two constructors, so what is below is the missing half of an
 * API that is otherwise fully described by the compiler.
 *
 * Only the four handlers the composer actually uses are declared. The rest of
 * the interface is deliberately absent: declaring the whole event surface
 * would be a copy of the spec that nothing here reads, and the compiler
 * already refuses an unknown handler on these two objects, so a typo in one
 * of these four is still caught.
 *
 * The constructor is exposed twice because no browser agrees on one name:
 * Chrome, Edge and Safari 14.1+ expose it unprefixed, while Safari before
 * that and current Chromium builds only answer to "webkitSpeechRecognition".
 * Both are optional on Window because neither is guaranteed to exist at all,
 * which is the whole reason the composer asks before showing a mic.
 */

interface SpeechRecognitionEvent extends Event {
  /** Index of the first result that changed since the last event. */
  readonly resultIndex: number
  /** Every result of the session so far, final and interim alike. */
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  /**
   * A short machine readable code: "not-allowed" when the permission was
   * refused, "no-speech" when the engine heard nothing, and so on.
   */
  readonly error: string
  /** A human readable form of the same, when the browser provides one. */
  readonly message: string
}

interface SpeechRecognition extends EventTarget {
  /** BCP 47 tag, for example "en-US". */
  lang: string
  /**
   * Keep listening past the end of a phrase. Chrome still closes the
   * session after a pause even when this is true, so it is necessary but
   * not sufficient, and the composable reopens the session itself.
   */
  continuous: boolean
  /** Report the text guessed so far as well as the settled text. */
  interimResults: boolean
  /** How many alternatives to keep per result. Only the first is read. */
  maxAlternatives: number

  /** Begins listening. Throws if the recognizer is already running. */
  start(): void
  /** Stops listening, asking for a final result first. */
  stop(): void
  /** Stops listening immediately, discarding anything pending. */
  abort(): void

  onstart: ((this: SpeechRecognition, ev: Event) => unknown) | null
  onend: ((this: SpeechRecognition, ev: Event) => unknown) | null
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown) | null
}

/**
 * The shape both constructor names have. Kept apart from the interface above
 * so a value can be checked for before anything is instantiated.
 */
interface SpeechRecognitionFactory {
  new (): SpeechRecognition
  prototype: SpeechRecognition
}

interface Window {
  /** Chrome, Edge, Safari 14.1 and newer. */
  SpeechRecognition?: SpeechRecognitionFactory
  /** Safari before 14.1, and older Chromium builds. */
  webkitSpeechRecognition?: SpeechRecognitionFactory
}