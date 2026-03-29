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
import { HTMLWordElement } from "./word-element.ts"

const DEBUG_MODE = false

const CHAMFER_RADIUS = 8
const FRAME_THICKNESS = 1000
const FRAME_LENGTH = window.innerHeight * 1000
const PADDING = 0
const PRECISION = 1

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
}

interface WordEntry {
	id: number
	word: string
	x: number
	y: number
	angle: number
	checked: boolean
}

const MODES = ["mark", "delete", "input"] as const
type Mode = (typeof MODES)[number]

function isMode(value: unknown): value is Mode {
	return (MODES as readonly unknown[]).includes(value)
}

export class HTMLWordCloudElement extends WithAttributeProps(HTMLElement, {
	mode: pickList({ values: MODES }),
}) {
	#shadowRoot
	#wordForm: HTMLFormElement
	#wordInput: HTMLInputElement
	#container: HTMLElement
	#engine: Engine
	#runner: Runner
	#frameBodies: { left: Body; right: Body; top: Body; bottom: Body }
	#wordEntries: Map<InternalWordEntry["id"], InternalWordEntry> = new Map()
	#mouse: Mouse
	#mouseConstraint: MouseConstraint
	#resizeObserver = new ResizeObserver(() => {
		this.#updateFrameBodies()
	})
	#internals = this.attachInternals()

	static #frameThickness = FRAME_THICKNESS
	static #frameLength = FRAME_LENGTH
	static #padding = PADDING

	constructor() {
		super()
		this.#shadowRoot = this.attachShadow(
			scopedElementRegistry == null
				? { mode: "closed" }
				: { mode: "closed", customElementRegistry: scopedElementRegistry },
		)
		this.#shadowRoot.appendChild(mainTemplate.cloneNode(true))
		let stylesheets = [stylesheet]
		if (DEBUG_MODE) stylesheets.push(debugStyles)
		this.#shadowRoot.adoptedStyleSheets = stylesheets
		this.#container = queryStrict(this.#shadowRoot, ".word-cloud", HTMLElement)
		this.#wordForm = queryStrict(this.#container, "form", HTMLFormElement)
		this.#wordInput = queryStrict(this.#container, "input", HTMLInputElement)
		this.#engine = Engine.create({ enableSleeping: true })
		this.#engine.gravity.y = 0
		this.#runner = Runner.create()
		const frameThickness = HTMLWordCloudElement.#frameThickness
		const frameLength = HTMLWordCloudElement.#frameLength
		const padding = HTMLWordCloudElement.#padding
		this.#frameBodies = {
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
		Composite.add(this.#engine.world, [
			this.#frameBodies.left,
			this.#frameBodies.right,
			this.#frameBodies.top,
			this.#frameBodies.bottom,
		])
		this.#container.style.setProperty("--chamfer-radius", `${CHAMFER_RADIUS}px`)
		if (DEBUG_MODE) {
			this.#container.style.setProperty("--opacity", "0.2")
		}
		this.#mouse = Mouse.create(this)
		this.#mouseConstraint = MouseConstraint.create(this.#engine, {
			mouse: this.#mouse,
			constraint: { stiffness: 0.3, render: { visible: true } },
		})
	}

	static get observedAttributes() {
		return ["mode"]
	}

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
					this.#updateWordFromMode()
					this.#updateMouseConstraint()
				}
				break
		}
	}

	addWord({
		word,
		x,
		y,
		angle = 0,
		checked = false,
		velocity,
	}: Omit<WordEntry, "id" | "angle" | "checked"> &
		Partial<Pick<WordEntry, "angle" | "checked">> & {
			velocity?: { x: number; y: number }
		}) {
		let element = document.createElement(wordElementTagName) as HTMLWordElement
		element.innerText = word
		element.checked = checked
		element.classList.add("word")
		this.#container.appendChild(element)
		let id = HTMLWordCloudElement.#idGenerator()
		let { width, height } = element.getBoundingClientRect()
		let body = Bodies.rectangle(x, y, width, height, {
			chamfer: { radius: CHAMFER_RADIUS },
			inertia: Infinity,
			angle,
			frictionAir: 0.1,
			restitution: 0.2,
		})
		let entry: InternalWordEntry = { id, word, element, body }
		element.style.transform = this.#getWordTransform(entry)
		if (velocity) Body.setVelocity(body, velocity)
		Composite.add(this.#engine.world, body)
		this.#wordEntries.set(id, entry)
		return id
	}

	removeWord(id: WordEntry["id"]) {
		let entry = this.#wordEntries.get(id)
		if (entry) {
			this.#removeWordBodyAndDom(entry)
			this.#wordEntries.delete(entry.id)
			return true
		}
		return false
	}

	#removeWordBodyAndDom(entry: InternalWordEntry) {
		Composite.remove(this.#engine.world, entry.body)
		this.#container.removeChild(entry.element)
	}

	clear() {
		for (let entry of this.#wordEntries.values()) {
			this.#removeWordBodyAndDom(entry)
		}
		this.#wordEntries.clear()
	}

	#pickRandomVelocity() {
		let angle = Math.random() * 2 * Math.PI
		let speed = Math.random() * 50 + 25
		return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }
	}

	connectedCallback() {
		this.#wordForm.addEventListener("submit", this.#handleFormSubmit)
		Events.on(this.#runner, "tick", this.#handleTick)
		Events.on(this.#mouseConstraint, "startdrag", this.#handleStartDragging)
		Events.on(this.#mouseConstraint, "enddrag", this.#handleEndDragging)
		this.#updateFrameBodies()
		this.#updateMouseConstraint()
		this.#resizeObserver.observe(this.#container)
		this.#start()
	}

	disconnectedCallback() {
		this.#wordForm.removeEventListener("submit", this.#handleFormSubmit)
		Events.off(this.#runner, "tick", this.#handleTick)
		Events.off(this.#mouseConstraint, "startdrag", this.#handleStartDragging)
		Events.off(this.#mouseConstraint, "enddrag", this.#handleEndDragging)
		this.#resizeObserver.unobserve(this.#container)
		this.#stop()
	}

	getWords(): Iterable<WordEntry> {
		return this.#wordEntries
			.values()
			.map((entry) => ({
				id: entry.id,
				word: entry.word,
				x: toPrecision(entry.body.position.x, PRECISION),
				y: toPrecision(entry.body.position.y, PRECISION),
				angle: entry.body.angle,
				checked: entry.element.checked,
			}))
	}

	setWords(words: Omit<WordEntry, "id">[]) {
		this.clear()
		for (let word of words) {
			this.addWord(word)
		}
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

	#handleFormSubmit = (e: SubmitEvent) => {
		e.preventDefault()
		let newWord = this.#wordInput.value.trim()
		if (newWord !== "") {
			let containerRect = this.#container.getBoundingClientRect()
			let inputRect = this.#wordInput.getBoundingClientRect()
			let x = inputRect.left - containerRect.left + inputRect.width / 2
			let y = inputRect.top + inputRect.height / 2
			this.addWord({
				word: newWord,
				x,
				y,
				angle: 0,
				checked: false,
				velocity: this.#pickRandomVelocity(),
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

	#handleTick = () => {
		this.#updateWordPositions()
	}

	#updateWordPositions() {
		for (let entry of this.#wordEntries.values()) {
			entry.element.style.transform = this.#getWordTransform(entry)
		}
	}

	#getWordTransform({ body }: InternalWordEntry) {
		let angle = body.angle
		let translateX = toPrecision(body.position.x, PRECISION)
		let translateY = toPrecision(body.position.y, PRECISION)
		let transform = "translate(-50%, -50%)"
		if (translateX !== 0 || translateY !== 0) {
			transform += ` translate(${translateX}px, ${translateY}px)`
		}
		if (angle !== 0) {
			transform += ` rotate(${angle}rad)`
		}
		return transform
	}

	static #elementActionMaps: Record<Mode, HTMLWordElement["action"]> = {
		mark: "mark",
		delete: "delete",
		input: null,
	}

	#updateWordFromMode() {
		let action =
			this.mode == null
				? null
				: HTMLWordCloudElement.#elementActionMaps[this.mode]
		for (let { element } of this.#wordEntries.values()) {
			element.action = action
		}
	}

	#mouseEnabled = false
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

	static #idGenerator = createIterativeIdGenerator()

	#debugRender: Render | null = null
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
