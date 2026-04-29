import {
	boolean,
	number,
	pickList,
	WithAttributeProps,
} from "@quentinroy/custom-element-mixins"
import {
	Bodies,
	Body,
	Composite,
	Engine,
	Events,
	type IEvent,
	Mouse,
	MouseConstraint,
	Render,
	Runner,
} from "matter-js"
import {
	PhysicsPauseEvent,
	WordActionChangeEvent,
	WordAddEvent,
	WordChangeEvent,
	WordCheckEvent,
	WordDeleteEvent,
	WordInputToggleEvent,
} from "./events.ts"
import {
	applyAngularRestoringTorque,
	applyMutualRepulsionForce,
} from "./physics-utils.ts"
import {
	generateRandomId,
	isIterable,
	queryStrict,
	type RequiredKeysOf,
	type SetOptional,
	toPrecision,
} from "./utils.ts"
import mainStylesheet from "./word-cloud-element.css?stylesheet"
import mainTemplate from "./word-cloud-element.html?template"
import {
	HTMLWordElement,
	WordElementCheckedChangeEvent,
	WordElementDeleteEvent,
	type WordElementEntryAnimation,
	type WordElementExitAnimation,
	WordElementValueChangeEvent,
} from "./word-element.ts"
import type { WordData } from "./word-handle.ts"
import { WordHandle } from "./word-handle.ts"

const USE_DEBUG_RENDERER = false
const CHAMFER_RADIUS = 8
const FRAME_THICKNESS = 1000
const MIN_RANDOM_VELOCITY = 10
const MAX_RANDOM_VELOCITY = 40
const PADDING = 0
const INPUT_VOLUME_MIN_SIZE = 1
const TRANSLATE_PRECISION = 1
const ROTATE_PRECISION = 3
const ANGULAR_REST_ANGLE = 0
const ANGULAR_REST_ANGLE_EPSILON = 0.001
const ANGULAR_SPRING_TORQUE_STIFFNESS = 0.4
const ANGULAR_DAMPING_COEFFICIENT = 0.2
const ANGULAR_SPRING_WIDTH_REFERENCE = 150
const REPULSION_MARGIN = 5
const REPULSION_FORCE = 0.0003
const WORD_AIR_FRICTION = 0.04
const WORD_RESTITUTION = 0.2
const WORD_COLLISION_CATEGORY = 0x0001
const INPUT_VOLUME_COLLISION_CATEGORY = 0x0002
const DEFAULT_WORD_COLLISION_MASK = -1

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

