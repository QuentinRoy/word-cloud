import {
	boolean,
	number,
	pickList,
	WithAttributeProps,
} from "@quentinroy/custom-element-mixins"
import { Render } from "matter-js"
import { DragController } from "./drag-controller.ts"
import {
	PhysicsPauseEvent,
	WordActionChangeEvent,
	WordAddEvent,
	WordChangeEvent,
	WordCheckEvent,
	WordDeleteEvent,
	WordInputToggleEvent,
} from "./events.ts"
import { REPULSION_MARGIN } from "./spacing-model.ts"
import {
	generateRandomId,
	isIterable,
	queryStrict,
	type RequiredKeysOf,
	type SetOptional,
	toPrecision,
} from "./utils.ts"
import { Word, WordRegistry } from "./word.ts"
import mainStylesheet from "./word-cloud-element.css?stylesheet"
import mainTemplate from "./word-cloud-element.html?template"
import { CHAMFER_RADIUS, WordCloudSimulation } from "./word-cloud-simulation.ts"
import {
	HTMLWordElement,
	type WordElementEntryAnimation,
	type WordElementExitAnimation,
} from "./word-element.ts"
import type { WordData, WordHandle } from "./word-handle.ts"

const USE_DEBUG_RENDERER = false
const MIN_RANDOM_VELOCITY = 10
const MAX_RANDOM_VELOCITY = 40
const TRANSLATE_PRECISION = 1
const ROTATE_PRECISION = 3

let scopedElementRegistry: CustomElementRegistry | null = null
let wordElementTagName = "x-word"

try {
	scopedElementRegistry = new CustomElementRegistry()
	scopedElementRegistry.define(wordElementTagName, HTMLWordElement)
} catch {
	// In case CustomElementRegistry is not supported, fall back to global registry
	// with a random tag name to avoid conflicts
	wordElementTagName = `x-word-${generateRandomId()}`
	customElements.define(wordElementTagName, HTMLWordElement)
}

/** Linear velocity vector applied to a word body on creation. */
interface WordVelocity {
	x: number
	y: number
}

/**
 * Options used to add a single word to the cloud.
 */
type AddWordOptions = WordData & {
	/** The initial linear velocity applied to the word body. */
	velocity?: WordVelocity
	/** Which entry animation to run when the word element is created. */
	entryAnimation?: WordElementEntryAnimation | "none"
	/**
	 * Internal behavior used for words spawned by the input form.
	 * While true, collisions with the input volume stay disabled until the body
	 * leaves that volume once.
	 */
	ignoreInputVolumeUntilExit?: boolean
}

/**
 * Optional default values for add().
 * Accepts any AddWordOptions property except 'word'.
 */
type AddWordDefaults = Omit<Partial<AddWordOptions>, "word">

/**
 * AddWordInput: All required fields except 'word' become optional if present in defaults.
 * Only consumes required keys from AddWordOptions (except 'word').
 */
type AddWordInput<Default extends AddWordDefaults = Record<never, unknown>> =
	SetOptional<AddWordOptions, RequiredKeysOf<Default> & keyof AddWordDefaults>

export const WORD_ACTIONS = ["none", "drag", "check", "delete"] as const
export type WordAction = (typeof WORD_ACTIONS)[number]

function isWordAction(value: unknown): value is WordAction {
	return (WORD_ACTIONS as readonly unknown[]).includes(value)
}

interface HTMLWordCloudElementEventMap extends HTMLElementEventMap {
	[WordAddEvent.type]: WordAddEvent
	[WordCheckEvent.type]: WordCheckEvent
	[WordDeleteEvent.type]: WordDeleteEvent
	[PhysicsPauseEvent.type]: PhysicsPauseEvent
	[WordInputToggleEvent.type]: WordInputToggleEvent
	[WordActionChangeEvent.type]: WordActionChangeEvent
	[WordChangeEvent.type]: WordChangeEvent
}

