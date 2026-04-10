import type { WordAction as WordCloudWordAction } from "./word-cloud-element.ts"
import type { WordHandle } from "./word-handle.ts"

/**
 * Base class for all events dispatched by {@link HTMLWordCloudElement}.
 * Events bubble and are composed.
 */
export class WordCloudEvent extends Event {
	#handle: WordHandle

	/**
	 * Creates a new word-cloud event.
	 *
	 * @param data.type The event type.
	 * @param data.handle The live word handle associated with this event.
	 * @param init Additional event init options.
	 */
	constructor(
		{ type, handle }: { type: string; handle: WordHandle },
		init?: EventInit,
	) {
		super(type, { bubbles: true, composed: true, ...init })
		this.#handle = handle
	}

	/**
	 * The live {@link WordHandle} for the word that triggered this event.
	 * Property reads on the handle always reflect the current state of the word.
	 */
	get handle(): WordHandle {
		return this.#handle
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
	 * @param data.handle The live handle that was just added.
	 */
	constructor({ handle }: { handle: WordHandle }) {
		super({ type: WordAddEvent.type, handle })
	}
}

/**
 * Fired by {@link HTMLWordCloudElement} when a word's checked state changes —
 * either through user interaction while `wordAction` is `check` or
 * programmatically via {@link WordHandle.checked}.
 *
 * Listen with `"word-check"` or {@link WordCheckEvent.type}.
 */
export class WordCheckEvent extends WordCloudEvent {
	#checked: boolean

	/** Event type string for checked-state changes. */
	static get type() {
		return "word-check" as const
	}

	/**
	 * @param data.handle The live handle whose checked state changed.
	 * @param data.checked The new checked state at dispatch time.
	 */
	constructor({ handle, checked }: { handle: WordHandle; checked: boolean }) {
		super({ type: WordCheckEvent.type, handle })
		this.#checked = checked
	}

	/** The new checked state at dispatch time. */
	get checked(): boolean {
		// We do not use handle.checked here because the event should reflect the new checked
		// state even while handle.checked is live and will change if the event handlers change
		// it again.
		return this.#checked
	}
}

/**
 * Fired by {@link HTMLWordCloudElement} when a word's text changes — either
 * through direct updates to the underlying word element or programmatically via
 * {@link WordHandle.word}.
 *
 * Listen with `"word-change"` or {@link WordChangeEvent.type}.
 */
export class WordChangeEvent extends WordCloudEvent {
	#value: string
	#oldValue: string

	/** Event type string for word-text changes. */
	static get type() {
		return "word-change" as const
	}

	/**
	 * @param data.handle The live handle whose text changed.
	 * @param data.value The new word text at dispatch time.
	 * @param data.oldValue The previous word text before the change.
	 */
	constructor({
		handle,
		value,
		oldValue,
	}: { handle: WordHandle; value: string; oldValue: string }) {
		super({ type: WordChangeEvent.type, handle })
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
 * Fired by {@link HTMLWordCloudElement} when a word is removed from the cloud,
 * whether by user interaction while `wordAction` is `delete` or through
 * {@link WordHandle.remove}.
 *
 * The associated physics body is removed immediately. The DOM element may stay
 * mounted until its exit animation completes.
 *
 * Listen with `"word-delete"` or {@link WordDeleteEvent.type}.
 */
export class WordDeleteEvent extends WordCloudEvent {
	/** Event type string for word deletions. */
	static get type() {
		return "word-delete" as const
	}

	/**
	 * @param data.handle The live handle that is being removed.
	 */
	constructor({ handle }: { handle: WordHandle }) {
		super({ type: WordDeleteEvent.type, handle })
	}
}

/**
 * Fired by {@link HTMLWordCloudElement} when its `wordAction` changes.
 *
 * Listen with `"word-action-change"` or
 * {@link WordActionChangeEvent.type}.
 */
export class WordActionChangeEvent extends Event {
	#wordAction: WordCloudWordAction
	#oldWordAction: WordCloudWordAction

	/** Event type string for word-action changes. */
	static get type() {
		return "word-action-change" as const
	}

	/**
	 * @param data.wordAction The new word action after the change.
	 * @param data.oldWordAction The previous word action before the change.
	 */
	constructor({
		wordAction,
		oldWordAction,
	}: { wordAction: WordCloudWordAction; oldWordAction: WordCloudWordAction }) {
		super(WordActionChangeEvent.type, { bubbles: true, composed: true })
		this.#wordAction = wordAction
		this.#oldWordAction = oldWordAction
	}

	/** The new word action after the change. */
	get wordAction(): WordCloudWordAction {
		return this.#wordAction
	}

	/** The previous word action before the change. */
	get oldWordAction(): WordCloudWordAction {
		return this.#oldWordAction
	}
}

/**
 * Fired by {@link HTMLWordCloudElement} when its `wordInput` setting changes.
 *
 * Listen with `"word-input-toggle"` or
 * {@link WordInputToggleEvent.type}.
 */
export class WordInputToggleEvent extends Event {
	#wordInput: boolean
	#oldWordInput: boolean

	/** Event type string for word-input-setting changes. */
	static get type() {
		return "word-input-toggle" as const
	}

	/**
	 * @param data.wordInput The new wordInput setting after the change.
	 * @param data.oldWordInput The previous wordInput setting before the change.
	 */
	constructor({
		wordInput,
		oldWordInput,
	}: { wordInput: boolean; oldWordInput: boolean }) {
		super(WordInputToggleEvent.type, { bubbles: true, composed: true })
		this.#wordInput = wordInput
		this.#oldWordInput = oldWordInput
	}

	/** The new wordInput setting after the change. */
	get wordInput(): boolean {
		return this.#wordInput
	}

	/** The previous wordInput setting before the change. */
	get oldWordInput(): boolean {
		return this.#oldWordInput
	}
}

/**
 * Fired by {@link HTMLWordCloudElement} when its `physicsPaused` setting
 * changes.
 *
 * Listen with `"physics-pause"` or
 * {@link PhysicsPauseEvent.type}.
 */
export class PhysicsPauseEvent extends Event {
	#physicsPaused: boolean
	#oldPhysicsPaused: boolean

	/** Event type string for physics-paused-setting changes. */
	static get type() {
		return "physics-pause" as const
	}

	/**
	 * @param data.physicsPaused The new physicsPaused setting after the change.
	 * @param data.oldPhysicsPaused The previous physicsPaused setting before the change.
	 */
	constructor({
		physicsPaused,
		oldPhysicsPaused,
	}: { physicsPaused: boolean; oldPhysicsPaused: boolean }) {
		super(PhysicsPauseEvent.type, { bubbles: true, composed: true })
		this.#physicsPaused = physicsPaused
		this.#oldPhysicsPaused = oldPhysicsPaused
	}

	/** The new physicsPaused setting after the change. */
	get physicsPaused(): boolean {
		return this.#physicsPaused
	}

	/** The previous physicsPaused setting before the change. */
	get oldPhysicsPaused(): boolean {
		return this.#oldPhysicsPaused
	}
}
