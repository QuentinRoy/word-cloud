import {
	Bodies,
	Body,
	Composite,
	Engine,
	Events,
	type Mouse,
	MouseConstraint,
	Runner,
} from "matter-js"
import {
	DEFAULT_WORD_COLLISION_MASK,
	FRAME_COLLISION_CATEGORY,
	FRAME_COLLISION_MASK,
	INPUT_VOLUME_COLLISION_CATEGORY,
	INPUT_VOLUME_COLLISION_MASK,
	WORD_COLLISION_CATEGORY,
} from "./collision.ts"
import { applyAngularRestoringTorque } from "./physics-utils.ts"
import { SpacingModel } from "./spacing-model.ts"

export const CHAMFER_RADIUS = 8

const INPUT_VOLUME_MIN_SIZE = 1
const FRAME_THICKNESS = 1000
const ANGULAR_REST_ANGLE = 0
const ANGULAR_REST_ANGLE_EPSILON = 0.001
const ANGULAR_SPRING_TORQUE_STIFFNESS = 0.4
const ANGULAR_DAMPING_COEFFICIENT = 0.2
const ANGULAR_SPRING_WIDTH_REFERENCE = 150
const WORD_AIR_FRICTION = 0.04
const WORD_RESTITUTION = 0.2

interface Size {
	width: number
	height: number
}

/** A centered rectangle: {@link x}/{@link y} are the center position. */
interface Rect extends Size {
	x: number
	y: number
}

/** Linear velocity vector applied to a word body on creation. */
interface Velocity {
	x: number
	y: number
}

/** Frozen rotational inertia captured while a word is drag-locked. */
interface DragLock {
	initialInertia: number
}

interface WordEntry {
	body: Body
	bodySize: Size
	dragLock: DragLock | null
	ignoreInputVolumeUntilExit: boolean
}

export interface AddWordOptions {
	x: number
	y: number
	width: number
	height: number
	angle?: number
	velocity?: Velocity
	/**
	 * While true, collisions with the input volume stay disabled until the
	 * body leaves that volume once.
	 */
	ignoreInputVolumeUntilExit?: boolean
}

/**
 * The DOM-free Matter.js simulation behind {@link HTMLWordCloudElement}.
 *
 * Owns the engine, runner, the four frame bodies, the input-volume body, the
 * {@link SpacingModel}, the `MouseConstraint`, and the drag-lock state. The
 * element drives it through this API and reads word body positions back
 * (via the `Body` returned from {@link addWord}) to write CSS transforms.
 *
 * Stays DOM-free: never reads `document`/`window`/elements. The element
 * supplies measured sizes and a `Mouse` it created itself.
 */
