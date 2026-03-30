# word-cloud

Interactive word cloud custom element powered by Matter.js. Check out the [demo](https://quentinroy.github.io/word-cloud/)!

## Library

This package exports the `HTMLWordCloudElement` class and event classes. It does not auto-register a custom element tag for you.

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

The package also exports `WordCheckedChangeEvent` and `WordDeleteEvent`.

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

### `addWord(options)`

Adds a single word to the cloud and returns its generated id.

```ts
const id = wordCloud.addWord({
  word: "Custom Element",
  x: 200,
  y: 150,
  angle: 0,
  checked: false,
  velocity: { x: 10, y: -15 },
  animateEntry: true,
})
```

Supported fields:

- `word`: displayed text.
- `x`: initial horizontal position in pixels.
- `y`: initial vertical position in pixels.
- `angle`: optional initial rotation in radians.
- `checked`: optional initial checked state.
- `velocity`: optional initial physics velocity.
- `animateEntry`: optional entry animation toggle.

### `removeWord(id)`

Removes a word by id and returns `true` when it existed.

```ts
wordCloud.removeWord(id)
```

### `clear()`

Removes all words from the cloud.

```ts
wordCloud.clear()
```

### `getWords()`

Returns an iterable snapshot of the current words, including their current position, angle, and checked state.

```ts
const words = Array.from(wordCloud.getWords())
```

This is useful for persistence.

### `setWords(words)`

Replaces the current contents with a new set of words.

```ts
wordCloud.setWords([
  { word: "Saved", x: 120, y: 100, angle: 0, checked: false },
  { word: "State", x: 280, y: 220, angle: 0.2, checked: true },
])
```

## Persisting state

The simplest persistence flow is:

1. Read the current state with `Array.from(wordCloud.getWords())`.
2. Store it in local storage, IndexedDB, or your backend.
3. Restore it later with `wordCloud.setWords(savedWords)`.

## Events

Word items dispatch bubbling `Event` subclasses from the component tree:

- `word-checked-change`: fired when a word changes checked state.
- `word-delete`: fired when a word delete action is triggered.

You can listen using either `"word-checked-change"` / `"word-delete"`, or `WordCheckedChangeEvent.type` / `WordDeleteEvent.type`.

Example with `instanceof`:

```ts
wordCloud.addEventListener("word-checked-change", (event) => {
  console.log("checked:", event.checked)
})

wordCloud.addEventListener("word-delete", (event) => {
  console.log("word deleted:", event.word)
})
```

`word-delete` is also used internally by the cloud to remove words in delete mode.

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
