---
"@quentinroy/word-cloud": patch
---

Fix a small offset between a word's grab cursor and where dragging actually
initiates (#39).

The physics body was sized from the word element's integer-rounded
`offsetWidth`/`offsetHeight`, while the chip renders at its true fractional size,
so the body ended up to ~0.5px narrower or wider than the visible word and its
center drifted off the chip. Word bodies are now sized from the element's
unrounded computed size, keeping the draggable area aligned with what the user
sees.

Two related pointer-precision issues are fixed alongside it: the mouse scale is
derived from the container's unrounded computed size (so a fractional container
width no longer biases the pointer mapping, and CSS `transform: scale()` is
tracked more accurately), and the mouse is anchored to the container rather than
the host so a border or padding on the host no longer shifts drag hit-testing.
