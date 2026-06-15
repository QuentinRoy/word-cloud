import {
	Bodies,
	Body,
	Composite,
	type Engine,
	Events,
	type IEventCollision,
	type Pair,
} from "matter-js"
import {
	SENSOR_COLLISION_CATEGORY,
	SENSOR_COLLISION_MASK,
} from "./collision.ts"
import { getRepulsionStrength } from "./physics-utils.ts"

/** The default spacing margin, in pixels, for every spacing channel. */
export const REPULSION_MARGIN = 5
/** The maximum repulsion force magnitude, scaled by the proximity strength. */
const REPULSION_FORCE = 0.0003

interface Size {
	width: number
	height: number
}

/**
 * Options describing a word as it enters the spacing model. The two flags are
 * passed as accessors so the model reads live word state (drag-lock,
 * input-volume grace) without reaching into the owning unit's internals.
 */
interface AddWordOptions {
	width: number
	height: number
	/** Whether the word currently pushes and is pushed (false while dragged/static). */
	isRepellable: () => boolean
	/** Whether the word still ignores the input volume (freshly-spawned grace period). */
	ignoresInputVolume: () => boolean
}

interface SpacingEntry {
	body: Body
	bodySize: Size
	/**
	 * An oversized, non-resolving body that tracks {@link body}. Its overlaps,
	 * reported by Matter's broadphase, drive the short-range repulsion forces.
	 */
	sensorBody: Body
	sensorSize: Size
	isRepellable: () => boolean
	ignoresInputVolume: () => boolean
}

/**
 * Owns the short-range soft repulsion that keeps words spaced from each other,
 * the frame, and the input volume.
 *
 * Each word carries an oversized sensor body added to the world here; Matter's
 * broadphase reports the sensor overlaps (without resolving them) via
 * {@link #sensorPairs}. For each overlap {@link applyForces} recovers the true
 * gap from the SAT penetration depth, feeds it to a soft-strength curve, and
 * pushes the words apart along the collision normal.
 *
 * The model is DOM-free: it never measures elements. Sizes are supplied by the
 * caller ({@link addWord} / {@link setWordSize}), and the two word-level flags
 * are read through accessors passed at {@link addWord}.
 */
export class SpacingModel {
	#engine: Engine
	#inputVolumeBody: Body
	/** Word entries keyed by their word body id. */
	#entries: Map<number, SpacingEntry> = new Map()
	/** Word entries keyed by their sensor body id, for collision-pair lookup. */
	#entriesBySensorId: Map<number, SpacingEntry> = new Map()
	/** Currently-overlapping sensor pairs, maintained from collision events. */
	#sensorPairs: Set<Pair> = new Set()
	/** How far each sensor extends past its word on every side, in pixels. */
	#reach = REPULSION_MARGIN
	#wordSpacing = REPULSION_MARGIN
	#edgeSpacing = REPULSION_MARGIN
	#inputSpacing = REPULSION_MARGIN

	constructor(engine: Engine, { inputVolumeBody }: { inputVolumeBody: Body }) {
		this.#engine = engine
		this.#inputVolumeBody = inputVolumeBody
		Events.on(engine, "collisionStart", this.#handleCollisionStart)
		Events.on(engine, "collisionEnd", this.#handleCollisionEnd)
	}

	/**
	 * Creates the proximity sensor for a word, adds it to the world, and tracks
	 * the word. The sensor is created at the word body's current position/angle.
	 */
	addWord(
		body: Body,
		{ width, height, isRepellable, ignoresInputVolume }: AddWordOptions,
	) {
		const bodySize = { width, height }
		const sensorSize = this.#getSensorSize(bodySize)
		const sensorBody = Bodies.rectangle(
			body.position.x,
			body.position.y,
			sensorSize.width,
			sensorSize.height,
			{
				angle: body.angle,
				isSensor: true,
				// Never let Matter sleep the sensor on its own; its sleep state is
				// mirrored from the word body in #syncSensorBodies instead.
				sleepThreshold: Infinity,
				collisionFilter: {
					category: SENSOR_COLLISION_CATEGORY,
					mask: SENSOR_COLLISION_MASK,
				},
			},
		)
		const entry: SpacingEntry = {
			body,
			bodySize,
			sensorBody,
			sensorSize,
			isRepellable,
			ignoresInputVolume,
		}
		this.#entries.set(body.id, entry)
		this.#entriesBySensorId.set(sensorBody.id, entry)
		Composite.add(this.#engine.world, sensorBody)
	}

	/** Updates the tracked word size and rescales its sensor to match. */
	setWordSize(id: number, { width, height }: Size) {
		const entry = this.#entries.get(id)
		if (entry == null) return
		entry.bodySize = { width, height }
		this.#resizeSensorBody(entry)
	}

	/** Removes a word's sensor from the world and drops its tracking and pairs. */
	removeWord(id: number) {
		const entry = this.#entries.get(id)
		if (entry == null) return
		this.#entriesBySensorId.delete(entry.sensorBody.id)
		this.#entries.delete(id)
		// Drop any lingering sensor pairs that reference the removed sensor in
		// case their collisionEnd event has not fired yet.
		for (const pair of this.#sensorPairs) {
			if (pair.bodyA === entry.sensorBody || pair.bodyB === entry.sensorBody) {
				this.#sensorPairs.delete(pair)
			}
		}
		Composite.remove(this.#engine.world, entry.sensorBody)
	}

	/**
	 * Stores all three spacing margins and recomputes the sensor reach. Sensors
	 * are resized only when the reach actually changes.
	 */
	setSpacing({
		word,
		edge,
		input,
	}: {
		word: number
		edge: number
		input: number
	}) {
		this.#wordSpacing = word
		this.#edgeSpacing = edge
		this.#inputSpacing = input
		// Sensors reach far enough to cover the largest active margin; the per-pair
		// margin then gates the actual force, so over-detection is free. Reach and
		// margins change rarely, so resizing on change is cheap.
		const reach = Math.max(word, edge, input, 0)
		if (reach !== this.#reach) {
			this.#reach = reach
			for (const entry of this.#entries.values()) {
				this.#resizeSensorBody(entry)
			}
		}
	}

	/**
	 * Applies the short-range soft repulsion. Called once per `beforeUpdate` by
	 * the tick owner, after {@link setSpacing} has reflected the current margins.
	 */
	applyForces() {
		this.#syncSensorBodies()

		for (const pair of this.#sensorPairs) {
			if (!pair.isActive) continue
			const entryA = this.#entriesBySensorId.get(pair.bodyA.id)
			const entryB = this.#entriesBySensorId.get(pair.bodyB.id)

			if (entryA != null && entryB != null) {
				this.#applyPairRepulsion(pair, {
					margin: this.#wordSpacing,
					inflation: 2 * this.#reach,
					wordA: entryA,
					wordB: entryB,
				})
				continue
			}

			// One side is a word sensor, the other the frame or the input volume.
			const wordEntry = entryA ?? entryB
			if (wordEntry == null) continue
			const otherBody = entryA != null ? pair.bodyB : pair.bodyA
			const isInput = otherBody === this.#inputVolumeBody
			if (isInput && wordEntry.ignoresInputVolume()) continue
			this.#applyPairRepulsion(pair, {
				margin: isInput ? this.#inputSpacing : this.#edgeSpacing,
				inflation: this.#reach,
				wordA: entryA != null ? wordEntry : null,
				wordB: entryB != null ? wordEntry : null,
			})
		}
	}

