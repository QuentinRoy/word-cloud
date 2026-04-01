# @quentinroy/word-cloud

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
