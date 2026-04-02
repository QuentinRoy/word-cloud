import {
	boolean,
	pickList,
	string,
	WithAttributeProps,
} from "@quentinroy/custom-element-mixins"
import { generateRandomId, queryStrict } from "./utils"
import wordStylesheet from "./word-element.css?stylesheet"
import wordTemplate from "./word-element.html?template"

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

export class WordElementValueChangeEvent extends Event {
	static get type() {
		return "word-element-value-change" as const
	}
	#value: string
	#oldValue: string

	constructor({ value, oldValue }: { value: string; oldValue: string }) {
		super(WordElementValueChangeEvent.type, { bubbles: false, composed: false })
		this.#value = value
		this.#oldValue = oldValue
	}

	get value() {
		return this.#value
	}

	get oldValue() {
		return this.#oldValue
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

export class WordElementDeletedChangeEvent extends Event {
	static get type() {
		return "word-element-deleted-change" as const
	}
	#deleted: boolean

	constructor({ deleted }: { deleted: boolean }) {
		super(WordElementDeletedChangeEvent.type, {
			bubbles: false,
			composed: false,
		})
		this.#deleted = deleted
	}

	get deleted() {
		return this.#deleted
	}
}

export type WordElementEntryAnimation = "fade" | "chip-fade"
export type WordElementExitAnimation = "fade"

export class HTMLWordElement extends WithAttributeProps(HTMLElement, {
	checked: boolean(),
	deleted: boolean(),
	dragged: boolean(),
	action: pickList({ values: ["check", "delete"] }),
	value: string({ default: "" }),
}) {
	#shadowRoot: ShadowRoot
	#checkbox: HTMLInputElement
	#deletedCheckbox: HTMLInputElement
	#label: HTMLLabelElement
	#id = generateRandomId()
	#internals = this.attachInternals()
	#entryAnimationToken = 0

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
		this.#deletedCheckbox = queryStrict(
			this.#shadowRoot,
			"input[name='deleted']",
			HTMLInputElement,
		)
		this.#deletedCheckbox.id = `${this.#id}-deleted`
		this.#label = queryStrict(this.#shadowRoot, "label", HTMLLabelElement)
	}

	static get observedAttributes() {
		return ["checked", "deleted", "action", "value"]
	}

	connectedCallback() {
		this.#updateChecked()
		this.#updateDeleted()
		this.#updateAction()
		this.#updateLabel()
		this.#checkbox.addEventListener("change", this.#handleCheckboxChange)
		this.#checkbox.addEventListener("keydown", this.#handleCheckboxKeypress)
		this.#deletedCheckbox.addEventListener(
			"change",
			this.#handleDeletedCheckboxChange,
		)
		this.#deletedCheckbox.addEventListener(
			"keydown",
			this.#handleDeletedCheckboxKeypress,
		)
	}

	disconnectedCallback() {
		this.#checkbox.removeEventListener("change", this.#handleCheckboxChange)
		this.#checkbox.removeEventListener("keydown", this.#handleCheckboxKeypress)
		this.#deletedCheckbox.removeEventListener(
			"change",
			this.#handleDeletedCheckboxChange,
		)
		this.#deletedCheckbox.removeEventListener(
			"keydown",
			this.#handleDeletedCheckboxKeypress,
		)
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
			case "deleted":
				this.#updateDeleted()
				if (oldValue !== newValue && this.isConnected) {
					this.#dispatchDeletedChangeEvent()
				}
				break
			case "action":
				this.#updateAction()
				break
			case "value":
				this.#updateLabel()
				if (oldValue !== newValue && this.isConnected) {
					this.#dispatchValueChangeEvent({
						oldValue: oldValue ?? "",
						value: newValue ?? "",
					})
				}
				break
		}
	}

	#updateAction() {
		this.#label.htmlFor =
			this.action === "delete" ? this.#deletedCheckbox.id : this.#checkbox.id
		this.#checkbox.disabled = this.action !== "check"
		this.#deletedCheckbox.disabled = this.action !== "delete"
	}

	#updateChecked() {
		this.#checkbox.checked = this.checked
	}

	#updateDeleted() {
		this.#deletedCheckbox.checked = this.deleted
	}

	#updateLabel() {
		this.#label.textContent = this.value
	}

	#dispatchCheckedChangeEvent() {
		this.dispatchEvent(
			new WordElementCheckedChangeEvent({ checked: this.checked }),
		)
	}

	#dispatchDeletedChangeEvent() {
		this.dispatchEvent(
			new WordElementDeletedChangeEvent({ deleted: this.deleted }),
		)
	}

	#dispatchValueChangeEvent({
		oldValue,
		value,
	}: {
		oldValue: string
		value: string
	}) {
		this.dispatchEvent(new WordElementValueChangeEvent({ oldValue, value }))
	}

	#handleCheckboxChange = () => {
		if (this.checked !== this.#checkbox.checked) {
			this.checked = this.#checkbox.checked
		}
	}

	#handleCheckboxKeypress = (event: KeyboardEvent) => {
		if (event.key === "Enter") {
			this.#checkbox.click()
		}
	}

	#handleDeletedCheckboxChange = () => {
		if (this.#deletedCheckbox.checked && !this.deleted) {
			this.deleted = true
			this.dispatchEvent(new WordElementDeleteEvent())
		} else if (!this.#deletedCheckbox.checked && this.deleted) {
			this.deleted = false
		}
	}

	#handleDeletedCheckboxKeypress = (event: KeyboardEvent) => {
		if (event.key === "Enter") {
			this.#deletedCheckbox.click()
		}
	}

	async animateEntry(animation: WordElementEntryAnimation = "fade") {
		this.#internals.states.delete("entering")
		this.#internals.states.delete("chip-entering")

		this.#internals.states.add("entering")
		if (animation === "chip-fade") this.#internals.states.add("chip-entering")

		await Promise.allSettled(
			this.getAnimations({ subtree: true }).map(
				(animation) => animation.finished,
			),
		)
		this.#internals.states.delete("entering")
		this.#internals.states.delete("chip-entering")
	}

	async animateExit(_animation: "fade" = "fade") {
		this.#internals.states.add("exiting")
		await Promise.allSettled(
			this.getAnimations({ subtree: true }).map(
				(animation) => animation.finished,
			),
		)
		this.#internals.states.delete("exiting")
	}
}