export class WordCloudSimulation {
	#engine: Engine
	#runner: Runner
	#frameBodies: { left: Body; right: Body; top: Body; bottom: Body }
	#frameBodySize = { horizontalLength: 1, verticalLength: 1 }
	#inputVolumeBody: Body
	#inputVolumeBodySize = {
		width: INPUT_VOLUME_MIN_SIZE,
		height: INPUT_VOLUME_MIN_SIZE,
	}
	#inputVolumeEnabled = false
	#spacingModel: SpacingModel
	#words = new Map<number, WordEntry>()
	#mouseConstraint: MouseConstraint | null = null
	#mouseEnabled = false
	#isRunning = false

	constructor() {
		this.#engine = Engine.create()
		this.#engine.gravity.y = 0
		this.#engine.gravity.scale = 0
		// Once a region of the cloud settles, Matter sleeps those bodies and the
		// broadphase skips them entirely. The repulsion pass and the angular
		// restoring torque both skip sleeping bodies, so nothing fights this.
		this.#engine.enableSleeping = true
		this.#runner = Runner.create()
		this.#frameBodies = this.#setupFrameBodies()
		this.#inputVolumeBody = this.#setupInputVolumeBody()
		this.#spacingModel = new SpacingModel(this.#engine, {
			inputVolumeBody: this.#inputVolumeBody,
		})
		Events.on(this.#engine, "beforeUpdate", this.#handleBeforeUpdate)
	}

	/** The Matter engine, exposed read-only so the element can attach its own
	 * listeners (framerate display, debug renderer) without the simulation
	 * itself touching the DOM. */
	get engine(): Engine {
		return this.#engine
	}

	/** The Matter runner, exposed read-only for the element's tick listeners. */
	get runner(): Runner {
		return this.#runner
	}

	/** The mouse constraint created by {@link attachMouse}, or `null` before
	 * a mouse has been attached. */
	get mouseConstraint(): MouseConstraint | null {
		return this.#mouseConstraint
	}

	/** Whether the mouse constraint is currently in the world (set by
	 * {@link setMouseEnabled}). The element reads this to gate its drag
	 * handlers, which can still fire as the constraint is being torn down. */
	get mouseEnabled(): boolean {
		return this.#mouseEnabled
	}

	/**
	 * Creates a word body, adds it to the world, and registers it with the
	 * spacing model. Returns the body so the element can build its {@link Word}
	 * unit around it.
	 */
	addWord({
		x,
		y,
		width,
		height,
		angle = 0,
		velocity,
		ignoreInputVolumeUntilExit = false,
	}: AddWordOptions): Body {
		const body = Bodies.rectangle(x, y, width, height, {
			chamfer: { radius: CHAMFER_RADIUS },
			angle,
			frictionAir: WORD_AIR_FRICTION,
			restitution: WORD_RESTITUTION,
			collisionFilter: { category: WORD_COLLISION_CATEGORY },
		})
		if (velocity) Body.setVelocity(body, velocity)
		Composite.add(this.#engine.world, body)

		const entry: WordEntry = {
			body,
			bodySize: { width, height },
			dragLock: null,
			ignoreInputVolumeUntilExit,
		}
		this.#words.set(body.id, entry)
		this.#updateWordCollisionMask(entry)
		this.#spacingModel.addWord(body, {
			width,
			height,
			isRepellable: () => !body.isStatic && entry.dragLock == null,
			ignoresInputVolume: () => entry.ignoreInputVolumeUntilExit,
		})
		return body
	}

	/** Unlocks any drag, removes the word's sensor and body from the world,
	 * and drops its tracking. */
	removeWord(id: number) {
		const entry = this.#words.get(id)
		if (entry == null) return
		this.unlockDrag(id)
		this.#spacingModel.removeWord(id)
		Composite.remove(this.#engine.world, entry.body)
		this.#words.delete(id)
	}

	/**
	 * Rescales a word's body and sensor to a newly-measured size. While the
	 * word is drag-locked, its inertia is briefly restored so `Body.scale` can
	 * recompute it, then re-frozen at the new value.
	 */
	setWordSize(id: number, { width, height }: Size) {
		const entry = this.#words.get(id)
		if (entry == null) return
		const { width: previousWidth, height: previousHeight } = entry.bodySize
		if (width === previousWidth && height === previousHeight) return

		const { dragLock } = entry
		if (dragLock != null) {
			Body.setInertia(entry.body, dragLock.initialInertia)
		}

		Body.scale(entry.body, width / previousWidth, height / previousHeight)
		entry.bodySize = { width, height }
		this.#spacingModel.setWordSize(id, { width, height })

		if (dragLock != null) {
			dragLock.initialInertia = entry.body.inertia
			this.#freezeRotation(entry.body)
		}
	}

	/**
	 * Scales and repositions the four frame bodies to tightly bound a
	 * container of the given size.
	 */
	setFrameSize({ width, height }: Size) {
		const { left, right, top, bottom } = this.#frameBodies
		const horizontalLength = Math.max(1, width + FRAME_THICKNESS * 2)
		const verticalLength = Math.max(1, height + FRAME_THICKNESS * 2)

		const scaleHorizontal =
			horizontalLength / this.#frameBodySize.horizontalLength
		const scaleVertical = verticalLength / this.#frameBodySize.verticalLength

		if (scaleVertical !== 1) {
			Body.scale(left, 1, scaleVertical)
			Body.scale(right, 1, scaleVertical)
		}
		if (scaleHorizontal !== 1) {
			Body.scale(top, scaleHorizontal, 1)
			Body.scale(bottom, scaleHorizontal, 1)
		}

		this.#frameBodySize = { horizontalLength, verticalLength }

		Body.setPosition(left, { x: -FRAME_THICKNESS / 2, y: height / 2 })
		Body.setPosition(right, {
			x: width + FRAME_THICKNESS / 2,
			y: height / 2,
		})
		Body.setPosition(top, { x: width / 2, y: -FRAME_THICKNESS / 2 })
		Body.setPosition(bottom, {
			x: width / 2,
			y: height + FRAME_THICKNESS / 2,
		})
	}

	/**
	 * Enables/resizes/repositions the input-volume body from a measured rect,
	 * or disables it when `rect` is `null`. Disabling clears
	 * `ignoreInputVolumeUntilExit` on every word that still had it set.
	 */
	setInputVolume(rect: Rect | null) {
		if (rect == null) {
			if (!this.#inputVolumeEnabled) return
			Composite.remove(this.#engine.world, this.#inputVolumeBody)
			this.#inputVolumeEnabled = false
			for (const entry of this.#words.values()) {
				if (!entry.ignoreInputVolumeUntilExit) continue
				entry.ignoreInputVolumeUntilExit = false
				this.#updateWordCollisionMask(entry)
			}
			return
		}

		const width = Math.max(INPUT_VOLUME_MIN_SIZE, rect.width)
		const height = Math.max(INPUT_VOLUME_MIN_SIZE, rect.height)
		const scaleX = width / this.#inputVolumeBodySize.width
		const scaleY = height / this.#inputVolumeBodySize.height
		if (scaleX !== 1 || scaleY !== 1) {
			Body.scale(this.#inputVolumeBody, scaleX, scaleY)
			this.#inputVolumeBodySize = { width, height }
		}
		Body.setPosition(this.#inputVolumeBody, { x: rect.x, y: rect.y })

		if (!this.#inputVolumeEnabled) {
			Composite.add(this.#engine.world, this.#inputVolumeBody)
			this.#inputVolumeEnabled = true
		}
	}

	/**
	 * Stores the three spacing margins and resizes sensors if the derived
	 * reach changed. See {@link SpacingModel.setSpacing}.
	 */
	setSpacing(spacing: { word: number; edge: number; input: number }) {
		this.#spacingModel.setSpacing(spacing)
	}

	/** Creates the `MouseConstraint` from a `Mouse` the element created. Not
	 * added to the world until {@link setMouseEnabled} is called. */
	attachMouse(mouse: Mouse) {
		this.#mouseConstraint = MouseConstraint.create(this.#engine, {
			mouse,
			constraint: { stiffness: 0.3, render: { visible: true } },
			// Only grab real word bodies — never the oversized sensors.
			collisionFilter: {
				category: WORD_COLLISION_CATEGORY,
				mask: WORD_COLLISION_CATEGORY,
				group: 0,
			},
		})
	}

	/**
	 * Adds or removes the mouse constraint from the world. Disabling unlocks
	 * any active drag.
	 */
	setMouseEnabled(enabled: boolean) {
		if (this.#mouseConstraint == null) return
		if (enabled) {
			if (this.#mouseEnabled) return
			this.#mouseEnabled = true
			Composite.add(this.#engine.world, this.#mouseConstraint)
		} else {
			this.#mouseEnabled = false
			this.unlockAllDrags()
			Composite.remove(this.#engine.world, this.#mouseConstraint.constraint, true)
		}
	}

	/**
	 * Locks a word's drag: freezes its rotational inertia and disables its
	 * collisions. No-op if already locked.
	 */
	lockDrag(id: number) {
		const entry = this.#words.get(id)
		if (entry == null || entry.dragLock != null) return
		entry.dragLock = { initialInertia: entry.body.inertia }
		this.#updateWordCollisionMask(entry)
		this.#freezeRotation(entry.body)
	}

	/**
	 * Restores a previously drag-locked word to normal physics behavior.
	 * No-op if not locked.
	 */
	unlockDrag(id: number) {
		const entry = this.#words.get(id)
		if (entry == null || entry.dragLock == null) return
		Body.setInertia(entry.body, entry.dragLock.initialInertia)
		Body.setAngularVelocity(entry.body, 0)
		entry.dragLock = null
		this.#updateWordCollisionMask(entry)
	}

	/** Unlocks every drag-locked word. */
	unlockAllDrags() {
		for (const id of this.#words.keys()) this.unlockDrag(id)
	}

	/** Starts the runner, advancing the simulation each frame. No-op if
	 * already running. */
	start() {
		if (this.#isRunning) return
		this.#isRunning = true
		Runner.run(this.#runner, this.#engine)
	}

	/** Stops the runner. No-op if not running. */
	stop() {
		if (!this.#isRunning) return
		this.#isRunning = false
		Runner.stop(this.#runner)
	}

	#setupFrameBodies() {
		const collisionFilter = {
			category: FRAME_COLLISION_CATEGORY,
			mask: FRAME_COLLISION_MASK,
		}
		const frameBodies = {
			left: Bodies.rectangle(0, 0, FRAME_THICKNESS, 1, {
				isStatic: true,
				collisionFilter,
			}),
			right: Bodies.rectangle(0, 0, FRAME_THICKNESS, 1, {
				isStatic: true,
				collisionFilter,
			}),
			top: Bodies.rectangle(0, 0, 1, FRAME_THICKNESS, {
				isStatic: true,
				collisionFilter,
			}),
			bottom: Bodies.rectangle(0, 0, 1, FRAME_THICKNESS, {
				isStatic: true,
				collisionFilter,
			}),
		}
		Composite.add(this.#engine.world, [
			frameBodies.left,
			frameBodies.right,
			frameBodies.top,
			frameBodies.bottom,
		])
		return frameBodies
	}

	#setupInputVolumeBody() {
		return Bodies.rectangle(
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

	/**
	 * Recomputes a word's collision mask from its current state: a drag-locked
	 * word collides with nothing; a freshly-spawned word that still ignores the
	 * input volume drops that one category; otherwise the full default mask.
	 */
	#updateWordCollisionMask(entry: WordEntry) {
		if (entry.dragLock != null) {
			entry.body.collisionFilter.mask = 0
			return
		}
		entry.body.collisionFilter.mask = entry.ignoreInputVolumeUntilExit
			? DEFAULT_WORD_COLLISION_MASK & ~INPUT_VOLUME_COLLISION_CATEGORY
			: DEFAULT_WORD_COLLISION_MASK
	}

	/** Pins a body's rotation while it is drag-locked: infinite inertia so it
	 * can't be spun, and any residual spin zeroed out. */
	#freezeRotation(body: Body) {
		Body.setInertia(body, Infinity)
		Body.setAngularVelocity(body, 0)
	}

	#isOverlappingInputVolume(body: Body) {
		const a = body.bounds
		const b = this.#inputVolumeBody.bounds
		return (
			a.min.x <= b.max.x &&
			a.max.x >= b.min.x &&
			a.min.y <= b.max.y &&
			a.max.y >= b.min.y
		)
	}

	/**
	 * Checks each word that has `ignoreInputVolumeUntilExit` set and clears
	 * the flag once the body is no longer overlapping the input volume.
	 */
	#updateWordInputCollisions() {
		if (!this.#inputVolumeEnabled) return
		for (const entry of this.#words.values()) {
			if (!entry.ignoreInputVolumeUntilExit) continue
			if (this.#isOverlappingInputVolume(entry.body)) continue
			entry.ignoreInputVolumeUntilExit = false
			this.#updateWordCollisionMask(entry)
		}
	}

	#applyAngularRestoringTorque() {
		for (const {
			body,
			bodySize: { width, height },
		} of this.#words.values()) {
			applyAngularRestoringTorque({
				body,
				bodySize: { width, height },
				restAngle: ANGULAR_REST_ANGLE,
				restAngleEpsilon: ANGULAR_REST_ANGLE_EPSILON,
				springTorqueStiffness: ANGULAR_SPRING_TORQUE_STIFFNESS,
				dampingCoefficient: ANGULAR_DAMPING_COEFFICIENT,
				springWidthReference: ANGULAR_SPRING_WIDTH_REFERENCE,
			})
		}
	}

	#handleBeforeUpdate = () => {
		this.#applyAngularRestoringTorque()
		this.#updateWordInputCollisions()
		this.#spacingModel.applyForces()
	}
}
