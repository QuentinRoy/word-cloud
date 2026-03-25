import {
	Bodies,
	Body,
	Composite,
	Engine,
	Events,
	Mouse,
	MouseConstraint,
	type Render as RenderType,
	Runner,
} from "matter-js"
import { css, html } from "./template.ts"

const DEBUG_MODE = false

const CHAMFER_RADIUS = 8
const FRAME_THICKNESS = 1000
const FRAME_LENGTH = window.innerHeight * 1000
const PADDING = 0

let Render: typeof RenderType | null = null
if (DEBUG_MODE) {
	Render = (await import("matter-js")).Render
}

const mainTemplate = html`
  <div class="word-cloud">
    ${DEBUG_MODE ? `<div class="word-cloud-debug"></div>` : ""}
    <form>
      <input name="word-input" type="text">
    </form>
  </div>
`

const wordTemplate = html`
  <div class="word">
    <input type="checkbox">
    <label></label>
  </div>
`

const stylesheet = css`
:host {
	--space-s: 0.5rem;
	--space-m: 1rem;
	--line-width: 2px;
	--font-size: 1.5rem;
	--font-family: Arial;
	--input-background: #fff;
	--input-text-color: #000;
	--input-background-color: #eee;
	--input-border-color: #444;
	--input-focus-text-color: hwb(212 2% 88%);
	--input-focus-border-color: hwb(212 16% 22%);
	--input-focus-shadow-color: hwb(212 76% 0%);
	--input-focus-background-color: hwb(212 95% 0%);
	--word-text-color: #000;
	--word-background-color: #fff;
	--word-border-color: var(--word-background-color);
	--word-fade-in-duration: 1s;
	--checked-opacity: 0.5;
	display: block;
}

.word-cloud {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	height: 100%;
	font-size: var(--font-size);
}

form {
	z-index: 2;
	display: none;
}

.word {
	position: absolute;
	top: 0;
	left: 0;
	z-index: 3;
	padding: var(--space-s) var(--space-m);
	font-family: var(--font-family);
	font-size: var(--font-size);
	color: var(--word-text-color);
	text-align: center;
	background-color: var(--word-background-color);
	border: var(--line-width) solid var(--word-border-color);
	border-radius: var(--chamfer-radius, 0);
	opacity: var(--opacity, 1);
	animation: word-fade-in var(--word-fade-in-duration, 0.3s);
}

@keyframes word-fade-in {
	0% {
		background-color: transparent;
		border-color: transparent;
		color: var(--input-focus-color);
	}
	100% {
		background-color: var(--word-background-color);
		border-color: var(--word-border-color);
		color: var(--word-text-color);
	}
}

.word input[type="checkbox"] {
	display: none;
}

.word:has(input[type="checkbox"]:checked) {
	opacity: var(--checked-opacity);

	label {
		text-decoration: line-through;
	}
}

input[type="text"] {
	padding: var(--space-s) var(--space-m);
	font-family: var(--font-family);
	font-size: var(--font-size);
	color: var(--input-text-color);
	text-align: center;
	background-color: var(--input-background-color);
	border: var(--line-width) solid var(--input-border-color);
	border-radius: var(--chamfer-radius, 0);
	opacity: var(--opacity, 1);

	&:focus,
	&:focus-visible {
		color: var(--input-focus-text-color);
		outline: none;
		background-color: var(--input-focus-background-color);
		border-color: var(--input-focus-border-color);
		border-radius: var(--chamfer-radius, 0);
		filter: drop-shadow(0px 0px 10px var(--input-focus-shadow-color));
	}
}

:host([mode="mark"]) {
	.word {
		cursor: pointer;
	}
}

:host([mode="input"]) {
	form {
		display: block;
	}
	.word {
		user-select: none;
	}
}
`

const debugStyles = css`
  .word-cloud-debug {
    z-index: 1;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
`

interface WordEntry {
	word: string
	domElement: HTMLElement
	body: Body
	width: number
	height: number
}

const MODES = { INPUT: "input", MARK: "mark", NONE: "none" } as const

type Mode = (typeof MODES)[keyof typeof MODES]

function isMode(value: unknown): value is Mode {
	return (Object.values(MODES) as unknown[]).includes(value)
}

