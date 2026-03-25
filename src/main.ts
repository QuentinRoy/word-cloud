import "./main.css"
import { getSavedWords, saveWords } from "./storage.ts"
import { queryStrict } from "./utils.ts"
import { WordCloudHTMLElement } from "./word-cloud.ts"

const localStorageKey = "word-cloud-words"

customElements.define("x-word-cloud", WordCloudHTMLElement)

let savedWords = getSavedWords(localStorageKey)
let wordCloud = queryStrict(document, "x-word-cloud", WordCloudHTMLElement)

wordCloud.setWords(savedWords)

document.addEventListener("keypress", (event) => {
	if (
		event.target instanceof HTMLInputElement ||
		event.target instanceof HTMLTextAreaElement ||
		event.target instanceof WordCloudHTMLElement
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
	let wordCloud = document.querySelector<WordCloudHTMLElement>("x-word-cloud")
	saveWords(localStorageKey, Array.from(wordCloud?.getWords() ?? []))
})
