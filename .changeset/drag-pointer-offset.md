---
"@quentinroy/word-cloud": patch
---

Fix a small pointer offset that misaligned dragging from the grab cursor (#39).

The mouse scale is now derived from the container's unrounded computed layout
size instead of its integer-rounded `offsetWidth`/`offsetHeight`. With a
fractional container width (common in responsive layouts) the rounded value
produced a scale slightly off from 1 even without any CSS transform, biasing the
pointer mapping proportionally to the distance from the container's top-left
corner. This also makes dragging more accurate when the cloud is rendered under a
CSS `transform: scale()`.

The mouse is also now anchored to the container rather than the host, so a border
or padding on the host element no longer shifts the drag hit-testing away from the
word.
