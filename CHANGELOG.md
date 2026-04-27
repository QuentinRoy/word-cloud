# @quentinroy/word-cloud

## 0.12.0

### Minor Changes

- 3fe5865: Remove `setWords`. To restore a snapshot, call `clear()` followed by `add()` (`add()` now supports both single word options and iterables).
- 3fe5865: Rename `addWord` to `add`. The method now also accepts an iterable of word options and returns an array of `WordHandle`s in that case.
- 3fe5865: Add `default` parameter to add that may be used to define default properties to words being added.

## 0.11.0

### Minor Changes

- a333459: Rename the has-input/hasInput API to word-input/wordInput, and rename event classes:
  WordCheckedChangeEvent -> WordCheckEvent,
  WordValueChangeEvent -> WordChangeEvent,
  WordCloudWordActionChangeEvent -> WordActionChangeEvent,
  WordCloudWordInputChangeEvent -> WordInputToggleEvent,
  WordCloudPhysicsPausedChangeEvent -> PhysicsPauseEvent.

  Update event type strings accordingly:
  word-checked-change -> word-check,
  word-value-change -> word-change,
  word-input-change -> word-input-toggle,
  physics-paused-change -> physics-pause.

- a333459: Add the physics-paused attribute and physicsPaused property to pause the word-cloud physics engine, and add a physics-pause event for pause-state transitions.

### Patch Changes

- 305159f: Fix a bug in Chrome that caused the viewport to extend when words are rotated.

## 0.10.2

### Patch Changes

- 0db2e2e: Improve sourcemaps of html templates and css stylesheets.
- 0db2e2e: Improve css stylesheet minification.

## 0.10.1

### Patch Changes

- 2f9643d: Change caret color

## 0.10.0

### Minor Changes

- 95474f2: Add the `showFramerate` attribute-property to display the rendering framerate and enable it in the demo.

### Patch Changes

- 8d012f8: Fix weird behavior of angular restoration. It should feel much more natural now.
- 48f26c0: Rework physics of body repulsions for better realism.

## 0.9.1

### Patch Changes

- 2329fdf: Remove wrongly built and distributed CSS file from dist files.

## 0.9.0

### Minor Changes

- 06168b7: Animate input entry and exit

## 0.8.0

### Minor Changes

- 17b66b1: Fix focused word outline going underneath other words when the focused word is not the topmost one. The focused word will now be rendered above all other words, except for dragged words.

### Patch Changes

- f36e2b6: Update focused word style

## 0.7.1

### Patch Changes

- 496a6e5: Fix `HTMLWordCloudElement:clear()` regression.
- 23359c6: Improve strikethrough with a better animation and fix for occasional visual bugs on chrome.

## 0.7.0

### Minor Changes

- 469da68: Disable word entry animation by default with `HTMLWordCloudElement:addWord`.
- 9fe8c23: Add word enter and exit animations
- de9c3d4: Add animated state transitions to words and input.
- 1b50f87: Split mode attribute into two new attributes: has-input (boolean) and word-action ("none", "drag", "check"). This allows for more flexible combinations of input and word interaction modes. The old "mode" attribute is no longer supported and should be replaced with the new attributes in any code that references it.
- 7b42c96: Disable a word's collision while it's being dragged.
- 582be95: Add a small repulsion force between words, walls, and input.

### Patch Changes

- e8fe42b: CSS and HTML minification in dist files.

## 0.6.0

### Minor Changes

- 4e72aa4: Add new CSS vars to control word and input padding.
- e3f8d26: Add new events to notify when a word's value change, and when a word is added.
- 3119fb7: Rename word-cloud event payload property `entry` to `handle`.

  This affects `WordAddEvent`, `WordValueChangeEvent`, `WordCheckedChangeEvent`,
  and `WordDeleteEvent`.

- 2501b0d: Rename `WordEntry` to `WordHandle`. Any code that imports or references
  `WordEntry` by name must be updated to `WordHandle`.
- e3f8d26: Let a word value to be changed by updating the word entry.

### Patch Changes

- be3d91b: Remove forgotten debug log statement, logging inertia values when locking dragged entries.
- 0884eb4: Normalize CSS colors
- 9defb3b: Fix physics when a word's size changes (e.g. because CSS vars have been updated).

## 0.5.1

### Patch Changes

- 5083ac8: Fix unfocusable words in check and delete mode.

## 0.5.0

### Minor Changes

- c2655cd: Stop exporting WORD_CLOUD_MODES.

## 0.4.3

### Patch Changes

- 8952d9d: Remove @changesets/cli from dependencies.

## 0.4.2

### Patch Changes

- 570b042: Attempt at fixing automatic release.

## 0.4.1

### Patch Changes

- e909f67: Dummy changeset to test CI

## 0.4.0

### Minor Changes

- 35fb8db: Lock word rotation while dragging.
- 0ac80f9: Make angular restoration torque proportional to word width so larger words receive stronger restoring torque.

## 0.3.0

### Minor Changes

- 06c63d7: Add word-cloud mode change event.

## 0.2.0

### Minor Changes

- 9887dc2: Update word rotation behavior. Words now return to a horizontal orientation via the shortest rotation path.
