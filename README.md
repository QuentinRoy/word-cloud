# word-cloud

Interactive word cloud custom element powered by Matter.js. Check out the [demo](https://quentinroy.github.io/word-cloud/)!

## Library

This package exports the `HTMLWordCloudElement` class, the public event
classes, and the `WordHandle` / `WordData` / `WordCloudWordAction` types. It does not auto-register a custom element tag for you.

## Installation

```sh
npm install @quentinroy/word-cloud
```

## Register the element

Consumers are expected to register their own custom element tag:

```ts
import { HTMLWordCloudElement } from "@quentinroy/word-cloud"

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

<x-word-cloud word-action="drag" has-input></x-word-cloud>
```

```ts
import { HTMLWordCloudElement } from "@quentinroy/word-cloud"

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

## Interaction Settings

The element uses two independent attributes:

- `word-action`: controls how words react to user interaction.
- `has-input`: boolean, controls whether the built-in input form is shown and active.

Supported `word-action` values:

- `none`: default, words are passive.
- `drag`: words can be dragged.
- `check`: clicking a word toggles its checked state.
- `delete`: clicking a word removes it.

Set `has-input` to show the built-in input form:

```html
<x-word-cloud word-action="check" has-input></x-word-cloud>
```

```ts
wordCloud.wordAction = "delete"
wordCloud.hasInput = true
```

## Public API

### `addWord(options)` → `WordHandle`

Adds a word to the cloud and returns a live [`WordHandle`](#wordhandle) handle.

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

Adding a word also fires `word-add` with the created `WordHandle`.

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

### `getWords()` → `Iterable<WordHandle>`

Returns live [`WordHandle`](#wordhandle) handles for all words currently in the
cloud. Each property read reflects the real-time state (position, angle,
checked). Useful for persistence:

```ts
const snapshot = Array.from(wordCloud.getWords())
```

### `setWords(words)`

Clears the cloud and populates it from an array of [`WordData`](#worddata)
objects. Because `WordHandle` is structurally compatible with `WordData`, you can
pass the output of `getWords()` directly:

```ts
wordCloud.setWords([
  { word: "Saved", x: 120, y: 100, angle: 0, checked: false },
  { word: "State", x: 280, y: 220, angle: 0.2, checked: true },
])

// Restore a previously obtained snapshot:
wordCloud.setWords(Array.from(wordCloud.getWords()))
```

## WordHandle

A `WordHandle` is a live handle to a word in the cloud, returned by `addWord`
and `getWords`. Its properties are always up to date — they read directly from
the underlying physics body and DOM element.

| Property / method | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `entry.word`      | The displayed text, readable and writable.               |
| `entry.x`         | Current horizontal center position in pixels.            |
| `entry.y`         | Current vertical center position in pixels.              |
| `entry.angle`     | Current rotation in radians.                             |
| `entry.checked`   | Checked state — readable and writable.                   |
| `entry.remove()`  | Removes the word from the cloud and fires `word-delete`. |

```ts
const entry = wordCloud.addWord({ word: "Hello", x: 100, y: 100 })

// Read live state:
console.log(entry.x, entry.y, entry.checked)

// Rename the word (fires word-value-change):
entry.word = "Hello again"

// Toggle checked programmatically (fires word-checked-change):
entry.checked = !entry.checked

// Remove it:
entry.remove()
```

## WordData

Plain serializable object describing a word. Accepted by `addWord` and
`setWords`. `WordHandle` is structurally compatible with `WordData`, so handles
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

- **`word-add`** — fired when a word is added to the cloud, including through
  `addWord()`, `setWords()`, or the built-in input form.
- **`word-value-change`** — fired when a word's text changes, including
  programmatic assignment to `handle.word`.
- **`word-checked-change`** — fired when a word's checked state changes (user
  interaction while `wordAction` is `check`, or programmatic assignment to
  `handle.checked`).
- **`word-delete`** — fired when the user deletes a word while `wordAction` is
  `delete`,
  just before the word is removed.
- **`word-action-change`** — fired when the element `wordAction` changes.
  Includes `wordAction` and `oldWordAction`.
- **`has-input-change`** — fired when the element `hasInput` setting changes.
  Includes `hasInput` and `oldHasInput`.

The word-specific events carry a `handle` property: a live
[`WordHandle`](#wordhandle) for the affected word. The setting-change events
instead carry their old and new values.

Listen using the string literal or the static `.type` property of the event classes:

```ts
wordCloud.addEventListener("word-add", (event) => {
  console.log(`added word: "${event.handle.word}" at ${event.handle.x}, ${event.handle.y}`)
})

wordCloud.addEventListener("word-value-change", (event) => {
  console.log(`renamed word: "${event.oldValue}" -> "${event.value}"`)
})

wordCloud.addEventListener("word-checked-change", (event) => {
  console.log(`"${event.handle.word}" checked: ${event.checked}`)
})

wordCloud.addEventListener("word-delete", (event) => {
  console.log(`deleted word: "${event.handle.word}"`)
})

wordCloud.addEventListener("word-action-change", (event) => {
  console.log(`word action: ${event.oldWordAction} -> ${event.wordAction}`)
})

wordCloud.addEventListener("has-input-change", (event) => {
  console.log(`has-input: ${event.oldHasInput} -> ${event.hasInput}`)
})
```

## Styling

The component exposes CSS custom properties on the host. Example:

```css
x-word-cloud {
  --font-family: "Georgia", serif;
  --font-size: 1.25rem;
  --input-padding-y: 0.4rem;
  --input-padding-x: 1rem;
  --word-padding-y: 0.35rem;
  --word-padding-x: 0.9rem;
  --line-width: 3px;
  --word-text-color: #1f2937;
  --word-background-color: #f3f4f6;
  --word-border-color: #d1d5db;
  --word-checked-text-color: #6b7280;
  --word-checked-background-color: #e5e7eb;
  --word-delete-hover-text-color: #991b1b;
  --word-delete-hover-background-color: #fee2e2;
  --word-dragged-background-color: #dbeafe;
  --word-dragged-border-color: #bfdbfe;
  --input-background-color: #ffffff;
  --input-text-color: #111827;
  --input-border-color: #9ca3af;
  --input-focus-text-color: #0f172a;
  --input-focus-border-color: #2563eb;
  --input-focus-background-color: #eff6ff;
  --input-focus-shadow-color: #93c5fd;
  --word-focus-outline-color: #2563eb;
  --word-fade-in-duration: 0.5s;
  width: 100%;
  height: 70vh;
}
```

Supported variables:

| Variable                               | Default                           | Used for                                                         |
| -------------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| `--space-s`                            | `0.5rem`                          | Shared compact spacing token used by the default padding vars.   |
| `--space-m`                            | `1rem`                            | Shared roomy spacing token used by the default padding vars.     |
| `--input-padding-y`                    | `var(--space-s)`                  | Input vertical padding.                                          |
| `--input-padding-x`                    | `var(--space-m)`                  | Input horizontal padding.                                        |
| `--word-padding-y`                     | `var(--space-s)`                  | Word vertical padding.                                           |
| `--word-padding-x`                     | `var(--space-m)`                  | Word horizontal padding.                                         |
| `--line-width`                         | `2px`                             | Border width and strike-through thickness.                       |
| `--font-size`                          | `1.5rem`                          | Input and word font size.                                        |
| `--font-family`                        | `Arial`                           | Input and word font family.                                      |
| `--input-text-color`                   | `black`                           | Input text color.                                                |
| `--input-background-color`             | `hwb(0 93% 7%)`                   | Input background while the built-in input is enabled.            |
| `--input-border-color`                 | `hwb(0 27% 73%)`                  | Input border color.                                              |
| `--input-focus-text-color`             | `hwb(212 2% 88%)`                 | Input text color while focused.                                  |
| `--input-focus-border-color`           | `hwb(212 16% 22%)`                | Input border and default word focus outline color while focused. |
| `--input-focus-shadow-color`           | `hwb(212 76% 0%)`                 | Input focus drop-shadow color.                                   |
| `--input-focus-background-color`       | `hwb(212 95% 0%)`                 | Input background while focused.                                  |
| `--word-focus-outline-color`           | `var(--input-focus-border-color)` | Keyboard focus outline for words.                                |
| `--word-text-color`                    | `hwb(276 2% 80%)`                 | Default word text color.                                         |
| `--word-background-color`              | `hwb(276 96% 0%)`                 | Default word background.                                         |
| `--word-border-color`                  | `var(--word-background-color)`    | Default word border color.                                       |
| `--word-delete-hover-text-color`       | `hwb(357 45% 11%)`                | Word text color on delete hover.                                 |
| `--word-delete-hover-background-color` | `hwb(351 99% 0%)`                 | Word background and border on delete hover.                      |
| `--word-checked-text-color`            | `hwb(276 52% 40%)`                | Checked word text color.                                         |
| `--word-checked-background-color`      | `hwb(276 98% 0%)`                 | Checked word background and border color.                        |
| `--word-dragged-background-color`      | `hwb(210 90% 0%)`                 | Dragged word background.                                         |
| `--word-dragged-border-color`          | `hwb(210 85% 0%)`                 | Dragged word border.                                             |
| `--word-fade-in-duration`              | `1s`                              | Entry animation duration for newly created words.                |

## Notes

- The library exports constructors and types, not a pre-registered tag name.
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
