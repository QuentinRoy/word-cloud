import Matter from "matter-js"
import {
	FRAME_COLLISION_CATEGORY,
	FRAME_COLLISION_MASK,
	WORD_COLLISION_CATEGORY,
	wordCollisionMask,
} from "./collision.ts"
import { InputVolume } from "./input-volume.ts"
import { applyAngularRestoringTorque } from "./physics-utils.ts"
import { SpacingModel } from "./spacing-model.ts"
import { normalizeAngle } from "./utils.ts"

export const CHAMFER_RADIUS = 8

const FRAME_THICKNESS = 1000
const ANGULAR_REST_ANGLE = 0
const ANGULAR_REST_ANGLE_EPSILON = 0.001
const ANGULAR_SPRING_TORQUE_STIFFNESS = 0.4
const ANGULAR_DAMPING_COEFFICIENT = 0.2
const ANGULAR_SPRING_WIDTH_REFERENCE = 150
/** Matter's default `body.sleepThreshold`: the number of low-motion frames a
 * body must accumulate before it sleeps. We restore this once a word is back to
 * horizontal; until then we set the threshold to Infinity so it can't sleep. */
const DEFAULT_SLEEP_THRESHOLD = 60
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
	body: Matter.Body
	bodySize: Size
	dragLock: DragLock | null
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
 * Owns the engine, runner, the four frame bodies, the {@link InputVolume}, the
 * {@link SpacingModel}, and the drag-lock state. The element drives it through
 * this API and reads word body positions back (via the `Body` returned from
 * {@link addWord}) to write CSS transforms.
 *
 * Stays DOM-free: never reads `document`/`window`/elements. The element
 * supplies measured sizes and drives drag through the kinematic verbs.
 */
