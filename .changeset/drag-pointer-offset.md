---
"@quentinroy/word-cloud": patch
---

Improve the sub-pixel precision of word dragging.

Word bodies are now sized from the element's unrounded computed size instead of
integer-rounded `offsetWidth`/`offsetHeight`, so the physics body matches the
rendered chip rather than drifting up to ~0.5px off it. Alongside this, the mouse
scale is derived from the container's unrounded computed size (so a fractional
container width no longer biases the pointer mapping, and CSS `transform: scale()`
is tracked more accurately), and the mouse is anchored to the container rather
than the host so a border or padding on the host no longer shifts drag
hit-testing.

Note: this does not resolve the cursor-vs-drag offset reported in #39, whose root
cause is still unknown.
