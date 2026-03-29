import "./main.css"
import { getSavedWords, saveWords } from "./storage.ts"
import { queryStrict } from "./utils.ts"
import { HTMLWordCloudElement } from "./word-cloud-element.ts"

const localStorageKey = "word-cloud-words"

customElements.define("x-word-cloud", HTMLWordCloudElement)

let savedWords = getSavedWords(localStorageKey)
let wordCloud = queryStrict(document, "x-word-cloud", HTMLWordCloudElement)

wordCloud.setWords(savedWords)

let lastDeleteKeyPress: number | null = null
let doubleDeleteThreshold = 500 // milliseconds
document.addEventListener("keypress", (event) => {
	if (
		event.target instanceof HTMLInputElement ||
		event.target instanceof HTMLTextAreaElement ||
		event.target instanceof HTMLWordCloudElement
	) {
		return
	}
	switch (event.key) {
		case "m":
			wordCloud.mode = "mark"
			break
		case "d": {
			let now = Date.now()
			if (
				lastDeleteKeyPress !== null &&
				now - lastDeleteKeyPress < doubleDeleteThreshold
			) {
				wordCloud.clear()
				wordCloud.mode = "input"
				lastDeleteKeyPress = null
			} else {
				lastDeleteKeyPress = now
				wordCloud.mode = "delete"
			}
			break
		}
		case "i":
			wordCloud.mode = "input"
			break
	}
})

window.addEventListener("beforeunload", () => {
	// Clean up Matter.js engine to prevent memory leaks
	let wordCloud = document.querySelector<HTMLWordCloudElement>("x-word-cloud")
	saveWords(localStorageKey, Array.from(wordCloud?.getWords() ?? []))
})
