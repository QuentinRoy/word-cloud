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
