import { afterEach, describe, expect, it, vi } from "vitest"
import {
	generateRandomId,
	isIterable,
	normalizeAngle,
	queryStrict,
	toPrecision,
} from "../lib/utils.ts"

describe("queryStrict", () => {
	it("returns the matching element when it is the expected type", () => {
		const root = document.createElement("div")
		const button = document.createElement("button")
		button.className = "action"
		root.appendChild(button)

		const result = queryStrict(root, ".action", HTMLButtonElement)

		expect(result).toBe(button)
	})

	it("throws when the selector does not match anything", () => {
		const root = document.createElement("div")

		expect(() => queryStrict(root, ".missing", HTMLButtonElement)).toThrow(
			"Expected .missing to be an instance of HTMLButtonElement",
		)
	})

	it("throws when the matched element has the wrong type", () => {
		const root = document.createElement("div")
		const span = document.createElement("span")
		span.className = "item"
		root.appendChild(span)

		expect(() => queryStrict(root, ".item", HTMLButtonElement)).toThrow(
			"Expected .item to be an instance of HTMLButtonElement",
		)
	})
})

describe("toPrecision", () => {
	it("rounds to the requested decimal precision", () => {
		expect(toPrecision(1.234, 2)).toBe(1.23)
		expect(toPrecision(1.235, 2)).toBe(1.24)
		expect(toPrecision(-1.235, 2)).toBe(-1.24)
	})

	it("floors a non-integer precision before rounding", () => {
		expect(toPrecision(1.239, 2.9)).toBe(1.24)
	})
})

describe("generateRandomId", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("combines base36 timestamp and random suffix", () => {
		vi.spyOn(Date, "now").mockReturnValue(123456)
		vi.spyOn(Math, "random").mockReturnValue(0.5)

		expect(generateRandomId()).toBe("2n9ci")
	})
})

describe("normalizeAngle", () => {
	it("keeps angles in the [-pi, pi] range", () => {
		expect(normalizeAngle(0)).toBe(0)
		expect(normalizeAngle(3 * Math.PI)).toBe(Math.PI)
		expect(normalizeAngle(-3 * Math.PI)).toBe(-Math.PI)
		expect(normalizeAngle((5 * Math.PI) / 2)).toBe(Math.PI / 2)
		expect(normalizeAngle((-5 * Math.PI) / 2)).toBe(-Math.PI / 2)
	})
})

describe("isIterable", () => {
	it("returns true for arrays", () => {
		expect(isIterable([])).toBe(true)
		expect(isIterable([1, 2, 3])).toBe(true)
	})

	it("returns true for strings", () => {
		expect(isIterable("hello")).toBe(true)
	})

	it("returns true for Sets and Maps", () => {
		expect(isIterable(new Set([1, 2]))).toBe(true)
		expect(isIterable(new Map())).toBe(true)
	})

	it("returns true for generator objects", () => {
		function* gen() {
			yield 1
		}
		expect(isIterable(gen())).toBe(true)
	})

	it("returns true for objects with a [Symbol.iterator] method", () => {
		const obj = { [Symbol.iterator]: () => [][Symbol.iterator]() }
		expect(isIterable(obj)).toBe(true)
	})

	it("returns false for plain objects without [Symbol.iterator]", () => {
		expect(isIterable({})).toBe(false)
		expect(isIterable({ a: 1 })).toBe(false)
	})

	it("returns false for numbers and booleans", () => {
		expect(isIterable(42)).toBe(false)
		expect(isIterable(true)).toBe(false)
	})

	it("returns false for null", () => {
		expect(isIterable(null)).toBe(false)
	})

	it("returns false for undefined", () => {
		expect(isIterable(undefined)).toBe(false)
	})
})
