import Matter from "matter-js"
import { normalizeAngle } from "./utils.ts"

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
export function getRepulsionStrength({
	margin,
	gap,
}: {
	margin: number
	gap: number
}) {
	if (margin <= 0 || gap >= margin) return null
	return Math.min(1, (margin - gap) / margin)
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
	body: Matter.Body
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
	const bodyAxis = Matter.Vector.rotate(Matter.Vector.create(1, 0), body.angle)
	const pointA = Matter.Vector.add(
		body.position,
		Matter.Vector.mult(bodyAxis, forceArm),
	)
	const pointB = Matter.Vector.add(
		body.position,
		Matter.Vector.mult(bodyAxis, -forceArm),
	)
	const force = Matter.Vector.mult(Matter.Vector.perp(bodyAxis), forceMagnitude)

	Matter.Body.applyForce(body, pointA, force)
	Matter.Body.applyForce(body, pointB, Matter.Vector.neg(force))
}
