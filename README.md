# word-cloud

[![Test](https://github.com/QuentinRoy/word-cloud/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/QuentinRoy/word-cloud/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40quentinroy%2Fword-cloud?logo=npm)](https://www.npmjs.com/package/@quentinroy/word-cloud)

Interactive word cloud custom element powered by Matter.js. Check out the [demo](https://quentinroy.github.io/word-cloud/)!

## Library

This package exports the `HTMLWordCloudElement` class, the public event
classes, and the `WordHandle` / `WordData` / `WordCloudWordAction` types. It does not auto-register a custom element tag for you.

## Installation

```sh
# Using npm:
npm install @quentinroy/word-cloud

# Using pnpm:
pnpm install @quentinroy/word-cloud

# Using yarn:
yarn add @quentinroy/word-cloud

# Using deno:
deno add npm:@quentinroy/word-cloud

# Using bun:
bun add @quentinroy/word-cloud
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

<x-word-cloud word-action="drag" word-input></x-word-cloud>
```

```ts
import { HTMLWordCloudElement } from "@quentinroy/word-cloud"

customElements.define("x-word-cloud", HTMLWordCloudElement)

const wordCloud = document.querySelector("x-word-cloud")

if (!(wordCloud instanceof HTMLWordCloudElement)) {
  throw new Error("x-word-cloud not found")
}

wordCloud.add([
  { word: "TypeScript", x: 160, y: 120 },
  { word: "Web Components", x: 320, y: 180, checked: true },
  { word: "Matter.js", x: 240, y: 260, angle: 0.15 },
])
```

## Interaction Settings

The element uses four independent attributes:

- `word-action`: controls how words react to user interaction.
- `word-input`: boolean, controls whether the built-in input form is shown and active.
- `physics-paused`: boolean, pauses the physics runner while leaving the rendered state intact. Note that while other functions will continue to work, dragging and velocity changes won't have any effect while physics is paused.
- `show-framerate`: boolean, controls whether the framerate display is shown.



Supported `word-action` values:

- `none`: default, words are passive.
- `drag`: words can be dragged.
- `check`: clicking a word toggles its checked state.
- `delete`: clicking a word removes it.

Set `word-input` to show the built-in input form:

```html
<x-word-cloud word-action="check" word-input></x-word-cloud>
```


Each of these can also be read or set via the corresponding property on the element instance. Instance properties use camelCase instead of kebab-case. For example, the above configuration can be achieved with:

```ts
wordCloud.wordAction = "check"
wordCloud.wordInput = true
wordCloud.physicsPaused = false
wordCloud.showFramerate = false
```

## Public API

### `add(options, defaults?)` → `WordHandle | WordHandle[]`

Adds one or more words to the cloud. Pass a single options object to get back a
single [`WordHandle`](#wordhandle), or an iterable of options objects to get back
an array of handles.


The optional second argument (`defaults`) provides default values that are merged into each word before creation (except `word`, which must always be specified per word).
Any required field (except `word`) becomes optional in each word if provided in `defaults`.
Individual word options always override defaults.

```ts
// Single word:
const entry = wordCloud.add({
  word: "Custom Element",
  x: 200,
  y: 150,
  angle: 0,
  checked: false,
  velocity: { x: 10, y: -15 },
  entryAnimation: "fade",
})

// Remove it later (fires word-delete):
entry.remove()

// Multiple words at once (any iterable works):
const [a, b] = wordCloud.add([
  { word: "Hello", x: 100, y: 100 },
  { word: "World", x: 200, y: 200 },
])

// Restore without animation (using defaults):
const savedWords: WordData[] = [...]
wordCloud.add(savedWords, { entryAnimation: "none" })

// Provide shared position defaults so x/y can be omitted per item:
wordCloud.add(
  [{ word: "A" }, { word: "B", y: 240 }],
  { x: 120, y: 200 }
)
```

Adding a word also fires `word-add` with the created `WordHandle`.

Supported options:

- `word`: displayed text.
- `x`: initial horizontal position in pixels.
- `y`: initial vertical position in pixels.
- `angle` _(optional)_: initial rotation in radians. Defaults to `0`.
- `checked` _(optional)_: initial checked state. Defaults to `false`.
- `velocity` _(optional)_: initial physics velocity `{ x, y }`.
- `entryAnimation` _(optional)_: entry animation to run when the word is created. Supported values are `"fade"`, `"chip-fade"`, and `"none"`. Defaults to `"fade"`.

The `defaults` parameter (second argument) accepts any add option except `word`.
When provided, individual word options override the defaults.

Typing note: Any required field (except `word`) becomes optional in each word if present in `defaults`. For example, if you provide `defaults.x`, then `x` is optional in each word object.

### `clear()`

Removes all words from the cloud.

```ts
wordCloud.clear({ exitAnimation: "fade" })
```

Supported options:

- `exitAnimation` _(optional)_: exit animation to run when the words are removed. Supported values are `"fade"`, and `"none"`. Defaults to `"none"`.

### `getWords()` → `Iterable<WordHandle>`

Returns live [`WordHandle`](#wordhandle) handles for all words currently in the
cloud. Each property read reflects the real-time state (position, angle,
checked). Useful for persistence:

```ts
const snapshot = Array.from(wordCloud.getWords())
```

## WordHandle

A `WordHandle` is a live handle to a word in the cloud, returned by `add`
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
const entry = wordCloud.add({ word: "Hello", x: 100, y: 100 })

// Read live state:
console.log(entry.x, entry.y, entry.checked)

// Rename the word (fires word-change):
entry.word = "Hello again"

// Toggle checked programmatically (fires word-check):
entry.checked = !entry.checked

// Remove it:
entry.remove()
```

## WordData

Plain serializable object describing a word. Accepted by `add`.
`WordHandle` is structurally compatible with `WordData`, so handles obtained
from `getWords()` can be passed directly to `add()` (as an iterable).

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
const saved = Array.from(wordCloud.getWords(), ({ word, x, y, angle, checked }) => {
  return { word, x, y, angle, checked }
})
localStorage.setItem("words", JSON.stringify(saved))

// Restore (without animation)
const saved = JSON.parse(localStorage.getItem("words") ?? "[]")
wordCloud.clear()
wordCloud.add(saved as WordData[], { entryAnimation: "none" })
```

## Events

`HTMLWordCloudElement` dispatches the following bubbling events:

- **`word-add`** — fired when a word is added to the cloud, including through
  `add()` or the built-in input form.
- **`word-change`** — fired when a word's text changes, including
  programmatic assignment to `handle.word`.
- **`word-check`** — fired when a word's checked state changes (user
  interaction while `wordAction` is `check`, or programmatic assignment to
  `handle.checked`).
- **`word-delete`** — fired just before a word is removed including through
  user interaction or programmatic removal (`clear()` or `handle.remove()`).
- **`word-action-change`** — fired when the element `wordAction` changes.
  Includes `wordAction` and `oldWordAction`.
- **`word-input-toggle`** — fired when the element `wordInput`
  setting changes.
  Includes `wordInput` and `oldWordInput`.
- **`physics-pause`** — fired when the element `physicsPaused`
  setting changes.
  Includes `physicsPaused` and `oldPhysicsPaused`.

The word-specific events carry a `handle` property: a live
[`WordHandle`](#wordhandle) for the affected word. The setting-change events
instead carry their old and new values.

Listen using the string literal or the static `.type` property of the event classes:

```ts
wordCloud.addEventListener("word-add", (event) => {
  console.log(`added word: "${event.handle.word}" at ${event.handle.x}, ${event.handle.y}`)
})

wordCloud.addEventListener("word-change", (event) => {
  console.log(`renamed word: "${event.oldValue}" -> "${event.value}"`)
})

wordCloud.addEventListener("word-check", (event) => {
  console.log(`"${event.handle.word}" checked: ${event.checked}`)
})

wordCloud.addEventListener("word-delete", (event) => {
  console.log(`deleted word: "${event.handle.word}"`)
})

wordCloud.addEventListener("word-action-change", (event) => {
  console.log(`word action: ${event.oldWordAction} -> ${event.wordAction}`)
})

wordCloud.addEventListener("word-input-toggle", (event) => {
  console.log(`word-input: ${event.oldWordInput} -> ${event.wordInput}`)
})

wordCloud.addEventListener("physics-pause", (event) => {
  console.log(`physics-paused: ${event.oldPhysicsPaused} -> ${event.physicsPaused}`)
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
  --word-dragged-text-color: #1d4ed8;
  --word-dragged-shadow-blur: 8px;
  --word-dragged-shadow-color: rgba(0, 0, 0, 0.15);
  --word-dragged-scale-factor: 1.05;
  --word-dragged-scaling-duration: 80ms;
  --input-background-color: #ffffff;
  --input-text-color: #111827;
  --input-border-color: #9ca3af;
  --input-hover-text-color: #111827;
  --input-hover-border-color: #6b7280;
  --input-hover-background-color: #f9fafb;
  --input-hover-shadow-color: transparent;
  --input-focus-text-color: #0f172a;
  --input-focus-border-color: #2563eb;
  --input-focus-background-color: #eff6ff;
  --input-focus-shadow-color: #93c5fd;
  --word-focus-outline-color: #2563eb;
  --fast-animation: 50ms;
  --slow-animation: 150ms;
  --extra-slow-animation: 1s;
  --word-chip-fade-duration: 1s;
  --word-fade-in-duration: 0.5s;
  --word-fade-out-duration: 0.5s;
  --word-state-transition-duration: 150ms;
  --input-state-transition-duration: 150ms;
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
| `--fast-animation`                     | `50ms`                            | Shared fast timing token used by default animation durations.    |
| `--slow-animation`                     | `150ms`                           | Shared medium timing token used by default animation durations.  |
| `--extra-slow-animation`               | `1s`                              | Shared long timing token used by the chip fade animation.        |
| `--line-width`                         | `2px`                             | Border width and strike line thickness.                          |
| `--font-size`                          | `1.5rem`                          | Input and word font size.                                        |
| `--font-family`                        | `Arial`                           | Input and word font family.                                      |
| `--input-text-color`                   | `black`                           | Input text color.                                                |
| `--input-background-color`             | `hwb(0 93% 7%)`                   | Input background while the built-in input is enabled.            |
| `--input-border-color`                 | `hwb(0 27% 73%)`                  | Input border color.                                              |
| `--input-hover-text-color`             | `var(--input-text-color)`         | Input text color while hovered.                                  |
| `--input-hover-border-color`           | `hwb(0 20% 66%)`                  | Input border color while hovered.                                |
| `--input-hover-background-color`       | `hwb(0 96% 4%)`                   | Input background while hovered.                                  |
| `--input-hover-shadow-color`           | `transparent`                     | Input hover drop-shadow color.                                   |
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
| `--word-checked-text-color`            | `hwb(276 54% 31%)`                | Checked word text color.                                         |
| `--word-checked-background-color`      | `hwb(276 98% 0%)`                 | Checked word background and border color.                        |
| `--word-checked-hover-text-color`      | `hwb(276 21% 21%)`                | Word text color while hovered in check mode.                     |
| `--word-dragged-background-color`      | `hwb(212 90% 0%)`                 | Dragged word background.                                         |
| `--word-dragged-border-color`          | `hwb(212 76% 0%)`                 | Dragged word border.                                             |
| `--word-dragged-text-color`            | `hwb(211 5% 70%)`                 | Dragged word text color.                                         |
| `--word-dragged-shadow-blur`           | `5px`                             | Blur radius of the drop-shadow on a dragged word.                |
| `--word-dragged-shadow-color`          | `hwb(0 0% 100% / 0.05)`           | Drop-shadow color on a dragged word.                             |
| `--word-dragged-scale-factor`          | `1.1`                             | Scale applied to a word while it is being dragged.               |
| `--word-dragged-scaling-duration`      | `var(--fast-animation)`           | Transition duration for the drag scale-up / scale-down effect.   |
| `--word-chip-fade-duration`            | `var(--extra-slow-animation)`     | Chip color fade duration for words created with `"chip-fade"`.   |
| `--word-fade-in-duration`              | `var(--slow-animation)`           | Opacity fade-in duration for newly created words.                |
| `--word-fade-out-duration`             | `var(--slow-animation)`           | Opacity fade-out duration for deleted words.                     |
| `--word-state-transition-duration`     | `var(--slow-animation)`           | Checked and hover state transition duration for words.           |
| `--input-state-transition-duration`    | `var(--slow-animation)`           | Hover and focus transition duration for the built-in input.      |

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
