/**
 * The four collision categories and their masks for the word cloud's bodies.
 *
 * These live in one module because the masks are interdependent (each
 * references the others) and shared across the element (word / frame / input
 * bodies) and {@link ./spacing-model.ts} (the proximity sensors).
 */

export const WORD_COLLISION_CATEGORY = 0x0001
export const INPUT_VOLUME_COLLISION_CATEGORY = 0x0002
export const SENSOR_COLLISION_CATEGORY = 0x0004
export const FRAME_COLLISION_CATEGORY = 0x0008

// Real words resolve collisions against each other, the frame, and the input
// volume, but never against the proximity sensors (those only feed repulsion).
export const DEFAULT_WORD_COLLISION_MASK =
	WORD_COLLISION_CATEGORY |
	FRAME_COLLISION_CATEGORY |
	INPUT_VOLUME_COLLISION_CATEGORY
// Sensors detect other sensors, the frame, and the input volume, but never the
// real word bodies (so the only pairs they form involve at least one sensor).
export const SENSOR_COLLISION_MASK =
	SENSOR_COLLISION_CATEGORY |
	FRAME_COLLISION_CATEGORY |
	INPUT_VOLUME_COLLISION_CATEGORY
// The frame and input volume are collided by real words and detected by sensors.
export const FRAME_COLLISION_MASK =
	WORD_COLLISION_CATEGORY | SENSOR_COLLISION_CATEGORY
export const INPUT_VOLUME_COLLISION_MASK =
	WORD_COLLISION_CATEGORY | SENSOR_COLLISION_CATEGORY

/** The state that decides what a word collides with. */
export interface WordCollisionState {
	/** The word is being dragged: its rotation is frozen and it collides with nothing. */
	dragLocked: boolean
	/** The word is still in input grace: it ignores the input volume until it leaves once. */
	ignoresInput: boolean
}

/**
 * The collision mask for a word in the given state. The single rule for which
 * categories a word resolves against, derived purely from its state so the
 * precedence is one truth table rather than scattered imperative updates.
 *
 * Drag-lock wins: a locked word collides with nothing. Otherwise it resolves the
 * full default set, minus the input volume while it is still in input grace.
 */
export function wordCollisionMask({
	dragLocked,
	ignoresInput,
}: WordCollisionState): number {
	if (dragLocked) return 0
	return ignoresInput
		? DEFAULT_WORD_COLLISION_MASK & ~INPUT_VOLUME_COLLISION_CATEGORY
		: DEFAULT_WORD_COLLISION_MASK
}
