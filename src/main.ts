import "./main.css"
import { getSavedWords, saveWords } from "./storage.ts"
import { queryStrict } from "./utils.ts"
import { XWordCloudElement } from "./x-word-cloud.ts"

const localStorageKey = "word-cloud-words"

customElements.define("x-word-cloud", XWordCloudElement)

let savedWords = getSavedWords(localStorageKey)
let wordCloud = queryStrict(document, "x-word-cloud", XWordCloudElement)

wordCloud.setWords(savedWords)

document.addEventListener("keypress", (event) => {
	if (
		event.target instanceof HTMLInputElement ||
		event.target instanceof HTMLTextAreaElement ||
		event.target instanceof XWordCloudElement
	) {
		return
	}
	switch (event.key) {
		case "m":
			wordCloud.mode = "mark"
			break
		case "d":
			wordCloud.mode = "delete"
			break
		case "i":
			wordCloud.mode = "input"
			break
	}
})

window.addEventListener("beforeunload", () => {
	// Clean up Matter.js engine to prevent memory leaks
	let wordCloud = document.querySelector<XWordCloudElement>("x-word-cloud")
	saveWords(localStorageKey, Array.from(wordCloud?.getWords() ?? []))
})
