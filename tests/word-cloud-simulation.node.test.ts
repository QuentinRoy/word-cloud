import { Composite, Engine } from "matter-js"
import { beforeEach, describe, expect, it } from "vitest"
import { WordCloudSimulation } from "../lib/word-cloud-simulation.ts"

/**
 * WordCloudSimulation wires together SpacingModel, the frame/input-volume
 * bodies, and the drag-lock state. These tests build a real simulation and
 * step its engine directly (without starting the runner) to observe the
 * emergent physics, exactly as `Engine.update` does inside `Runner.run`.
 */

const WORD_WIDTH = 40
const WORD_HEIGHT = 20

function step(engine: Engine, times = 1) {
	for (let i = 0; i < times; i++) Engine.update(engine, 1000 / 60)
}

describe("WordCloudSimulation", () => {
	let sim: WordCloudSimulation

	beforeEach(() => {
		sim = new WordCloudSimulation()
		sim.setFrameSize({ width: 400, height: 300 })
	})

	it("adds a word body to the world and removes it", () => {
		const body = sim.addWord({
			x: 100,
			y: 100,
			width: WORD_WIDTH,
			height: WORD_HEIGHT,
		})
		expect(Composite.allBodies(sim.engine.world)).toContain(body)

		sim.removeWord(body.id)
		expect(Composite.allBodies(sim.engine.world)).not.toContain(body)
	})

	it("applies the initial velocity to a newly added word", () => {
		const body = sim.addWord({
			x: 100,
			y: 100,
			width: WORD_WIDTH,
			height: WORD_HEIGHT,
			velocity: { x: 10, y: -5 },
		})
		expect(body.velocity.x).toBeCloseTo(10, 5)
		expect(body.velocity.y).toBeCloseTo(-5, 5)
	})

	it("pushes two overlapping words apart", () => {
		const a = sim.addWord({
			x: 100,
			y: 100,
			width: WORD_WIDTH,
			height: WORD_HEIGHT,
		})
		const b = sim.addWord({
			x: 144,
			y: 100,
			width: WORD_WIDTH,
			height: WORD_HEIGHT,
		})
		const initialGap = b.position.x - a.position.x

		step(sim.engine, 60)

		expect(a.position.x).toBeLessThan(100)
		expect(b.position.x).toBeGreaterThan(144)
		expect(b.position.x - a.position.x).toBeGreaterThan(initialGap)
	})

	it("keeps a word inside the frame", () => {
		const body = sim.addWord({
			x: 10,
			y: 150,
			width: WORD_WIDTH,
			height: WORD_HEIGHT,
			velocity: { x: -100, y: 0 },
		})

		step(sim.engine, 120)

		expect(body.position.x).toBeGreaterThan(0)
	})

	it("rescales a word's body when its size changes", () => {
		const body = sim.addWord({
			x: 100,
			y: 100,
			width: WORD_WIDTH,
			height: WORD_HEIGHT,
		})
		const initialWidth = body.bounds.max.x - body.bounds.min.x

		sim.setWordSize(body.id, { width: WORD_WIDTH * 2, height: WORD_HEIGHT })

		const newWidth = body.bounds.max.x - body.bounds.min.x
		expect(newWidth).toBeCloseTo(initialWidth * 2, 1)
	})

	it("widens the repulsion reach when spacing increases", () => {
		// 15px body gap (centres 55 apart): default reach (5) sensors stop short.
		const a = sim.addWord({
			x: 100,
			y: 100,
			width: WORD_WIDTH,
			height: WORD_HEIGHT,
		})
		const b = sim.addWord({
			x: 155,
			y: 100,
			width: WORD_WIDTH,
			height: WORD_HEIGHT,
		})

		step(sim.engine, 30)
		expect(a.position.x).toBeCloseTo(100, 5)

		sim.setSpacing({ word: 20, edge: 5, input: 5 })
		step(sim.engine, 60)
		expect(a.position.x).toBeLessThan(100)
		expect(b.position.x).toBeGreaterThan(155)
	})

	describe("input volume", () => {
		it("adds and removes the input-volume body from the world", () => {
			sim.setInputVolume({ x: 200, y: 150, width: 50, height: 30 })
			expect(Composite.allBodies(sim.engine.world).length).toBeGreaterThan(4)

			const before = Composite.allBodies(sim.engine.world).length
			sim.setInputVolume(null)
			expect(Composite.allBodies(sim.engine.world).length).toBe(before - 1)
		})

		it("clears ignoreInputVolumeUntilExit on every word when disabled", () => {
			sim.setInputVolume({ x: 100, y: 100, width: 50, height: 50 })
			const body = sim.addWord({
				x: 100,
				y: 100,
				width: WORD_WIDTH,
				height: WORD_HEIGHT,
				ignoreInputVolumeUntilExit: true,
			})
			// While ignoring, the word does not collide with the input volume.
			const ignoredMask = body.collisionFilter.mask

			sim.setInputVolume(null)

			expect(body.collisionFilter.mask).not.toBe(ignoredMask)
		})

		it("clears ignoreInputVolumeUntilExit once the word leaves the input volume", () => {
			sim.setInputVolume({ x: 100, y: 100, width: 50, height: 50 })
			const body = sim.addWord({
				x: 100,
				y: 100,
				width: WORD_WIDTH,
				height: WORD_HEIGHT,
				ignoreInputVolumeUntilExit: true,
				velocity: { x: 200, y: 0 },
			})
			const ignoredMask = body.collisionFilter.mask

			step(sim.engine, 60)

			expect(body.position.x).toBeGreaterThan(100)
			expect(body.collisionFilter.mask).not.toBe(ignoredMask)
		})
	})

	describe("drag lock", () => {
		it("freezes rotational inertia and excludes the body from repulsion while locked", () => {
			const a = sim.addWord({
				x: 100,
				y: 100,
				width: WORD_WIDTH,
				height: WORD_HEIGHT,
			})
			const b = sim.addWord({
				x: 144,
				y: 100,
				width: WORD_WIDTH,
				height: WORD_HEIGHT,
			})

			sim.lockDrag(a.id)
			expect(a.inertia).toBe(Infinity)

			step(sim.engine, 60)
			// a is locked: it does not move, and b is not repelled by it either.
			expect(a.position.x).toBeCloseTo(100, 5)
			expect(b.position.x).toBeCloseTo(144, 5)

			sim.unlockDrag(a.id)
			expect(a.inertia).not.toBe(Infinity)
		})

		it("unlocks every locked word via unlockAllDrags", () => {
			const a = sim.addWord({
				x: 100,
				y: 100,
				width: WORD_WIDTH,
				height: WORD_HEIGHT,
			})
			const b = sim.addWord({
				x: 200,
				y: 100,
				width: WORD_WIDTH,
				height: WORD_HEIGHT,
			})
			sim.lockDrag(a.id)
			sim.lockDrag(b.id)

			sim.unlockAllDrags()

			expect(a.inertia).not.toBe(Infinity)
			expect(b.inertia).not.toBe(Infinity)
		})
	})

	it("stops without throwing when never started", () => {
		expect(() => sim.stop()).not.toThrow()
	})
})
