import Matter from "matter-js"
import {
	INPUT_VOLUME_COLLISION_CATEGORY,
	INPUT_VOLUME_COLLISION_MASK,
} from "./collision.ts"

const INPUT_VOLUME_MIN_SIZE = 1

interface Size {
	width: number
	height: number
}

/** A centered rectangle: {@link x}/{@link y} are the center position. */
interface Rect extends Size {
	x: number
	y: number
}

/**
 * Owns the input volume — the static body matching the text input box that
 * repels words away from where the user is typing — and the {@link beginGrace
 * input grace} state machine that lets a freshly-spawned word escape it once.
 *
 * The module is DOM-free: it never measures elements. The owning simulation
 * feeds it a measured rect ({@link setRect}) and drives its per-tick grace
 * release ({@link releaseExitedWords}). It does not touch word collision masks
 * itself — it only owns which words are still in grace and returns the ids whose
 * grace ends, so the simulation stays the single writer of a word's mask.
 */
export class InputVolume {
	#engine: Matter.Engine
	#body: Matter.Body
	#bodySize: Size = {
		width: INPUT_VOLUME_MIN_SIZE,
		height: INPUT_VOLUME_MIN_SIZE,
	}
	#enabled = false
	/** Word bodies still in input grace, keyed by their body id. */
	#grace: Map<number, Matter.Body> = new Map()

	constructor(engine: Matter.Engine) {
		this.#engine = engine
		this.#body = Matter.Bodies.rectangle(
			0,
			0,
			INPUT_VOLUME_MIN_SIZE,
			INPUT_VOLUME_MIN_SIZE,
			{
				isStatic: true,
				collisionFilter: {
					category: INPUT_VOLUME_COLLISION_CATEGORY,
					mask: INPUT_VOLUME_COLLISION_MASK,
				},
			},
		)
	}

	/** The static input-volume body. {@link SpacingModel} classifies word↔input
	 * pairs by identity against this body. */
	get body(): Matter.Body {
		return this.#body
	}

	/** Whether the input volume is currently in the world. */
	get enabled(): boolean {
		return this.#enabled
	}

	/**
	 * Enables/resizes/repositions the body from a measured rect, or disables it
	 * when `rect` is `null`. Disabling clears all input grace and returns the ids
	 * whose grace just ended, so the caller can recompute their collision masks.
	 */
	setRect(rect: Rect | null): number[] {
		if (rect == null) {
			if (!this.#enabled) return []
			Matter.Composite.remove(this.#engine.world, this.#body)
			this.#enabled = false
			return this.#clearGrace()
		}

		const width = Math.max(INPUT_VOLUME_MIN_SIZE, rect.width)
		const height = Math.max(INPUT_VOLUME_MIN_SIZE, rect.height)
		const scaleX = width / this.#bodySize.width
		const scaleY = height / this.#bodySize.height
		if (scaleX !== 1 || scaleY !== 1) {
			Matter.Body.scale(this.#body, scaleX, scaleY)
			this.#bodySize = { width, height }
		}
		Matter.Body.setPosition(this.#body, { x: rect.x, y: rect.y })

		if (!this.#enabled) {
			Matter.Composite.add(this.#engine.world, this.#body)
			this.#enabled = true
		}
		return []
	}

	/** Puts a freshly-spawned word into input grace: it ignores the input volume
	 * until it has left it once. */
	beginGrace(body: Matter.Body) {
		this.#grace.set(body.id, body)
	}

	/** Whether the word still ignores the input volume. Read by the simulation's
	 * mask deriver and by {@link SpacingModel}'s input-pair gate. */
	ignores(id: number): boolean {
		return this.#grace.has(id)
	}

	/**
	 * Ends grace for every tracked word no longer overlapping the volume and
	 * returns their ids. Called once per `beforeUpdate` by the simulation, which
	 * re-derives the returned words' masks.
	 */
	releaseExitedWords(): number[] {
		if (!this.#enabled || this.#grace.size === 0) return []
		const exited: number[] = []
		for (const [id, body] of this.#grace) {
			if (this.#overlaps(body)) continue
			this.#grace.delete(id)
			exited.push(id)
		}
		return exited
	}

	/** Drops a word from grace tracking (e.g. when it is removed from the world). */
	forget(id: number) {
		this.#grace.delete(id)
	}

	#clearGrace(): number[] {
		const ids = [...this.#grace.keys()]
		this.#grace.clear()
		return ids
	}

	/** AABB overlap of a word body's bounds against the input-volume body. */
	#overlaps(body: Matter.Body): boolean {
		const a = body.bounds
		const b = this.#body.bounds
		return (
			a.min.x <= b.max.x &&
			a.max.x >= b.min.x &&
			a.min.y <= b.max.y &&
			a.max.y >= b.min.y
		)
	}
}
