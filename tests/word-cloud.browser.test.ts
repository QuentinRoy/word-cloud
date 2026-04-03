import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { commands, page, userEvent } from "vitest/browser"
import {
	HTMLWordCloudElement,
	WordAddEvent,
	WordCheckedChangeEvent,
	WordDeleteEvent,
} from "../src/index.ts"

declare module "vitest/browser" {
	interface BrowserCommands {
		resetMouse: () => Promise<void>
	}
}

const TEST_TAG_NAME = "x-word-cloud-test"
const originalAttachShadow = HTMLElement.prototype.attachShadow

function nextFrame() {
	return new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve())
	})
}

async function flushFrames(count = 2) {
	for (let i = 0; i < count; i += 1) {
		await nextFrame()
	}
}

beforeAll(() => {
	// Test-only visibility: keep runtime behavior intact while enabling deep
	// user interaction tests against controls inside the component.
	HTMLElement.prototype.attachShadow = function (
		init: ShadowRootInit,
	): ShadowRoot {
		return originalAttachShadow.call(this, { ...init, mode: "open" })
	}
})

afterAll(() => {
	HTMLElement.prototype.attachShadow = originalAttachShadow
})

function registerCloudTag() {
	if (customElements.get(TEST_TAG_NAME) == null) {
		customElements.define(TEST_TAG_NAME, HTMLWordCloudElement)
	}
	return TEST_TAG_NAME
}

async function createCloudElement() {
	const tagName = registerCloudTag()
	const element = document.createElement(tagName) as HTMLWordCloudElement
	element.style.display = "block"
	element.style.width = "900px"
	element.style.height = "600px"
	element.wordRepulsion = 0
	element.edgeRepulsion = 0
	element.inputRepulsion = 0
	// Force all transitions and animations to 0s so tests don't depend on
	// real-time waiting for CSS animations inherited from the word-cloud element.
	element.style.setProperty("--slow-animation", "0s")
	element.style.setProperty("--extra-slow-animation", "0s")
	document.body.appendChild(element)
	await flushFrames(3)
	return { tagName, element }
}

function getCloudShadow(element: HTMLWordCloudElement) {
	const shadowRoot = element.shadowRoot
	if (shadowRoot == null) {
		throw new Error("Expected word cloud shadow root in browser tests")
	}
	return shadowRoot
}

function getCloudInput(element: HTMLWordCloudElement) {
	const input = getCloudShadow(element).querySelector("input")
	if (!(input instanceof HTMLInputElement)) {
		throw new Error("Expected input in word cloud")
	}
	return input
}

function getFirstWordElement(element: HTMLWordCloudElement) {
	const word = getCloudShadow(element).querySelector(".word")
	if (!(word instanceof HTMLElement)) {
		throw new Error("Expected at least one rendered word")
	}
	return word
}

function getWordLabel(wordElement: HTMLElement) {
	const shadowRoot = wordElement.shadowRoot
	if (shadowRoot == null) {
		throw new Error("Expected word shadow root")
	}
	const label = shadowRoot.querySelector("label")
	if (!(label instanceof HTMLLabelElement)) {
		throw new Error("Expected word label")
	}
	return label
}

function getAllWordElements(element: HTMLWordCloudElement) {
	return Array.from(
		getCloudShadow(element).querySelectorAll(".word"),
	) as HTMLElement[]
}

afterEach(async () => {
	document.body.innerHTML = ""
	// Reset the real cursor so CSS :hover doesn't bleed into the next test.
	// CSS :hover tracks the actual pointer position, not synthetic DOM events.
	await commands.resetMouse()
})