/**
 * Custom element that renders an interactive word cloud powered by Matter.js.
 *
 * The element manages DOM-backed word items, keeps them synchronized with
 * physics bodies, and exposes a small API for adding, removing, clearing,
 * serializing, and restoring words.
 */
export class HTMLWordCloudElement extends WithAttributeProps(HTMLElement, {
	wordAction: pickList({ values: WORD_ACTIONS, default: "none" }),
	wordInput: boolean(),
	showFramerate: boolean(),
	physicsPaused: boolean(),
	// Spacing margins, in pixels: the distance within which the soft repulsion
	// keeps words apart from each other, the frame, and the input volume.
	wordSpacing: number({ default: REPULSION_MARGIN }),
	edgeSpacing: number({ default: REPULSION_MARGIN }),
	inputSpacing: number({ default: REPULSION_MARGIN }),
}) {
	static #elementActionMaps: Record<WordAction, HTMLWordElement["action"]> = {
		none: null,
		drag: null,
		check: "check",
		delete: "delete",
	}

	/**
	 * Measures a word element's rendered size for its physics body. Uses the
	 * computed-style width/height — which are sub-pixel and unaffected by CSS
	 * transforms — rather than offsetWidth/offsetHeight, which are integer-rounded.
	 * The body is positioned and rendered from this size (see {@link #getWordTransform}),
	 * so a rounded value makes the body up to ~0.5px narrower/wider than the chip
	 * the user sees, misaligning drag hit-testing from the grab cursor (#39). Falls
	 * back to the rounded box metrics when the element is not laid out.
	 */
	static #measureWordSize(element: HTMLElement) {
		const style = getComputedStyle(element)
		const width = Number.parseFloat(style.width)
		const height = Number.parseFloat(style.height)
		return {
			width: Number.isFinite(width) ? width : element.offsetWidth,
			height: Number.isFinite(height) ? height : element.offsetHeight,
		}
	}

	#wordForm: HTMLFormElement
	#wordInput: HTMLInputElement
	#container: HTMLElement
	#sim = new WordCloudSimulation()
	#words = new WordRegistry()
	#dragController!: DragController<Word>
	#dragOffset = { x: 0, y: 0 }
	#framerateDisplay: HTMLElement
	#containerResizeObserver = new ResizeObserver(() => {
		this.#sim.setFrameSize({
			width: this.#container.offsetWidth,
			height: this.#container.offsetHeight,
		})
		this.#syncInputVolume()
	})
	#inputResizeObserver = new ResizeObserver(() => {
		this.#syncInputVolume()
	})
	#wordResizeObserver = new ResizeObserver((entries) => {
		for (const { target } of entries) {
			if (!(target instanceof HTMLWordElement)) continue
			const word = this.#words.getByElement(target)
			if (word != null) this.#updateWordBodySize(word)
		}
	})
	#internals = this.attachInternals()
	#debugRender: Render | null = null

	/**
	 * Creates a word cloud instance and initializes its shadow DOM, physics
	 * simulation, and drag controller.
	 */
	constructor() {
		super()
		const { container, wordForm, wordInput, framerateDisplay } =
			this.#setupShadowDom()
		this.#container = container
		this.#wordForm = wordForm
		this.#wordInput = wordInput
		this.#framerateDisplay = framerateDisplay

		this.#setupContainerStyles()
		this.#setupDragController()
	}

	static get observedAttributes() {
		return [
			"word-action",
			"word-input",
			"physics-paused",
			"word-spacing",
			"edge-spacing",
			"input-spacing",
		] as const
	}

	/**
	 * Reacts to supported attribute changes and keeps the word actions, input
	 * behavior, and dragging state in sync with the current state.
	 *
	 * @param name The name of the attribute that changed.
	 * @param oldValue The previous attribute value.
	 * @param newValue The new attribute value.
	 */
	attributeChangedCallback(
		name: string,
		oldValue: string | null,
		newValue: string | null,
	) {
		switch (name) {
			case "word-action":
				if (newValue !== null && !isWordAction(newValue)) {
					this.removeAttribute("word-action")
				} else {
					const oldWordAction =
						oldValue !== null && isWordAction(oldValue) ? oldValue : "none"
					const wordAction =
						newValue !== null && isWordAction(newValue) ? newValue : "none"
					this.#updateWordsActionFromWordAction()
					this.#updateDragController()
					if (oldWordAction !== wordAction) {
						this.dispatchEvent(
							new WordActionChangeEvent({ oldWordAction, wordAction }),
						)
					}
				}
				break
			case "word-input": {
				const oldWordInput = oldValue !== null
				const wordInput = newValue !== null
				this.#syncInputVolume()
				if (oldWordInput !== wordInput) {
					this.dispatchEvent(
						new WordInputToggleEvent({ oldWordInput, wordInput }),
					)
				}
				break
			}
			case "physics-paused": {
				const oldPhysicsPaused = oldValue !== null
				const physicsPaused = newValue !== null
				if (physicsPaused) {
					this.#stop()
					this.#setFrameRateDisplay(0)
				} else {
					this.#start()
				}
				if (oldPhysicsPaused !== physicsPaused) {
					this.dispatchEvent(
						new PhysicsPauseEvent({ oldPhysicsPaused, physicsPaused }),
					)
				}
				break
			}
			case "word-spacing":
			case "edge-spacing":
			case "input-spacing":
				this.#syncSpacing()
				break
		}
	}

	/**
	 * Attaches DOM and physics listeners, updates the frame geometry, and starts
	 * the physics runner when the element is connected.
	 */
	connectedCallback() {
		this.#wordForm.addEventListener("submit", this.#handleFormSubmit)
		this.#sim.onTick = this.#handleTick
		this.#sim.setFrameSize({
			width: this.#container.offsetWidth,
			height: this.#container.offsetHeight,
		})
		this.#updateWordsActionFromWordAction()
		this.#syncInputVolume()
		this.#syncSpacing()
		this.#updateDragController()
		this.#containerResizeObserver.observe(this.#container)
		this.#inputResizeObserver.observe(this.#wordInput)
		for (const word of this.#words.values()) {
			this.#wordResizeObserver.observe(word.element)
			this.#updateWordBodySize(word)
		}
		if (!this.physicsPaused) this.#start()
	}

	/**
	 * Detaches DOM and physics listeners, stops observing resize events,
	 * and stops the physics runner when the element is disconnected.
	 */
	disconnectedCallback() {
		this.#wordForm.removeEventListener("submit", this.#handleFormSubmit)
		this.#containerResizeObserver.unobserve(this.#container)
		this.#inputResizeObserver.unobserve(this.#wordInput)
		for (const { element } of this.#words.values()) {
			this.#wordResizeObserver.unobserve(element)
		}
		// Cancel any active drag before stopping (clears dragged + active state).
		this.#dragController.enabled = false
		this.#stop()
		this.#sim.onTick = null
	}

	/**
	 * Adds one or more words to the cloud.
	 *
	 * Pass a single options object to add one word, or an iterable to add many.
	 * The optional `defaults` argument is merged into each word before creation —
	 * any required field present in `defaults` becomes optional per-word.
	 * Per-word options always override defaults.
	 *
	 * @example
	 * // Single word
	 * cloud.add({ word: "hello", x: 100, y: 200 });
	 *
	 * @example
	 * // Many words sharing a default position
	 * cloud.add(
	 *   [{ word: "hello" }, { word: "world" }],
	 *   { x: 100, y: 200 }
	 * );
	 *
	 * @returns A single {@link WordHandle} when adding one word,
	 *   or an array of handles when adding an iterable.
	 */
	add<Defaults extends AddWordDefaults>(
		options: AddWordInput<Defaults>,
		defaults: Defaults,
	): WordHandle
	add(options: AddWordInput): WordHandle
	add<Defaults extends AddWordDefaults>(
		options: Iterable<AddWordInput<Defaults>>,
		defaults: Defaults,
	): WordHandle[]
	add(options: Iterable<AddWordInput>): WordHandle[]
	add(
		options:
			| AddWordInput<AddWordDefaults>
			| Iterable<AddWordInput<AddWordDefaults>>,
		defaults?: AddWordDefaults,
	): WordHandle | WordHandle[] {
		if (isIterable(options)) {
			return Array.from(options, (o) =>
				this.#addWord({ ...defaults, ...o } as AddWordOptions),
			)
		}
		return this.#addWord({ ...defaults, ...options } as AddWordOptions)
	}

	#addWord({
		word: text,
		x,
		y,
		angle = 0,
		checked = false,
		velocity,
		entryAnimation = "fade",
		ignoreInputVolumeUntilExit = false,
	}: AddWordOptions): WordHandle {
		let element = document.createElement(wordElementTagName) as HTMLWordElement
		// It seems we need to add element before setting the checked property
		// otherwise it does not update the attribute properly.
		this.#container.appendChild(element)
		element.value = text
		element.checked = checked
		if (entryAnimation !== "none") element.animateEntry(entryAnimation)
		element.classList.add("word")
		element.action = HTMLWordCloudElement.#elementActionMaps[this.wordAction]
		let { width, height } = HTMLWordCloudElement.#measureWordSize(element)

		let word: Word
		const remove = (options: WordRemoveOptions = {}) => {
			options.exitAnimation = options.exitAnimation ?? "fade"
			this.#removeWord(word, options)
		}

		let body = this.#sim.addWord({
			x,
			y,
			width,
			height,
			angle,
			velocity,
			ignoreInputVolumeUntilExit,
		})
		word = new Word({
			body,
			element,
			bodySize: { width, height },
			remove,
			onDelete: () => remove(),
			onCheckedChange: (checked) => {
				this.dispatchEvent(new WordCheckEvent({ handle: word.handle, checked }))
			},
			onValueChange: ({ value, oldValue }) => {
				this.dispatchEvent(
					new WordChangeEvent({ handle: word.handle, value, oldValue }),
				)
			},
		})
		element.style.transform = this.#getWordTransform(word)
		this.#words.add(word)
		this.#wordResizeObserver.observe(element)
		this.dispatchEvent(new WordAddEvent({ handle: word.handle }))
		return word.handle
	}

	async #removeWord(
		word: Word,
		{ exitAnimation = "none" }: WordRemoveOptions = {},
	) {
		if (exitAnimation !== "none") {
			await word.element.animateExit(exitAnimation)
			this.#container.removeChild(word.element)
		} else {
			this.#container.removeChild(word.element)
		}
		this.dispatchEvent(new WordDeleteEvent({ handle: word.handle }))
		this.#removeWordBody(word)
		word.dispose()
		this.#words.delete(word)
	}

	/**
	 * Removes all words from the cloud immediately, without exit animations.
	 */
	clear(options?: WordRemoveOptions) {
		for (let word of this.#words.values()) {
			this.#removeWord(word, options)
		}
	}

	/**
	 * Returns live {@link WordHandle} handles for all words currently in the cloud.
	 *
	 * Handles are live — property reads always reflect current physics state.
	 * Intended for serialization: snapshot positions with `getWords()`,
	 * then restore with `clear()` + `add()`.
	 *
	 * @example
	 * const snapshot = Array.from(cloud.getWords(), w => {
	 *   return { word: w.word, x: w.x, y: w.y, angle: w.angle, checked: w.checked }
	 * });
	 * cloud.clear();
	 * cloud.add(snapshot);
	 */
	*getWords(): Iterable<WordHandle> {
		for (let word of this.#words.values()) {
			yield word.handle
		}
	}

	addEventListener<K extends keyof HTMLWordCloudElementEventMap>(
		type: K,
		listener: (
			this: HTMLWordCloudElement,
			ev: HTMLWordCloudElementEventMap[K],
		) => void,
		options?: boolean | AddEventListenerOptions,
	): void
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | AddEventListenerOptions,
	): void {
		if (listener == null) return
		super.addEventListener(type, listener, options)
	}

	removeEventListener<K extends keyof HTMLWordCloudElementEventMap>(
		type: K,
		listener: (
			this: HTMLWordCloudElement,
			ev: HTMLWordCloudElementEventMap[K],
		) => void,
		options?: boolean | EventListenerOptions,
	): void
	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | EventListenerOptions,
	): void {
		if (listener == null) return
		super.removeEventListener(type, listener, options)
	}

	#setupShadowDom() {
		const shadowRoot = this.attachShadow(
			scopedElementRegistry == null
				? { mode: "closed" }
				: { mode: "closed", customElementRegistry: scopedElementRegistry },
		)
		shadowRoot.appendChild(mainTemplate.cloneNode(true))
		let stylesheets = [mainStylesheet]
		shadowRoot.adoptedStyleSheets = stylesheets
		const container = queryStrict(shadowRoot, ".word-cloud", HTMLElement)
		const wordForm = queryStrict(container, "form", HTMLFormElement)
		const wordInput = queryStrict(container, "input", HTMLInputElement)
		const framerateDisplay = queryStrict(
			container,
			".framerate-display",
			HTMLElement,
		)
		return { container, wordForm, wordInput, framerateDisplay }
	}

	#setupContainerStyles() {
		this.#container.style.setProperty("--chamfer-radius", `${CHAMFER_RADIUS}px`)
		if (USE_DEBUG_RENDERER) {
			this.#container.style.setProperty("--opacity", "0.2")
		}
	}

	#removeWordBody(word: Word) {
		this.#wordResizeObserver.unobserve(word.element)
		this.#sim.removeWord(word.id)
	}

	#updateWordBodySize(word: Word) {
		const nextSize = HTMLWordCloudElement.#measureWordSize(word.element)
		const { width: previousWidth, height: previousHeight } = word.bodySize
		if (
			nextSize.width === previousWidth &&
			nextSize.height === previousHeight
		) {
			return
		}
		this.#sim.setWordSize(word.id, nextSize)
		word.bodySize = nextSize
	}

	#pickRandomVelocity() {
		let angle = Math.random() * 2 * Math.PI
		let speed =
			Math.random() * (MAX_RANDOM_VELOCITY - MIN_RANDOM_VELOCITY) +
			MIN_RANDOM_VELOCITY
		return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }
	}

	/**
	 * Measures the input element and pushes its rect to the simulation, or
	 * clears the input volume entirely when word-input is disabled.
	 */
	#syncInputVolume() {
		if (!this.wordInput) {
			this.#sim.setInputVolume(null)
			return
		}
		const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = this.#wordInput
		this.#sim.setInputVolume({
			x: offsetLeft + offsetWidth / 2,
			y: offsetTop + offsetHeight / 2,
			width: offsetWidth,
			height: offsetHeight,
		})
	}

	/**
	 * Pushes the current spacing attributes to the simulation. `setSpacing`
	 * only resizes sensors when the derived reach actually changes.
	 */
	#syncSpacing() {
		this.#sim.setSpacing({
			word: this.wordSpacing,
			edge: this.edgeSpacing,
			input: this.inputSpacing,
		})
	}

	#handleFormSubmit = (e: SubmitEvent) => {
		e.preventDefault()
		let newWord = this.#wordInput.value.trim()
		if (newWord !== "") {
			if (this.wordInput) this.#syncInputVolume()
			let x = this.#wordInput.offsetLeft + this.#wordInput.offsetWidth / 2
			let y = this.#wordInput.offsetTop + this.#wordInput.offsetHeight / 2
			this.#addWord({
				word: newWord,
				x,
				y,
				angle: 0,
				checked: false,
				velocity: this.#pickRandomVelocity(),
				entryAnimation: "chip-fade",
				ignoreInputVolumeUntilExit: true,
			})
		}
		this.#wordInput.value = ""
	}

	#handleTick = (frameDelta: number) => {
		this.#updateWordPositions()
		if (this.showFramerate) this.#setFrameRateDisplay(1000 / frameDelta)
	}

	#setFrameRateDisplay(fps: number) {
		this.#framerateDisplay.textContent = `${Math.round(fps)} fps`
	}

	#updateWordPositions() {
		for (let word of this.#words.values()) {
			word.element.style.transform = this.#getWordTransform(word)
		}
	}

	#getWordTransform({ body, bodySize: { width, height } }: Word): string {
		let angle = toPrecision(body.angle, ROTATE_PRECISION)
		let translateX = toPrecision(
			body.position.x - width / 2,
			TRANSLATE_PRECISION,
		)
		let translateY = toPrecision(
			body.position.y - height / 2,
			TRANSLATE_PRECISION,
		)
		return angle !== 0
			? `translate(${translateX}px, ${translateY}px) rotate(${angle}rad)`
			: `translate(${translateX}px, ${translateY}px)`
	}

	#updateWordsActionFromWordAction() {
		let action = HTMLWordCloudElement.#elementActionMaps[this.wordAction]
		for (let { element } of this.#words.values()) {
			element.action = action
		}
	}

	#setupDragController() {
		this.#dragController = new DragController<Word>(this.#container, {
			resolveWord: (target) => {
				if (!(target instanceof HTMLWordElement)) return null
				return this.#words.getByElement(target) ?? null
			},
			toContainerPoint: (clientX, clientY) =>
				this.#toContainerPoint(clientX, clientY),
			onGrab: (word, point) => {
				this.#dragOffset = {
					x: word.body.position.x - point.x,
					y: word.body.position.y - point.y,
				}
				this.#sim.grabWord(word.id)
				word.element.dragged = true
				this.#internals.states.add("active")
			},
			onMove: (word, point) => {
				this.#sim.moveWord(word.id, {
					x: point.x + this.#dragOffset.x,
					y: point.y + this.#dragOffset.y,
				})
				word.element.style.transform = this.#getWordTransform(word)
			},
			onRelease: (word, velocity) => {
				this.#sim.releaseWord(word.id, velocity)
				word.element.dragged = false
				this.#internals.states.delete("active")
			},
		})
	}

	#updateDragController() {
		this.#dragController.enabled = this.wordAction === "drag"
	}

	/**
	 * Converts a client-space pointer coordinate to the container's content-box
	 * coordinate space, accounting for any CSS transform scale on the container.
	 * Uses the unrounded computed-style size (not the integer-rounded offset
	 * dimensions) to derive the scale, matching the bodies' coordinate frame
	 * exactly and preserving the #39 fix.
	 */
	#toContainerPoint(clientX: number, clientY: number) {
		const rect = this.#container.getBoundingClientRect()
		const style = getComputedStyle(this.#container)
		const layoutWidth = Number.parseFloat(style.width)
		const layoutHeight = Number.parseFloat(style.height)
		const scaleX = layoutWidth > 0 ? rect.width / layoutWidth : 1
		const scaleY = layoutHeight > 0 ? rect.height / layoutHeight : 1
		return {
			x: (clientX - rect.left) / scaleX,
			y: (clientY - rect.top) / scaleY,
		}
	}

	#start() {
		this.#sim.start()
		if (USE_DEBUG_RENDERER && this.#debugRender == null) {
			this.#debugRender =
				Render?.create({
					engine: this.#sim.engine,
					element: queryStrict(
						this.#container,
						".word-cloud-debug",
						HTMLElement,
					),
					options: {
						width: this.#container.offsetWidth,
						height: this.#container.offsetHeight,
						showVelocity: true,
						showAngleIndicator: true,
					},
				}) ?? null
			if (this.#debugRender != null) Render?.run(this.#debugRender)
		}
	}

	#stop() {
		this.#sim.stop()
		if (this.#debugRender != null) Render?.stop(this.#debugRender)
	}
}

export interface WordRemoveOptions {
	exitAnimation?: WordElementExitAnimation | "none"
}
