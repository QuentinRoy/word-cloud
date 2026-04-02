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
	WordAddEvent,
	WordCheckedChangeEvent,
	WordCloudInputChangeEvent,
	WordCloudWordActionChangeEvent,
	WordDeleteEvent,
	WordValueChangeEvent,
} from "./events.ts"
import { css, html } from "./template.ts"
import {
	generateRandomId,
	normalizeAngle,
	queryStrict,
	toPrecision,
} from "./utils.ts"
import debugStylesheetContent from "./word-cloud-debug.css?raw"
import mainStylesheetContent from "./word-cloud-element.css?raw"
import mainTemplateContent from "./word-cloud-element.html?raw"
import {
	HTMLWordElement,
	WordElementCheckedChangeEvent,
	WordElementDeleteEvent,
	WordElementValueChangeEvent,
} from "./word-element.ts"
import type { WordData } from "./word-handle.ts"
import { WordHandle } from "./word-handle.ts"

const DEBUG_MODE = false

const CHAMFER_RADIUS = 8
const FRAME_THICKNESS = 1000
const MIN_RANDOM_VELOCITY = 10
const MAX_RANDOM_VELOCITY = 40
const PADDING = 0
const INPUT_VOLUME_MIN_SIZE = 1
const TRANSLATE_PRECISION = 1
const ROTATE_PRECISION = 4
const ANGULAR_REST_ANGLE = 0
const ANGULAR_REST_ANGLE_EPSILON = 0.01
const ANGULAR_SPRING_TORQUE_STIFFNESS = 0.25
const ANGULAR_DAMPING_COEFFICIENT = 0.7
const ANGULAR_SPRING_WIDTH_REFERENCE = 150
const REPULSION_MARGIN = 5
const REPULSION_FORCE = 0.0003
const WORD_COLLISION_CATEGORY = 0x0001
const INPUT_VOLUME_COLLISION_CATEGORY = 0x0002
const DEFAULT_WORD_COLLISION_MASK = -1

const mainTemplate = html`${mainTemplateContent}`

const stylesheet = css`${mainStylesheetContent}`
const debugStyles = css`${debugStylesheetContent}`

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

type WordVelocity = { x: number; y: number }

/**
 * Options used to add a single word to the cloud.
 */
type AddWordOptions = WordData & {
	/** The initial linear velocity applied to the word body. */
	velocity?: WordVelocity
	/** Whether the word element should play its entry animation. */
	entryAnimation?: HTMLWordElement["entryAnimation"]
	/**
	 * Internal behavior used for words spawned by the input form.
	 * While true, collisions with the input volume stay disabled until the body
	 * leaves that volume once.
	 */
	ignoreInputVolumeUntilExit?: boolean
}

export const WORD_ACTIONS = ["none", "drag", "check", "delete"] as const
export type WordAction = (typeof WORD_ACTIONS)[number]

function isWordAction(value: unknown): value is WordAction {
	return (WORD_ACTIONS as readonly unknown[]).includes(value)
}

interface HTMLWordCloudElementEventMap extends HTMLElementEventMap {
	[WordAddEvent.type]: WordAddEvent
	[WordCheckedChangeEvent.type]: WordCheckedChangeEvent
	[WordDeleteEvent.type]: WordDeleteEvent
	[WordCloudInputChangeEvent.type]: WordCloudInputChangeEvent
	[WordCloudWordActionChangeEvent.type]: WordCloudWordActionChangeEvent
	[WordValueChangeEvent.type]: WordValueChangeEvent
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
	hasInput: boolean(),
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
	#containerResizeObserver = new ResizeObserver(() => {
		this.#updateFrameBodies()
		this.#updateInputVolumeBody()
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

	/**
	 * Creates a word cloud instance and initializes its shadow DOM, physics
	 * engine, boundary bodies, and mouse interaction.
	 */
	constructor() {
		super()
		const { container, wordForm, wordInput } = this.#setupShadowDom()
		this.#container = container
		this.#wordForm = wordForm
		this.#wordInput = wordInput

		const { engine, runner } = this.#setupPhysics()
		this.#engine = engine
		this.#runner = runner

		this.#frameBodies = this.#setupFrameBodies(this.#engine)
		this.#inputVolumeBody = this.#setupInputVolumeBody()
		this.#setupContainerStyles()

		this.#mouseConstraint = this.#setupMouseConstraint(this.#engine)
	}