describe("HTMLWordCloudElement user interactions", () => {
	it("adds a word from the built-in input when user types + Enter", async () => {
		const { element } = await createCloudElement()
		element.hasInput = true
		await flushFrames(2)

		const addedWords: string[] = []
		element.addEventListener(WordAddEvent.type, (event) => {
			addedWords.push((event as WordAddEvent).handle.word)
		})

		const input = getCloudInput(element)
		await userEvent.click(input)
		await userEvent.type(input, "  Hello Browser  ")
		await userEvent.keyboard("{Enter}")
		await flushFrames(3)

		expect(addedWords).toEqual(["Hello Browser"])
		expect(Array.from(element.getWords()).map((word) => word.word)).toEqual([
			"Hello Browser",
		])
		expect(input.value).toBe("")
	})

	it("checks a word when user clicks it in check mode", async () => {
		const { element } = await createCloudElement()
		element.setAttribute("word-action", "check")
		await flushFrames(2)
		const handle = element.addWord({
			word: "Check me",
			x: 220,
			y: 160,
			checked: false,
			entryAnimation: "none",
		})
		await flushFrames(3)

		const checkEvents: boolean[] = []
		element.addEventListener(WordCheckedChangeEvent.type, (event) => {
			checkEvents.push((event as WordCheckedChangeEvent).checked)
		})

		const wordElement = getFirstWordElement(element)
		const label = getWordLabel(wordElement)
		label.click()
		await flushFrames(2)

		expect(handle.checked).toBe(true)
		expect(checkEvents).toEqual([true])
	})

	it("deletes a word when user clicks it in delete mode", async () => {
		const { element } = await createCloudElement()
		element.setAttribute("word-action", "delete")
		await flushFrames(2)
		element.addWord({
			word: "Delete me",
			x: 240,
			y: 200,
			entryAnimation: "none",
		})
		await flushFrames(2)

		const deletedWords: string[] = []
		element.addEventListener(WordDeleteEvent.type, (event) => {
			deletedWords.push((event as WordDeleteEvent).handle.word)
		})

		const wordElement = getFirstWordElement(element)
		const label = getWordLabel(wordElement)
		label.click()
		await flushFrames(4)

		expect(deletedWords).toEqual(["Delete me"])
		expect(Array.from(element.getWords())).toHaveLength(0)
		expect(getAllWordElements(element)).toHaveLength(0)
	})

	it("does not check or delete when clicking a word in none mode", async () => {
		const { element } = await createCloudElement()
		// word-action defaults to "none" — clicks should be inert
		const handle = element.addWord({
			word: "No action",
			x: 220,
			y: 160,
			checked: false,
			entryAnimation: "none",
		})
		await flushFrames(3)

		const checkEvents: boolean[] = []
		const deletedWords: string[] = []
		element.addEventListener(WordCheckedChangeEvent.type, (event) => {
			checkEvents.push((event as WordCheckedChangeEvent).checked)
		})
		element.addEventListener(WordDeleteEvent.type, (event) => {
			deletedWords.push((event as WordDeleteEvent).handle.word)
		})

		const wordElement = getFirstWordElement(element)
		const label = getWordLabel(wordElement)
		label.click()
		await flushFrames(2)

		expect(handle.checked).toBe(false)
		expect(checkEvents).toHaveLength(0)
		expect(deletedWords).toHaveLength(0)
		expect(getAllWordElements(element)).toHaveLength(1)
	})

	it("does not check or delete when clicking a word in drag mode", async () => {
		const { element } = await createCloudElement()
		element.setAttribute("word-action", "drag")
		await flushFrames(2)
		const handle = element.addWord({
			word: "Drag mode",
			x: 220,
			y: 160,
			checked: false,
			entryAnimation: "none",
		})
		await flushFrames(3)

		const checkEvents: boolean[] = []
		const deletedWords: string[] = []
		element.addEventListener(WordCheckedChangeEvent.type, (event) => {
			checkEvents.push((event as WordCheckedChangeEvent).checked)
		})
		element.addEventListener(WordDeleteEvent.type, (event) => {
			deletedWords.push((event as WordDeleteEvent).handle.word)
		})

		const wordElement = getFirstWordElement(element)
		const label = getWordLabel(wordElement)
		label.click()
		await flushFrames(2)

		expect(handle.checked).toBe(false)
		expect(checkEvents).toHaveLength(0)
		expect(deletedWords).toHaveLength(0)
		expect(getAllWordElements(element)).toHaveLength(1)
	})

	it("visual regression: word appearance in none mode", async () => {
		const { element } = await createCloudElement()
		// word-action defaults to "none"
		element.addWord({ word: "Word", x: 220, y: 220, entryAnimation: "none" })
		await flushFrames(3)

		const wordElement = getFirstWordElement(element)
		const locator = page.elementLocator(wordElement)

		await expect.element(locator).toMatchScreenshot("word-none-idle.png")
		await userEvent.hover(wordElement)
		await flushFrames(1)
		// Hover has no visual effect in none mode
		await expect.element(locator).toMatchScreenshot("word-none-hover.png")
	})

	it("visual regression: word appearance in check mode", async () => {
		const { element } = await createCloudElement()
		element.setAttribute("word-action", "check")
		await flushFrames(2)
		element.addWord({ word: "Word", x: 220, y: 220, entryAnimation: "none" })
		await flushFrames(3)

		const wordElement = getFirstWordElement(element)
		const locator = page.elementLocator(wordElement)
		const label = getWordLabel(wordElement)

		await expect.element(locator).toMatchScreenshot("word-check-idle.png")
		await userEvent.hover(wordElement)
		await flushFrames(1)
		// Hover shows checked-hover color in check mode
		await expect.element(locator).toMatchScreenshot("word-check-hover.png")
		label.click()
		await flushFrames(2)
		await expect.element(locator).toMatchScreenshot("word-check-checked.png")
	})

	it("visual regression: word appearance in delete mode", async () => {
		const { element } = await createCloudElement()
		element.setAttribute("word-action", "delete")
		await flushFrames(2)
		element.addWord({ word: "Word", x: 220, y: 220, entryAnimation: "none" })
		await flushFrames(3)

		const wordElement = getFirstWordElement(element)
		const locator = page.elementLocator(wordElement)

		await expect.element(locator).toMatchScreenshot("word-delete-idle.png")
		await userEvent.hover(wordElement)
		await flushFrames(1)
		// Hover shows delete-hover colors (distinct from check mode)
		await expect.element(locator).toMatchScreenshot("word-delete-hover.png")
	})

	it("visual regression: word appearance in drag mode", async () => {
		const { element } = await createCloudElement()
		element.setAttribute("word-action", "drag")
		await flushFrames(2)
		element.addWord({ word: "Word", x: 220, y: 220, entryAnimation: "none" })
		await flushFrames(3)

		const wordElement = getFirstWordElement(element)
		const locator = page.elementLocator(wordElement)

		await expect.element(locator).toMatchScreenshot("word-drag-idle.png")
		await userEvent.hover(wordElement)
		await flushFrames(1)
		// Drag mode has no special hover styling — same as none mode
		await expect.element(locator).toMatchScreenshot("word-drag-hover.png")
	})
})
