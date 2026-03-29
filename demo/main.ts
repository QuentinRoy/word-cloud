import "./main.css"
import { HTMLWordCloudElement } from "../src/index.ts"
import { getSavedWords, saveWords } from "./storage.ts"

const localStorageKey = "word-cloud-words"

if (!customElements.get("x-word-cloud")) {
	customElements.define("x-word-cloud", HTMLWordCloudElement)
}

let savedWords = getSavedWords(localStorageKey)
let wordCloud = document.querySelector("x-word-cloud")

if (!(wordCloud instanceof HTMLWordCloudElement)) {
	throw new Error("Expected x-word-cloud demo root element to exist")
}

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
	saveWords(localStorageKey, Array.from(wordCloud.getWords()))
})