	/** Unsubscribes from engine collision events. */
	dispose() {
		Events.off(this.#engine, "collisionStart", this.#handleCollisionStart)
		Events.off(this.#engine, "collisionEnd", this.#handleCollisionEnd)
	}

	/** The sensor dimensions for a word of the given size at the current reach. */
	#getSensorSize({ width, height }: Size): Size {
		const reach = this.#reach
		return { width: width + 2 * reach, height: height + 2 * reach }
	}

	/**
	 * Scales an entry's sensor body so it again extends {@link #reach} pixels past
	 * the word on every side. No-op when already the right size.
	 */
	#resizeSensorBody(entry: SpacingEntry) {
		const target = this.#getSensorSize(entry.bodySize)
		const { width: current, height: currentHeight } = entry.sensorSize
		if (target.width === current && target.height === currentHeight) return
		Body.scale(
			entry.sensorBody,
			target.width / current,
			target.height / currentHeight,
		)
		entry.sensorSize = target
	}

	/**
	 * Moves each sensor onto its word.
	 *
	 * Sleeping words are skipped (they have not moved), but their sensors stay
	 * awake so a still-penetrating neighbour is always detected: the repulsion
	 * then wakes the sleeper and separates it, instead of freezing an overlap.
	 * Only words that are far enough from everything to receive no force settle
	 * and sleep, which is where the broadphase savings come from.
	 */
	#syncSensorBodies() {
		for (const entry of this.#entries.values()) {
			const { body, sensorBody } = entry
			if (body.isSleeping) continue
			Body.setPosition(sensorBody, body.position)
			Body.setAngle(sensorBody, body.angle)
		}
	}

	/**
	 * Applies a single soft repulsion impulse for one sensor pair.
	 *
	 * `inflation` is the combined sensor reach across the pair, used to turn the
	 * SAT penetration depth back into the real gap between the word bodies. A null
	 * `wordA`/`wordB` marks the static frame or input side, which is not pushed.
	 */
	#applyPairRepulsion(
		pair: Pair,
		{
			margin,
			inflation,
			wordA,
			wordB,
		}: {
			margin: number
			inflation: number
			wordA: SpacingEntry | null
			wordB: SpacingEntry | null
		},
	) {
		// A dragged or static word neither pushes nor is pushed; skip the pair if
		// either participant is excluded. Sleeping words are intentionally NOT
		// excluded: applying the force wakes a still-overlapping sleeper so it can
		// separate, rather than leaving the overlap frozen.
		if (wordA != null && !wordA.isRepellable()) return
		if (wordB != null && !wordB.isRepellable()) return

		const collision = pair.collision
		const gap = inflation - collision.depth
		const strength = getRepulsionStrength({ margin, gap })
		if (strength == null) return

		// Orient the collision normal so it points from body A to body B.
		let nx = collision.normal.x
		let ny = collision.normal.y
		const deltaX = pair.bodyB.position.x - pair.bodyA.position.x
		const deltaY = pair.bodyB.position.y - pair.bodyA.position.y
		if (nx * deltaX + ny * deltaY < 0) {
			nx = -nx
			ny = -ny
		}

		const magnitude = strength * REPULSION_FORCE
		const fx = nx * magnitude
		const fy = ny * magnitude

		// Applied at each word's centre: a pure separating push, leaving
		// orientation entirely to the angular restoring torque.
		if (wordA != null) {
			Body.applyForce(wordA.body, wordA.body.position, { x: -fx, y: -fy })
		}
		if (wordB != null) {
			Body.applyForce(wordB.body, wordB.body.position, { x: fx, y: fy })
		}
	}

	#handleCollisionStart = (event: IEventCollision<Engine>) => {
		for (const pair of event.pairs) {
			if (pair.isSensor) this.#sensorPairs.add(pair)
		}
	}

	#handleCollisionEnd = (event: IEventCollision<Engine>) => {
		for (const pair of event.pairs) {
			if (pair.isSensor) this.#sensorPairs.delete(pair)
		}
	}
}
