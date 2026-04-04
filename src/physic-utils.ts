import { Body, type Bounds } from "matter-js"

type Vector2 = { x: number; y: number }

type RectangleEdges = {
	left: number
	right: number
	top: number
	bottom: number
}

function getAabbGap({
	boundsA,
	boundsB,
}: {
	boundsA: Bounds
	boundsB: Bounds
}) {
	const gapX =
		-Math.min(boundsA.max.x, boundsB.max.x) +
		Math.max(boundsA.min.x, boundsB.min.x)
	const gapY =
		-Math.min(boundsA.max.y, boundsB.max.y) +
		Math.max(boundsA.min.y, boundsB.min.y)

	if (gapX > 0 && gapY > 0) {
		return Math.sqrt(gapX * gapX + gapY * gapY)
	}
	if (gapX > 0) return gapX
	if (gapY > 0) return gapY
	return Math.max(gapX, gapY)
}

function getRepulsionStrength({
	margin,
	gap,
}: {
	margin: number
	gap: number
}) {
	if (gap >= margin) return null
	return Math.min(1, (margin - gap) / margin)
}

export function applyMutualRepulsionForce({
	bodyA,
	bodyB,
	margin,
	repulsionForce,
}: {
	bodyA: Body
	bodyB: Body
	margin: number
	repulsionForce: number
}) {
	const gap = getAabbGap({ boundsA: bodyA.bounds, boundsB: bodyB.bounds })
	const strength = getRepulsionStrength({ margin, gap })
	if (strength == null) return

	const dx = bodyB.position.x - bodyA.position.x
	const dy = bodyB.position.y - bodyA.position.y
	const dist = Math.sqrt(dx * dx + dy * dy)
	if (dist === 0) return

	const forceMagnitude = strength * repulsionForce
	const nx = (dx / dist) * forceMagnitude
	const ny = (dy / dist) * forceMagnitude

	Body.applyForce(bodyA, bodyA.position, { x: -nx, y: -ny })
	Body.applyForce(bodyB, bodyB.position, { x: nx, y: ny })
}

export function applyRepulsionForceFromPoint({
	body,
	sourceBounds,
	sourcePosition,
	margin,
	repulsionForce,
}: {
	body: Body
	sourceBounds: Bounds
	sourcePosition: Vector2
	margin: number
	repulsionForce: number
}) {
	const gap = getAabbGap({ boundsA: body.bounds, boundsB: sourceBounds })
	const strength = getRepulsionStrength({ margin, gap })
	if (strength == null) return

	const dx = body.position.x - sourcePosition.x
	const dy = body.position.y - sourcePosition.y
	const dist = Math.sqrt(dx * dx + dy * dy)
	if (dist === 0) return

	const forceMagnitude = strength * repulsionForce
	Body.applyForce(body, body.position, {
		x: (dx / dist) * forceMagnitude,
		y: (dy / dist) * forceMagnitude,
	})
}

export function applyEdgeRepulsionForces({
	body,
	edges,
	margin,
	repulsionForce,
}: {
	body: Body
	edges: RectangleEdges
	margin: number
	repulsionForce: number
}) {
	const bounds = body.bounds

	const gapLeft = bounds.min.x - edges.left
	if (gapLeft < margin) {
		const strength = Math.min(1, (margin - gapLeft) / margin)
		Body.applyForce(body, body.position, { x: strength * repulsionForce, y: 0 })
	}

	const gapRight = edges.right - bounds.max.x
	if (gapRight < margin) {
		const strength = Math.min(1, (margin - gapRight) / margin)
		Body.applyForce(body, body.position, {
			x: -strength * repulsionForce,
			y: 0,
		})
	}

	const gapTop = bounds.min.y - edges.top
	if (gapTop < margin) {
		const strength = Math.min(1, (margin - gapTop) / margin)
		Body.applyForce(body, body.position, { x: 0, y: strength * repulsionForce })
	}

	const gapBottom = edges.bottom - bounds.max.y
	if (gapBottom < margin) {
		const strength = Math.min(1, (margin - gapBottom) / margin)
		Body.applyForce(body, body.position, {
			x: 0,
			y: -strength * repulsionForce,
		})
	}
}
