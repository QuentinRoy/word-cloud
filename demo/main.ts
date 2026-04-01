import "./main.css"
import { HTMLWordCloudElement, type WordCloudWordAction } from "../src/index.ts"
import { getSavedWords, saveWords } from "./storage.ts"

const localStorageKey = "word-cloud-words"

if (!customElements.get("x-word-cloud")) {
	customElements.define("x-word-cloud", HTMLWordCloudElement)
}

const savedWords = getSavedWords(localStorageKey)
const wordCloud = document.querySelector("x-word-cloud")
const controls = document.querySelector<HTMLFormElement>("#controls")
const clearButton = document.querySelector("#clear")

if (!(controls instanceof HTMLFormElement)) {
	throw new Error("Expected controls form to exist")
}

if (!(wordCloud instanceof HTMLWordCloudElement)) {
	throw new Error("Expected x-word-cloud demo root element to exist")
}
if (!(controls instanceof HTMLFormElement)) {
	throw new Error("Expected controls form to exist")
}
if (!(clearButton instanceof HTMLButtonElement)) {
	throw new Error("Expected clear button to exist")
}

const WORD_ACTIONS: WordCloudWordAction[] = ["drag", "check", "delete"]

function isWordAction(value: unknown): value is WordCloudWordAction {
	return (WORD_ACTIONS as readonly unknown[]).includes(value)
}

const syncControls = () => {
	for (let control of controls.elements ?? []) {
		if (!(control instanceof HTMLInputElement)) continue
		if (control.name === "word-action") {
			control.checked = control.value === wordCloud.wordAction
			continue
		}
		if (control.name === "has-input") {
			control.checked = wordCloud.hasInput
		}
	}
}

wordCloud.setWords(savedWords)
syncControls()

controls.addEventListener("change", (event) => {
	let { target } = event
	if (!(target instanceof HTMLInputElement)) return
	if (target.name === "word-action") {
		if (!isWordAction(target.value)) return
		wordCloud.wordAction = target.value
		return
	}
	if (target.name === "has-input") {
		wordCloud.hasInput = target.checked
	}
})

clearButton.addEventListener("click", () => {
	wordCloud.clear()
})

wordCloud.addEventListener("word-add", (event) => {
	console.log(`[word-cloud] added word: "${event.handle.word}"`)
})

wordCloud.addEventListener("word-value-change", (event) => {
	console.log(
		`[word-cloud] renamed word: "${event.oldValue}" -> "${event.value}"`,
	)
})

wordCloud.addEventListener("word-checked-change", (event) => {
	console.log(`[word-cloud] "${event.handle.word}" checked: ${event.checked}`)
})

wordCloud.addEventListener("word-delete", (event) => {
	console.log(`[word-cloud] deleted word: "${event.handle.word}"`)
})

wordCloud.addEventListener("word-action-change", (event) => {
	console.log(
		`[word-cloud] word action: ${event.oldWordAction} -> ${event.wordAction}`,
	)
	syncControls()
})

wordCloud.addEventListener("has-input-change", (event) => {
	console.log(
		`[word-cloud] has-input: ${event.oldHasInput} -> ${event.hasInput}`,
	)
	syncControls()
})

document.addEventListener("keypress", (event) => {
	if (
		event.target instanceof HTMLTextAreaElement ||
		event.target instanceof HTMLWordCloudElement
	) {
		return
	}
	switch (event.key) {
		case "g":
			wordCloud.wordAction = "drag"
			break
		case "c":
			wordCloud.wordAction = "check"
			break
		case "d": {
			wordCloud.wordAction = "delete"
			break
		}
		case "i":
			wordCloud.hasInput = !wordCloud.hasInput
			break
	}
})

window.addEventListener("beforeunload", () => {
	saveWords(localStorageKey, Array.from(wordCloud.getWords()))
})
