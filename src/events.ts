import type { WordEntry } from "./word-entry.ts"

export type { WordEntry }
export class WordCloudEvent extends Event {
	#entry: WordEntry

	constructor(
		{ type, entry }: { type: string; entry: WordEntry },
		init?: EventInit,
	) {
		super(type, { bubbles: true, composed: true, ...init })
		this.#entry = entry
	}

	get entry() {
		return this.#entry
	}
}

export class WordCheckedChangeEvent extends WordCloudEvent {
	static get type() {
		return "word-checked-change" as const
	}

	constructor({ entry }: { entry: WordEntry }) {
		super({ type: WordCheckedChangeEvent.type, entry })
	}

	get checked() {
		return this.entry.checked
	}
}

export class WordDeleteEvent extends WordCloudEvent {
	static get type() {
		return "word-delete" as const
	}

	constructor({ entry }: { entry: WordEntry }) {
		super({ type: WordDeleteEvent.type, entry })
	}
}
