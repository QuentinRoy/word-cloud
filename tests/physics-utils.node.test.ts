import { Bodies, Body } from "matter-js"
import { describe, expect, it } from "vitest"
import {
	applyAngularRestoringTorque,
	getRepulsionStrength,
} from "../lib/physics-utils.ts"

describe("getRepulsionStrength", () => {
	it("returns null when the margin is not positive", () => {
		expect(getRepulsionStrength({ margin: 0, gap: -5 })).toBeNull()
		expect(getRepulsionStrength({ margin: -3, gap: -5 })).toBeNull()
	})

	it("returns null when the gap is at or beyond the margin", () => {
		expect(getRepulsionStrength({ margin: 10, gap: 10 })).toBeNull()
		expect(getRepulsionStrength({ margin: 10, gap: 15 })).toBeNull()
	})

	it("ramps linearly from 0 at the margin to 1 at contact", () => {
		expect(getRepulsionStrength({ margin: 10, gap: 5 })).toBeCloseTo(0.5)
		expect(getRepulsionStrength({ margin: 10, gap: 0 })).toBe(1)
		expect(getRepulsionStrength({ margin: 8, gap: 6 })).toBeCloseTo(0.25)
	})

	it("approaches 0 just inside the margin", () => {
		const strength = getRepulsionStrength({ margin: 10, gap: 9.999 })
		expect(strength).toBeGreaterThan(0)
		expect(strength).toBeCloseTo(0, 3)
	})

	it("clamps to 1 when the bodies overlap (negative gap)", () => {
		expect(getRepulsionStrength({ margin: 10, gap: -20 })).toBe(1)
		expect(getRepulsionStrength({ margin: 10, gap: -0.0001 })).toBe(1)
	})

	it("stays within (0, 1] and never increases as the gap grows", () => {
		const margin = 12
		let previous = Number.POSITIVE_INFINITY
		for (let gap = -5; gap < margin; gap += 0.5) {
			const strength = getRepulsionStrength({ margin, gap })
			expect(strength).not.toBeNull()
			const value = strength as number
			expect(value).toBeGreaterThan(0)
			expect(value).toBeLessThanOrEqual(1)
			expect(value).toBeLessThanOrEqual(previous)
			previous = value
		}
	})
})

const TORQUE_OPTIONS = {
	restAngle: 0,
	restAngleEpsilon: 0.001,
	springTorqueStiffness: 0.4,
	dampingCoefficient: 0.2,
	springWidthReference: 150,
}

const BODY_SIZE = { width: 100, height: 40 }

function makeBody({ angle = 0, isStatic = false } = {}) {
	return Bodies.rectangle(0, 0, BODY_SIZE.width, BODY_SIZE.height, {
		angle,
		isStatic,
	})
}

/** The torque the helper intends to apply, per its documented spring-damper law. */
function expectedTorque({
	angleError,
	angularVelocity = 0,
	width = BODY_SIZE.width,
}: {
	angleError: number
	angularVelocity?: number
	width?: number
}) {
	return (
		(-angleError * TORQUE_OPTIONS.springTorqueStiffness -
			angularVelocity * TORQUE_OPTIONS.dampingCoefficient) *
		(width / TORQUE_OPTIONS.springWidthReference) ** 2
	)
}

