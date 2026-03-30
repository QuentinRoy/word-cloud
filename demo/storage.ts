import { type } from "arktype"
import { toPrecision } from "../src/utils"

let wordSchema = type({
	word: "string",
	x: "number",
	y: "number",
	angle: "number = 0",
	checked: "boolean = false",
}).array()

export function getSavedWords(key: string): typeof wordSchema.inferOut {
	let savedWordsString = window.localStorage.getItem(key)
	let parsedWords: unknown = []
	try {
		parsedWords = JSON.parse(savedWordsString ?? "[]")
	} catch (e) {
		console.error("Failed to parse saved words from localStorage:", e)
		return []
	}
	let validationResult = wordSchema(parsedWords)
	if (validationResult instanceof type.errors) {
		console.error(
			"Saved words in localStorage have invalid format:",
			validationResult.summary,
		)
		return []
	}
	return validationResult
}

export function saveWords(
	key: string,
	words: Iterable<(typeof wordSchema.inferIn)[number]>,
) {
	let wordArray: typeof wordSchema.inferIn = []
	for (let { word, x, y, angle, checked } of words) {
		angle = toPrecision(angle ?? 0, 4)
		wordArray.push({
			word,
			x: toPrecision(x, 1),
			y: toPrecision(y, 1),
			angle: angle === 0 ? undefined : angle,
			checked: checked === false ? undefined : checked,
		})
	}
	window.localStorage.setItem(key, JSON.stringify(wordArray))
}
