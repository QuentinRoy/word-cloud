import "./main.css"
import { getSavedWords, saveWords } from "./storage.ts"
import { XWordCloudElement } from "./x-word-cloud.ts"

const localStorageKey = "word-cloud-words"

customElements.define("x-word-cloud", XWordCloudElement)

let savedWords = getSavedWords(localStorageKey)
let wordCloud = document.querySelector<XWordCloudElement>("x-word-cloud")
wordCloud?.setWords(savedWords)

window.addEventListener("beforeunload", () => {
	// Clean up Matter.js engine to prevent memory leaks
	let wordCloud = document.querySelector<XWordCloudElement>("x-word-cloud")
	saveWords(localStorageKey, Array.from(wordCloud?.getWords() ?? []))
})
