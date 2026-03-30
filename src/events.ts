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
