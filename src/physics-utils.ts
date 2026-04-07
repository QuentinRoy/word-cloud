import { Body, Common, Vector } from "matter-js"
import { normalizeAngle } from "./utils.ts"

interface Bounds {
	min: Vector
	max: Vector
}

interface BoundaryPair {
	pointA: Vector
	pointB: Vector
	gap: number
}

/**
 * Build the four world-space corners of a rotated rectangle body.
 *
 * @param body The body whose position and angle are used.
 * @param halfWidth Half the body's width in body-local axes.
 * @param halfHeight Half the body's height in body-local axes.
 * @returns Corners in winding order.
 */
function getBodyRectangleCorners(
	body: Body,
	halfWidth: number,
	halfHeight: number,
): [Vector, Vector, Vector, Vector] {
	const centerX = body.position.x
	const centerY = body.position.y
	const cos = Math.cos(body.angle)
	const sin = Math.sin(body.angle)

	const ux = cos * halfWidth
	const uy = sin * halfWidth
	const vx = -sin * halfHeight
	const vy = cos * halfHeight

	return [
		{ x: centerX - ux - vx, y: centerY - uy - vy },
		{ x: centerX + ux - vx, y: centerY + uy - vy },
		{ x: centerX + ux + vx, y: centerY + uy + vy },
		{ x: centerX - ux + vx, y: centerY - uy + vy },
	]
}

/**
 * Return a lower bound on the distance between two axis-aligned bounds.
 *
 * When this value is already greater than or equal to the repulsion margin, the
 * more expensive polygon-to-polygon search can be skipped safely.
 *
 * @param options.boundsA The first bounds.
 * @param options.boundsB The second bounds.
 * @returns The lower-bound gap between the two bounds.
 */
function getBoundsGap({
	boundsA,
	boundsB,
}: {
	boundsA: Bounds
	boundsB: Bounds
}) {
	const gapX =
		Math.max(boundsA.min.x, boundsB.min.x) -
		Math.min(boundsA.max.x, boundsB.max.x)
	const gapY =
		Math.max(boundsA.min.y, boundsB.min.y) -
		Math.min(boundsA.max.y, boundsB.max.y)

	if (gapX > 0 && gapY > 0) return Math.hypot(gapX, gapY)
	return Math.max(gapX, gapY)
}

/**
 * Project a point onto a segment and return the closest point on that segment.
 *
 * @param options.point The point to project.
 * @param options.segmentStart The start of the segment.
 * @param options.segmentEnd The end of the segment.
 * @returns The closest point on the segment.
 */
function getClosestPointOnSegment({
	point,
	segmentStart,
	segmentEnd,
}: {
	point: Vector
	segmentStart: Vector
	segmentEnd: Vector
}) {
	const segmentX = segmentEnd.x - segmentStart.x
	const segmentY = segmentEnd.y - segmentStart.y
	const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY
	if (segmentLengthSquared === 0) return segmentStart

	const pointOffsetX = point.x - segmentStart.x
	const pointOffsetY = point.y - segmentStart.y
	const projection =
		(pointOffsetX * segmentX + pointOffsetY * segmentY) / segmentLengthSquared
	const t = Common.clamp(projection, 0, 1)

	return { x: segmentStart.x + segmentX * t, y: segmentStart.y + segmentY * t }
}

/**
 * Return the intersection point between two finite segments, if they intersect.
 *
 * @param options.segmentAStart The start of the first segment.
 * @param options.segmentAEnd The end of the first segment.
 * @param options.segmentBStart The start of the second segment.
 * @param options.segmentBEnd The end of the second segment.
 * @returns The intersection point, or null if the segments do not intersect.
 */
