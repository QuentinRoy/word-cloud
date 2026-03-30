import {
	boolean,
	pickList,
	string,
	WithAttributeProps,
} from "@quentinroy/custom-element-mixins"
import { css, html } from "./template"
import { generateRandomId, queryStrict } from "./utils"
import wordStylesheetContent from "./word-element.css?raw"
import wordTemplateContent from "./word-element.html?raw"

export class WordElementCheckedChangeEvent extends Event {
	static get type() {
		return "word-element-checked-change" as const
	}
	#checked: boolean

	constructor({ checked }: { checked: boolean }) {
		super(WordElementCheckedChangeEvent.type, {
			bubbles: false,
			composed: false,
		})
		this.#checked = checked
	}

	get checked() {
		return this.#checked
	}
}

export class WordElementDeleteEvent extends Event {
	static get type() {
		return "word-element-delete" as const
	}

	constructor() {
		super(WordElementDeleteEvent.type, { bubbles: false, composed: false })
	}
}

const wordTemplate = html`${wordTemplateContent}`
const wordStylesheet = css`${wordStylesheetContent}`

export class HTMLWordElement extends WithAttributeProps(HTMLElement, {
	checked: boolean(),
	action: pickList({ values: ["mark", "delete"] }),
	entryAnimation: pickList({ values: ["none", "fade"], default: "fade" }),
	value: string(),
}) {
	#shadowRoot: ShadowRoot
	#checkbox: HTMLInputElement
	#deleteButton: HTMLInputElement
	#label: HTMLLabelElement
	#id = generateRandomId()

	constructor() {
		super()
		this.#shadowRoot = this.attachShadow({ mode: "closed" })
		this.#shadowRoot.adoptedStyleSheets = [wordStylesheet]
		this.#shadowRoot.appendChild(wordTemplate.cloneNode(true))
		this.#checkbox = queryStrict(
			this.#shadowRoot,
			"input[name='checked']",
			HTMLInputElement,
		)
		this.#checkbox.id = `${this.#id}-checkbox`
		this.#deleteButton = queryStrict(
			this.#shadowRoot,
			"input[name='delete']",
			HTMLInputElement,
		)
		this.#deleteButton.id = `${this.#id}-delete`
		this.#label = queryStrict(this.#shadowRoot, "label", HTMLLabelElement)
	}

	static get observedAttributes() {
		return ["checked", "action", "value"]
	}

	connectedCallback() {
		this.#updateChecked()
		this.#updateAction()
		this.#updateLabel()
		this.#checkbox.addEventListener("change", this.#handleCheckboxChange)
		this.#deleteButton.addEventListener("click", this.#handleDelete)
	}

	disconnectedCallback() {
		this.#checkbox.removeEventListener("change", this.#handleCheckboxChange)
		this.#deleteButton.removeEventListener("click", this.#handleDelete)
	}

	attributeChangedCallback(
		name: string,
		oldValue: string | null,
		newValue: string | null,
	) {
		switch (name) {
			case "checked":
				this.#updateChecked()
				if (oldValue !== newValue && this.isConnected) {
					this.#dispatchCheckedChangeEvent()
				}
				break
			case "action":
				this.#updateAction()
				break
			case "value":
				this.#updateLabel()
				break
		}
	}

	#updateAction() {
		this.#label.htmlFor =
			this.action === "delete" ? this.#deleteButton.id : this.#checkbox.id
		this.#checkbox.disabled = this.action !== "mark"
		this.#deleteButton.disabled = this.action !== "delete"
	}

	#updateChecked() {
		this.#checkbox.checked = this.checked
	}

	#updateLabel() {
		this.#label.textContent = this.value
	}

	#dispatchCheckedChangeEvent() {
		this.dispatchEvent(
			new WordElementCheckedChangeEvent({ checked: this.checked }),
		)
	}

	#handleCheckboxChange = () => {
		if (this.checked !== this.#checkbox.checked) {
			this.checked = this.#checkbox.checked
		}
	}

	#handleDelete = () => {
		this.dispatchEvent(new WordElementDeleteEvent())
	}
}
