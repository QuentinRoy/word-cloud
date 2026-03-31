/**
 * Plain serializable data that describes a word. Used as input for
 * {@link HTMLWordCloudElement.addWord} and {@link HTMLWordCloudElement.setWords}.
 */
export interface WordData {
	/** The displayed word content. */
	word: string
	/** Horizontal center position in pixels. */
	x: number
	/** Vertical center position in pixels. */
	y: number
	/** Rotation in radians. Defaults to `0`. */
	angle?: number
	/** Checked state. Defaults to `false`. */
	checked?: boolean
}

interface WordEntryConfig {
	word: string
	getX: () => number
	getY: () => number
	getAngle: () => number
	getChecked: () => boolean
	setChecked: (checked: boolean) => void
	remove: () => void
}

/**
 * A live handle to a word managed by {@link HTMLWordCloudElement}.
 *
 * All property reads reflect the current physics position and DOM state —
 * there is no stale snapshot. Obtain instances via
 * {@link HTMLWordCloudElement.addWord} or {@link HTMLWordCloudElement.getWords}.
 */
export class WordEntry implements WordData {
	#config: WordEntryConfig

	/** @internal */
	constructor(data: WordEntryConfig) {
		this.#config = data
	}

	/** The displayed text of this word. */
	get word(): string {
		return this.#config.word
	}

	/** Current horizontal center position in pixels. */
	get x(): number {
		return this.#config.getX()
	}

	/** Current vertical center position in pixels. */
	get y(): number {
		return this.#config.getY()
	}

	/** Current rotation of the physics body in radians. */
	get angle(): number {
		return this.#config.getAngle()
	}

	/** Whether this word is currently marked as checked. */
	get checked(): boolean {
		return this.#config.getChecked()
	}

	/**
	 * Programmatically sets the checked state of this word.
	 * Triggers a `word-checked-change` event on the parent cloud element if the
	 * value actually changes.
	 */
	set checked(value: boolean) {
		this.#config.setChecked(value)
	}

	/**
	 * Removes this word from the cloud.
	 * Dispatches a `word-delete` event from the parent cloud element.
	 */
	remove(): void {
		this.#config.remove()
	}
}
