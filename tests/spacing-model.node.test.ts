import { Bodies, Body, Composite, Engine, Events } from "matter-js"
import { beforeEach, describe, expect, it } from "vitest"
import {
	DEFAULT_WORD_COLLISION_MASK,
	FRAME_COLLISION_CATEGORY,
	FRAME_COLLISION_MASK,
	INPUT_VOLUME_COLLISION_CATEGORY,
	INPUT_VOLUME_COLLISION_MASK,
	WORD_COLLISION_CATEGORY,
} from "../lib/collision.ts"
import { SpacingModel } from "../lib/spacing-model.ts"

/**
 * SpacingModel only feeds repulsion through sensor overlaps reported by Matter's
 * broadphase, which is populated during Engine.update(). These tests build a
 * real engine, wire applyForces into beforeUpdate exactly as the element does,
 * and step it to observe the emergent separation.
 */

const WORD_WIDTH = 40
const WORD_HEIGHT = 20

function createEngine() {
	const engine = Engine.create()
	engine.gravity.y = 0
	engine.gravity.scale = 0
	// Disabled for deterministic separation: a word receiving repulsion never
	// sleeps, but neighbours that drift apart could, which would make the
	// position deltas under test depend on solver sleep timing.
	engine.enableSleeping = false
	return engine
}

function makeWordBody(
	x: number,
	y: number,
	{ width = WORD_WIDTH, height = WORD_HEIGHT } = {},
): Body {
	return Bodies.rectangle(x, y, width, height, {
		frictionAir: 0.04,
		restitution: 0.2,
		collisionFilter: {
			category: WORD_COLLISION_CATEGORY,
			mask: DEFAULT_WORD_COLLISION_MASK,
		},
	})
}

function step(engine: Engine, times = 1) {
	for (let i = 0; i < times; i++) Engine.update(engine, 1000 / 60)
}

