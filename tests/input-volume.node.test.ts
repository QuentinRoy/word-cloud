import { Bodies, Body, Engine } from "matter-js"
import { beforeEach, describe, expect, it } from "vitest"
import { InputVolume } from "../lib/input-volume.ts"

/**
 * InputVolume owns the input-volume body and the input-grace state machine. It
 * runs against a real engine here: grace is tracked per word body and released
 * from the body's real bounds, exactly as the simulation drives it each tick.
 */

function wordBody(x: number, y: number): Body {
	return Bodies.rectangle(x, y, 40, 20)
}

describe("InputVolume", () => {
	let engine: Engine
	let inputVolume: InputVolume

	beforeEach(() => {
		engine = Engine.create()
		inputVolume = new InputVolume(engine)
	})

	it("is disabled until a rect is set, and again once cleared", () => {
		expect(inputVolume.enabled).toBe(false)
		inputVolume.setRect({ x: 100, y: 100, width: 50, height: 30 })
		expect(inputVolume.enabled).toBe(true)
		inputVolume.setRect(null)
		expect(inputVolume.enabled).toBe(false)
	})

	it("tracks input grace from beginGrace", () => {
		const body = wordBody(100, 100)
		expect(inputVolume.ignores(body.id)).toBe(false)
		inputVolume.beginGrace(body)
		expect(inputVolume.ignores(body.id)).toBe(true)
	})

	it("releases grace once the word leaves the volume, returning its id", () => {
		inputVolume.setRect({ x: 100, y: 100, width: 50, height: 50 })
		const body = wordBody(100, 100) // overlapping the volume
		inputVolume.beginGrace(body)

		// Still overlapping: nothing released.
		expect(inputVolume.releaseExitedWords()).toEqual([])
		expect(inputVolume.ignores(body.id)).toBe(true)

		// Move it clear of the volume: released, and reported once.
		Body.setPosition(body, { x: 300, y: 300 })
		expect(inputVolume.releaseExitedWords()).toEqual([body.id])
		expect(inputVolume.ignores(body.id)).toBe(false)
		expect(inputVolume.releaseExitedWords()).toEqual([])
	})

	it("does not release grace while the volume is disabled", () => {
		const body = wordBody(300, 300) // nowhere near a (disabled) volume
		inputVolume.beginGrace(body)
		expect(inputVolume.releaseExitedWords()).toEqual([])
		expect(inputVolume.ignores(body.id)).toBe(true)
	})

	it("clears all grace when disabled, returning the freed ids", () => {
		inputVolume.setRect({ x: 100, y: 100, width: 50, height: 50 })
		const a = wordBody(100, 100)
		const b = wordBody(110, 110)
		inputVolume.beginGrace(a)
		inputVolume.beginGrace(b)

		const freed = inputVolume.setRect(null)
		expect([...freed].sort()).toEqual([a.id, b.id].sort())
		expect(inputVolume.ignores(a.id)).toBe(false)
		expect(inputVolume.ignores(b.id)).toBe(false)
	})

	it("returns no freed ids when disabling an already-disabled volume", () => {
		expect(inputVolume.setRect(null)).toEqual([])
	})

	it("forgets a word's grace", () => {
		const body = wordBody(100, 100)
		inputVolume.beginGrace(body)
		inputVolume.forget(body.id)
		expect(inputVolume.ignores(body.id)).toBe(false)
	})
})
