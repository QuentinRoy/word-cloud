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
	throw new Error(`Expected ${selector} to be an instance of ${type.name}`)
}

/**
 * Rounds a number to a given number of digits after the decimal point.
 * @param value The number to round.
 * @param precision The number of digits after the decimal point to round to.
 * @returns The rounded number.
 */
export function toPrecision(value: number, precision: number): number {
	const factor = 10 ** Math.floor(precision)
	return Math.round(value * factor) / factor
}

export function generateRandomId() {
	return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

/**
 * Normalizes an angle in radians to the range [-π, π].
 *
 * @param angle An angle in radians.
 * @returns The normalized angle in radians within the range [-π, π].
 */
export function normalizeAngle(angle: number) {
	angle = angle % (2 * Math.PI)
	if (angle < -Math.PI) {
		angle += 2 * Math.PI
	} else if (angle > Math.PI) {
		angle -= 2 * Math.PI
	}
	return angle
}