interface InternalWordEntry {
	id: number
	body: Body
	bodySize: { width: number; height: number }
	element: HTMLWordElement
	publicHandle: WordHandle
	ignoreInputVolumeUntilExit: boolean
	dragLock: { initialInertia: number } | null
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
	wordRepulsion: number({ default: REPULSION_MARGIN }),
	edgeRepulsion: number({ default: REPULSION_MARGIN }),
	inputRepulsion: number({ default: REPULSION_MARGIN }),
}) {
	static #elementActionMaps: Record<WordAction, HTMLWordElement["action"]> = {
		none: null,
		drag: null,
		check: "check",
		delete: "delete",
	}

	static #frameThickness = FRAME_THICKNESS
	static #padding = PADDING

	#wordForm: HTMLFormElement
	#wordInput: HTMLInputElement
	#container: HTMLElement
	#engine: Engine
	#runner: Runner
	#frameBodies: { left: Body; right: Body; top: Body; bottom: Body }
	#frameBodySize = { horizontalLength: 1, verticalLength: 1 }
	#inputVolumeBody: Body
	#inputVolumeBodySize = {
		width: INPUT_VOLUME_MIN_SIZE,
		height: INPUT_VOLUME_MIN_SIZE,
	}
	#inputVolumeEnabled = false
	#wordEntries: Map<InternalWordEntry["id"], InternalWordEntry> = new Map()
	#wordEntriesByElement: WeakMap<HTMLWordElement, InternalWordEntry> =
		new WeakMap()
	#mouseConstraint: MouseConstraint
	#mouseEnabled = false
	#framerateDisplay: HTMLElement
	#containerResizeObserver = new ResizeObserver(() => {
		this.#updateFrameBodies()
		this.#updateInputVolumeBody()
		this.#updateMouseScale()
	})
	#inputResizeObserver = new ResizeObserver(() => {
		this.#updateInputVolumeBody()
	})
	#wordResizeObserver = new ResizeObserver((entries) => {
		for (const { target } of entries) {
			if (!(target instanceof HTMLWordElement)) continue
			const entry = this.#wordEntriesByElement.get(target)
			if (entry != null) this.#updateWordBodySize(entry)
		}
	})
	#internals = this.attachInternals()
	#debugRender: Render | null = null
	#isRunning = false

	/**
	 * Creates a word cloud instance and initializes its shadow DOM, physics
	 * engine, boundary bodies, and mouse interaction.
	 */
	constructor() {
		super()
		const { container, wordForm, wordInput, framerateDisplay } =
			this.#setupShadowDom()
		this.#container = container
		this.#wordForm = wordForm
		this.#wordInput = wordInput
		this.#framerateDisplay = framerateDisplay

		const { engine, runner } = this.#setupPhysics()
		this.#engine = engine
		this.#runner = runner

		this.#frameBodies = this.#setupFrameBodies(this.#engine)
		this.#inputVolumeBody = this.#setupInputVolumeBody()
		this.#setupContainerStyles()

		this.#mouseConstraint = this.#setupMouseConstraint(this.#engine)
	}

	static get observedAttributes() {
		return ["word-action", "word-input", "physics-paused"] as const
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
					this.#updateMouseConstraint()
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
				this.#updateInputVolumeFromInput()
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
		}
	}

	/**
	 * Attaches DOM and physics listeners, updates the frame geometry, and starts
	 * the physics runner when the element is connected.
	 */
	connectedCallback() {
		this.#wordForm.addEventListener("submit", this.#handleFormSubmit)
		Events.on(this.#engine, "beforeUpdate", this.#handleBeforeUpdate)
		Events.on(this.#runner, "tick", this.#handleTick)
		Events.on(this.#mouseConstraint, "startdrag", this.#handleStartDragging)
		Events.on(this.#mouseConstraint, "enddrag", this.#handleEndDragging)
		this.#updateFrameBodies()
		this.#updateWordsActionFromWordAction()
		this.#updateInputVolumeFromInput()
		this.#updateMouseScale()
		this.#updateMouseConstraint()
		this.#containerResizeObserver.observe(this.#container)
		this.#inputResizeObserver.observe(this.#wordInput)
		for (const entry of this.#wordEntries.values()) {
			this.#wordResizeObserver.observe(entry.element)
			this.#updateWordBodySize(entry)
		}
		if (!this.physicsPaused) this.#start()
	}

	/**
	 * Detaches DOM and physics listeners, stops observing resize events,
	 * and stops the physics runner when the element is disconnected.
	 */
	disconnectedCallback() {
		this.#wordForm.removeEventListener("submit", this.#handleFormSubmit)
		Events.off(this.#engine, "beforeUpdate", this.#handleBeforeUpdate)
		Events.off(this.#runner, "tick", this.#handleTick)
		Events.off(this.#mouseConstraint, "startdrag", this.#handleStartDragging)
		Events.off(this.#mouseConstraint, "enddrag", this.#handleEndDragging)
		this.#containerResizeObserver.unobserve(this.#container)
		this.#inputResizeObserver.unobserve(this.#wordInput)
		for (const { element } of this.#wordEntries.values()) {
			this.#wordResizeObserver.unobserve(element)
		}
		this.#stop()
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
		word,
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
		element.value = word
		element.checked = checked
		if (entryAnimation !== "none") element.animateEntry(entryAnimation)
		element.classList.add("word")
		element.action = HTMLWordCloudElement.#elementActionMaps[this.wordAction]
		let width = element.offsetWidth
		let height = element.offsetHeight

		const remove = (options: WordRemoveOptions = {}) => {
			options.exitAnimation = options.exitAnimation ?? "fade"
			this.#removeWord(entry, options)
		}

		let body = Bodies.rectangle(x, y, width, height, {
			chamfer: { radius: CHAMFER_RADIUS },
			angle,
			frictionAir: WORD_AIR_FRICTION,
			restitution: WORD_RESTITUTION,
			collisionFilter: {
				category: WORD_COLLISION_CATEGORY,
				mask: this.#getWordCollisionMask({
					ignoreInputVolume: ignoreInputVolumeUntilExit,
				}),
			},
		})
		let id = body.id
		let publicHandle = new WordHandle({
			getWord: () => element.value ?? "",
			setWord: (v) => {
				element.value = v
			},
			getX: () => body.position.x,
			getY: () => body.position.y,
			getAngle: () => body.angle,
			getChecked: () => element.checked,
			setChecked: (v) => {
				element.checked = v
			},
			remove,
		})
		const entry: InternalWordEntry = {
			id,
			element,
			body,
			bodySize: { width, height },
			publicHandle,
			ignoreInputVolumeUntilExit,
			dragLock: null,
		}
		this.#wordEntriesByElement.set(element, entry)
		element.addEventListener(WordElementDeleteEvent.type, () => {
			remove()
		})
		element.addEventListener(WordElementCheckedChangeEvent.type, () => {
			this.dispatchEvent(
				new WordCheckEvent({ handle: publicHandle, checked: element.checked }),
			)
		})
		element.addEventListener(WordElementValueChangeEvent.type, (event) => {
			const valueChangeEvent = event as WordElementValueChangeEvent
			this.dispatchEvent(
				new WordChangeEvent({
					handle: publicHandle,
					value: valueChangeEvent.value,
					oldValue: valueChangeEvent.oldValue,
				}),
			)
		})
		element.style.transform = this.#getWordTransform(entry)
		if (velocity) Body.setVelocity(body, velocity)
		Composite.add(this.#engine.world, body)
		this.#wordEntries.set(id, entry)
		this.#wordResizeObserver.observe(element)
		this.dispatchEvent(new WordAddEvent({ handle: publicHandle }))
		return publicHandle
	}

	async #removeWord(
		entry: InternalWordEntry,
		{ exitAnimation = "none" }: WordRemoveOptions = {},
	) {
		if (exitAnimation !== "none") {
			await entry.element.animateExit(exitAnimation)
			this.#container.removeChild(entry.element)
		} else {
			this.#container.removeChild(entry.element)
		}
		this.dispatchEvent(new WordDeleteEvent({ handle: entry.publicHandle }))
		this.#removeWordBody(entry)
		this.#wordEntries.delete(entry.id)
	}

	/**
	 * Removes all words from the cloud immediately, without exit animations.
	 */
	clear(options?: WordRemoveOptions) {
		for (let entry of this.#wordEntries.values()) {
			this.#removeWord(entry, options)
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
		for (let entry of this.#wordEntries.values()) {
			yield entry.publicHandle
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

	#setupPhysics() {
		const engine = Engine.create()
		engine.gravity.y = 0
		engine.gravity.scale = 0
		const runner = Runner.create()
		return { engine, runner }
	}

	#setupFrameBodies(engine: Engine) {
		const frameThickness = HTMLWordCloudElement.#frameThickness
		const frameBodies = {
			left: Bodies.rectangle(0, 0, frameThickness, 1, { isStatic: true }),
			right: Bodies.rectangle(0, 0, frameThickness, 1, { isStatic: true }),
			top: Bodies.rectangle(0, 0, 1, frameThickness, { isStatic: true }),
			bottom: Bodies.rectangle(0, 0, 1, frameThickness, { isStatic: true }),
		}
		Composite.add(engine.world, [
			frameBodies.left,
			frameBodies.right,
			frameBodies.top,
			frameBodies.bottom,
		])
		return frameBodies
	}

	#setupInputVolumeBody() {
		return Bodies.rectangle(
			0,
			0,
			INPUT_VOLUME_MIN_SIZE,
			INPUT_VOLUME_MIN_SIZE,
			{
				isStatic: true,
				collisionFilter: {
					category: INPUT_VOLUME_COLLISION_CATEGORY,
					mask: WORD_COLLISION_CATEGORY,
				},
			},
		)
	}

	#setupContainerStyles() {
		this.#container.style.setProperty("--chamfer-radius", `${CHAMFER_RADIUS}px`)
		if (USE_DEBUG_RENDERER) {
			this.#container.style.setProperty("--opacity", "0.2")
		}
	}

	#setupMouseConstraint(engine: Engine) {
		const mouse = Mouse.create(this)
		return MouseConstraint.create(engine, {
			mouse,
			constraint: { stiffness: 0.3, render: { visible: true } },
		})
	}

	#removeWordBody(entry: InternalWordEntry) {
		this.#unlockDraggedEntry(entry)
		this.#wordResizeObserver.unobserve(entry.element)
		Composite.remove(this.#engine.world, entry.body)
	}

	#updateWordBodySize(entry: InternalWordEntry) {
		const nextSize = {
			width: entry.element.offsetWidth,
			height: entry.element.offsetHeight,
		}
		const { width: previousWidth, height: previousHeight } = entry.bodySize
		if (
			nextSize.width === previousWidth &&
			nextSize.height === previousHeight
		) {
			return
		}

		const dragLock = entry.dragLock
		if (dragLock != null) {
			Body.setInertia(entry.body, dragLock.initialInertia)
		}

		Body.scale(
			entry.body,
			nextSize.width / previousWidth,
			nextSize.height / previousHeight,
		)
		entry.bodySize = nextSize

		if (dragLock != null) {
			dragLock.initialInertia = entry.body.inertia
			Body.setInertia(entry.body, Infinity)
			Body.setAngularVelocity(entry.body, 0)
		}
	}

	#pickRandomVelocity() {
		let angle = Math.random() * 2 * Math.PI
		let speed =
			Math.random() * (MAX_RANDOM_VELOCITY - MIN_RANDOM_VELOCITY) +
			MIN_RANDOM_VELOCITY
		return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }
	}

	/**
	 * Scales all four frame bodies to match the current container dimensions,
	 * repositioning them so they tightly bound the container on all sides.
	 * Should be called whenever the container is resized.
	 */
	#updateFrameBodies() {
		const { left, right, top, bottom } = this.#frameBodies
		const width = this.#container.offsetWidth
		const height = this.#container.offsetHeight
		const frameThickness = HTMLWordCloudElement.#frameThickness
		const padding = HTMLWordCloudElement.#padding
		const horizontalLength = Math.max(1, width + frameThickness * 2)
		const verticalLength = Math.max(1, height + frameThickness * 2)

		const scaleHorizontal =
			horizontalLength / this.#frameBodySize.horizontalLength
		const scaleVertical = verticalLength / this.#frameBodySize.verticalLength

		if (scaleVertical !== 1) {
			Body.scale(left, 1, scaleVertical)
			Body.scale(right, 1, scaleVertical)
		}
		if (scaleHorizontal !== 1) {
			Body.scale(top, scaleHorizontal, 1)
			Body.scale(bottom, scaleHorizontal, 1)
		}

		this.#frameBodySize = { horizontalLength, verticalLength }

		Body.setPosition(left, { x: -frameThickness / 2 + padding, y: height / 2 })
		Body.setPosition(right, {
			x: width + frameThickness / 2 - padding,
			y: height / 2,
		})
		Body.setPosition(top, { x: width / 2, y: -frameThickness / 2 + padding })
		Body.setPosition(bottom, {
			x: width / 2,
			y: height + frameThickness / 2 - padding,
		})
	}

	#updateInputVolumeBody() {
		const width = Math.max(INPUT_VOLUME_MIN_SIZE, this.#wordInput.offsetWidth)
		const height = Math.max(INPUT_VOLUME_MIN_SIZE, this.#wordInput.offsetHeight)
		const scaleX = width / this.#inputVolumeBodySize.width
		const scaleY = height / this.#inputVolumeBodySize.height

		if (scaleX !== 1 || scaleY !== 1) {
			Body.scale(this.#inputVolumeBody, scaleX, scaleY)
			this.#inputVolumeBodySize = { width, height }
		}

		Body.setPosition(this.#inputVolumeBody, {
			x: this.#wordInput.offsetLeft + width / 2,
			y: this.#wordInput.offsetTop + height / 2,
		})
	}

	#getWordCollisionMask({ ignoreInputVolume }: { ignoreInputVolume: boolean }) {
		if (!ignoreInputVolume) return DEFAULT_WORD_COLLISION_MASK
		return DEFAULT_WORD_COLLISION_MASK & ~INPUT_VOLUME_COLLISION_CATEGORY
	}

	/**
	 * Checks each word that has `ignoreInputVolumeUntilExit` set and clears
	 * the flag once the body is no longer overlapping the input volume.
	 * Called every physics tick.
	 */
	#updateWordCollisionMask(entry: InternalWordEntry) {
		entry.body.collisionFilter.mask =
			entry.dragLock != null
				? 0
				: this.#getWordCollisionMask({
						ignoreInputVolume: entry.ignoreInputVolumeUntilExit,
					})
	}

	#isOverlappingInputVolume(body: Body) {
		const a = body.bounds
		const b = this.#inputVolumeBody.bounds
		return (
			a.min.x <= b.max.x &&
			a.max.x >= b.min.x &&
			a.min.y <= b.max.y &&
			a.max.y >= b.min.y
		)
	}

	#handleFormSubmit = (e: SubmitEvent) => {
		e.preventDefault()
		let newWord = this.#wordInput.value.trim()
		if (newWord !== "") {
			if (this.#inputVolumeEnabled) this.#updateInputVolumeBody()
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

	#handleStartDragging = (event: IEvent<MouseConstraint>) => {
		if (!this.#mouseEnabled) return
		const body = event.source.body
		if (body != null) {
			const entry = this.#wordEntries.get(body.id)
			if (entry != null) this.#lockDraggedEntry(entry)
		}
		this.#internals.states.add("active")
	}

	#handleEndDragging = (event: IEvent<MouseConstraint>) => {
		if (!this.#mouseEnabled) return
		const body = event.source.body
		if (body != null) {
			const entry = this.#wordEntries.get(body.id)
			if (entry != null) this.#unlockDraggedEntry(entry)
		} else {
			this.#unlockAllDraggedBodies()
		}
		this.#internals.states.delete("active")
	}

	#handleBeforeUpdate = () => {
		this.#applyAngularRestoringTorque()
		const wordRepulsion = this.wordRepulsion
		if (wordRepulsion > 0) {
			this.#applyWordRepulsionForces({ margin: wordRepulsion })
		}
		const edgeRepulsion = this.edgeRepulsion
		if (edgeRepulsion > 0) {
			this.#applyEdgeRepulsionForces({ margin: edgeRepulsion })
		}
		const inputRepulsion = this.inputRepulsion
		if (inputRepulsion > 0) {
			this.#applyInputRepulsionForces({ margin: inputRepulsion })
		}
	}

	#handleTick = () => {
		this.#updateWordInputCollisions()
		this.#updateWordPositions()
		if (this.showFramerate) this.#updateFramerateDisplay()
	}

	#updateFramerateDisplay() {
		const delta = this.#runner.frameDelta
		this.#setFrameRateDisplay(1000 / delta)
	}

	#setFrameRateDisplay(fps: number) {
		this.#framerateDisplay.textContent = `${Math.round(fps)} fps`
	}

	#applyAngularRestoringTorque() {
		for (let {
			body,
			bodySize: { width, height },
		} of this.#wordEntries.values()) {
			applyAngularRestoringTorque({
				body,
				bodySize: { width, height },
				restAngle: ANGULAR_REST_ANGLE,
				restAngleEpsilon: ANGULAR_REST_ANGLE_EPSILON,
				springTorqueStiffness: ANGULAR_SPRING_TORQUE_STIFFNESS,
				dampingCoefficient: ANGULAR_DAMPING_COEFFICIENT,
				springWidthReference: ANGULAR_SPRING_WIDTH_REFERENCE,
			})
		}
	}

	#applyWordRepulsionForces({ margin }: { margin: number }) {
		const entries = [...this.#wordEntries.values()].sort(
			(entryA, entryB) => entryA.body.bounds.min.x - entryB.body.bounds.min.x,
		)
		for (let i = 0; i < entries.length; i++) {
			const entryA = entries[i]
			if (entryA.body.isStatic || entryA.body.isSleeping) continue
			if (entryA.dragLock != null) continue
			const boundsA = entryA.body.bounds
			for (let j = i + 1; j < entries.length; j++) {
				const entryB = entries[j]
				const boundsB = entryB.body.bounds
				if (boundsB.min.x - boundsA.max.x >= margin) break
				if (entryB.body.isStatic || entryB.body.isSleeping) continue
				if (entryB.dragLock != null) continue

				applyMutualRepulsionForce({
					bodyA: entryA.body,
					bodySizeA: entryA.bodySize,
					bodyB: entryB.body,
					bodySizeB: entryB.bodySize,
					margin,
					repulsionForce: REPULSION_FORCE,
				})
			}
		}
	}

	#applyEdgeRepulsionForces({ margin }: { margin: number }) {
		const { left, right, top, bottom } = this.#frameBodies
		const leftEdge = left.bounds.max.x
		const rightEdge = right.bounds.min.x
		const topEdge = top.bounds.max.y
		const bottomEdge = bottom.bounds.min.y
		const frameThickness = HTMLWordCloudElement.#frameThickness
		const { horizontalLength, verticalLength } = this.#frameBodySize

		for (const entry of this.#wordEntries.values()) {
			const { body } = entry
			if (body.isStatic || body.isSleeping) continue
			if (entry.dragLock != null) continue
			const bounds = body.bounds
			if (bounds.min.x - leftEdge < margin) {
				applyMutualRepulsionForce({
					bodyA: left,
					bodySizeA: { width: frameThickness, height: verticalLength },
					bodyB: body,
					bodySizeB: entry.bodySize,
					margin,
					repulsionForce: REPULSION_FORCE,
				})
			}
			if (rightEdge - bounds.max.x < margin) {
				applyMutualRepulsionForce({
					bodyA: right,
					bodySizeA: { width: frameThickness, height: verticalLength },
					bodyB: body,
					bodySizeB: entry.bodySize,
					margin,
					repulsionForce: REPULSION_FORCE,
				})
			}
			if (bounds.min.y - topEdge < margin) {
				applyMutualRepulsionForce({
					bodyA: top,
					bodySizeA: { width: horizontalLength, height: frameThickness },
					bodyB: body,
					bodySizeB: entry.bodySize,
					margin,
					repulsionForce: REPULSION_FORCE,
				})
			}
			if (bottomEdge - bounds.max.y < margin) {
				applyMutualRepulsionForce({
					bodyA: bottom,
					bodySizeA: { width: horizontalLength, height: frameThickness },
					bodyB: body,
					bodySizeB: entry.bodySize,
					margin,
					repulsionForce: REPULSION_FORCE,
				})
			}
		}
	}

	#applyInputRepulsionForces({ margin }: { margin: number }) {
		if (!this.#inputVolumeEnabled) return
		const inputBounds = this.#inputVolumeBody.bounds

		for (const entry of this.#wordEntries.values()) {
			const { body } = entry
			if (body.isStatic || body.isSleeping) continue
			if (entry.dragLock != null) continue
			if (entry.ignoreInputVolumeUntilExit) continue
			const bounds = body.bounds
			if (
				bounds.min.x - inputBounds.max.x >= margin ||
				inputBounds.min.x - bounds.max.x >= margin ||
				bounds.min.y - inputBounds.max.y >= margin ||
				inputBounds.min.y - bounds.max.y >= margin
			) {
				continue
			}

			applyMutualRepulsionForce({
				bodyA: this.#inputVolumeBody,
				bodySizeA: this.#inputVolumeBodySize,
				bodyB: body,
				bodySizeB: entry.bodySize,
				margin,
				repulsionForce: REPULSION_FORCE,
			})
		}
	}

	#updateWordInputCollisions() {
		if (this.#inputVolumeEnabled) {
			for (let entry of this.#wordEntries.values()) {
				if (!entry.ignoreInputVolumeUntilExit) continue
				if (this.#isOverlappingInputVolume(entry.body)) continue
				entry.ignoreInputVolumeUntilExit = false
				this.#updateWordCollisionMask(entry)
			}
		}
	}

	#updateWordPositions() {
		for (let entry of this.#wordEntries.values()) {
			entry.element.style.transform = this.#getWordTransform(entry)
		}
	}

	/**
	 * Locks a dragged entry: freezes its rotational inertia, disables collisions,
	 * and marks the word element as dragged.
	 * No-op if the entry is already locked.
	 */
	#lockDraggedEntry(entry: InternalWordEntry) {
		if (entry.dragLock != null) return
		entry.dragLock = { initialInertia: entry.body.inertia }
		this.#updateWordCollisionMask(entry)
		Body.setInertia(entry.body, Infinity)
		Body.setAngularVelocity(entry.body, 0)
		entry.element.dragged = true
	}

	/**
	 * Restores a previously locked entry to normal physics behavior.
	 * No-op if the entry is not locked.
	 */
	#unlockDraggedEntry(entry: InternalWordEntry) {
		if (entry.dragLock == null) return
		Body.setInertia(entry.body, entry.dragLock.initialInertia)
		Body.setAngularVelocity(entry.body, 0)
		entry.dragLock = null
		this.#updateWordCollisionMask(entry)
		entry.element.dragged = false
	}

	#unlockAllDraggedBodies() {
		for (const entry of this.#wordEntries.values()) {
			this.#unlockDraggedEntry(entry)
		}
	}

	#getWordTransform({
		body,
		bodySize: { width, height },
	}: InternalWordEntry): string {
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
		for (let { element } of this.#wordEntries.values()) {
			element.action = action
		}
	}

	#updateInputVolumeFromInput() {
		if (this.wordInput) {
			if (this.#inputVolumeEnabled) return
			this.#updateInputVolumeBody()
			Composite.add(this.#engine.world, this.#inputVolumeBody)
			this.#inputVolumeEnabled = true
			return
		}
		if (!this.#inputVolumeEnabled) return
		Composite.remove(this.#engine.world, this.#inputVolumeBody)
		for (let entry of this.#wordEntries.values()) {
			if (!entry.ignoreInputVolumeUntilExit) continue
			entry.ignoreInputVolumeUntilExit = false
			this.#updateWordCollisionMask(entry)
		}
		this.#inputVolumeEnabled = false
	}

	#updateMouseConstraint() {
		if (this.wordAction === "drag") {
			if (this.#mouseEnabled) return
			this.#mouseEnabled = true
			Composite.add(this.#engine.world, this.#mouseConstraint)
		} else {
			this.#mouseEnabled = false
			this.#unlockAllDraggedBodies()
			Composite.remove(
				this.#engine.world,
				this.#mouseConstraint.constraint,
				true,
			)
			this.#internals.states.delete("active")
		}
	}

	#updateMouseScale() {
		const mouse = this.#mouseConstraint.mouse
		const rect = this.#container.getBoundingClientRect()
		const scaleX = rect.width / this.#container.clientWidth
		const scaleY = rect.height / this.#container.clientHeight
		Mouse.setScale(mouse, { x: 1 / scaleX, y: 1 / scaleY })
	}

	#start() {
		if (this.#isRunning) return
		this.#isRunning = true
		Runner.run(this.#runner, this.#engine)
		if (USE_DEBUG_RENDERER) {
			this.#debugRender =
				Render?.create({
					engine: this.#engine,
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
		if (!this.#isRunning) return
		this.#isRunning = false
		this.#unlockAllDraggedBodies()
		Runner.stop(this.#runner)
		if (this.#debugRender != null) Render?.stop(this.#debugRender)
	}
}

export interface WordRemoveOptions {
	exitAnimation?: WordElementExitAnimation | "none"
}
