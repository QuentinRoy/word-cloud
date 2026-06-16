import { Composite, Engine } from "matter-js"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { normalizeAngle } from "../lib/utils.ts"
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

	it("applies the initial angle to a newly added word", () => {
		const body = sim.addWord({
			x: 100,
			y: 100,
			width: WORD_WIDTH,
			height: WORD_HEIGHT,
			angle: Math.PI / 4,
		})
		expect(body.angle).toBeCloseTo(Math.PI / 4, 5)
	})

	it("ignores removeWord for an unknown id", () => {
		expect(() => sim.removeWord(123456)).not.toThrow()
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

	it("never sleeps a word while it is still tilted, and aligns it", () => {
		const body = sim.addWord({
			x: 200,
			y: 150,
			width: WORD_WIDTH,
			height: WORD_HEIGHT,
			angle: 0.3,
		})

		// Long enough that an ungated body would have slept mid-rotation: Matter
		// sleeps after ~60 low-motion frames, and a lone narrow word rotates back
		// slowly enough to dip under the motion threshold while still tilted.
		for (let i = 0; i < 600; i++) {
			Engine.update(sim.engine, 1000 / 60)
			// Invariant: a sleeping word is always aligned. 0.01 comfortably
			// exceeds the simulation's rest epsilon (0.001) while still being far
			// below the 0.3 starting tilt, so a body frozen mid-rotation would trip
			// this.
			if (body.isSleeping) {
				expect(Math.abs(normalizeAngle(body.angle))).toBeLessThan(0.01)
			}
		}

		// It actually reaches horizontal rather than stalling part-way.
		expect(Math.abs(normalizeAngle(body.angle))).toBeLessThan(0.01)
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

	it("uses the edge spacing to push a word away from the frame", () => {
		// Frame is 400 wide, so the right wall's inner edge sits at x=400. Place a
		// 40-wide word with its right edge at 396 — a 4px gap, no hard collision —
		// and widen the edge reach so the word's sensor overlaps the wall and is
		// pushed back inward.
		const word = sim.addWord({
			x: 376,
			y: 150,
			width: WORD_WIDTH,
			height: WORD_HEIGHT,
		})
		sim.setSpacing({ word: 5, edge: 25, input: 5 })

		step(sim.engine, 60)

		expect(word.position.x).toBeLessThan(376)
		expect(word.position.y).toBeCloseTo(150, 0)
	})

	describe("input volume", () => {
		it("adds and removes the input-volume body from the world", () => {
			sim.setInputVolume({ x: 200, y: 150, width: 50, height: 30 })
			expect(Composite.allBodies(sim.engine.world).length).toBeGreaterThan(4)

			const before = Composite.allBodies(sim.engine.world).length
			sim.setInputVolume(null)
			expect(Composite.allBodies(sim.engine.world).length).toBe(before - 1)
		})

		it("uses the input spacing to repel a non-ignoring word", () => {
			// Input volume is 50 wide at x=200, so its right edge sits at 225. Place
			// a word to its right with a 10px gap (left edge at 235) and widen the
			// input reach so only that margin overlaps the sensor.
			sim.setInputVolume({ x: 200, y: 150, width: 50, height: 60 })
			const word = sim.addWord({
				x: 255,
				y: 150,
				width: WORD_WIDTH,
				height: WORD_HEIGHT,
			})
			sim.setSpacing({ word: 5, edge: 5, input: 20 })

			step(sim.engine, 60)

			// Pushed away from the input volume (to the right).
			expect(word.position.x).toBeGreaterThan(255)
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

		it("keeps the body frozen across a resize while locked", () => {
			const body = sim.addWord({
				x: 100,
				y: 100,
				width: WORD_WIDTH,
				height: WORD_HEIGHT,
			})
			const initialInertia = body.inertia

			sim.lockDrag(body.id)
			// Resizing restores the inertia so Body.scale can recompute it, then
			// re-freezes — the word must still be pinned afterward.
			sim.setWordSize(body.id, { width: WORD_WIDTH * 2, height: WORD_HEIGHT })
			expect(body.inertia).toBe(Infinity)

			// Unlocking restores the inertia recomputed at the *new* size, not the
			// original — so it differs from the pre-resize value.
			sim.unlockDrag(body.id)
			expect(body.inertia).not.toBe(Infinity)
			expect(body.inertia).not.toBeCloseTo(initialInertia, 5)
		})

		it("does not lose the saved inertia when locked twice", () => {
			const body = sim.addWord({
				x: 100,
				y: 100,
				width: WORD_WIDTH,
				height: WORD_HEIGHT,
			})
			const initialInertia = body.inertia

			sim.lockDrag(body.id)
			// A second lock must be a no-op: capturing the now-frozen inertia would
			// leave the word permanently pinned after unlock.
			sim.lockDrag(body.id)
			sim.unlockDrag(body.id)

			expect(body.inertia).toBeCloseTo(initialInertia, 5)
		})

		it("unlocks a drag-locked word when it is removed", () => {
			const body = sim.addWord({
				x: 100,
				y: 100,
				width: WORD_WIDTH,
				height: WORD_HEIGHT,
			})
			const initialInertia = body.inertia

			sim.lockDrag(body.id)
			expect(body.inertia).toBe(Infinity)
			// removeWord unlocks first, restoring the body's real inertia before it
			// leaves the world.
			sim.removeWord(body.id)
			expect(body.inertia).toBeCloseTo(initialInertia, 5)
		})
	})

	describe("kinematic drag", () => {
		it("grabWord freezes rotation and zeroes linear velocity", () => {
			const body = sim.addWord({
				x: 100,
				y: 100,
				width: WORD_WIDTH,
				height: WORD_HEIGHT,
				velocity: { x: 5, y: -3 },
			})

			sim.grabWord(body.id)

			expect(body.inertia).toBe(Infinity)
			expect(body.velocity.x).toBeCloseTo(0, 5)
			expect(body.velocity.y).toBeCloseTo(0, 5)
		})

		it("grabWord wakes a sleeping body", () => {
			const body = sim.addWord({
				x: 100,
				y: 100,
				width: WORD_WIDTH,
				height: WORD_HEIGHT,
			})
			step(sim.engine, 300)
			expect(body.isSleeping).toBe(true)

			sim.grabWord(body.id)

			expect(body.isSleeping).toBe(false)
		})

		it("moveWord pins position without adding velocity", () => {
			const body = sim.addWord({
				x: 100,
				y: 100,
				width: WORD_WIDTH,
				height: WORD_HEIGHT,
			})
			sim.grabWord(body.id)

			sim.moveWord(body.id, { x: 200, y: 250 })

			expect(body.position.x).toBeCloseTo(200, 5)
			expect(body.position.y).toBeCloseTo(250, 5)
			expect(body.velocity.x).toBeCloseTo(0, 5)
			expect(body.velocity.y).toBeCloseTo(0, 5)
		})

		it("releaseWord applies throw velocity (× 1000/60) while running", () => {
			// start() drives Matter's rAF-based Runner; node lacks
			// window.requestAnimationFrame. A no-op stub flips #isRunning without
			// advancing frames (onFrame's first call has no time, so no tick).
			vi.stubGlobal("window", {
				requestAnimationFrame: () => 0,
				cancelAnimationFrame: () => {},
			})
			try {
				sim.start()
				const body = sim.addWord({
					x: 100,
					y: 100,
					width: WORD_WIDTH,
					height: WORD_HEIGHT,
				})
				sim.grabWord(body.id)

				sim.releaseWord(body.id, { x: 1, y: -2 })
				sim.stop()

				expect(body.inertia).not.toBe(Infinity)
				expect(body.velocity.x).toBeCloseTo(1000 / 60, 5)
				expect(body.velocity.y).toBeCloseTo(-2 * (1000 / 60), 5)
			} finally {
				vi.unstubAllGlobals()
			}
		})

		it("releaseWord zeroes velocity while stopped", () => {
			const body = sim.addWord({
				x: 100,
				y: 100,
				width: WORD_WIDTH,
				height: WORD_HEIGHT,
				velocity: { x: 5, y: 5 },
			})
			sim.grabWord(body.id)

			sim.releaseWord(body.id, { x: 3, y: 4 })

			expect(body.inertia).not.toBe(Infinity)
			expect(body.velocity.x).toBeCloseTo(0, 5)
			expect(body.velocity.y).toBeCloseTo(0, 5)
		})
	})

	it("stops without throwing when never started", () => {
		expect(() => sim.stop()).not.toThrow()
	})
})
