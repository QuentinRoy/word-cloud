import type { Body } from "matter-js"
import type { WordRemoveOptions } from "./word-cloud-element.ts"
import type { HTMLWordElement } from "./word-element.ts"
import {
	WordElementCheckedChangeEvent,
	WordElementDeleteEvent,
	WordElementValueChangeEvent,
} from "./word-element.ts"
import { WordHandle } from "./word-handle.ts"

/** Measured layout size of a word, in pixels. */
export interface WordSize {
	width: number
	height: number
}

/** Frozen rotational inertia captured while a word is drag-locked. */
export interface DragLock {
	initialInertia: number
}

/**
 * Callbacks the cloud supplies so a {@link Word} can route its element's events
 * out without referencing the cloud's `dispatchEvent` directly. This keeps the
 * unit self-contained and node-testable.
 */
export interface WordCallbacks {
	/** The word element requested its own deletion. */
	onDelete: () => void
	/** The word element's checked state changed. */
	onCheckedChange: (checked: boolean) => void
	/** The word element's text value changed. */
	onValueChange: (change: { value: string; oldValue: string }) => void
}

export interface WordOptions extends WordCallbacks {
	/** The Matter body that drives this word's position and angle. */
	body: Body
	/** The DOM element rendering this word. */
	element: HTMLWordElement
	/** The measured layout size of {@link element}, tracked separately. */
	bodySize: WordSize
	/** Whether the word still ignores the input volume (freshly-spawned grace). */
	ignoreInputVolumeUntilExit: boolean
	/** Removes this word from the cloud (used by the public handle). */
	remove: (options?: WordRemoveOptions) => void
}

/**
 * The full per-word unit: its physics {@link body}, its DOM {@link element}, the
 * live {@link handle} exposed to consumers, and the drag-lock state. It builds
 * its own {@link WordHandle} (position/angle from the body, text/checked from the
 * element) and wires the element's delete / checked-change / value-change events
 * to the callbacks the cloud supplies — keeping the cloud's `dispatchEvent` out
 * of the unit.
 */
export class Word {
	/** The word's id, shared with its Matter body. */
	readonly id: number
	readonly body: Body
	readonly element: HTMLWordElement
	/** The live, consumer-facing handle for this word. */
	readonly handle: WordHandle
	/** The measured layout size of {@link element}, tracked separately because a
	 * Matter body does not carry the laid-out width/height. */
	bodySize: WordSize
	/** Cleared once a freshly-spawned word has left the input volume once. */
	ignoreInputVolumeUntilExit: boolean
	/** Non-null while the word is held by a drag; stores its pre-lock inertia. */
	dragLock: DragLock | null = null
	#detachElementListeners: () => void

	constructor({
		body,
		element,
		bodySize,
		ignoreInputVolumeUntilExit,
		remove,
		onDelete,
		onCheckedChange,
		onValueChange,
	}: WordOptions) {
		this.id = body.id
		this.body = body
		this.element = element
		this.bodySize = bodySize
		this.ignoreInputVolumeUntilExit = ignoreInputVolumeUntilExit
		this.handle = new WordHandle({
			getWord: () => element.value ?? "",
			setWord: (value) => {
				element.value = value
			},
			getX: () => body.position.x,
			getY: () => body.position.y,
			getAngle: () => body.angle,
			getChecked: () => element.checked,
			setChecked: (value) => {
				element.checked = value
			},
			remove,
		})

		const handleDelete = () => onDelete()
		const handleCheckedChange = () => onCheckedChange(element.checked)
		const handleValueChange = (event: Event) => {
			const { value, oldValue } = event as WordElementValueChangeEvent
			onValueChange({ value, oldValue })
		}
		element.addEventListener(WordElementDeleteEvent.type, handleDelete)
		element.addEventListener(
			WordElementCheckedChangeEvent.type,
			handleCheckedChange,
		)
		element.addEventListener(
			WordElementValueChangeEvent.type,
			handleValueChange,
		)
		this.#detachElementListeners = () => {
			element.removeEventListener(WordElementDeleteEvent.type, handleDelete)
			element.removeEventListener(
				WordElementCheckedChangeEvent.type,
				handleCheckedChange,
			)
			element.removeEventListener(
				WordElementValueChangeEvent.type,
				handleValueChange,
			)
		}
	}

	/** Detaches the element event listeners. Called when the word is removed. */
	dispose() {
		this.#detachElementListeners()
	}
}

/**
 * The single source of truth for the words in a cloud. Answers the two lookups
 * the cloud needs — by body id (drag start/end) and by element (the word
 * `ResizeObserver`) — behind one collection.
 */
export class WordRegistry {
	#byId: Map<number, Word> = new Map()
	#byElement: WeakMap<HTMLWordElement, Word> = new WeakMap()

	add(word: Word) {
		this.#byId.set(word.id, word)
		this.#byElement.set(word.element, word)
	}

	get(id: number): Word | undefined {
		return this.#byId.get(id)
	}

	getByElement(element: HTMLWordElement): Word | undefined {
		return this.#byElement.get(element)
	}

	delete(word: Word) {
		this.#byId.delete(word.id)
		this.#byElement.delete(word.element)
	}

	values(): IterableIterator<Word> {
		return this.#byId.values()
	}
}