	static get observedAttributes() {
		return ["word-action", "has-input"]
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
							new WordCloudWordActionChangeEvent({ oldWordAction, wordAction }),
						)
					}
				}
				break
			case "has-input": {
				const oldHasInput = oldValue !== null
				const hasInput = newValue !== null
				this.#updateInputVolumeFromInput()
				if (oldHasInput !== hasInput) {
					this.dispatchEvent(
						new WordCloudInputChangeEvent({ oldHasInput, hasInput }),
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
		this.#updateMouseConstraint()
		this.#containerResizeObserver.observe(this.#container)
		this.#inputResizeObserver.observe(this.#wordInput)
		for (const entry of this.#wordEntries.values()) {
			this.#wordResizeObserver.observe(entry.element)
			this.#updateWordBodySize(entry)
		}
		this.#start()
	}

	/**
	 * Removes listeners and stops the physics runner when the element is
	 * disconnected.
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
	 * Creates a rendered word element and its matching physics body, and returns
	 * a live {@link WordHandle} handle.
	 *
	 * @param options.word The text content to display.
	 * @param options.x The initial horizontal center position in pixels.
	 * @param options.y The initial vertical center position in pixels.
	 * @param options.angle The initial body rotation in radians. Defaults to `0`.
	 * @param options.checked Whether the word starts in the checked state. Defaults to `false`.
	 * @param options.velocity The initial linear velocity applied to the body.
	 * @param options.animateEntry Whether the word should play its entry animation. Defaults to `false`.
	 * @returns A live {@link WordHandle} for the newly created word.
	 */
	addWord({
		word,
		x,
		y,
		angle = 0,
		checked = false,
		velocity,
		entryAnimation,
		ignoreInputVolumeUntilExit = false,
	}: AddWordOptions): WordHandle {
		let element = document.createElement(wordElementTagName) as HTMLWordElement
		// It seems we need to add element before setting the checked property
		// otherwise it does not update the attribute properly.
		this.#container.appendChild(element)
		element.value = word
		element.checked = checked
		if (entryAnimation != null) element.entryAnimation = entryAnimation
		element.classList.add("word")
		element.action = HTMLWordCloudElement.#elementActionMaps[this.wordAction]
		let width = element.offsetWidth
		let height = element.offsetHeight
		let body = Bodies.rectangle(x, y, width, height, {
			chamfer: { radius: CHAMFER_RADIUS },
			angle,
			frictionAir: 0.05,
			restitution: 0.2,
			collisionFilter: {
				category: WORD_COLLISION_CATEGORY,
				mask: this.#getWordCollisionMask({
					ignoreInputVolume: ignoreInputVolumeUntilExit,
				}),
			},
		})
		let id = body.id
		const deleteWord = () => {
			if (!this.#wordEntries.has(id)) return
			this.dispatchEvent(new WordDeleteEvent({ handle: publicHandle }))
			this.#removeById(id)
		}
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
			remove: deleteWord,
		})
		let entry: InternalWordEntry = {
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
			deleteWord()
		})
		element.addEventListener(WordElementCheckedChangeEvent.type, () => {
			this.dispatchEvent(
				new WordCheckedChangeEvent({
					handle: publicHandle,
					checked: element.checked,
				}),
			)
		})
		element.addEventListener(WordElementValueChangeEvent.type, (event) => {
			const valueChangeEvent = event as WordElementValueChangeEvent
			this.dispatchEvent(
				new WordValueChangeEvent({
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

	#removeById(id: number) {
		let entry = this.#wordEntries.get(id)
		if (entry) {
			this.#removeWordBodyAndDom(entry)
			this.#wordEntries.delete(entry.id)
		}
	}

	/**
	 * Removes all words currently managed by the cloud.
	 */
	clear() {
		for (let entry of this.#wordEntries.values()) {
			this.#removeWordBodyAndDom(entry)
		}
		this.#wordEntries.clear()
	}

	/**
	 * Returns live {@link WordHandle} handles for all words currently in the cloud.
	 * Property reads on each handle always reflect the current state.
	 * Useful for persistence — pass the result to {@link setWords} to restore.
	 */
	getWords(): Iterable<WordHandle> {
		return this.#wordEntries.values().map((entry) => entry.publicHandle)
	}

	/**
	 * Replaces the current cloud contents with the provided word data.
	 * Accepts plain {@link WordData} objects or previously obtained
	 * {@link WordHandle} handles (which are structurally compatible).
	 *
	 * @param words The words to insert after clearing the existing cloud.
	 */
	setWords(words: Iterable<WordData>) {
		this.clear()
		for (let word of words) {
			this.addWord(word)
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
		let stylesheets = [stylesheet]
		if (DEBUG_MODE) stylesheets.push(debugStyles)
		shadowRoot.adoptedStyleSheets = stylesheets
		const container = queryStrict(shadowRoot, ".word-cloud", HTMLElement)
		const wordForm = queryStrict(container, "form", HTMLFormElement)
		const wordInput = queryStrict(container, "input", HTMLInputElement)
		return { container, wordForm, wordInput }
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
		if (DEBUG_MODE) {
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

	#removeWordBodyAndDom(entry: InternalWordEntry) {
		this.#unlockDraggedEntry(entry)
		this.#wordResizeObserver.unobserve(entry.element)
		Composite.remove(this.#engine.world, entry.body)
		this.#container.removeChild(entry.element)
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

	#updateFrameBodies() {
		const { left, right, top, bottom } = this.#frameBodies
		const { width, height } = this.#container.getBoundingClientRect()
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
		const containerRect = this.#container.getBoundingClientRect()
		const inputRect = this.#wordInput.getBoundingClientRect()
		const width = Math.max(INPUT_VOLUME_MIN_SIZE, inputRect.width)
		const height = Math.max(INPUT_VOLUME_MIN_SIZE, inputRect.height)
		const scaleX = width / this.#inputVolumeBodySize.width
		const scaleY = height / this.#inputVolumeBodySize.height

		if (scaleX !== 1 || scaleY !== 1) {
			Body.scale(this.#inputVolumeBody, scaleX, scaleY)
			this.#inputVolumeBodySize = { width, height }
		}

		Body.setPosition(this.#inputVolumeBody, {
			x: inputRect.left - containerRect.left + width / 2,
			y: inputRect.top - containerRect.top + height / 2,
		})
	}

	#getWordCollisionMask({ ignoreInputVolume }: { ignoreInputVolume: boolean }) {
		if (!ignoreInputVolume) return DEFAULT_WORD_COLLISION_MASK
		return DEFAULT_WORD_COLLISION_MASK & ~INPUT_VOLUME_COLLISION_CATEGORY
	}

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
			let containerRect = this.#container.getBoundingClientRect()
			let inputRect = this.#wordInput.getBoundingClientRect()
			let x = inputRect.left - containerRect.left + inputRect.width / 2
			let y = inputRect.top - containerRect.top + inputRect.height / 2
			this.addWord({
				word: newWord,
				x,
				y,
				angle: 0,
				checked: false,
				velocity: this.#pickRandomVelocity(),
				entryAnimation: "box-fade",
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
		if (wordRepulsion > 0) this.#applyWordRepulsionForces(wordRepulsion)
		const edgeRepulsion = this.edgeRepulsion
		if (edgeRepulsion > 0) this.#applyEdgeRepulsionForces(edgeRepulsion)
		const inputRepulsion = this.inputRepulsion
		if (inputRepulsion > 0) this.#applyInputRepulsionForces(inputRepulsion)
	}

	#handleTick = () => {
		this.#updateWordInputCollisions()
		this.#updateWordPositions()
	}

	#applyAngularRestoringTorque() {
		for (let { body } of this.#wordEntries.values()) {
			if (body.isStatic || body.isSleeping) continue
			const angleError = normalizeAngle(body.angle) - ANGULAR_REST_ANGLE
			if (
				Math.abs(angleError) <= ANGULAR_REST_ANGLE_EPSILON &&
				Math.abs(body.angularVelocity) < 0.001
			)
				continue

			// Convert torque to a pair of opposing forces applied at opposite points
			const width = body.bounds.max.x - body.bounds.min.x
			const height = body.bounds.max.y - body.bounds.min.y

			// Spring with light damping: restores to rest angle and dissipates energy.
			// Scale by word width so larger words receive proportionally stronger torque.
			const torque =
				(-angleError * ANGULAR_SPRING_TORQUE_STIFFNESS -
					body.angularVelocity * ANGULAR_DAMPING_COEFFICIENT) *
				(width / ANGULAR_SPRING_WIDTH_REFERENCE)
			const forceArm = Math.min(width, height) * 0.25
			if (forceArm <= 0) continue

			const forceMagnitude = torque / (2 * forceArm)

			const ux = Math.cos(body.angle)
			const uy = Math.sin(body.angle)
			const nx = -uy
			const ny = ux

			const pointA = {
				x: body.position.x + ux * forceArm,
				y: body.position.y + uy * forceArm,
			}
			const pointB = {
				x: body.position.x - ux * forceArm,
				y: body.position.y - uy * forceArm,
			}
			const force = { x: nx * forceMagnitude, y: ny * forceMagnitude }

			Body.applyForce(body, pointA, force)
			Body.applyForce(body, pointB, { x: -force.x, y: -force.y })
		}
	}

	#applyWordRepulsionForces(margin: number) {
		const entries = [...this.#wordEntries.values()]
		for (let i = 0; i < entries.length; i++) {
			const entryA = entries[i]
			if (entryA.body.isStatic || entryA.body.isSleeping) continue
			if (entryA.dragLock != null) continue
			for (let j = i + 1; j < entries.length; j++) {
				const entryB = entries[j]
				if (entryB.body.isStatic || entryB.body.isSleeping) continue
				if (entryB.dragLock != null) continue

				const boundsA = entryA.body.bounds
				const boundsB = entryB.body.bounds

				// Compute AABB gap: positive = separated, negative = overlapping
				const gapX =
					-Math.min(boundsA.max.x, boundsB.max.x) +
					Math.max(boundsA.min.x, boundsB.min.x)
				const gapY =
					-Math.min(boundsA.max.y, boundsB.max.y) +
					Math.max(boundsA.min.y, boundsB.min.y)

				// Minimum separation distance between the two AABBs
				let gap: number
				if (gapX > 0 && gapY > 0) {
					gap = Math.sqrt(gapX * gapX + gapY * gapY)
				} else if (gapX > 0) {
					gap = gapX
				} else if (gapY > 0) {
					gap = gapY
				} else {
					// Overlapping in both axes; use the shallowest overlap as gap
					gap = Math.max(gapX, gapY)
				}

				if (gap >= margin) continue

				const dx = entryB.body.position.x - entryA.body.position.x
				const dy = entryB.body.position.y - entryA.body.position.y
				const dist = Math.sqrt(dx * dx + dy * dy)
				if (dist === 0) continue

				const strength = Math.min(1, (margin - gap) / margin)
				const forceMagnitude = strength * REPULSION_FORCE
				const nx = (dx / dist) * forceMagnitude
				const ny = (dy / dist) * forceMagnitude

				Body.applyForce(entryA.body, entryA.body.position, { x: -nx, y: -ny })
				Body.applyForce(entryB.body, entryB.body.position, { x: nx, y: ny })
			}
		}
	}

	#applyEdgeRepulsionForces(margin: number) {
		const { left, right, top, bottom } = this.#frameBodies
		const edgeLeft = left.position.x + FRAME_THICKNESS / 2
		const edgeRight = right.position.x - FRAME_THICKNESS / 2
		const edgeTop = top.position.y + FRAME_THICKNESS / 2
		const edgeBottom = bottom.position.y - FRAME_THICKNESS / 2

		for (const entry of this.#wordEntries.values()) {
			const { body } = entry
			if (body.isStatic || body.isSleeping) continue
			if (entry.dragLock != null) continue
			const bounds = body.bounds

			const gapLeft = bounds.min.x - edgeLeft
			if (gapLeft < margin) {
				const strength = Math.min(1, (margin - gapLeft) / margin)
				Body.applyForce(body, body.position, {
					x: strength * REPULSION_FORCE,
					y: 0,
				})
			}

			const gapRight = edgeRight - bounds.max.x
			if (gapRight < margin) {
				const strength = Math.min(1, (margin - gapRight) / margin)
				Body.applyForce(body, body.position, {
					x: -strength * REPULSION_FORCE,
					y: 0,
				})
			}

			const gapTop = bounds.min.y - edgeTop
			if (gapTop < margin) {
				const strength = Math.min(1, (margin - gapTop) / margin)
				Body.applyForce(body, body.position, {
					x: 0,
					y: strength * REPULSION_FORCE,
				})
			}

			const gapBottom = edgeBottom - bounds.max.y
			if (gapBottom < margin) {
				const strength = Math.min(1, (margin - gapBottom) / margin)
				Body.applyForce(body, body.position, {
					x: 0,
					y: -strength * REPULSION_FORCE,
				})
			}
		}
	}

	#applyInputRepulsionForces(margin: number) {
		if (!this.#inputVolumeEnabled) return
		const inputBounds = this.#inputVolumeBody.bounds
		const inputPos = this.#inputVolumeBody.position

		for (const entry of this.#wordEntries.values()) {
			const { body } = entry
			if (body.isStatic || body.isSleeping) continue
			if (entry.dragLock != null) continue
			if (entry.ignoreInputVolumeUntilExit) continue

			const boundsA = body.bounds

			const gapX =
				-Math.min(boundsA.max.x, inputBounds.max.x) +
				Math.max(boundsA.min.x, inputBounds.min.x)
			const gapY =
				-Math.min(boundsA.max.y, inputBounds.max.y) +
				Math.max(boundsA.min.y, inputBounds.min.y)

			let gap: number
			if (gapX > 0 && gapY > 0) {
				gap = Math.sqrt(gapX * gapX + gapY * gapY)
			} else if (gapX > 0) {
				gap = gapX
			} else if (gapY > 0) {
				gap = gapY
			} else {
				gap = Math.max(gapX, gapY)
			}

			if (gap >= margin) continue

			const dx = body.position.x - inputPos.x
			const dy = body.position.y - inputPos.y
			const dist = Math.sqrt(dx * dx + dy * dy)
			if (dist === 0) continue

			const strength = Math.min(1, (margin - gap) / margin)
			const forceMagnitude = strength * REPULSION_FORCE
			Body.applyForce(body, body.position, {
				x: (dx / dist) * forceMagnitude,
				y: (dy / dist) * forceMagnitude,
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

	#lockDraggedEntry(entry: InternalWordEntry) {
		if (entry.dragLock != null) return
		entry.dragLock = { initialInertia: entry.body.inertia }
		this.#updateWordCollisionMask(entry)
		Body.setInertia(entry.body, Infinity)
		Body.setAngularVelocity(entry.body, 0)
		entry.element.dragged = true
	}

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

	#getWordTransform({ body }: InternalWordEntry) {
		let angle = toPrecision(body.angle, ROTATE_PRECISION)
		let translateX = toPrecision(body.position.x, TRANSLATE_PRECISION)
		let translateY = toPrecision(body.position.y, TRANSLATE_PRECISION)
		let transform = ""
		if (translateX !== 0 || translateY !== 0) {
			transform += `translate(${translateX}px, ${translateY}px)`
		}
		if (angle !== 0) {
			transform += ` rotate(${angle}rad)`
		}
		return transform
	}

	#updateWordsActionFromWordAction() {
		let action = HTMLWordCloudElement.#elementActionMaps[this.wordAction]
		for (let { element } of this.#wordEntries.values()) {
			element.action = action
		}
	}

	#updateInputVolumeFromInput() {
		if (this.hasInput) {
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

	#start() {
		Runner.run(this.#runner, this.#engine)
		if (DEBUG_MODE) {
			let containerBox = this.#container.getBoundingClientRect()
			this.#debugRender =
				Render?.create({
					engine: this.#engine,
					element: queryStrict(
						this.#container,
						".word-cloud-debug",
						HTMLElement,
					),
					options: {
						width: containerBox.width,
						height: containerBox.height,
						showVelocity: true,
						showAngleIndicator: true,
					},
				}) ?? null
			if (this.#debugRender != null) Render?.run(this.#debugRender)
		}
	}

	#stop() {
		this.#unlockAllDraggedBodies()
		Runner.stop(this.#runner)
		if (this.#debugRender != null) Render?.stop(this.#debugRender)
	}
}
