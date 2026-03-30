import { pickList, WithAttributeProps } from "@quentinroy/custom-element-mixins"
import {
	Bodies,
	Body,
	Composite,
	Engine,
	Events,
	Mouse,
	MouseConstraint,
	Render,
	Runner,
} from "matter-js"
import { WordCheckedChangeEvent, WordDeleteEvent } from "./events.ts"
import { css, html } from "./template.ts"
import {
	createIterativeIdGenerator,
	generateRandomId,
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
} from "./word-element.ts"
import type { WordData } from "./word-entry.ts"
import { WordEntry } from "./word-entry.ts"

const DEBUG_MODE = false

const CHAMFER_RADIUS = 8
const FRAME_THICKNESS = 1000
const FRAME_LENGTH = window.innerHeight * 1000
const MIN_RANDOM_VELOCITY = 15
const MAX_RANDOM_VELOCITY = 50
const PADDING = 0
const INPUT_VOLUME_MIN_SIZE = 1
const TRANSLATE_PRECISION = 1
const ROTATE_PRECISION = 4
const ANGULAR_REST_ANGLE = 0
const ANGULAR_SPRING_STIFFNESS = 0.0001
const ANGULAR_DAMPING = 0.001
const ANGULAR_MAX_FORCE_PER_MASS = 0.005
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
	word: string
	body: Body
	element: HTMLWordElement
	publicEntry: WordEntry
	ignoreInputVolumeUntilExit: boolean
}

type WordVelocity = { x: number; y: number }

/**
 * Options used to add a single word to the cloud.
 */
type AddWordOptions = WordData & {
	/** The initial linear velocity applied to the word body. */
	velocity?: WordVelocity
	/** Whether the word element should play its entry animation. */
	animateEntry?: boolean
	/**
	 * Internal behavior used for words spawned by the input form.
	 * While true, collisions with the input volume stay disabled until the body
	 * leaves that volume once.
	 */
	ignoreInputVolumeUntilExit?: boolean
}

const MODES = ["check", "delete", "input"] as const
type Mode = (typeof MODES)[number]

function isMode(value: unknown): value is Mode {
	return (MODES as readonly unknown[]).includes(value)
}

interface HTMLWordCloudElementEventMap extends HTMLElementEventMap {
	[WordCheckedChangeEvent.type]: WordCheckedChangeEvent
	[WordDeleteEvent.type]: WordDeleteEvent
}

/**
 * Custom element that renders an interactive word cloud powered by Matter.js.
 *
 * The element manages DOM-backed word items, keeps them synchronized with
 * physics bodies, and exposes a small API for adding, removing, clearing,
 * serializing, and restoring words.
 */
