# word-cloud

Interactive word cloud custom element powered by Matter.js. Check out the [demo](https://quentinroy.github.io/word-cloud/)!

## Library

This package exports the `HTMLWordCloudElement` class, event classes, and the
`WordEntry` / `WordData` types. It does not auto-register a custom element tag
for you.

## Installation

```sh
npm install word-cloud
```

## Register the element

Consumers are expected to register their own custom element tag:

```ts
import { HTMLWordCloudElement } from "word-cloud"

customElements.define("x-word-cloud", HTMLWordCloudElement)
```

## Basic usage

The component fills the size of its host element, so give it an explicit width and height.

```html
<style>
  x-word-cloud {
    display: block;
    width: 100%;
    height: 70vh;
  }
</style>

<x-word-cloud mode="input"></x-word-cloud>
```

```ts
import { HTMLWordCloudElement } from "word-cloud"

customElements.define("x-word-cloud", HTMLWordCloudElement)

const wordCloud = document.querySelector("x-word-cloud")

if (!(wordCloud instanceof HTMLWordCloudElement)) {
  throw new Error("x-word-cloud not found")
}

wordCloud.setWords([
  { word: "TypeScript", x: 160, y: 120 },
  { word: "Web Components", x: 320, y: 180, checked: true },
  { word: "Matter.js", x: 240, y: 260, angle: 0.15 },
])
```

## Modes

The `mode` attribute controls how the cloud behaves.

- `input`: shows the input field and enables dragging.
- `mark`: clicking a word toggles its checked state.
- `delete`: clicking a word removes it.

You can switch modes either declaratively or imperatively:

```html
<x-word-cloud mode="mark"></x-word-cloud>
```

```ts
wordCloud.mode = "delete"
```

## Public API

### `addWord(options)` → `WordEntry`

Adds a word to the cloud and returns a live [`WordEntry`](#wordentry) handle.

```ts
const entry = wordCloud.addWord({
  word: "Custom Element",
  x: 200,
  y: 150,
  angle: 0,
  checked: false,
  velocity: { x: 10, y: -15 },
  animateEntry: true,
})

// Remove it later (fires word-delete):
entry.remove()
```

Supported options:

- `word`: displayed text.
- `x`: initial horizontal position in pixels.
- `y`: initial vertical position in pixels.
- `angle` _(optional)_: initial rotation in radians. Defaults to `0`.
- `checked` _(optional)_: initial checked state. Defaults to `false`.
- `velocity` _(optional)_: initial physics velocity `{ x, y }`.
- `animateEntry` _(optional)_: play a fade-in entry animation. Defaults to `false`.

### `clear()`

Removes all words from the cloud.

```ts
wordCloud.clear()
```

### `getWords()` → `Iterable<WordEntry>`

Returns live [`WordEntry`](#wordentry) handles for all words currently in the
cloud. Each property read reflects the real-time state (position, angle,
checked). Useful for persistence:

```ts
const snapshot = Array.from(wordCloud.getWords())
```

### `setWords(words)`

Clears the cloud and populates it from an array of [`WordData`](#worddata)
objects. Because `WordEntry` is structurally compatible with `WordData`, you can
pass the output of `getWords()` directly:

```ts
wordCloud.setWords([
  { word: "Saved", x: 120, y: 100, angle: 0, checked: false },
  { word: "State", x: 280, y: 220, angle: 0.2, checked: true },
])

// Restore a previously obtained snapshot:
wordCloud.setWords(Array.from(wordCloud.getWords()))
```

## WordEntry

A `WordEntry` is a live handle to a word in the cloud, returned by `addWord`
and `getWords`. Its properties are always up to date — they read directly from
the underlying physics body and DOM element.

| Property / method | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `entry.word`      | The displayed text (read-only).                          |
| `entry.x`         | Current horizontal center position in pixels.            |
| `entry.y`         | Current vertical center position in pixels.              |
| `entry.angle`     | Current rotation in radians.                             |
| `entry.checked`   | Checked state — readable and writable.                   |
| `entry.remove()`  | Removes the word from the cloud and fires `word-delete`. |

```ts
const entry = wordCloud.addWord({ word: "Hello", x: 100, y: 100 })

// Read live state:
console.log(entry.x, entry.y, entry.checked)

// Toggle checked programmatically (fires word-checked-change):
entry.checked = !entry.checked

// Remove it:
entry.remove()
```

## WordData

Plain serializable object describing a word. Accepted by `addWord` and
`setWords`. `WordEntry` is structurally compatible with `WordData`, so entries
obtained from `getWords()` can be passed directly to `setWords()`.

```ts
interface WordData {
  word: string
  x: number
  y: number
  angle?: number
  checked?: boolean
}
```

## Persisting state

```ts
// Save
const saved = Array.from(wordCloud.getWords()).map(({ word, x, y, angle, checked }) => ({
  word, x, y, angle, checked,
}))
localStorage.setItem("words", JSON.stringify(saved))

// Restore
const saved = JSON.parse(localStorage.getItem("words") ?? "[]")
wordCloud.setWords(saved)
```

## Events

`HTMLWordCloudElement` dispatches the following bubbling events:

- **`word-checked-change`** — fired when a word's checked state changes (user
  interaction in `mark` mode, or programmatic assignment to `entry.checked`).
- **`word-delete`** — fired when the user deletes a word in `delete` mode,
  just before the word is removed.

Both events extend `WordCloudEvent` and carry an `entry` property — a live
[`WordEntry`](#wordentry) for the affected word.

Listen using the string literal or the static `.type` property:

```ts
import { WordCheckedChangeEvent, WordDeleteEvent } from "word-cloud"

wordCloud.addEventListener(WordCheckedChangeEvent.type, (event) => {
  console.log("new checked state:", event.checked)
  console.log("word:", event.entry.word)
})

wordCloud.addEventListener(WordDeleteEvent.type, (event) => {
  console.log("deleted:", event.entry.word, "at", event.entry.x, event.entry.y)
})
```

## Styling

The component exposes a number of CSS custom properties on the host. Example:

```css
x-word-cloud {
  --font-family: "Georgia", serif;
  --font-size: 1.25rem;
  --word-text-color: #1f2937;
  --word-background-color: #f3f4f6;
  --word-border-color: #d1d5db;
  --input-background-color: #ffffff;
  --input-border-color: #9ca3af;
  --checked-opacity: 0.35;
  width: 100%;
  height: 70vh;
}
```

Useful variables include:

- `--font-family`
- `--font-size`
- `--word-text-color`
- `--word-background-color`
- `--word-border-color`
- `--input-text-color`
- `--input-background-color`
- `--input-border-color`
- `--checked-opacity`

## Notes

- The library exports only the class, not a pre-registered tag name.
- The host element needs a real size; if its height is `0`, nothing useful will render.
- Words are positioned using the host element’s content box, so restoring saved coordinates works best when the element has a stable size.

## Local demo

```sh
pnpm install
pnpm dev
```

The demo lives in `demo/` and is served by `index.html` during local development.

## Build

```sh
pnpm build
```

This produces the publishable library in `dist/`.
