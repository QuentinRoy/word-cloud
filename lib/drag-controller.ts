interface Point {
	x: number
	y: number
}

interface PointerSample {
	x: number
	y: number
	t: number
}

const VELOCITY_SAMPLE_MS = 50

export interface DragControllerOptions<W> {
	resolveWord(clientX: number, clientY: number): W | null
	toContainerPoint(clientX: number, clientY: number): Point
	onGrab(word: W, point: Point): void
	onMove(word: W, point: Point): void
	onRelease(word: W, velocity: Point): void
}

interface DragState<W> {
	word: W
	pointerId: number
}

/**
 * Recognises a single-pointer drag gesture on a container element and drives
 * it through grab/move/release callbacks. Knows nothing of the simulation or
 * Matter — it is wired to the sim through the port callbacks.
 *
 * When `enabled` is set to `false` mid-drag, the active gesture is cancelled
 * (onRelease fires with zero velocity) and pointer capture is released.
 */
export class DragController<W> {
	#container: HTMLElement
	#options: DragControllerOptions<W>
	#drag: DragState<W> | null = null
	#samples: PointerSample[] = []
	#enabled = false

	constructor(container: HTMLElement, options: DragControllerOptions<W>) {
		this.#container = container
		this.#options = options
		container.addEventListener("pointerdown", this.#handlePointerDown)
	}

	get enabled(): boolean {
		return this.#enabled
	}

	set enabled(value: boolean) {
		if (this.#enabled === value) return
		this.#enabled = value
		if (!value) this.#cancel()
	}

	#handlePointerDown = (event: PointerEvent) => {
		if (!this.#enabled || this.#drag != null || event.button !== 0) return
		const word = this.#options.resolveWord(event.clientX, event.clientY)
		if (word == null) return
		event.preventDefault()
		const point = this.#options.toContainerPoint(event.clientX, event.clientY)
		this.#drag = { word, pointerId: event.pointerId }
		this.#samples = [{ x: point.x, y: point.y, t: event.timeStamp }]
		try {
			this.#container.setPointerCapture(event.pointerId)
		} catch {
			// Synthetic events in tests won't have a real active pointer.
		}
		this.#container.addEventListener("pointermove", this.#handlePointerMove)
		this.#container.addEventListener("pointerup", this.#handlePointerUp)
		this.#container.addEventListener("pointercancel", this.#handlePointerCancel)
		this.#options.onGrab(word, point)
	}

	#handlePointerMove = (event: PointerEvent) => {
		const drag = this.#drag
		if (drag == null || event.pointerId !== drag.pointerId) return
		const point = this.#options.toContainerPoint(event.clientX, event.clientY)
		this.#pushSample({ x: point.x, y: point.y, t: event.timeStamp })
		this.#options.onMove(drag.word, point)
	}

	#handlePointerUp = (event: PointerEvent) => {
		const drag = this.#drag
		if (drag == null || event.pointerId !== drag.pointerId) return
		const point = this.#options.toContainerPoint(event.clientX, event.clientY)
		this.#pushSample({ x: point.x, y: point.y, t: event.timeStamp })
		const velocity = this.#estimateVelocity()
		this.#clearDrag(drag.pointerId)
		this.#options.onRelease(drag.word, velocity)
	}

	#handlePointerCancel = (event: PointerEvent) => {
		if (this.#drag == null || event.pointerId !== this.#drag.pointerId) return
		this.#cancel()
	}

	#pushSample(sample: PointerSample) {
		this.#samples.push(sample)
		const cutoff = sample.t - VELOCITY_SAMPLE_MS
		while (this.#samples.length > 1 && this.#samples[0].t < cutoff) {
			this.#samples.shift()
		}
	}

	#estimateVelocity(): Point {
		const samples = this.#samples
		if (samples.length < 2) return { x: 0, y: 0 }
		const last = samples[samples.length - 1]
		const first = samples[0]
		const dt = last.t - first.t
		if (dt <= 0) return { x: 0, y: 0 }
		return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt }
	}

	#cancel() {
		const drag = this.#drag
		if (drag == null) return
		this.#clearDrag(drag.pointerId)
		this.#options.onRelease(drag.word, { x: 0, y: 0 })
	}

	#clearDrag(pointerId: number) {
		this.#drag = null
		this.#samples = []
		try {
			this.#container.releasePointerCapture(pointerId)
		} catch {
			// Already released (pointerup/pointercancel auto-releases) or synthetic.
		}
		this.#container.removeEventListener("pointermove", this.#handlePointerMove)
		this.#container.removeEventListener("pointerup", this.#handlePointerUp)
		this.#container.removeEventListener(
			"pointercancel",
			this.#handlePointerCancel,
		)
	}
}