export class HTMLWordCloudElement extends WithAttributeProps(HTMLElement, {
	mode: pickList({ values: MODES }),
}) {
	static #elementActionMaps: Record<Mode, HTMLWordElement["action"]> = {
		check: "check",
		delete: "delete",
		input: null,
	}

	static #idGenerator = createIterativeIdGenerator()

	static #frameThickness = FRAME_THICKNESS
	static #frameLength = FRAME_LENGTH
	static #padding = PADDING

	#wordForm: HTMLFormElement
	#wordInput: HTMLInputElement
	#container: HTMLElement
	#engine: Engine
	#runner: Runner
	#frameBodies: { left: Body; right: Body; top: Body; bottom: Body }
	#inputVolumeBody: Body
	#inputVolumeBodySize = {
		width: INPUT_VOLUME_MIN_SIZE,
		height: INPUT_VOLUME_MIN_SIZE,
	}
	#inputVolumeEnabled = false
	#wordEntries: Map<InternalWordEntry["id"], InternalWordEntry> = new Map()
	#mouseConstraint: MouseConstraint
	#mouseEnabled = false
	#resizeObserver = new ResizeObserver(() => {
		this.#updateFrameBodies()
		this.#updateInputVolumeBody()
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
		return ["mode"]
	}

	/**
	 * Reacts to supported attribute changes and keeps the word actions and mouse
	 * interaction mode in sync with the current state.
	 *
	 * @param name The name of the attribute that changed.
	 * @param _oldValue The previous attribute value.
	 * @param newValue The new attribute value.
	 */
	attributeChangedCallback(
		name: string,
		_oldValue: string | null,
		newValue: string | null,
	) {
		switch (name) {
			case "mode":
				if (newValue !== null && !isMode(newValue)) {
					this.removeAttribute("mode")
				} else {
					this.#updateWordsActionFromMode()
					this.#updateInputVolumeFromMode()
					this.#updateMouseConstraint()
				}
				break
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
		this.#updateInputVolumeFromMode()
		this.#updateMouseConstraint()
		this.#resizeObserver.observe(this.#container)
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
		this.#resizeObserver.unobserve(this.#container)
		this.#stop()
	}

	/**
	 * Creates a rendered word element and its matching physics body, and returns
	 * a live {@link WordEntry} handle.
	 *
	 * @param options.word The text content to display.
	 * @param options.x The initial horizontal center position in pixels.
	 * @param options.y The initial vertical center position in pixels.
	 * @param options.angle The initial body rotation in radians. Defaults to `0`.
	 * @param options.checked Whether the word starts in the checked state. Defaults to `false`.
	 * @param options.velocity The initial linear velocity applied to the body.
	 * @param options.animateEntry Whether the word should play its entry animation. Defaults to `false`.
	 * @returns A live {@link WordEntry} for the newly created word.
	 */
	addWord({
		word,
		x,
		y,
		angle = 0,
		checked = false,
		velocity,
		animateEntry = false,
		ignoreInputVolumeUntilExit = false,
	}: AddWordOptions): WordEntry {
		let element = document.createElement(wordElementTagName) as HTMLWordElement
		// It seems we need to add element before setting the checked property
		// otherwise it does not update the attribute properly.
		this.#container.appendChild(element)
		element.value = word
		element.checked = checked
		if (!animateEntry) element.entryAnimation = "none"
		element.classList.add("word")
		element.action =
			this.mode == null
				? null
				: HTMLWordCloudElement.#elementActionMaps[this.mode]
		let id = HTMLWordCloudElement.#idGenerator()
		let { width, height } = element.getBoundingClientRect()
		let body = Bodies.rectangle(x, y, width, height, {
			chamfer: { radius: CHAMFER_RADIUS },
			angle,
			frictionAir: 0.05,
			restitution: 0.2,
			mass: width * height * 0.001,
			collisionFilter: {
				category: WORD_COLLISION_CATEGORY,
				mask: this.#getWordCollisionMask({
					ignoreInputVolume: ignoreInputVolumeUntilExit,
				}),
			},
		})
		const deleteWord = () => {
			if (!this.#wordEntries.has(id)) return
			this.dispatchEvent(new WordDeleteEvent({ entry: publicEntry }))
			this.#removeById(id)
		}
		let publicEntry = new WordEntry({
			word,
			getX: () => toPrecision(body.position.x, TRANSLATE_PRECISION),
			getY: () => toPrecision(body.position.y, TRANSLATE_PRECISION),
			getAngle: () => body.angle,
			getChecked: () => element.checked,
			setChecked: (v) => {
				element.checked = v
			},
			remove: deleteWord,
		})
		let entry: InternalWordEntry = {
			id,
			word,
			element,
			body,
			publicEntry,
			ignoreInputVolumeUntilExit,
		}
		element.addEventListener(WordElementDeleteEvent.type, () => {
			deleteWord()
		})
		element.addEventListener(WordElementCheckedChangeEvent.type, () => {
			this.dispatchEvent(
				new WordCheckedChangeEvent({
					entry: publicEntry,
					checked: element.checked,
				}),
			)
		})
		element.style.transform = this.#getWordTransform(entry)
		if (velocity) Body.setVelocity(body, velocity)
		Composite.add(this.#engine.world, body)
		this.#wordEntries.set(id, entry)
		return publicEntry
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
	 * Returns live {@link WordEntry} handles for all words currently in the cloud.
	 * Property reads on each entry always reflect the current state.
	 * Useful for persistence — pass the result to {@link setWords} to restore.
	 */
	getWords(): Iterable<WordEntry> {
		return this.#wordEntries.values().map((entry) => entry.publicEntry)
	}

	/**
	 * Replaces the current cloud contents with the provided word data.
	 * Accepts plain {@link WordData} objects or previously obtained
	 * {@link WordEntry} handles (which are structurally compatible).
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
		engine.gravity.scale = 0
		const runner = Runner.create()
		return { engine, runner }
	}

	#setupFrameBodies(engine: Engine) {
		const frameThickness = HTMLWordCloudElement.#frameThickness
		const frameLength = HTMLWordCloudElement.#frameLength
		const padding = HTMLWordCloudElement.#padding
		const frameBodies = {
			left: Bodies.rectangle(
				-frameThickness / 2 + padding,
				-frameThickness / 2 + padding,
				frameThickness,
				frameLength,
				{ isStatic: true },
			),
			top: Bodies.rectangle(
				-frameThickness / 2 + padding,
				-frameThickness / 2 + padding,
				frameLength,
				frameThickness,
				{ isStatic: true },
			),
			right: Bodies.rectangle(0, 0, frameThickness, frameLength, {
				isStatic: true,
			}),
			bottom: Bodies.rectangle(0, 0, frameLength, frameThickness, {
				isStatic: true,
			}),
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
		Composite.remove(this.#engine.world, entry.body)
		this.#container.removeChild(entry.element)
	}

	#pickRandomVelocity() {
		let angle = Math.random() * 2 * Math.PI
		let speed =
			Math.random() * (MAX_RANDOM_VELOCITY - MIN_RANDOM_VELOCITY) +
			MIN_RANDOM_VELOCITY
		return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }
	}

	#updateFrameBodies() {
		const { right, bottom } = this.#frameBodies
		const { width, height } = this.#container.getBoundingClientRect()
		const frameThickness = HTMLWordCloudElement.#frameThickness
		const padding = HTMLWordCloudElement.#padding
		Body.setPosition(right, {
			x: width + frameThickness / 2 - padding,
			y: -frameThickness / 2 + padding,
		})
		Body.setPosition(bottom, {
			x: -frameThickness / 2 + padding,
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
				animateEntry: true,
				ignoreInputVolumeUntilExit: true,
			})
		}
		this.#wordInput.value = ""
	}

	#handleStartDragging = () => {
		if (this.#mouseEnabled) this.#internals.states.add("active")
	}

	#handleEndDragging = () => {
		this.#internals.states.delete("active")
	}

	#handleBeforeUpdate = () => {
		this.#applyAngularRestoringTorque()
	}

	#handleTick = () => {
		this.#updateWordInputCollisions()
		this.#updateWordPositions()
	}

	#applyAngularRestoringTorque() {
		for (let { body } of this.#wordEntries.values()) {
			if (body.isStatic || body.isSleeping) continue
			let angleError = body.angle - ANGULAR_REST_ANGLE
			if (!Number.isFinite(body.inertia) || body.inertia <= 0) continue
			const desiredAngularAcceleration =
				-angleError * ANGULAR_SPRING_STIFFNESS -
				body.angularVelocity * ANGULAR_DAMPING
			const desiredTorque = desiredAngularAcceleration * body.inertia

			const width = body.bounds.max.x - body.bounds.min.x
			const height = body.bounds.max.y - body.bounds.min.y
			const arm = Math.max(4, Math.min(width, height) * 0.25)
			if (!Number.isFinite(arm) || arm <= 0) continue

			const rawForceMagnitude = desiredTorque / (2 * arm)
			const maxForce = body.mass * ANGULAR_MAX_FORCE_PER_MASS
			const forceMagnitude = Math.max(
				-maxForce,
				Math.min(maxForce, rawForceMagnitude),
			)

			const ux = Math.cos(body.angle)
			const uy = Math.sin(body.angle)
			const nx = -uy
			const ny = ux

			const pointA = {
				x: body.position.x + ux * arm,
				y: body.position.y + uy * arm,
			}
			const pointB = {
				x: body.position.x - ux * arm,
				y: body.position.y - uy * arm,
			}
			const forceA = { x: nx * forceMagnitude, y: ny * forceMagnitude }
			const forceB = { x: -forceA.x, y: -forceA.y }

			Body.applyForce(body, pointA, forceA)
			Body.applyForce(body, pointB, forceB)
		}
	}

	#updateWordInputCollisions() {
		if (this.#inputVolumeEnabled) {
			for (let entry of this.#wordEntries.values()) {
				if (!entry.ignoreInputVolumeUntilExit) continue
				if (this.#isOverlappingInputVolume(entry.body)) continue
				entry.ignoreInputVolumeUntilExit = false
				entry.body.collisionFilter.mask = this.#getWordCollisionMask({
					ignoreInputVolume: false,
				})
			}
		}
	}

	#updateWordPositions() {
		for (let entry of this.#wordEntries.values()) {
			entry.element.style.transform = this.#getWordTransform(entry)
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

	#updateWordsActionFromMode() {
		let action =
			this.mode == null
				? null
				: HTMLWordCloudElement.#elementActionMaps[this.mode]
		for (let { element } of this.#wordEntries.values()) {
			element.action = action
		}
	}

	#updateInputVolumeFromMode() {
		if (this.mode === "input") {
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
			entry.body.collisionFilter.mask = this.#getWordCollisionMask({
				ignoreInputVolume: false,
			})
		}
		this.#inputVolumeEnabled = false
	}

	#updateMouseConstraint() {
		if (this.mode === "input") {
			if (this.#mouseEnabled) return
			this.#mouseEnabled = true
			Composite.add(this.#engine.world, this.#mouseConstraint)
		} else {
			this.#mouseEnabled = false
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
		Runner.stop(this.#runner)
		if (this.#debugRender != null) Render?.stop(this.#debugRender)
	}
}