function getSegmentIntersectionPoint({
	segmentAStart,
	segmentAEnd,
	segmentBStart,
	segmentBEnd,
}: {
	segmentAStart: Vector
	segmentAEnd: Vector
	segmentBStart: Vector
	segmentBEnd: Vector
}) {
	const segmentAX = segmentAEnd.x - segmentAStart.x
	const segmentAY = segmentAEnd.y - segmentAStart.y
	const segmentBX = segmentBEnd.x - segmentBStart.x
	const segmentBY = segmentBEnd.y - segmentBStart.y
	const denominator = segmentAX * segmentBY - segmentAY * segmentBX
	if (denominator === 0) return null

	const startDeltaX = segmentBStart.x - segmentAStart.x
	const startDeltaY = segmentBStart.y - segmentAStart.y
	const t = (startDeltaX * segmentBY - startDeltaY * segmentBX) / denominator
	const u = (startDeltaX * segmentAY - startDeltaY * segmentAX) / denominator
	if (t < 0 || t > 1 || u < 0 || u > 1) return null

	return {
		x: segmentAStart.x + segmentAX * t,
		y: segmentAStart.y + segmentAY * t,
	}
}

/**
 * Check whether a world-space point is inside a rotated rectangle body.
 *
 * @param options.point The point to test.
 * @param options.body The rectangle body center and angle.
 * @param options.halfWidth Half the rectangle width in body-local axes.
 * @param options.halfHeight Half the rectangle height in body-local axes.
 * @returns True when the point is inside or on the rectangle boundary.
 */
function isPointInsideBodyRectangle({
	point,
	body,
	halfWidth,
	halfHeight,
}: {
	point: Vector
	body: Body
	halfWidth: number
	halfHeight: number
}) {
	const dx = point.x - body.position.x
	const dy = point.y - body.position.y
	const cos = Math.cos(body.angle)
	const sin = Math.sin(body.angle)

	const localX = dx * cos + dy * sin
	const localY = -dx * sin + dy * cos

	return Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight
}

/**
 * Find the closest pair of points on the boundaries of two rectangle bodies.
 *
 * @param options.bodyA The first body.
 * @param options.halfWidthA Half the first body's width in body-local axes.
 * @param options.halfHeightA Half the first body's height in body-local axes.
 * @param options.bodyB The second body.
 * @param options.halfWidthB Half the second body's width in body-local axes.
 * @param options.halfHeightB Half the second body's height in body-local axes.
 * @returns The closest points on each body boundary and the gap between them.
 */
function getClosestBodyBoundaryPoints({
	bodyA,
	halfWidthA,
	halfHeightA,
	bodyB,
	halfWidthB,
	halfHeightB,
}: {
	bodyA: Body
	halfWidthA: number
	halfHeightA: number
	bodyB: Body
	halfWidthB: number
	halfHeightB: number
}): BoundaryPair {
	const verticesA = getBodyRectangleCorners(bodyA, halfWidthA, halfHeightA)
	const verticesB = getBodyRectangleCorners(bodyB, halfWidthB, halfHeightB)
	const hasContainment =
		verticesA.some((pointA) =>
			isPointInsideBodyRectangle({
				point: pointA,
				body: bodyB,
				halfWidth: halfWidthB,
				halfHeight: halfHeightB,
			}),
		) ||
		verticesB.some((pointB) =>
			isPointInsideBodyRectangle({
				point: pointB,
				body: bodyA,
				halfWidth: halfWidthA,
				halfHeight: halfHeightA,
			}),
		)

	for (let i = 0; i < verticesA.length; i++) {
		const edgeAStart = verticesA[i]
		const edgeAEnd = verticesA[(i + 1) % verticesA.length]
		for (let j = 0; j < verticesB.length; j++) {
			const edgeBStart = verticesB[j]
			const edgeBEnd = verticesB[(j + 1) % verticesB.length]
			const intersection = getSegmentIntersectionPoint({
				segmentAStart: edgeAStart,
				segmentAEnd: edgeAEnd,
				segmentBStart: edgeBStart,
				segmentBEnd: edgeBEnd,
			})
			if (intersection != null) {
				return { pointA: intersection, pointB: intersection, gap: 0 }
			}
		}
	}

	let bestPointA = bodyA.position
	let bestPointB = bodyB.position
	let minDistanceSquared = Infinity

	for (let i = 0; i < verticesA.length; i++) {
		const pointA = verticesA[i]
		for (let j = 0; j < verticesB.length; j++) {
			const edgeBStart = verticesB[j]
			const edgeBEnd = verticesB[(j + 1) % verticesB.length]
			const pointB = getClosestPointOnSegment({
				point: pointA,
				segmentStart: edgeBStart,
				segmentEnd: edgeBEnd,
			})
			const dx = pointA.x - pointB.x
			const dy = pointA.y - pointB.y
			const distanceSquared = dx * dx + dy * dy
			if (distanceSquared >= minDistanceSquared) continue
			minDistanceSquared = distanceSquared
			bestPointA = pointA
			bestPointB = pointB
		}
	}

	for (let i = 0; i < verticesB.length; i++) {
		const pointB = verticesB[i]
		for (let j = 0; j < verticesA.length; j++) {
			const edgeAStart = verticesA[j]
			const edgeAEnd = verticesA[(j + 1) % verticesA.length]
			const pointA = getClosestPointOnSegment({
				point: pointB,
				segmentStart: edgeAStart,
				segmentEnd: edgeAEnd,
			})
			const dx = pointA.x - pointB.x
			const dy = pointA.y - pointB.y
			const distanceSquared = dx * dx + dy * dy
			if (distanceSquared >= minDistanceSquared) continue
			minDistanceSquared = distanceSquared
			bestPointA = pointA
			bestPointB = pointB
		}
	}

	return {
		pointA: bestPointA,
		pointB: bestPointB,
		gap: hasContainment ? 0 : Math.sqrt(minDistanceSquared),
	}
}