export class XWordCloudElement extends HTMLElement {
	#shadowRoot
	#wordForm: HTMLFormElement
	#wordInput: HTMLInputElement
	#container: HTMLElement
	#engine: Engine
	#runner: Runner
	#frameBodies: { left: Body; right: Body; top: Body; bottom: Body }
	#wordEntries: WordEntry[] = []
	#mouse: Mouse
	#mouseConstraint: MouseConstraint
	#resizeObserver = new ResizeObserver(() => {
		this.#updateFrameBodies()
	})

	static #frameThickness = FRAME_THICKNESS
	static #frameLength = FRAME_LENGTH
	static #padding = PADDING

	static MODES = Object.freeze(MODES)

	constructor() {
		super()
		this.#shadowRoot = this.attachShadow({ mode: "closed" })
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
		const frameThickness = XWordCloudElement.#frameThickness
		const frameLength = XWordCloudElement.#frameLength
		const padding = XWordCloudElement.#padding
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
		this.#mouse = Mouse.create(this.#container)
		this.#mouseConstraint = MouseConstraint.create(this.#engine, {
			mouse: this.#mouse,
			constraint: { stiffness: 0.2 },
		})
	}

	static observedAttributes = ["mode"]
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
					this.#updateWordInputs()
					this.#updateMouseConstraint()
				}
				break
		}
	}

	get mode() {
		let value = this.getAttribute("mode")
		if (value == null || !isMode(value)) {
			return MODES.NONE
		}
		return value
	}

	set mode(value: Mode) {
		this.setAttribute("mode", value)
	}

	addNewWord(word: string) {
		let fragment = wordTemplate.cloneNode(true) as DocumentFragment
		let newWord = queryStrict(fragment, ".word", HTMLElement)
		this.#container.appendChild(newWord)
		if (!(newWord instanceof HTMLElement)) {
			throw new Error(
				".word element is not found in the template, or is not an HTMLElement",
			)
		}
		let label = queryStrict(newWord, "label", HTMLLabelElement)
		let input = queryStrict(newWord, "input", HTMLInputElement)
		let id = XWordCloudElement.#idGenerator()
		label.textContent = word
		label.htmlFor = id
		input.id = id
		input.disabled = this.mode !== "mark"
		let newWordRect = newWord.getBoundingClientRect()
		let containerRect = this.#container.getBoundingClientRect()
		let inputRect = this.#wordInput.getBoundingClientRect()
		let width = newWordRect.width
		let height = newWordRect.height
		let x =
			inputRect.left -
			containerRect.left +
			inputRect.width / 2 -
			newWordRect.width / 2
		let y = inputRect.top
		newWord.style.transform = `translate(${x}px, ${y}px)`
		let body = Bodies.rectangle(x + width / 2, y + height / 2, width, height, {
			chamfer: { radius: CHAMFER_RADIUS },
			inertia: Infinity,
			frictionAir: 0.1,
			restitution: 0.2,
		})
		Body.setVelocity(body, this.#pickRandomVelocity())
		Composite.add(this.#engine.world, body)
		this.#wordEntries.push({ word, domElement: newWord, body, width, height })
	}

	#pickRandomVelocity() {
		let angle = Math.random() * 2 * Math.PI
		let speed = Math.random() * 50 + 25
		return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }
	}

	connectedCallback() {
		this.#wordForm.addEventListener("submit", this.#handleFormSubmit)
		Events.on(this.#runner, "tick", this.#handleTick)
		this.#updateFrameBodies()
		this.#updateMouseConstraint()
		this.#resizeObserver.observe(this.#container)
		this.#start()
	}

	disconnectedCallback() {
		this.#wordForm.removeEventListener("submit", this.#handleFormSubmit)
		Events.off(this.#runner, "tick", this.#handleTick)
		this.#resizeObserver.unobserve(this.#container)
		this.#stop()
	}

	#updateFrameBodies() {
		const { right, bottom } = this.#frameBodies
		const { width, height } = this.#container.getBoundingClientRect()
		const frameThickness = XWordCloudElement.#frameThickness
		const padding = XWordCloudElement.#padding
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
			this.addNewWord(this.#wordInput.value)
		}
		this.#wordInput.value = ""
	}

	#handleTick = () => {
		this.#updateWordPositions()
	}

	#updateWordPositions() {
		for (let entry of this.#wordEntries) {
			let { body, width, height, domElement } = entry
			let { x, y } = body.position
			let angle = body.angle
			let translateX = toPrecision(x - width / 2, 1)
			let translateY = toPrecision(y - height / 2, 1)
			domElement.style.transform = `translate(${translateX}px, ${translateY}px) rotate(${angle}rad)`
		}
	}

	#updateWordInputs() {
		let areChecksDisabled = this.mode !== "mark"
		let checkboxes =
			this.#container.querySelectorAll<HTMLInputElement>(".word input")
		for (let checkbox of checkboxes) {
			checkbox.disabled = areChecksDisabled
		}
	}

	#updateMouseConstraint() {
		if (this.mode === "input") {
			Composite.add(this.#engine.world, this.#mouseConstraint)
		} else {
			Composite.remove(this.#engine.world, this.#mouseConstraint)
		}
	}

	static #idGenerator = createIdGenerator((x) => `word-cloud-${x}`)

	#debugRender: RenderType | null = null
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

/**
 * Queries the DOM for an element matching the specified selector and checks if it is of the expected type.
 * @param root The root element to query within. Must have a querySelector method.
 * @param selector The CSS selector to match the desired element.
 * @param type The expected constructor/type of the element.
 * @returns The found element.
 * @throws An error if the element is not found or is not of the expected type.
 */
function queryStrict<T extends HTMLElement>(
	root: { querySelector: (selector: string) => HTMLElement | null },
	selector: string,
	type: new () => T,
): T {
	let element = root.querySelector(selector)
	if (element instanceof type) {
		return element
	}
	throw new Error(`Expected ${selector} to be a ${type.constructor.name}`)
}

/**
 * Creates a unique ID generator function that generates IDs based on a provided mapping function.
 * @param map A function that takes a number and returns a value of type T.
 * This function is used to generate the ID based on the current count.
 * @returns A function that, when called, returns a unique ID of type T.
 */
function createIdGenerator<T>(map: (x: number) => T): () => T {
	let last = 0
	return () => {
		let current = last + 1
		last = current
		return map(current)
	}
}

/**
 * Rounds a number to a given number of digits after the decimal point.
 * @param value The number to round.
 * @param precision The number of digits after the decimal point to round to.
 * @returns The rounded number.
 */
function toPrecision(value: number, precision: number): number {
	let f = 10 ** Math.floor(precision)
	return Math.round(value * f) / f
}
