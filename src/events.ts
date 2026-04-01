import type { Mode as WordCloudMode } from "./word-cloud-element.ts"
import type { WordEntry } from "./word-entry.ts"

/**
 * Base class for all events dispatched by {@link HTMLWordCloudElement}.
 * Events bubble and are composed.
 */
export class WordCloudEvent extends Event {
	#entry: WordEntry

	/**
	 * Creates a new word-cloud event.
	 *
	 * @param data.type The event type.
	 * @param data.entry The live word entry associated with this event.
	 * @param init Additional event init options.
	 */
	constructor(
		{ type, entry }: { type: string; entry: WordEntry },
		init?: EventInit,
	) {
		super(type, { bubbles: true, composed: true, ...init })
		this.#entry = entry
	}

	/**
	 * The live {@link WordEntry} for the word that triggered this event.
	 * Property reads on the entry always reflect the current state of the word.
	 */
	get entry(): WordEntry {
		return this.#entry
	}
}

/**
 * Fired by {@link HTMLWordCloudElement} when a new word is added to the cloud.
 * This includes direct calls to {@link HTMLWordCloudElement.addWord}, words
 * restored through {@link HTMLWordCloudElement.setWords}, and words created by
 * the built-in input form.
 *
 * Listen with `"word-add"` or {@link WordAddEvent.type}.
 */
export class WordAddEvent extends WordCloudEvent {
	/** Event type string for word additions. */
	static get type() {
		return "word-add" as const
	}

	/**
	 * @param data.entry The live entry that was just added.
	 */
	constructor({ entry }: { entry: WordEntry }) {
		super({ type: WordAddEvent.type, entry })
	}
}

/**
 * Fired by {@link HTMLWordCloudElement} when a word's checked state changes —
 * either through user interaction (in `mark` mode) or programmatically via
 * {@link WordEntry.checked}.
 *
 * Listen with `"word-checked-change"` or {@link WordCheckedChangeEvent.type}.
 */
export class WordCheckedChangeEvent extends WordCloudEvent {
	#checked: boolean

	/** Event type string for checked-state changes. */
	static get type() {
		return "word-checked-change" as const
	}

	/**
	 * @param data.entry The live entry whose checked state changed.
	 * @param data.checked The new checked state at dispatch time.
	 */
	constructor({ entry, checked }: { entry: WordEntry; checked: boolean }) {
		super({ type: WordCheckedChangeEvent.type, entry })
		this.#checked = checked
	}

	/** The new checked state at dispatch time. */
	get checked(): boolean {
		// We do not use entry.checked here because the event should reflect the new checked
		// state even while entry.checked is live and will change if the event handlers change
		// it again.
		return this.#checked
	}
}

/**
 * Fired by {@link HTMLWordCloudElement} when a word's text changes — either
 * through direct updates to the underlying word element or programmatically via
 * {@link WordEntry.word}.
 *
 * Listen with `"word-value-change"` or {@link WordValueChangeEvent.type}.
 */
export class WordValueChangeEvent extends WordCloudEvent {
	#value: string
	#oldValue: string

	/** Event type string for word-text changes. */
	static get type() {
		return "word-value-change" as const
	}

	/**
	 * @param data.entry The live entry whose text changed.
	 * @param data.value The new word text at dispatch time.
	 * @param data.oldValue The previous word text before the change.
	 */
	constructor({
		entry,
		value,
		oldValue,
	}: { entry: WordEntry; value: string; oldValue: string }) {
		super({ type: WordValueChangeEvent.type, entry })
		this.#value = value
		this.#oldValue = oldValue
	}

	/** The new word text at dispatch time. */
	get value(): string {
		return this.#value
	}

	/** The previous word text before the change. */
	get oldValue(): string {
		return this.#oldValue
	}
}

/**
 * Fired by {@link HTMLWordCloudElement} when the user deletes a word in
 * `delete` mode. The word is removed from the cloud immediately after all
 * event listeners have run.
 *
 * Listen with `"word-delete"` or {@link WordDeleteEvent.type}.
 */
export class WordDeleteEvent extends WordCloudEvent {
	/** Event type string for word deletions. */
	static get type() {
		return "word-delete" as const
	}

	/**
	 * @param data.entry The live entry that is about to be deleted.
	 */
	constructor({ entry }: { entry: WordEntry }) {
		super({ type: WordDeleteEvent.type, entry })
	}
}

/**
 * Fired by {@link HTMLWordCloudElement} when its `mode` changes.
 *
 * Listen with `"mode-change"` or {@link WordCloudModeChangeEvent.type}.
 */
export class WordCloudModeChangeEvent extends Event {
	#mode: WordCloudMode | null
	#oldMode: WordCloudMode | null

	/** Event type string for mode changes. */
	static get type() {
		return "mode-change" as const
	}

	/**
	 * @param data.mode The new mode after the change.
	 * @param data.oldMode The previous mode before the change.
	 */
	constructor({
		mode,
		oldMode,
	}: { mode: WordCloudMode | null; oldMode: WordCloudMode | null }) {
		super(WordCloudModeChangeEvent.type, { bubbles: true, composed: true })
		this.#mode = mode
		this.#oldMode = oldMode
	}

	/** The new mode after the change. */
	get mode(): WordCloudMode | null {
		return this.#mode
	}

	/** The previous mode before the change. */
	get oldMode(): WordCloudMode | null {
		return this.#oldMode
	}
}
