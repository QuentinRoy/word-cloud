import "./main.css"
import { HTMLWordCloudElement, type WordCloudMode } from "../src/index.ts"
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

const WORD_CLOUD_MODES: WordCloudMode[] = ["check", "delete", "input"]

function isMode(value: unknown): value is WordCloudMode {
	return (WORD_CLOUD_MODES as readonly unknown[]).includes(value)
}

const syncModeControls = (mode: WordCloudMode | null) => {
	let activeMode = mode ?? "input"
	for (let input of controls.elements ?? []) {
		if (!(input instanceof HTMLInputElement)) continue
		if (input.name !== "mode") continue
		input.checked = input.value === activeMode
	}
}

wordCloud.setWords(savedWords)
syncModeControls(wordCloud.mode)

controls.addEventListener("change", (event) => {
	let { target } = event
	if (!(target instanceof HTMLInputElement)) return
	if (target.name !== "mode") return
	if (!isMode(target.value)) return
	wordCloud.mode = target.value
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

wordCloud.addEventListener("mode-change", (event) => {
	console.log(`[word-cloud] mode: ${event.oldMode} -> ${event.mode}`)
	syncModeControls(event.mode)
})

document.addEventListener("keypress", (event) => {
	if (
		event.target instanceof HTMLTextAreaElement ||
		event.target instanceof HTMLWordCloudElement
	) {
		return
	}
	switch (event.key) {
		case "c":
			wordCloud.mode = "check"
			break
		case "d": {
			wordCloud.mode = "delete"
			break
		}
		case "i":
			wordCloud.mode = "input"
			break
	}
})

window.addEventListener("beforeunload", () => {
	saveWords(localStorageKey, Array.from(wordCloud.getWords()))
})
