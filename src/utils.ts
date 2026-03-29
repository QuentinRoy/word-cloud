/**
 * Queries the DOM for an element matching the specified selector and checks if it is of the expected type.
 * @param root The root element to query within. Must have a querySelector method.
 * @param selector The CSS selector to match the desired element.
 * @param type The expected constructor/type of the element.
 * @returns The found element.
 * @throws An error if the element is not found or is not of the expected type.
 */
export function queryStrict<T extends HTMLElement>(
	root: { querySelector: (selector: string) => unknown },
	selector: string,
	type: new () => T,
): T {
	let element = root.querySelector(selector)
	if (element instanceof type) {
		return element
	}
	throw new Error(
		`Expected ${selector} to be a instance of ${type.constructor.name}`,
	)
}

/**
 * Creates a unique ID generator function that generates IDs.
 * @returns A function that, when called, returns a unique ID of type number.
 */
export function createIterativeIdGenerator(): () => number
/**
 * Creates a unique ID generator function that generates IDs based on a provided mapping function.
 * @param map A function that takes a number and returns a value of type T.
 * This function is used to generate the ID based on the current count.
 * @returns A function that, when called, returns a unique ID of type T.
 */
export function createIterativeIdGenerator<T>(map: (x: number) => T): () => T
export function createIterativeIdGenerator(map?: (x: number) => unknown) {
	let last = 0
	return () => {
		let current = last + 1
		last = current
		return map ? map(current) : current
	}
}

/**
 * Rounds a number to a given number of digits after the decimal point.
 * @param value The number to round.
 * @param precision The number of digits after the decimal point to round to.
 * @returns The rounded number.
 */
export function toPrecision(value: number, precision: number): number {
	let f = 10 ** Math.floor(precision)
	return Math.round(value * f) / f
}

export function generateRandomId() {
	return Date.now().toString(36) + Math.random().toString(36).substring(2)
}
