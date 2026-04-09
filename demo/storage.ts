import { type } from "arktype"
import { toPrecision } from "../lib/utils"

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
	let wordArray = Array.from(words, ({ word, x, y, angle, checked }) => {
		return {
			word,
			x: toPrecision(x, 1),
			y: toPrecision(y, 1),
			angle: angle == null || angle === 0 ? undefined : toPrecision(angle, 4),
			checked: checked == null || checked === false ? undefined : checked,
		}
	})
	window.localStorage.setItem(key, JSON.stringify(wordArray))
}
