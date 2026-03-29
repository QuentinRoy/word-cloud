import {
	boolean,
	pickList,
	WithAttributeProps,
} from "@quentinroy/custom-element-mixins"
import { css, html } from "./template"
import { generateRandomId, queryStrict } from "./utils"
import wordStylesheetContent from "./word-element.css?raw"
import wordTemplateContent from "./word-element.html?raw"

const wordTemplate = html`${wordTemplateContent}`
const wordStylesheet = css`${wordStylesheetContent}`

export class HTMLWordElement extends WithAttributeProps(HTMLElement, {
	checked: boolean(),
	action: pickList({ values: ["mark", "delete"] }),
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
		return ["checked", "action"]
	}

	connectedCallback() {
		this.#updateChecked()
		this.#updateAction()
		this.#checkbox.addEventListener("change", this.#handleCheckboxChange)
	}

	disconnectedCallback() {
		this.#checkbox.removeEventListener("change", this.#handleCheckboxChange)
	}

	attributeChangedCallback(name: string) {
		switch (name) {
			case "checked":
				this.#updateChecked()
				break
			case "action":
				this.#updateAction()
				break
		}
	}

	#updateChecked() {
		this.#checkbox.checked = this.checked
	}

	#updateAction() {
		this.#label.htmlFor =
			this.action === "delete" ? this.#deleteButton.id : this.#checkbox.id
		this.#checkbox.disabled = this.action !== "mark"
		this.#deleteButton.disabled = this.action !== "delete"
	}

	#handleCheckboxChange = () => {
		if (this.checked !== this.#checkbox.checked) {
			this.checked = this.#checkbox.checked
		}
	}
}
