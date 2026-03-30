/**
 * A serializable snapshot of a word rendered in the cloud, as returned by
 * `getWords()`.
 */
export interface WordEntry {
	/** The unique identifier assigned by the word cloud. */
	id: number
	/** The displayed word content. */
	word: string
	/** The horizontal position of the word center in pixels. */
	x: number
	/** The vertical position of the word center in pixels. */
	y: number
	/** The current body rotation in radians. */
	angle: number
	/** Whether the word is currently marked as checked. */
	checked: boolean
}