describe("applyAngularRestoringTorque", () => {
	it("applies a restoring torque opposing a positive angle error", () => {
		const body = makeBody({ angle: 0.5 })
		applyAngularRestoringTorque({
			body,
			bodySize: BODY_SIZE,
			...TORQUE_OPTIONS,
		})
		expect(body.torque).toBeLessThan(0)
		// Pure torque: the two opposing forces cancel, leaving no net linear force.
		expect(body.force.x).toBeCloseTo(0)
		expect(body.force.y).toBeCloseTo(0)
	})

	it("applies a restoring torque opposing a negative angle error", () => {
		const body = makeBody({ angle: -0.5 })
		applyAngularRestoringTorque({
			body,
			bodySize: BODY_SIZE,
			...TORQUE_OPTIONS,
		})
		expect(body.torque).toBeGreaterThan(0)
	})

	it("matches the spring torque when the angular velocity is zero", () => {
		const angle = 0.3
		const body = makeBody({ angle })
		applyAngularRestoringTorque({
			body,
			bodySize: BODY_SIZE,
			...TORQUE_OPTIONS,
		})
		expect(body.torque).toBeCloseTo(expectedTorque({ angleError: angle }), 6)
	})

	it("adds a damping term proportional to angular velocity", () => {
		const angle = 0.5
		const body = makeBody({ angle })
		Body.setAngularVelocity(body, 2)
		applyAngularRestoringTorque({
			body,
			bodySize: BODY_SIZE,
			...TORQUE_OPTIONS,
		})
		expect(body.torque).toBeCloseTo(
			expectedTorque({
				angleError: angle,
				angularVelocity: body.angularVelocity,
			}),
			6,
		)
	})

	it("damps harder the faster the body spins away from rest", () => {
		const angle = 0.5
		const torqueAt = (angularVelocity: number) => {
			const body = makeBody({ angle })
			Body.setAngularVelocity(body, angularVelocity)
			applyAngularRestoringTorque({
				body,
				bodySize: BODY_SIZE,
				...TORQUE_OPTIONS,
			})
			return body.torque
		}
		// Spinning further into the error (positive) drives the torque more
		// negative; spinning back toward rest can flip it positive (anti-overshoot).
		expect(torqueAt(2)).toBeLessThan(torqueAt(0))
		expect(torqueAt(0)).toBeLessThan(torqueAt(-2))
		expect(torqueAt(-2)).toBeGreaterThan(0)
	})

	it("does nothing inside the rest-angle dead zone", () => {
		const body = makeBody({ angle: 0.0005 })
		applyAngularRestoringTorque({
			body,
			bodySize: BODY_SIZE,
			...TORQUE_OPTIONS,
		})
		expect(body.torque).toBe(0)
	})

	it("does not damp inside the dead zone even when spinning", () => {
		const body = makeBody({ angle: 0.0005 })
		Body.setAngularVelocity(body, 5)
		applyAngularRestoringTorque({
			body,
			bodySize: BODY_SIZE,
			...TORQUE_OPTIONS,
		})
		expect(body.torque).toBe(0)
	})

	it("restores the short way around when rotated just past π", () => {
		const body = makeBody({ angle: Math.PI + 0.1 })
		applyAngularRestoringTorque({
			body,
			bodySize: BODY_SIZE,
			...TORQUE_OPTIONS,
		})
		// normalizeAngle maps π+0.1 to ≈ -π+0.1, a small negative error, so the
		// torque is positive: it nudges the body on toward 2π ≡ 0, not back.
		expect(body.torque).toBeGreaterThan(0)
	})

	it("restores toward a non-zero rest angle", () => {
		const restAngle = 0.2
		const atRest = makeBody({ angle: restAngle })
		applyAngularRestoringTorque({
			body: atRest,
			bodySize: BODY_SIZE,
			...TORQUE_OPTIONS,
			restAngle,
		})
		expect(atRest.torque).toBe(0)

		const offRest = makeBody({ angle: 0.6 })
		applyAngularRestoringTorque({
			body: offRest,
			bodySize: BODY_SIZE,
			...TORQUE_OPTIONS,
			restAngle,
		})
		// 0.6 sits above the 0.2 rest angle, so the torque pulls back (negative).
		expect(offRest.torque).toBeLessThan(0)
		expect(offRest.torque).toBeCloseTo(
			expectedTorque({ angleError: 0.6 - restAngle }),
			6,
		)
	})

	it("scales the torque with the square of the width", () => {
		const angle = 0.4
		const narrow = makeBody({ angle })
		applyAngularRestoringTorque({
			body: narrow,
			bodySize: { width: 100, height: 40 },
			...TORQUE_OPTIONS,
		})
		const wide = makeBody({ angle })
		applyAngularRestoringTorque({
			body: wide,
			bodySize: { width: 200, height: 40 },
			...TORQUE_OPTIONS,
		})
		// (200/ref)² / (100/ref)² = 4
		expect(Math.abs(wide.torque)).toBeCloseTo(Math.abs(narrow.torque) * 4, 6)
	})

	it("applies no torque when the force arm collapses to zero", () => {
		// A zero-height body has forceArm = min(width, 0) * 0.25 = 0; the helper
		// bails before applying force even though the spring torque is non-zero.
		const body = makeBody({ angle: 0.5 })
		applyAngularRestoringTorque({
			body,
			bodySize: { width: 100, height: 0 },
			...TORQUE_OPTIONS,
		})
		expect(body.torque).toBe(0)
	})

	it("ignores static bodies", () => {
		const body = makeBody({ angle: 0.5, isStatic: true })
		applyAngularRestoringTorque({
			body,
			bodySize: BODY_SIZE,
			...TORQUE_OPTIONS,
		})
		expect(body.torque).toBe(0)
	})

	it("ignores sleeping bodies", () => {
		const body = makeBody({ angle: 0.5 })
		body.isSleeping = true
		applyAngularRestoringTorque({
			body,
			bodySize: BODY_SIZE,
			...TORQUE_OPTIONS,
		})
		expect(body.torque).toBe(0)
	})
})