describe("SpacingModel", () => {
	let engine: Engine
	let inputVolumeBody: Body
	let model: SpacingModel

	beforeEach(() => {
		engine = createEngine()
		// A standalone identity for the input-volume side; tests that exercise it
		// add it to the world themselves.
		inputVolumeBody = Bodies.rectangle(0, 0, 50, 50, {
			isStatic: true,
			collisionFilter: {
				category: INPUT_VOLUME_COLLISION_CATEGORY,
				mask: INPUT_VOLUME_COLLISION_MASK,
			},
		})
		model = new SpacingModel(engine, { inputVolumeBody })
		Events.on(engine, "beforeUpdate", () => model.applyForces())
	})

	/** Adds a word body to both the world and the model, mirroring the element. */
	function addWord(
		body: Body,
		{
			isRepellable = () => true,
			ignoresInputVolume = () => false,
			width = WORD_WIDTH,
			height = WORD_HEIGHT,
		}: {
			isRepellable?: () => boolean
			ignoresInputVolume?: () => boolean
			width?: number
			height?: number
		} = {},
	) {
		Composite.add(engine.world, body)
		model.addWord(body, { width, height, isRepellable, ignoresInputVolume })
	}

	it("pushes two nearby words apart along the line between them", () => {
		// 4px body gap (centres 44 apart, 40-wide bodies): no real collision, but
		// the default reach (5) inflates each sensor to 50 wide, so they overlap.
		const a = makeWordBody(100, 100)
		const b = makeWordBody(144, 100)
		addWord(a)
		addWord(b)
		const initialGap = b.position.x - a.position.x

		step(engine, 60)

		expect(a.position.x).toBeLessThan(100)
		expect(b.position.x).toBeGreaterThan(144)
		expect(b.position.x - a.position.x).toBeGreaterThan(initialGap)
		// A pure separating push leaves the perpendicular axis untouched.
		expect(a.position.y).toBeCloseTo(100, 1)
		expect(b.position.y).toBeCloseTo(100, 1)
	})

	it("leaves words beyond reach untouched until the reach grows", () => {
		// 15px body gap (centres 55 apart): the default-reach sensors (50 wide)
		// stop 5px short of each other, so no pair forms and nothing moves.
		const a = makeWordBody(100, 100)
		const b = makeWordBody(155, 100)
		addWord(a)
		addWord(b)

		step(engine, 30)
		expect(a.position.x).toBeCloseTo(100, 5)
		expect(b.position.x).toBeCloseTo(155, 5)

		// Widening the word spacing grows the reach to 20, inflating sensors to
		// 80 wide so the same pair now overlaps inside the margin and repels.
		model.setSpacing({ word: 20, edge: 5, input: 5 })
		step(engine, 60)
		expect(a.position.x).toBeLessThan(100)
		expect(b.position.x).toBeGreaterThan(155)
	})

	it("skips the pair when one word is not repellable", () => {
		const a = makeWordBody(100, 100)
		const b = makeWordBody(144, 100)
		addWord(a)
		// b is locked (dragged): the whole pair is skipped, so neither word moves.
		addWord(b, { isRepellable: () => false })

		step(engine, 60)

		expect(a.position.x).toBeCloseTo(100, 5)
		expect(b.position.x).toBeCloseTo(144, 5)
	})

	it("stops repelling a word once it is removed", () => {
		const a = makeWordBody(100, 100)
		const b = makeWordBody(144, 100)
		addWord(a)
		addWord(b)

		model.removeWord(b.id)
		Composite.remove(engine.world, b)

		step(engine, 60)
		expect(a.position.x).toBeCloseTo(100, 5)
	})

	it("uses the edge spacing to push a word away from a static frame", () => {
		const word = makeWordBody(100, 100)
		addWord(word)
		// A static wall just past the word's right edge (1px gap), within edge reach.
		const wall = Bodies.rectangle(126, 100, 10, 200, {
			isStatic: true,
			collisionFilter: {
				category: FRAME_COLLISION_CATEGORY,
				mask: FRAME_COLLISION_MASK,
			},
		})
		Composite.add(engine.world, wall)

		step(engine, 60)

		// The word is pushed left; the static wall does not move.
		expect(word.position.x).toBeLessThan(100)
		expect(wall.position.x).toBeCloseTo(126, 5)
	})

	it("gates input-volume repulsion on the ignoresInputVolume accessor", () => {
		let ignoring = true
		const word = makeWordBody(100, 100)
		// Input volume centred just past the word's right edge, within reach.
		Body.setPosition(inputVolumeBody, { x: 126, y: 100 })
		Body.setStatic(inputVolumeBody, true)
		// Resize so its left edge (≈121) overlaps the word's sensor.
		Body.scale(inputVolumeBody, 10 / 50, 200 / 50)
		Composite.add(engine.world, inputVolumeBody)
		addWord(word, {
			ignoresInputVolume: () => ignoring,
			// Spawned overlapping the input volume: ignore the body collision too.
			isRepellable: () => true,
		})
		word.collisionFilter.mask =
			DEFAULT_WORD_COLLISION_MASK & ~INPUT_VOLUME_COLLISION_CATEGORY

		step(engine, 30)
		// While ignoring, the input side of the pair is skipped: no push.
		expect(word.position.x).toBeCloseTo(100, 5)

		// Once the grace period ends, the input volume repels the word.
		ignoring = false
		word.collisionFilter.mask = DEFAULT_WORD_COLLISION_MASK
		step(engine, 60)
		expect(word.position.x).toBeLessThan(100)
	})

	it("rescales an existing word's sensor when its size changes", () => {
		// Start beyond reach so no pair forms (20px gap, 50-wide sensors).
		const a = makeWordBody(100, 100)
		const b = makeWordBody(160, 100)
		addWord(a)
		addWord(b)
		step(engine, 20)
		expect(a.position.x).toBeCloseTo(100, 5)

		// Grow both bodies to 56 wide and tell the model: the 66-wide sensors now
		// overlap (centres 60 apart) while the 56-wide bodies stay 4px apart, so
		// the pair forms from sensor overlap alone and repels.
		Body.scale(a, 56 / WORD_WIDTH, 1)
		Body.scale(b, 56 / WORD_WIDTH, 1)
		model.setWordSize(a.id, { width: 56, height: WORD_HEIGHT })
		model.setWordSize(b.id, { width: 56, height: WORD_HEIGHT })

		step(engine, 60)
		expect(a.position.x).toBeLessThan(100)
		expect(b.position.x).toBeGreaterThan(160)
	})

	it("stops tracking overlaps once disposed", () => {
		// Detach collision tracking up front: even though the words' sensors
		// overlap, no pair is ever recorded, so applyForces has nothing to act on.
		model.dispose()
		const a = makeWordBody(100, 100)
		const b = makeWordBody(144, 100)
		addWord(a)
		addWord(b)

		step(engine, 60)

		expect(a.position.x).toBeCloseTo(100, 5)
		expect(b.position.x).toBeCloseTo(144, 5)
	})
})
