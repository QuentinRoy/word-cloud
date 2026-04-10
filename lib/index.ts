export {
	PhysicsPauseEvent,
	WordActionChangeEvent,
	WordAddEvent,
	WordChangeEvent,
	WordCheckEvent,
	WordDeleteEvent,
	WordInputToggleEvent,
} from "./events.ts"
export {
	HTMLWordCloudElement,
	type WordAction as WordCloudWordAction,
} from "./word-cloud-element.ts"
export { type WordData, WordHandle } from "./word-handle.ts"
export const version = import.meta.env.VITE_LIB_VERSION
