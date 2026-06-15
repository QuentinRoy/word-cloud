import { describe, expect, it } from "vitest"
import {
	DEFAULT_WORD_COLLISION_MASK,
	INPUT_VOLUME_COLLISION_CATEGORY,
	wordCollisionMask,
} from "../lib/collision.ts"

/**
 * wordCollisionMask is the single rule deciding what a word resolves against.
 * The two state machines that feed it (drag-lock, input grace) are independent,
 * so the contract is just this four-row truth table — with drag-lock winning.
 */
describe("wordCollisionMask", () => {
	it("collides with nothing while drag-locked", () => {
		expect(wordCollisionMask({ dragLocked: true, ignoresInput: false })).toBe(0)
	})

	it("drag-lock wins over input grace", () => {
		expect(wordCollisionMask({ dragLocked: true, ignoresInput: true })).toBe(0)
	})

	it("uses the full default mask when free", () => {
		expect(wordCollisionMask({ dragLocked: false, ignoresInput: false })).toBe(
			DEFAULT_WORD_COLLISION_MASK,
		)
	})

	it("drops only the input-volume category while in input grace", () => {
		const mask = wordCollisionMask({ dragLocked: false, ignoresInput: true })
		expect(mask).toBe(
			DEFAULT_WORD_COLLISION_MASK & ~INPUT_VOLUME_COLLISION_CATEGORY,
		)
		// The dropped bit is exactly the input volume — nothing else changes.
		expect(mask & INPUT_VOLUME_COLLISION_CATEGORY).toBe(0)
		expect(DEFAULT_WORD_COLLISION_MASK ^ mask).toBe(
			INPUT_VOLUME_COLLISION_CATEGORY,
		)
	})
})