/**
 * Convert distance to a normalized proximity factor in the [0, 1] range.
 *
 * - 0 means the bodies are at or beyond the repulsion margin, so no force.
 * - 1 means the bodies are touching or overlapping.
 *
 * This is intentionally unitless. It is later multiplied by repulsionForce,
 * which is the maximum force magnitude configured by the caller.
 *
 * @param options.margin The distance within which repulsion becomes active.
 * @param options.gap The current distance between the relevant body boundaries.
 * @returns A unitless factor in the [0, 1] range, or null when repulsion should not apply.
 */
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

/**
 * Turn a normalized repulsion factor into a force vector.
 *
 * repulsionForce is the maximum magnitude that can be applied when the
 * strengthFactor is 1. The actual magnitude is:
 *
 *   strengthFactor * repulsionForce
 *
 * If the closest points coincide exactly, this falls back to the center-to-center
 * direction so overlapping bodies still receive a usable separating force.
 *
 * @param options.sourcePosition The point the force pushes away from.
 * @param options.targetPosition The point the force pushes toward.
 * @param options.fallbackDirection A backup direction to use when both points coincide.
 * @param options.strengthFactor A unitless factor in the [0, 1] range.
 * @param options.repulsionForce The maximum force magnitude when strengthFactor is 1.
 * @returns A force vector, or null when no valid direction can be computed.
 */
function getRepulsionForceVector({
	sourcePosition,
	targetPosition,
	fallbackDirection,
	strengthFactor,
	repulsionForce,
}: {
	sourcePosition: Vector
	targetPosition: Vector
	fallbackDirection?: Vector
	strengthFactor: number
	repulsionForce: number
}) {
	let directionX = targetPosition.x - sourcePosition.x
	let directionY = targetPosition.y - sourcePosition.y
	let distSquared = directionX * directionX + directionY * directionY
	if (distSquared === 0 && fallbackDirection != null) {
		directionX = fallbackDirection.x
		directionY = fallbackDirection.y
		distSquared = directionX * directionX + directionY * directionY
	}
	if (distSquared === 0) return null

	const forceMagnitude = strengthFactor * repulsionForce
	const distance = Math.sqrt(distSquared)
	return {
		x: (directionX / distance) * forceMagnitude,
		y: (directionY / distance) * forceMagnitude,
	}
}