export class WordCloudSimulation {
	#engine: Matter.Engine
	#runner: Matter.Runner
	#frameBodies: {
		left: Matter.Body
		right: Matter.Body
		top: Matter.Body
		bottom: Matter.Body
	}
	#frameBodySize = { horizontalLength: 1, verticalLength: 1 }
	#inputVolume: InputVolume
	#spacingModel: SpacingModel
	#words = new Map<number, WordEntry>()
	#isRunning = false

	/** Invoked once per simulation frame with the frame delta in milliseconds.
	 * The element writes word transforms and the framerate display from it. */
	onTick: ((frameDelta: number) => void) | null = null

	constructor() {
		this.#engine = Matter.Engine.create()
		this.#engine.gravity.y = 0
		this.#engine.gravity.scale = 0
		// Once a region of the cloud settles, Matter sleeps those bodies and the
		// broadphase skips them entirely. The repulsion pass and the angular
		// restoring torque both skip sleeping bodies, so nothing fights this.
		//
		// Matter decides to sleep purely from a body's motion (speed² +
		// angularSpeed²), which is decoupled from how far a word still is from
		// horizontal. A word rotating slowly back to level — especially a narrow
		// one, whose restoring torque is scaled down — can dip below the motion
		// threshold and sleep while still tilted, freezing it mid-rotation since
		// the torque then skips it. #gateSleepingByAlignment closes that gap by
		// keeping a word awake until it is actually horizontal.
		this.#engine.enableSleeping = true
		this.#runner = Matter.Runner.create()
		this.#frameBodies = this.#setupFrameBodies()
		this.#inputVolume = new InputVolume(this.#engine)
		this.#spacingModel = new SpacingModel(this.#engine, {
			inputVolumeBody: this.#inputVolume.body,
		})
		Matter.Events.on(this.#engine, "beforeUpdate", this.#handleBeforeUpdate)
		Matter.Events.on(this.#runner, "tick", this.#handleTick)
	}

	/** The Matter engine, exposed read-only as the one escape hatch for the
	 * element's dev-flagged debug `Render`. Everything else crosses the seam as
	 * intent ({@link onTick}/{@link onWordGrab}/{@link onWordRelease}) so the
	 * element never names a Matter event. */
	get engine(): Matter.Engine {
		return this.#engine
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
	}: AddWordOptions): Matter.Body {
		const body = Matter.Bodies.rectangle(x, y, width, height, {
			chamfer: { radius: CHAMFER_RADIUS },
			angle,
			frictionAir: WORD_AIR_FRICTION,
			restitution: WORD_RESTITUTION,
			collisionFilter: { category: WORD_COLLISION_CATEGORY },
		})
		if (velocity) Matter.Body.setVelocity(body, velocity)
		Matter.Composite.add(this.#engine.world, body)

		const entry: WordEntry = {
			body,
			bodySize: { width, height },
			dragLock: null,
		}
		this.#words.set(body.id, entry)
		if (ignoreInputVolumeUntilExit) this.#inputVolume.beginGrace(body)
		this.#applyWordMask(body.id)
		this.#spacingModel.addWord(body, {
			width,
			height,
			isRepellable: () => !body.isStatic && entry.dragLock == null,
			ignoresInputVolume: () => this.#inputVolume.ignores(body.id),
		})
		return body
	}

	/** Unlocks any drag, removes the word's sensor and body from the world,
	 * and drops its tracking. */
	removeWord(id: number) {
		const entry = this.#words.get(id)
		if (entry == null) return
		this.unlockDrag(id)
		this.#inputVolume.forget(id)
		this.#spacingModel.removeWord(id)
		Matter.Composite.remove(this.#engine.world, entry.body)
		this.#words.delete(id)
	}

	/**
	 * Rescales a word's body and sensor to a newly-measured size. While the
	 * word is drag-locked, its inertia is briefly restored so `matter.Body.scale` can
	 * recompute it, then re-frozen at the new value.
	 */
	setWordSize(id: number, { width, height }: Size) {
		const entry = this.#words.get(id)
		if (entry == null) return
		const { width: previousWidth, height: previousHeight } = entry.bodySize
		if (width === previousWidth && height === previousHeight) return

		const { dragLock } = entry
		if (dragLock != null) {
			Matter.Body.setInertia(entry.body, dragLock.initialInertia)
		}

		Matter.Body.scale(
			entry.body,
			width / previousWidth,
			height / previousHeight,
		)
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
			Matter.Body.scale(left, 1, scaleVertical)
			Matter.Body.scale(right, 1, scaleVertical)
		}
		if (scaleHorizontal !== 1) {
			Matter.Body.scale(top, scaleHorizontal, 1)
			Matter.Body.scale(bottom, scaleHorizontal, 1)
		}

		this.#frameBodySize = { horizontalLength, verticalLength }

		Matter.Body.setPosition(left, { x: -FRAME_THICKNESS / 2, y: height / 2 })
		Matter.Body.setPosition(right, {
			x: width + FRAME_THICKNESS / 2,
			y: height / 2,
		})
		Matter.Body.setPosition(top, { x: width / 2, y: -FRAME_THICKNESS / 2 })
		Matter.Body.setPosition(bottom, {
			x: width / 2,
			y: height + FRAME_THICKNESS / 2,
		})
	}

	/**
	 * Enables/resizes/repositions the input volume from a measured rect, or
	 * disables it when `rect` is `null`. Disabling ends input grace for every
	 * word that still had it; the freed words are re-masked here.
	 */
	setInputVolume(rect: Rect | null) {
		for (const id of this.#inputVolume.setRect(rect)) {
			this.#applyWordMask(id)
		}
	}

	/**
	 * Stores the three spacing margins and resizes sensors if the derived
	 * reach changed. See {@link SpacingModel.setSpacing}.
	 */
	setSpacing(spacing: { word: number; edge: number; input: number }) {
		this.#spacingModel.setSpacing(spacing)
	}

	/**
	 * Locks a word's drag: freezes its rotational inertia and disables its
	 * collisions. No-op if already locked.
	 */
	lockDrag(id: number) {
		const entry = this.#words.get(id)
		if (entry == null || entry.dragLock != null) return
		entry.dragLock = { initialInertia: entry.body.inertia }
		this.#applyWordMask(id)
		this.#freezeRotation(entry.body)
	}

	/**
	 * Restores a previously drag-locked word to normal physics behavior.
	 * No-op if not locked.
	 */
	unlockDrag(id: number) {
		const entry = this.#words.get(id)
		if (entry == null || entry.dragLock == null) return
		Matter.Body.setInertia(entry.body, entry.dragLock.initialInertia)
		Matter.Body.setAngularVelocity(entry.body, 0)
		entry.dragLock = null
		this.#applyWordMask(id)
	}

	/**
	 * Kinematic grab: wakes the body, locks drag, and zeroes linear velocity
	 * so the pin cannot drift. No-op for an unknown id.
	 */
	grabWord(id: number) {
		const entry = this.#words.get(id)
		if (entry == null) return
		Matter.Sleeping.set(entry.body, false)
		this.lockDrag(id)
		Matter.Body.setVelocity(entry.body, { x: 0, y: 0 })
	}

	/**
	 * Kinematic move: pins the word body to the given point. No velocity is
	 * set. No-op for an unknown id.
	 */
	moveWord(id: number, { x, y }: { x: number; y: number }) {
		const entry = this.#words.get(id)
		if (entry == null) return
		Matter.Body.setPosition(entry.body, { x, y })
	}

	/**
	 * Kinematic release: unlocks drag and applies the throw velocity.
	 * Velocity is given in px/ms and converted to px/frame (× 1000/60).
	 * Zeroed when the simulation is not running. No-op for an unknown id.
	 */
	releaseWord(id: number, vPxPerMs: { x: number; y: number }) {
		const entry = this.#words.get(id)
		if (entry == null) return
		this.unlockDrag(id)
		const velocity = this.#isRunning
			? { x: vPxPerMs.x * (1000 / 60), y: vPxPerMs.y * (1000 / 60) }
			: { x: 0, y: 0 }
		Matter.Body.setVelocity(entry.body, velocity)
	}

	/** Starts the runner, advancing the simulation each frame. No-op if
	 * already running. */
	start() {
		if (this.#isRunning) return
		this.#isRunning = true
		Matter.Runner.run(this.#runner, this.#engine)
	}

	/** Stops the runner. No-op if not running. */
	stop() {
		if (!this.#isRunning) return
		this.#isRunning = false
		Matter.Runner.stop(this.#runner)
	}

	#setupFrameBodies() {
		const collisionFilter = {
			category: FRAME_COLLISION_CATEGORY,
			mask: FRAME_COLLISION_MASK,
		}
		const frameBodies = {
			left: Matter.Bodies.rectangle(0, 0, FRAME_THICKNESS, 1, {
				isStatic: true,
				collisionFilter,
			}),
			right: Matter.Bodies.rectangle(0, 0, FRAME_THICKNESS, 1, {
				isStatic: true,
				collisionFilter,
			}),
			top: Matter.Bodies.rectangle(0, 0, 1, FRAME_THICKNESS, {
				isStatic: true,
				collisionFilter,
			}),
			bottom: Matter.Bodies.rectangle(0, 0, 1, FRAME_THICKNESS, {
				isStatic: true,
				collisionFilter,
			}),
		}
		Matter.Composite.add(this.#engine.world, [
			frameBodies.left,
			frameBodies.right,
			frameBodies.top,
			frameBodies.bottom,
		])
		return frameBodies
	}

	/** Re-derives and applies a word's collision mask from its current state —
	 * drag-lock and input grace. The single place a word mask is written; see
	 * {@link wordCollisionMask}. No-op for an unknown id. */
	#applyWordMask(id: number) {
		const entry = this.#words.get(id)
		if (entry == null) return
		entry.body.collisionFilter.mask = wordCollisionMask({
			dragLocked: entry.dragLock != null,
			ignoresInput: this.#inputVolume.ignores(id),
		})
	}

	/** Pins a body's rotation while it is drag-locked: infinite inertia so it
	 * can't be spun, and any residual spin zeroed out. */
	#freezeRotation(body: Matter.Body) {
		Matter.Body.setInertia(body, Infinity)
		Matter.Body.setAngularVelocity(body, 0)
	}

	/**
	 * Makes horizontal alignment a precondition for sleeping: a word that is
	 * still tilted beyond the rest epsilon is kept awake (and woken if Matter
	 * already slept it), so {@link applyAngularRestoringTorque} keeps acting on
	 * it until it is level. Aligned words get the normal sleep threshold back and
	 * are free to settle. Static/frame bodies are untouched.
	 */
	#gateSleepingByAlignment() {
		for (const { body } of this.#words.values()) {
			if (body.isStatic) continue
			const angleError = Math.abs(
				normalizeAngle(body.angle) - ANGULAR_REST_ANGLE,
			)
			if (angleError <= ANGULAR_REST_ANGLE_EPSILON) {
				body.sleepThreshold = DEFAULT_SLEEP_THRESHOLD
			} else {
				body.sleepThreshold = Infinity
				if (body.isSleeping) Matter.Sleeping.set(body, false)
			}
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
		this.#gateSleepingByAlignment()
		this.#applyAngularRestoringTorque()
		for (const id of this.#inputVolume.releaseExitedWords()) {
			this.#applyWordMask(id)
		}
		this.#spacingModel.applyForces()
	}

	#handleTick = () => {
		this.onTick?.(this.#runner.frameDelta)
	}
}
