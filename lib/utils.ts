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

/**
 * Checks if a value is iterable (i.e., has a [Symbol.iterator] method).
 * @param value The value to check.
 * @returns True if the value is iterable, false otherwise.
 */
export function isIterable(value: unknown): value is Iterable<unknown> {
	return (
		typeof (value as { [Symbol.iterator]?: unknown })?.[Symbol.iterator] ===
		"function"
	)
}

/**
 * Returns a union of all keys of `T` that are required (non-optional).
 *
 * @template T - The object type to inspect.
 *
 * @example
 * type A = { a: string; b?: number; c: boolean | undefined };
 * type R = RequiredKeysOf<A>; // "a" | "c"
 */
export type RequiredKeysOf<T> = {
	[K in keyof T]-?: undefined extends T[K] ? never : K
}[keyof T]

/**
 * Constructs a type by making the specified keys of `T` optional,
 * leaving all other keys unchanged.
 *
 * @template T - The base object type.
 * @template Keys - The union of keys to make optional.
 *
 * @example
 * type A = { a: string; b: number; c: boolean };
 * type R = SetOptional<A, "b" | "c">; // { a: string; b?: number; c?: boolean }
 */
export type SetOptional<T, Keys extends keyof T> = {
	[K in Keys]?: T[K]
} & Omit<T, Keys>

/**
 * Constructs a type by making the specified keys of `T` required,
 * leaving all other keys unchanged.
 *
 * @template T - The base object type.
 * @template Keys - The union of keys to make required.
 *
 * @example
 * type A = { a?: string; b?: number; c?: boolean };
 * type R = SetRequired<A, "a" | "b">; // { a: string; b: number; c?: boolean }
 */
export type SetRequired<T, Keys extends keyof T> = {
	[K in Keys]-?: T[K]
} & Omit<T, Keys>