/**
 * Apply a short-range repulsion force between two bodies.
 *
 * The force is computed from the closest points on the current body boundaries,
 * not from bounding boxes and not from body centers. That gives more natural
 * behavior for rotated words and for near-contact interactions.
 *
 * The algorithm is:
 * 1. Find the closest pair of boundary points between bodyA and bodyB.
 * 2. Convert their gap into a normalized strength factor in the [0, 1] range.
 * 3. Scale the caller-provided repulsionForce by that factor.
 * 4. Apply equal and opposite forces at those boundary points.
 *
 * @param options.bodyA The first body.
 * @param options.bodySizeA The width and height of bodyA.
 * @param options.bodyB The second body.
 * @param options.bodySizeB The width and height of bodyB.
 * @param options.margin The distance within which repulsion starts to act.
 * @param options.repulsionForce The maximum force magnitude when the two bodies touch or overlap.
 */
export function applyMutualRepulsionForce({
	bodyA,
	bodySizeA,
	bodyB,
	bodySizeB,
	margin,
	repulsionForce,
}: {
	bodyA: Body
	bodySizeA: { width: number; height: number }
	bodyB: Body
	bodySizeB: { width: number; height: number }
	margin: number
	repulsionForce: number
}) {
	const boundsGap = getBoundsGap({
		boundsA: bodyA.bounds,
		boundsB: bodyB.bounds,
	})
	if (boundsGap >= margin) return

	const { pointA, pointB, gap } = getClosestBodyBoundaryPoints({
		bodyA,
		halfWidthA: bodySizeA.width / 2,
		halfHeightA: bodySizeA.height / 2,
		bodyB,
		halfWidthB: bodySizeB.width / 2,
		halfHeightB: bodySizeB.height / 2,
	})
	const strengthFactor = getRepulsionStrength({ margin, gap })
	if (strengthFactor == null) return

	const force = getRepulsionForceVector({
		sourcePosition: pointA,
		targetPosition: pointB,
		fallbackDirection: {
			x: bodyB.position.x - bodyA.position.x,
			y: bodyB.position.y - bodyA.position.y,
		},
		strengthFactor,
		repulsionForce,
	})
	if (force == null) return

	Body.applyForce(bodyA, pointA, Vector.neg(force))
	Body.applyForce(bodyB, pointB, force)
}

/**
 * Apply a torque that tries to rotate a body back toward a target angle.
 *
 * This behaves like a damped angular spring:
 * - springTorqueStiffness pulls the body back toward restAngle
 * - dampingCoefficient resists current angular velocity
 *
 * The resulting torque is implemented as two equal and opposite forces applied
 * on opposite sides of the body, which is how Matter exposes torque control.
 *
 * @param options.body The body to rotate toward its rest angle.
 * @param options.bodySize The current rendered body dimensions.
 * @param options.restAngle The target angle in radians.
 * @param options.restAngleEpsilon The angular dead zone around the target angle.
 * @param options.springTorqueStiffness The spring coefficient for angular correction.
 * @param options.dampingCoefficient The damping coefficient applied to angular velocity.
 * @param options.springWidthReference The width used to normalize spring response across body sizes.
 */
export function applyAngularRestoringTorque({
	body,
	bodySize,
	restAngle,
	restAngleEpsilon,
	springTorqueStiffness,
	dampingCoefficient,
	springWidthReference,
}: {
	body: Body
	bodySize: { width: number; height: number }
	restAngle: number
	restAngleEpsilon: number
	springTorqueStiffness: number
	dampingCoefficient: number
	springWidthReference: number
}) {
	if (body.isStatic || body.isSleeping) return
	const angleError = normalizeAngle(body.angle) - restAngle
	if (Math.abs(angleError) <= restAngleEpsilon) return

	const torque =
		(-angleError * springTorqueStiffness -
			body.angularVelocity * dampingCoefficient) *
		(bodySize.width / springWidthReference) ** 2
	const forceArm = Math.min(bodySize.width, bodySize.height) * 0.25
	if (forceArm <= 0) return

	const forceMagnitude = torque / (2 * forceArm)
	const bodyAxis = Vector.rotate(Vector.create(1, 0), body.angle)
	const pointA = Vector.add(body.position, Vector.mult(bodyAxis, forceArm))
	const pointB = Vector.add(body.position, Vector.mult(bodyAxis, -forceArm))
	const force = Vector.mult(Vector.perp(bodyAxis), forceMagnitude)

	Body.applyForce(body, pointA, force)
	Body.applyForce(body, pointB, Vector.neg(force))
}
